import { formatDuration, formatReleaseDate } from './formatter';

describe('formatDuration', () => {
  test('formats zero seconds as 00:00', () => {
    expect(formatDuration(0)).toBe('00:00');
  });

  test('formats seconds under a minute', () => {
    expect(formatDuration(59)).toBe('00:59');
  });

  test('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('02:05');
  });

  test('wraps at the hour boundary (mm:ss only)', () => {
    expect(formatDuration(3600)).toBe('00:00');
    expect(formatDuration(3661)).toBe('01:01');
  });

  test('treats null and undefined as zero', () => {
    expect(formatDuration(null)).toBe('00:00');
    expect(formatDuration(undefined)).toBe('00:00');
  });
});

describe('formatReleaseDate', () => {
  test('formats a datetime string as "Month day, year"', () => {
    expect(formatReleaseDate('2026-07-04T12:00:00')).toBe('July 4, 2026');
  });

  test('formats a US-style date string', () => {
    expect(formatReleaseDate('December 25, 2025 08:30:00')).toBe('December 25, 2025');
  });

  test('returns "Invalid Date" for unparseable input', () => {
    expect(formatReleaseDate('not-a-date')).toBe('Invalid Date');
  });
});
