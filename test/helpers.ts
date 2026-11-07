/*
===============================================================================
 Family Chalk Planner | Tests | helpers.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Colby Way, Claude
 Updated:   2026-11-07

 Purpose:
     Shared test helpers: create the first admin with the setup code
     (password + authenticator code), and send requests with a given set
     of cookies.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.3.0     2026-10-13   joshua    Admin console, paired screens, sign-in with
                        claude    passkeys or password + authenticator.

 0.13.0    2026-11-07   joshua    Move access (screens, people, sign-in,
                        claude    passkeys, security) to TypeScript.
                        colby
                                  Server and tests are all TypeScript (ES
                                  modules).

                                  Database migrations; chores, meals and jars
                                  in their own tables.
===============================================================================
*/

import fs from 'node:fs';
import path from 'node:path';
import { totpAt } from '../server/access/secrets.ts';
const totpNow = (secret: string, offset = 0) =>
  totpAt(secret.replace(/\s/g, ''), Math.floor(Date.now() / 30000) + offset);
const cookiesOf = (r: Response) =>
  (r.headers.getSetCookie ? r.headers.getSetCookie() : [])
    .map(c => c.split(';')[0])
    .filter(c => !/=$/.test(c))
    .join('; ');
async function waitFile(f: string) {
  for (let i = 0; i < 50 && !fs.existsSync(f); i++) await new Promise(r => setTimeout(r, 100));
}
const H = { 'Content-Type': 'application/json', 'X-Chalk': '1' };
// returns { cookie, secret, username, password }
async function makeAdmin(base: string, dataDir: string, username = 'admin', password = 'correct horse battery') {
  const f = path.join(dataDir, 'setup-code.txt');
  await waitFile(f);
  const code = fs.readFileSync(f, 'utf8').trim();
  const s1 = await fetch(base + '/api/account/setup', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ code, username, name: 'Test Admin', password })
  });
  if (!s1.ok) throw new Error('setup failed: ' + (await s1.text()));
  const { enroll, secret } = await s1.json();
  const s2 = await fetch(base + '/api/account/enroll', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ enroll, code: totpNow(secret) })
  });
  if (!s2.ok) throw new Error('enroll failed: ' + (await s2.text()));
  return { cookie: cookiesOf(s2), secret: secret.replace(/\s/g, ''), username, password };
}
async function pairAdmin(base: string, dataDir: string) {
  return (await makeAdmin(base, dataDir)).cookie;
}
// Requests to the board with given cookies - adds the X-Chalk header on changes, like the page does
type Opts = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };
function client(base: string, getCookie?: string | null | (() => string | null | undefined)) {
  const api = (p: string, opts: Opts = {}) => {
    const h: Record<string, string> = { ...(opts.headers || {}) },
      c = typeof getCookie === 'function' ? getCookie() : getCookie;
    if (c) h.cookie = c;
    if (opts.method && opts.method !== 'GET') h['X-Chalk'] = '1';
    return fetch(base + p, { ...opts, headers: h });
  };
  const post = (p: string, body?: unknown) =>
    api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { api, post };
}
export { makeAdmin, pairAdmin, client, totpNow, cookiesOf };

// Start the board on a port with a data folder (made if not given); resolves once it answers.
// Returns the process, its output so far and a stop().
async function startServer(port: number, env: Record<string, string> = {}, dataDir?: string) {
  const { spawn } = await import('node:child_process');
  const os = await import('node:os');
  const data = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-'));
  const proc = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'server', 'chalkboard.js')], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      BIND: '127.0.0.1',
      DATA_DIR: data,
      TIMEZONE: 'America/New_York',
      ...env
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  proc.stdout.on('data', d => (out += d));
  proc.stderr.on('data', d => (out += d));
  const exited = new Promise<number | null>(r => proc.on('exit', code => r(code)));
  let up = false;
  for (let i = 0; i < 75 && proc.exitCode === null; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/today`)).ok) {
        up = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  return {
    data,
    up,
    exited,
    output: () => out,
    async stop() {
      if (proc.exitCode === null) {
        proc.kill();
        await exited;
      }
    }
  };
}
export { startServer };
