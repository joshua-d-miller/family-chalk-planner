/*
===============================================================================
 Family Chalk Planner | Server | ha-todos.ts
===============================================================================
 Version:   1.0.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     The Home Assistant app: the to-do lists picked in ⚙️ Board (Shopping
     List, Local To-do, Google Tasks…) shown on the Chores page under the
     board's own chores, and ticked off from there. Home Assistant keeps
     them: a tick goes straight to it, and what changes in Home Assistant
     shows on the next look (the page asks again every minute).

 Routes:
     GET    /api/chores/ha
     POST   /api/chores/ha-check
     GET    /api/board-settings/ha-todos

 Used by:
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.0.0     2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import type { Express } from 'express';
import type { HaTodoView } from '../shared/chores.ts';
import type { HomeAssistant } from './homeassistant.ts';

export function setup({
  app,
  ha,
  lists,
  broadcast
}: {
  app: Express;
  ha: HomeAssistant | null;
  lists: { id: string; name: string }[];
  broadcast: (event: string, data: unknown) => void;
}) {
  // a few screens on the Chores page at once ask once
  let last: { at: number; v: Promise<HaTodoView> } | null = null;
  async function view(): Promise<HaTodoView> {
    if (!ha) return { lists: [] };
    return {
      lists: await Promise.all(
        lists.map(async l => {
          try {
            const items = await ha.todoItems(l.id);
            return {
              id: l.id,
              name: l.name,
              items: items.map(i => ({ uid: i.uid, title: i.summary, done: i.status === 'completed' }))
            };
          } catch (e) {
            return { id: l.id, name: l.name, items: [], problem: (e as Error).message };
          }
        })
      )
    };
  }
  const fresh = () => {
    if (!last || Date.now() - last.at > 15e3) last = { at: Date.now(), v: view() };
    return last.v;
  };

  app.get('/api/chores/ha', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await fresh());
  });

  // ------------------- //
  // | Ticking one off | //
  // ------------------- //
  app.post('/api/chores/ha-check', async (req, res) => {
    const { list, uid, done } = (req.body || {}) as { list?: unknown; uid?: unknown; done?: unknown };
    if (!ha || !lists.some(l => l.id === list) || typeof uid !== 'string' || uid.length > 300)
      return res.status(404).json({ error: 'That list isn’t on the board' });
    try {
      await ha.setTodo(String(list), uid, !!done);
    } catch (e) {
      return res.status(502).json({ error: 'Home Assistant didn’t take it: ' + (e as Error).message });
    }
    last = null;
    broadcast('chores', { at: Date.now() });
    res.json(await fresh());
  });

  // ⚙️ Board: the to-do lists Home Assistant has, to pick from
  app.get('/api/board-settings/ha-todos', async (_req, res) => {
    if (!ha) return res.status(404).json({ error: 'Only in the Home Assistant app' });
    try {
      res.set('Cache-Control', 'no-store').json({ lists: await ha.todoLists() });
    } catch (e) {
      res.status(502).json({ error: 'Home Assistant didn’t answer: ' + (e as Error).message });
    }
  });
}
