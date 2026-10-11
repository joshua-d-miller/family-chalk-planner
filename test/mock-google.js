// Stand-in for Google's OAuth token endpoint, Calendar API (calendar list) and CalDAV
// (/caldav/v2/<calendarId>/events/), for tests. Every calendar call must carry a valid
// Bearer token; tokens expire quickly (expiresIn) so refreshing gets exercised.
// Usage: const g = await require('./mock-google').start(port, { expiresIn: 2 })
const http = require('http');
const crypto = require('crypto');

function start(port = 5994, opts = {}) {
  const expiresIn = opts.expiresIn || 3600;
  const state = { codes: new Set(['GOOD-CODE']), refresh: new Set(), access: new Map(), calls: [], events: new Map() };
  const cal = 'family@group.calendar.google.com';
  const ics = (uid, summary, start, end) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Google Inc//Google Calendar 70.9054//EN\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261001T000000Z\r\nDTSTART;VALUE=DATE:${start}\r\nDTEND;VALUE=DATE:${end}\r\nSUMMARY:${summary}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  let etag = 1;
  state.events.set('picnic.ics', { text: ics('picnic-uid', 'Google picnic', '20261017', '20261018'), etag: `"g${etag++}"` });
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const newToken = () => { const t = crypto.randomBytes(8).toString('hex'); state.access.set(t, Date.now() + expiresIn * 1000); return t; };
  const authed = req => { const t = (req.headers.authorization || '').replace(/^Bearer /, ''); return state.access.get(t) > Date.now(); };

  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', d => (body += d)); req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      state.calls.push(`${req.method} ${u.pathname}`);
      const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (u.pathname === '/token') {
        const f = new URLSearchParams(body);
        if (f.get('client_id') !== 'test-client' || f.get('client_secret') !== 'test-secret') return json(401, { error: 'invalid_client' });
        if (f.get('grant_type') === 'authorization_code') {
          if (!state.codes.has(f.get('code')) || !f.get('code_verifier')) return json(400, { error: 'invalid_grant' });
          state.codes.delete(f.get('code'));
          const r = 'refresh-' + crypto.randomBytes(4).toString('hex'); state.refresh.add(r);
          return json(200, { access_token: newToken(), expires_in: expiresIn, refresh_token: r, token_type: 'Bearer' });
        }
        if (f.get('grant_type') === 'refresh_token') {
          if (!state.refresh.has(f.get('refresh_token'))) return json(400, { error: 'invalid_grant' });
          return json(200, { access_token: newToken(), expires_in: expiresIn, token_type: 'Bearer' });
        }
        return json(400, { error: 'unsupported_grant_type' });
      }
      if (!authed(req)) return json(401, { error: { message: 'Request had invalid authentication credentials.' } });
      if (u.pathname === '/calendar/v3/users/me/calendarList') {
        return json(200, { items: [{ id: 'joe@example.com', summary: 'joe@example.com', primary: true }, { id: cal, summary: 'Family', backgroundColor: '#9fe1e7' }] });
      }
      const m = /^\/caldav\/v2\/([^/]+)\/events\/([^/]*)$/.exec(u.pathname);
      if (!m || decodeURIComponent(m[1]) !== cal) { res.statusCode = 404; return res.end(); }
      const file = m[2];
      if (!file && req.method === 'REPORT') {
        res.writeHead(207, { 'Content-Type': 'application/xml' });
        return res.end(`<?xml version="1.0" encoding="UTF-8"?><D:multistatus xmlns:D="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav">${[...state.events].map(([k, v]) =>
          `<D:response><D:href>/caldav/v2/${encodeURIComponent(cal)}/events/${k}</D:href><D:propstat><D:status>HTTP/1.1 200 OK</D:status><D:prop><D:getetag>${esc(v.etag)}</D:getetag><caldav:calendar-data>${esc(v.text)}</caldav:calendar-data></D:prop></D:propstat></D:response>`).join('')}</D:multistatus>`);
      }
      const cur = state.events.get(file);
      if (req.method === 'GET') { if (!cur) { res.statusCode = 404; return res.end(); } res.writeHead(200, { ETag: cur.etag, 'Content-Type': 'text/calendar' }); return res.end(cur.text); }
      if (req.headers['if-match'] && (!cur || cur.etag !== req.headers['if-match'])) { res.statusCode = 412; return res.end(); }
      if (req.method === 'PUT') { state.events.set(file, { text: body, etag: `"g${etag++}"` }); res.writeHead(cur ? 204 : 201, { ETag: state.events.get(file).etag }); return res.end(); }
      if (req.method === 'DELETE') { if (!cur) { res.statusCode = 404; return res.end(); } state.events.delete(file); res.statusCode = 204; return res.end(); }
      res.statusCode = 405; res.end();
    });
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => { srv.state = state; r(srv); }));
}
module.exports = { start };
