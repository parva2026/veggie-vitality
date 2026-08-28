import { describe, expect, it } from 'vitest';

import {
  MED_ID_BASE, WATER_ID_BASE, allReminderIds, parseTime, formatTime, formatTimeLabel,
  normalizeTimes, minutesOfDay, waterSlots, buildSchedule, doseStatus, doseProgress,
} from './reminders.js';
import {
  MAX_MEDICINES, MAX_TIMES_PER_MEDICINE, MAX_WATER_SLOTS, DOSE_WINDOW_MINUTES,
} from './constants.js';

const med = (over = {}) => ({
  id: 'med_1', name: 'B12', dose: '1 tablet', note: '', times: ['08:00'],
  remindersEnabled: true, createdAt: 0, ...over,
});

describe('parseTime', () => {
  it('accepts valid 24-hour times', () => {
    expect(parseTime('00:00')).toEqual({ hour: 0, minute: 0 });
    expect(parseTime('8:05')).toEqual({ hour: 8, minute: 5 });
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 });
    expect(parseTime(' 09:30 ')).toEqual({ hour: 9, minute: 30 });
  });

  it('rejects anything that is not a valid time', () => {
    for (const bad of ['24:00', '23:60', '99:99', '8', '08:0', 'ab:cd', '', null, 8, {}, ['08:00']]) {
      expect(parseTime(bad)).toBeNull();
    }
  });
});

describe('formatting', () => {
  it('zero-pads', () => {
    expect(formatTime(8, 5)).toBe('08:05');
    expect(formatTime(0, 0)).toBe('00:00');
  });

  it('renders a 12-hour label, with 12 rather than 0', () => {
    expect(formatTimeLabel('08:05')).toBe('8:05 AM');
    expect(formatTimeLabel('00:30')).toBe('12:30 AM');
    expect(formatTimeLabel('12:00')).toBe('12:00 PM');
    expect(formatTimeLabel('23:15')).toBe('11:15 PM');
    expect(formatTimeLabel('nonsense')).toBe('');
  });
});

describe('normalizeTimes', () => {
  it('drops invalid entries, dedupes and sorts', () => {
    expect(normalizeTimes(['22:00', 'x', '8:00', '08:00', null, '09:30']))
      .toEqual(['08:00', '09:30', '22:00']);
  });

  it('caps at the per-medicine limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    expect(normalizeTimes(many)).toHaveLength(MAX_TIMES_PER_MEDICINE);
  });

  it('is total for non-arrays', () => {
    expect(normalizeTimes(null)).toEqual([]);
    expect(normalizeTimes('08:00')).toEqual([]);
  });
});

describe('minutesOfDay', () => {
  it('converts, or returns null', () => {
    expect(minutesOfDay('08:30')).toBe(510);
    expect(minutesOfDay('oops')).toBeNull();
  });
});

describe('waterSlots', () => {
  const base = { enabled: true, startHour: 8, endHour: 12, everyMinutes: 120 };

  it('is empty when disabled or absent', () => {
    expect(waterSlots({ ...base, enabled: false })).toEqual([]);
    expect(waterSlots(null)).toEqual([]);
  });

  it('walks the window inclusively', () => {
    expect(waterSlots(base)).toEqual(['08:00', '10:00', '12:00']);
  });

  it('never wraps past midnight when the window is inverted', () => {
    expect(waterSlots({ ...base, startHour: 22, endHour: 6 })).toEqual(['22:00']);
    expect(waterSlots({ ...base, startHour: 9, endHour: 9 })).toEqual(['09:00']);
  });

  it('caps the number of slots', () => {
    const slots = waterSlots({ enabled: true, startHour: 0, endHour: 23, everyMinutes: 30 });
    expect(slots).toHaveLength(MAX_WATER_SLOTS);
  });

  it('refuses an interval below the floor', () => {
    const slots = waterSlots({ enabled: true, startHour: 8, endHour: 10, everyMinutes: 1 });
    expect(slots).toEqual(['08:00', '08:30', '09:00', '09:30', '10:00']);
  });
});

describe('allReminderIds', () => {
  it('covers every id buildSchedule can emit, with no collisions', () => {
    const ids = allReminderIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(MAX_MEDICINES * MAX_TIMES_PER_MEDICINE + MAX_WATER_SLOTS);

    const owned = new Set(ids);
    const medicines = Array.from({ length: MAX_MEDICINES + 3 }, (_, i) => med({
      id: `med_${i}`,
      name: `Med ${i}`,
      times: Array.from({ length: MAX_TIMES_PER_MEDICINE }, (_, t) => `${String(t).padStart(2, '0')}:00`),
    }));
    const schedule = buildSchedule({
      medicines,
      waterReminder: { enabled: true, startHour: 0, endHour: 23, everyMinutes: 30 },
    });
    expect(schedule.length).toBeGreaterThan(0);
    for (const item of schedule) expect(owned.has(item.id)).toBe(true);
    expect(new Set(schedule.map((s) => s.id)).size).toBe(schedule.length);
  });

  it('keeps the medicine block clear of the water block', () => {
    const lastMed = MED_ID_BASE + (MAX_MEDICINES - 1) * MAX_TIMES_PER_MEDICINE + (MAX_TIMES_PER_MEDICINE - 1);
    expect(lastMed).toBeLessThan(WATER_ID_BASE);
  });
});

