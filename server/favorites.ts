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

export function setup({
  app,
  kv,
  whose
}: {
  app: Express;
  kv: Kv;
  whose: (req: Request) => string | null; // 'p:<id>' or 's:<id>', null for nobody
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
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
