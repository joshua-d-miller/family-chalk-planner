/*
===============================================================================
 Family Chalk Planner | Tests | mock-homeassistant.ts
===============================================================================
 Version:   1.0.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     A pretend Home Assistant, as the board sees it through the
     Supervisor's proxy: its REST API (states, calendar events, the to-do
     update action) and its websocket API (its people, adding, changing
     and deleting calendar events, the to-do items). Its token is "test".
     It has two people (an admin and a kid), three calendars (a local one
     that can do everything, a Google one that can add and delete but not
     change, and a read-only holidays one) and a chores to-do list.
 How it fits:
     The board is started with SUPERVISOR_TOKEN=test, HA_API_URL and
     HA_WS_URL pointing here, and HA_INGRESS_FROM=127.0.0.1, so a test can
     send Home Assistant's Ingress headers itself.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.0.0     2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

import crypto from 'node:crypto';
import http from 'node:http';
import type { Duplex } from 'node:stream';

const TOKEN = 'test';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------- //
// | What this Home Assistant has | //
// ------------------------------- //
type Ev = {
  uid: string;
  summary: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
};
export function freshState() {
  return {
    people: [
      { id: 'u-admin', name: 'Alex', username: 'alex', group_ids: ['system-admin'], is_owner: true },
      { id: 'u-kid', name: 'Sam', username: 'sam', group_ids: ['system-users'] },
      { id: 'u-sys', name: 'Supervisor', group_ids: ['system-admin'], system_generated: true }
    ],
    calendars: {
      'calendar.family': {
        name: 'Family',
        features: 7, // add, delete, change
        events: [
          {
            uid: 'ev-soccer',
            summary: 'Soccer',
            start: { dateTime: '2026-10-10T09:00:00-04:00' },
            end: { dateTime: '2026-10-10T10:30:00-04:00' }
          },
          { uid: 'ev-trip', summary: 'Field trip', start: { date: '2026-10-16' }, end: { date: '2026-10-17' } }
        ] as Ev[]
      },
      'calendar.work': {
        name: 'Work (Google)',
        features: 3, // add and delete, not change (like Home Assistant's Google calendars)
        events: [
          {
            uid: 'ev-standup',
            summary: 'Team offsite',
            start: { dateTime: '2026-10-14T13:00:00-04:00' },
            end: { dateTime: '2026-10-14T15:00:00-04:00' }
          }
        ] as Ev[]
      },
      'calendar.holidays': {
        name: 'Holidays',
        features: 0,
        events: [
          { uid: 'ev-hall', summary: 'Halloween', start: { date: '2026-10-31' }, end: { date: '2026-11-01' } }
        ] as Ev[]
      }
    } as Record<string, { name: string; features: number; events: Ev[] }>,
    todos: {
      'todo.chores': {
        name: 'Chores',
        items: [
          { uid: 't-trash', summary: 'Take out the trash', status: 'needs_action' },
          { uid: 't-dog', summary: 'Feed the dog', status: 'completed' }
        ]
      }
    } as Record<string, { name: string; items: { uid: string; summary: string; status: string }[] }>,
    calls: [] as string[]
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------------------- //
// | A small websocket server (text frames only) | //
// ------------------------------------------------- //
function wsAccept(req: http.IncomingMessage, sock: Duplex, onText: (text: string, send: (o: unknown) => void) => void) {
  const key = String(req.headers['sec-websocket-key'] || '');
  const accept = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  sock.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  const send = (o: unknown) => {
    const data = Buffer.from(JSON.stringify(o));
    const head =
      data.length < 126
        ? Buffer.from([0x81, data.length])
        : Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
    sock.write(Buffer.concat([head, data]));
  };
  let buf = Buffer.alloc(0);
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15;
      let len = buf[1] & 127,
        off = 2;
      if (len === 126) {
        len = buf.readUInt16BE(2);
        off = 4;
      }
      const masked = buf[1] & 128;
      const total = off + (masked ? 4 : 0) + len;
      if (buf.length < total) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const payload = Buffer.from(buf.subarray(off + (masked ? 4 : 0), total));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.subarray(total);
      if (op === 8) return sock.end();
      if (op === 1) onText(payload.toString('utf8'), send);
    }
  });
  sock.on('error', () => {});
  send({ type: 'auth_required' });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------- //
// | The pretend Home Assistant | //
// ---------------------------- //
export function start(port: number) {
  let st = freshState();
  const authed = (h: string | undefined) => h === `Bearer ${TOKEN}`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const json = (code: number, o: unknown) =>
      res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
    if (!authed(req.headers.authorization)) return json(401, { message: 'Unauthorized' });
    if (url.pathname === '/api/states') {
      return json(200, [
        ...Object.entries(st.calendars).map(([id, c]) => ({
          entity_id: id,
          state: 'off',
          attributes: { friendly_name: c.name, supported_features: c.features }
        })),
        ...Object.entries(st.todos).map(([id, t]) => ({
          entity_id: id,
          state: String(t.items.filter(i => i.status === 'needs_action').length),
          attributes: { friendly_name: t.name }
        })),
        { entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen' } }
      ]);
    }
    const cal = /^\/api\/calendars\/(calendar\.[a-z_]+)$/.exec(url.pathname);
    if (cal) {
      const c = st.calendars[cal[1]];
      if (!c) return json(404, { message: 'Entity not found' });
      const s = String(url.searchParams.get('start')),
        e = String(url.searchParams.get('end'));
      const t = (x: { date?: string; dateTime?: string }) => new Date(x.dateTime || x.date + 'T00:00:00').getTime();
      return json(
        200,
        c.events.filter(ev => t(ev.start) < new Date(e).getTime() && t(ev.end) > new Date(s).getTime())
      );
    }
    if (url.pathname === '/api/services/todo/update_item' && req.method === 'POST') {
      let body = '';
      req.on('data', d => (body += d));
      req.on('end', () => {
        const b = JSON.parse(body || '{}');
        const item = st.todos[b.entity_id]?.items.find(i => i.uid === b.item);
        if (!item) return json(400, { message: 'Unable to find to-do list item' });
        item.status = b.status;
        st.calls.push(`todo ${b.entity_id} ${b.item} ${b.status}`);
        json(200, []);
      });
      return;
    }
    json(404, { message: 'Not found' });
  });
  server.on('upgrade', (req, sock) => {
    if (req.url !== '/api/websocket') return sock.destroy();
    let ok = false;
    wsAccept(req, sock, (text, send) => {
      const m = JSON.parse(text);
      if (m.type === 'auth') {
        ok = m.access_token === TOKEN;
        return send({ type: ok ? 'auth_ok' : 'auth_invalid' });
      }
      if (!ok) return;
      const reply = (result: unknown) => send({ id: m.id, type: 'result', success: true, result });
      const fail = (message: string) =>
        send({ id: m.id, type: 'result', success: false, error: { code: 'x', message } });
      const c = st.calendars[m.entity_id];
      if (m.type === 'config/auth/list') return reply(st.people);
      if (m.type === 'todo/item/list') return reply({ items: st.todos[m.entity_id]?.items || [] });
      if (m.type === 'calendar/event/create') {
        if (!c || !(c.features & 1)) return fail('Calendar does not support event creation');
        const ev = { uid: 'new-' + (c.events.length + 1), summary: m.event.summary } as Ev;
        ev.start = /T/.test(m.event.dtstart) ? { dateTime: m.event.dtstart } : { date: m.event.dtstart };
        ev.end = /T/.test(m.event.dtend) ? { dateTime: m.event.dtend } : { date: m.event.dtend };
        c.events.push(ev);
        st.calls.push(`create ${m.entity_id} ${m.event.summary}`);
        return reply(null);
      }
      if (m.type === 'calendar/event/update') {
        if (!c || !(c.features & 4)) return fail('Calendar does not support event update');
        const ev = c.events.find(x => x.uid === m.uid);
        if (!ev) return fail('Event not found');
        ev.summary = m.event.summary;
        ev.start = /T/.test(m.event.dtstart) ? { dateTime: m.event.dtstart } : { date: m.event.dtstart };
        ev.end = /T/.test(m.event.dtend) ? { dateTime: m.event.dtend } : { date: m.event.dtend };
        st.calls.push(`update ${m.entity_id} ${m.uid} ${m.event.summary}`);
        return reply(null);
      }
      if (m.type === 'calendar/event/delete') {
        if (!c || !(c.features & 2)) return fail('Calendar does not support event deletion');
        c.events = c.events.filter(x => x.uid !== m.uid);
        st.calls.push(`delete ${m.entity_id} ${m.uid}`);
        return reply(null);
      }
      fail('Unknown command');
    });
  });
  return new Promise<{ server: http.Server; state: () => ReturnType<typeof freshState>; reset: () => void }>(done =>
    server.listen(port, '127.0.0.1', () =>
      done({
        server,
        state: () => st,
        reset: () => {
          st = freshState();
        }
      })
    )
  );
}
