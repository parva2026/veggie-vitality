import { useEffect, useRef } from 'react';
import { AlertTriangle, ShieldAlert, Info, CheckCircle2, X } from 'lucide-react';
import { pctOfGoal } from '../lib/nutrition.js';

/* ------------------------------------------------------------------ Progress */

export function ProgressBar({ label, current, target, colorClass, unit, isMicro = false }) {
  const pct = pctOfGoal(current, target); // safe when target is 0 or missing
  const width = Math.min(pct, 100);
  const over = pct > 105;
  return (
    <div className={`mb-2 ${isMicro ? 'text-xs' : 'text-sm'}`}>
      <div className="flex justify-between mb-1 font-medium text-slate-700 dark:text-slate-200 gap-2">
        <span className={isMicro ? 'text-slate-500 dark:text-slate-400 truncate' : 'truncate'}>{label}</span>
        <span className="shrink-0 tabular-nums">
          {Math.round(current ?? 0)} / {target ?? 0}
          <span className="text-[10px] text-slate-400 ml-0.5">{unit}</span>
        </span>
      </div>
      <div
        className={`${isMicro ? 'h-1.5' : 'h-2.5'} w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden`}
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full ${over ? 'bg-rose-500' : colorClass} transition-all duration-500`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Cards */

export function HealthCard({ icon: Icon, title, score, colorClass, textClass, label }) {
  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-4">
      <div className={`p-3 rounded-full ${colorClass}/10 shrink-0`}>
        <Icon className={`w-6 h-6 ${textClass}`} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-end mb-1 gap-2">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{title}</span>
          <span className={`text-lg font-bold tabular-nums ${textClass}`}>{score}%</span>
        </div>
        <div
          className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden"
          role="progressbar"
          aria-label={`${title} score`}
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={`h-full ${colorClass}`} style={{ width: `${score}%` }} />
        </div>
        <p className="text-xs text-slate-400 mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

export function RiskAlert({ risk }) {
  const styles = {
    high: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200',
    medium: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200',
    low: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-200',
  };
  const icons = { high: ShieldAlert, medium: AlertTriangle, low: Info };
  const Icon = icons[risk.level] ?? Info;
  return (
    <div className={`p-3 rounded-lg border flex gap-3 items-start ${styles[risk.level] ?? styles.low}`}>
      <Icon className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <div className="font-bold text-sm">{risk.behavior}</div>
        <div className="text-xs opacity-90 mt-1">{risk.consequence}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Modal */

/**
 * Accessible modal: focus is moved in and restored on close, Escape closes,
 * and a backdrop click closes. The original modals trapped neither focus nor
 * keyboard users.
 */
export function Modal({ title, icon: Icon, onClose, children, footer, maxWidth = 'max-w-md' }) {
  const panelRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    panelRef.current?.focus();
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full ${maxWidth} p-5 sm:p-6 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto outline-none pb-[max(1.25rem,env(safe-area-inset-bottom))]`}
      >
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2 min-w-0">
            {Icon && <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />}
            <span className="truncate">{title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 -mr-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/** In-app replacement for `confirm()`. */
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={(
        <>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-lg text-white text-sm font-bold ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-800 hover:bg-slate-900'}`}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{message}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------- Toasts */

export function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  const styles = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
    info: 'bg-slate-800 text-white',
  };
  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] w-[min(28rem,calc(100vw-2rem))] space-y-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = icons[toast.type] ?? Info;
        return (
          <div
            key={toast.id}
            className={`${styles[toast.type] ?? styles.info} rounded-xl shadow-lg px-4 py-3 text-sm flex items-start gap-3`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="opacity-70 hover:opacity-100 shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ Field wrapper */

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
        {label}
      </label>
      {children}
      {error
        ? <p className="text-xs text-rose-600 mt-1">{error}</p>
        : hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}
