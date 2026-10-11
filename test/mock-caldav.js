// Minimal CalDAV stand-in shaped like iCloud's responses, for tests and local development.
// Usage: require('./mock-caldav').start(port) or  node test/mock-caldav.js [port]
const express = require('express');
const app = express();
app.use(express.text({ type: '*/*', limit: '2mb' }));
const TZ = `BEGIN:VTIMEZONE
TZID:America/New_York
BEGIN:DAYLIGHT
TZOFFSETFROM:-0500
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
DTSTART:20070311T020000
TZNAME:EDT
TZOFFSETTO:-0400
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0400
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
DTSTART:20071104T020000
TZNAME:EST
TZOFFSETTO:-0500
END:STANDARD
END:VTIMEZONE`;
const wrap = ev => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apple Inc.//iOS 18//EN\r\n${TZ}\r\n${ev}\r\nEND:VCALENDAR\r\n`.replace(/\r?\n/g, '\r\n');
const store = new Map(); let n = 1;
const put = (name, text) => store.set(name, { text, etag: `"e${n++}"` });
put('soccer.ics', wrap(`BEGIN:VEVENT
UID:soccer-uid
DTSTAMP:20260901T000000Z
DTSTART;TZID=America/New_York:20260905T090000
DTEND;TZID=America/New_York:20260905T103000
RRULE:FREQ=WEEKLY;BYDAY=SA
SUMMARY:Soccer
DESCRIPTION:Bring shin guards
BEGIN:VALARM
ACTION:DISPLAY
TRIGGER:-PT30M
DESCRIPTION:Reminder
END:VALARM
END:VEVENT`));
put('piano.ics', wrap(`BEGIN:VEVENT
UID:piano-uid
DTSTAMP:20260901T000000Z
DTSTART;TZID=America/New_York:20260901T160000
DTEND;TZID=America/New_York:20260901T164500
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE;TZID=America/New_York:20261020T160000
SUMMARY:Piano
END:VEVENT`));
put('dentist.ics', wrap(`BEGIN:VEVENT
UID:dentist-uid
DTSTAMP:20260901T000000Z
DTSTART;TZID=America/New_York:20261012T153000
DTEND;TZID=America/New_York:20261012T161500
SUMMARY:Dentist
END:VEVENT`));
put('fallbreak.ics', wrap(`BEGIN:VEVENT
UID:fall-uid
DTSTAMP:20260901T000000Z
DTSTART;VALUE=DATE:20261015
DTEND;VALUE=DATE:20261019
SUMMARY:Fall break
END:VEVENT`));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ms = body => `<?xml version="1.0" encoding="UTF-8"?>\n<multistatus xmlns="DAV:">${body}</multistatus>`;
app.use((req, res, next) => { req.method === 'PROPFIND' || req.method === 'REPORT' ? res.status(207).type('xml') : 0; next(); });
app.all('/', (req, res) => res.send(ms(`<response><href>/</href><propstat><prop><current-user-principal xmlns="DAV:"><href xmlns="DAV:">/1/principal/</href></current-user-principal></prop></propstat></response>`)));
app.all('/1/principal/', (req, res) => res.send(ms(`<response><href>/1/principal/</href><propstat><prop><calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href xmlns="DAV:">/1/calendars/</href></calendar-home-set></prop></propstat></response>`)));
app.all('/1/calendars/', (req, res) => res.send(ms(`<response><href>/1/calendars/</href><propstat><prop><displayname/></prop></propstat></response><response><href>/1/calendars/fam/</href><propstat><prop><displayname>Family</displayname></prop></propstat></response>`)));
app.all('/1/calendars/fam/', (req, res) => {
  res.send(ms([...store].map(([k, v]) => `<response><href>/1/calendars/fam/${k}</href><propstat><prop><getetag>${esc(v.etag)}</getetag><calendar-data xmlns="urn:ietf:params:xml:ns:caldav">${esc(v.text)}</calendar-data></prop><status>HTTP/1.1 200 OK</status></propstat></response>`).join('')));
});
app.all('/1/calendars/fam/:f', (req, res) => {
  const f = req.params.f, cur = store.get(f), im = req.get('if-match'), inm = req.get('if-none-match');
  if (req.method === 'GET') return cur ? res.set('ETag', cur.etag).type('text/calendar').send(cur.text) : res.sendStatus(404);
  if (im && (!cur || cur.etag !== im)) return res.sendStatus(412);
  if (inm === '*' && cur) return res.sendStatus(412);
  if (req.method === 'PUT') { put(f, req.body); return res.set('ETag', store.get(f).etag).sendStatus(cur ? 204 : 201); }
  if (req.method === 'DELETE') { if (!cur) return res.sendStatus(404); store.delete(f); return res.sendStatus(204); }
  res.sendStatus(405);
});
app.get('/__dump/:f', (req, res) => res.type('text').send((store.get(req.params.f) || {}).text || 'none'));
function start(port = 5232) { return new Promise(r => { const srv = app.listen(port, '127.0.0.1', () => r(srv)); }); }
module.exports = { start, store };
if (require.main === module) start(+process.argv[2] || 5232).then(() => console.log('mock CalDAV on', +process.argv[2] || 5232));
