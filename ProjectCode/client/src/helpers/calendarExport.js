// "Add to Calendar" export for club events: builds a Google Calendar
// template URL and an .ics file from the event fields the site already
// stores ({ id, title, date: 'YYYY-MM-DD', time: '8:00 AM', location,
// description, signupLink }).
//
// Events carry no end time, so timed exports assume DEFAULT_DURATION_MINUTES.
// An event with no usable start time exports as an all-day event.
// Club events happen in New York, so wall-clock times are exported with
// TZID America/New_York (Google gets the matching ctz parameter).

import { to24Hour } from './eventDate';

export const CLUB_TIME_ZONE = 'America/New_York';
export const DEFAULT_DURATION_MINUTES = 120;

function parseDateParts(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { y: Number(m[1]), mo: month, d: day };
}

// Wall-clock arithmetic on plain parts (via UTC fields) so a 2-hour event
// ends 2 hours later on the clock face regardless of DST.
function addMinutes(parts, minutes) {
  const t = new Date(Date.UTC(parts.y, parts.mo - 1, parts.d, parts.h || 0, parts.mi || 0) + minutes * 60000);
  return {
    y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(),
    h: t.getUTCHours(), mi: t.getUTCMinutes(),
  };
}

const pad = (n) => String(n).padStart(2, '0');
const dateStamp = (p) => `${p.y}${pad(p.mo)}${pad(p.d)}`;
const dateTimeStamp = (p) => `${dateStamp(p)}T${pad(p.h || 0)}${pad(p.mi || 0)}00`;

/**
 * Normalize an event into { title, location, details, allDay, start, end }
 * with start/end as wall-clock parts, or null when the date is unusable.
 */
export function getCalendarWindow(event) {
  if (!event) return null;
  const date = parseDateParts(event.date);
  if (!date) return null;

  const detailsParts = [];
  if (event.description) detailsParts.push(String(event.description));
  const signup = event.signupLink || event.signup_link;
  if (signup) detailsParts.push(`Sign up: ${signup}`);

  const base = {
    title: event.title || event.name || 'NewBee Running Club Event',
    location: event.location || '',
    details: detailsParts.join('\n\n'),
  };

  const hhmm = to24Hour(event.time);
  if (!hhmm) {
    return { ...base, allDay: true, start: date, end: addMinutes({ ...date, h: 0, mi: 0 }, 24 * 60) };
  }
  const [h, mi] = hhmm.split(':').map(Number);
  const start = { ...date, h, mi };
  return { ...base, allDay: false, start, end: addMinutes(start, DEFAULT_DURATION_MINUTES) };
}

export function googleCalendarUrl(event) {
  const w = getCalendarWindow(event);
  if (!w) return null;
  const dates = w.allDay
    ? `${dateStamp(w.start)}/${dateStamp(w.end)}`
    : `${dateTimeStamp(w.start)}/${dateTimeStamp(w.end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: w.title,
    dates,
    ctz: CLUB_TIME_ZONE,
  });
  if (w.details) params.set('details', w.details);
  if (w.location) params.set('location', w.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// RFC 5545 text escaping.
function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// UTF-8 octet length of one character (avoids TextEncoder, which the
// jsdom test environment does not provide).
function utf8Length(ch) {
  const cp = ch.codePointAt(0);
  if (cp <= 0x7f) return 1;
  if (cp <= 0x7ff) return 2;
  if (cp <= 0xffff) return 3;
  return 4;
}

// Fold a content line to at most 75 UTF-8 octets per line (RFC 5545 §3.1),
// breaking only at character boundaries.
function foldLine(line) {
  let total = 0;
  for (const ch of line) total += utf8Length(ch);
  if (total <= 75) return line;
  const out = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const b = utf8Length(ch);
    if (currentBytes + b > 75) {
      out.push(current);
      current = ` ${ch}`;
      currentBytes = 1 + b;
    } else {
      current += ch;
      currentBytes += b;
    }
  }
  if (current) out.push(current);
  return out.join('\r\n');
}

function utcStamp(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

export function buildIcs(event, now = new Date()) {
  const w = getCalendarWindow(event);
  if (!w) return null;
  const uid = `${(event && (event.id || event.date)) || 'event'}-newbee@newbeerunning.org`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NewBee Running Club//Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
  ];
  if (w.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(w.start)}`);
    lines.push(`DTEND;VALUE=DATE:${dateStamp(w.end)}`);
  } else {
    lines.push(`DTSTART;TZID=${CLUB_TIME_ZONE}:${dateTimeStamp(w.start)}`);
    lines.push(`DTEND;TZID=${CLUB_TIME_ZONE}:${dateTimeStamp(w.end)}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(w.title)}`);
  if (w.location) lines.push(`LOCATION:${escapeIcsText(w.location)}`);
  if (w.details) lines.push(`DESCRIPTION:${escapeIcsText(w.details)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Build the .ics and trigger a browser download. Returns false when the
 *  event cannot be exported or no DOM is available. */
export function downloadIcs(event) {
  const ics = buildIcs(event);
  if (!ics || typeof document === 'undefined') return false;
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeTitle = String(event.title || event.name || 'event').replace(/[^\w\- ]+/g, '').trim() || 'event';
  a.href = url;
  a.download = `${safeTitle}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}
