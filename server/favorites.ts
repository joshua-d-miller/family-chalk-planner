/*
===============================================================================
 Family Chalk Planner | Server | favorites.ts
===============================================================================
 Version:   1.2.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-21

 Purpose:
     Favorites: the few things each person (and each family screen) uses
     most, kept on the strip next to Add event and Draw; everything else
     is in the ☰ menu. Saved per person, or per screen when nobody is
     signed in on it.
       kv 'favorites'  { 'p:<person id>' | 's:<screen id>': [up to 3 menu
           item ids] }
     And what the bottom of its Notes column shows, and what its little
     switch can flip to (set on the screen, or for the wall in the admin
     console):
       kv 'notesbottom'  { 'p:...' | 's:...': { def: 'upnext', can:
           ['upnext', 'today', 'photos'] } }
     And how it gets to its pages and tools: the cork (nothing saved), or
     the ☰ button in the bottom right or left corner, with or without a ✏️
     Draw button beside it:
       kv 'menustyle'  { 'p:...' | 's:...': { style: 'right' | 'left',
           draw: true | false } }
     And the look of its cards and ☰ menu (chalk unless changed), an
     accent color, and their text size:
       kv 'uilook'  { 'p:...' | 's:...': { look: 'light' | 'dark' |
           'contrast' | 'chalk', accent: '#rrggbb' | null, size: 'normal'
           | 'large' | 'larger' } }
     And whether its countdowns count in sleeps ("3 sleeps!") or days
     (a kid's tablet counts sleeps unless told otherwise):
       kv 'sleeps'  { 'p:...' | 's:...': true | false }
     And where its 🗓️ Week starts: on the board's first day of the week
     (nothing saved), or on today, showing today and the next 6 days:
       kv 'weekfrom'  { 'p:...' | 's:...': 'today' }
     And whether its 🗓️ Week is Split View (the week as a band, and one or
     two spaces under it: photos, room to draw, the meal plan, the pantry,
     the jars, chores, reminders or up next):
       kv 'weekview'  { 'p:...' | 's:...': { split: true, a: 'photos',
           b: 'draw' | 'none' } }
     And whether it hides the − / + / Fit zoom buttons (shown unless set;
     only a screen someone is signed in on has them; from Colby Way's
     board):
       kv 'nozoom'  { 'p:...' | 's:...': true }
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The new screens (React + TypeScript): meal
                        colby     plan, reminders, timers, pantry, jars and
                        claude    chores.

 0.14.0    2026-11-07   joshua    Up to 3 pinned pages (the bar holds 3).
                        claude

 0.15.0    2026-11-08   joshua    What the bottom of each screen's Notes column
                        claude    shows and can switch to (the admin console
                                  sets the wall's).

 0.17.0    2026-11-12   joshua    Each screen's menu: the cork or the ☰ button
                        colby     (right or left), kept on the board so
                        claude    clearing the browser doesn't lose it.

 1.1.0    2026-11-17   joshua    The look of each screen's cards and ☰ menu:
                        claude    chalk, light, dark or high contrast, an
                                  accent color and a larger text size, kept on
                                  the board.
                                  Countdowns in sleeps or days, per screen (or
                                  person); the admin console sets any
                                  screen's.

 1.2.0    2026-11-21   joshua    🗓️ Week from today (today and the next 6
                        colby     days) or from the board's first day, and
                        claude    🗓️ Week's Split View and what goes under
                                  the week (Colby Way's idea), per screen; the
                                  admin console sets any screen's.
                                  Hide the − / + / Fit buttons, per person
                                  (from Colby Way's board).
===============================================================================
*/

import type { Express, Request } from 'express';
import type { Kv } from './kv.ts';

const MAX = 3; // pinned to the bar (Home, 3 pages and More on a phone)

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------------------- //
// | Favorites, per person or screen | //
// ----------------------------------- //
// Up to 4, kept under p:<person id> or s:<screen id>.                       //
const isItem = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(v);

// what the bottom of the Notes column can show (with the little switch)
const BOTTOM = ['jars', 'today', 'upnext', 'photos'];
interface Bottom {
  def: string;
  can: string[];
}
const cleanBottom = (b: unknown): Bottom | null => {
  const v = (b || {}) as { def?: unknown; can?: unknown };
  if (typeof v.def !== 'string' || !BOTTOM.includes(v.def)) return null;
  const can = BOTTOM.filter(m => m === v.def || (Array.isArray(v.can) && v.can.includes(m)));
  return { def: v.def, can };
};

