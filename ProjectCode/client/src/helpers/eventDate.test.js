import { MONTHS, parseBubbleDate, to24Hour, to12Hour } from './eventDate';

describe('parseBubbleDate', () => {
  test('parses YYYY-MM-DD into day and month', () => {
    expect(parseBubbleDate('2026-07-19')).toEqual({ day: 19, month: 'JUL' });
    expect(parseBubbleDate('2026-01-01')).toEqual({ day: 1, month: 'JAN' });
    expect(parseBubbleDate('2026-12-31')).toEqual({ day: 31, month: 'DEC' });
  });

  test('returns null for missing or invalid dates', () => {
    expect(parseBubbleDate('')).toBeNull();
    expect(parseBubbleDate(null)).toBeNull();
    expect(parseBubbleDate('not-a-date')).toBeNull();
  });

  test('MONTHS has 12 entries', () => {
    expect(MONTHS).toHaveLength(12);
  });
});

describe('to24Hour', () => {
  test('converts 12-hour strings', () => {
    expect(to24Hour('8:00 AM')).toBe('08:00');
    expect(to24Hour('12:00 AM')).toBe('00:00');
    expect(to24Hour('12:30 PM')).toBe('12:30');
    expect(to24Hour('6:45 PM')).toBe('18:45');
  });

  test('passes through 24-hour strings', () => {
    expect(to24Hour('18:30')).toBe('18:30');
    expect(to24Hour('08:00')).toBe('08:00');
  });

  test('returns empty string for unparseable input', () => {
    expect(to24Hour('')).toBe('');
    expect(to24Hour(null)).toBe('');
    expect(to24Hour('after the race')).toBe('');
    expect(to24Hour('25:00')).toBe('');
    expect(to24Hour('8:99 AM')).toBe('');
  });
});

describe('to12Hour', () => {
  test('converts 24-hour input values to display strings', () => {
    expect(to12Hour('08:00')).toBe('8:00 AM');
    expect(to12Hour('00:15')).toBe('12:15 AM');
    expect(to12Hour('12:00')).toBe('12:00 PM');
    expect(to12Hour('18:30')).toBe('6:30 PM');
  });

  test('returns input unchanged when not HH:MM', () => {
    expect(to12Hour('')).toBe('');
    expect(to12Hour('8 in the morning')).toBe('8 in the morning');
  });
});
