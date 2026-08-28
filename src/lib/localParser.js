/**
 * Offline food parser — the fallback when no API key is configured.
 *
 * Improvements over the original one-line matcher:
 *  - understands units (g, kg, ml, cup, bowl, tbsp, piece...) instead of
 *    treating any digit as grams, so "2 cups rice" is no longer 2 grams
 *  - only reads a quantity attached to the matched food, not any stray digit
 *  - supports aliases (dal, palak, curd, chana...)
 *  - emits entries through `normalizeFoodEntry`, like every other source
 */

import { FOOD_DATABASE, FOOD_ALIASES } from './foodDatabase.js';
import { normalizeFoodEntry } from './schema.js';

/** Approximate gram weight of common household measures. */
const UNIT_GRAMS = {
  g: 1, gram: 1, grams: 1, gm: 1, gms: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogram: 1000, kilograms: 1000,
  mg: 0.001,
  ml: 1, milliliter: 1, millilitre: 1, l: 1000, litre: 1000, liter: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35, lb: 453.6, lbs: 453.6, pound: 453.6,
  cup: 200, cups: 200,
  bowl: 250, bowls: 250,
  glass: 240, glasses: 240,
  plate: 300, plates: 300,
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  handful: 30, handfuls: 30,
  slice: 30, slices: 30,
  piece: 50, pieces: 50, pcs: 50, pc: 50,
  serving: 100, servings: 100,
  scoop: 30, scoops: 30,
};

/** Default portion in grams when the user gives no quantity at all. */
const DEFAULT_PORTION_G = 100;

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, quarter: 0.25,
};

/** Longest keys first so "potato chips" wins over "potato". */
const SEARCH_KEYS = [
  ...Object.keys(FOOD_DATABASE).map((k) => [k, k]),
  ...Object.entries(FOOD_ALIASES),
].sort((a, b) => b[0].length - a[0].length);

function parseQuantity(text) {
  // "1 1/2", "1.5", "3/4", or a word number, optionally followed by a unit.
  const pattern = new RegExp(
    String.raw`(?:^|\s)(?:(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)|(${Object.keys(WORD_NUMBERS).join('|')}))` +
    String.raw`\s*([a-z]+)?`,
    'i',
  );
  const match = text.match(pattern);
  if (!match) return null;

  let value;
  if (match[1] && match[2]) value = Number(match[1]) / Number(match[2]);
  else if (match[3]) value = Number(match[3]);
  else if (match[4]) value = WORD_NUMBERS[match[4].toLowerCase()];
  if (!Number.isFinite(value) || value <= 0) return null;

  const unitWord = (match[5] || '').toLowerCase();
  const unitGrams = UNIT_GRAMS[unitWord];
  if (unitGrams !== undefined) return { grams: value * unitGrams, explicit: true };

  // A bare number with no recognised unit means grams if it is large enough to
  // plausibly be a weight, otherwise a count of default-sized portions
  // ("2 rotis" -> 2 portions, "200 rice" -> 200 grams).
  if (value >= 20) return { grams: value, explicit: true };
  return { grams: value * DEFAULT_PORTION_G, explicit: true };
}

function titleCase(str) {
  return str.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Parse free text into normalized food entries using the offline database. */
export function parseLocalMulti(text) {
  if (typeof text !== 'string' || !text.trim()) return [];

  const segments = text.split(/,|;|\band\b|\bwith\b|\+|&|\n/i);
  const items = [];
  const usedKeys = new Set();

  for (const segment of segments) {
    const clean = segment.trim().toLowerCase();
    if (!clean) continue;

    const found = SEARCH_KEYS.find(([searchTerm]) => {
      const boundary = new RegExp(`(^|[^a-z])${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
      return boundary.test(clean);
    });
    if (!found) continue;

    const [matchedTerm, dbKey] = found;
    // Don't log the same food twice from one sentence.
    if (usedKeys.has(dbKey)) continue;
    usedKeys.add(dbKey);

    const food = FOOD_DATABASE[dbKey];
    if (!food) continue;

    const wantsRaw = /\braw\b|\buncooked\b|\bdry\b/.test(clean);
    const base = (wantsRaw ? food.raw : food.cooked) ?? food.cooked ?? food.raw;
    if (!base) continue;

    // Only consider text before the food word as its quantity, so
    // "rice and 2 rotis" does not give the rice a weight of 2.
    const beforeFood = clean.slice(0, clean.indexOf(matchedTerm));
    const quantity = parseQuantity(beforeFood) ?? parseQuantity(clean);
    const grams = quantity?.grams ?? DEFAULT_PORTION_G;
    const factor = grams / 100;

    const entry = { name: titleCase(dbKey), weight: grams, state: wantsRaw ? 'raw' : 'cooked', source: 'local-db' };
    for (const [key, value] of Object.entries(base)) {
      if (key === 'eaa_factor') continue;
      entry[key] = value * factor;
    }
    entry.eaa = (base.protein ?? 0) * factor * (base.eaa_factor ?? 0.4);

    const normalized = normalizeFoodEntry(entry, { source: 'local-db' });
    if (normalized) items.push(normalized);
  }

  return items;
}

/** Names the offline database can recognise, for the empty-state hint. */
export function knownFoodNames() {
  return Object.keys(FOOD_DATABASE).sort();
}
