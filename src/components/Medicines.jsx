import { useState } from 'react';
import {
  Pill, Plus, Trash2, Bell, BellOff, Check, Clock, X, Pencil, Droplets,
  AlertTriangle,
} from 'lucide-react';

import { Field } from './ui.jsx';
import { inputClass } from './styles.js';
import {
  MAX_MEDICINES, MAX_TIMES_PER_MEDICINE, MAX_MEDICINE_NAME_LENGTH,
  MAX_MEDICINE_DOSE_LENGTH, MAX_MEDICINE_NOTE_LENGTH,
  WATER_INTERVAL_CHOICES, WATER_REMINDER_LIMITS,
} from '../lib/constants.js';
import {
  normalizeTimes, formatTimeLabel, doseStatus, doseProgress, waterSlots, parseTime,
} from '../lib/reminders.js';
import { isToday } from '../lib/dates.js';
import { sendTestNotification } from '../lib/notifications.js';

const STATUS_STYLE = {
  taken: 'bg-emerald-600 border-emerald-600 text-white',
  due: 'bg-amber-50 dark:bg-amber-950/50 border-amber-400 text-amber-900 dark:text-amber-200',
  missed: 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-800 dark:text-rose-200',
  upcoming: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
};

const STATUS_WORD = {
  taken: 'taken', due: 'due now', missed: 'missed', upcoming: 'upcoming',
};

/* ---------------------------------------------------------------- add/edit */

const BLANK = { name: '', dose: '', note: '', times: [] };

function MedicineForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [draft, setDraft] = useState(() => ({ ...BLANK, ...initial }));
  const [timeDraft, setTimeDraft] = useState('');
  const [errors, setErrors] = useState({});

  const times = normalizeTimes(draft.times);
  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));

  const addTime = () => {
    if (!parseTime(timeDraft)) {
      setErrors((e) => ({ ...e, time: 'Pick a time first.' }));
      return;
    }
    if (times.length >= MAX_TIMES_PER_MEDICINE) {
      setErrors((e) => ({ ...e, time: `Up to ${MAX_TIMES_PER_MEDICINE} times per medicine.` }));
      return;
    }
    setErrors((e) => ({ ...e, time: undefined }));
    set('times', normalizeTimes([...times, timeDraft]));
    setTimeDraft('');
  };

  const submit = (event) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setErrors({ name: 'Enter a name for the medicine.' });
      return;
    }
    onSubmit({ ...draft, times });
  };

  return (
    <form onSubmit={submit} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-3">
      <Field label="Medicine name" error={errors.name} htmlFor="med-name">
        <input
          id="med-name"
          className={inputClass(Boolean(errors.name))}
          value={draft.name}
          maxLength={MAX_MEDICINE_NAME_LENGTH}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Vitamin B12"
          autoComplete="off"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Dose" hint="Optional" htmlFor="med-dose">
          <input
            id="med-dose"
            className={inputClass(false)}
            value={draft.dose}
            maxLength={MAX_MEDICINE_DOSE_LENGTH}
            onChange={(e) => set('dose', e.target.value)}
            placeholder="1 tablet"
            autoComplete="off"
          />
        </Field>
        <Field label="Note" hint="Optional" htmlFor="med-note">
          <input
            id="med-note"
            className={inputClass(false)}
            value={draft.note}
            maxLength={MAX_MEDICINE_NOTE_LENGTH}
            onChange={(e) => set('note', e.target.value)}
            placeholder="After food"
            autoComplete="off"
          />
        </Field>
      </div>

      <Field
        label="Reminder times"
        error={errors.time}
        hint={`Up to ${MAX_TIMES_PER_MEDICINE}. Each one repeats every day.`}
        htmlFor="med-time"
      >
        <div className="flex gap-2">
          <input
            id="med-time"
            type="time"
            className={inputClass(Boolean(errors.time))}
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
          />
          <button
            type="button"
            onClick={addTime}
            className="px-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 shrink-0"
          >
            Add
          </button>
        </div>
      </Field>

      {times.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {times.map((time) => (
            <li key={time}>
              <span className="inline-flex items-center gap-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full pl-2.5 pr-1 py-1">
                {formatTimeLabel(time)}
                <button
                  type="button"
                  onClick={() => set('times', times.filter((t) => t !== time))}
                  aria-label={`Remove the ${formatTimeLabel(time)} reminder`}
                  className="p-0.5 rounded-full text-slate-400 hover:text-rose-600"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 text-sm rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- medicine row */

function MedicineCard({
  medicine, takenTimes, nowMinutes, viewingToday, onToggleDose, onEdit, onRemove, onToggleReminders,
}) {
  const times = normalizeTimes(medicine.times);

  return (
    <li className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{medicine.name}</p>
          {(medicine.dose || medicine.note) && (
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {[medicine.dose, medicine.note].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onToggleReminders(!medicine.remindersEnabled)}
            disabled={times.length === 0}
            aria-pressed={medicine.remindersEnabled}
            aria-label={medicine.remindersEnabled
              ? `Turn off reminders for ${medicine.name}`
              : `Turn on reminders for ${medicine.name}`}
            title={times.length === 0 ? 'Add a time first' : 'Reminders'}
            className={`p-2 rounded-lg disabled:opacity-30 ${
              medicine.remindersEnabled
                ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {medicine.remindersEnabled
              ? <Bell className="w-4 h-4" aria-hidden="true" />
              : <BellOff className="w-4 h-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${medicine.name}`}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Pencil className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${medicine.name}`}
            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {times.length === 0 ? (
        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
          <Clock className="w-3 h-3" aria-hidden="true" /> No times set — edit to add one.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2 mt-3">
          {times.map((time) => {
            const status = doseStatus({
              time, takenTimes, nowMinutes, isToday: viewingToday,
            });
            return (
              <li key={time}>
                <button
                  type="button"
                  onClick={() => onToggleDose(time, status !== 'taken')}
                  aria-pressed={status === 'taken'}
                  aria-label={`${formatTimeLabel(time)} dose of ${medicine.name}, ${STATUS_WORD[status]}`}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full border px-2.5 py-1.5 transition-colors ${STATUS_STYLE[status]}`}
                >
                  {status === 'taken'
                    ? <Check className="w-3 h-3" aria-hidden="true" />
                    : <Clock className="w-3 h-3" aria-hidden="true" />}
                  {formatTimeLabel(time)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/* --------------------------------------------------------- water reminders */

function WaterReminderCard({ settings, onChange }) {
  const slots = waterSlots(settings);
  const { hour } = WATER_REMINDER_LIMITS;
  const hours = Array.from({ length: hour.max - hour.min + 1 }, (_, i) => i + hour.min);

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Droplets className="w-4 h-4 text-blue-500" aria-hidden="true" />
          Water reminders
        </h3>
        <label className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="w-4 h-4 accent-blue-600"
          />
          {settings.enabled ? 'On' : 'Off'}
        </label>
      </div>

      {settings.enabled && (
        <>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Field label="From" htmlFor="water-start">
              <select
                id="water-start"
                className={inputClass(false)}
                value={settings.startHour}
                onChange={(e) => onChange({ startHour: Number(e.target.value) })}
              >
                {hours.map((h) => <option key={h} value={h}>{formatTimeLabel(`${String(h).padStart(2, '0')}:00`)}</option>)}
              </select>
            </Field>
            <Field label="Until" htmlFor="water-end">
              <select
                id="water-end"
                className={inputClass(false)}
                value={settings.endHour}
                onChange={(e) => onChange({ endHour: Number(e.target.value) })}
              >
                {hours.map((h) => <option key={h} value={h}>{formatTimeLabel(`${String(h).padStart(2, '0')}:00`)}</option>)}
              </select>
            </Field>
            <Field label="Every" htmlFor="water-every">
              <select
                id="water-every"
                className={inputClass(false)}
                value={settings.everyMinutes}
                onChange={(e) => onChange({ everyMinutes: Number(e.target.value) })}
              >
                {WATER_INTERVAL_CHOICES.map((m) => (
                  <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr`}</option>
                ))}
              </select>
            </Field>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {slots.length === 0
              ? 'No reminders fall inside that window.'
              : `${slots.length} reminder${slots.length === 1 ? '' : 's'} a day: ${slots.map(formatTimeLabel).join(', ')}`}
          </p>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ panel */

/**
 * Medicines and reminders.
 *
 * Marking a dose is bound to the date being viewed, not to "now", so a dose
 * missed yesterday can still be recorded from the history view — but the status
 * colours only claim "due" on today, since "due at 8am" is meaningless on a past
 * date.
 */
export function Medicines({
  medicines, medLogs, waterReminder, currentDate, reminders,
  onAdd, onUpdate, onToggleDose, onWaterReminderChange, onNotify, onRequestRemove,
}) {
  const [mode, setMode] = useState(null); // null | 'add' | medicineId

  const viewingToday = isToday(currentDate);
  const takenForDay = medLogs[currentDate] ?? {};
  // Recomputed each render rather than memoised: it is two field reads, and a
  // stale value here would show a dose as upcoming after it had come due.
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const progress = doseProgress(medicines, takenForDay);
  const atCap = medicines.length >= MAX_MEDICINES;

  const handleAdd = (draft) => {
    const error = onAdd(draft);
    if (error) { onNotify({ type: 'error', message: error }); return; }
    setMode(null);
    onNotify({ type: 'success', message: `${draft.name.trim()} added.` });
  };

  const handleEdit = (id, draft) => {
    onUpdate(id, draft);
    setMode(null);
  };

  const needsPermission = reminders.supported && reminders.permission !== 'granted';
  const hasAnyReminder = reminders.schedule.length > 0;

  return (
    <div className="p-4 space-y-4 pb-8">
      {/* ------------------------------------------------ permission banner */}
      {!reminders.supported && (
        <p className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          This device cannot show reminders. You can still track medicines and mark doses.
        </p>
      )}

      {needsPermission && hasAnyReminder && (
        <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900 rounded-xl p-3">
          <p className="text-xs text-amber-900 dark:text-amber-200">
            {reminders.permission === 'denied'
              ? 'Notifications are blocked for this app. Turn them on in your device settings to get reminders.'
              : 'Allow notifications so your reminders can reach you.'}
          </p>
          {reminders.permission !== 'denied' && (
            <button
              type="button"
              onClick={reminders.enable}
              className="mt-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
            >
              Allow notifications
            </button>
          )}
        </div>
      )}

      {reminders.supported && reminders.permission === 'granted' && (
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {reminders.pending > 0
              ? `${reminders.pending} reminder${reminders.pending === 1 ? '' : 's'} scheduled.`
              : 'No reminders scheduled yet.'}
          </span>
          <button
            type="button"
            onClick={async () => {
              const result = await sendTestNotification();
              onNotify(result.ok
                ? { type: 'success', message: 'Test reminder sent.' }
                : { type: 'error', message: 'Could not send a test reminder.' });
            }}
            className="shrink-0 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Send a test
          </button>
        </div>
      )}

      {reminders.supported && !reminders.reliable && hasAnyReminder && (
        <p className="text-xs text-slate-500 dark:text-slate-400 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          In the browser, reminders only fire while this page is open. Install the
          Android app for reminders that work with the app closed.
        </p>
      )}

      {/* ---------------------------------------------------------- summary */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Pill className="w-5 h-5 text-emerald-600" aria-hidden="true" />
            Medicines
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {medicines.length} of {MAX_MEDICINES} tracked
            {progress.total > 0 && ` · ${progress.taken}/${progress.total} doses ${viewingToday ? 'today' : 'that day'}`}
          </p>
        </div>
        {mode !== 'add' && (
          <button
            type="button"
            onClick={() => setMode('add')}
            disabled={atCap}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" aria-hidden="true" /> Add
          </button>
        )}
      </div>

      {atCap && mode !== 'add' && (
        <p className="text-xs text-slate-400">
          You have reached the {MAX_MEDICINES}-medicine limit. Remove one to add another.
        </p>
      )}

      {mode === 'add' && (
        <MedicineForm
          initial={BLANK}
          submitLabel="Add medicine"
          onSubmit={handleAdd}
          onCancel={() => setMode(null)}
        />
      )}

      {/* ------------------------------------------------------------ list */}
      {medicines.length === 0 && mode !== 'add' ? (
        <div className="text-center py-10 px-6">
          <Pill className="w-10 h-10 mx-auto mb-3 text-emerald-200" aria-hidden="true" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add a medicine to get a reminder by name at the times you choose.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {medicines.map((medicine) => (
            mode === medicine.id ? (
              <li key={medicine.id}>
                <MedicineForm
                  initial={medicine}
                  submitLabel="Save changes"
                  onSubmit={(draft) => handleEdit(medicine.id, draft)}
                  onCancel={() => setMode(null)}
                />
              </li>
            ) : (
              <MedicineCard
                key={medicine.id}
                medicine={medicine}
                takenTimes={takenForDay[medicine.id] ?? []}
                nowMinutes={nowMinutes}
                viewingToday={viewingToday}
                onToggleDose={(time, taken) => onToggleDose(currentDate, medicine.id, time, taken)}
                onEdit={() => setMode(medicine.id)}
                onRemove={() => onRequestRemove(medicine)}
                onToggleReminders={(enabled) => onUpdate(medicine.id, { remindersEnabled: enabled })}
              />
            )
          ))}
        </ul>
      )}

      <WaterReminderCard settings={waterReminder} onChange={onWaterReminderChange} />

      <p className="text-[10px] text-slate-400 leading-relaxed">
        Reminders are a convenience, not a medical device — do not rely on them
        alone for a dose that matters. Your medicine list stays on this device and
        is never sent to the AI service.
      </p>
    </div>
  );
}
