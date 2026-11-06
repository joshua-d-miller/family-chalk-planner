// Google Calendar: Google's CalDAV, with a Google sign-in (OAuth with PKCE) instead of a password.
// The refresh token and the chosen calendar live in DATA_DIR/google-auth.json (mode 600).
//
// By default Google sends the browser to http://localhost (nothing there) and the address is pasted back
// into ⚙️, so it works without HTTPS. With GOOGLE_REDIRECT_URI=https://<board>/oauth/google/callback it
// completes by itself.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';

export interface GoogleConfig {
  id: string; // client ID and secret: from the family's own Google Cloud project (docs/google-calendar.md)
  secret: string;
  redirect: string;
  auth: string; // Google's addresses (changed only by the tests)
  token: string;
  api: string;
  dav: string;
}

interface Stored {
  refresh?: string | null;
  calendarId?: string | null;
  calendarName?: string | null;
  problem?: string; // why the sign-in stopped working
  at?: number;
}
interface TokenReply {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

export function createGoogle(config: GoogleConfig, dataDir: string) {
  const file = path.join(dataDir, 'google-auth.json');
  let access: { token: string; exp: number } | null = null;

  function load(): Stored {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  }
  function save(o: Stored) {
    fs.writeFileSync(file, JSON.stringify(o), { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  }

  async function tokenRequest(params: Record<string, string>) {
    const r = await fetch(config.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.id, client_secret: config.secret, ...params }),
      signal: AbortSignal.timeout(20000)
    });
    const j = (await r.json().catch(() => ({}))) as TokenReply;
    return { ok: r.ok, status: r.status, j };
  }

  // A current access token, refreshed when it's about to run out
  async function token(): Promise<string> {
    if (access && access.exp > Date.now() + 60 * 1000) return access.token;
    const st = load();
    if (!st.refresh)
      throw new Error(st.problem || 'Google isn’t connected yet - connect it in ⚙ Settings on the tablet');
    const { ok, status, j } = await tokenRequest({ refresh_token: st.refresh, grant_type: 'refresh_token' });
    if (!ok || !j.access_token) {
      // revoked, or a project left in "Testing" (where sign-ins expire after 7 days)
      if (j.error === 'invalid_grant')
        save({ ...st, refresh: null, problem: 'Google sign-in expired or was removed - reconnect in ⚙ Settings' });
      throw new Error(`Google sign-in failed (${j.error || status}) - reconnect in ⚙ Settings`);
    }
    access = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
    return access.token;
  }

  const calendarUrl = (id: string) => `${config.dav}/caldav/v2/${encodeURIComponent(id)}/events/`;

  return {
    config,
    load,
    save,
    token,
    tokenRequest,
    calendarUrl,
    setAccess(t: string, expiresIn = 3600) {
      access = { token: t, exp: Date.now() + expiresIn * 1000 };
    },
    disconnect() {
      fs.rmSync(file, { force: true });
      access = null;
    }
  };
}
export type Google = ReturnType<typeof createGoogle>;

