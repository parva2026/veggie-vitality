import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildSchedule } from '../lib/reminders.js';
import {
  applySchedule, cancelAll, checkPermission, requestPermission,
  remindersAreReliable, notificationsSupported, onReminderTapped, pendingCount,
} from '../lib/notifications.js';

/**
 * Keeps the OS's alarm list in step with the stored medicine and water settings.
 *
 * Rescheduling is driven off a *content* signature rather than object identity:
 * `state.medicines` gets a new array reference on every unrelated state change,
 * and rescheduling 90 alarms each time the user logs a glass of water would be
 * both slow and a good way to trip OEM background-work throttling.
 *
 * Nothing is scheduled until permission is actually granted, and permission is
 * only ever requested from a user gesture (`enable`), never on mount — an
 * unprompted permission dialog on first launch is how people learn to tap
 * "Deny" before reading it.
 */
export function useReminders({ medicines, waterReminder, onNotify, onTapped }) {
  const [permission, setPermission] = useState('prompt');
  const [pending, setPending] = useState(0);

  const notifyRef = useRef(onNotify);
  useEffect(() => { notifyRef.current = onNotify; }, [onNotify]);
  const tappedRef = useRef(onTapped);
  useEffect(() => { tappedRef.current = onTapped; }, [onTapped]);

  const supported = notificationsSupported();
  const reliable = remindersAreReliable();

  useEffect(() => {
    let cancelled = false;
    checkPermission().then((value) => { if (!cancelled) setPermission(value); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => onReminderTapped((extra) => tappedRef.current?.(extra)), []);

  const schedule = useMemo(
    () => buildSchedule({ medicines, waterReminder }),
    [medicines, waterReminder],
  );

  // Only the fields that actually change an alarm. Reordering the list changes
  // ids, so position is part of the signature too.
  const signature = useMemo(
    () => JSON.stringify(schedule.map((s) => [s.id, s.hour, s.minute, s.title, s.body])),
    [schedule],
  );

  const scheduleRef = useRef(schedule);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);

  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;

    (async () => {
      if (permission !== 'granted') {
        // Permission can be revoked in system settings while the app is
        // installed; drop any alarms rather than leaving orphans behind.
        await cancelAll();
        if (!cancelled) setPending(0);
        return;
      }
      const result = await applySchedule(scheduleRef.current);
      if (cancelled) return;
      if (!result.ok) {
        notifyRef.current?.({
          type: 'error',
          message: 'Reminders could not be scheduled on this device.',
        });
      }
      setPending(await pendingCount());
    })();

    return () => { cancelled = true; };
  }, [signature, permission, supported]);

  /** Ask for permission and start scheduling. Call from a user gesture. */
  const enable = useCallback(async () => {
    const result = await requestPermission();
    setPermission(result);
    if (result !== 'granted') {
      notifyRef.current?.({
        type: 'error',
        message: result === 'unsupported'
          ? 'This device cannot show reminders.'
          : 'Notifications are blocked. Turn them on for Veggie Vitality in your device settings.',
      });
    }
    return result;
  }, []);

  const disable = useCallback(async () => {
    await cancelAll();
    setPending(0);
  }, []);

  return { permission, supported, reliable, schedule, pending, enable, disable };
}
