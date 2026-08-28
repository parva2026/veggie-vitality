/**
 * The single validated data boundary.
 *
 * EVERY path that produces app data — the model's text replies, its vision
 * replies, the offline text parser, backup import, and loading from storage —
 * must pass through the normalizers here. Nothing else is trusted.
 *
 * This is what stops a hallucinated LLM field, a hand-edited backup file, or a
 * half-written storage blob from poisoning the database or white-screening the
 * app on every subsequent render.
 */

import {
  NUTRIENT_KEYS, NUTRIENT_MAX, MAX_ITEM_WEIGHT_G, MAX_FOOD_NAME_LENGTH,
  MAX_CHAT_MESSAGE_LENGTH, MAX_PERSISTED_DOC_MESSAGES, PROFILE_LIMITS,
  ACTIVITY_LEVELS, GENDERS, SCHEMA_VERSION,
  MAX_MEDICINES, MAX_TIMES_PER_MEDICINE, MAX_MEDICINE_NAME_LENGTH,
  MAX_MEDICINE_DOSE_LENGTH, MAX_MEDICINE_NOTE_LENGTH,
  WATER_REMINDER_DEFAULTS, WATER_REMINDER_LIMITS,
} from './constants.js';
import { isValidDateKey } from './dates.js';
import { normalizeTimes } from './reminders.js';

/** Coerce anything to a finite number, or `fallback`. Never returns NaN. */
export function safeNum(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** Finite, non-negative, and no larger than `max`. */
export function clampNum(value, max, fallback = 0) {
  const n = safeNum(value, fallback);
  if (n < 0) return 0;
  if (Number.isFinite(max) && n > max) return max;
  return n;
}

/**
 * Strip control characters and clamp length.
 *
 * `singleLine` additionally collapses newlines and tabs to spaces. Use it for
 * short labels — names, in particular. A name is later interpolated into the
 * Gemini prompt inside a delimited data block, and a multi-line value is what
 * makes forging a block boundary look plausible. Chat content keeps its
 * newlines, because assistant answers are genuinely multi-line.
 */
function cleanText(value, maxLength, fallback = '', { singleLine = false } = {}) {
  if (typeof value !== 'string') return fallback;
  let cleaned = '';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (code < 0x20) {
      if (ch !== '\n' && ch !== '\t') continue;
      cleaned += singleLine ? ' ' : ch;
      continue;
    }
    if (code === 0x7f) continue;
    cleaned += ch;
  }
  if (singleLine) cleaned = cleaned.replace(/ {2,}/g, ' ');
  cleaned = cleaned.trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLength).trim() || fallback;
}

