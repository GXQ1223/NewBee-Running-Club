import {
  getCalendarWindow,
  googleCalendarUrl,
  buildIcs,
  DEFAULT_DURATION_MINUTES,
} from './calendarExport';

const timedEvent = {
  id: 42,
  title: 'Wednesday Group Run',
  date: '2026-11-18',
  time: '6:30 PM',
  location: 'Central Park, Engineers Gate',
  description: 'Easy miles, all paces welcome.',
  signupLink: 'https://heylo.com/events/abc',
};

test('timed window: parses 12h time, ends 2h later on the clock face', () => {
  const w = getCalendarWindow(timedEvent);
  expect(w.allDay).toBe(false);
  expect(w.start).toEqual({ y: 2026, mo: 11, d: 18, h: 18, mi: 30 });
  expect(w.end).toEqual({ y: 2026, mo: 11, d: 18, h: 20, mi: 30 });
  expect(DEFAULT_DURATION_MINUTES).toBe(120);
  expect(w.details).toContain('Sign up: https://heylo.com/events/abc');
});

test('timed window rolls past midnight into the next day', () => {
  const w = getCalendarWindow({ ...timedEvent, time: '11:00 PM' });
  expect(w.end).toEqual({ y: 2026, mo: 11, d: 19, h: 1, mi: 0 });
});

test('no usable time falls back to an all-day window', () => {
  const w = getCalendarWindow({ ...timedEvent, time: '' });
  expect(w.allDay).toBe(true);
  expect(w.start).toEqual({ y: 2026, mo: 11, d: 18 });
  expect(w.end).toEqual({ y: 2026, mo: 11, d: 19, h: 0, mi: 0 });
});

test('unparseable date returns null everywhere', () => {
  const bad = { ...timedEvent, date: 'next Friday' };
  expect(getCalendarWindow(bad)).toBeNull();
  expect(googleCalendarUrl(bad)).toBeNull();
  expect(buildIcs(bad)).toBeNull();
  expect(getCalendarWindow(null)).toBeNull();
  expect(getCalendarWindow({ ...timedEvent, date: '2026-13-40' })).toBeNull();
});

test('google URL carries title, NY-timezone dates, location and details', () => {
  const url = new URL(googleCalendarUrl(timedEvent));
  expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
  expect(url.searchParams.get('action')).toBe('TEMPLATE');
  expect(url.searchParams.get('text')).toBe('Wednesday Group Run');
  expect(url.searchParams.get('dates')).toBe('20261118T183000/20261118T203000');
  expect(url.searchParams.get('ctz')).toBe('America/New_York');
  expect(url.searchParams.get('location')).toBe('Central Park, Engineers Gate');
  expect(url.searchParams.get('details')).toContain('Easy miles');
});

test('google all-day URL uses date-only range with exclusive end', () => {
  const url = new URL(googleCalendarUrl({ ...timedEvent, time: null }));
  expect(url.searchParams.get('dates')).toBe('20261118/20261119');
});

test('ics has TZID start/end, escaped text, and CRLF line endings', () => {
  const ics = buildIcs({ ...timedEvent, location: 'Gate A; north, side' }, new Date(Date.UTC(2026, 0, 1, 12, 0, 0)));
  expect(ics).toContain('DTSTART;TZID=America/New_York:20261118T183000');
  expect(ics).toContain('DTEND;TZID=America/New_York:20261118T203000');
  expect(ics).toContain('DTSTAMP:20260101T120000Z');
  expect(ics).toContain('UID:42-newbee@newbeerunning.org');
  expect(ics).toContain('LOCATION:Gate A\\; north\\, side');
  expect(ics).toContain('SUMMARY:Wednesday Group Run');
  expect(ics.endsWith('\r\n')).toBe(true);
  expect(ics.split('\r\n').every((line) => !line.includes('\n'))).toBe(true);
});

test('ics all-day event uses VALUE=DATE lines', () => {
  const ics = buildIcs({ ...timedEvent, time: undefined });
  expect(ics).toContain('DTSTART;VALUE=DATE:20261118');
  expect(ics).toContain('DTEND;VALUE=DATE:20261119');
});
