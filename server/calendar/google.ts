/*
===============================================================================
 Family Chalk Planner | Server | Calendar | google.ts
===============================================================================
 Version:   1.2.8
 Author:    Joshua D. Miller, Colby Way, Claude
 Created:   2026-11-06
 Updated:   2026-11-24

 Purpose:
     Google Calendar: Google's CalDAV, with a Google sign-in (OAuth with
     PKCE) instead of a password. The refresh token and the chosen
     calendar live in DATA_DIR/google-auth.json (mode 600).

     By default Google sends the browser to http://localhost (nothing
     there) and the address is pasted back into ⚙️, so it works without
     HTTPS. With GOOGLE_REDIRECT_URI=https://<board>/oauth/google/callback
     it completes by itself.

 Routes:
     POST   /api/google/start
     POST   /api/google/finish
     GET    /oauth/google/callback
     POST   /api/google/calendars
     POST   /api/google/calendar
     POST   /api/google/disconnect

 Used by:
     server/calendar/source.ts
     server/main.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-07   joshua    The calendar in its own TypeScript modules
                        claude    (server/calendar/).
                        colby
                                  Google: several calendars at once, read-only
                                  ones, and which calendar a new event goes
                                  in.

 1.2.8    2026-11-24   joshua    Google's sign-in answer page: plain text,
                        claude    said so explicitly, without control
                                  characters.
===============================================================================
*/

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express } from 'express';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | Types and colors | //
// -------------------- //
export interface GoogleConfig {
  id: string; // client ID and secret: from the family's own Google Cloud project (docs/google-calendar.md)
  secret: string;
  redirect: string;
  auth: string; // Google's addresses (changed only by the tests)
  token: string;
  api: string;
  dav: string;
}

// A Google calendar shown on the board. Read-only ones (subscribed, or shared to look at) show, but the
// board doesn't offer to change them.
export interface GoogleCalendar {
  id: string;
  name: string;
  color: string;
  readOnly: boolean;
}
export const PALETTE = ['#9CC9E6', '#A9D8A0', '#F2D479', '#E8A35C', '#B49CE0', '#F6B3CB', '#F26B6B', '#7FD1C7'];
const hexOr = (c: unknown, fallback: string) =>
  typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toUpperCase() : fallback;

