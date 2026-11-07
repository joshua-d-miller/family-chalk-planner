/*
===============================================================================
 Family Chalk Planner | Server | Calendar | ical.ts
===============================================================================
 Version:   0.13.0
 Author:    Joshua D. Miller, Claude
 Created:   2026-11-06
 Updated:   2026-11-06

 Purpose:
     iCalendar (the format CalDAV servers and calendar links use): reading
     events for the board, and changing or deleting them the way Apple
     Calendar does, so repeating events keep working everywhere.
       scope 'all' = the whole event (or the whole series); 'one' = just
           this occurrence

 Used by:
     server/calendar/routes.ts
     server/calendar/source.ts
     test/time.test.ts
===============================================================================
 CHANGELOG
===============================================================================
 Version   Date         Author    Description
 -------   ----------   -------   --------------------------------------------
 0.13.0    2026-11-06   joshua    The calendar in its own TypeScript modules
                        claude    (server/calendar/).
===============================================================================
*/

import ICAL from 'ical.js';
import { addDays, pad2 } from '../dates.ts';
import type { Clock } from '../dates.ts';

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------- //
// | Types | //
// --------- //
type Time = InstanceType<typeof ICAL.Time>;
type Component = InstanceType<typeof ICAL.Component>;

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------ //
// | Where an event lives | //
// ------------------------ //
// Where an event lives on the calendar server, so it can be changed: the    //
// resource, its version (etag), and for one occurrence of a repeating       //
// event, which one (its RECURRENCE-ID)                                      //
export interface EventRef {
  href: string;
  etag: string | null;
  rid?: string | null;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------------- //
// | An event as the board shows it | //
// ---------------------------------- //
export interface BoardEvent {
  title: string;
  allDay: boolean;
  start: string; // YYYY-MM-DD
  end: string; // last day (inclusive)
  time: string | null; // as shown: '3:30pm'
  hm: string | null; // 'HH:MM'
  minutes: number | null;
  sort: number; // minutes after midnight (all-day: 0)
  ref?: EventRef;
  recurring?: boolean;
  cal?: string; // another calendar's name
  calColor?: string;
  readOnly?: boolean;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------- //
// | What the edit card sends | //
// ---------------------------- //
// What the edit card sends                                                  //
export interface EventChange {
  title: string;
  date: string;
  allDay: boolean;
  time?: string;
  minutes?: number;
  through?: string;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ---------------------------- //
// | Time zones in a calendar | //
// ---------------------------- //
// A calendar names the time zones its events use (VTIMEZONE); they're       //
// registered so repeating events keep their local time.                     //
const dateOf = (t: Time) => `${t.year}-${pad2(t.month)}-${pad2(t.day)}`;

export function registerZones(comp: Component) {
  for (const tz of comp.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      /* already known */
    }
  }
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------ //
// | Reading events | //
// ------------------ //
export function makeIcal(clock: Clock) {
  // ----------------------------------------- //
  // | One occurrence, as the board shows it | //
  // ----------------------------------------- //
  // One occurrence, as the board shows it                                   //
  function toBoardEvent(title: string, startTime: Time, endTime: Time | null): BoardEvent {
    if (startTime.isDate) {
      const s = dateOf(startTime);
      let e = s;
      if (endTime && endTime.isDate) {
        e = addDays(dateOf(endTime), -1); // DTEND is exclusive for all-day events
        if (e < s) e = s;
      }
      return { title, allDay: true, start: s, end: e, time: null, hm: null, minutes: null, sort: 0 };
    }
    const sp = clock.zoned(startTime.toJSDate());
    let end = sp.dateStr;
    if (endTime) {
      const ep = clock.zoned(new Date(endTime.toJSDate().getTime() - 1));
      if (ep.dateStr > sp.dateStr) end = ep.dateStr;
    }
    const minutes = endTime
      ? Math.max(5, Math.round((endTime.toJSDate().getTime() - startTime.toJSDate().getTime()) / 60000))
      : 60;
    return {
      title,
      allDay: false,
      start: sp.dateStr,
      end,
      time: clock.fmtTime(sp.h, sp.mi),
      hm: `${pad2(sp.h)}:${pad2(sp.mi)}`,
      minutes,
      sort: sp.h * 60 + sp.mi
    };
  }

  // ------------------------------------ //
  // | One calendar's events in a range | //
  // ------------------------------------ //
  // Shared by CalDAV and iCal links. Repeating events are expanded into     //
  // their occurrences, with any changed or cancelled ones applied.          //
  function eventsFromIcs(text: string, ref: EventRef | null, rangeStart: Date, rangeEnd: Date, out: BoardEvent[]) {
    const comp = new ICAL.Component(ICAL.parse(text));
    registerZones(comp);
    const vevents = comp.getAllSubcomponents('vevent');
    const masters = vevents.filter(v => !v.hasProperty('recurrence-id')).map(v => new ICAL.Event(v));
    const exceptions = vevents.filter(v => v.hasProperty('recurrence-id')).map(v => new ICAL.Event(v));
    for (const ev of masters) {
      for (const ex of exceptions) if (ex.uid === ev.uid) ev.relateException(ex);
      const title = ev.summary || '(no title)';
      if (ev.isRecurring()) {
        const it = ev.iterator();
        let next: Time | undefined;
        let guard = 0;
        while ((next = it.next()) && guard++ < 2000) {
          const det = ev.getOccurrenceDetails(next);
          if (det.startDate.toJSDate() >= rangeEnd) break;
          if (det.endDate.toJSDate() <= rangeStart) continue;
          const be = toBoardEvent(det.item.summary || title, det.startDate, det.endDate);
          if (ref) be.ref = { ...ref, rid: det.recurrenceId.toICALString() };
          be.recurring = true;
          out.push(be);
        }
      } else {
        if (ev.startDate.toJSDate() >= rangeEnd || (ev.endDate || ev.startDate).toJSDate() < rangeStart) continue;
        const be = toBoardEvent(title, ev.startDate, ev.endDate);
        if (ref) be.ref = { ...ref, rid: null };
        be.recurring = false;
        out.push(be);
      }
    }
    return out;
  }

  // ------------------------- //
  // | The new start and end | //
  // ------------------------- //
  // The new start and end from the edit card                                //
  function newTimes({ date, allDay, time, minutes, through }: EventChange) {
    const [y, m, d] = date.split('-').map(Number);
    if (allDay) {
      const last = through && through >= date ? through : date;
      const [ly, lm, ld] = addDays(last, 1).split('-').map(Number);
      return {
        start: ICAL.Time.fromData({ year: y, month: m, day: d, isDate: true }),
        end: ICAL.Time.fromData({ year: ly, month: lm, day: ld, isDate: true })
      };
    }
    const [h, mi] = String(time).split(':').map(Number);
    const startJs = clock.fromZoned(y, m, d, h, mi);
    return {
      start: ICAL.Time.fromJSDate(startJs, true),
      end: ICAL.Time.fromJSDate(new Date(startJs.getTime() + (minutes || 60) * 60000), true)
    };
  }

  return { toBoardEvent, eventsFromIcs, newTimes };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------------------------------- //
// | Changing events like Apple Calendar does | //
// -------------------------------------------- //
// So repeating events keep working on every device: a change to one         //
// occurrence is kept as an exception (RECURRENCE-ID), a deleted one as an   //
// EXDATE, and every change bumps the SEQUENCE.                              //
function setTime(vevent: Component, name: string, time: Time) {
  vevent.removeAllProperties(name);
  const p = new ICAL.Property(name);
  p.setValue(time);
  const tzid = time.zone && time.zone.tzid;
  if (!time.isDate && tzid && tzid !== 'UTC' && tzid !== 'Z' && tzid !== 'floating') p.setParameter('tzid', tzid);
  vevent.addProperty(p);
  return p;
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// -------------------- //
// | Which occurrence | //
// -------------------- //
// The occurrence's RECURRENCE-ID as a time in the master's zone and type    //
function ridTime(master: Component, rid: string | null | undefined): Time {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(rid || '');
  if (!m) throw new Error('bad occurrence id');
  const base = master.getFirstPropertyValue('dtstart') as Time;
  if (m[7] && !base.isDate) {
    const utc = ICAL.Time.fromData(
      { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: +m[6] },
      ICAL.Timezone.utcTimezone
    );
    return utc.convertToZone(base.zone);
  }
  const t = base.clone();
  t.year = +m[1];
  t.month = +m[2];
  t.day = +m[3];
  if (!t.isDate) {
    t.hour = +(m[4] || 0);
    t.minute = +(m[5] || 0);
    t.second = +(m[6] || 0);
  }
  return t;
}

function bumpSequence(vevent: Component) {
  const seq = Number(vevent.getFirstPropertyValue('sequence') || 0) + 1;
  vevent.updatePropertyWithValue('sequence', seq);
  vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now());
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// ------------------------------ //
// | Keeping the cancelled ones | //
// ------------------------------ //
// Keep any EXDATEs the series already had, plus the new one                 //
function rebuildExdates(cal: Component, master: Component, originalText: string, occ: Time) {
  const orig = new ICAL.Component(ICAL.parse(originalText));
  const om = orig.getAllSubcomponents('vevent').find(v => !v.hasProperty('recurrence-id'));
  master.removeAllProperties('exdate');
  for (const p of om ? om.getAllProperties('exdate') : []) master.addProperty(p);
  const np = new ICAL.Property('exdate');
  np.setValue(occ);
  if (!occ.isDate && occ.zone && occ.zone.tzid && !['UTC', 'Z', 'floating'].includes(occ.zone.tzid))
    np.setParameter('tzid', occ.zone.tzid);
  master.addProperty(np);
  bumpSequence(master);
  return cal.toString();
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
// --------------------- //
// | Applying a change | //
// --------------------- //
// Change: null deletes. Returns { del: true } to remove the whole resource, //
// or { text } to PUT back.                                                  //
export function applyEventChange(
  newTimes: ReturnType<typeof makeIcal>['newTimes'],
  icsText: string,
  ref: EventRef,
  scope: 'all' | 'one',
  change: EventChange | null
): { del: true } | { text: string } {
  const cal = new ICAL.Component(ICAL.parse(icsText));
  registerZones(cal);
  const vevents = cal.getAllSubcomponents('vevent');
  const master = vevents.find(v => !v.hasProperty('recurrence-id')) || vevents[0];
  if (!master) throw new Error('No event found in that entry');
  const recurring = master.hasProperty('rrule') || master.hasProperty('rdate');

  // The whole event / the whole series
  if (!recurring || scope === 'all' || !ref.rid) {
    if (!change) return { del: true };
    master.updatePropertyWithValue('summary', change.title);
    if (!recurring) {
      const t = newTimes(change);
      setTime(master, 'dtstart', t.start);
      master.removeAllProperties('duration');
      setTime(master, 'dtend', t.end);
    } else {
      // A series: its title, time of day and length can change; moving its day can't (it would fight the repeat rule)
      const occ = ridTime(master, ref.rid);
      if (change.date !== dateOf(occ))
        throw new Error('To move a repeating event to another day, choose “Just this one” or use Apple Calendar');
      const ms = master.getFirstPropertyValue('dtstart') as Time;
      if (!!change.allDay !== !!ms.isDate)
        throw new Error('Switch a repeating event to/from all-day in Apple Calendar');
      if (!ms.isDate) {
        // shift by the wall-clock difference between the old and new time of day, keeping the series' time zone
        const [h, mi] = String(change.time).split(':').map(Number);
        const delta = h * 60 + mi - (occ.hour * 60 + occ.minute);
        const start = ms.clone();
        start.adjust(0, 0, delta, 0);
        const end = start.clone();
        end.adjust(0, 0, change.minutes || 60, 0);
        setTime(master, 'dtstart', start);
        master.removeAllProperties('duration');
        setTime(master, 'dtend', end);
        if (delta) {
          // skipped days (EXDATE) and one-off changes (RECURRENCE-ID) are keyed by the old start time:
          // move them with the series so they keep matching, like Apple Calendar does
          for (const p of master.getAllProperties('exdate')) {
            p.setValues(
              (p.getValues() as Time[]).map(t => {
                if (t.isDate) return t;
                const c = t.clone();
                c.adjust(0, 0, delta, 0);
                return c;
              })
            );
          }
          for (const v of vevents) {
            if (v === master || !v.hasProperty('recurrence-id')) continue;
            const rp = v.getFirstProperty('recurrence-id');
            if (!rp) continue;
            const c = (rp.getFirstValue() as Time).clone();
            c.adjust(0, 0, delta, 0);
            rp.setValue(c);
          }
        }
      }
    }
    bumpSequence(master);
    return { text: cal.toString() };
  }

  // Just this occurrence of a repeating event
  const occ = ridTime(master, ref.rid);
  const occMs = occ.toJSDate().getTime();
  const uid = master.getFirstPropertyValue('uid') as string;
  for (const v of vevents) {
    if (
      v !== master &&
      v.hasProperty('recurrence-id') &&
      (v.getFirstPropertyValue('recurrence-id') as Time).toJSDate().getTime() === occMs
    )
      cal.removeSubcomponent(v);
  }
  if (!change) return { text: rebuildExdates(cal, master, icsText, occ) }; // skip this date (EXDATE)
  const ex = new ICAL.Component('vevent');
  ex.addPropertyWithValue('uid', uid);
  ex.addPropertyWithValue('dtstamp', ICAL.Time.now());
  setTime(ex, 'recurrence-id', occ);
  const t = newTimes(change);
  setTime(ex, 'dtstart', t.start);
  setTime(ex, 'dtend', t.end);
  ex.addPropertyWithValue('summary', change.title);
  ex.addPropertyWithValue('sequence', Number(master.getFirstPropertyValue('sequence') || 0) + 1);
  cal.addSubcomponent(ex);
  return { text: cal.toString() };
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::: //
