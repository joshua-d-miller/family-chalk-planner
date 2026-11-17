/*
===============================================================================
 Family Chalk Planner | Server | outages.ts
===============================================================================
 Version:   1.1.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-17
 Updated:   2026-11-17

 Purpose:
     When the calendar can't be reached, is it Apple's or Google's problem
     rather than ours? Apple's System Status and Google's Workspace Status
     Dashboard both publish what's down; the board looks there (only while
     its calendar is failing, at most every 10 minutes) and, if iCloud
     Calendar or Google Calendar has a problem right now, says so instead
     of a bare error.

 How it fits:
     server/main.ts makes one, knowing which company runs the calendar
     (Google, or iCloud's CalDAV address); server/calendar/routes.ts adds
     its answer to the month and to ⚙️ Board's calendar status.

 Known limitations:
     Neither page is an official programming interface; both are read the
     way their own web pages read them. Anything unexpected (a change in
     either page, no internet) means "nothing known", never an error: the
     note just doesn't appear.
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 1.1.0    2026-11-17   joshua    New file (Joshua's idea: check Apple's and
                        claude    Google's status pages).
===============================================================================
*/

/* eslint-disable @typescript-eslint/no-explicit-any -- the status pages' JSON, read loosely */

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------- //
// | Where they're kept | //
// ---------------------- //
export const APPLE_STATUS = 'https://www.apple.com/support/systemstatus/data/system_status_en_US.js';
export const GOOGLE_STATUS = 'https://www.google.com/appsstatus/dashboard/incidents.json';
const EVERY = 10 * 60 * 1000; // looked at again after 10 minutes, at most
export type Company = 'apple' | 'google';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------- //
// | Apple's page | //
// ---------------- //
// jsonCallback({ services: [{ serviceName, events: [{ epochStartDate,       //
// epochEndDate, eventStatus, ... }] }] }): a calendar service with an       //
// event that has started and hasn't ended or been resolved.                 //
export function appleSays(text: string, now = Date.now()): string | null {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  const data = JSON.parse(text.slice(a, b + 1));
  for (const s of Array.isArray(data?.services) ? data.services : []) {
    const name = String(s?.serviceName || '');
    if (!/calendar/i.test(name)) continue;
    const open = (Array.isArray(s.events) ? s.events : []).some((e: any) => {
      const start = +e?.epochStartDate || 0;
      const end = +e?.epochEndDate || 0;
      return start <= now && (!end || end > now) && !/resolved|completed/i.test(String(e?.eventStatus || ''));
    });
    if (open) return `Apple’s System Status shows a problem with ${name} right now`;
  }
  return null;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ----------------- //
// | Google's page | //
// ----------------- //
// [{ begin, end, service_name, affected_products: [{ title }] }]: one       //
// about Calendar that has begun and hasn't ended.                           //
export function googleSays(text: string, now = Date.now()): string | null {
  const list = JSON.parse(text);
  for (const i of Array.isArray(list) ? list : []) {
    const names = [
      i?.service_name,
      ...(Array.isArray(i?.affected_products) ? i.affected_products : []).map((p: any) => p?.title)
    ]
      .filter(Boolean)
      .map(String);
    if (!names.some(n => /calendar/i.test(n))) continue;
    const begin = Date.parse(i?.begin || '') || 0;
    const end = Date.parse(i?.end || '') || 0;
    if (begin <= now && (!end || end > now))
      return 'Google’s Workspace Status Dashboard shows a problem with Google Calendar right now';
  }
  return null;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Asking, gently | //
// ------------------ //
// One answer kept for 10 minutes; a few seconds to answer at most; any      //
// trouble at all is "nothing known".                                        //
export function makeOutages({
  company,
  appleUrl = APPLE_STATUS,
  googleUrl = GOOGLE_STATUS
}: {
  company: () => Company | null;
  appleUrl?: string;
  googleUrl?: string;
}) {
  let kept: { company: Company; at: number; says: string | null } | null = null;
  return async function outage(): Promise<string | null> {
    const c = company();
    if (!c) return null;
    if (kept && kept.company === c && Date.now() - kept.at < EVERY) return kept.says;
    let says: string | null = null;
    try {
      const r = await fetch(c === 'apple' ? appleUrl : googleUrl, { signal: AbortSignal.timeout(4000) });
      if (r.ok) says = (c === 'apple' ? appleSays : googleSays)(await r.text());
    } catch {
      says = null; // nothing known
    }
    kept = { company: c, at: Date.now(), says };
    return says;
  };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
