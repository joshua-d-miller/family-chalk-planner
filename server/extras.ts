// The top of the Notes column: weather (Open-Meteo, no account needed) and trash / recycling day,
// plus which page shows at the bottom of the column. Trash day and the Notes choice are set in ⚙️.
//   kv 'trash'  { day: 0-6 | null, recycle: { mode: 'same' | 'day' | 'biweekly' | 'off', day, anchor } }
//               'biweekly' = every other week on recycle.day, counting from anchor (a known pickup date)
//   kv 'notes'  { bottom: 'jars' | 'upnext' | 'today' | 'photos' | 'none', pages: up to 3 of RIGHT_PAGES }
import type { Express } from 'express';
import { addDays, isDate } from './dates.ts';

type WeatherKind = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';
type RecycleMode = 'same' | 'day' | 'biweekly' | 'off';
interface TrashCfg {
  day: number | null;
  recycle: { mode: RecycleMode; day?: number; anchor?: string };
}
const NOTES_BOTTOM = ['jars', 'upnext', 'today', 'photos', 'none'];
export const RIGHT_PAGES = [
  'info',
  'reminders',
  'meals',
  'jars',
  'chores',
  'upnext',
  'today',
  'photos',
  'timers',
  'pantry'
];
interface NotesCfg {
  bottom: string;
  pages: string[];
}
export function rightPages(list: unknown, bottom: string): string[] {
  if (Array.isArray(list)) {
    const out: string[] = [];
    for (const p of list) if (RIGHT_PAGES.includes(p) && !out.includes(p) && out.length < 3) out.push(p);
    return out;
  }
  return bottom === 'none' ? ['info', 'meals'] : ['info', 'meals', bottom];
}
// The parts of Open-Meteo's forecast the board uses
interface Forecast {
  current: { temperature_2m: number; weather_code: number };
  daily: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
  };
}
const DOW = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat'];

function weatherKind(code: number): WeatherKind {
  if (code === 0) return 'sun';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'cloud';
}

// Day numbers, so "every other week" works across months and years
const dayNum = (ds: string) => Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10)) / 864e5;
const weekday = (ds: string) => new Date(dayNum(ds) * 864e5).getUTCDay();

// What goes out on this date
function binsOn(cfg: TrashCfg, ds: string): ('trash' | 'recycle')[] {
  const dow = weekday(ds);
  const r = cfg.recycle || { mode: 'same' };
  const out: ('trash' | 'recycle')[] = [];
  if (cfg.day === dow) out.push('trash');
  const everyOther =
    r.mode === 'biweekly' && r.day === dow && r.anchor && ((((dayNum(ds) - dayNum(r.anchor)) / 7) % 2) + 2) % 2 === 0;
  if ((r.mode === 'same' && cfg.day === dow) || (r.mode === 'day' && r.day === dow) || everyOther) out.push('recycle');
  return out;
}

export interface ExtrasDeps {
  app: Express;
  kvGet: (key: string) => unknown;
  kvSet: (key: string, value: unknown) => void;
  broadcast: (event: string, data: unknown) => void;
  today: () => string;
  weather: { lat: number | null; lon: number | null; unit: 'fahrenheit' | 'celsius'; timeZone: string; base: string };
  trashDay: number | null; // the starting value, until it's set in ⚙️
}

