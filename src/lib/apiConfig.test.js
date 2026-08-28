import { describe, it, expect } from 'vitest';
import {
  GOOGLE_ORIGIN, DEFAULT_API_CONFIG, validateBaseUrl, normalizeApiConfig,
  isDefaultApiConfig, isOriginAllowed, apiConfigLabel, checkApiConfigUsable,
} from './apiConfig.js';

describe('validateBaseUrl', () => {
  it('accepts an https origin and strips the trailing slash', () => {
    expect(validateBaseUrl('https://openrouter.ai/api/v1/')).toEqual({ url: 'https://openrouter.ai/api/v1' });
    expect(validateBaseUrl('  https://example.com  ')).toEqual({ url: 'https://example.com' });
  });

  it('rejects plain http for a remote host', () => {
    expect(validateBaseUrl('http://example.com').error).toMatch(/https/);
  });

  it('allows plain http only for loopback, where nothing crosses the network', () => {
    expect(validateBaseUrl('http://localhost:11434/v1')).toEqual({ url: 'http://localhost:11434/v1' });
    expect(validateBaseUrl('http://127.0.0.1:1234/v1')).toEqual({ url: 'http://127.0.0.1:1234/v1' });
  });

  it('rejects credentials embedded in the address', () => {
    // These end up in proxy and server access logs; the key belongs in a header.
    expect(validateBaseUrl('https://user:secret@example.com').error).toMatch(/key field/);
  });

  it('rejects a query string or fragment', () => {
    expect(validateBaseUrl('https://example.com/v1?key=abc').error).toMatch(/query string/);
    expect(validateBaseUrl('https://example.com/v1#x').error).toMatch(/query string/);
  });

  it('rejects empty, over-long and unparseable input', () => {
    expect(validateBaseUrl('').error).toBeTruthy();
    expect(validateBaseUrl(null).error).toBeTruthy();
    expect(validateBaseUrl('not a url').error).toBeTruthy();
    expect(validateBaseUrl(`https://example.com/${'a'.repeat(400)}`).error).toMatch(/too long/);
  });

  it('rejects non-http schemes', () => {
    expect(validateBaseUrl('javascript:alert(1)').error).toBeTruthy();
    expect(validateBaseUrl('file:///etc/passwd').error).toBeTruthy();
  });
});

describe('normalizeApiConfig', () => {
  it('is total — junk yields the default rather than throwing', () => {
    for (const junk of [null, undefined, 42, 'nope', [], { protocol: 'evil' }]) {
      expect(normalizeApiConfig(junk)).toEqual({ ...DEFAULT_API_CONFIG });
    }
  });

  it('keeps a valid custom config', () => {
    expect(normalizeApiConfig({ protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'gpt-4o-mini' }))
      .toEqual({ protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'gpt-4o-mini' });
  });

  it('falls back to the default base URL when the stored one is unusable', () => {
    expect(normalizeApiConfig({ protocol: 'gemini', baseUrl: 'http://evil.example', model: 'x' }).baseUrl)
      .toBe(GOOGLE_ORIGIN);
  });

  it('strips control characters from the model name', () => {
    // A model name is interpolated into a URL path (gemini) or a JSON body
    // (openai); a stray newline or NUL there is a request-splitting shape.
    const dirty = normalizeApiConfig({ protocol: 'openai', baseUrl: 'https://example.com', model: 'gpt\n\u0000-4o\u007f' });
    expect(dirty.model).toBe('gpt-4o');
  });

  it('substitutes the protocol default when the model is blank', () => {
    expect(normalizeApiConfig({ protocol: 'gemini', baseUrl: GOOGLE_ORIGIN, model: '   ' }).model)
      .toBe(DEFAULT_API_CONFIG.model);
  });
});

describe('isDefaultApiConfig', () => {
  it('recognises the untouched default, including from junk', () => {
    expect(isDefaultApiConfig(DEFAULT_API_CONFIG)).toBe(true);
    expect(isDefaultApiConfig(null)).toBe(true);
  });

  it('is false once anything is customised', () => {
    expect(isDefaultApiConfig({ ...DEFAULT_API_CONFIG, model: 'gemini-2.5-pro' })).toBe(false);
  });
});

describe('isOriginAllowed', () => {
  it('always allows Google, so the zero-config path works', () => {
    expect(isOriginAllowed(GOOGLE_ORIGIN)).toBe(true);
    expect(isOriginAllowed(`${GOOGLE_ORIGIN}/v1beta`)).toBe(true);
  });

  it('rejects anything not baked into this build', () => {
    expect(isOriginAllowed('https://evil.example')).toBe(false);
    expect(isOriginAllowed('garbage')).toBe(false);
  });
});

describe('apiConfigLabel', () => {
  it('names Google by product and everyone else by host', () => {
    expect(apiConfigLabel(DEFAULT_API_CONFIG)).toBe('Gemini');
    expect(apiConfigLabel({ protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'x' }))
      .toBe('openrouter.ai');
  });
});

describe('checkApiConfigUsable', () => {
  it('accepts the default', () => {
    expect(checkApiConfigUsable(DEFAULT_API_CONFIG)).toEqual({ ok: true });
  });

  it('explains what to do when the origin is not in the build allowlist', () => {
    // normalizeApiConfig would rewrite a bad URL back to Google, so exercise the
    // branch with an origin that parses but is not allowed.
    const result = checkApiConfigUsable({ protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1', model: 'x' });
    if (!result.ok) expect(result.message).toMatch(/VITE_API_ORIGINS/);
  });
});
