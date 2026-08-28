import { describe, it, expect } from 'vitest';
import {
  toDateKey, fromDateKey, addDays, isValidDateKey, msUntilNextMidnight, formatDateLabel, todayKey,
} from './dates.js';

describe('toDateKey', () => {
  it('uses local time, not UTC', () => {
    // 1 Jan 2025 00:30 local. `toISOString().split('T')[0]` — what the original
    // app used — reports 2024-12-31 for anyone east of UTC.
    const d = new Date(2025, 0, 1, 0, 30, 0);
    expect(toDateKey(d)).toBe('2025-01-01');
  });

  it('pads single digit months and days', () => {
    expect(toDateKey(new Date(2025, 2, 5))).toBe('2025-03-05');
  });

  it('is stable just before local midnight', () => {
    expect(toDateKey(new Date(2025, 5, 30, 23, 59, 59))).toBe('2025-06-30');
  });
});

describe('fromDateKey', () => {
  it('round-trips', () => {
    expect(toDateKey(fromDateKey('2025-07-04'))).toBe('2025-07-04');
  });

  it('rejects malformed and rolled-over dates', () => {
    expect(fromDateKey('2025-02-30')).toBeNull();
    expect(fromDateKey('not-a-date')).toBeNull();
    expect(fromDateKey('2025-13-01')).toBeNull();
    expect(fromDateKey(null)).toBeNull();
  });
});

describe('addDays', () => {
  it('steps across month and year boundaries', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01');
    expect(addDays('2025-03-01', -1)).toBe('2025-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('handles a whole week', () => {
    expect(addDays('2025-06-10', -7)).toBe('2025-06-03');
  });
});

describe('isValidDateKey', () => {
  it('accepts real keys and rejects junk', () => {
    expect(isValidDateKey('2025-06-10')).toBe(true);
    expect(isValidDateKey('2025-6-10')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
    expect(isValidDateKey(undefined)).toBe(false);
  });
});

describe('msUntilNextMidnight', () => {
  it('never returns zero or negative, which would spin a timer', () => {
    expect(msUntilNextMidnight(new Date(2025, 0, 1, 23, 59, 59, 999))).toBeGreaterThanOrEqual(1000);
    // Targets one second past midnight, so a full day plus that second is the ceiling.
    expect(msUntilNextMidnight(new Date(2025, 0, 1, 0, 0, 0))).toBeLessThanOrEqual(86_401_000);
  });
});

describe('formatDateLabel', () => {
  it('labels today', () => {
    expect(formatDateLabel(todayKey())).toBe('Today');
  });

  it('labels yesterday', () => {
    expect(formatDateLabel(addDays(todayKey(), -1))).toBe('Yesterday');
  });
});
