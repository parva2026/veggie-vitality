import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { Modal } from './ui.jsx';
import { calculateHistoricalStats, computeTotals } from '../lib/nutrition.js';
import { addDays, todayKey, formatDateLabel } from '../lib/dates.js';

const WINDOWS = [7, 30];

function Stat({ label, value, unit, goal }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">
        {value}<span className="text-xs font-normal text-slate-400 ml-0.5">{unit}</span>
      </div>
      {goal !== undefined && <div className="text-[10px] text-slate-400">target {goal}{unit}</div>}
    </div>
  );
}

export function HistoryModal({ onClose, logs, waterLogs, weightHistory, goals, onSelectDate }) {
  const [windowDays, setWindowDays] = useState(7);

  const stats = useMemo(
    () => calculateHistoricalStats(logs, waterLogs, windowDays),
    [logs, waterLogs, windowDays],
  );

  // Days in the window that have anything recorded, newest first.
  const days = useMemo(() => {
    const end = todayKey();
    const out = [];
    for (let i = 0; i < windowDays + 1; i += 1) {
      const key = addDays(end, -i);
      const entries = logs?.[key];
      const water = waterLogs?.[key] ?? 0;
      if ((!Array.isArray(entries) || entries.length === 0) && water <= 0) continue;
      out.push({ key, totals: computeTotals(entries ?? []), water, count: entries?.length ?? 0 });
    }
    return out;
  }, [logs, waterLogs, windowDays]);

  const weights = useMemo(() => [...(weightHistory ?? [])].slice(-10).reverse(), [weightHistory]);

  return (
    <Modal title="History" icon={TrendingUp} onClose={onClose} maxWidth="max-w-lg">
      <div
        className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-4"
        role="tablist"
        aria-label="History window"
      >
        {WINDOWS.map((days_) => (
          <button
            key={days_}
            type="button"
            role="tab"
            aria-selected={windowDays === days_}
            onClick={() => setWindowDays(days_)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium ${
              windowDays === days_
                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-sm'
                : 'text-slate-500'
            }`}
          >
            Last {days_} days
          </button>
        ))}
      </div>

      {stats ? (
        <>
          <p className="text-xs text-slate-400 mb-2">
            Averages over {stats.daysTracked} tracked day{stats.daysTracked === 1 ? '' : 's'},
            excluding today.
          </p>
          <div className="grid grid-cols-3 gap-2 mb-5">
            <Stat label="Calories" value={stats.avgCalories} unit="" goal={goals.calories} />
            <Stat label="Protein" value={stats.avgProtein} unit="g" goal={goals.protein} />
            <Stat label="Fiber" value={stats.avgFiber} unit="g" goal={goals.fiber} />
            <Stat label="Carbs" value={stats.avgCarbs} unit="g" />
            <Stat label="Fat" value={stats.avgFat} unit="g" />
            <Stat label="Water" value={stats.avgWater} unit="ml" goal={goals.water} />
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
          No completed days logged in this window yet. Averages appear once you have logged a
          full day.
        </p>
      )}

      <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Days</h3>
      {days.length === 0 ? (
        <p className="text-xs text-slate-400 mb-5">Nothing recorded yet.</p>
      ) : (
        <ul className="space-y-1 mb-5 max-h-60 overflow-y-auto">
          {days.map((day) => (
            <li key={day.key}>
              <button
                type="button"
                onClick={() => { onSelectDate(day.key); onClose(); }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                  {formatDateLabel(day.key)}
                </span>
                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                  {Math.round(day.totals.calories)} kcal · {day.count} item{day.count === 1 ? '' : 's'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Weight</h3>
      {weights.length === 0 ? (
        <p className="text-xs text-slate-400">No weigh-ins recorded.</p>
      ) : (
        <ul className="space-y-1">
          {weights.map((w) => (
            <li key={w.date} className="flex justify-between text-xs px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800">
              <span className="text-slate-500">{formatDateLabel(w.date)}</span>
              <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">{w.weight} kg</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
