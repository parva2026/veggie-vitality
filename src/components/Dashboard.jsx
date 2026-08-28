import { useMemo, useState } from 'react';
import {
  Activity, Heart, Brain, Droplets, Trash2, Plus, Minus, Scale, Sparkles,
} from 'lucide-react';
import { ProgressBar, HealthCard, RiskAlert } from './ui.jsx';
import { NUTRIENT_UNITS } from '../lib/constants.js';
import {
  calculateBMI, healthScores, getRiskAnalysis, getRecommendations,
} from '../lib/nutrition.js';

const MICROS = [
  ['iron', 'Iron', 'bg-rose-400'],
  ['calcium', 'Calcium', 'bg-slate-400'],
  ['b12', 'Vitamin B12', 'bg-purple-400'],
  ['vit_d', 'Vitamin D', 'bg-amber-400'],
  ['vit_a', 'Vitamin A', 'bg-orange-400'],
  ['vit_c', 'Vitamin C', 'bg-lime-400'],
  ['folate', 'Folate', 'bg-teal-400'],
  ['vit_k', 'Vitamin K', 'bg-green-400'],
];

const WATER_STEP_ML = 250;

export function Dashboard({
  profile, goals, totals, entries, water, onRemoveEntry, onAdjustWater,
  onRecordWeight, onNotify,
}) {
  const [weightInput, setWeightInput] = useState('');

  const bmi = useMemo(() => calculateBMI(profile?.weight, profile?.height), [profile]);
  const scores = useMemo(() => healthScores(totals, goals), [totals, goals]);
  const risks = useMemo(() => getRiskAnalysis(totals, goals, water), [totals, goals, water]);
  const recs = useMemo(() => getRecommendations(totals, goals), [totals, goals]);

  const submitWeight = (e) => {
    e.preventDefault();
    const error = onRecordWeight(weightInput);
    if (error) { onNotify({ type: 'error', message: error }); return; }
    setWeightInput('');
    onNotify({ type: 'success', message: 'Weight recorded.' });
  };

  return (
    <div className="p-4 space-y-4 pb-6">
      {/* ---------------------------------------------------------- summary */}
      <section className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
          <div className="text-xs text-slate-400 mb-1">BMI</div>
          <div className={`text-2xl font-bold tabular-nums ${bmi.color}`}>{bmi.display}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{bmi.cat}</div>
        </div>
        <form onSubmit={submitWeight} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
          <label htmlFor="weigh-in" className="text-xs text-slate-400 mb-1 flex items-center gap-1">
            <Scale className="w-3 h-3" aria-hidden="true" /> Today&apos;s weight
          </label>
          <div className="flex gap-1.5">
            <input
              id="weigh-in"
              type="number" inputMode="decimal" step="0.1"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              placeholder={String(profile?.weight ?? '')}
              className="w-full min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm tabular-nums"
            />
            <button
              type="submit"
              className="px-2.5 rounded-lg bg-slate-800 dark:bg-slate-600 text-white text-xs font-medium shrink-0"
            >
              Save
            </button>
          </div>
        </form>
      </section>

      {/* ------------------------------------------------------------ risks */}
      {risks.length > 0 && (
        <section className="space-y-2" aria-label="Warnings">
          {risks.map((risk) => <RiskAlert key={risk.id} risk={risk} />)}
        </section>
      )}

      {/* ----------------------------------------------------------- scores */}
      <section className="space-y-3" aria-label="Health scores">
        <HealthCard
          icon={Activity} title="Muscle" score={scores.muscle}
          colorClass="bg-emerald-500" textClass="text-emerald-600"
          label="Protein quantity and amino acid quality"
        />
        <HealthCard
          icon={Heart} title="Heart" score={scores.heart}
          colorClass="bg-rose-500" textClass="text-rose-600"
          label="Fiber intake versus sodium load"
        />
        <HealthCard
          icon={Brain} title="Brain" score={scores.brain}
          colorClass="bg-purple-500" textClass="text-purple-600"
          label="B12, iron and vitamin D"
        />
      </section>

      {/* ------------------------------------------------------------ water */}
      <section className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Droplets className="w-5 h-5 text-blue-500 shrink-0" aria-hidden="true" />
            <span className="font-bold text-sm text-slate-700 dark:text-slate-200">Water</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onAdjustWater(-WATER_STEP_ML)}
              disabled={water <= 0}
              aria-label="Remove 250 millilitres of water"
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 disabled:opacity-40"
            >
              <Minus className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="text-sm font-bold tabular-nums text-blue-600 w-20 text-center">
              {Math.round(water)}ml
            </span>
            <button
              type="button"
              onClick={() => onAdjustWater(WATER_STEP_ML)}
              aria-label="Add 250 millilitres of water"
              className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 hover:bg-blue-200"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <ProgressBar label="Hydration" current={water} target={goals.water} colorClass="bg-blue-500" unit="ml" />
      </section>

      {/* ----------------------------------------------------------- macros */}
      <section className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
        <h2 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-3">Macronutrients</h2>
        <ProgressBar label="Calories" current={totals.calories} target={goals.calories} colorClass="bg-emerald-500" unit="kcal" />
        <ProgressBar label="Protein" current={totals.protein} target={goals.protein} colorClass="bg-sky-500" unit="g" />
        <ProgressBar label="Essential amino acids" current={totals.eaa} target={goals.eaa} colorClass="bg-indigo-500" unit="g" />
        <ProgressBar label="Carbs" current={totals.carbs} target={goals.carbs} colorClass="bg-amber-500" unit="g" />
        <ProgressBar label="Fat" current={totals.fat} target={goals.fat} colorClass="bg-orange-500" unit="g" />
        <ProgressBar label="Fiber" current={totals.fiber} target={goals.fiber} colorClass="bg-lime-500" unit="g" />
        <ProgressBar label="Sugar" current={totals.sugar} target={goals.sugar} colorClass="bg-pink-500" unit="g" />
        <ProgressBar label="Sodium" current={totals.sodium} target={goals.sodium} colorClass="bg-red-500" unit="mg" />
      </section>

      {/* ----------------------------------------------------------- micros */}
      <section className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
        <h2 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-3">Micronutrients</h2>
        <div className="grid sm:grid-cols-2 sm:gap-x-4">
          {MICROS.map(([key, label, color]) => (
            <ProgressBar
              key={key} isMicro label={label}
              current={totals[key]} target={goals[key]}
              colorClass={color} unit={NUTRIENT_UNITS[key]}
            />
          ))}
        </div>
      </section>

      {/* -------------------------------------------------- recommendations */}
      <section className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900">
        <h2 className="font-bold text-sm text-emerald-900 dark:text-emerald-200 mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4" aria-hidden="true" /> Suggestions
        </h2>
        <ul className="space-y-1.5">
          {recs.map((rec) => (
            <li key={rec.id} className="text-xs text-emerald-800 dark:text-emerald-200 leading-relaxed">
              • {rec.msg}
            </li>
          ))}
        </ul>
      </section>

      {/* --------------------------------------------------------- food log */}
      <section className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm">
        <h2 className="font-bold text-sm text-slate-700 dark:text-slate-200 mb-3">
          Logged food ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing logged for this day yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {entries.map((item) => (
              <li key={item.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                    {item.name}
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    {Math.round(item.weight)}g · {Math.round(item.calories)} kcal · {item.protein.toFixed(1)}g protein
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveEntry(item.id)}
                  aria-label={`Remove ${item.name}`}
                  className="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 shrink-0"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[10px] text-slate-400 text-center leading-relaxed px-4">
        Nutrition estimates are approximate and this app does not provide medical advice.
      </p>
    </div>
  );
}
