import { useEffect, useRef } from 'react';
import { Leaf, Stethoscope, Send, Loader2 } from 'lucide-react';

/** Only render image sources we produced ourselves. */
function isSafeImageSrc(src) {
  return typeof src === 'string' && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(src);
}

export function ChatMessage({ message, variant }) {
  const isUser = message.role === 'user';
  const Icon = variant === 'doctor' ? Stethoscope : Leaf;
  const accent = variant === 'doctor'
    ? 'bg-blue-50 border-blue-100 text-slate-800 dark:bg-blue-950/40 dark:border-blue-900 dark:text-slate-100'
    : 'bg-emerald-50 border-emerald-100 text-slate-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-slate-100';
  const iconColor = variant === 'doctor' ? 'text-blue-600' : 'text-emerald-600';

  const bubble = isUser
    ? 'bg-slate-800 text-white border-transparent rounded-br-none dark:bg-slate-700'
    : `${accent} rounded-bl-none`;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[92%] p-3 rounded-2xl shadow-sm text-sm border ${bubble}`}>
        <div className="flex items-start gap-2">
          {!isUser && <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />}
          <div className="whitespace-pre-wrap leading-relaxed break-words min-w-0">{message.content}</div>
        </div>
        {isSafeImageSrc(message.image) && (
          <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            <img src={message.image} alt="Logged food" className="max-w-full h-auto max-h-40 object-contain" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Scrolling message list.
 *
 * Scrolls its own container rather than calling `scrollIntoView`, which on
 * mobile drags the whole page around. Also stays put if the user has scrolled
 * up to read earlier messages.
 */
export function MessageList({ messages, variant, loadingText, isLoading, emptyState }) {
  const containerRef = useRef(null);
  const pinnedToBottom = useRef(true);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el && pinnedToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overscroll-contain p-4 scrollbar-thin"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {messages.length === 0 && emptyState}
      {messages.map((msg) => <ChatMessage key={msg.id} message={msg} variant={variant} />)}
      {isLoading && (
        <div className={`flex items-center justify-center gap-2 text-xs py-2 ${variant === 'doctor' ? 'text-blue-600' : 'text-emerald-600'}`}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          <span>{loadingText}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Chat input.
 *
 * `onSubmit` is guarded by `disabled` here rather than only on the button.
 * Previously the button was disabled while loading but the Enter key handler
 * called the send function directly, so holding Enter fired concurrent
 * requests and double-logged the same meal.
 */
export function ChatInput({
  value, onChange, onSubmit, disabled, placeholder, accent = 'emerald', leading, label,
}) {
  const send = () => { if (!disabled && value.trim()) onSubmit(); };
  const ring = accent === 'blue' ? 'focus:ring-blue-500' : 'focus:ring-emerald-500';
  const button = accent === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700';

  return (
    <div className="flex gap-2 items-center">
      {leading}
      <div className="relative flex-1">
        <label htmlFor={`chat-input-${accent}`} className="sr-only">{label}</label>
        <input
          id={`chat-input-${accent}`}
          className={`w-full pl-4 pr-12 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 ${ring} text-sm text-slate-900 dark:text-slate-100`}
          placeholder={placeholder}
          value={value}
          enterKeyHint="send"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={disabled || !value.trim()}
          aria-label={label}
          className={`absolute right-1.5 top-1.5 bottom-1.5 px-3 ${button} text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center`}
        >
          {disabled ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
