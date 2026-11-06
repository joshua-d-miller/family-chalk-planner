// Stand-in for an iCloud shared album (the CloudKit calls the board makes), for tests and local development.
// Usage: (await import('./mock-album.ts')).start(port) or  node test/mock-album.ts [port]
import http from 'node:http';
// a tiny valid JPEG (1x1) for every photo
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=',
  'base64'
);
function records(base, opts: { drop?: string } = {}) {
  const asset = (n, w, h, date, extra: { video?: unknown; hidden?: unknown } = {}) => [
    {
      recordName: 'M' + n,
      recordType: 'CPLMaster',
      fields: {
        itemType: { value: extra.video ? 'com.apple.quicktime-movie' : 'public.heic' },
        resJPEGMedRes: { type: 'ASSETID', value: { fileChecksum: 'ck' + n, downloadURL: `${base}/img/${n}/\${f}` } },
        resJPEGMedWidth: { value: w },
        resJPEGMedHeight: { value: h }
      }
    },
    {
      recordName: 'A' + n,
      recordType: 'CPLAsset',
      fields: {
        masterRef: { type: 'REFERENCE', value: { recordName: 'M' + n } },
        assetDate: { value: date },
        isHidden: { value: extra.hidden ? 1 : 0 },
        trashReason: { value: 0 }
      }
    }
  ];
  let r = [].concat(
    asset('a', 2048, 1536, 1719072959548),
    asset('b', 1536, 2048, 1791000000000),
    asset('c', 2048, 1536, 1729400000000),
    asset('v', 1920, 1080, 1700000000000, { video: 1 }),
    asset('h', 1920, 1080, 1700000000000, { hidden: 1 })
  );
  if (opts.drop) r = r.filter(x => !x.recordName.endsWith(opts.drop));
  return r;
}
function start(port = 5300, opts: { drop?: string } = {}): Promise<import('node:http').Server> {
  const base = `http://127.0.0.1:${port}`;
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', d => (body += d));
    req.on('end', () => {
      if (req.url.includes('/public/records/resolve'))
        return res.end(
          JSON.stringify({
            results: [
              {
                zoneID: { zoneName: 'Z', ownerRecordName: '_o' },
                anonymousPublicAccess: { token: 'tok', databasePartition: base }
              }
            ]
          })
        );
      if (req.url.includes('/shared/changes/zone')) {
        const all = records(base, opts),
          half = Math.ceil(all.length / 2),
          page = JSON.parse(body).zones[0].syncToken ? 1 : 0; // two pages, like a real album
        return res.end(
          JSON.stringify({
            zones: [
              { records: page ? all.slice(half) : all.slice(0, half), syncToken: 's' + (page + 1), moreComing: !page }
            ]
          })
        );
      }
      if (/^\/img\/\w\//.test(req.url)) {
        res.setHeader('Content-Type', 'image/jpeg');
        return res.end(JPEG);
      }
      res.statusCode = 404;
      res.end();
    });
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}
export { start };
if (process.argv[1] === import.meta.filename)
  start(+process.argv[2] || 5300).then(() => console.log('mock album on', +process.argv[2] || 5300));
