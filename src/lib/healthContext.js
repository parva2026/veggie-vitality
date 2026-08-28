/**
 * Builds the data block handed to the nutrition assistant.
 *
 * Kept out of the component so it can be tested, and so the prompt cannot
 * accidentally start reading raw component state. Only derived, numeric
 * summaries go in — never the API key, and never anything not shown in the UI.
 */

import { calculateBMI, computeTotals, calculateHistoricalStats, getRiskAnalysis } from './nutrition.js';
import { addDays, formatDateLabel } from './dates.js';
import { safeNum } from './schema.js';

const round = (n) => Math.round(safeNum(n, 0));

export function buildHealthContext({
  profile, goals, logs, waterLogs, weightHistory, currentDate,
}) {
  const entries = logs?.[currentDate] ?? [];
  const totals = computeTotals(entries);
  const water = safeNum(waterLogs?.[currentDate], 0);
  const bmi = calculateBMI(profile?.weight, profile?.height);
  const stats = calculateHistoricalStats(logs, waterLogs, 7);

  const weekLines = [];
  for (let i = 1; i <= 7; i += 1) {
    const key = addDays(currentDate, -i);
    const dayEntries = logs?.[key];
    if (!Array.isArray(dayEntries) || dayEntries.length === 0) continue;
    const t = computeTotals(dayEntries);
    weekLines.push(`  ${key}: ${round(t.calories)} kcal, ${round(t.protein)}g protein, ${round(t.fiber)}g fiber, ${round(safeNum(waterLogs?.[key], 0))}ml water`);
  }

  const recentWeights = (weightHistory ?? []).slice(-6).map((w) => `  ${w.date}: ${w.weight}kg`);
  const risks = getRiskAnalysis(totals, goals, water);

  return `PROFILE
  Name: ${profile?.name ?? 'unknown'}
  Age: ${profile?.age ?? '?'}   Gender: ${profile?.gender ?? '?'}
  Height: ${profile?.height ?? '?'}cm   Weight: ${profile?.weight ?? '?'}kg
  BMI: ${bmi.display} (${bmi.cat})
  Activity level: ${profile?.activity ?? '?'}

DAILY TARGETS
  Calories ${goals.calories} kcal | Protein ${goals.protein}g (EAA ${goals.eaa}g) | Carbs ${goals.carbs}g | Fat ${goals.fat}g
  Fiber ${goals.fiber}g | Sugar <= ${goals.sugar}g | Sodium <= ${goals.sodium}mg | Water ${goals.water}ml
  Iron ${goals.iron}mg | Calcium ${goals.calcium}mg | B12 ${goals.b12}mcg | Vit D ${goals.vit_d}IU | Vit A ${goals.vit_a}mcg RAE | Vit C ${goals.vit_c}mg

INTAKE ON ${currentDate} (${formatDateLabel(currentDate)})
  Calories ${round(totals.calories)} / ${goals.calories} kcal
  Protein ${round(totals.protein)}g (EAA ${round(totals.eaa)}g) | Carbs ${round(totals.carbs)}g | Fat ${round(totals.fat)}g
  Fiber ${round(totals.fiber)}g | Sugar ${round(totals.sugar)}g | Sodium ${round(totals.sodium)}mg
  Iron ${round(totals.iron)}mg | Calcium ${round(totals.calcium)}mg | B12 ${safeNum(totals.b12).toFixed(1)}mcg | Vit D ${round(totals.vit_d)}IU
  Vit A ${round(totals.vit_a)}mcg RAE | Vit C ${round(totals.vit_c)}mg | Folate ${round(totals.folate)}mcg
  Water ${round(water)}ml

FOODS LOGGED ON ${currentDate}
${entries.length ? entries.map((f) => `  ${f.name} (${round(f.weight)}g): ${round(f.calories)} kcal, ${safeNum(f.protein).toFixed(1)}g protein`).join('\n') : '  (nothing logged)'}

PREVIOUS 7 DAYS
${weekLines.length ? weekLines.join('\n') : '  (no earlier days logged)'}

7-DAY AVERAGE (excluding today)
${stats
    ? `  ${stats.avgCalories} kcal/day, ${stats.avgProtein}g protein/day, ${stats.avgFiber}g fiber/day, ${stats.avgWater}ml water/day (over ${stats.daysTracked} tracked day${stats.daysTracked === 1 ? '' : 's'})`
    : '  (not enough history yet)'}

WEIGHT HISTORY
${recentWeights.length ? recentWeights.join('\n') : '  (no weigh-ins recorded)'}

FLAGS RAISED TODAY
${risks.length ? risks.map((r) => `  ${r.behavior} - ${r.consequence}`).join('\n') : '  (none)'}`;
}
