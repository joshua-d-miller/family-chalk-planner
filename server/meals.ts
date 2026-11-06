// The meal plan: one simple list for the week, ticked off as you go.
//   kv 'meals'  { items: [{ t: text, done }], updated }
import type { Express } from 'express';
import type { Kv } from './kv.ts';

interface Meals {
  items: { t: string; done: boolean }[];
  updated?: number;
}

export function setup({
  app,
  kv,
  broadcast
}: {
  app: Express;
  kv: Kv;
  broadcast: (event: string, data: unknown) => void;
}) {
  app.get('/api/meals', (_req, res) => res.json(kv.get<Meals>('meals') || { items: [] }));
  app.post('/api/meals', (req, res) => {
    const list = (req.body || {}).items;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'bad list' });
    const items = list
      .slice(0, 14)
      .map(it => ({
        t: String(it?.t || '')
          .trim()
          .slice(0, 60),
        done: !!it?.done
      }))
      .filter(it => it.t);
    const meals: Meals = { items, updated: Date.now() };
    kv.set('meals', meals);
    broadcast('meals', meals);
    res.json(meals);
  });
}
