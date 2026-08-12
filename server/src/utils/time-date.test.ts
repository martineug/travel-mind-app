import { describe, it, expect } from 'vitest';
import { fmtTime, fmtDate, fmtDuration, fmtTimestampForFilename } from './time-date';

describe('fmtTime', () => {
  it('formats a valid ISO datetime as HH:MM', () => {
    expect(fmtTime('2026-08-15T14:30:00Z')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('passes through null and undefined', () => {
    expect(fmtTime(null)).toBeNull();
    expect(fmtTime(undefined)).toBeNull();
  });
});

describe('fmtDate', () => {
  it('formats a valid ISO datetime as day + short month', () => {
    expect(fmtDate('2026-08-15T14:30:00Z')).toMatch(/^\d{1,2} \w{3}$/);
  });

  it('passes through null and undefined', () => {
    expect(fmtDate(null)).toBeNull();
    expect(fmtDate(undefined)).toBeNull();
  });
});

describe('fmtDuration', () => {
  it('formats hours and minutes', () => {
    expect(fmtDuration('PT2H30M')).toBe('2h 30m');
  });

  it('formats hours only, omitting minutes', () => {
    expect(fmtDuration('PT2H')).toBe('2h');
  });

  it('formats minutes only as 0h plus minutes', () => {
    expect(fmtDuration('PT30M')).toBe('0h 30m');
  });

  it('returns null for empty/null/undefined input', () => {
    expect(fmtDuration('')).toBeNull();
    expect(fmtDuration(null)).toBeNull();
    expect(fmtDuration(undefined)).toBeNull();
  });

  it('falls back to 0h for a non-matching string rather than throwing', () => {
    expect(fmtDuration('garbage')).toBe('0h');
  });
});

describe('fmtTimestampForFilename', () => {
  it('formats a UTC date as YYYYMMDD-HHMMSS', () => {
    expect(fmtTimestampForFilename(new Date('2026-07-27T18:42:09.465Z'))).toBe('20260727-184209');
  });

  it('defaults to the current time when no date is given', () => {
    expect(fmtTimestampForFilename()).toMatch(/^\d{8}-\d{6}$/);
  });
});
