import { useEffect, useRef, useState } from 'react';
import { Stethoscope, Trash2 } from 'lucide-react';
import { MessageList, ChatInput } from './Chat.jsx';
import { askNutritionist, ApiError } from '../lib/ai.js';
import { buildHealthContext } from '../lib/healthContext.js';
import { MAX_CHAT_MESSAGE_LENGTH } from '../lib/constants.js';
import { makeId } from '../lib/schema.js';

const SUGGESTIONS = [
  'Am I getting enough protein?',
  'What should I eat for dinner?',
  'How is my iron looking this week?',
];

/**
 * "Dr. Veggie" — a general nutrition assistant.
 *
 * Not a doctor. The system prompt says so and so does the footer; the original
 * presented itself as a medical professional with no disclaimer anywhere.
 *
 * The transcript is persisted through `onAppend` (capped upstream), so a
 * conversation survives a reload — but errors are never persisted as if they
 * were answers.
 */
export function DoctorChat({
  apiKey, apiConfig, history, onAppend, onClear, profile, goals, logs, waterLogs, weightHistory,
  currentDate, onNotify, onOpenSettings,
}) {
  const [input, setInput] = useState('');
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const messages = [...history, ...pending];

  const ask = async (rawQuestion) => {
    const question = rawQuestion.trim().slice(0, MAX_CHAT_MESSAGE_LENGTH);
    if (!question || loading) return;

    if (!apiKey) {
      onNotify({ type: 'error', message: 'Add an API key in Settings to ask questions.' });
      onOpenSettings?.();
      return;
    }

    const userMessage = { id: makeId('doc'), role: 'user', content: question };
    setInput('');
    setPending([userMessage]);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const context = buildHealthContext({
        profile, goals, logs, waterLogs, weightHistory, currentDate,
      });
      const answer = await askNutritionist(question, context, { apiKey, config: apiConfig, signal: controller.signal });
      if (controller.signal.aborted) return;

      // Only commit to persistent history once we have a real answer, so a
      // failed request never leaves a dangling question in the transcript.
      setPending([]);
      onAppend([userMessage, { id: makeId('doc'), role: 'assistant', content: answer }]);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof ApiError
        ? err.message
        : 'Something went wrong. Please try again.';
      onNotify({ type: 'error', message });
      setPending([userMessage, { id: makeId('doc'), role: 'assistant', content: message }]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <MessageList
        messages={messages}
        variant="doctor"
        isLoading={loading}
        loadingText="Thinking…"
        emptyState={(
          <div className="text-center mt-8 px-6">
            <Stethoscope className="w-12 h-12 mx-auto mb-3 text-blue-300" aria-hidden="true" />
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Ask about your nutrition. I can see your logged food, targets and trends.
            </p>
            <div className="flex flex-col gap-2 max-w-xs mx-auto">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="text-xs text-left px-3 py-2 rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 hover:bg-blue-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      />

      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={() => ask(input)}
          disabled={loading}
          accent="blue"
          label="Ask a nutrition question"
          placeholder="Ask about your nutrition…"
        />
        <div className="flex items-center justify-between mt-2 gap-3">
          <p className="text-[10px] text-slate-400 leading-tight">
            General nutrition information, not medical advice.
          </p>
          {history.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 shrink-0"
            >
              <Trash2 className="w-3 h-3" aria-hidden="true" /> Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
