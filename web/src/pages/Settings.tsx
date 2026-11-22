/*
===============================================================================
 Family Chalk Planner | Screens | Pages | Settings.tsx
===============================================================================
 Version:   1.2.1
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-07
 Updated:   2026-11-22

 Purpose:
     ⚙️ Settings on the board. Admins also get the calendar (Google
     sign-in and which calendars) and trash day; the rest of the board's
     settings are in the admin console. Everyone signed in: holidays,
     birthdays, the photos and the overnight slideshow, and the Notes
     column. Every screen with a menu (a family screen too): 🗓️ Week and
     🖥️ This screen.

     A card over the board, its parts down the side, on a wall or family
     screen and a computer (openSettings, shown by the Shell's
     <SettingsHost />); a page on a phone or tablet, and at /settings.

 Used by:
     web/src/App.tsx
     web/src/ui/Shell.tsx
     web/src/ui/Menu.tsx
     web/src/board/Board.tsx
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

 1.1.0    2026-11-17   joshua    This screen: 🎨 Look of cards and menus.
                        claude
                                  This screen: sleeps or days; Photos: the
                                  next countdown on the slideshow.
                                  What Apple or Google say about the calendar.

 1.2.0    2026-11-21   joshua    A card over the board on a wall or family
                        claude    screen (and a computer), the parts down its
                        colby     side; still a page on a phone or tablet.
                                  🗓️ Week: where it starts. This screen: its
                                  menu (from the ☰ menu) and its look, and
                                  hide the − / + / Fit buttons (from Colby
                                  Way's board). Switches for the checkboxes,
                                  sliders for the slideshow's timing and
                                  brightness. This screen: fill the screen,
                                  and the wooden frame; a low-power screen.
                                  Its language. A family screen gets
                                  the board's parts too.

 1.2.1    2026-11-22   joshua    Notes column: this screen's or every
                        claude    screen's, on the month and the week.
===============================================================================
*/

