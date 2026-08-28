/**
 * Versioned, validated persistence.
 *
 * Owns the schema version, legacy migration, debounced writes, quota recovery,
 * and the separation of the API key from the data blob. Everything read back
 * out passes through `normalizeAppState`, so corrupt or hand-edited storage
 * degrades to a usable empty state instead of throwing on every render.
 *
 * The backend is pluggable: plain localStorage on the web, and Capacitor
 * Preferences (SharedPreferences) on Android, where WebView localStorage can be
 * evicted under storage pressure or by "Clear data".
 */

import {
  STORAGE_KEY, API_KEY_STORAGE_KEY, API_CONFIG_STORAGE_KEY, LEGACY_STORAGE_KEYS,
  SCHEMA_VERSION, MAX_PERSISTED_DOC_MESSAGES,
} from './constants.js';
import { normalizeAppState } from './schema.js';
import { normalizeApiConfig, isDefaultApiConfig, DEFAULT_API_CONFIG } from './apiConfig.js';
import { isNativePlatform } from './platform.js';

/* ------------------------------------------------------------------ backends */

const memoryBackend = (() => {
  const map = new Map();
  return {
    name: 'memory',
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async set(key, value) { map.set(key, value); },
    async remove(key) { map.delete(key); },
  };
})();

const localStorageBackend = {
  name: 'localStorage',
  async get(key) { return window.localStorage.getItem(key); },
  async set(key, value) { window.localStorage.setItem(key, value); },
  async remove(key) { window.localStorage.removeItem(key); },
};

let backendPromise = null;

async function getBackend() {
  if (backendPromise) return backendPromise;
  backendPromise = (async () => {
    if (isNativePlatform()) {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        return {
          name: 'capacitor-preferences',
          async get(key) { return (await Preferences.get({ key })).value ?? null; },
          async set(key, value) { await Preferences.set({ key, value }); },
          async remove(key) { await Preferences.remove({ key }); },
        };
      } catch {
        // Plugin missing — fall through to localStorage.
      }
    }
    try {
      const probe = '__veggie_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return localStorageBackend;
    } catch {
      // Private browsing / storage disabled: keep the session usable in memory.
      return memoryBackend;
    }
  })();
  return backendPromise;
}

export async function storageBackendName() {
  return (await getBackend()).name;
}

/* ------------------------------------------------------------- load & migrate */

function parseJson(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Delete a legacy blob once its contents have been rewritten under the current
 * key.
 *
 * This matters beyond tidiness: the v9 blob kept the Gemini API key *inline*.
 * Left in place it becomes a shadow copy of the credential that nothing else
 * touches — clearing the key in Settings would not remove it, and on Android it
 * would sit in the WebView's localStorage indefinitely.
 *
 * Order is deliberate. The replacement is written first and only a successful
 * write authorises the delete, so an interrupted migration loses nothing.
 */
async function retireLegacyBlob(backend, source, state, apiKey) {
  try {
    await backend.set(STORAGE_KEY, serialize(state));
    if (apiKey) await backend.set(API_KEY_STORAGE_KEY, apiKey);
  } catch {
    return; // Could not preserve it — leave the original alone.
  }
  try {
    if (source.where === 'backend') await backend.remove(source.key);
  } catch { /* best effort */ }
  try {
    window.localStorage.removeItem(source.key);
  } catch { /* best effort */ }
}

/**
 * Load persisted state.
 * Returns `{ state, apiKey, recovered, migratedFrom }`. `recovered` is true if
 * stored data was unreadable and we fell back to an empty state, so the UI can
 * tell the user rather than silently starting them over.
 */
export async function loadState() {
  const backend = await getBackend();
  let raw = null;
  let migratedFrom = null;

  try {
    raw = await backend.get(STORAGE_KEY);
  } catch {
    raw = null;
  }

  // Where the legacy blob was found, so it can be deleted once it is superseded.
  let legacySource = null;

  if (!raw) {
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      try {
        const legacy = await backend.get(legacyKey);
        if (legacy) {
          raw = legacy;
          migratedFrom = legacyKey;
          legacySource = { where: 'backend', key: legacyKey };
          break;
        }
      } catch { /* keep looking */ }
    }
    // Legacy data lived in localStorage even on native.
    if (!raw && backend.name !== 'localStorage') {
      for (const legacyKey of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
        try {
          const legacy = window.localStorage.getItem(legacyKey);
          if (legacy) {
            raw = legacy;
            migratedFrom = `localStorage:${legacyKey}`;
            legacySource = { where: 'localStorage', key: legacyKey };
            break;
          }
        } catch { /* ignore */ }
      }
    }
  }

  const parsed = parseJson(raw);
  const hadStoredData = Boolean(raw);
  // Our own blob: entry ids are ours, so they survive the reload.
  const state = normalizeAppState(parsed, { source: 'stored' });

  let apiKey = '';
  try {
    apiKey = (await backend.get(API_KEY_STORAGE_KEY)) ?? '';
  } catch { apiKey = ''; }
  // The v9 blob kept the key inline; lift it into its own slot once.
  if (!apiKey && typeof parsed?.apiKey === 'string') apiKey = parsed.apiKey;

  let rawConfig = null;
  try {
    rawConfig = await backend.get(API_CONFIG_STORAGE_KEY);
  } catch { rawConfig = null; }

  // A session that ran before the Preferences plugin was reachable used
  // localStorage instead, and the food log already gets rescued from there
  // above. The key and the endpoint did not, which is what "my settings
  // disappeared but my data is still here" looks like. Rescue them the same
  // way, and write them back so the next launch finds them in one place.
  if (backend.name !== 'localStorage') {
    for (const [missing, key, adopt] of [
      [!apiKey, API_KEY_STORAGE_KEY, (v) => { apiKey = v; }],
      [!rawConfig, API_CONFIG_STORAGE_KEY, (v) => { rawConfig = v; }],
    ]) {
      if (!missing) continue;
      let stranded = null;
      try { stranded = window.localStorage.getItem(key); } catch { stranded = null; }
      if (!stranded) continue;
      adopt(stranded);
      try { await backend.set(key, stranded); } catch { /* best effort */ }
    }
  }

  let apiConfig = DEFAULT_API_CONFIG;
  try {
    apiConfig = normalizeApiConfig(parseJson(rawConfig));
  } catch { apiConfig = DEFAULT_API_CONFIG; }

  if (legacySource) await retireLegacyBlob(backend, legacySource, state, apiKey);

  return {
    state,
    apiKey: typeof apiKey === 'string' ? apiKey.trim() : '',
    apiConfig,
    recovered: hadStoredData && parsed === null,
    migratedFrom,
  };
}

