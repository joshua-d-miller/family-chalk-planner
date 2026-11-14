/*
===============================================================================
 Family Chalk Planner | Server | homeassistant.ts
===============================================================================
 Version:   1.0.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Talking to Home Assistant, when the board runs as its app: who its
     people are (and which are admins), its calendars and their events
     (read, add, change, delete), and its to-do lists. Everything goes
     through the Supervisor's proxy with the app's own token
     (SUPERVISOR_TOKEN, given to the app because its config.yaml asks for
     homeassistant_api), so the board never holds anyone's password.
 How it fits:
     REST for reading (http://supervisor/core/api); the websocket API
     (ws://supervisor/core/websocket) for what REST doesn't offer: the list
     of people, and changing or deleting a calendar event. The tests point
     both at test/mock-homeassistant.ts (HA_API_URL, HA_WS_URL).
 Used by:
     server/main.ts, server/access/access.ts, server/calendar/source.ts,
     server/chores.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.0.0     2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
export interface HaPerson {
  id: string;
  name: string;
  admin: boolean;
}
export interface HaCalendar {
  id: string; // calendar.family
  name: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}
// one event as Home Assistant's REST API gives it
export interface HaEvent {
  summary: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  uid?: string | null;
  recurrence_id?: string | null;
  rrule?: string | null;
  description?: string | null;
  location?: string | null;
}
// an event to add or change: all day (dtstart/dtend as YYYY-MM-DD, the end the day after) or timed (ISO)
export interface HaEventIn {
  summary: string;
  dtstart: string;
  dtend: string;
}
export interface HaTodoList {
  id: string; // todo.chores
  name: string;
}
export interface HaTodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  due?: string | null;
}

// calendar entity features (Home Assistant's CalendarEntityFeature)
const CREATE = 1,
  DELETE = 2,
  UPDATE = 4;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------- //
// | Home Assistant, through the proxy | //
// ------------------------------------- //
export function makeHomeAssistant({
  token,
  api = 'http://supervisor/core/api',
  ws = 'ws://supervisor/core/websocket'
}: {
  token: string;
  api?: string;
  ws?: string;
}) {
  // ---------- //
  // | REST | //
  // ---------- //
  async function rest<T>(p: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const r = await fetch(api + p, {
      method: init.method || 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20000)
    });
    if (r.status === 401) throw new Error('Home Assistant didn’t accept the app’s token');
    if (!r.ok)
      throw new Error(`Home Assistant answered ${r.status}${p.startsWith('/calendars/') ? ' for that calendar' : ''}`);
    return (await r.json()) as T;
  }

  // -------------------------------------------- //
  // | The websocket API, one command at a time | //
  // -------------------------------------------- //
  // A fresh connection per command: the board asks rarely (the people list  //
  // every few minutes, a change when someone makes one), so there's no      //
  // connection to keep alive or reopen.                                     //
  function command<T>(msg: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      let sock: WebSocket;
      try {
        sock = new WebSocket(ws);
      } catch (e) {
        return reject(e);
      }
      const done = (fn: () => void) => {
        clearTimeout(timer);
        try {
          sock.close();
        } catch {
          /* already closed */
        }
        fn();
      };
      const timer = setTimeout(() => done(() => reject(new Error('Home Assistant didn’t answer'))), 20000);
      sock.onerror = () => done(() => reject(new Error('Couldn’t reach Home Assistant')));
      sock.onmessage = ev => {
        let m: { type: string; success?: boolean; result?: T; error?: { message?: string } };
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.type === 'auth_required') sock.send(JSON.stringify({ type: 'auth', access_token: token }));
        else if (m.type === 'auth_invalid')
          done(() => reject(new Error('Home Assistant didn’t accept the app’s token')));
        else if (m.type === 'auth_ok') sock.send(JSON.stringify({ id: 1, ...msg }));
        else if (m.type === 'result')
          done(() =>
            m.success ? resolve(m.result as T) : reject(new Error(m.error?.message || 'Home Assistant refused that'))
          );
      };
    });
  }

  // ------------ //
  // | People | //
  // ------------ //
  // Home Assistant's own people (not its system users), and which are       //
  // admins. Kept for five minutes; asked again sooner for someone new.      //
  let people: { at: number; list: HaPerson[] } | null = null;
  async function listPeople(fresh = false): Promise<HaPerson[]> {
    if (!fresh && people && Date.now() - people.at < 5 * 60e3) return people.list;
    const raw = await command<
      {
        id: string;
        name: string;
        username?: string;
        system_generated?: boolean;
        group_ids?: string[];
        is_owner?: boolean;
      }[]
    >({ type: 'config/auth/list' });
    const list = raw
      .filter(u => !u.system_generated)
      .map(u => ({
        id: u.id,
        name: u.name || u.username || 'Someone',
        admin: !!u.is_owner || (u.group_ids || []).includes('system-admin')
      }));
    people = { at: Date.now(), list };
    return list;
  }
  async function person(id: string): Promise<HaPerson | null> {
    let p = (await listPeople()).find(x => x.id === id);
    if (!p) p = (await listPeople(true)).find(x => x.id === id);
    return p || null;
  }

  // ------------- //
  // | Calendars | //
  // ------------- //
  async function calendars(): Promise<HaCalendar[]> {
    const states =
      await rest<{ entity_id: string; attributes?: { friendly_name?: string; supported_features?: number } }[]>(
        '/states'
      );
    return states
      .filter(s => s.entity_id.startsWith('calendar.'))
      .map(s => {
        const f = Number(s.attributes?.supported_features || 0);
        return {
          id: s.entity_id,
          name: s.attributes?.friendly_name || s.entity_id,
          canCreate: !!(f & CREATE),
          canUpdate: !!(f & UPDATE),
          canDelete: !!(f & DELETE)
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  const events = (entity: string, start: Date, end: Date) =>
    rest<HaEvent[]>(
      `/calendars/${encodeURIComponent(entity)}?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`
    );
  const createEvent = (entity: string, event: HaEventIn) =>
    command({ type: 'calendar/event/create', entity_id: entity, event });
  const updateEvent = (entity: string, uid: string, rid: string | null, event: HaEventIn) =>
    command({
      type: 'calendar/event/update',
      entity_id: entity,
      uid,
      ...(rid ? { recurrence_id: rid } : {}),
      event
    });
  const deleteEvent = (entity: string, uid: string, rid: string | null) =>
    command({ type: 'calendar/event/delete', entity_id: entity, uid, ...(rid ? { recurrence_id: rid } : {}) });

  // ------------------ //
  // | To-do lists | //
  // ------------------ //
  async function todoLists(): Promise<HaTodoList[]> {
    const states = await rest<{ entity_id: string; attributes?: { friendly_name?: string } }[]>('/states');
    return states
      .filter(s => s.entity_id.startsWith('todo.'))
      .map(s => ({ id: s.entity_id, name: s.attributes?.friendly_name || s.entity_id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async function todoItems(entity: string): Promise<HaTodoItem[]> {
    const r = await command<{ items: HaTodoItem[] }>({ type: 'todo/item/list', entity_id: entity });
    return r.items || [];
  }
  const setTodo = (entity: string, uid: string, done: boolean) =>
    rest('/services/todo/update_item', {
      method: 'POST',
      body: { entity_id: entity, item: uid, status: done ? 'completed' : 'needs_action' }
    });

  return {
    listPeople,
    person,
    calendars,
    events,
    createEvent,
    updateEvent,
    deleteEvent,
    todoLists,
    todoItems,
    setTodo
  };
}
export type HomeAssistant = ReturnType<typeof makeHomeAssistant>;
