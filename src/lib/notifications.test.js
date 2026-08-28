import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * These exist because of one production bug, and they are shaped around it.
 *
 * A Capacitor plugin is not a plain object: it is a Proxy that turns every
 * property read into a bridge call. The promise machinery reads `.then` off any
 * object a promise resolves with, so handing the proxy straight back from an
 * `async function` made the bridge invoke a native method called `then` — which
 * does not exist, so every call into this module rejected with
 * "LocalNotifications.then() is not implemented on android" and no reminder was
 * ever scheduled. The mock below reproduces that proxy faithfully, `then`
 * included; a regression would fail here rather than on a device at 3am.
 */
const CALLS = [];

function makeNativeProxy() {
  const impl = {
    checkPermissions: async () => ({ display: 'prompt' }),
    requestPermissions: async () => ({ display: 'granted' }),
    createChannel: async () => {},
    cancel: async () => {},
    schedule: async () => {},
    getPending: async () => ({ notifications: [] }),
    addListener: async () => ({ remove: () => {} }),
  };
  return new Proxy({}, {
    get(_target, prop) {
      // The bridge answers *any* name, which is the whole hazard.
      return (...args) => {
        CALLS.push(String(prop));
        const fn = impl[prop];
        if (!fn) {
          return Promise.reject(
            new Error(`"LocalNotifications.${String(prop)}()" is not implemented on android`),
          );
        }
        return fn(...args);
      };
    },
    has: () => true,
  });
}

vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: makeNativeProxy() }));

let notifications;

beforeEach(async () => {
  CALLS.length = 0;
  globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
  vi.resetModules();
  notifications = await import('./notifications.js');
});

afterEach(() => {
  delete globalThis.Capacitor;
});

describe('the plugin is never handed to the promise resolver', () => {
  it('does not call a native `then` while loading the plugin', async () => {
    await notifications.checkPermission();
    expect(CALLS).not.toContain('then');
  });

  it('reads the real permission instead of degrading to unsupported', async () => {
    await expect(notifications.checkPermission()).resolves.toBe('prompt');
  });

  it('resolves a permission request rather than swallowing it as denied', async () => {
    await expect(notifications.requestPermission()).resolves.toBe('granted');
    expect(CALLS).toContain('requestPermissions');
  });

  it('actually reaches schedule() on the bridge', async () => {
    const result = await notifications.applySchedule([{
      id: 1000, title: 'Time for B12', body: '1 tablet',
      kind: 'medicine', refId: 'med_1', time: '08:00', hour: 8, minute: 0,
    }]);
    expect(result).toEqual({ ok: true, scheduled: 1 });
    expect(CALLS).toContain('schedule');
    expect(CALLS).not.toContain('then');
  });

  it('cancels the owned id range before scheduling', async () => {
    await notifications.applySchedule([]);
    expect(CALLS).toContain('cancel');
  });

  it('counts pending reminders without throwing', async () => {
    await expect(notifications.pendingCount()).resolves.toBe(0);
  });
});
