import { useState } from 'react';
import { Leaf } from 'lucide-react';
import { validateProfile } from '../lib/schema.js';
import { ACTIVITY_LEVELS, PROFILE_LIMITS } from '../lib/constants.js';
import { Field } from './ui.jsx';
import { inputClass } from './styles.js';

const EMPTY = { name: '', age: '', gender: 'female', weight: '', height: '', activity: 'sedentary' };

/**
 * First-run profile form. Validates before saving — the original accepted any
 * value, so a blank or absurd age/height produced NaN calorie goals and a
 * dashboard full of NaN.
 */
export function ProfileSetup({ initial, onSave, onCancel, submitLabel = 'Start tracking' }) {
  const [values, setValues] = useState({ ...EMPTY, ...(initial ?? {}) });
  const [errors, setErrors] = useState({});

  const update = (field) => (e) => {
    const { value } = e.target;
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { profile, errors: found } = validateProfile(values);
    if (!profile) { setErrors(found); return; }
    onSave(profile);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label="Name" error={errors.name} htmlFor="profile-name">
        <input
          id="profile-name" name="name" autoComplete="name"
          className={inputClass(errors.name)} value={values.name} onChange={update('name')}
          placeholder="Your name"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Age" error={errors.age} htmlFor="profile-age">
          <input
            id="profile-age" name="age" type="number" inputMode="numeric"
            min={PROFILE_LIMITS.age.min} max={PROFILE_LIMITS.age.max}
            className={inputClass(errors.age)} value={values.age} onChange={update('age')}
            placeholder="years"
          />
        </Field>
        <Field label="Sex" error={errors.gender} hint="Used for calorie and iron targets" htmlFor="profile-gender">
          <select
            id="profile-gender" name="gender"
            className={inputClass(errors.gender)} value={values.gender} onChange={update('gender')}
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Weight (kg)" error={errors.weight} htmlFor="profile-weight">
          <input
            id="profile-weight" name="weight" type="number" inputMode="decimal" step="0.1"
            min={PROFILE_LIMITS.weight.min} max={PROFILE_LIMITS.weight.max}
            className={inputClass(errors.weight)} value={values.weight} onChange={update('weight')}
            placeholder="kg"
          />
        </Field>
        <Field label="Height (cm)" error={errors.height} htmlFor="profile-height">
          <input
            id="profile-height" name="height" type="number" inputMode="numeric"
            min={PROFILE_LIMITS.height.min} max={PROFILE_LIMITS.height.max}
            className={inputClass(errors.height)} value={values.height} onChange={update('height')}
            placeholder="cm"
          />
        </Field>
      </div>

      <Field label="Activity level" error={errors.activity} htmlFor="profile-activity">
        <select
          id="profile-activity" name="activity"
          className={inputClass(errors.activity)} value={values.activity} onChange={update('activity')}
        >
          {Object.entries(ACTIVITY_LEVELS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </Field>

      <div className="flex gap-2 pt-2">
        {onCancel && (
          <button
            type="button" onClick={onCancel}
            className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="flex-1 bg-emerald-600 text-white font-bold py-3 rounded-xl hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/** Full-screen wrapper shown before any profile exists. */
export function ProfileSetupScreen({ onSave }) {
  return (
    <div className="min-h-screen bg-emerald-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-3xl shadow-xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center mb-3">
            <Leaf className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-emerald-900 dark:text-emerald-200">Veggie Vitality</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Vegetarian nutrition tracking. Everything stays on your device.
          </p>
        </div>
        <ProfileSetup onSave={onSave} />
        <p className="text-[11px] text-slate-400 text-center mt-6 leading-relaxed">
          General nutrition guidance only — not medical advice. Talk to a doctor or dietitian
          about symptoms, medication or a diagnosed condition.
        </p>
      </div>
    </div>
  );
}
