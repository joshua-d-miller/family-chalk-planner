/*
===============================================================================
 Family Chalk Planner | Tests | real-homeassistant | setup-homeassistant.ts
===============================================================================
 Version:   1.0.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-14
 Updated:   2026-11-14

 Purpose:
     Sets up a brand-new Home Assistant the way a family would, through
     its own API: onboarding (the owner, Alex), a second person who isn't
     an admin (Sam), a Local Calendar and a Local To-do list with a few
     things on them, and a long-lived token for the board (in the app,
     the Supervisor's token plays that part).

 Used by:
     test/real-homeassistant/homeassistant.spec.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.0.0     2026-11-14   joshua    New file.
                        claude
===============================================================================
*/

export interface HaSetup {
  token: string; // the board's (long-lived)
  access: { access_token: string; refresh_token: string; expires_in: number }; // Alex in the browser
  clientId: string;
  alex: string; // user ids
  sam: string;
}

const PASSWORD = 'chalk-test-password-1';

export async function waitForHomeAssistant(url: string, seconds = 240) {
  for (let i = 0; i < seconds; i++) {
    try {
      if ((await fetch(url + '/api/onboarding')).ok) return;
    } catch {
      /* still starting */
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Home Assistant didn't start at ${url}`);
}

// one websocket command, signed in with a token
export function ws<T>(url: string, token: string, msg: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = new WebSocket(url.replace(/^http/, 'ws') + '/api/websocket');
    const t = setTimeout(() => reject(new Error('no answer to ' + msg.type)), 30000);
    s.onmessage = ev => {
      const m = JSON.parse(String(ev.data));
      if (m.type === 'auth_required') s.send(JSON.stringify({ type: 'auth', access_token: token }));
      else if (m.type === 'auth_ok') s.send(JSON.stringify({ id: 1, ...msg }));
      else if (m.type === 'auth_invalid') reject(new Error('token refused'));
      else if (m.type === 'result') {
        clearTimeout(t);
        s.close();
        if (m.success) resolve(m.result as T);
        else reject(new Error(`${msg.type}: ${m.error?.message}`));
      }
    };
    s.onerror = () => reject(new Error('websocket error'));
  });
}

async function json<T>(r: Response, what: string): Promise<T> {
  if (!r.ok) throw new Error(`${what}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

// add an integration the way Settings → Add integration does, answering its form
async function addIntegration(url: string, token: string, handler: string, name: string) {
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  type Step = {
    type: string;
    flow_id: string;
    data_schema?: {
      name: string;
      selector?: { select?: { options: (string | { value: string })[] } };
      type?: string;
    }[];
  };
  let step = await json<Step>(
    await fetch(url + '/api/config/config_entries/flow', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ handler, show_advanced_options: false })
    }),
    'start ' + handler
  );
  for (let i = 0; i < 4 && step.type === 'form'; i++) {
    const data: Record<string, unknown> = {};
    for (const f of step.data_schema || []) {
      const opts = f.selector?.select?.options?.map(o => (typeof o === 'string' ? o : o.value));
      if (opts?.length) data[f.name] = opts.find(o => /empty|create/i.test(o)) || opts[0];
      else if (f.type === 'boolean' || (f.selector && 'boolean' in f.selector)) data[f.name] = false;
      else if (/name/i.test(f.name)) data[f.name] = name;
    }
    step = await json<Step>(
      await fetch(url + '/api/config/config_entries/flow/' + step.flow_id, {
        method: 'POST',
        headers: H,
        body: JSON.stringify(data)
      }),
      'answer ' + handler
    );
  }
  if (step.type !== 'create_entry') throw new Error(`${handler}: ended with ${JSON.stringify(step)}`);
}

export async function setUpHomeAssistant(url: string, clientId: string): Promise<HaSetup> {
  await waitForHomeAssistant(url);
  // the owner, as the first screen of onboarding makes them
  const { auth_code } = await json<{ auth_code: string }>(
    await fetch(url + '/api/onboarding/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, name: 'Alex', username: 'alex', password: PASSWORD, language: 'en' })
    }),
    'onboarding'
  );
  const access = await json<HaSetup['access']>(
    await fetch(url + '/auth/token', {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code: auth_code, client_id: clientId })
    }),
    'token'
  );
  const A = { Authorization: `Bearer ${access.access_token}`, 'Content-Type': 'application/json' };
  // the rest of onboarding, so Home Assistant opens normally in the browser
  for (const [p, body] of [
    ['core_config', {}],
    ['analytics', {}],
    ['integration', { client_id: clientId, redirect_uri: clientId + '?auth_callback=1' }]
  ] as const)
    await fetch(url + '/api/onboarding/' + p, { method: 'POST', headers: A, body: JSON.stringify(body) });

  const token = await ws<string>(url, access.access_token, {
    type: 'auth/long_lived_access_token',
    client_name: 'Family Chalk Planner tests',
    lifespan: 30
  });
  const users = await ws<{ id: string; name: string }[]>(url, token, { type: 'config/auth/list' });
  const alex = users.find(u => u.name === 'Alex')!.id;
  // a second person who isn't an admin
  const { user } = await ws<{ user: { id: string } }>(url, token, {
    type: 'config/auth/create',
    name: 'Sam',
    group_ids: ['system-users'],
    local_only: false
  });
  await ws(url, token, {
    type: 'config/auth_provider/homeassistant/create',
    user_id: user.id,
    username: 'sam',
    password: PASSWORD
  });

  await addIntegration(url, token, 'local_calendar', 'Family');
  await addIntegration(url, token, 'local_todo', 'Chores');
  const T = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  for (let i = 0; i < 30; i++) {
    const st = await json<{ entity_id: string }[]>(await fetch(url + '/api/states', { headers: T }), 'states');
    if (st.some(s => s.entity_id === 'calendar.family') && st.some(s => s.entity_id === 'todo.chores')) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  const service = async (domain: string, action: string, body: unknown) =>
    json(
      await fetch(`${url}/api/services/${domain}/${action}`, {
        method: 'POST',
        headers: T,
        body: JSON.stringify(body)
      }),
      `${domain}.${action}`
    );
  await service('calendar', 'create_event', {
    entity_id: 'calendar.family',
    summary: 'Soccer',
    start_date_time: '2026-10-10 09:00:00',
    end_date_time: '2026-10-10 10:30:00'
  });
  await service('calendar', 'create_event', {
    entity_id: 'calendar.family',
    summary: 'Field trip',
    start_date: '2026-10-16',
    end_date: '2026-10-17'
  });
  await service('todo', 'add_item', { entity_id: 'todo.chores', item: 'Take out the trash' });
  await service('todo', 'add_item', { entity_id: 'todo.chores', item: 'Feed the dog' });
  return { token, access, clientId, alex, sam: user.id };
}
