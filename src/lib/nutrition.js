/**
 * Pure nutrition math. No React, no I/O — every function here is unit-testable.
 */

import { NUTRIENT_KEYS, ACTIVITY_LEVELS } from './constants.js';
import { REMEDIES } from './foodDatabase.js';
import { safeNum } from './schema.js';
import { addDays, todayKey } from './dates.js';

export const DEFAULT_GOALS = {
  calories: 2000, protein: 60, carbs: 250, fat: 56, fiber: 30, sugar: 50,
  sodium: 2300, iron: 18, calcium: 1000, b12: 2.4, vit_d: 600, vit_a: 900,
  vit_c: 90, vit_e: 15, vit_k: 120, folate: 400, eaa: 24, water: 2500,
};

export function calculateBMI(weightKg, heightCm) {
  const weight = safeNum(weightKg, 0);
  const height = safeNum(heightCm, 0);
  if (weight <= 0 || height <= 0) {
    return { val: null, display: '—', cat: 'Unknown', color: 'text-slate-400' };
  }
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  let cat, color;
  if (bmi < 18.5) { cat = 'Underweight'; color = 'text-blue-500'; }
  else if (bmi < 25) { cat = 'Normal'; color = 'text-emerald-500'; }
  else if (bmi < 30) { cat = 'Overweight'; color = 'text-amber-500'; }
  else { cat = 'Obese'; color = 'text-rose-500'; }
  return { val: bmi, display: bmi.toFixed(1), cat, color };
}

/** Protein target in g/kg bodyweight, scaled by how active the person is. */
const PROTEIN_PER_KG = { sedentary: 1.0, light: 1.2, moderate: 1.4, active: 1.6 };

/**
 * Daily targets from a validated profile.
 *
 * Macros are reconciled so they actually sum to the calorie target: protein is
 * set from bodyweight, fat takes 25% of calories, and carbs absorb whatever is
 * left (floored at 10% of calories). The original version assigned carbs 50%
 * and fat 25% independently of a bodyweight-derived protein figure, so the
 * three targets routinely summed to well over or under 100% of TDEE.
 */
export function calculateNeeds(profile) {
  if (!profile) return { ...DEFAULT_GOALS };

  const weight = safeNum(profile.weight, 0);
  const height = safeNum(profile.height, 0);
  const age = safeNum(profile.age, 0);
  if (weight <= 0 || height <= 0 || age <= 0) return { ...DEFAULT_GOALS };

  // Mifflin-St Jeor
  let bmr = 10 * weight + 6.25 * height - 5 * age;
  bmr += profile.gender === 'male' ? 5 : -161;

  const factor = ACTIVITY_LEVELS[profile.activity]?.factor ?? 1.2;
  const calories = Math.max(1200, Math.round(bmr * factor));

  const protein = Math.round(weight * (PROTEIN_PER_KG[profile.activity] ?? 1.2));
  const fat = Math.round((calories * 0.25) / 9);
  const remainingCal = calories - protein * 4 - fat * 9;
  const carbs = Math.max(Math.round((calories * 0.10) / 4), Math.round(remainingCal / 4));

  return {
    calories, protein, carbs, fat,
    fiber: Math.max(25, Math.round((calories / 1000) * 14)),
    sugar: Math.round((calories * 0.10) / 4),
    sodium: 2300,
    iron: profile.gender === 'female' && age < 51 ? 18 : 8,
    calcium: age > 50 ? 1200 : 1000,
    b12: 2.4,
    vit_d: age > 70 ? 800 : 600,
    vit_a: profile.gender === 'male' ? 900 : 700,
    vit_c: profile.gender === 'male' ? 90 : 75,
    vit_e: 15,
    vit_k: profile.gender === 'male' ? 120 : 90,
    folate: 400,
    eaa: Math.round(protein * 0.4),
    // ~35 ml/kg, bounded to sane values.
    water: Math.min(4000, Math.max(1500, Math.round((weight * 35) / 50) * 50)),
  };
}

/** Sum a day's entries into per-nutrient totals. Always returns finite numbers. */
export function computeTotals(entries) {
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  if (!Array.isArray(entries)) return totals;
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue;
    for (const key of NUTRIENT_KEYS) {
      totals[key] += safeNum(item[key], 0);
    }
  }
  return totals;
}

/** Safe percentage of a goal, 0 when the goal is missing or zero. */
export function pctOfGoal(current, goal) {
  const c = safeNum(current, 0);
  const g = safeNum(goal, 0);
  if (g <= 0) return 0;
  return (c / g) * 100;
}

export function healthScores(totals, goals) {
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  return {
    muscle: clamp(pctOfGoal(totals.protein, goals.protein) * 0.5 + pctOfGoal(totals.eaa, goals.eaa) * 0.5),
    heart: clamp(
      pctOfGoal(totals.fiber, goals.fiber) * 0.6 +
      Math.max(0, 100 - pctOfGoal(totals.sodium, goals.sodium)) * 0.4,
    ),
    brain: clamp(
      (pctOfGoal(totals.b12, goals.b12) +
       pctOfGoal(totals.iron, goals.iron) +
       pctOfGoal(totals.vit_d, goals.vit_d)) / 3,
    ),
  };
}

/**
 * Risk flags for the day. `hasFoodLogged` gates the dehydration warning so an
 * empty day does not accuse the user of being severely dehydrated purely
 * because they have not tapped the water button yet.
 */
