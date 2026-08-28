// @vitest-environment jsdom
/**
 * Settings surviving a launch that could not reach Capacitor Preferences.
 *
 * The backend is chosen once per session. A session that fell back to
 * localStorage wrote the key and the endpoint there; the next session, with
 * the plugin working, used to look only in Preferences and reported no key and
 * the default endpoint — the food log meanwhile survived, because the blob
 * already had a localStorage rescue. Hence "my settings vanished but my data
 * is still there".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { API_KEY_STORAGE_KEY, API_CONFIG_STORAGE_KEY } from './constants.js';

/** Pretend to be Android with a working Preferences plugin over `store`. */
function onAndroid(store = new Map()) {
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => 'android' });
  vi.doMock('@capacitor/preferences', () => ({
    Preferences: {
      get: async ({ key }) => ({ value: store.has(key) ? store.get(key) : null }),
      set: async ({ key, value }) => { store.set(key, value); },
      remove: async ({ key }) => { store.delete(key); },
    },
  }));
  return store;
}

const load = async () => (await import('./storage.js')).loadState();

const OTHER = JSON.stringify({
  protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemma-4-31b-it',
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('@capacitor/preferences');
  vi.resetModules();
  window.localStorage.clear();
});

describe('settings stranded in localStorage', () => {
  it('finds a key that an earlier fallback session wrote there', async () => {
    const prefs = onAndroid();
    window.localStorage.setItem(API_KEY_STORAGE_KEY, 'AIzaSTRANDED');

    const { apiKey } = await load();

    expect(apiKey).toBe('AIzaSTRANDED');
    // and it is moved in, so the next launch does not have to rescue it again
    expect(prefs.get(API_KEY_STORAGE_KEY)).toBe('AIzaSTRANDED');
  });

  it('finds the endpoint too, not just the key', async () => {
    onAndroid();
    window.localStorage.setItem(API_CONFIG_STORAGE_KEY, OTHER);

    const { apiConfig } = await load();

    expect(apiConfig.model).toBe('gemma-4-31b-it');
  });

  it('prefers what Preferences already holds', async () => {
    onAndroid(new Map([[API_KEY_STORAGE_KEY, 'AIzaCURRENT']]));
    window.localStorage.setItem(API_KEY_STORAGE_KEY, 'AIzaSTALE');

    expect((await load()).apiKey).toBe('AIzaCURRENT');
  });

  it('reports no key when there is genuinely none anywhere', async () => {
    onAndroid();
    expect((await load()).apiKey).toBe('');
  });
});
