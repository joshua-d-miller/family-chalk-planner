// The right-hand column: up to 3 pages, chosen in ⚙️ Settings (weather, trash and countdowns; the meal
// plan; reward jars; up next; reminders; chores; timers; the pantry)
import type { Jar, Meals, RemindersView } from '../../../shared/lists.ts';
import { useLive } from '../lib/live.ts';
import { fmtLeft, left, useTimers } from '../lib/timers.ts';
import { fmtTime } from '../lib/today.ts';
import { PIECE } from '../pages/Jars.tsx';
import { isDone } from '../pages/Reminders.tsx';

const ICONS: Record<string, string> = {
  sun: '<circle cx="24" cy="24" r="9"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.2 4.2M33.3 33.3l4.2 4.2M10.5 37.5l4.2-4.2M33.3 14.7l4.2-4.2"/>',
  partly:
    '<circle cx="18" cy="18" r="7"/><path d="M18 4v4M4 18h4M8 8l3 3M28 8l-3 3"/><path d="M18 38h17a7 7 0 0 0 0-14 9 9 0 0 0-17 3 5.5 5.5 0 0 0 0 11z"/>',
  cloud: '<path d="M14 34h21a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 0 13z"/>',
  rain: '<path d="M14 28h21a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 0 13z"/><path d="M17 34l-2 5M25 34l-2 5M33 34l-2 5"/>',
  snow: '<path d="M14 28h21a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 0 13z"/><path d="M17 35v4M15 37h4M25 35v4M23 37h4M33 35v4M31 37h4"/>',
  storm: '<path d="M14 28h21a8 8 0 0 0 0-16 11 11 0 0 0-21 3 6.5 6.5 0 0 0 0 13z"/><path d="M25 30l-4 6h6l-4 6"/>',
  fog: '<path d="M8 18h32M6 25h36M10 32h28"/>'
};
const Wx = ({ kind, color }: { kind: string; color: string }) => (
  <svg
    width="34"
    height="34"
    viewBox="0 0 48 48"
    fill="none"
    stroke={color}
    strokeWidth="2.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: ICONS[kind] || ICONS.cloud }}
  />
);

interface Extras {
  weather: {
    now: { temp: number; kind: string };
    today: { hi: number; lo: number };
    tomorrow: { hi: number; lo: number; rain: number; kind: string };
  } | null;
  trash: { title: string; label: string; sub: string | null } | null;
  notes: { pages: string[] };
}

function Info({ x }: { x: Extras }) {
  const cd = useLive<{ icon: string; title: string; days: number }[]>('api/countdowns', ['countdowns', 'calendar']);
  const w = x.weather;
  return (
    <div className="npage info-page">
      {w && (
        <>
          <div className="info">
            <Wx kind={w.now.kind} color="#F2D479" />
            <div>
              <div className="lbl">Today</div>
              <div className="val" style={{ color: 'var(--yellow)' }}>
                {w.now.temp}° · {w.today.hi}/{w.today.lo}
              </div>
            </div>
          </div>
          <div className="info">
            <Wx kind={w.tomorrow.kind} color="#9CC9E6" />
            <div>
              <div className="lbl">Tomorrow{w.tomorrow.rain >= 40 ? ` · ${w.tomorrow.rain}% rain` : ''}</div>
              <div className="val" style={{ color: 'var(--blue)' }}>
                {w.tomorrow.hi}° / {w.tomorrow.lo}°
              </div>
            </div>
          </div>
        </>
      )}
      {x.trash && (
        <div className="info">
          <svg
            width="34"
            height="34"
            viewBox="0 0 48 48"
            fill="none"
            stroke="#A9D8A0"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 14h28M19 14V9h10v5M13 14l2.4 26h17.2L35 14M20.5 21v13M27.5 21v13" />
          </svg>
          <div>
            <div className="lbl">{x.trash.title}</div>
            <div className="val" style={{ color: 'var(--green)' }}>
              {x.trash.label}
            </div>
            {x.trash.sub && <div className="lbl">{x.trash.sub}</div>}
          </div>
        </div>
      )}
      {(cd.data || []).map(c => (
        <div className="cd" key={c.title}>
          <span className="emoji">{c.icon}</span> <span className="ct">{c.title}</span>
          <b>{c.days === 0 ? 'today' : c.days === 1 ? 'tomorrow' : `${c.days} days`}</b>
        </div>
      ))}
    </div>
  );
}

