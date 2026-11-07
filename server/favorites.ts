// Favorites: the few things each person (and each family screen) uses most, kept on the strip next to
// Add event and Draw; everything else is in the ☰ menu. Saved per person, or per screen when nobody is
// signed in on it.
//   kv 'favorites'  { 'p:<person id>' | 's:<screen id>': [up to 4 menu item ids] }
import type { Express, Request } from 'express';
import type { Kv } from './kv.ts';

const MAX = 4;
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
}
