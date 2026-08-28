/**
 * The only place that knows how a reminder reaches the operating system.
 *
 * On Android this is `@capacitor/local-notifications`: real alarms, delivered
 * whether or not the app is running. On the web there is no equivalent — a page
 * cannot wake itself once the tab is closed — so the fallback is an in-page
 * timer that fires only while the app is open, and `remindersAreReliable()`
 * exists so the UI can say so plainly instead of quietly promising more than
 * the platform delivers.
 *
 * Everything is imported dynamically and wrapped: a missing plugin, a denied
 * permission, or an OEM that refuses to schedule must degrade to "reminders are
 * off" rather than take the app down with it.
 */

import { isNativePlatform } from './platform.js';
import { allReminderIds } from './reminders.js';

export const MEDICINE_CHANNEL = 'medicine-reminders';
export const WATER_CHANNEL = 'water-reminders';

/** True when a scheduled reminder will fire with the app closed. */
export function remindersAreReliable() {
  return isNativePlatform();
}

/** True when this platform can show a notification at all. */
export function notificationsSupported() {
  return isNativePlatform() || (typeof window !== 'undefined' && 'Notification' in window);
}

let pluginPromise = null;

/**
 * Load the plugin, boxed inside a plain object.
 *
 * The box is not tidiness. A Capacitor plugin is a Proxy that turns *any*
 * property read into a native call, including the `then` that the promise
 * machinery probes for whenever a promise resolves with an object. Returning it
 * bare from an async function therefore calls `LocalNotifications.then()` on the
 * native side, which rejects with "not implemented on android" and takes every
 * reminder down with it. Wrapping keeps the proxy out of the resolver's hands.
 */
function plugin() {
  if (!pluginPromise) {
    pluginPromise = import('@capacitor/local-notifications')
      .then((mod) => ({ api: mod.LocalNotifications }));
  }
  return pluginPromise;
}

/* ----------------------------------------------------------- permissions */

/** 'granted' | 'denied' | 'prompt' | 'unsupported'. Never throws. */
export async function checkPermission() {
  try {
    if (isNativePlatform()) {
      const { api } = await plugin();
      const { display } = await api.checkPermissions();
      return display ?? 'prompt';
    }
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  } catch {
    return 'unsupported';
  }
}

/**
 * Ask for permission. Must be called from a user gesture — Android 13+ and
 * every browser reject a prompt that the user did not initiate.
 */