let idCounter = 0;
/** Collision-free id. `Date.now() + Math.random()` could repeat across an import. */
export function makeId(prefix = 'e') {
  idCounter += 1;
  const rand = typeof crypto !== 'undefined' && crypto.getRandomValues
    ? crypto.getRandomValues(new Uint32Array(1))[0].toString(36)
    : Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${rand}`;
}

const MAX_ID_LENGTH = 64;

/**
 * Decide whether to keep an incoming id, returning '' to mean "mint a fresh one".
 *
 * Only our own storage is trusted, and the test is for that rather than
 * against a list of known-bad sources — a new caller that forgets to pass a
 * source then gets a fresh id, which is merely wasteful, instead of silently
 * inheriting whatever an imported file or a model reply supplied.
 *
 * Ids from our own storage are kept so React keys stay stable across a reload.
 * Ids from anywhere else are discarded: they are attacker-controlled (a file
 * can set every entry to the same id, which breaks list rendering and makes
 * "delete this entry" remove several), and nothing outside the file references
 * them. The length cap stops a megabyte-long "id" from being persisted and
 * re-serialized on every save.
 */
function keepId(raw, source) {
  if (typeof raw !== 'string' || !raw) return '';
  if (source !== 'stored') return '';
  if (raw.length > MAX_ID_LENGTH) return '';
  return raw;
}

/**
 * Normalize one food log entry.
 *
 * Whitelists keys (so arbitrary LLM-invented fields never get persisted),
 * clamps every nutrient to a finite non-negative number under a sanity
 * ceiling, and guarantees `name`, `weight`, and `state` are present and sane.
 *
 * Returns null if the entry is unusable (no name AND no calories).
 */
export function normalizeFoodEntry(raw, { source = 'unknown' } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const name = cleanText(raw.name, MAX_FOOD_NAME_LENGTH, '', { singleLine: true });
  const entry = {
    id: keepId(raw.id, source) || makeId('food'),
    name: name || 'Unnamed food',
    weight: clampNum(raw.weight, MAX_ITEM_WEIGHT_G, 0),
    state: raw.state === 'raw' ? 'raw' : 'cooked',
    // 'gemini-*' are the pre-configurable-endpoint names, still present in
    // anything logged before the app could talk to another provider.
    source: ['model-text', 'model-vision', 'gemini-text', 'gemini-vision', 'local-db', 'import'].includes(raw.source)
      ? raw.source
      : source,
    loggedAt: Number.isFinite(raw.loggedAt) ? raw.loggedAt : Date.now(),
  };

  for (const key of NUTRIENT_KEYS) {
    entry[key] = clampNum(raw[key], NUTRIENT_MAX[key], 0);
  }

  // EAA is derived, not measured. If missing or nonsensical, estimate it, and
  // never let it exceed total protein (it is a subset of it by definition).
  if (!entry.eaa && entry.protein) entry.eaa = entry.protein * 0.4;
  if (entry.eaa > entry.protein) entry.eaa = entry.protein;

  // Drop entries with nothing meaningful in them.
  if (!name && entry.calories === 0 && entry.protein === 0) return null;

  return entry;
}

/** Normalize an array of raw entries, dropping unusable ones. */
export function normalizeFoodEntries(rawList, opts) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .slice(0, 50) // no single request should ever produce more than this
    .map((raw) => normalizeFoodEntry(raw, opts))
    .filter(Boolean);
}

/** Validate a user profile. Returns `{ profile, errors }`. */
export function validateProfile(raw) {
  const errors = {};
  const input = raw && typeof raw === 'object' ? raw : {};

  const name = cleanText(input.name, 60, '', { singleLine: true });
  if (!name) errors.name = 'Please enter a name.';

  const numeric = {};
  for (const [field, { min, max }] of Object.entries(PROFILE_LIMITS)) {
    const value = safeNum(input[field], NaN);
    if (!Number.isFinite(value)) {
      errors[field] = 'Required.';
    } else if (value < min || value > max) {
      errors[field] = `Must be between ${min} and ${max}.`;
    } else {
      numeric[field] = value;
    }
  }

  const gender = GENDERS.includes(input.gender) ? input.gender : null;
  if (!gender) errors.gender = 'Please choose an option.';

  const activity = Object.hasOwn(ACTIVITY_LEVELS, input.activity) ? input.activity : null;
  if (!activity) errors.activity = 'Please choose an option.';

  if (Object.keys(errors).length > 0) return { profile: null, errors };

  return {
    profile: {
      name,
      gender,
      activity,
      age: Math.round(numeric.age),
      // Weight keeps one decimal: people do track 72.4kg.
      weight: Math.round(numeric.weight * 10) / 10,
      height: Math.round(numeric.height),
    },
    errors: {},
  };
}

/** Coerce a possibly-broken stored profile into a usable one, or null. */
export function normalizeProfile(raw) {
  const { profile } = validateProfile(raw);
  return profile;
}

function normalizeChatMessage(raw, fallbackRole = 'system') {
  if (!raw || typeof raw !== 'object') return null;
  const content = cleanText(raw.content, MAX_CHAT_MESSAGE_LENGTH);
  if (!content) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId('msg'),
    role: raw.role === 'user' ? 'user' : fallbackRole,
    content,
  };
}

export function normalizeChatHistory(raw, limit = MAX_PERSISTED_DOC_MESSAGES) {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => normalizeChatMessage(m)).filter(Boolean).slice(-limit);
}

function normalizeLogs(raw, source) {
  const logs = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return logs;
  for (const [dateKey, entries] of Object.entries(raw)) {
    if (!isValidDateKey(dateKey)) continue;
    // The critical guard: a non-array here used to throw inside `.reduce`
    // on every render, permanently white-screening the app after a bad import.
    if (!Array.isArray(entries)) continue;
    const normalized = normalizeFoodEntries(entries, { source });
    if (normalized.length > 0) logs[dateKey] = normalized;
  }
  return logs;
}

function normalizeWaterLogs(raw) {
  const water = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return water;
  for (const [dateKey, ml] of Object.entries(raw)) {
    if (!isValidDateKey(dateKey)) continue;
    const value = clampNum(ml, 30000, 0);
    if (value > 0) water[dateKey] = Math.round(value);
  }
  return water;
}

function normalizeWeightHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Map();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    if (!isValidDateKey(item.date)) continue;
    const weight = clampNum(item.weight, PROFILE_LIMITS.weight.max, 0);
    if (weight < PROFILE_LIMITS.weight.min) continue;
    // One reading per day — the last one wins, rather than piling up duplicates.
    seen.set(item.date, { date: item.date, weight: Math.round(weight * 10) / 10 });
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
}


/* ------------------------------------------------------------- medicines */

/**
 * Normalize one medicine. Returns null if there is no usable name.
 *
 * The name is single-lined and length-capped like a food name, for the same
 * reason plus one more: it is rendered into an OS notification title. Control
 * characters and newlines in a notification are a display problem at best, and
 * on some launchers a way to push the real text out of view.
 */
export function normalizeMedicine(raw, { source = 'unknown' } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const name = cleanText(raw.name, MAX_MEDICINE_NAME_LENGTH, '', { singleLine: true });
  if (!name) return null;

  return {
    id: keepId(raw.id, source) || makeId('med'),
    name,
    dose: cleanText(raw.dose, MAX_MEDICINE_DOSE_LENGTH, '', { singleLine: true }),
    note: cleanText(raw.note, MAX_MEDICINE_NOTE_LENGTH, '', { singleLine: true }),
    times: normalizeTimes(raw.times, MAX_TIMES_PER_MEDICINE),
    // Reminders default to on only when there is something to remind about.
    remindersEnabled: raw.remindersEnabled === false
      ? false
      : normalizeTimes(raw.times, MAX_TIMES_PER_MEDICINE).length > 0,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

/**
 * Normalize the medicine list, enforcing the hard cap.
 *
 * The cap is enforced here rather than only in the UI because an imported
 * backup is not bound by the UI, and the notification id blocks in
 * `reminders.js` assume it. Duplicate ids are dropped: two medicines sharing an
 * id would break both list rendering and "delete this one".
 */
export function normalizeMedicines(raw, opts) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const item of raw) {
    if (out.length >= MAX_MEDICINES) break;
    const medicine = normalizeMedicine(item, opts);
    if (!medicine) continue;
    if (seenIds.has(medicine.id)) medicine.id = makeId('med');
    seenIds.add(medicine.id);
    out.push(medicine);
  }
  return out;
}

/**
 * Which doses were marked taken: `{ dateKey: { medicineId: ['08:00', ...] } }`.
 *
 * Entries for medicines that no longer exist are kept, not pruned — deleting a
 * medicine should not rewrite the record of what was actually taken last month.
 */
function normalizeMedLogs(raw) {
  const logs = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return logs;
  for (const [dateKey, byMedicine] of Object.entries(raw)) {
    if (!isValidDateKey(dateKey)) continue;
    if (!byMedicine || typeof byMedicine !== 'object' || Array.isArray(byMedicine)) continue;
    const day = {};
    for (const [medId, times] of Object.entries(byMedicine)) {
      if (typeof medId !== 'string' || !medId || medId.length > MAX_ID_LENGTH) continue;
      const normalized = normalizeTimes(times, MAX_TIMES_PER_MEDICINE);
      if (normalized.length > 0) day[medId] = normalized;
    }
    if (Object.keys(day).length > 0) logs[dateKey] = day;
  }
  return logs;
}

/** Water reminder settings. Total function; always returns a usable object. */
export function normalizeWaterReminder(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const { hour, everyMinutes } = WATER_REMINDER_LIMITS;

  const clampHour = (value, fallback) => {
    const n = safeNum(value, NaN);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(hour.max, Math.max(hour.min, Math.round(n)));
  };

  const startHour = clampHour(input.startHour, WATER_REMINDER_DEFAULTS.startHour);
  const endHour = clampHour(input.endHour, WATER_REMINDER_DEFAULTS.endHour);
  const every = safeNum(input.everyMinutes, WATER_REMINDER_DEFAULTS.everyMinutes);

  return {
    enabled: input.enabled === true,
    startHour,
    // A window that ends before it starts is meaningless; collapse it to a
    // single reminder at the start rather than wrapping into the night.
    endHour: Math.max(startHour, endHour),
    everyMinutes: Math.min(
      everyMinutes.max,
      Math.max(everyMinutes.min, Math.round(Number.isFinite(every) ? every : WATER_REMINDER_DEFAULTS.everyMinutes)),
    ),
  };
}

/**
 * Normalize a whole persisted/imported app state. Total function: any input,
 * including null or a hostile hand-edited file, yields a renderable state.
 *
 * `source` distinguishes our own storage from a file the user was handed. It
 * defaults to the untrusting reading, so a new call site has to opt in to
 * treating data as ours. See `keepId`.
 */
export function normalizeAppState(raw, { source = 'import' } = {}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    version: SCHEMA_VERSION,
    userProfile: normalizeProfile(input.userProfile),
    logs: normalizeLogs(input.logs, source),
    waterLogs: normalizeWaterLogs(input.waterLogs),
    weightHistory: normalizeWeightHistory(input.weightHistory),
    docHistory: normalizeChatHistory(input.docHistory),
    medicines: normalizeMedicines(input.medicines, { source }),
    medLogs: normalizeMedLogs(input.medLogs),
    waterReminder: normalizeWaterReminder(input.waterReminder),
  };
}

/** Shape check for an imported backup, before normalizing. */
export function looksLikeBackup(parsed) {
  return Boolean(
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    (Object.hasOwn(parsed, 'logs') || Object.hasOwn(parsed, 'userProfile')),
  );
}

/** Summary of what an import would bring in, for the confirmation dialog. */
export function summarizeState(state) {
  const days = Object.keys(state.logs).length;
  const entries = Object.values(state.logs).reduce((n, list) => n + list.length, 0);
  return {
    days,
    entries,
    hasProfile: Boolean(state.userProfile),
    profileName: state.userProfile?.name ?? null,
    weighIns: state.weightHistory.length,
    chatMessages: state.docHistory.length,
    medicines: state.medicines.length,
  };
}
