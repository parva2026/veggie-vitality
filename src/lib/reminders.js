/**
 * Reminder scheduling logic — pure, and deliberately platform-free.
 *
 * Nothing here touches the OS. It turns the stored medicine list and water
 * settings into a flat list of "fire this text at this local time, every day"
 * descriptors; `notifications.js` is the only thing that knows how to hand
 * those to Android (or to the browser).
 *
 * Two invariants matter enough to state:
 *
 *  1. **Notification ids are derived from position, not minted.** Rescheduling
 *     is "cancel this app's whole id range, then re-add", which is only safe if
 *     the same medicine at the same slot always maps to the same integer. Ids
 *     are `int` on Android, so the blocks below are small and fixed.
 *  2. **The id space is bounded by the caps in constants.js.** Raising
 *     MAX_MEDICINES or MAX_TIMES_PER_MEDICINE without widening the blocks here
 *     would let medicine 15's alarms overwrite the water alarms.
 */

import {
  MAX_MEDICINES, MAX_TIMES_PER_MEDICINE, MAX_WATER_SLOTS,
  WATER_REMINDER_LIMITS, DOSE_WINDOW_MINUTES,
} from './constants.js';

/** Start of the medicine id block. */
export const MED_ID_BASE = 10000;
/** Start of the water id block, far enough above the medicine block to be safe. */
export const WATER_ID_BASE = 20000;

/** Every id this app will ever schedule, so cancellation can be exhaustive. */
export function allReminderIds() {
  const ids = [];
  for (let m = 0; m < MAX_MEDICINES; m += 1) {
    for (let t = 0; t < MAX_TIMES_PER_MEDICINE; t += 1) {
      ids.push(MED_ID_BASE + m * MAX_TIMES_PER_MEDICINE + t);
    }
  }
  for (let s = 0; s < MAX_WATER_SLOTS; s += 1) ids.push(WATER_ID_BASE + s);
  return ids;
}

/* ---------------------------------------------------------------- times */

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * Parse "HH:MM" (24-hour) into `{ hour, minute }`, or null.
 *
 * Strict on purpose: these values end up as OS alarm parameters, and a
 * silently-coerced "25:99" would either throw inside the plugin or schedule
 * something the user never asked for.
 */
export function parseTime(value) {
  if (typeof value !== 'string') return null;
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** `{ hour, minute }` -> "HH:MM", zero-padded. */
export function formatTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** "08:05" -> "8:05 AM". Display only. */
export function formatTimeLabel(value) {
  const parsed = parseTime(value);
  if (!parsed) return '';
  const suffix = parsed.hour < 12 ? 'AM' : 'PM';
  const hour12 = parsed.hour % 12 === 0 ? 12 : parsed.hour % 12;
  return `${hour12}:${String(parsed.minute).padStart(2, '0')} ${suffix}`;
}

/** Valid, deduplicated, chronologically sorted, capped. Total function. */
export function normalizeTimes(raw, limit = MAX_TIMES_PER_MEDICINE) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  for (const item of raw) {
    const parsed = parseTime(item);
    if (!parsed) continue;
    seen.add(formatTime(parsed.hour, parsed.minute));
  }
  return [...seen].sort().slice(0, limit);
}

/** Minutes since midnight, for ordering and window maths. */
export function minutesOfDay(value) {
  const parsed = parseTime(value);
  return parsed ? parsed.hour * 60 + parsed.minute : null;
}

/* ------------------------------------------------------------ water slots */

/**
 * Expand water settings into concrete daily times.
 *
 * Capped at MAX_WATER_SLOTS rather than erroring, because the cap exists to
 * protect the alarm budget, not to police the user's choice — a 30-minute
 * interval across a 14-hour day simply stops after 12 nudges.
 */
export function waterSlots(settings) {
  if (!settings?.enabled) return [];
  const { startHour, endHour, everyMinutes } = settings;
  const step = Math.max(WATER_REMINDER_LIMITS.everyMinutes.min, everyMinutes);
  const start = startHour * 60;
  // An end hour at or before the start means the user wants a single nudge,
  // not a window that wraps past midnight — wrapping would put reminders in
  // the middle of the night, which is never what "8am to 10pm" meant.
  const end = endHour > startHour ? endHour * 60 : start;

  const slots = [];
  for (let m = start; m <= end && slots.length < MAX_WATER_SLOTS; m += step) {
    slots.push(formatTime(Math.floor(m / 60) % 24, m % 60));
  }
  return slots;
}

/* -------------------------------------------------------------- schedule */

/** One line of dosage text for a notification body, or ''. */
function doseLine(medicine) {
  return [medicine.dose, medicine.note].filter(Boolean).join(' — ');
}

/**
 * Turn stored state into the flat list of daily alarms to register.
 *
 * The medicine's own name is the notification title, which is the whole point
 * of the feature: a phone showing "Reminder" tells you nothing at 8am.
 */
export function buildSchedule({ medicines = [], waterReminder = null } = {}) {
  const schedule = [];

  medicines.slice(0, MAX_MEDICINES).forEach((medicine, medIndex) => {
    if (!medicine?.remindersEnabled) return;
    normalizeTimes(medicine.times).forEach((time, timeIndex) => {
      const parsed = parseTime(time);
      if (!parsed) return;
      schedule.push({
        id: MED_ID_BASE + medIndex * MAX_TIMES_PER_MEDICINE + timeIndex,
        kind: 'medicine',
        refId: medicine.id,
        time,
        hour: parsed.hour,
        minute: parsed.minute,
        title: `Time for ${medicine.name}`,
        body: doseLine(medicine) || 'Tap to mark this dose as taken.',
      });
    });
  });

  waterSlots(waterReminder).forEach((time, slotIndex) => {
    const parsed = parseTime(time);
    if (!parsed) return;
    schedule.push({
      id: WATER_ID_BASE + slotIndex,
      kind: 'water',
      refId: 'water',
      time,
      hour: parsed.hour,
      minute: parsed.minute,
      title: 'Drink some water',
      body: 'A glass now keeps you on track for today’s target.',
    });
  });

  return schedule;
}

/* ------------------------------------------------------------ dose status */

/**
 * Where a scheduled dose stands right now: 'taken', 'due', 'missed' or
 * 'upcoming'.
 *
 * `due` is a window rather than an instant so that marking a dose works the way
 * people actually take medicine — a little early, or an hour late — without
 * either silently reopening yesterday's dose or refusing today's.
 */
export function doseStatus({ time, takenTimes = [], nowMinutes, isToday = true }) {
  if (takenTimes.includes(time)) return 'taken';
  if (!isToday) return 'missed';
  const scheduled = minutesOfDay(time);
  if (scheduled === null || !Number.isFinite(nowMinutes)) return 'upcoming';
  if (nowMinutes < scheduled) return 'upcoming';
  return nowMinutes - scheduled <= DOSE_WINDOW_MINUTES ? 'due' : 'missed';
}

/** How many of today's doses across all medicines are done. */
export function doseProgress(medicines, takenForDay) {
  let total = 0;
  let taken = 0;
  for (const medicine of medicines ?? []) {
    const times = normalizeTimes(medicine?.times);
    total += times.length;
    const done = takenForDay?.[medicine.id] ?? [];
    taken += times.filter((t) => done.includes(t)).length;
  }
  return { total, taken };
}