// Signing in, picking the calendar and disconnecting (admins, in ⚙️ Settings on the tablet)
export function registerGoogleRoutes(
  app: Express,
  {
    google,
    enabled,
    broadcast,
    calendarChanged
  }: {
    google: Google;
    enabled: boolean; // CALENDAR_PROVIDER is google
    broadcast: (event: string, data: unknown) => void;
    calendarChanged: () => void; // forget the calendar's address and cached months
  }
) {
  const G = google.config;
  const pending = new Map<string, { verifier: string; at: number }>(); // state -> PKCE verifier

  app.post('/api/google/start', (_req, res) => {
    if (!enabled || !G.id)
      return res.status(400).json({
        error:
          'Google isn’t set up on the server yet (admin console → ⚙️ Board → Calendar: Google client ID and secret)'
      });
    for (const [k, v] of pending) if (Date.now() - v.at > 15 * 60 * 1000) pending.delete(k);
    const state = crypto.randomBytes(16).toString('hex');
    const verifier = crypto.randomBytes(32).toString('base64url');
    pending.set(state, { verifier, at: Date.now() });
    const u = new URL(G.auth);
    u.search = new URLSearchParams({
      client_id: G.id,
      redirect_uri: G.redirect,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar',
      access_type: 'offline',
      prompt: 'consent',
      state,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256'
    }).toString();
    res.json({ url: u.toString() });
  });

  async function finish(code: string, state: string) {
    const p = pending.get(state);
    if (!p) throw new Error('That sign-in has expired or was already used - start again');
    pending.delete(state);
    const { ok, status, j } = await google.tokenRequest({
      code,
      redirect_uri: G.redirect,
      grant_type: 'authorization_code',
      code_verifier: p.verifier
    });
    if (!ok) throw new Error(`Google didn’t accept the sign-in (${j.error_description || j.error || status})`);
    if (!j.refresh_token)
      throw new Error(
        'Google didn’t give the board a lasting sign-in - remove the app at myaccount.google.com/connections and try again'
      );
    const st = google.load();
    google.save({
      refresh: j.refresh_token,
      calendarId: st.calendarId || null,
      calendarName: st.calendarName || null,
      at: Date.now()
    });
    if (j.access_token) google.setAccess(j.access_token, j.expires_in);
    calendarChanged();
    broadcast('calendar', { ym: 'any' });
  }

  // the address Google sent the browser to, pasted back
  app.post('/api/google/finish', async (req, res) => {
    const raw = String((req.body || {}).pasted || '').trim();
    let u: URL | null = null;
    try {
      u = new URL(raw);
    } catch {
      /* not an address */
    }
    if (u && u.searchParams.get('error'))
      return res.status(400).json({ error: `Google said: ${u.searchParams.get('error')}` });
    const code = u && u.searchParams.get('code');
    const state = u && u.searchParams.get('state');
    if (!code || !state)
      return res
        .status(400)
        .json({ error: `Paste the whole address from the browser's address bar (it starts with ${G.redirect})` });
    try {
      await finish(code, state);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // or Google comes back here by itself (GOOGLE_REDIRECT_URI pointing at the board)
  app.get('/oauth/google/callback', async (req, res) => {
    if (req.query.error)
      return res.status(400).type('text').send(`Google said: ${req.query.error}. Go back to the tablet and try again.`);
    try {
      await finish(String(req.query.code || ''), String(req.query.state || ''));
      res.redirect('/edit#settings');
    } catch (e) {
      res
        .status(400)
        .type('text')
        .send(`${(e as Error).message}. Go back to the tablet and try again.`);
    }
  });

  app.post('/api/google/calendars', async (_req, res) => {
    try {
      const r = await fetch(`${G.api}/calendar/v3/users/me/calendarList?minAccessRole=writer`, {
        headers: { Authorization: `Bearer ${await google.token()}` },
        signal: AbortSignal.timeout(20000)
      });
      const j = (await r.json().catch(() => ({}))) as {
        items?: {
          id: string;
          summary?: string;
          summaryOverride?: string;
          primary?: boolean;
          backgroundColor?: string;
        }[];
        error?: { message?: string };
      };
      if (!r.ok) throw new Error(j.error?.message || `Google returned ${r.status}`);
      res.json(
        (j.items || []).map(c => ({
          id: c.id,
          name: c.summaryOverride || c.summary || c.id,
          primary: !!c.primary,
          color: c.backgroundColor || null
        }))
      );
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  app.post('/api/google/calendar', (req, res) => {
    const { id, name } = req.body || {};
    if (typeof id !== 'string' || !id || id.length > 300) return res.status(400).json({ error: 'bad calendar' });
    const st = google.load();
    if (!st.refresh) return res.status(400).json({ error: 'Connect Google first' });
    google.save({ ...st, calendarId: id, calendarName: String(name || id).slice(0, 100) });
    calendarChanged();
    broadcast('calendar', { ym: 'any' });
    res.json({ ok: true });
  });

  app.post('/api/google/disconnect', (_req, res) => {
    google.disconnect();
    calendarChanged();
    broadcast('calendar', { ym: 'any' });
    res.json({ ok: true });
  });
}
