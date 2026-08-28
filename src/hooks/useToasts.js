import { useCallback, useRef, useState } from 'react';

/**
 * Non-blocking notices, replacing `alert()`.
 *
 * `alert`/`confirm` block the JS thread, look wrong inside an Android WebView,
 * and can be suppressed entirely by the browser.
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const notify = useCallback(({ type = 'info', message, duration = 5000 }) => {
    if (!message) return null;
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    }
    return id;
  }, [dismiss]);

  return { toasts, notify, dismiss };
}
