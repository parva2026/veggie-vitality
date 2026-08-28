import { describe, it, expect } from 'vitest';
import {
  calculateBMI, calculateNeeds, computeTotals, pctOfGoal, healthScores,
  getRiskAnalysis, getRecommendations, calculateHistoricalStats, DEFAULT_GOALS,
} from './nutrition.js';
import { addDays, todayKey } from './dates.js';

const PROFILE = { name: 'Sam', age: 30, gender: 'female', weight: 60, height: 165, activity: 'light' };

describe('calculateBMI', () => {
  it('computes and categorises', () => {
    const bmi = calculateBMI(60, 165);
    expect(bmi.val).toBeCloseTo(22.04, 1);
    expect(bmi.cat).toBe('Normal');
  });

  it('does not divide by zero', () => {
    expect(calculateBMI(60, 0).val).toBeNull();
    expect(calculateBMI(0, 165).display).toBe('—');
    expect(calculateBMI(undefined, undefined).cat).toBe('Unknown');
  });
});

describe('calculateNeeds', () => {
  it('falls back to defaults for a missing or unusable profile', () => {
    expect(calculateNeeds(null)).toEqual(DEFAULT_GOALS);
    expect(calculateNeeds({ ...PROFILE, weight: 0 })).toEqual(DEFAULT_GOALS);
  });

  it('produces only finite positive targets', () => {
    const goals = calculateNeeds(PROFILE);
    for (const [key, value] of Object.entries(goals)) {
      expect(Number.isFinite(value), `${key} is finite`).toBe(true);
      expect(value, `${key} is positive`).toBeGreaterThan(0);
    }
  });

  it('reconciles macros so they sum to the calorie target', () => {
    for (const activity of ['sedentary', 'light', 'moderate', 'active']) {
      const g = calculateNeeds({ ...PROFILE, activity });
      const fromMacros = g.protein * 4 + g.carbs * 4 + g.fat * 9;
      // Within 3% — rounding to whole grams cannot land exactly.
      expect(Math.abs(fromMacros - g.calories) / g.calories).toBeLessThan(0.03);
    }
  });

  it('scales protein with activity level', () => {
    const sedentary = calculateNeeds({ ...PROFILE, activity: 'sedentary' });
    const active = calculateNeeds({ ...PROFILE, activity: 'active' });
    expect(active.protein).toBeGreaterThan(sedentary.protein);
  });

  it('gives menstruating-age women the higher iron target', () => {
    expect(calculateNeeds({ ...PROFILE, gender: 'female', age: 30 }).iron).toBe(18);
    expect(calculateNeeds({ ...PROFILE, gender: 'male', age: 30 }).iron).toBe(8);
    expect(calculateNeeds({ ...PROFILE, gender: 'female', age: 60 }).iron).toBe(8);
  });

  it('never goes below a survivable calorie floor', () => {
    const tiny = calculateNeeds({ ...PROFILE, weight: 20, height: 80, age: 120 });
    expect(tiny.calories).toBeGreaterThanOrEqual(1200);
  });
});

describe('computeTotals', () => {
  it('sums entries', () => {
    const totals = computeTotals([
      { calories: 100, protein: 5 },
      { calories: 50, protein: 2.5 },
    ]);
    expect(totals.calories).toBe(150);
    expect(totals.protein).toBe(7.5);
  });

  it('survives junk entries without producing NaN', () => {
    const totals = computeTotals([null, 'x', { calories: 'abc' }, { calories: NaN }, { calories: 10 }]);
    expect(totals.calories).toBe(10);
    for (const value of Object.values(totals)) expect(Number.isFinite(value)).toBe(true);
  });

  it('returns zeroes for a non-array', () => {
    expect(computeTotals(undefined).calories).toBe(0);
  });
});

describe('pctOfGoal', () => {
  it('never divides by zero', () => {
    expect(pctOfGoal(50, 0)).toBe(0);
    expect(pctOfGoal(50, undefined)).toBe(0);
    expect(pctOfGoal(50, 100)).toBe(50);
  });
});

describe('healthScores', () => {
  it('stays within 0-100 even for absurd intakes', () => {
    const goals = calculateNeeds(PROFILE);
    const scores = healthScores(computeTotals([{ protein: 5000, eaa: 5000, fiber: 900, b12: 500 }]), goals);
    for (const value of Object.values(scores)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

describe('getRiskAnalysis', () => {
  const goals = calculateNeeds(PROFILE);

  it('does not accuse an empty day of dehydration', () => {
    const risks = getRiskAnalysis(computeTotals([]), goals, 0);
    expect(risks.find((r) => r.id === 'water')).toBeUndefined();
  });

  it('flags high sodium', () => {
    const totals = computeTotals([{ calories: 500, sodium: 5000 }]);
    expect(getRiskAnalysis(totals, goals, 2000).find((r) => r.id === 'sodium')).toBeDefined();
  });
});

describe('getRecommendations', () => {
  it('prompts to log when the day is empty', () => {
    const recs = getRecommendations(computeTotals([]), calculateNeeds(PROFILE));
    expect(recs[0].id).toBe('start');
  });

  it('returns actionable, finite suggestions when nutrients are low', () => {
    const goals = calculateNeeds(PROFILE);
    const recs = getRecommendations(computeTotals([{ calories: 800, protein: 10, eaa: 3 }]), goals);
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) expect(rec.msg).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe('calculateHistoricalStats', () => {
  it('returns null with no history', () => {
    expect(calculateHistoricalStats({}, {}, 7)).toBeNull();
  });

  it('uses a real calendar window and excludes today', () => {
    const today = todayKey();
    const logs = {
      [today]: [{ calories: 9999, protein: 999 }],           // partial day, ignored
      [addDays(today, -1)]: [{ calories: 2000, protein: 60 }],
      [addDays(today, -2)]: [{ calories: 1000, protein: 40 }],
      [addDays(today, -40)]: [{ calories: 5000, protein: 300 }], // outside the window
    };
    const stats = calculateHistoricalStats(logs, {}, 7);
    expect(stats.daysTracked).toBe(2);
    expect(stats.avgCalories).toBe(1500);
    expect(stats.avgProtein).toBe(50);
  });

  it('counts a day that only has water', () => {
    const today = todayKey();
    const stats = calculateHistoricalStats({}, { [addDays(today, -1)]: 2000 }, 7);
    expect(stats.daysTracked).toBe(1);
    expect(stats.avgWater).toBe(2000);
  });
});
