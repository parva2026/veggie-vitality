import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadState, saveState, saveApiKey as persistApiKey,
  saveApiConfig as persistApiConfig, clearAll,
} from '../lib/storage.js';
import { DEFAULT_API_CONFIG, normalizeApiConfig } from '../lib/apiConfig.js';
import {
  normalizeFoodEntry, normalizeAppState, makeId,
  normalizeMedicine, normalizeWaterReminder,
} from '../lib/schema.js';
import { MAX_PERSISTED_DOC_MESSAGES, PROFILE_LIMITS, MAX_MEDICINES } from '../lib/constants.js';
import { normalizeTimes } from '../lib/reminders.js';
import { clampNum } from '../lib/schema.js';
import { todayKey } from '../lib/dates.js';

const EMPTY_STATE = normalizeAppState(null);
const SAVE_DEBOUNCE_MS = 400;

/**
 * Owns all persisted app data.
 *
 * Writes are debounced — the original saved the entire dataset on every render
 * that touched state, including every keystroke in the API-key field, which
 * meant a full `JSON.stringify` of months of logs per character typed.
 *
 * The API key is stored separately from the data blob so it can be excluded
 * from backups and cleared on its own.
 */
export function useAppState({ onNotice } = {}) {
  const [state, setState] = useState(EMPTY_STATE);
  const [apiKey, setApiKeyState] = useState('');
  const [apiConfig, setApiConfigState] = useState(DEFAULT_API_CONFIG);
  const [status, setStatus] = useState({ loading: true, recovered: false });

  // Refs are synced in effects, not during render: writing a ref while
  // rendering is unsafe under concurrent React.
  const noticeRef = useRef(onNotice);
  useEffect(() => { noticeRef.current = onNotice; }, [onNotice]);

  // Set when loading threw. At that moment `state` is still the empty default,
  // and the debounced writer below would happily persist it — turning a load
  // that failed for a transient reason into a permanent erase of data that is
  // almost certainly still intact on disk. Nothing is written until a restart
  // manages to read it back.
  const loadFailedRef = useRef(false);

  // ---- initial load -------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          state: loaded, apiKey: loadedKey, apiConfig: loadedConfig, recovered, migratedFrom,
        } = await loadState();
        if (cancelled) return;
        setState(loaded);
        setApiKeyState(loadedKey);
        setApiConfigState(loadedConfig ?? DEFAULT_API_CONFIG);
        setStatus({ loading: false, recovered });
        if (recovered) {
          noticeRef.current?.({
            type: 'error',
            message: 'Your saved data could not be read and has been reset. Import a backup to restore it.',
          });
        } else if (migratedFrom) {
          noticeRef.current?.({ type: 'success', message: 'Your data was upgraded to the new format.' });
        }
        // The key used to live inside the data blob; move it to its own slot.
        if (loadedKey) persistApiKey(loadedKey);
      } catch {
        loadFailedRef.current = true;
        if (cancelled) return;
        setStatus({ loading: false, recovered: false });
        noticeRef.current?.({
          type: 'error',
          message: 'Your saved data could not be read. Nothing has been changed — close the app and open it again.',
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- debounced persistence ---------------------------------------------
  const stateRef = useRef(state);
  const dirtyRef = useRef(false);
  // Declared before the debounce effect below so `flush` always sees the
  // newest state, whether it fires on the timer or on pagehide.
  useEffect(() => { stateRef.current = state; }, [state]);

  const flush = useCallback(async () => {
    if (loadFailedRef.current) return;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const result = await saveState(stateRef.current);
    if (!result.ok) {
      noticeRef.current?.({
        type: 'error',
        message: result.reason === 'quota'
          ? 'Storage is full — recent changes were not saved. Export a backup and reset old data.'
          : 'Changes could not be saved to this device.',
      });
    } else if (result.pruned) {
      noticeRef.current?.({ type: 'info', message: 'Storage was full, so older chat history was cleared.' });
    }
  }, []);

  const settledRef = useRef(false);

  useEffect(() => {
    if (status.loading) return undefined;
    // The first pass after loading has nothing new to say: it would only write
    // back what was just read. Skipping it keeps a read-only launch read-only.
    if (!settledRef.current) { settledRef.current = true; return undefined; }
    dirtyRef.current = true;
    const timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, status.loading, flush]);

  // Don't lose the last few hundred ms of edits when the app is backgrounded.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  // ---- mutations ----------------------------------------------------------
  const setProfile = useCallback((profile) => {
    setState((prev) => {
      const next = { ...prev, userProfile: profile };
      // Seed the weight chart from the profile if it is the first entry.
      if (profile && prev.weightHistory.length === 0) {
        next.weightHistory = [{ date: todayKey(), weight: profile.weight }];
      }
      return next;
    });
  }, []);

  const addEntries = useCallback((dateKey, rawEntries) => {
    const entries = rawEntries.map((e) => normalizeFoodEntry(e)).filter(Boolean);
    if (entries.length === 0) return 0;
    setState((prev) => ({
      ...prev,
      logs: { ...prev.logs, [dateKey]: [...(prev.logs[dateKey] ?? []), ...entries] },
    }));
    return entries.length;
  }, []);

  const removeEntry = useCallback((dateKey, id) => {
    setState((prev) => {
      const day = prev.logs[dateKey];
      if (!Array.isArray(day)) return prev;
      const filtered = day.filter((item) => item.id !== id);
      const logs = { ...prev.logs };
      if (filtered.length > 0) logs[dateKey] = filtered;
      else delete logs[dateKey];
      return { ...prev, logs };
    });
  }, []);

  const adjustWater = useCallback((dateKey, deltaMl) => {
    setState((prev) => {
      const next = clampNum((prev.waterLogs[dateKey] ?? 0) + deltaMl, 30000, 0);
      const waterLogs = { ...prev.waterLogs };
      if (next > 0) waterLogs[dateKey] = Math.round(next);
      else delete waterLogs[dateKey];
      return { ...prev, waterLogs };
    });
  }, []);

  /** Record a weigh-in. Returns an error string, or null on success. */
  const recordWeight = useCallback((rawWeight) => {
    const weight = Number.parseFloat(rawWeight);
    if (!Number.isFinite(weight)) return 'Enter a number.';
    const { min, max } = PROFILE_LIMITS.weight;
    if (weight < min || weight > max) return `Weight must be between ${min} and ${max} kg.`;

    const rounded = Math.round(weight * 10) / 10;
    const date = todayKey();
    setState((prev) => {
      // One reading per day, rather than appending a duplicate each tap.
      const history = prev.weightHistory.filter((w) => w.date !== date);
      history.push({ date, weight: rounded });
      history.sort((a, b) => a.date.localeCompare(b.date));
      return {
        ...prev,
        weightHistory: history,
        userProfile: prev.userProfile ? { ...prev.userProfile, weight: rounded } : prev.userProfile,
      };
    });
    return null;
  }, []);


  /* ---- medicines --------------------------------------------------------- */

  /**
   * Add a medicine. Returns an error string, or null on success.
   *
   * The cap is checked here as well as in the UI because this is the only path
   * that can grow the list, and `reminders.js` carves its notification id space
   * up assuming the cap holds.
   */
  const addMedicine = useCallback((raw) => {
    const medicine = normalizeMedicine(raw);
    if (!medicine) return 'Enter a name for the medicine.';
    let error = null;
    setState((prev) => {
      if (prev.medicines.length >= MAX_MEDICINES) {
        error = `You can track up to ${MAX_MEDICINES} medicines. Remove one first.`;
        return prev;
      }
      return { ...prev, medicines: [...prev.medicines, medicine] };
    });
    return error;
  }, []);

  /** Patch one medicine in place. Ignores an id that is not present. */
  const updateMedicine = useCallback((id, patch) => {
    setState((prev) => {
      const index = prev.medicines.findIndex((m) => m.id === id);
      if (index === -1) return prev;
      // Re-normalize the merged result rather than the patch alone, so a bad
      // field cannot slip in beside good ones.
      const merged = normalizeMedicine(
        { ...prev.medicines[index], ...patch, id },
        { source: 'stored' },
      );
      if (!merged) return prev;
      const medicines = [...prev.medicines];
      medicines[index] = merged;
      return { ...prev, medicines };
    });
  }, []);

  const removeMedicine = useCallback((id) => {
    setState((prev) => ({
      ...prev,
      // Dose history is deliberately left alone: deleting a medicine should not
      // rewrite the record of what was actually taken.
      medicines: prev.medicines.filter((m) => m.id !== id),
    }));
  }, []);

  /** Mark one scheduled dose taken or not taken. */
  const setDoseTaken = useCallback((dateKey, medicineId, time, taken) => {
    const [normalizedTime] = normalizeTimes([time], 1);
    if (!normalizedTime) return;
    setState((prev) => {
      const day = { ...(prev.medLogs[dateKey] ?? {}) };
      const current = day[medicineId] ?? [];
      const next = taken
        ? normalizeTimes([...current, normalizedTime])
        : current.filter((t) => t !== normalizedTime);

      if (next.length > 0) day[medicineId] = next;
      else delete day[medicineId];

      const medLogs = { ...prev.medLogs };
      if (Object.keys(day).length > 0) medLogs[dateKey] = day;
      else delete medLogs[dateKey];
      return { ...prev, medLogs };
    });
  }, []);

  const setWaterReminder = useCallback((patch) => {
    setState((prev) => ({
      ...prev,
      waterReminder: normalizeWaterReminder({ ...prev.waterReminder, ...patch }),
    }));
  }, []);

  const appendDocMessages = useCallback((messages) => {
    setState((prev) => ({
      ...prev,
      docHistory: [...prev.docHistory, ...messages].slice(-MAX_PERSISTED_DOC_MESSAGES),
    }));
  }, []);

  const clearDocHistory = useCallback(() => {
    setState((prev) => ({ ...prev, docHistory: [] }));
  }, []);

  const replaceState = useCallback((nextState) => {
    setState(normalizeAppState(nextState));
  }, []);

  const setApiKey = useCallback(async (key) => {
    const trimmed = typeof key === 'string' ? key.trim() : '';
    setApiKeyState(trimmed);
    const result = await persistApiKey(trimmed);
    if (!result.ok) {
      noticeRef.current?.({ type: 'error', message: 'The API key could not be saved to this device.' });
    }
  }, []);

  const setApiConfig = useCallback(async (config) => {
    const normalized = normalizeApiConfig(config);
    setApiConfigState(normalized);
    const result = await persistApiConfig(normalized);
    if (!result.ok) {
      noticeRef.current?.({ type: 'error', message: 'The API settings could not be saved to this device.' });
    }
    return normalized;
  }, []);

  const resetEverything = useCallback(async () => {
    await clearAll();
    dirtyRef.current = false;
    setState(EMPTY_STATE);
    setApiKeyState('');
    setApiConfigState(DEFAULT_API_CONFIG);
  }, []);

  const actions = useMemo(() => ({
    setProfile, addEntries, removeEntry, adjustWater, recordWeight,
    appendDocMessages, clearDocHistory, replaceState, setApiKey, setApiConfig,
    resetEverything, flush,
    addMedicine, updateMedicine, removeMedicine, setDoseTaken, setWaterReminder,
  }), [setProfile, addEntries, removeEntry, adjustWater, recordWeight,
    appendDocMessages, clearDocHistory, replaceState, setApiKey, setApiConfig,
    resetEverything, flush,
    addMedicine, updateMedicine, removeMedicine, setDoseTaken, setWaterReminder]);

  return { state, apiKey, apiConfig, status, actions, makeId };
}