export function getRiskAnalysis(totals, goals, waterIntake) {
  const risks = [];
  const water = safeNum(waterIntake, 0);
  const hasFoodLogged = safeNum(totals.calories, 0) > 0;

  if (goals.sodium > 0 && totals.sodium > goals.sodium) {
    risks.push({
      id: 'sodium', level: 'high',
      behavior: `High sodium (${Math.round(totals.sodium)}mg of ${goals.sodium}mg)`,
      consequence: 'Raises blood pressure and strains the heart over time.',
    });
  }
  if (goals.sugar > 0 && totals.sugar > goals.sugar) {
    risks.push({
      id: 'sugar', level: 'medium',
      behavior: `Excess sugar (${Math.round(totals.sugar)}g of ${goals.sugar}g)`,
      consequence: 'Sharper insulin spikes and more inflammation.',
    });
  }
  if (totals.protein > 20 && totals.eaa / totals.protein < 0.3) {
    risks.push({
      id: 'eaa', level: 'medium',
      behavior: 'Incomplete protein mix',
      consequence: 'Weaker muscle repair. Combine grains with legumes or dairy.',
    });
  }
  if (hasFoodLogged && totals.calories > 1200 && water > 0 && water < goals.water * 0.5) {
    risks.push({
      id: 'water', level: 'medium',
      behavior: `Low hydration (${Math.round(water)}ml of ${goals.water}ml)`,
      consequence: 'Fatigue, poorer concentration and extra load on the kidneys.',
    });
  }
  if (goals.fiber > 0 && hasFoodLogged && totals.calories > goals.calories * 0.8 && totals.fiber < goals.fiber * 0.4) {
    risks.push({
      id: 'fiber', level: 'low',
      behavior: `Very low fiber (${Math.round(totals.fiber)}g of ${goals.fiber}g)`,
      consequence: 'Poorer digestion and less stable blood sugar.',
    });
  }
  return risks;
}

export function getRecommendations(totals, goals) {
  if (safeNum(totals.calories, 0) === 0) {
    return [{ id: 'start', msg: 'Log a meal to get personalised suggestions.', priority: 0 }];
  }

  const recs = [];
  const addGap = (key, label, priority) => {
    const goal = safeNum(goals[key], 0);
    if (goal <= 0) return;
    const current = safeNum(totals[key], 0);
    if (current >= goal * 0.7) return;
    const remedy = REMEDIES[key];
    if (!remedy || !(remedy.density > 0)) return;

    const deficit = goal - current;
    const grams = (deficit / remedy.density) * 100;
    const units = remedy.unit_weight ? grams / remedy.unit_weight : null;
    const amount = units !== null && units >= 0.2
      ? `${units < 1 ? units.toFixed(1) : Math.round(units * 2) / 2} ${remedy.unit_name}`
      : `${Math.round(grams)}g of ${remedy.food}`;
    recs.push({ id: key, msg: `Low ${label}: add about ${amount}.`, priority });
  };

  if (safeNum(totals.eaa, 0) < safeNum(goals.eaa, 0) * 0.7) {
    recs.push({ id: 'eaa', msg: 'Protein quality is low: add paneer, tofu, soy or quinoa.', priority: 1 });
  } else {
    addGap('protein', 'protein', 2);
  }
  addGap('iron', 'iron', 2);
  addGap('fiber', 'fiber', 2);
  addGap('calcium', 'calcium', 3);
  addGap('b12', 'vitamin B12', 3);
  addGap('vit_c', 'vitamin C', 4);

  if (recs.length === 0) {
    return [{ id: 'good', msg: 'Well balanced today — nothing to fix.', priority: 0 }];
  }
  return recs.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

/**
 * Rolling averages over a real calendar window.
 *
 * The original took `Object.keys(logs).slice(-7)` — the last seven days that
 * happened to have entries, which could span months while still being labelled
 * "7-day average". It also only counted water on days that had food logged,
 * and folded today's partial day into the average.
 *
 * Here the window is the `days` calendar days ending yesterday, today is
 * excluded as incomplete, and a day counts as tracked if it has food OR water.
 */
export function calculateHistoricalStats(logs, waterLogs, days = 7, endKey = null) {
  const end = endKey ?? addDays(todayKey(), -1);
  const sums = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, water: 0 };
  let trackedDays = 0;

  for (let i = 0; i < days; i += 1) {
    const dateKey = addDays(end, -i);
    const entries = logs?.[dateKey];
    const water = safeNum(waterLogs?.[dateKey], 0);
    const hasFood = Array.isArray(entries) && entries.length > 0;
    if (!hasFood && water <= 0) continue;

    trackedDays += 1;
    if (hasFood) {
      const dayTotals = computeTotals(entries);
      sums.calories += dayTotals.calories;
      sums.protein += dayTotals.protein;
      sums.carbs += dayTotals.carbs;
      sums.fat += dayTotals.fat;
      sums.fiber += dayTotals.fiber;
    }
    sums.water += water;
  }

  if (trackedDays === 0) return null;

  return {
    windowDays: days,
    daysTracked: trackedDays,
    avgCalories: Math.round(sums.calories / trackedDays),
    avgProtein: Math.round(sums.protein / trackedDays),
    avgCarbs: Math.round(sums.carbs / trackedDays),
    avgFat: Math.round(sums.fat / trackedDays),
    avgFiber: Math.round(sums.fiber / trackedDays),
    avgWater: Math.round(sums.water / trackedDays),
  };
}
