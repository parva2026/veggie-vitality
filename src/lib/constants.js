/** Storage keys. The API key lives apart from the data blob so it can be
 *  excluded from exports and cleared independently. */
export const STORAGE_KEY = 'veggie_tracker_v11';
export const API_KEY_STORAGE_KEY = 'veggie_tracker_api_key_v1';
/** Which endpoint/model the key belongs to. Stored beside it, for the same
 *  reason: both are credentials-adjacent settings, not user data. */
export const API_CONFIG_STORAGE_KEY = 'veggie_tracker_api_config_v1';
export const SCHEMA_VERSION = 11;

/** Legacy keys migrated on first load, newest first. */
export const LEGACY_STORAGE_KEYS = ['veggie_tracker_v10', 'veggie_tracker_verified_v9'];

/** Every numeric nutrient tracked per food item. */
export const NUTRIENT_KEYS = [
  'calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium',
  'iron', 'calcium', 'b12', 'vit_d', 'vit_a', 'vit_c', 'vit_e', 'vit_k',
  'folate', 'eaa',
];

export const NUTRIENT_UNITS = {
  calories: 'kcal', protein: 'g', carbs: 'g', fat: 'g', fiber: 'g', sugar: 'g',
  sodium: 'mg', iron: 'mg', calcium: 'mg', b12: 'mcg', vit_d: 'IU',
  vit_a: 'mcg', vit_c: 'mg', vit_e: 'mg', vit_k: 'mcg', folate: 'mcg', eaa: 'g',
};

export const NUTRIENT_LABELS = {
  calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat',
  fiber: 'Fiber', sugar: 'Sugar', sodium: 'Sodium', iron: 'Iron',
  calcium: 'Calcium', b12: 'Vitamin B12', vit_d: 'Vitamin D', vit_a: 'Vitamin A',
  vit_c: 'Vitamin C', vit_e: 'Vitamin E', vit_k: 'Vitamin K', folate: 'Folate',
  eaa: 'Essential Amino Acids',
};

/**
 * Per-item sanity ceilings, per single logged food entry. These are not
 * nutritional advice — they are guards so that a hallucinated or corrupted
 * value (an LLM emitting sodium: 999999) cannot poison the running totals or
 * blow out the charts. Values are generous: no real single food entry
 * approaches them.
 */
export const NUTRIENT_MAX = {
  calories: 20000, protein: 2000, carbs: 3000, fat: 2000, fiber: 500,
  sugar: 2000, sodium: 100000, iron: 1000, calcium: 20000, b12: 1000,
  vit_d: 100000, vit_a: 500000, vit_c: 20000, vit_e: 5000, vit_k: 20000,
  folate: 20000, eaa: 2000,
};

export const MAX_ITEM_WEIGHT_G = 20000;
export const MAX_FOOD_NAME_LENGTH = 80;
/** Cap on how many chat turns are persisted, so localStorage cannot fill up. */
export const MAX_PERSISTED_DOC_MESSAGES = 100;
export const MAX_CHAT_MESSAGE_LENGTH = 4000;
/** Largest image accepted for vision analysis, pre-base64. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export const PROFILE_LIMITS = {
  age: { min: 13, max: 120 },
  weight: { min: 20, max: 400 },   // kg
  height: { min: 80, max: 250 },   // cm
};

export const ACTIVITY_LEVELS = {
  sedentary: { label: 'Sedentary (little/no exercise)', factor: 1.2 },
  light: { label: 'Light (1-3 days/week)', factor: 1.375 },
  moderate: { label: 'Moderate (3-5 days/week)', factor: 1.55 },
  active: { label: 'Very Active (6-7 days/week)', factor: 1.725 },
};

export const GENDERS = ['female', 'male'];

export const GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_TIMEOUT_MS = 45000;

/**
 * Vision calls get longer. A photo costs the model hundreds of image tokens to
 * read before it writes anything, and a 30B-class model working through a
 * receipt with several line items routinely spent more than the 45s a text
 * request needs — surfacing as "took too long to respond", which reads as a bad
 * connection rather than a request that was simply bigger.
 */
export const GEMINI_IMAGE_TIMEOUT_MS = 120000;

/* ------------------------------------------------------------- medicines */

/**
 * Hard cap on tracked medicines. Not an arbitrary number: every reminder time
 * becomes one OS-level scheduled alarm, and the notification id space below is
 * carved up assuming these bounds. Raising either means widening the id blocks
 * in `reminders.js` too, or ids start colliding and reminders silently
 * overwrite each other.
 */
export const MAX_MEDICINES = 15;
/** Reminder times per medicine — enough for a 6-times-daily course. */
export const MAX_TIMES_PER_MEDICINE = 6;
export const MAX_MEDICINE_NAME_LENGTH = 60;
export const MAX_MEDICINE_DOSE_LENGTH = 40;
export const MAX_MEDICINE_NOTE_LENGTH = 120;

/** How long a dose stays markable as taken, in either direction, in minutes. */
export const DOSE_WINDOW_MINUTES = 240;

/* --------------------------------------------------------- water reminders */

export const WATER_REMINDER_DEFAULTS = {
  enabled: false,
  startHour: 8,
  endHour: 22,
  everyMinutes: 120,
};
/** Bounds for the water reminder window. */
export const WATER_REMINDER_LIMITS = {
  hour: { min: 0, max: 23 },
  everyMinutes: { min: 30, max: 480 },
};
/**
 * Ceiling on generated water slots. Guards the alarm budget: a 0-23 window at
 * the 30-minute minimum would otherwise produce 47 daily alarms on its own.
 */
export const MAX_WATER_SLOTS = 12;

/** Choices offered in the UI, in minutes. */
export const WATER_INTERVAL_CHOICES = [30, 45, 60, 90, 120, 180, 240];