export function setup({
  app,
  kv,
  whose,
  broadcast
}: {
  app: Express;
  kv: Kv;
  whose: (req: Request) => string | null; // 'p:<id>' or 's:<id>', null for nobody
  broadcast: (event: string, data: unknown) => void;
}) {
  const all = () => kv.get<Record<string, string[]>>('favorites') || {};
  app.get('/api/favorites', (req, res) => {
    const k = whose(req);
    res.json({ items: (k && all()[k]) || [], saved: !!k });
  });
  app.post('/api/favorites', (req, res) => {
    const k = whose(req);
    if (!k) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    const sent = (req.body || {}).items;
    if (!Array.isArray(sent)) return res.status(400).json({ error: 'bad favorites' });
    const items = [...new Set(sent.filter(isItem))].slice(0, MAX);
    const map = all();
    map[k] = items;
    kv.set('favorites', map);
    res.json({ items, saved: true });
  });

  // ----------------------- //
  // | The bottom of Notes | //
  // ----------------------- //
  // A screen sets its own (family screens and tablets, on the board); the   //
  // admin console sets any screen's (the wall can't change anything)        //
  const bottoms = () => kv.get<Record<string, Bottom>>('notesbottom') || {};
  const setBottom = (k: string, b: Bottom | null) => {
    const map = bottoms();
    if (b) map[k] = b;
    else delete map[k];
    kv.set('notesbottom', map);
    broadcast('notesbottom', {});
  };
  app.get('/api/notesbottom', (req, res) => {
    const k = whose(req);
    res.json({ bottom: (k && bottoms()[k]) || null });
  });
  app.post('/api/notesbottom', (req, res) => {
    const k = whose(req);
    if (!k) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    const b = req.body?.bottom === null ? null : cleanBottom(req.body?.bottom);
    if (req.body?.bottom !== null && !b) return res.status(400).json({ error: 'Pick what it shows' });
    setBottom(k, b);
    res.json({ bottom: b });
  });
  // the admin console: every screen's (/api/devices/... is for admins only)
  app.get('/api/devices/notes-bottom', (_req, res) => {
    const out: Record<string, Bottom> = {};
    for (const [k, v] of Object.entries(bottoms())) if (k.startsWith('s:')) out[k.slice(2)] = v;
    res.json({ bottoms: out });
  });
  app.post('/api/devices/notes-bottom', (req, res) => {
    const id = String(req.body?.id || '');
    if (!/^[\w-]{1,40}$/.test(id)) return res.status(400).json({ error: 'Screen not found' });
    const b = req.body?.bottom === null ? null : cleanBottom(req.body?.bottom);
    if (req.body?.bottom !== null && !b) return res.status(400).json({ error: 'Pick what it shows' });
    setBottom('s:' + id, b);
    res.json({ bottom: b });
  });

  // ---------------------- //
  // | This screen's menu | //
  // ---------------------- //
  // The cork (nothing kept) or the ☰ button on the right or the left, and   //
  // whether a ✏️ Draw button sits beside it. Kept on the board, per screen  //
  // (or per person on a computer), so a cleared browser keeps it; the       //
  // screen changes at once when it's saved. A change can send just one of   //
  // the two.                                                                //
  interface MenuPref {
    style: 'right' | 'left';
    draw: boolean;
  }
  const prefs = () => kv.get<Record<string, MenuPref>>('menustyle') || {};
  const view = (p: MenuPref | undefined) => ({ style: p?.style || 'cork', draw: !!p?.draw });
  app.get('/api/menustyle', (req, res) => {
    const k = whose(req);
    res.json({ ...view(k ? prefs()[k] : undefined), saved: !!k });
  });
  app.post('/api/menustyle', (req, res) => {
    const k = whose(req);
    if (!k) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    const body = req.body || {};
    const map = prefs();
    const now = view(map[k]);
    const style = body.style ?? now.style;
    const draw = body.draw ?? now.draw;
    if (!['cork', 'right', 'left'].includes(style) || typeof draw !== 'boolean')
      return res.status(400).json({ error: 'Pick where the menu goes' });
    if (style === 'cork')
      delete map[k]; // (the cork has no ✏️ button of its own)
    else map[k] = { style, draw };
    kv.set('menustyle', map);
    broadcast('menustyle', {});
    res.json({ ...view(map[k]), saved: true });
  });

  // ------------------------------------ //
  // | The look of its cards and ☰ menu | //
  // ------------------------------------ //
  // Chalk (as before), light, dark or high contrast; an accent color for    //
  // headings and what's picked; and a larger text size. Kept on the board   //
  // like the menu, per screen (or per person on a computer). A change can   //
  // send just one of the three.                                             //
  const LOOKS = ['chalk', 'light', 'dark', 'contrast'];
  const SIZES = ['normal', 'large', 'larger'];
  interface UiLook {
    look: string;
    accent: string | null;
    size: string;
  }
  const looks = () => kv.get<Record<string, UiLook>>('uilook') || {};
  const lookOf = (p: Partial<UiLook> | undefined): UiLook => ({
    look: p?.look && LOOKS.includes(p.look) ? p.look : 'chalk',
    accent: typeof p?.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.accent) ? p.accent : null,
    size: p?.size && SIZES.includes(p.size) ? p.size : 'normal'
  });
  app.get('/api/uilook', (req, res) => {
    const k = whose(req);
    res.json({ ...lookOf(k ? looks()[k] : undefined), saved: !!k });
  });
  app.post('/api/uilook', (req, res) => {
    const k = whose(req);
    if (!k) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    const b = req.body || {};
    const map = looks();
    const now = lookOf(map[k]);
    const next = {
      look: b.look ?? now.look,
      accent: b.accent === undefined ? now.accent : b.accent,
      size: b.size ?? now.size
    };
    if (!LOOKS.includes(next.look) || !SIZES.includes(next.size))
      return res.status(400).json({ error: 'Pick a look and a text size' });
    if (next.accent !== null && !(typeof next.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(next.accent)))
      return res.status(400).json({ error: 'Pick a color' });
    if (next.look === 'chalk' && !next.accent && next.size === 'normal')
      delete map[k]; // (the look everyone starts with)
    else map[k] = next;
    kv.set('uilook', map);
    broadcast('uilook', {});
    res.json({ ...lookOf(map[k]), saved: true });
  });

  // ------------------- //
  // | Sleeps, or days | //
  // ------------------- //
  // A countdown in sleeps ("3 sleeps!") or days. Nothing saved: the screen  //
  // decides (sleeps on a kid's tablet, days elsewhere). The admin console   //
  // sets any screen's, the wall's too.                                      //
  const sleeps = () => kv.get<Record<string, boolean>>('sleeps') || {};
  const setSleeps = (k: string, v: unknown) => {
    const map = sleeps();
    if (v === null) delete map[k];
    else map[k] = !!v;
    kv.set('sleeps', map);
    broadcast('sleeps', {});
    return k in map ? map[k] : null;
  };
  app.get('/api/sleeps', (req, res) => {
    const k = whose(req);
    const v = k ? sleeps()[k] : undefined;
    res.json({ sleeps: v === undefined ? null : v });
  });
  app.post('/api/sleeps', (req, res) => {
    const k = whose(req);
    if (!k) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    const v = (req.body || {}).sleeps;
    if (!(v === null || typeof v === 'boolean')) return res.status(400).json({ error: 'Sleeps or days' });
    res.json({ sleeps: setSleeps(k, v) });
  });
  app.get('/api/devices/sleeps', (_req, res) => {
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(sleeps())) if (k.startsWith('s:')) out[k.slice(2)] = v;
    res.json({ sleeps: out });
  });
  app.post('/api/devices/sleeps', (req, res) => {
    const id = String(req.body?.id || '');
    const v = req.body?.sleeps;
    if (!/^[\w-]{1,40}$/.test(id)) return res.status(400).json({ error: 'Screen not found' });
    if (!(v === null || typeof v === 'boolean')) return res.status(400).json({ error: 'Sleeps or days' });
    res.json({ sleeps: setSleeps('s:' + id, v) });
  });

  // ------------------------- //
  // | Where the week starts | //
  // ------------------------- //
  // 🗓️ Week from the board's first day of the week (nothing saved), or     //
  // from today: today and the next 6 days. Per screen (or person), like     //
  // sleeps; the admin console sets any screen's, the wall's too.            //
  const WEEK_FROM = ['board', 'today'];
  const weekFroms = () => kv.get<Record<string, 'today'>>('weekfrom') || {};
  const setWeekFrom = (k: string, v: string) => {
    const map = weekFroms();
    if (v === 'today') map[k] = 'today';
    else delete map[k];
    kv.set('weekfrom', map);
    broadcast('weekfrom', {});
    return map[k] || 'board';
  };
  app.get('/api/weekfrom', (req, res) => {
    const k = whose(req);
    res.json({ from: (k && weekFroms()[k]) || 'board' });
  });
  app.post('/api/weekfrom', (req, res) => {
    const k = whose(req);
    if (!k) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    const v = (req.body || {}).from;
    if (!WEEK_FROM.includes(v)) return res.status(400).json({ error: 'Pick where the week starts' });
    res.json({ from: setWeekFrom(k, v) });
  });
  app.get('/api/devices/weekfrom', (_req, res) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(weekFroms())) if (k.startsWith('s:')) out[k.slice(2)] = v;
    res.json({ weekfrom: out });
  });
  app.post('/api/devices/weekfrom', (req, res) => {
    const id = String(req.body?.id || '');
    const v = req.body?.from;
    if (!/^[\w-]{1,40}$/.test(id)) return res.status(400).json({ error: 'Screen not found' });
    if (!WEEK_FROM.includes(v)) return res.status(400).json({ error: 'Pick where the week starts' });
    res.json({ from: setWeekFrom('s:' + id, v) });
  });

  // ------------------------------------- //
  // | 🗓️ Week: Split View, and its spaces | //
  // ------------------------------------- //
  // The week as a band across the top and one or two spaces under it, or   //
  // the week in the whole height (nothing saved). Per screen (or person);  //
  // the admin console sets any screen's, the wall's too.                    //
  const SPACES = ['photos', 'draw', 'meals', 'pantry', 'jars', 'chores', 'reminders', 'upnext'];
  interface WeekView {
    split: boolean;
    a: string;
    b: string;
  }
  const weekViews = () => kv.get<Record<string, WeekView>>('weekview') || {};
  const viewOf = (v: Partial<WeekView> | undefined): WeekView => ({
    split: !!v?.split,
    a: v?.a && SPACES.includes(v.a) ? v.a : 'photos',
    b: v?.b === 'none' || (v?.b && SPACES.includes(v.b)) ? v.b : 'draw'
  });
  const checkView = (b: Record<string, unknown>, now: WeekView): WeekView | null => {
    const next = { ...now, ...b } as WeekView;
    if (typeof next.split !== 'boolean' || !SPACES.includes(next.a)) return null;
    if (next.b !== 'none' && !SPACES.includes(next.b)) return null;
    return { split: next.split, a: next.a, b: next.b === next.a ? 'none' : next.b }; // (not the same thing twice)
  };
  const setWeekView = (k: string, v: WeekView) => {
    const map = weekViews();
    if (v.split || v.a !== 'photos' || v.b !== 'draw') map[k] = v;
    else delete map[k];
    kv.set('weekview', map);
    broadcast('weekview', {});
    return viewOf(map[k]);
  };
  app.get('/api/weekview', (req, res) => {
    const k = whose(req);
    res.json(viewOf(k ? weekViews()[k] : undefined));
  });
  app.post('/api/weekview', (req, res) => {
    const k = whose(req);
    if (!k) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    const v = checkView(req.body || {}, viewOf(weekViews()[k]));
    if (!v) return res.status(400).json({ error: 'Pick what the week shows' });
    res.json(setWeekView(k, v));
  });
  app.get('/api/devices/weekview', (_req, res) => {
    const out: Record<string, WeekView> = {};
    for (const [k, v] of Object.entries(weekViews())) if (k.startsWith('s:')) out[k.slice(2)] = viewOf(v);
    res.json({ weekview: out });
  });
  app.post('/api/devices/weekview', (req, res) => {
    const id = String(req.body?.id || '');
    if (!/^[\w-]{1,40}$/.test(id)) return res.status(400).json({ error: 'Screen not found' });
    const { id: _id, ...rest } = req.body || {};
    const v = checkView(rest, viewOf(weekViews()['s:' + id]));
    if (!v) return res.status(400).json({ error: 'Pick what the week shows' });
    res.json(setWeekView('s:' + id, v));
  });

  // ------------------------------ //
  // | The − / + / Fit buttons | //
  // ------------------------------ //
  // Shown unless hidden (a touch screen that never zooms). Only a screen    //
  // someone is signed in on has them, so it's kept per person (or screen).  //
  // From Colby Way's board.                                                 //
  const noZooms = () => kv.get<Record<string, true>>('nozoom') || {};
  const setNoZoom = (k: string, hide: boolean) => {
    const map = noZooms();
    if (hide) map[k] = true;
    else delete map[k];
    kv.set('nozoom', map);
    broadcast('nozoom', {});
    return !!map[k];
  };
  app.get('/api/nozoom', (req, res) => {
    const k = whose(req);
    res.json({ hide: !!(k && noZooms()[k]) });
  });
  app.post('/api/nozoom', (req, res) => {
    const k = whose(req);
    if (!k) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    const v = (req.body || {}).hide;
    if (typeof v !== 'boolean') return res.status(400).json({ error: 'Show or hide them' });
    res.json({ hide: setNoZoom(k, v) });
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
