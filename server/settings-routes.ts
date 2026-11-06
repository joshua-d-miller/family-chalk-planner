// Admin console → ⚙️ Board: the settings that used to need .env (the fields are in settings.ts).
// Saving restarts the board (a few seconds) so everything picks the new values up; screens reconnect.
import type { Express, Request } from 'express';
import { caldavCalendars } from './calendar/source.ts';

export function registerSettingsRoutes(
  app: Express,
  {
    settings,
    env,
    version,
    problems,
    proxySeen,
    keyInfo,
    audit
  }: {
    settings: { view: () => Record<string, unknown>; save: (v: unknown) => { errors?: unknown; changed: string[] } };
    env: NodeJS.ProcessEnv;
    version: string;
    problems: () => Record<string, string>; // what's wrong (calendar, fonts), shown at the top
    proxySeen: () => unknown;
    keyInfo: () => unknown;
    audit: (req: Request, what: string, info: Record<string, string>) => void;
  }
) {
  function restartSoon(why: string) {
    // the service manager starts it again
    setTimeout(() => {
      console.log(`Chalk Planner: restarting to apply ${why}`);
      process.exit(3);
    }, 400);
  }

  app.get('/api/board-settings', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      ...settings.view(),
      version,
      problems: problems(),
      proxySeen: proxySeen(),
      key: keyInfo(),
      here: `${req.protocol}://${req.get('host')}`,
      timezones: typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
    });
  });

  app.post('/api/board-settings', (req, res) => {
    const r = settings.save((req.body || {}).values);
    if (r.errors) return res.status(400).json({ error: 'Some settings need fixing', errors: r.errors });
    if (!r.changed.length) return res.json({ ok: true, restarting: false });
    audit(req, 'settings.changed', { target: 'board settings', detail: r.changed.join(', ') }); // names only, never values
    res.json({ ok: true, restarting: true, changed: r.changed });
    restartSoon('new settings');
  });

  // "Find my calendars": try a CalDAV account and list its calendars (the password may be the saved one)
  app.post('/api/board-settings/caldav-test', async (req, res) => {
    const b = req.body || {};
    const url = String(b.url || env.CALDAV_URL || 'https://caldav.icloud.com/').trim();
    const user = String(b.user ?? env.CALDAV_USER ?? '').trim();
    const pass = b.password ? String(b.password) : env.CALDAV_PASSWORD || env.ICLOUD_APP_PASSWORD || '';
    try {
      if (!/^https?:$/.test(new URL(url).protocol)) throw new Error('not http');
    } catch {
      return res.status(400).json({ error: 'The server address should start with https://' });
    }
    if (!user || !pass) return res.status(400).json({ error: 'Enter the username and password first' });
    try {
      const cals = await caldavCalendars(url, 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'));
      res.json({ calendars: cals.map(c => c.name), list: cals });
    } catch (e) {
      const err = e as Error;
      res.status(400).json({ error: err.name === 'TimeoutError' ? 'The calendar server didn’t answer' : err.message });
    }
  });

  // Weather location: search a town (Open-Meteo geocoding, no account)
  app.get('/api/board-settings/geocode', async (req, res) => {
    const q = String(req.query.q || '')
      .trim()
      .slice(0, 80);
    if (q.length < 2) return res.json({ places: [] });
    try {
      const r = await fetch(
        `${env.GEOCODE_URL || 'https://geocoding-api.open-meteo.com'}/v1/search?count=6&language=en&format=json&name=${encodeURIComponent(q)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      const j = (await r.json()) as {
        results?: {
          name: string;
          admin1?: string;
          country?: string;
          latitude: number;
          longitude: number;
          timezone?: string;
        }[];
      };
      res.json({
        places: (j.results || []).map(p => ({
          name: [p.name, p.admin1, p.country].filter(Boolean).join(', '),
          lat: Math.round(p.latitude * 1e4) / 1e4,
          lon: Math.round(p.longitude * 1e4) / 1e4,
          timezone: p.timezone || null
        }))
      });
    } catch {
      res.status(502).json({ error: 'Couldn’t search right now - you can type the latitude and longitude instead' });
    }
  });
}
