/**
 * Transport for whichever AI service is configured.
 *
 * Everything protocol-specific lives in the two adapters below: how the URL is
 * built, how the key is presented, how a prompt (and an optional image) becomes
 * a request body, how a reply is unwrapped, and how an HTTP status maps to a
 * cause. The prompts themselves are protocol-agnostic and live in `ai.js`.
 *
 * Invariants that hold for every provider:
 *  - the key travels in a header, never the query string, because query
 *    strings end up in proxy, CDN and server access logs
 *  - every request carries an AbortController timeout
 *  - a failure throws a typed error, so the caller can tell "your key is wrong"
 *    apart from "no foods recognised" instead of silently degrading
 *  - the endpoint origin is re-checked here, not just in the UI
 */

import { GEMINI_TIMEOUT_MS } from './constants.js';
import {
  PROTOCOLS, normalizeApiConfig, checkApiConfigUsable, apiConfigLabel, isOriginAllowed,
} from './apiConfig.js';

export const ApiErrorCode = {
  NO_KEY: 'NO_KEY',
  NOT_ALLOWED: 'NOT_ALLOWED',
  INVALID_KEY: 'INVALID_KEY',
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA: 'QUOTA',
  BLOCKED: 'BLOCKED',
  TIMEOUT: 'TIMEOUT',
  NETWORK: 'NETWORK',
  BAD_RESPONSE: 'BAD_RESPONSE',
  TRUNCATED: 'TRUNCATED',
  NO_MODEL: 'NO_MODEL',
  UNKNOWN_MODEL: 'UNKNOWN_MODEL',
  SERVER: 'SERVER',
  UNKNOWN: 'UNKNOWN',
};

/**
 * `label` is the service's name, so the message is true for any provider, and
 * `model` is the configured model name where naming it helps.
 *
 * NO_MODEL and UNKNOWN_MODEL are deliberately separate. They were one code, so
 * a *wrong* model name reported "No model name is set" — which sends you to
 * look at an empty field that is not empty. A rejected name has to be quoted
 * back, because the difference between `gemma-4-31b-it` and `gemma-41-31b-it`
 * is invisible until you see the two side by side.
 */
const USER_MESSAGES = {
  NO_KEY: (label) => `No API key is set for ${label}. Add one in Settings.`,
  NOT_ALLOWED: () => 'This build is not allowed to contact that endpoint. See Settings.',
  INVALID_KEY: (label) => `${label} rejected that API key. Check it in Settings.`,
  RATE_LIMITED: (label) => `Too many requests to ${label}. Wait a few seconds and try again.`,
  QUOTA: (label) => `Your ${label} quota is used up.`,
  BLOCKED: (label) => `${label} declined to answer that request.`,
  TIMEOUT: (label) => `${label} took too long to respond. Check your connection and retry.`,
  NETWORK: (label) => `Could not reach ${label}. Check your internet connection.`,
  BAD_RESPONSE: (label) => `The reply from ${label} could not be read. Try rephrasing.`,
  TRUNCATED: (label) => `${label} ran out of room before it finished its answer.`
    + ' Try one meal at a time, or a photo with fewer items.',
  NO_MODEL: () => 'No model name is set for this endpoint. Add one in Settings.',
  UNKNOWN_MODEL: (label, model) => (model
    ? `${label} does not have a model called "${model}". Check the name in Settings — `
      + 'the "Show available models" button lists the ones your key can use.'
    : `${label} did not recognise that model name. Check it in Settings.`),
  SERVER: (label) => `${label} is having trouble right now. Try again shortly.`,
  UNKNOWN: (label) => `Something went wrong talking to ${label}.`,
};

