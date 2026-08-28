import { useCallback, useEffect, useRef, useState } from 'react';
import { todayKey, addDays, msUntilNextMidnight, isValidDateKey } from '../lib/dates.js';

/**
 * The day the user is viewing.
 *
 * Rolls forward automatically at local midnight (so an app left open overnight
 * does not keep logging into yesterday), but only when the user is actually
 * looking at "today" — it will not yank them off a past day they are editing.
 * Also re-checks on resume, since timers do not fire while an Android app is
 * backgrounded.
 */
export function useCurrentDate() {
  const [currentDate, setCurrentDate] = useState(todayKey);
  const currentDateRef = useRef(currentDate);
  useEffect(() => { currentDateRef.current = currentDate; }, [currentDate]);

  useEffect(() => {
    let timer;
    const syncToToday = () => {
      const today = todayKey();
      // Only follow the clock if we were pinned to what *was* today, or have
      // somehow ended up in the future.
      if (currentDateRef.current !== today && currentDateRef.current <= today) {
        const wasToday = currentDateRef.current === addDays(today, -1);
        if (wasToday) setCurrentDate(today);
      } else if (currentDateRef.current > today) {
        setCurrentDate(today);
      }
    };

    const scheduleMidnight = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        syncToToday();
        scheduleMidnight();
      }, msUntilNextMidnight());
    };
    scheduleMidnight();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        syncToToday();
        scheduleMidnight();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  const shiftDate = useCallback((offset) => {
    setCurrentDate((prev) => {
      const next = addDays(prev, offset);
      // Never navigate into the future; there is nothing to log there.
      return next > todayKey() ? prev : next;
    });
  }, []);

  const goToDate = useCallback((key) => {
    if (!isValidDateKey(key) || key > todayKey()) return;
    setCurrentDate(key);
  }, []);

  const goToToday = useCallback(() => setCurrentDate(todayKey()), []);

  return { currentDate, shiftDate, goToDate, goToToday };
}
