/**
 * Date helpers.
 *
 * All day-keys in this app are LOCAL calendar dates in `YYYY-MM-DD` form.
 *
 * The original implementation used `new Date().toISOString().split('T')[0]`,
 * which yields the *UTC* date. For anyone west of UTC that rolls the day over
 * in the evening (e.g. 8pm EST on the 5th is already the 6th in UTC), so meals
 * were filed under tomorrow. Worse, `new Date('2025-12-02')` parses as UTC
 * midnight but `getDate()`/`setDate()` operate in local time, so stepping
 * through days could skip or repeat a day. Everything here is local-time only.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date of a Date object as `YYYY-MM-DD`. */
export function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's local calendar date as `YYYY-MM-DD`. */
export function todayKey() {
  return toDateKey(new Date());
}

/** Parse a `YYYY-MM-DD` key into a Date at local midnight. Null if malformed. */
export function fromDateKey(key) {
  if (!isValidDateKey(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  // Reject values that rolled over (e.g. 2025-02-30 -> Mar 2).
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

export function isValidDateKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

/** Shift a date key by `offset` days, staying in local time. */
export function addDays(key, offset) {
  const date = fromDateKey(key);
  if (!date) return todayKey();
  date.setDate(date.getDate() + offset);
  return toDateKey(date);
}

export function isToday(key) {
  return key === todayKey();
}

/** Milliseconds from now until the next local midnight (always >= 1000). */
export function msUntilNextMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** Human-friendly label for a date key. */
export function formatDateLabel(key) {
  if (isToday(key)) return 'Today';
  if (key === addDays(todayKey(), -1)) return 'Yesterday';
  const date = fromDateKey(key);
  if (!date) return key;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** The N most recent day-keys present in `logs`, oldest first. */
export function recentDateKeys(logs, days) {
  return Object.keys(logs || {})
    .filter(isValidDateKey)
    .sort()
    .slice(-days);
}