export class ApiError extends Error {
  constructor(code, detail, label = 'the API', model = '') {
    const build = USER_MESSAGES[code] ?? USER_MESSAGES.UNKNOWN;
    super(build(label, model));
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ adapters */

function classifyCommon(status, message) {
  if (status === 401 || status === 403) return ApiErrorCode.INVALID_KEY;
  if (status === 404) return ApiErrorCode.UNKNOWN_MODEL;
  if (status === 429) {
    return /quota|billing|credit/i.test(message) && !/rate/i.test(message)
      ? ApiErrorCode.QUOTA
      : ApiErrorCode.RATE_LIMITED;
  }
  if (status >= 500) return ApiErrorCode.SERVER;
  return ApiErrorCode.UNKNOWN;
}

const adapters = {
  gemini: {
    url: ({ baseUrl, model }) =>
      `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`,

    headers: (apiKey) => ({ 'x-goog-api-key': apiKey }),

    body: ({ prompt, image, temperature, maxTokens, json }) => ({
      contents: [{
        parts: [
          { text: prompt },
          ...(image ? [{ inline_data: { mime_type: image.mimeType, data: image.base64 } }] : []),
        ],
      }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),

    classify: (status, payload) => {
      const message = payload?.error?.message ?? '';
      if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(message)) return ApiErrorCode.INVALID_KEY;
      if (status === 400 && /not found|not supported for|does not (exist|support generate)/i.test(message)) {
        return ApiErrorCode.UNKNOWN_MODEL;
      }
      if (payload?.error?.status === 'RESOURCE_EXHAUSTED') return ApiErrorCode.QUOTA;
      return classifyCommon(status, message);
    },

    errorDetail: (payload, status) => payload?.error?.message ?? `HTTP ${status}`,

    /** `GET /v1beta/models` — what this key is actually allowed to call. */
    listUrl: ({ baseUrl }) => `${baseUrl}/v1beta/models?pageSize=200`,

    parseModels: (payload) => (Array.isArray(payload?.models) ? payload.models : [])
      // `name` is "models/gemma-4-31b-it"; the id is the part after the slash.
      .map((m) => ({
        id: String(m?.name ?? '').replace(/^models\//, ''),
        label: typeof m?.displayName === 'string' ? m.displayName : '',
        methods: Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [],
      }))
      .filter((m) => m.id && m.methods.includes('generateContent')),

    parse: (payload) => {
      const candidate = payload?.candidates?.[0];
      if (!candidate) {
        const blockReason = payload?.promptFeedback?.blockReason;
        return blockReason
          ? { error: ApiErrorCode.BLOCKED, detail: blockReason }
          : { error: ApiErrorCode.BAD_RESPONSE, detail: 'no candidates' };
      }
      if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
        return { error: ApiErrorCode.BLOCKED, detail: candidate.finishReason };
      }
      const text = candidate.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
      return { text, truncated: candidate.finishReason === 'MAX_TOKENS' };
    },
  },

  openai: {
    // The base URL is expected to include the version segment, the way every
    // one of these services documents it (".../v1"). Appending it here would
    // break the ones that don't use "v1" — Azure, and most local runtimes.
    url: ({ baseUrl }) => `${baseUrl}/chat/completions`,

    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),

    body: ({ prompt, image, model, temperature, maxTokens }) => ({
      model,
      messages: [{
        role: 'user',
        content: image
          ? [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
          ]
          : prompt,
      }],
      temperature,
      max_tokens: maxTokens,
      // Deliberately no `response_format`. These prompts ask for a JSON *array*
      // and OpenAI's json_object mode requires a top-level object; the
      // brace-balancing extractor handles fenced or prose-wrapped replies
      // anyway, and many compatible servers reject the parameter outright.
    }),

    classify: (status, payload) => {
      const message = payload?.error?.message ?? '';
      if (/model/i.test(message) && /not (found|exist)|unknown|invalid/i.test(message)) {
        return ApiErrorCode.UNKNOWN_MODEL;
      }
      if (status === 400 && /content|policy|safety/i.test(message)) return ApiErrorCode.BLOCKED;
      return classifyCommon(status, message);
    },

    errorDetail: (payload, status) => payload?.error?.message ?? `HTTP ${status}`,

    /** The near-universal `/v1/models` listing. */
    listUrl: ({ baseUrl }) => `${baseUrl}/models`,

    parseModels: (payload) => (Array.isArray(payload?.data) ? payload.data : [])
      .map((m) => ({ id: String(m?.id ?? ''), label: '', methods: [] }))
      .filter((m) => m.id),

    parse: (payload) => {
      const choice = payload?.choices?.[0];
      if (!choice) return { error: ApiErrorCode.BAD_RESPONSE, detail: 'no choices' };
      if (choice.finish_reason === 'content_filter') {
        return { error: ApiErrorCode.BLOCKED, detail: 'content_filter' };
      }
      const raw = choice.message?.content;
      // Some servers return the newer content-parts array rather than a string.
      const text = typeof raw === 'string'
        ? raw
        : Array.isArray(raw) ? raw.map((p) => p?.text ?? '').join('') : '';
      return { text, truncated: choice.finish_reason === 'length' };
    },
  },
};

/* ------------------------------------------------------------------ request */

/**
 * One HTTP round trip, returning `{ status, ok, payload }`.
 *
 * Network-level failures still throw `ApiError`; an HTTP error status does
 * not, because a caller may want to inspect it and retry differently.
 */
async function httpJson({ url, method, apiKey, adapter, body, signal, timeoutMs, label }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  const onExternalAbort = () => controller.abort(signal.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      // A third-party endpoint gets the key in a header and nothing else:
      // no ambient cookies, no Referer naming the app, no cached copy of a
      // request body that contains the user's health questions.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...adapter.headers(apiKey),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err; // caller cancelled deliberately
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      throw new ApiError(ApiErrorCode.TIMEOUT, err, label);
    }
    throw new ApiError(ApiErrorCode.NETWORK, err, label);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return { status: response.status, ok: response.ok, payload };
}

/** Resolve config, key and adapter, or throw the right `ApiError`. */
function prepare(apiKey, config) {
  const cfg = normalizeApiConfig(config);
  const label = apiConfigLabel(cfg);
  const adapter = adapters[cfg.protocol] ?? adapters[PROTOCOLS.gemini.id];

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new ApiError(ApiErrorCode.NO_KEY, null, label);
  }
  const usable = checkApiConfigUsable(cfg);
  if (!usable.ok) {
    throw new ApiError(
      cfg.model ? ApiErrorCode.NOT_ALLOWED : ApiErrorCode.NO_MODEL,
      usable.message,
      label,
      cfg.model,
    );
  }
  return { cfg, label, adapter, key: apiKey.trim() };
}

/**
 * Does this 400 mean "I don't do JSON mode" rather than "your request is bad"?
 *
 * Structured output is not universal. Gemma served through the Gemini API,
 * older mirrors, and most self-hosted runtimes reject `responseMimeType`
 * outright, which turned every food analysis into a hard failure while plain
 * chat kept working — a confusing split, since the model was plainly reachable.
 * The prompt already demands a bare JSON array and the reply goes through a
 * brace-balancing extractor that copes with fences and stray prose, so dropping
 * the flag costs nothing but a little reliability on models that did support it.
 */
function isJsonModeRejection(status, payload) {
  if (status !== 400) return false;
  const message = String(payload?.error?.message ?? '');
  return /response_?mime_?type|responseSchema|response_schema|json.{0,20}(mode|output)|structured output/i
    .test(message);
}

/**
 * Send one prompt and return `{ text, truncated }`. Throws `ApiError`.
 *
 * `config` is an api config as produced by `normalizeApiConfig`; omitting it
 * uses the Google default, which keeps every existing call site honest.
 */
export async function callModel({
  apiKey, config, prompt, image, signal,
  temperature = 0.2, maxTokens = 2048, json = false,
  timeoutMs = GEMINI_TIMEOUT_MS,
}) {
  const { cfg, label, adapter, key } = prepare(apiKey, config);

  const send = (useJson) => httpJson({
    url: adapter.url(cfg),
    method: 'POST',
    apiKey: key,
    adapter,
    body: adapter.body({
      prompt, image, model: cfg.model, temperature, maxTokens, json: useJson,
    }),
    signal,
    timeoutMs,
    label,
  });

  let { status, ok, payload } = await send(json);

  // Retried once, without the flag, so a model that cannot do structured
  // output still answers instead of erroring.
  if (!ok && json && isJsonModeRejection(status, payload)) {
    ({ status, ok, payload } = await send(false));
  }

  if (!ok) {
    throw new ApiError(
      adapter.classify(status, payload),
      adapter.errorDetail(payload, status),
      label,
      cfg.model,
    );
  }

  const result = adapter.parse(payload);
  if (result.error) throw new ApiError(result.error, result.detail, label, cfg.model);
  if (!result.text?.trim()) throw new ApiError(ApiErrorCode.BAD_RESPONSE, 'empty text', label, cfg.model);
  return result;
}

/**
 * List the models this key can actually call.
 *
 * Exists because a mistyped model name is indistinguishable from a broken key
 * or a down service from inside the app — `gemma-41-31b-it` and
 * `gemma-4-31b-it` produce the same opaque failure. Rather than shipping a
 * hard-coded menu that goes stale every time Google adds a model, this asks.
 *
 * Returns `[{ id, label, methods }]`, sorted, and never throws for a missing
 * model name: listing is exactly what you do *before* you have one.
 */
export async function listModels({ apiKey, config, signal, timeoutMs = 20000 } = {}) {
  const cfg = normalizeApiConfig(config);
  const label = apiConfigLabel(cfg);
  const adapter = adapters[cfg.protocol] ?? adapters[PROTOCOLS.gemini.id];

  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new ApiError(ApiErrorCode.NO_KEY, null, label);
  }
  if (!isOriginAllowed(cfg.baseUrl)) {
    throw new ApiError(ApiErrorCode.NOT_ALLOWED, cfg.baseUrl, label);
  }

  const { status, ok, payload } = await httpJson({
    url: adapter.listUrl(cfg),
    method: 'GET',
    apiKey: apiKey.trim(),
    adapter,
    body: null,
    signal,
    timeoutMs,
    label,
  });

  if (!ok) {
    throw new ApiError(
      adapter.classify(status, payload),
      adapter.errorDetail(payload, status),
      label,
      cfg.model,
    );
  }

  const models = adapter.parseModels(payload);
  if (!models.length) throw new ApiError(ApiErrorCode.BAD_RESPONSE, 'no models listed', label);
  return models.sort((a, b) => a.id.localeCompare(b.id));
}