export function setup({ app, kvGet, kvSet, broadcast, today, weather: w, trashDay }: ExtrasDeps) {
  let weatherCache: unknown = null;
  let weatherAt = 0;
  async function weather() {
    if (w.lat === null || w.lon === null) return null;
    if (weatherCache && Date.now() - weatherAt < 10 * 60 * 1000) return weatherCache; // fresh enough to catch rain starting
    const url =
      `${w.base}/v1/forecast?latitude=${w.lat}&longitude=${w.lon}` +
      '&current=temperature_2m,weather_code' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      `&temperature_unit=${w.unit}&timezone=${encodeURIComponent(w.timeZone)}&forecast_days=2`;
    const j = (await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json()) as Forecast;
    const d = j.daily;
    weatherCache = {
      now: { temp: Math.round(j.current.temperature_2m), kind: weatherKind(j.current.weather_code) },
      today: {
        hi: Math.round(d.temperature_2m_max[0]),
        lo: Math.round(d.temperature_2m_min[0]),
        rain: d.precipitation_probability_max[0]
      },
      tomorrow: {
        hi: Math.round(d.temperature_2m_max[1]),
        lo: Math.round(d.temperature_2m_min[1]),
        rain: d.precipitation_probability_max[1],
        kind: weatherKind(d.weather_code[1])
      }
    };
    weatherAt = Date.now();
    return weatherCache;
  }

  const trashCfg = () => (kvGet('trash') as TrashCfg | null) || { day: trashDay, recycle: { mode: 'same' } };
  // The right-hand column: up to 3 mini pages (from Colby Way's board). Boards from before keep what they
  // showed: the weather and trash, the meals, then the bottom they had picked.
  function notesCfg(): NotesCfg {
    const raw = (kvGet('notes') as Partial<NotesCfg> | null) || {};
    const bottom = NOTES_BOTTOM.includes(raw.bottom as string) ? (raw.bottom as string) : 'jars';
    return { bottom, pages: rightPages(raw.pages, bottom) };
  }
  function saveNotes(body: Record<string, unknown>) {
    const cur = notesCfg();
    const bottom = NOTES_BOTTOM.includes(body.bottom as string) ? (body.bottom as string) : cur.bottom;
    // sending only a bottom (the current board) changes the last page; sending pages sets them all
    const pages = Array.isArray(body.pages) ? rightPages(body.pages, bottom) : rightPages(null, bottom);
    const cfg = { bottom, pages };
    kvSet('notes', cfg);
    broadcast('extras', {});
    return cfg;
  }

  function cleanTrash(b: Record<string, unknown>): TrashCfg {
    const day = (v: unknown) =>
      v !== '' && v !== null && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 6 ? Number(v) : null;
    const r = (b.recycle || {}) as Record<string, unknown>;
    const mode = (['same', 'day', 'biweekly', 'off'].includes(r.mode as string) ? r.mode : 'same') as RecycleMode;
    const out: TrashCfg = { day: day(b.day), recycle: { mode } };
    if (mode === 'day' || mode === 'biweekly') out.recycle.day = day(r.day) ?? out.day ?? 0;
    if (mode === 'biweekly') out.recycle.anchor = isDate(r.anchor) ? r.anchor : today();
    return out;
  }

  // The next pickup, as the Notes column says it
  function trash() {
    const cfg = trashCfg();
    const r = cfg.recycle || { mode: 'same' };
    if (cfg.day === null && (r.mode === 'same' || r.mode === 'off')) return null;
    const from = today();
    const next = (kind: 'trash' | 'recycle') => {
      for (let i = 0; i < 21; i++) {
        const ds = addDays(from, i);
        if (binsOn(cfg, ds).includes(kind)) return { i, ds };
      }
      return null;
    };
    const when = (n: { i: number; ds: string }) =>
      n.i === 0 ? 'today' : n.i === 1 ? 'tomorrow' : `${DOW[weekday(n.ds)]} · in ${n.i} days`;
    const label = (n: { i: number; ds: string }, bins: string) =>
      n.i === 0 ? 'Pickup today' : n.i === 1 ? `Tomorrow - ${bins} out tonight` : when(n);
    const t = cfg.day === null ? null : next('trash');
    const rc = r.mode === 'off' ? null : next('recycle');
    if (t && (r.mode === 'same' || (rc && rc.ds === t.ds)))
      // both go out together next time
      return {
        title: r.mode === 'off' ? 'Trash' : 'Trash & recycling',
        days: t.i,
        label: label(t, 'cans'),
        sub: null,
        cfg
      };
    if (t && !rc) return { title: 'Trash', days: t.i, label: label(t, 'cans'), sub: null, cfg };
    if (!t && rc) return { title: 'Recycling', days: rc.i, label: label(rc, 'bin'), sub: null, cfg };
    if (!t || !rc) return null;
    // different days: trash big, recycling below
    return { title: 'Trash', days: t.i, label: label(t, 'cans'), sub: `♻️ Recycling ${when(rc)}`, cfg };
  }

  app.get('/api/extras', async (_req, res) => {
    let wx = null;
    try {
      wx = await weather();
    } catch {
      /* the board still works without weather */
    }
    const cfg = trashCfg();
    res.json({ weather: wx, trash: trash(), trashDay: cfg.day, bins: cfg, notes: notesCfg() });
  });
  app.post('/api/trash', (req, res) => {
    const cfg = cleanTrash(req.body || {});
    kvSet('trash', cfg);
    broadcast('extras', {});
    res.json(trash() || { cfg });
  });
  app.post('/api/notes', (req, res) => res.json(saveNotes(req.body || {})));
  app.post('/api/right-pages', (req, res) => res.json(saveNotes(req.body || {})));
}
