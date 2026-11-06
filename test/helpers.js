// Shared test helpers: create the first admin with the setup code (password + authenticator code),
// and send requests with a given set of cookies.
const fs = require('node:fs');
const path = require('node:path');
const { totpAt } = require('../server/access/secrets.ts');
const totpNow = (secret, offset = 0) => totpAt(secret.replace(/\s/g, ''), Math.floor(Date.now() / 30000) + offset);
const cookiesOf = r =>
  (r.headers.getSetCookie ? r.headers.getSetCookie() : [])
    .map(c => c.split(';')[0])
    .filter(c => !/=$/.test(c))
    .join('; ');
async function waitFile(f) {
  for (let i = 0; i < 50 && !fs.existsSync(f); i++) await new Promise(r => setTimeout(r, 100));
}
const H = { 'Content-Type': 'application/json', 'X-Chalk': '1' };
// returns { cookie, secret, username, password }
async function makeAdmin(base, dataDir, username = 'admin', password = 'correct horse battery') {
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
async function pairAdmin(base, dataDir) {
  return (await makeAdmin(base, dataDir)).cookie;
}
// Requests to the board with given cookies - adds the X-Chalk header on changes, like the page does
function client(base, getCookie) {
  const api = (p, opts = {}) => {
    const h = { ...(opts.headers || {}) },
      c = typeof getCookie === 'function' ? getCookie() : getCookie;
    if (c) h.cookie = c;
    if (opts.method && opts.method !== 'GET') h['X-Chalk'] = '1';
    return fetch(base + p, { ...opts, headers: h });
  };
  const post = (p, body) =>
    api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { api, post };
}
module.exports = { makeAdmin, pairAdmin, client, totpNow, cookiesOf };
