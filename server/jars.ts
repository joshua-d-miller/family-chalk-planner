// Reward jars (up to 4, one per kid): pieces go in from the tablet or a family screen; the wall shows
// them filling up. Each jar remembers every piece in the order it went in (a kid can ask for a rainbow).
//   kv 'jars'  [{ id, name, pieces: what + adds in turn, count, items: what's in it, goal }]
import type { Express } from 'express';
import type { Kv } from './kv.ts';

const PIECES = ['heart', 'rainbow', 'star', 'bolt', 'critter'];

export interface Jar {
  id: string;
  name: string;
  pieces: string[];
  count: number;
  items: string[];
  goal: number;
}

// What's in the jar, kept as long as count: anything missing is filled in the jar's usual rotation
function jarItems(items: unknown, count: number, pieces: string[]): string[] {
  const out = (Array.isArray(items) ? items.filter((p): p is string => PIECES.includes(p)) : []).slice(0, count);
  while (out.length < count) out.push(pieces[out.length % pieces.length]);
  return out;
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
  const getJars = () => kv.get<Jar[]>('jars') || []; // jars are optional; added from the tablet

  app.get('/api/jars', (_req, res) => res.json(getJars()));
  app.post('/api/jars', (req, res) => {
    const list = (req.body || {}).jars;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'bad jars' });
    const before = Object.fromEntries(getJars().map(j => [j.id, j]));
    const jars: Jar[] = list.slice(0, 4).map((raw: Record<string, unknown>, i: number) => {
      const j = raw || {};
      const id = typeof j.id === 'string' && /^[a-z0-9]{1,16}$/.test(j.id) ? j.id : `jar${i}`;
      let pieces = (Array.isArray(j.pieces) ? j.pieces.filter((p): p is string => PIECES.includes(p)) : []).slice(0, 5);
      if (!pieces.length) pieces = ['star'];
      const count = Math.min(Math.max(Math.round(Number(j.count)) || 0, 0), 200);
      // a page from before 0.9 doesn't send items: keep what was already in that jar
      const items = jarItems(Array.isArray(j.items) ? j.items : before[id]?.items, count, pieces);
      const name =
        String(j.name || 'Jar')
          .trim()
          .slice(0, 14) || 'Jar';
      const goal = Math.min(Math.max(Math.round(Number(j.goal)) || 20, 3), 100);
      return { id, name, pieces, count, items, goal };
    });
    kv.set('jars', jars);
    broadcast('jars', { jars });
    res.json(jars);
  });
}
