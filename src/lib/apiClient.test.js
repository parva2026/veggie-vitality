import { afterEach, describe, expect, it, vi } from 'vitest';

import { callModel, listModels, ApiErrorCode } from './apiClient.js';

const KEY = 'test-key';

/** Queue of responses `fetch` will hand back, in order. */
function mockFetch(...responses) {
  const calls = [];
  const fn = vi.fn(async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    const next = responses.shift() ?? { status: 500, payload: {} };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.payload,
    };
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

const reply = (text) => ({
  status: 200,
  payload: { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] },
});

const err = (status, message) => ({ status, payload: { error: { message } } });

afterEach(() => { vi.unstubAllGlobals(); });

describe('unknown model', () => {
  it('names the model rather than claiming none is set', async () => {
    mockFetch(err(404, 'models/gemma-41-31b-it is not found'));
    await expect(callModel({ apiKey: KEY, prompt: 'hi', config: { model: 'gemma-41-31b-it' } }))
      .rejects.toMatchObject({ code: ApiErrorCode.UNKNOWN_MODEL });
  });

  it('quotes the name back, so a typo is visible', async () => {
    mockFetch(err(404, 'not found'));
    await expect(callModel({ apiKey: KEY, prompt: 'hi', config: { model: 'gemma-41-31b-it' } }))
      .rejects.toThrow(/gemma-41-31b-it/);
  });

  it('still reports NO_MODEL when the name really is empty', async () => {
    mockFetch(reply('x'));
    await expect(callModel({
      apiKey: KEY, prompt: 'hi', config: { protocol: 'openai', baseUrl: 'https://generativelanguage.googleapis.com', model: '' },
    })).rejects.toMatchObject({ code: ApiErrorCode.NO_MODEL });
  });
});

describe('JSON mode fallback', () => {
  it('sends responseMimeType on the first attempt', async () => {
    const calls = mockFetch(reply('[]'));
    await callModel({ apiKey: KEY, prompt: 'hi', json: true });
    expect(calls[0].body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('retries without the flag when the model rejects structured output', async () => {
    const calls = mockFetch(
      err(400, 'Developer instruction is not enabled for models/gemma-4-31b-it: response_mime_type'),
      reply('[{"name":"dal"}]'),
    );
    const { text } = await callModel({ apiKey: KEY, prompt: 'hi', json: true });

    expect(calls).toHaveLength(2);
    expect(calls[0].body.generationConfig.responseMimeType).toBe('application/json');
    expect(calls[1].body.generationConfig.responseMimeType).toBeUndefined();
    expect(text).toContain('dal');
  });

  it('does not retry a 400 that is about something else', async () => {
    const calls = mockFetch(err(400, 'API key not valid'));
    await expect(callModel({ apiKey: KEY, prompt: 'hi', json: true }))
      .rejects.toMatchObject({ code: ApiErrorCode.INVALID_KEY });
    expect(calls).toHaveLength(1);
  });

  it('does not retry when json was never requested', async () => {
    const calls = mockFetch(err(400, 'response_mime_type unsupported'));
    await expect(callModel({ apiKey: KEY, prompt: 'hi' })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});

describe('listModels', () => {
  const page = {
    status: 200,
    payload: {
      models: [
        { name: 'models/gemma-4-31b-it', displayName: 'Gemma 4 31B', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', displayName: 'Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', displayName: 'Embed', supportedGenerationMethods: ['embedContent'] },
      ],
    },
  };

  it('returns generateContent models, sorted, without the models/ prefix', async () => {
    mockFetch(page);
    const models = await listModels({ apiKey: KEY });
    expect(models.map((m) => m.id)).toEqual(['gemini-2.5-flash', 'gemma-4-31b-it']);
  });

  it('drops models that cannot generate content', async () => {
    mockFetch(page);
    const models = await listModels({ apiKey: KEY });
    expect(models.map((m) => m.id)).not.toContain('text-embedding-004');
  });

  it('uses GET with the key in a header and nothing in the query string', async () => {
    const calls = mockFetch(page);
    await listModels({ apiKey: KEY });
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.headers['x-goog-api-key']).toBe(KEY);
    expect(calls[0].url).not.toContain(KEY);
  });

  it('works with no model name set — listing is what you do before choosing one', async () => {
    mockFetch(page);
    await expect(listModels({ apiKey: KEY, config: { model: '' } })).resolves.toHaveLength(2);
  });

  it('refuses without a key', async () => {
    mockFetch(page);
    await expect(listModels({ apiKey: '' })).rejects.toMatchObject({ code: ApiErrorCode.NO_KEY });
  });

  it('refuses an origin outside the build allowlist', async () => {
    // The listing route sends the key too, so it gets the same origin check as
    // generateContent — otherwise it would be a way to post the key anywhere.
    const calls = mockFetch(page);
    await expect(listModels({ apiKey: KEY, config: { baseUrl: 'https://evil.example' } }))
      .rejects.toMatchObject({ code: ApiErrorCode.NOT_ALLOWED });
    expect(calls).toHaveLength(0);
  });

  it('reports a bad key', async () => {
    mockFetch(err(403, 'permission denied'));
    await expect(listModels({ apiKey: KEY })).rejects.toMatchObject({ code: ApiErrorCode.INVALID_KEY });
  });
});