export async function requestPermission() {
  try {
    if (isNativePlatform()) {
      const { api } = await plugin();
      const { display } = await api.requestPermissions();
      return display ?? 'denied';
    }
    if (typeof Notification === 'undefined') return 'unsupported';
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/* -------------------------------------------------------------- channels */

/**
 * Android 8+ routes every notification through a channel, and a channel's
 * importance can only be set at creation — so these are created once, up front,
 * rather than lazily at first schedule.
 */
async function ensureChannels() {
  if (!isNativePlatform()) return;
  const { api: LocalNotifications } = await plugin();
  if (!LocalNotifications.createChannel) return;
  const common = { importance: 5, visibility: 1, vibration: true };
  await LocalNotifications.createChannel({
    id: MEDICINE_CHANNEL,
    name: 'Medicine reminders',
    description: 'Reminders for the medicines you track.',
    ...common,
  });
  await LocalNotifications.createChannel({
    id: WATER_CHANNEL,
    name: 'Water reminders',
    description: 'Nudges to drink water during the day.',
    ...common,
  });
}

/* -------------------------------------------------------------- web timers */

const webTimers = new Set();

function clearWebTimers() {
  for (const id of webTimers) clearTimeout(id);
  webTimers.clear();
}

function msUntil(hour, minute, now = new Date()) {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Best-effort browser reminders.
 *
 * `setTimeout` is capped at ~24.8 days and, more importantly, is throttled or
 * dropped entirely in background tabs — which is exactly why the UI tells web
 * users that reminders need the app open. Each firing re-arms itself so a
 * long-lived tab keeps working across days.
 */
function scheduleInPage(schedule, onFire) {
  clearWebTimers();
  if (typeof window === 'undefined') return;

  for (const item of schedule) {
    const arm = () => {
      const timer = setTimeout(() => {
        webTimers.delete(timer);
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(item.title, { body: item.body, tag: `veggie-${item.id}` });
          }
        } catch { /* some browsers throw when constructing without a SW */ }
        onFire?.(item);
        arm(); // same time tomorrow
      }, msUntil(item.hour, item.minute));
      webTimers.add(timer);
    };
    arm();
  }
}

/* -------------------------------------------------------------- scheduling */

/**
 * Replace every reminder this app owns with `schedule`.
 *
 * Cancel-then-schedule over the app's whole fixed id range, rather than
 * diffing: it is the only approach that cannot leave an orphaned alarm behind
 * after a medicine is renamed, reordered or deleted. The ids come from
 * `allReminderIds()`, which is why they have to be positional.
 *
 * Returns `{ ok, scheduled, reason }` — never throws.
 */
export async function applySchedule(schedule, { onFire } = {}) {
  const items = Array.isArray(schedule) ? schedule : [];

  if (!isNativePlatform()) {
    scheduleInPage(items, onFire);
    return { ok: true, scheduled: items.length, reason: 'in-page' };
  }

  try {
    const { api: LocalNotifications } = await plugin();
    await ensureChannels();

    // Cancel the full range, not just what is pending: `getPending` can miss
    // alarms the OS has already handed to AlarmManager on some versions.
    await LocalNotifications.cancel({
      notifications: allReminderIds().map((id) => ({ id })),
    }).catch(() => {});

    if (items.length === 0) return { ok: true, scheduled: 0 };

    await LocalNotifications.schedule({
      notifications: items.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        channelId: item.kind === 'water' ? WATER_CHANNEL : MEDICINE_CHANNEL,
        // `on` with only hour+minute repeats every day at that local time,
        // which is what a medicine schedule means. It also follows the device
        // clock, so it survives a timezone change without rescheduling.
        schedule: { on: { hour: item.hour, minute: item.minute }, allowWhileIdle: true },
        // Carried back on tap so the app can open the right screen. Kept to
        // ids and kinds — nothing here should hold the medicine's name, since
        // extras persist in the OS alarm store beyond the app's own storage.
        extra: { kind: item.kind, refId: item.refId, time: item.time },
      })),
    });
    return { ok: true, scheduled: items.length };
  } catch (err) {
    return { ok: false, scheduled: 0, reason: err?.message ?? 'schedule failed' };
  }
}

/** Remove every reminder this app owns. Never throws. */
export async function cancelAll() {
  clearWebTimers();
  if (!isNativePlatform()) return { ok: true };
  try {
    const { api: LocalNotifications } = await plugin();
    await LocalNotifications.cancel({
      notifications: allReminderIds().map((id) => ({ id })),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message ?? 'cancel failed' };
  }
}

/** How many of this app's reminders the OS is actually holding. */
export async function pendingCount() {
  if (!isNativePlatform()) return webTimers.size;
  try {
    const { api: LocalNotifications } = await plugin();
    const { notifications } = await LocalNotifications.getPending();
    const owned = new Set(allReminderIds());
    return (notifications ?? []).filter((n) => owned.has(n.id)).length;
  } catch {
    return 0;
  }
}

/**
 * Fire once, right now — the "test this" button.
 *
 * Uses an id outside the scheduled blocks so a test can never be mistaken for a
 * real reminder and cancelled along with one.
 */
export async function sendTestNotification() {
  const title = 'Veggie Vitality reminders are on';
  const body = 'This is what a reminder will look like.';
  if (!isNativePlatform()) {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body });
        return { ok: true };
      }
      return { ok: false, reason: 'not permitted' };
    } catch (err) {
      return { ok: false, reason: err?.message ?? 'failed' };
    }
  }
  try {
    const { api: LocalNotifications } = await plugin();
    await ensureChannels();
    await LocalNotifications.schedule({
      notifications: [{
        id: 999,
        title,
        body,
        channelId: MEDICINE_CHANNEL,
        schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
      }],
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message ?? 'failed' };
  }
}

/**
 * Listen for a reminder being tapped. `handler` receives `{ kind, refId, time }`.
 * Returns a cleanup function; a no-op on the web.
 */
export function onReminderTapped(handler) {
  if (!isNativePlatform()) return () => {};
  let remove = () => {};
  let cancelled = false;

  plugin()
    .then(({ api }) => api.addListener(
      'localNotificationActionPerformed',
      (event) => {
        const extra = event?.notification?.extra;
        if (extra && typeof extra === 'object') handler(extra);
      },
    ))
    .then((listener) => {
      if (cancelled) listener.remove();
      else remove = () => listener.remove();
    })
    .catch(() => {});

  return () => { cancelled = true; remove(); };
}
