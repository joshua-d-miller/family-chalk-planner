/*
===============================================================================
 Family Chalk Planner | Server | favorites.ts
===============================================================================
 Version:   0.15.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-08

 Purpose:
     Favorites: the few things each person (and each family screen) uses
     most, kept on the strip next to Add event and Draw; everything else
     is in the ☰ menu. Saved per person, or per screen when nobody is
     signed in on it.
       kv 'favorites'  { 'p:<person id>' | 's:<screen id>': [up to 3 menu
           item ids] }
     And how each screen shows the calendar: the whole month, or one
     week at a time.
       kv 'boardview'  { 'p:<person id>' | 's:<screen id>': 'week' }
     And what the bottom of its Notes column shows, and what its little
     switch can flip to (set on the screen, or for the wall in the admin
     console):
       kv 'notesbottom'  { 'p:...' | 's:...': { def: 'upnext', can:
           ['upnext', 'today', 'photos'] } }
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

 0.15.0    2026-11-08   joshua    Month or week, per screen.
                        claude

                                  What the bottom of each screen's Notes column
                                  shows and can switch to (the admin console
                                  sets the wall's).
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

  // ---------------------- //
  // | Month or week view | //
  // ---------------------- //
  // Every screen may change its own (the wall too: a tap on the month name) //
  const views = () => kv.get<Record<string, string>>('boardview') || {};
  app.get('/api/boardview', (req, res) => {
    const k = whose(req);
    res.json({ view: (k && views()[k]) || 'month' });
  });
  app.post('/api/boardview', (req, res) => {
    const k = whose(req);
    if (!k) return res.status(401).json({ error: 'Pair this screen or sign in first', pair: true });
    const view = (req.body || {}).view;
    if (view !== 'month' && view !== 'week') return res.status(400).json({ error: 'bad view' });
    const map = views();
    if (view === 'month') delete map[k];
    else map[k] = view;
    kv.set('boardview', map);
    res.json({ view });
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
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
