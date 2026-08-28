import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Trash2, Leaf, X } from 'lucide-react';
import { MessageList, ChatInput } from './Chat.jsx';
import { analyzeFoodText, analyzeFoodImage, ApiError } from '../lib/ai.js';
import { parseLocalMulti, knownFoodNames } from '../lib/localParser.js';
import { prepareImageFile, capturePhoto, isNativePlatform, ImageError } from '../lib/platform.js';
import { makeId } from '../lib/schema.js';

/**
 * Food logging panel.
 *
 * Key behaviour change: a failed model call is reported, not swallowed. The
 * original returned null on any error and silently fell back to the offline
 * database, so someone with a mistyped API key just saw "I couldn't identify
 * those foods" forever and never learned their key was broken.
 */
export function FoodLogger({ apiKey, apiConfig, currentDate, onAddEntries, onNotify }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);

  // Cancel any in-flight request if the panel goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const push = useCallback((role, content, extra = {}) => {
    setMessages((prev) => [...prev.slice(-60), { id: makeId('log'), role, content, ...extra }]);
  }, []);

  const pickImage = async () => {
    if (isNativePlatform()) {
      try {
        const photo = await capturePhoto();
        if (photo) setImage(photo);
        return;
      } catch (err) {
        // User cancelled the camera, or permission denied — fall back to the file picker.
        if (err instanceof ImageError) onNotify({ type: 'error', message: err.message });
        else fileInputRef.current?.click();
        return;
      }
    }
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setImage(await prepareImageFile(file));
    } catch (err) {
      onNotify({
        type: 'error',
        message: err instanceof ImageError ? err.message : 'That image could not be loaded.',
      });
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (loading || (!text && !image)) return;

    const pendingImage = image;
    push('user', text || 'Analyse this photo', pendingImage ? { image: pendingImage.dataUrl } : {});
    setInput('');
    setImage(null);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let entries = null;
      let usedFallback = false;
      let apiFailure = null;

      if (apiKey) {
        try {
          entries = pendingImage
            ? await analyzeFoodImage(text, pendingImage.base64, {
              apiKey, config: apiConfig, mimeType: pendingImage.mimeType, signal: controller.signal,
            })
            : await analyzeFoodText(text, { apiKey, config: apiConfig, signal: controller.signal });
        } catch (err) {
          if (controller.signal.aborted) return;
          if (!(err instanceof ApiError)) throw err;

          // Keep the reason, do not just toast it. A toast is gone in seconds
          // while the transcript stays, and the fallback copy below used to tell
          // people to "add an API key in Settings" whatever went wrong — so a
          // model name that does not exist, or a rate limit, read as a missing
          // key that was in fact set. A wrong diagnosis, not merely a vague one.
          apiFailure = err;
          onNotify({ type: 'error', message: err.message });
          entries = pendingImage ? [] : parseLocalMulti(text);
          usedFallback = true;
        }
      } else {
        entries = parseLocalMulti(text);
        usedFallback = true;
      }

      if (controller.signal.aborted) return;

      if (entries && entries.length > 0) {
        const added = onAddEntries(currentDate, entries);
        const summary = entries
          .map((f) => `• ${f.name} (${Math.round(f.weight)}g): ${Math.round(f.calories)} kcal, ${f.protein.toFixed(1)}g protein`)
          .join('\n');
        push('system', `Added ${added} item${added === 1 ? '' : 's'} to your log:\n${summary}${usedFallback ? '\n\n(estimated from the offline database)' : ''}`);
      } else if (apiFailure) {
        push('system', `${apiFailure.message}${pendingImage ? '' : `\n\nOffline I know: ${knownFoodNames().join(', ')}.`}`);
      } else if (apiKey && !usedFallback) {
        push('system', "I couldn't find any food in that. Try describing it differently, for example \"200g rice and a bowl of dal\".");
      } else {
        push('system', `I don't recognise that offline. Add an API key in Settings to log any food.\n\nOffline I know: ${knownFoodNames().join(', ')}.`);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error('Food logging failed:', err);
      push('system', 'Something went wrong while logging that. Please try again.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <MessageList
        messages={messages}
        variant="logger"
        isLoading={loading}
        loadingText="Analysing nutrition…"
        emptyState={(
          <div className="text-center mt-10 px-6">
            <Leaf className="w-12 h-12 mx-auto mb-3 text-emerald-300" aria-hidden="true" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Describe a meal or snap a photo.
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Try &ldquo;2 rotis, a bowl of dal and 100g paneer&rdquo;.
            </p>
          </div>
        )}
      />

      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        {image && (
          <div className="mb-2 relative inline-block">
            <img src={image.dataUrl} alt="Selected food" className="h-20 rounded-lg border-2 border-emerald-200" />
            <button
              type="button"
              onClick={() => setImage(null)}
              aria-label="Remove photo"
              className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 hover:bg-rose-600"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          tabIndex={-1}
        />
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSend}
          disabled={loading}
          label="Log food"
          placeholder="e.g. 200g rice and dal"
          leading={(
            <button
              type="button"
              onClick={pickImage}
              disabled={loading}
              aria-label="Add a food photo"
              className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 shrink-0"
            >
              <Camera className="w-5 h-5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
            </button>
          )}
        />
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="mt-2 text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" aria-hidden="true" /> Clear this conversation
          </button>
        )}
      </div>
    </div>
  );
}