import { NOTES_PAGES, boardCol, setMyCol, useMyCols } from '../lib/notesCol.ts';
import type { BoardNotes, Col, NotesView } from '../lib/notesCol.ts';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { post } from '../lib/api.ts';
import { useLive } from '../lib/live.ts';
import { navigate } from '../lib/nav.ts';
import { setSpeaksHere, speaksHere } from '../lib/timers.ts';
import { DAY_NAMES } from '../lib/today.ts';
import { RANK } from '../lib/who.ts';
import type { Who } from '../lib/who.ts';
import { Btn, Field, Pick, Segs } from '../ui/bits.tsx';
import { LookFields } from '../ui/LookCard.tsx';
import { CloseX } from '../ui/Sheet.tsx';
import { useShell } from '../ui/Shell.tsx';
import { DOCK_BTNS, DOCK_MAX, MENU_STYLES, setMenuPref, useMenuPref } from '../lib/menuStyle.ts';
import { setSleeps, useSleeps } from '../lib/countdowns.ts';
import { SPACES, setWeekFrom, setWeekView, useWeekFrom, useWeekView } from '../lib/weekFrom.ts';
import type { WeekView } from '../lib/weekFrom.ts';
import { setHideZoom, useHideZoom } from '../lib/zoomControls.ts';
import { setBoardFit, useBoardFit } from '../lib/boardFit.ts';
import { LANGUAGES, setLanguage, useLanguage } from '../lib/lang.ts';
import type { Lang } from '../lib/lang.ts';
import { Page } from '../ui/Page.tsx';
import './settings.css';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | The parts of Settings | //
// ------------------------ //
// Each part, and who sees it: the calendar and trash day only the admin;   //
// the board's parts, 🗓️ Week and 🖥️ This screen every screen with a menu   //
// (a family screen too).                                                    //
export type SectionId = 'calendar' | 'holidays' | 'birthdays' | 'photos' | 'trash' | 'notes' | 'week' | 'screen';
interface Section {
  id: SectionId;
  icon: string;
  title: string;
  show: (who: Who | null) => boolean;
  El: () => ReactNode;
}
const isAdmin = (who: Who | null) => who?.user?.role === 'admin' && !!who.admin;
// (the board's parts: a family screen too, since everything but drawing is a family screen's)
const editor = (who: Who | null) => (who?.rank || 0) >= RANK.family;
const screen = (who: Who | null) => (who?.rank || 0) >= RANK.family;
export const SECTIONS: Section[] = [
  { id: 'calendar', icon: '📅', title: 'Calendar', show: isAdmin, El: () => <Calendar /> },
  { id: 'holidays', icon: '🎉', title: 'Holidays', show: editor, El: () => <Holidays /> },
  { id: 'birthdays', icon: '🎂', title: 'Birthdays', show: editor, El: () => <Birthdays /> },
  { id: 'photos', icon: '📷', title: 'Photos', show: editor, El: () => <Photos /> },
  { id: 'trash', icon: '🗑️', title: 'Trash', show: isAdmin, El: () => <Trash /> },
  { id: 'notes', icon: '🗒️', title: 'Notes column', show: editor, El: () => <RightColumn /> },
  { id: 'week', icon: '🗓️', title: 'Week', show: screen, El: () => <WeekPart /> },
  { id: 'screen', icon: '🖥️', title: 'This screen', show: screen, El: () => <ThisScreen /> }
];
// an admin signed in on the board, but not in the admin console: the calendar and trash day wait for that
function AdminNote({ who }: { who: Who | null }) {
  if (!(who?.user?.role === 'admin' && !who.admin)) return null;
  return (
    <p className="dim">
      The calendar and trash day need the admin console’s sign-in: <a href="admin">sign in there</a>, then come back.
    </p>
  );
}
function About() {
  return (
    <p className="dim small about">
      Family Chalk Planner {document.querySelector<HTMLMetaElement>('meta[name=app-version]')?.content} · free software
      under the AGPL-3.0 · <a href="https://github.com/joshua-d-miller/family-chalk-planner">source code</a>
    </p>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | The settings page | //
// --------------------- //
// On a phone or tablet (and at /settings): every part this screen may      //
// change, one under the other.                                             //
export function Settings({ who }: { who: Who | null }) {
  return (
    <Page id="settings" title="Settings" who={who}>
      <AdminNote who={who} />
      {SECTIONS.filter(x => x.show(who)).map(x => (
        <x.El key={x.id} />
      ))}
      <About />
    </Page>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Settings, as a card | //
// ---------------------- //
// On a wall or family screen (and a computer): over the board like every   //
// other card, with a ✕, so closing it puts you back where you were. The    //
// parts down the side; the one picked on the right.                        //
const OPEN = 'chalk:settings';
export const openSettings = (part?: SectionId) => dispatchEvent(new CustomEvent(OPEN, { detail: part || null }));
// Settings, or a part of it: the card where there's one (a wall or family screen, a computer), else the page
let barNow = 'none';
export const showSettings = (part?: SectionId) =>
  barNow === 'cork' ? openSettings(part) : navigate('settings' + (part ? '#' + part : ''));
export function SettingsHost({ who }: { who: Who | null }) {
  barNow = useShell().kind;
  const [open, setOpen] = useState<{ part: SectionId | null } | null>(null);
  useEffect(() => {
    const show = (e: Event) => setOpen({ part: (e as CustomEvent<SectionId | null>).detail });
    addEventListener(OPEN, show);
    return () => removeEventListener(OPEN, show);
  }, []);
  return open ? <SettingsCard who={who} part={open.part} onClose={() => setOpen(null)} /> : null;
}
function SettingsCard({ who, part, onClose }: { who: Who | null; part: SectionId | null; onClose: () => void }) {
  const list = SECTIONS.filter(x => x.show(who));
  const [cur, setCur] = useState<SectionId | undefined>(part && list.some(x => x.id === part) ? part : list[0]?.id);
  const down = useRef(false);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  const shown = list.find(x => x.id === cur);
  return (
    <div
      className="scrim"
      onPointerDown={e => (down.current = e.target === e.currentTarget)}
      onClick={e => {
        if (down.current && e.target === e.currentTarget) onClose();
        down.current = false;
      }}
    >
      <div className="sheet setpop" role="dialog" aria-modal="true" aria-label="Settings" id="settingsCard">
        <div className="shead">
          <h3>Settings</h3>
          <CloseX onClose={onClose} />
        </div>
        <div className="setbody">
          <div className="setrail" role="tablist" aria-label="Parts of Settings" aria-orientation="vertical">
            {list.map(x => (
              <button
                key={x.id}
                type="button"
                role="tab"
                id={'setTab-' + x.id}
                aria-selected={x.id === cur}
                className={x.id === cur ? 'on' : undefined}
                onClick={() => setCur(x.id)}
              >
                <span className="ic" aria-hidden="true">
                  {x.icon}
                </span>{' '}
                {x.title}
              </button>
            ))}
          </div>
          <div className="setpane" role="tabpanel" aria-labelledby={cur && 'setTab-' + cur}>
            {cur === list[0]?.id && <AdminNote who={who} />}
            {shown && <shown.El key={shown.id} />}
          </div>
        </div>
        <About />
      </div>
    </div>
  );
}

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
  const later = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  if (!p.data) return null;
  const c = p.data.cfg;
  const set = (patch: Partial<PhotoCfg>) => {
    p.set({ ...p.data!, cfg: { ...c, ...patch } });
    sv.run(post('api/photos/settings', patch));
  };
  // a slider: it moves at once, and is saved once it stops moving (not at every step of a drag)
  const slide = (patch: Partial<PhotoCfg>) => {
    p.set({ ...p.data!, cfg: { ...c, ...patch } });
    clearTimeout(later.current);
    later.current = setTimeout(() => sv.run(post('api/photos/settings', patch)), 400);
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
        </div>
      )}
      {c.night && (
        <div className="slides2">
          <label className="slide">
            <span>Next photo every</span>
            <b>{c.every} seconds</b>
            <input
              type="range"
              aria-label="Next photo every"
              min={5}
              max={120}
              step={5}
              value={c.every}
              onChange={e => slide({ every: +e.target.value })}
            />
          </label>
          <label className="slide">
            <span>Brightness</span>
            <b>{c.dim}%</b>
            <input
              type="range"
              aria-label="Brightness"
              min={10}
              max={100}
              step={10}
              value={c.dim}
              onChange={e => slide({ dim: +e.target.value })}
            />
          </label>
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
// Up to 3 pages (from Colby Way's board), on the month and on the week,   //
// and either can be left off: for this screen (or the person signed in), //
// or for every screen that hasn't set its own.                            //
const SWITCH_PAGES = ['jars', 'today', 'upnext', 'photos'];
// a column with new pages or on/off: the bottom's switch kept if its page is still at the bottom
function changeCol(c: Col, change: Partial<Col>): Col {
  const next: Col = { on: change.on ?? c.on, pages: change.pages ?? c.pages };
  const last = next.pages[next.pages.length - 1];
  if (SWITCH_PAGES.includes(last))
    next.bottom = c.bottom?.def === last ? c.bottom : { def: last, can: c.bottom?.can || SWITCH_PAGES };
  return next;
}
function ColumnPicker({
  view,
  col,
  onChange,
  onReset
}: {
  view: NotesView;
  col: Col;
  onChange: (c: Col) => void;
  onReset?: () => void; // this screen's own: back to the board's
}) {
  const title = view === 'week' ? 'On the week' : 'On the month';
  const { on, pages } = col;
  return (
    <div id={'notes-' + view}>
      <h4>{title}</h4>
      <label className="check">
        <input
          id={'notesOn-' + view}
          type="checkbox"
          checked={on}
          onChange={e => onChange(changeCol(col, { on: e.target.checked }))}
        />
        <span className="t">
          {view === 'week'
            ? 'Show the Notes column on the week (off: the week takes the whole board)'
            : 'Show the Notes column on the month (off: the calendar takes the whole board)'}
        </span>
      </label>
      {on && (
        <>
          <p className="dim small">Up to 3, from the top. Tap to add or take away.</p>
          <div className="segs" role="group" aria-label={title}>
            {NOTES_PAGES.map(([id, label]) => {
              const at = pages.indexOf(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={'seg' + (at >= 0 ? ' on' : '')}
                  aria-pressed={at >= 0}
                  disabled={at < 0 && pages.length >= 3}
                  onClick={() =>
                    onChange(changeCol(col, { pages: at >= 0 ? pages.filter(p => p !== id) : [...pages, id] }))
                  }
                >
                  {at >= 0 && <b>{at + 1}. </b>}
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}
      {onReset && (
        <div className="segs">
          <button type="button" className="seg" id={'notesReset-' + view} onClick={onReset}>
            ↩️ Like the rest of the board
          </button>
        </div>
      )}
    </div>
  );
}
function RightColumn() {
  const x = useLive<{ notes: BoardNotes }>('api/extras', ['extras']);
  const mine = useMyCols();
  const [scope, setScope] = useState<'screen' | 'board'>('screen');
  const sv = useSaved();
  if (!x.data || !mine.data) return null;
  const n = x.data.notes;
  const views: NotesView[] = ['month', 'week'];
  // every screen's (the board's)
  const sendBoard = (view: NotesView, c: Col) => {
    const next: BoardNotes = { ...n, on: { month: n.on?.month ?? true, week: n.on?.week ?? true } };
    next[view === 'week' ? 'week' : 'pages'] = c.pages;
    next.on![view] = c.on;
    x.set({ ...x.data!, notes: next });
    sv.run(post('api/right-pages', { view, pages: c.pages, on: c.on }));
  };
  // this screen's
  const sendMine = (view: NotesView, c: Col | null) => {
    mine.set({ ...mine.data!, [view]: c });
    sv.run(setMyCol(view, c));
  };
  return (
    <Card title="The right-hand column">
      <div className="segs" role="radiogroup" aria-label="Whose Notes column">
        {(
          [
            ['screen', '🖥️ This screen'],
            ['board', '🏠 Every screen']
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            id={'notesScope-' + v}
            aria-checked={scope === v}
            className={'seg' + (scope === v ? ' on' : '')}
            onClick={() => setScope(v)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="dim small">
        {scope === 'screen'
          ? 'Just this screen (or you, signed in). Until it’s changed here, it shows the same as every screen.'
          : 'Every screen that hasn’t set its own.'}
      </p>
      {views.map(view =>
        scope === 'board' ? (
          <ColumnPicker key={view} view={view} col={boardCol(n, view)} onChange={c => sendBoard(view, c)} />
        ) : (
          <ColumnPicker
            key={view}
            view={view}
            col={mine.data![view] || boardCol(n, view)}
            onChange={c => sendMine(view, c)}
            onReset={mine.data![view] ? () => sendMine(view, null) : undefined}
          />
        )
      )}
      {sv.line}
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | This screen only | //
// -------------------- //
// How this screen gets around (a family screen or computer: the cork, or   //
// the ☰ button in a corner), its look, and the rest that's just for it.    //
function ThisScreen() {
  const shell = useShell();
  const pref = useMenuPref();
  const [speak, setSpeak] = useState(speaksHere());
  const sleeps = useSleeps();
  const hideZoom = useHideZoom();
  const signedIn = !!shell.who?.user;
  const fit = useBoardFit();
  const lang = useLanguage();
  return (
    <Card title="This screen" id="thisScreen">
      {shell.kind === 'cork' && (
        <>
          <h4>The menu</h4>
          <div className="segs" role="radiogroup" aria-label="This screen’s menu">
            {MENU_STYLES.map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                id={'menuStyle-' + v}
                aria-checked={pref.style === v}
                className={'seg' + (pref.style === v ? ' on' : '')}
                onClick={() => void setMenuPref({ style: v })}
              >
                {label}
              </button>
            ))}
          </div>
          {pref.style === 'notes' && (
            <>
              <p className="dim small">
                The ☰ and up to {DOCK_MAX} buttons, in the last row of the Notes column (on the calendar). Tap to add
                or take one away; a fourth takes the place of the first.
              </p>
              <div className="segs" role="group" aria-label="The buttons beside the ☰">
                {DOCK_BTNS.map(([b, icon, label]) => {
                  const at = pref.dock.indexOf(b);
                  return (
                    <button
                      key={b}
                      type="button"
                      id={'dockPick-' + b}
                      className={'seg' + (at >= 0 ? ' on' : '')}
                      aria-pressed={at >= 0}
                      onClick={() =>
                        void setMenuPref({
                          dock: at >= 0 ? pref.dock.filter(x => x !== b) : [...pref.dock, b].slice(-DOCK_MAX)
                        })
                      }
                    >
                      {at >= 0 && <b>{at + 1}. </b>}
                      <span className="emoji">{icon}</span> {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {(pref.style === 'right' || pref.style === 'left') && (
            <label className="check">
              <input
                id="menuStyle-draw"
                type="checkbox"
                checked={pref.draw}
                onChange={e => void setMenuPref({ draw: e.target.checked })}
              />
              <span className="t">A ✏️ Draw button beside the ☰</span>
            </label>
          )}
        </>
      )}
      <h4>Language</h4>
      {lang && (
        <Segs
          label="Language"
          value={lang.mine || 'board'}
          options={[['board', `The board’s (${lang.board === 'es' ? 'Español' : 'English'})`], ...LANGUAGES]}
          onChange={v => void setLanguage(v === 'board' ? null : (v as Lang))}
        />
      )}
      <h4>The board on this screen</h4>
      <label className="check">
        <input
          id="fillBox2"
          type="checkbox"
          checked={fit.fill}
          onChange={e => void setBoardFit({ fill: e.target.checked })}
        />
        <span className="t">
          Fill the screen: taller days, instead of bands above and below (16:9 and 16:10 screens)
        </span>
      </label>
      <label className="check">
        <input
          id="frameBox2"
          type="checkbox"
          checked={!fit.noFrame}
          onChange={e => void setBoardFit({ noFrame: !e.target.checked })}
        />
        <span className="t">The wooden frame around the board (a screen in a frame of its own can leave it off)</span>
      </label>
      <label className="check">
        <input
          id="lowBox"
          type="checkbox"
          checked={fit.low}
          onChange={e => void setBoardFit({ low: e.target.checked })}
        />
        <span className="t">
          Low-power screen: no moving weather, GIFs or fades, and plainer chalk (for a slow wall screen)
        </span>
      </label>
      <h4>Look of cards and menus</h4>
      <LookFields />
      <h4>Also on this screen</h4>
      <label className="check">
        <input id="sleepsBox" type="checkbox" checked={sleeps} onChange={e => void setSleeps(e.target.checked)} />
        <span className="t">Count down in sleeps (“3 sleeps!”) instead of days</span>
      </label>
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
      {/* (only a screen someone is signed in on has the zoom buttons) */}
      {signedIn && (
        <label className="check">
          <input
            id="hideZoomBox"
            type="checkbox"
            checked={hideZoom}
            onChange={e => void setHideZoom(e.target.checked)}
          />
          <span className="t">Hide the − / + / Fit buttons on the calendar</span>
        </label>
      )}
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------ //
// | The week | //
// ------------ //
// 🗓️ Week on this screen: from the board's first day, or from today; the  //
// whole height, or Split View and what goes under the week.                 //
function WeekPart() {
  const weekFrom = useWeekFrom();
  const view = useWeekView();
  const first = DAY_NAMES[useLive<{ weekStart?: number }>('api/today', ['calendar']).data?.weekStart || 0];
  const [err, setErr] = useState('');
  const change = (c: Partial<WeekView>) => {
    setErr('');
    setWeekView(c).catch(e => setErr((e as Error).message));
  };
  return (
    <Card title="Week" id="weekPart">
      <h4>Starts on</h4>
      <Segs
        label="The week starts on"
        value={weekFrom}
        options={[
          ['today', 'Today (and the next 6 days)'],
          ['board', first]
        ]}
        onChange={v => void setWeekFrom(v)}
      />
      <h4>Shows</h4>
      <Segs
        label="The week shows"
        value={view.split ? 'split' : 'week'}
        options={[
          ['week', 'The week, full height'],
          ['split', 'Split View']
        ]}
        onChange={v => change({ split: v === 'split' })}
      />
      {view.split && (
        <>
          <p className="dim small">
            The week across the top, and one or two things under it. The Notes column shows the weather, trash day and
            countdowns.
          </p>
          <h4>Under the week, on the left</h4>
          <Segs label="Under the week, on the left" value={view.a} options={SPACES} onChange={a => change({ a })} />
          <h4>And on the right</h4>
          <Segs
            label="Under the week, on the right"
            value={view.b}
            options={[['none', 'Nothing (the left one is wider)'], ...SPACES.filter(([v]) => v !== view.a)]}
            onChange={b => change({ b })}
          />
        </>
      )}
      <div className="err">{err}</div>
    </Card>
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
