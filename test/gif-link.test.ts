/*
===============================================================================
 Family Chalk Planner | Tests | gif-link.test.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Updated:   2026-11-06

 Purpose:
     "Add from link": the board downloads a GIF (or the GIF a page shares)
     once and keeps it. It must never fetch anything on the local network
     unless told to (tests only).
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    Server and tests are all TypeScript (ES
                        claude    modules).
===============================================================================
*/

import test from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeAdmin, client } from './helpers.ts';

const SITE = 5994,
  OPEN = 3994,
  SAFE = 3995;
const GIF = Buffer.concat([
  Buffer.from('GIF89a'),
  Buffer.from([
    1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255, 0x21, 0xf9, 4, 0, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2,
    0x44, 1, 0, 0x3b
  ])
]);
let site;
const boards = [],
  dirs = [];

function startBoard(port, extra) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fcp-link-'));
  dirs.push(data);
  const p = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'server', 'chalkboard.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      BIND: '127.0.0.1',
      DATA_DIR: data,
      TIMEZONE: 'America/New_York',
      ...extra
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  boards.push(p);
  return data;
}
async function ready(base) {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + '/api/whoami')).ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
}

let open, safe;
test.before(async () => {
  site = http
    .createServer((req, res) => {
      req.url = req.url.split('?')[0];
      if (req.url === '/a.gif') return res.writeHead(200, { 'Content-Type': 'image/gif' }).end(GIF);
      if (req.url === '/moved') return res.writeHead(302, { Location: '/a.gif' }).end();
      if (req.url === '/page')
        return res
          .writeHead(200, { 'Content-Type': 'text/html' })
          .end(
            `<html><head><meta property="og:image" content="http://127.0.0.1:${SITE}/a.gif?x=1&amp;y=2"></head></html>`
          );
      if (req.url === '/nothing')
        return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><p>hi</p></html>');
      if (req.url === '/big') {
        res.writeHead(200, { 'Content-Type': 'image/gif' });
        res.write(GIF);
        res.end(Buffer.alloc(11 * 1024 * 1024));
        return;
      }
      res.writeHead(404).end();
    })
    .listen(SITE, '127.0.0.1');
  const d1 = startBoard(OPEN, { ALLOW_PRIVATE_LINKS: '1' }),
    d2 = startBoard(SAFE, {});
  await ready(`http://127.0.0.1:${OPEN}`);
  await ready(`http://127.0.0.1:${SAFE}`);
  open = client(`http://127.0.0.1:${OPEN}`, (await makeAdmin(`http://127.0.0.1:${OPEN}`, d1)).cookie);
  safe = client(`http://127.0.0.1:${SAFE}`, (await makeAdmin(`http://127.0.0.1:${SAFE}`, d2)).cookie);
});
test.after(() => {
  boards.forEach(b => b.kill());
  site && site.close();
  dirs.forEach(d => fs.rmSync(d, { recursive: true, force: true }));
});

test('a GIF link, a redirect and a page that shares a GIF are saved on the board', async () => {
  for (const u of ['/a.gif', '/moved', '/page']) {
    const r = await open.post('/api/media/fromlink', { url: `http://127.0.0.1:${SITE}${u}` });
    assert.equal(r.status, 200, u);
    const { src } = await r.json();
    assert.match(src, /^\/api\/media\/[a-z0-9]{16}\.gif$/);
    const img = await open.api(src);
    assert.equal(img.status, 200);
    assert.ok(Buffer.from(await img.arrayBuffer()).equals(GIF), 'the board serves its own copy');
  }
});

test('bad links get a clear answer', async () => {
  const err = async u => {
    const r = await open.post('/api/media/fromlink', { url: u });
    assert.equal(r.status, 400, u);
    return (await r.json()).error;
  };
  assert.match(await err(`http://127.0.0.1:${SITE}/nothing`), /No GIF found/);
  assert.match(await err(`http://127.0.0.1:${SITE}/big`), /10 MB/);
  assert.match(await err(`http://127.0.0.1:${SITE}/missing`), /404/);
  assert.match(await err('file:///etc/passwd'), /http/);
  assert.match(await err('not a link'), /isn’t a link/);
});

test('never fetches the local network (no SSRF)', async () => {
  for (const u of [
    `http://127.0.0.1:${SITE}/a.gif`,
    'http://localhost/a.gif',
    'http://10.0.0.1/a.gif',
    'http://192.168.1.1/a.gif',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/a.gif',
    'http://0.0.0.0/'
  ]) {
    const r = await safe.post('/api/media/fromlink', { url: u });
    assert.equal(r.status, 400, u);
    assert.match((await r.json()).error, /private network|normal web links/, u);
  }
});

test('only signed-in editors can add from a link', async () => {
  const r = await fetch(`http://127.0.0.1:${SAFE}/api/media/fromlink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Chalk': '1' },
    body: '{"url":"https://example.com/a.gif"}'
  });
  assert.equal(r.status, 401);
});