function MealsPage() {
  const m = useLive<Meals>('api/meals', ['meals']);
  return (
    <div className="npage meals">
      <h3 className="mh">Meal Plan</h3>
      <ul>
        {(m.data?.items || []).slice(0, 7).map(it => (
          <li key={it.id} className={it.done ? 'done' : ''}>
            {it.day && <b className="mday">{it.day.slice(0, 1).toUpperCase() + it.day.slice(1)} </b>}
            {it.t}
          </li>
        ))}
      </ul>
    </div>
  );
}
function JarsPage() {
  const j = useLive<Jar[]>('api/jars', ['jars']);
  if (!j.data?.length) return null;
  return (
    <div className="npage">
      <h3 className="mh">Jars</h3>
      {(j.data || []).map(jar => (
        <div className="njar" key={jar.id}>
          <span>{jar.name}</span>
          <span className="emoji">
            {jar.items
              .slice(-8)
              .map(p => PIECE[p])
              .join('')}
          </span>
          <b>
            {jar.count}/{jar.goal}
          </b>
        </div>
      ))}
    </div>
  );
}
function UpNext({ time24 }: { time24: boolean }) {
  const u = useLive<{
    today: string;
    events: { date: string; title: string; time: string | null; color: string | null }[];
  }>('api/upnext', ['calendar']);
  void time24;
  return (
    <div className="npage">
      <h3 className="mh">Up next</h3>
      <ul className="nlist">
        {(u.data?.events || []).slice(0, 6).map((e, i) => (
          <li key={i} style={{ color: e.color || undefined }}>
            <b>
              {e.date === u.data!.today
                ? 'Today'
                : new Date(e.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
            </b>{' '}
            {e.title}
            {e.time && <span className="dim"> {e.time}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
function RemindersPage({ time24 }: { time24: boolean }) {
  const r = useLive<RemindersView>('api/reminders', ['reminders']);
  const v = r.data;
  return (
    <div className="npage">
      <h3 className="mh">Reminders</h3>
      <ul className="nlist">
        {(v?.items || [])
          .filter(x => !isDone(x, v!.today))
          .slice(0, 6)
          .map(x => (
            <li key={x.id}>
              {x.important && '❗ '}
              {x.title}
              {x.mode === 'time' && <span className="dim"> {fmtTime(x.time, time24)}</span>}
            </li>
          ))}
      </ul>
    </div>
  );
}
function TimersPage() {
  const { timers, now } = useTimers();
  return (
    <div className="npage">
      <h3 className="mh">Timers</h3>
      <ul className="nlist">
        {timers.map(t => (
          <li key={t.id}>
            {t.name} <b>{t.state === 'done' ? 'Done!' : fmtLeft(left(t, now))}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Notes({ time24 }: { time24: boolean }) {
  const x = useLive<Extras>('api/extras', ['extras']).data;
  const pages = x?.notes?.pages || ['info', 'meals', 'jars'];
  return (
    <aside className="notes">
      <h2 className="chalk">Notes</h2>
      {x &&
        pages.map((p, i) => (
          <div key={p} className="nslot">
            {i > 0 && <div className="rule" />}
            {p === 'info' && <Info x={x} />}
            {p === 'meals' && <MealsPage />}
            {p === 'jars' && <JarsPage />}
            {p === 'upnext' && <UpNext time24={time24} />}
            {p === 'reminders' && <RemindersPage time24={time24} />}
            {p === 'timers' && <TimersPage />}
          </div>
        ))}
    </aside>
  );
}