interface Stored {
  refresh?: string | null;
  calendarId?: string | null; // where new events go (the "main" calendar)
  calendarName?: string | null;
  calendars?: GoogleCalendar[]; // every calendar shown (several: from Colby Way's board)
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------------- //
// | Where new events go | //
// ----------------------- //
// Where new events go: the one asked for if it can be changed, else the     //
// first that can                                                            //
export function mainOf(list: GoogleCalendar[], want?: string | null) {
  return (
    list.find(c => c.id === want && !c.readOnly) ||
    list.find(c => !c.readOnly) ||
    list.find(c => c.id === want) ||
    list[0] ||
    null
  );
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | The Google sign-in | //
// ---------------------- //
// The refresh token and the chosen calendars live in                        //
// DATA_DIR/google-auth.json (mode 600), never in the database.              //
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

  // -------------------------- //
  // | A current access token | //
  // -------------------------- //
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

  // ----------------------- //
  // | The calendars shown | //
  // ----------------------- //
  // The calendars shown: those picked (or, from before, the one), then the  //
  // console's "more calendars"                                              //
  function selected(extra: { id: string; name: string; color: string }[] = []): GoogleCalendar[] {
    const st = load();
    const picked: Partial<GoogleCalendar>[] = st.calendars?.length
      ? st.calendars
      : st.calendarId
        ? [{ id: st.calendarId, name: st.calendarName || st.calendarId, readOnly: false }]
        : [];
    const out: GoogleCalendar[] = [];
    for (const c of [...picked, ...extra] as Partial<GoogleCalendar>[]) {
      if (!c || typeof c.id !== 'string' || !c.id || out.some(x => x.id === c.id)) continue;
      out.push({
        id: c.id,
        name: String(c.name || c.id).slice(0, 100),
        color: hexOr(c.color, PALETTE[out.length % PALETTE.length]),
        readOnly: !!c.readOnly
      });
    }
    return out;
  }

  return {
    config,
    selected,
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

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------------------------ //
// | Signing in, picking calendars, disconnecting | //
// ------------------------------------------------ //
// For admins, in Settings. OAuth with PKCE: the board starts, Google asks   //
// the person, and the board finishes with the code Google gives back        //
// (pasted, or sent straight back to GOOGLE_REDIRECT_URI).                   //
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

  // ------------------------- //
  // | Finishing the sign-in | //
  // ------------------------- //
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
      ...(st.calendars ? { calendars: st.calendars } : {}),
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
    // whatever comes back is shown as plain text, never as a page (so nothing in it can run), and
    // only the first line of it, without control characters
    const plain = (s: unknown) =>
      String(s || '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .slice(0, 300);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    if (req.query.error)
      return res.status(400).send(`Google said: ${plain(req.query.error)}. Go back to the tablet and try again.`);
    try {
      await finish(String(req.query.code || ''), String(req.query.state || ''));
      res.redirect('/edit#settings');
    } catch (e) {
      res.status(400).send(`${plain((e as Error).message)}. Go back to the tablet and try again.`);
    }
  });

  // --------------------------------- //
  // | Every calendar on the account | //
  // --------------------------------- //
  app.post('/api/google/calendars', async (_req, res) => {
    try {
      // every calendar, including ones the family can only look at (school, holidays, shared to view)
      const r = await fetch(`${G.api}/calendar/v3/users/me/calendarList`, {
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
          accessRole?: string;
        }[];
        error?: { message?: string };
      };
      if (!r.ok) throw new Error(j.error?.message || `Google returned ${r.status}`);
      res.json(
        (j.items || []).map(c => ({
          id: c.id,
          name: c.summaryOverride || c.summary || c.id,
          primary: !!c.primary,
          color: c.backgroundColor || null,
          readOnly: c.accessRole === 'reader' || c.accessRole === 'freeBusyReader'
        }))
      );
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ----------------------------------- //
  // | Which calendars the board shows | //
  // ----------------------------------- //
  // Which calendars the board shows ({ calendars: [{ id, name, color,       //
  // readOnly }], calendarId: where new events go }), or just one ({ id,     //
  // name }, as before)                                                      //
  app.post('/api/google/calendar', (req, res) => {
    const st = google.load();
    if (!st.refresh) return res.status(400).json({ error: 'Connect Google first' });
    const b = req.body || {};
    const sent: Record<string, unknown>[] = Array.isArray(b.calendars) ? b.calendars : [b];
    if (sent.length > 12) return res.status(400).json({ error: 'Pick at most 12 calendars' });
    const list: GoogleCalendar[] = [];
    for (const raw of sent) {
      const c = raw || {};
      if (typeof c.id !== 'string' || !c.id || c.id.length > 300 || /\s/.test(c.id))
        return res.status(400).json({ error: 'bad calendar' });
      if (list.some(x => x.id === c.id)) continue;
      list.push({
        id: c.id,
        name: String(c.name || c.id).slice(0, 100),
        color: hexOr(c.color, PALETTE[list.length % PALETTE.length]),
        readOnly: !!c.readOnly
      });
    }
    const main = mainOf(list, typeof b.calendarId === 'string' ? b.calendarId : st.calendarId);
    google.save({ ...st, calendarId: main?.id || null, calendarName: main?.name || null, calendars: list });
    calendarChanged();
    broadcast('calendar', { ym: 'any' });
    res.json({ ok: true, calendarId: main?.id || null, calendar: main?.name || null, calendars: list });
  });

  // ----------------- //
  // | Disconnecting | //
  // ----------------- //
  app.post('/api/google/disconnect', (_req, res) => {
    google.disconnect();
    calendarChanged();
    broadcast('calendar', { ym: 'any' });
    res.json({ ok: true });
  });
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
