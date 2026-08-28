/**
 * Which AI service the app talks to.
 *
 * The app shipped hard-wired to Google's Gemini endpoint. It can now point at
 * any endpoint you choose — your own proxy, a self-hosted model, OpenRouter,
 * Groq, LM Studio — via one of two wire protocols:
 *
 *   gemini  — Google's `:generateContent` shape (Google itself, or any mirror
 *             or proxy that speaks it)
 *   openai  — the `/chat/completions` shape, which nearly everything else
 *             implements
 *
 * Two rules are enforced here rather than trusted to the UI:
 *
 * 1. **The origin must be in the build's allowlist.** The shipped bundle's CSP
 *    pins `connect-src` to a fixed set of hosts, which is what stops an
 *    injected script from posting your key or your health log anywhere it
 *    likes. Making the endpoint user-settable must not quietly become "any
 *    host, at runtime". So the allowlist stays a *build-time* decision: set
 *    `VITE_API_ORIGINS` when you build your own APK. The check below mirrors
 *    the CSP so a disallowed endpoint produces a sentence you can act on
 *    instead of a silent console violation.
 *
 * 2. **No credentials in the URL.** A base URL carrying `user:pass@`, a query
 *    string or a fragment is rejected outright; the key belongs in a header,
 *    where it stays out of access logs.
 */

import { GEMINI_MODEL } from './constants.js';

export const GOOGLE_ORIGIN = 'https://generativelanguage.googleapis.com';

export const PROTOCOLS = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    /** Google's own key header. Proxies that speak this shape accept it too. */
    authHeader: 'x-goog-api-key',
    defaultModel: GEMINI_MODEL,
    modelHint: 'e.g. gemini-2.5-flash, gemma-4-31b-it',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI-compatible',
    authHeader: 'authorization',
    defaultModel: '',
    modelHint: 'e.g. gpt-4o-mini, llama3.1:8b, anthropic/claude-3.5-sonnet',
  },
};

/** The zero-config default: Google, their endpoint, their model. */
export const DEFAULT_API_CONFIG = Object.freeze({
  protocol: 'gemini',
  baseUrl: GOOGLE_ORIGIN,
  model: GEMINI_MODEL,
});

/* --------------------------------------------------------------- allowlist */

/**
 * Origins this build is permitted to contact, as an array.
 *
 * Google's endpoint is always present so the default path works with no
 * configuration. Everything else comes from `VITE_API_ORIGINS`, a
 * comma-separated list baked in at build time and mirrored into the CSP.
 */
export function allowedApiOrigins() {
  const extra = String(import.meta.env?.VITE_API_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try { return new URL(s).origin; } catch { return null; }
    })
    .filter(Boolean);
  return [...new Set([GOOGLE_ORIGIN, ...extra])];
}

export function isOriginAllowed(baseUrl) {
  let origin;
  try { origin = new URL(baseUrl).origin; } catch { return false; }
  return allowedApiOrigins().includes(origin);
}

/* -------------------------------------------------------------- validation */

const MAX_URL_LENGTH = 300;
const MAX_MODEL_LENGTH = 120;

/**
 * Validate a base URL typed by a human.
 * Returns `{ url }` on success or `{ error }` with something worth reading.
 */
export function validateBaseUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { error: 'Enter the API address.' };
  if (text.length > MAX_URL_LENGTH) return { error: 'That address is too long.' };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'That is not a valid address. It should start with https://' };
  }

  const isLoopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    return { error: 'The address must start with https:// (plain http is only allowed for localhost).' };
  }
  if (url.username || url.password) {
    return { error: 'Put the key in the key field, not in the address.' };
  }
  if (url.search || url.hash) {
    return { error: 'The address must not contain a query string or #fragment.' };
  }

  // Keep origin + path, drop the trailing slash so joining is predictable.
  const path = url.pathname.replace(/\/+$/, '');
  return { url: `${url.origin}${path}` };
}

/**
 * Coerce anything into a usable config. Total: bad input yields the default
 * rather than throwing, because this runs on every load against stored data
 * and against imported backups.
 */
export function normalizeApiConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_API_CONFIG };

  const protocol = Object.hasOwn(PROTOCOLS, raw.protocol) ? raw.protocol : DEFAULT_API_CONFIG.protocol;
  const { url } = validateBaseUrl(raw.baseUrl);
  const baseUrl = url ?? DEFAULT_API_CONFIG.baseUrl;

  let model = typeof raw.model === 'string' ? raw.model.trim().slice(0, MAX_MODEL_LENGTH) : '';
  // Control characters would land in a URL path (gemini) or a JSON body (openai).
  // eslint-disable-next-line no-control-regex
  model = model.replace(/[\u0000-\u001f\u007f]/g, '');
  if (!model) model = PROTOCOLS[protocol].defaultModel;

  return { protocol, baseUrl, model };
}

/** True when the config is the untouched Google default. */
export function isDefaultApiConfig(config) {
  const c = normalizeApiConfig(config);
  return c.protocol === DEFAULT_API_CONFIG.protocol
    && c.baseUrl === DEFAULT_API_CONFIG.baseUrl
    && c.model === DEFAULT_API_CONFIG.model;
}

/** Human name for the service, for error messages and UI copy. */
export function apiConfigLabel(config) {
  const c = normalizeApiConfig(config);
  if (c.baseUrl === GOOGLE_ORIGIN) return 'Gemini';
  try { return new URL(c.baseUrl).host; } catch { return 'the API'; }
}

/**
 * Whether this config can be used at all, given the build's allowlist.
 * Returns `{ ok: true }` or `{ ok: false, message }`.
 */
export function checkApiConfigUsable(config) {
  const c = normalizeApiConfig(config);
  if (!c.model) return { ok: false, message: 'Set a model name for this endpoint.' };
  if (!isOriginAllowed(c.baseUrl)) {
    return {
      ok: false,
      message: `This build is only allowed to contact ${allowedApiOrigins().join(', ')}. `
        + 'Rebuild with VITE_API_ORIGINS set to add this endpoint.',
    };
  }
  return { ok: true };
}
