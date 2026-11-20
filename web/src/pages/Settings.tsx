/*
===============================================================================
 Family Chalk Planner | Screens | Pages | Settings.tsx
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-17

 Purpose:
     ⚙️ Settings on the board (signed-in people). Admins also get the
     calendar (Google sign-in and which calendars) and trash day; the rest
     of the board's settings are in the admin console. Everyone signed in:
     holidays, the photos and the overnight slideshow, the right-hand
     column, and this screen.

 Used by:
     web/src/App.tsx
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    Settings (new screen), and an emoji font
                        colby     Chrome-based tablets can show.
                        claude
                                  The new screens take over: /, /edit and
                                  /chores are the React board; the old one
                                  stays at /classic.

 0.16.0    2026-11-11   joshua    Birthdays: a cake, and counting down to every
                        claude    one.

 0.17.1    2026-11-16   colby     Back button in the upper left to return to
                                  the calendar. Hide the zoom buttons in This
                                  screen.
 1.1.0    2026-11-17   joshua    This screen: 🎨 Look of cards and menus.
                        claude
                                  This screen: sleeps or days; Photos: the
                                  next countdown on the slideshow.
                                  What Apple or Google say about the calendar.
===============================================================================
*/

import { useState } from 'react';
import { post } from '../lib/api.ts';
import { useLive } from '../lib/live.ts';
import { navigate } from '../lib/nav.ts';
import { homeHref } from '../routes.ts';
import { setSpeaksHere, speaksHere } from '../lib/timers.ts';
import { hideZoomHere, setHideZoomHere } from '../lib/zoomControls.ts';
import { rollingWeekHere, setRollingWeekHere } from '../lib/weekStyle.ts';
import { DAY_NAMES } from '../lib/today.ts';
import type { Who } from '../lib/who.ts';
import { Btn, Field, Pick } from '../ui/bits.tsx';
import { openLookCard } from '../ui/LookCard.tsx';
import { setSleeps, useSleeps } from '../lib/countdowns.ts';
import { Page } from '../ui/Page.tsx';
import './settings.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | The settings page | //
// --------------------- //
// A card for each part; the ones this screen may not change are left out.   //
export function Settings({ who }: { who: Who | null }) {
  const admin = who?.user?.role === 'admin' && who.admin;
  const adminPerson = who?.user?.role === 'admin';
  return (
    <Page
      id="settings"
      title="Settings"
      who={who}
      onBack={() => {
        if (history.length > 1) history.back();
        else navigate(homeHref(who));
      }}
    >
      {adminPerson && !admin && (
        <p className="dim">
          The calendar and trash day need the admin console’s sign-in: <a href="admin">sign in there</a>, then come
          back.
        </p>
      )}
      {admin && <Calendar />}
      <Holidays />
      <Birthdays />
      <Photos />
      {admin && <Trash />}
      <RightColumn />
      <Frame />
      <ThisScreen />
      <p className="dim small about">
        Family Chalk Planner {document.querySelector<HTMLMetaElement>('meta[name=app-version]')?.content} · free
        software under the AGPL-3.0 · <a href="https://github.com/joshua-d-miller/family-chalk-planner">source code</a>
      </p>
    </Page>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | A card, and saving | //
// ---------------------- //
function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="section scard" id={id}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
const useSaved = () => {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const run = async <T,>(p: Promise<T>, ok = 'Saved ✓') => {
    setErr('');
    setMsg('');
    try {
      const r = await p;
      setMsg(ok);
      setTimeout(() => setMsg(''), 2500);
      return r;
    } catch (e) {
      setErr((e as Error).message);
      return null;
    }
  };
  const line = (
    <div className="saved">
      <span className="ok">{msg}</span>
      <span className="err">{err}</span>
    </div>
  );
  return { run, line };
};

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | The calendar | //
// ---------------- //
// Google sign-in and which calendars (several, from Colby Way's board).     //
interface GCal {
  id: string;
  name: string;
  color: string | null;
  readOnly: boolean;
  primary?: boolean;
}
interface Status {
  provider: 'google' | 'caldav';
  configured: boolean;
  connected?: boolean;
  calendar: string | null;
  calendarId?: string | null;
  calendars?: GCal[];
  problem?: string | null;
  problems?: Record<string, string>;
  outage?: string | null; // Apple's or Google's status page
  paste?: boolean;
}
function Calendar() {
  const st = useLive<Status>('api/calendar/status', ['calendar']);
  const s = st.data;
  const [paste, setPaste] = useState('');
  const [list, setList] = useState<GCal[] | null>(null);
  const [picked, setPicked] = useState<Map<string, GCal>>(new Map());
  const [main, setMain] = useState<string>('');
  const sv = useSaved();
  if (!s) return null;
  if (s.provider !== 'google')
    return (
      <Card title="Calendar">
        <p>
          {s.configured ? `Showing “${s.calendar}”.` : 'No calendar yet.'} Change it in the{' '}
          <a href="admin">admin console</a> (⚙️ Board → Calendar).
        </p>
        {Object.entries(s.problems || {}).map(([k, v]) => (
          <p className="err" key={k}>
            {k}: {v}
          </p>
        ))}
        {s.outage && <p className="err">{s.outage}. It isn’t something you can fix: it comes back by itself.</p>}
      </Card>
    );
  const start = async () => {
    const r = await sv.run(post<{ url: string }>('api/google/start'), '');
    if (r) window.open(r.url, '_blank', 'noopener');
  };
  const listCalendars = async () => {
    const r = await sv.run(post<GCal[]>('api/google/calendars'), '');
    if (!r) return;
    setList(r);
    const shown = new Map((s.calendars || []).map(c => [c.id, c]));
    setPicked(new Map(r.filter(c => shown.has(c.id)).map(c => [c.id, { ...c, color: shown.get(c.id)!.color }])));
    setMain(s.calendarId || '');
  };
  const savePicked = async () => {
    const cals = [...picked.values()];
    if (!cals.length) return;
    await sv.run(post('api/google/calendar', { calendars: cals, calendarId: main || cals.find(c => !c.readOnly)?.id }));
    setList(null);
    st.reload();
  };
  return (
    <Card title="Calendar">
      {!s.configured && (
        <p>Google isn’t set up on the server yet: admin console → ⚙️ Board → Calendar (client ID and secret).</p>
      )}
      {s.configured && !s.connected && (
        <ol className="steps">
          <li>
            <Btn onClick={start}>Sign in with Google</Btn> Choose the account with the family calendar and allow access.
          </li>
          {s.paste && (
            <li>
              Google then opens a page that <b>won’t load</b>. That’s expected: copy the whole address from its address
              bar and paste it here.
              <div className="row">
                <Field
                  label="The address"
                  value={paste}
                  onChange={e => setPaste(e.target.value)}
                  placeholder="http://localhost/?state=…"
                />
                <Btn
                  className="fixed"
                  kind="go"
                  onClick={() =>
                    sv.run(post('api/google/finish', { pasted: paste }), 'Connected ✓').then(() => st.reload())
                  }
                >
                  Connect
                </Btn>
              </div>
            </li>
          )}
          {s.problem && <li className="err">{s.problem}</li>}
          {s.outage && <li className="err">{s.outage}. It isn’t something you can fix: it comes back by itself.</li>}
        </ol>
      )}
      {s.connected && !list && (
        <>
          <ul className="cals">
            {(s.calendars || []).map(c => (
              <li key={c.id}>
                <span
                  className="dot"
                  style={{ background: c.id === s.calendarId ? 'var(--chalk)' : c.color || 'var(--chalk)' }}
                />
                {c.name}
                {c.id === s.calendarId && <small> · new events go here</small>}
                {c.readOnly && <small> · read-only</small>}
                {s.problems?.[c.name] && <small className="err"> · {s.problems[c.name]}</small>}
              </li>
            ))}
            {!s.calendars?.length && <li className="dim">No calendar picked yet.</li>}
          </ul>
          <div className="segs">
            <Btn onClick={listCalendars}>Choose calendars</Btn>
            <Btn
              kind="warn"
              onClick={() =>
                confirm('Disconnect Google? The board stops showing its events until it’s connected again.') &&
                sv.run(post('api/google/disconnect')).then(() => st.reload())
              }
            >
              Disconnect Google
            </Btn>
          </div>
        </>
      )}
      {list && (
        <>
          <p className="dim small">
            Tick the calendars to show (up to 12). Read-only ones (school, holidays) show, but can’t be changed here.
          </p>
          <ul className="cals pick">
            {list.map(c => {
              const on = picked.has(c.id);
              return (
                <li key={c.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const m = new Map(picked);
                        if (on) m.delete(c.id);
                        else m.set(c.id, c);
                        setPicked(m);
                      }}
                    />
                    <span className="t">
                      {c.name}
                      {c.readOnly && <span className="meta">read-only</span>}
                    </span>
                  </label>
                  {on && (
                    <input
                      type="color"
                      aria-label={`Color for ${c.name}`}
                      value={picked.get(c.id)!.color || '#9cc9e6'}
                      onChange={e =>
                        setPicked(new Map(picked).set(c.id, { ...picked.get(c.id)!, color: e.target.value }))
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {[...picked.values()].filter(c => !c.readOnly).length > 1 && (
            <Pick label="New events go in" value={main} onChange={e => setMain(e.target.value)}>
              {[...picked.values()]
                .filter(c => !c.readOnly)
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Pick>
          )}
          <div className="segs">
            <Btn onClick={() => setList(null)}>Cancel</Btn>
            <Btn kind="go" disabled={!picked.size} onClick={savePicked}>
              Show these
            </Btn>
          </div>
        </>
      )}
      {sv.line}
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | Holidays | //
// ------------ //
// Any can be hidden.                                                        //
function Holidays() {
  const h = useLive<{ country: string; holidays: { title: string; icon: string; date: string; off: boolean }[] }>(
    'api/holidays',
    ['calendar']
  );
  const sv = useSaved();
  if (!h.data || h.data.country === 'none') return null;
  const toggle = (title: string) => {
    const off = h.data!.holidays.filter(x => (x.title === title ? !x.off : x.off)).map(x => x.title);
    h.set({ ...h.data!, holidays: h.data!.holidays.map(x => (x.title === title ? { ...x, off: !x.off } : x)) });
    sv.run(post('api/holidays', { off }));
  };
  return (
    <Card title="Holidays" id="holidays">
      <p className="dim small">Tap one to hide it from the board, or to bring it back.</p>
      <div className="segs hols">
        {h.data.holidays.map(x => (
          <button
            key={x.title}
            type="button"
            className={'seg' + (x.off ? '' : ' on')}
            aria-pressed={!x.off}
            onClick={() => toggle(x.title)}
          >
            <span className="emoji">{x.icon}</span> {x.title}
          </button>
        ))}
      </div>
      {sv.line}
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------- //
// | Birthdays | //
// ------------- //
// A cake on birthdays, and counting down to every one without starring it  //
function Birthdays() {
  const b = useLive<{ cake: boolean; countdown: boolean }>('api/birthdays', ['calendar']);
  const sv = useSaved();
  if (!b.data) return null;
  const set = (patch: Partial<{ cake: boolean; countdown: boolean }>) => {
    b.set({ ...b.data!, ...patch });
    sv.run(post('api/birthdays', patch));
  };
  return (
    <Card title="Birthdays" id="birthdays">
      <label className="check">
        <input type="checkbox" checked={b.data.cake} onChange={e => set({ cake: e.target.checked })} />
        <span className="t">Put a 🎂 on birthdays (events with “birthday” or “bday” in their name)</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={b.data.countdown} onChange={e => set({ countdown: e.target.checked })} />
        <span className="t">
          Count down to every birthday in Notes (otherwise only the ones starred ⭐ for a countdown)
        </span>
      </label>
      {sv.line}
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------- //
// | Photos | //
// ---------- //
// Beside the month name, and the overnight slideshow.                       //
interface PhotoCfg {
  frame: boolean;
  night: boolean;
  from: string;
  to: string;
  every: number;
  dim: number;
  showEvents: boolean;
  showTemp: boolean;
  showReminders: boolean;
  sidePanel: boolean;
  showCountdown: boolean;
}
function Photos() {
  const p = useLive<{ enabled: boolean; kind: string; cfg: PhotoCfg; photos: unknown[]; error: string | null }>(
    'api/photos',
    ['photos']
  );
  const sv = useSaved();
  if (!p.data) return null;
  const c = p.data.cfg;
  const set = (patch: Partial<PhotoCfg>) => {
    p.set({ ...p.data!, cfg: { ...c, ...patch } });
    sv.run(post('api/photos/settings', patch));
  };
  const box = (k: keyof PhotoCfg, label: string) => (
    <label className="check">
      <input
        type="checkbox"
        checked={k === 'showCountdown' ? c[k] !== false : !!c[k]}
        onChange={e => set({ [k]: e.target.checked })}
      />
      <span className="t">{label}</span>
    </label>
  );
  return (
    <Card title="Photos and the slideshow">
      <p className="dim small">
        {p.data.enabled
          ? `${p.data.photos.length} photos from ${p.data.kind === 'immich' || p.data.kind === 'immich-share' ? 'Immich' : p.data.kind === 'google' ? 'Google Photos' : 'iCloud'}.`
          : 'No photo album yet: the admin console sets it up (⚙️ Board → Photos).'}
        {p.data.error && <span className="err"> {p.data.error}</span>}
      </p>
      {box('night', 'Show photos overnight on the wall (a slideshow)')}
      {c.night && (
        <div className="row">
          <Field label="From" type="time" value={c.from} onChange={e => set({ from: e.target.value })} />
          <Field label="Until" type="time" value={c.to} onChange={e => set({ to: e.target.value })} />
          <Pick label="Next photo every" value={c.every} onChange={e => set({ every: +e.target.value })}>
            {[10, 20, 30, 60].map(n => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </Pick>
          <Pick label="Brightness" value={c.dim} onChange={e => set({ dim: +e.target.value })}>
            {[30, 50, 70, 100].map(n => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </Pick>
        </div>
      )}
      {c.night && (
        <>
          {box('showEvents', 'With today’s events')}
          {box('showTemp', 'With the temperature')}
          {box('showReminders', 'With reminders')}
          {box('showCountdown', 'With the next countdown, from 30 days out')}
          {box('sidePanel', 'Photos beside the board instead of over it')}
        </>
      )}
      {sv.line}
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | Trash and recycling | //
// ----------------------- //
// For admins.                                                               //
function Trash() {
  const x = useLive<{ bins: { day: number | null; recycle: { mode: string; day?: number; anchor?: string } } }>(
    'api/extras',
    ['extras']
  );
  const sv = useSaved();
  if (!x.data) return null;
  const b = x.data.bins;
  const save = (next: typeof b) => {
    x.set({ ...x.data!, bins: next });
    sv.run(post('api/trash', next));
  };
  return (
    <Card title="Trash and recycling">
      <div className="row">
        <Pick
          label="Trash pickup"
          value={b.day ?? ''}
          onChange={e => save({ ...b, day: e.target.value === '' ? null : +e.target.value })}
        >
          <option value="">None</option>
          {DAY_NAMES.map((n, i) => (
            <option key={i} value={i}>
              {n}
            </option>
          ))}
        </Pick>
        <Pick
          label="Recycling"
          value={b.recycle.mode}
          onChange={e => save({ ...b, recycle: { ...b.recycle, mode: e.target.value } })}
        >
          <option value="same">Same day as trash</option>
          <option value="biweekly">Every other week</option>
          <option value="day">A different day each week</option>
          <option value="off">Don’t show</option>
        </Pick>
        {(b.recycle.mode === 'day' || b.recycle.mode === 'biweekly') && (
          <Pick
            label="Recycling day"
            value={b.recycle.day ?? 0}
            onChange={e => save({ ...b, recycle: { ...b.recycle, day: +e.target.value } })}
          >
            {DAY_NAMES.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </Pick>
        )}
        {b.recycle.mode === 'biweekly' && (
          <Field
            label="Next recycling pickup"
            type="date"
            value={b.recycle.anchor || ''}
            onChange={e => save({ ...b, recycle: { ...b.recycle, anchor: e.target.value } })}
          />
        )}
      </div>
      {sv.line}
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------- //
// | The right-hand column | //
// ------------------------- //
// Up to 3 pages (from Colby Way's board).                                   //
const RIGHT: [string, string][] = [
  ['info', '🌤️ Weather, trash, countdowns'],
  ['meals', '🍽️ Meal plan'],
  ['jars', '🫙 Reward jars'],
  ['upnext', '📅 Up next'],
  ['today', '☀️ Today'],
  ['reminders', '🔔 Reminders'],
  ['chores', '🧹 Chores'],
  ['timers', '⏲️ Timers'],
  ['pantry', '🥫 Pantry'],
  ['photos', '📷 Photos']
];
function RightColumn() {
  const x = useLive<{ notes: { pages: string[] } }>('api/extras', ['extras']);
  const sv = useSaved();
  if (!x.data) return null;
  const pages = x.data.notes.pages;
  const save = (next: string[]) => {
    x.set({ ...x.data!, notes: { ...x.data!.notes, pages: next } });
    sv.run(post('api/right-pages', { pages: next }));
  };
  return (
    <Card title="The right-hand column">
      <p className="dim small">Up to 3, from the top. Tap to add or take away.</p>
      <div className="segs">
        {RIGHT.map(([id, label]) => {
          const at = pages.indexOf(id);
          return (
            <button
              key={id}
              type="button"
              className={'seg' + (at >= 0 ? ' on' : '')}
              aria-pressed={at >= 0}
              disabled={at < 0 && pages.length >= 3}
              onClick={() => save(at >= 0 ? pages.filter(p => p !== id) : [...pages, id])}
            >
              {at >= 0 && <b>{at + 1}. </b>}
              {label}
            </button>
          );
        })}
      </div>
      {sv.line}
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------- //
// | The frame on the board | //
// -------------------------- //
// The lighter brown wooden frame around the calendar: on, or off for every //
// screen.                                                                   //
function Frame() {
  const ym = new Date().toISOString().slice(0, 7);
  const m = useLive<{ boardPad?: number }>(`api/meta?ym=${ym}`, ['meta']);
  const sv = useSaved();
  if (!m.data) return null;
  const off = m.data.boardPad === 0;
  const set = (hide: boolean) => {
    m.set({ ...m.data!, boardPad: hide ? 0 : undefined });
    sv.run(post('api/frame', { pad: hide ? 0 : null }));
  };
  return (
    <Card title="The frame around the calendar">
      <label className="check">
        <input type="checkbox" checked={off} onChange={e => set(e.target.checked)} />
        <span className="t">Hide the lighter brown wooden frame around the calendar</span>
      </label>
      {sv.line}
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | This screen only | //
// -------------------- //
function ThisScreen() {
  const [speak, setSpeak] = useState(speaksHere());
  const [hideZoom, setHideZoom] = useState(hideZoomHere());
  const [rolling, setRolling] = useState(rollingWeekHere());
  const sleeps = useSleeps();
  return (
    <Card title="This screen">
      <label className="check">
        <input
          type="checkbox"
          checked={speak}
          onChange={e => {
            setSpeaksHere(e.target.checked);
            setSpeak(e.target.checked);
          }}
        />
        <span className="t">Say a timer’s name out loud when it’s done</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={hideZoom}
          onChange={e => {
            setHideZoomHere(e.target.checked);
            setHideZoom(e.target.checked);
          }}
        />
        <span className="t">Hide the − / + / Fit buttons on the calendar</span>
      </label>
      <label className="check">
        <input
          id="rollingWeekBox"
          type="checkbox"
          checked={rolling}
          onChange={e => {
            setRollingWeekHere(e.target.checked);
            setRolling(e.target.checked);
          }}
        />
        <span className="t">Week page: start on today and always show the next 7 days</span>
      </label>
      <label className="check">
        <input id="sleepsBox" type="checkbox" checked={sleeps} onChange={e => void setSleeps(e.target.checked)} />
        <span className="t">Count down in sleeps (“3 sleeps!”) instead of days</span>
      </label>
      <p style={{ marginTop: 12 }}>
        <Btn id="lookOpen" onClick={openLookCard}>
          🎨 Look of cards and menus…
        </Btn>
      </p>
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