/* ------------------------------------------------------------------- persist */

function serialize(state) {
  return JSON.stringify({
    version: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    userProfile: state.userProfile,
    logs: state.logs,
    waterLogs: state.waterLogs,
    weightHistory: state.weightHistory,
    medicines: state.medicines,
    medLogs: state.medLogs,
    waterReminder: state.waterReminder,
    docHistory: (state.docHistory ?? []).slice(-MAX_PERSISTED_DOC_MESSAGES),
  });
}

function isQuotaError(err) {
  return err && (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 || err.code === 1014
  );
}

/**
 * Write state. On a quota error, sheds the chat transcript (the only
 * unbounded, least valuable part) and retries once before giving up, so the
 * user's actual food history survives. Reports what happened to the caller
 * instead of only writing to the console.
 */
export async function saveState(state) {
  const backend = await getBackend();
  try {
    await backend.set(STORAGE_KEY, serialize(state));
    return { ok: true };
  } catch (err) {
    if (!isQuotaError(err)) return { ok: false, reason: 'error', error: err };
    try {
      await backend.set(STORAGE_KEY, serialize({ ...state, docHistory: [] }));
      return { ok: true, pruned: 'docHistory' };
    } catch (retryErr) {
      return { ok: false, reason: 'quota', error: retryErr };
    }
  }
}

export async function saveApiKey(apiKey) {
  const backend = await getBackend();
  const value = typeof apiKey === 'string' ? apiKey.trim() : '';
  try {
    if (value) await backend.set(API_KEY_STORAGE_KEY, value);
    else await backend.remove(API_KEY_STORAGE_KEY);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Persist the endpoint choice. The default is stored as an absence, so an app
 * that has never been reconfigured leaves no record to go stale.
 */
export async function saveApiConfig(config) {
  const backend = await getBackend();
  const normalized = normalizeApiConfig(config);
  try {
    if (isDefaultApiConfig(normalized)) await backend.remove(API_CONFIG_STORAGE_KEY);
    else await backend.set(API_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

export async function clearAll() {
  const backend = await getBackend();
  for (const key of [STORAGE_KEY, API_KEY_STORAGE_KEY, API_CONFIG_STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    try { await backend.remove(key); } catch { /* best effort */ }
    try { window.localStorage.removeItem(key); } catch { /* best effort */ }
  }
}

/* -------------------------------------------------------------------- backup */

/**
 * Build a backup document.
 *
 * The API key is excluded unless explicitly requested. Backups get emailed to
 * oneself and dropped in cloud folders; a credential riding along inside one is
 * the realistic way it leaks. `docHistory` is likewise opt-in, since those
 * transcripts contain the user's health questions.
 *
 * The endpoint config travels *with* the key and only with it. A non-default
 * endpoint in a backup is a redirect instruction — it decides who receives
 * every food description and health question — so it belongs behind the same
 * opt-in and the same confirmation on import, not in the freely-shared part.
 */
export function buildBackup(state, apiKey, { includeApiKey = false, includeChat = true, apiConfig } = {}) {
  const credentials = includeApiKey && apiKey
    ? {
      apiKey,
      ...(apiConfig && !isDefaultApiConfig(apiConfig) ? { apiConfig: normalizeApiConfig(apiConfig) } : {}),
    }
    : {};
  return buildBackupBody(state, includeChat, credentials);
}

function buildBackupBody(state, includeChat, credentials) {
  return {
    app: 'veggie-tracker',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    userProfile: state.userProfile,
    logs: state.logs,
    waterLogs: state.waterLogs,
    weightHistory: state.weightHistory,
    medicines: state.medicines,
    medLogs: state.medLogs,
    waterReminder: state.waterReminder,
    docHistory: includeChat ? state.docHistory : [],
    ...credentials,
  };
}

/** Parse and validate a backup file's text. Returns `{ state, apiKey }` or throws. */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('That file does not look like a Veggie Tracker backup.');
  }
  if (!Object.hasOwn(parsed, 'logs') && !Object.hasOwn(parsed, 'userProfile')) {
    throw new Error('That file does not look like a Veggie Tracker backup.');
  }
  const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
  return {
    state: normalizeAppState(parsed),
    apiKey,
    // Only meaningful alongside a key, and never adopted without a separate
    // confirmation — see the import flow in VeggieTracker.
    apiConfig: apiKey && parsed.apiConfig ? normalizeApiConfig(parsed.apiConfig) : null,
  };
}