describe('buildSchedule', () => {
  it('names the medicine in the title so the notification is useful', () => {
    const [item] = buildSchedule({ medicines: [med()] });
    expect(item.title).toBe('Time for B12');
    expect(item.body).toBe('1 tablet');
    expect(item).toMatchObject({ kind: 'medicine', refId: 'med_1', hour: 8, minute: 0 });
  });

  it('falls back to a generic body when there is no dose or note', () => {
    const [item] = buildSchedule({ medicines: [med({ dose: '', note: '' })] });
    expect(item.body).toBe('Tap to mark this dose as taken.');
  });

  it('joins dose and note', () => {
    const [item] = buildSchedule({ medicines: [med({ note: 'after food' })] });
    expect(item.body).toBe('1 tablet — after food');
  });

  it('skips medicines with reminders turned off', () => {
    expect(buildSchedule({ medicines: [med({ remindersEnabled: false })] })).toEqual([]);
  });

  it('skips medicines with no times', () => {
    expect(buildSchedule({ medicines: [med({ times: [] })] })).toEqual([]);
  });

  it('gives each medicine its own id block, so ids follow position', () => {
    const schedule = buildSchedule({
      medicines: [med({ id: 'a', times: ['08:00', '20:00'] }), med({ id: 'b', name: 'Iron' })],
    });
    expect(schedule.map((s) => s.id)).toEqual([
      MED_ID_BASE, MED_ID_BASE + 1, MED_ID_BASE + MAX_TIMES_PER_MEDICINE,
    ]);
  });

  it('emits water reminders in their own block', () => {
    const schedule = buildSchedule({
      medicines: [],
      waterReminder: { enabled: true, startHour: 8, endHour: 10, everyMinutes: 120 },
    });
    expect(schedule.map((s) => s.id)).toEqual([WATER_ID_BASE, WATER_ID_BASE + 1]);
    expect(schedule[0]).toMatchObject({ kind: 'water', refId: 'water', title: 'Drink some water' });
  });

  it('never puts the medicine name in the notification extras', () => {
    const [item] = buildSchedule({ medicines: [med({ name: 'Sertraline' })] });
    expect(JSON.stringify({ kind: item.kind, refId: item.refId, time: item.time }))
      .not.toContain('Sertraline');
  });

  it('is total with no arguments', () => {
    expect(buildSchedule()).toEqual([]);
  });
});

describe('doseStatus', () => {
  const at = (h, m = 0) => h * 60 + m;

  it('reports taken regardless of the clock', () => {
    expect(doseStatus({ time: '08:00', takenTimes: ['08:00'], nowMinutes: at(23) })).toBe('taken');
    expect(doseStatus({ time: '08:00', takenTimes: ['08:00'], nowMinutes: at(1) })).toBe('taken');
  });

  it('is upcoming before the scheduled time', () => {
    expect(doseStatus({ time: '08:00', nowMinutes: at(7, 59) })).toBe('upcoming');
  });

  it('is due inside the grace window and missed after it', () => {
    expect(doseStatus({ time: '08:00', nowMinutes: at(8) })).toBe('due');
    expect(doseStatus({ time: '08:00', nowMinutes: at(8) + DOSE_WINDOW_MINUTES })).toBe('due');
    expect(doseStatus({ time: '08:00', nowMinutes: at(8) + DOSE_WINDOW_MINUTES + 1 })).toBe('missed');
  });

  it('treats an untaken dose on a past day as missed, never as due', () => {
    expect(doseStatus({ time: '08:00', nowMinutes: at(8), isToday: false })).toBe('missed');
  });

  it('degrades to upcoming rather than throwing on bad input', () => {
    expect(doseStatus({ time: 'nope', nowMinutes: at(8) })).toBe('upcoming');
    expect(doseStatus({ time: '08:00', nowMinutes: NaN })).toBe('upcoming');
  });
});

describe('doseProgress', () => {
  it('counts only times that are actually scheduled', () => {
    const medicines = [med({ id: 'a', times: ['08:00', '20:00'] }), med({ id: 'b' })];
    expect(doseProgress(medicines, { a: ['08:00', '13:00'], b: [] }))
      .toEqual({ total: 3, taken: 1 });
  });

  it('is total for missing input', () => {
    expect(doseProgress(undefined, undefined)).toEqual({ total: 0, taken: 0 });
  });
});
