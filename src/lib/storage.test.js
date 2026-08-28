import { describe, it, expect } from 'vitest';
import { buildBackup, parseBackup, saveState, loadState } from './storage.js';
import { normalizeAppState } from './schema.js';

const STATE = normalizeAppState({
  userProfile: { name: 'Sam', age: 30, gender: 'female', weight: 60, height: 165, activity: 'light' },
  logs: { '2025-06-01': [{ name: 'Rice', weight: 100, calories: 130, protein: 2.7 }] },
  waterLogs: { '2025-06-01': 1500 },
  weightHistory: [{ date: '2025-06-01', weight: 60 }],
  docHistory: [{ role: 'user', content: 'am I low on iron?' }],
});

describe('buildBackup', () => {
  it('excludes the API key by default', () => {
    const backup = buildBackup(STATE, 'AIzaSECRET');
    expect(backup.apiKey).toBeUndefined();
    expect(JSON.stringify(backup)).not.toContain('AIzaSECRET');
  });

  it('includes the key only when explicitly opted in', () => {
    expect(buildBackup(STATE, 'AIzaSECRET', { includeApiKey: true }).apiKey).toBe('AIzaSECRET');
  });

  it('can leave out the chat transcript', () => {
    expect(buildBackup(STATE, '', { includeChat: false }).docHistory).toEqual([]);
    expect(buildBackup(STATE, '', { includeChat: true }).docHistory.length).toBe(1);
  });

  it('round-trips through parseBackup', () => {
    const text = JSON.stringify(buildBackup(STATE, ''));
    const { state } = parseBackup(text);
    expect(state.userProfile.name).toBe('Sam');
    expect(state.logs['2025-06-01']).toHaveLength(1);
    expect(state.waterLogs['2025-06-01']).toBe(1500);
  });
});

describe('parseBackup', () => {
  it('rejects invalid JSON with a readable message', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/i);
  });

  it('rejects JSON that is not a backup', () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow(/backup/i);
    expect(() => parseBackup('[1,2,3]')).toThrow(/backup/i);
    expect(() => parseBackup('null')).toThrow(/backup/i);
  });

  it('sanitises a hostile backup instead of trusting it', () => {
    const { state } = parseBackup(JSON.stringify({
      userProfile: { name: 'X', age: 900, gender: 'x', weight: -5, height: 0, activity: 'nope' },
      logs: {
        '2025-06-01': 'corrupt',
        '2025-06-02': [{ name: 'Salt', weight: 1e12, sodium: 1e12, evil: 'field' }],
      },
      waterLogs: { '2025-06-01': 'lots' },
    }));
    expect(state.userProfile).toBeNull();
    expect(state.logs['2025-06-01']).toBeUndefined();
    expect(state.logs['2025-06-02'][0].evil).toBeUndefined();
    expect(state.logs['2025-06-02'][0].sodium).toBeLessThan(1e12);
    expect(state.waterLogs['2025-06-01']).toBeUndefined();
  });

  it('extracts an embedded API key so an old backup can still restore it', () => {
    const { apiKey } = parseBackup(JSON.stringify({ logs: {}, apiKey: '  AIzaX  ' }));
    expect(apiKey).toBe('AIzaX');
  });
});


/**
 * Persistence and backups each build their own payload object, so a field added
 * to the state shape can be silently dropped by one of them. These assert the
 * whole shape rather than named fields, so the next added collection fails here
 * instead of quietly failing to save.
 */
describe('persistence covers the whole state shape', () => {
  const FULL = normalizeAppState({
    ...STATE,
    medicines: [{ id: 'med_1', name: 'B12', dose: '1 tablet', times: ['08:00', '20:30'] }],
    medLogs: { '2025-06-01': { med_1: ['08:00'] } },
    waterReminder: { enabled: true, startHour: 9, endHour: 21, everyMinutes: 90 },
  }, { source: 'stored' });

  it('saves and reloads every collection', async () => {
    await saveState(FULL);
    const { state } = await loadState();
    for (const key of Object.keys(FULL)) {
      expect(state[key], `state.${key} did not survive a save/load round-trip`).toEqual(FULL[key]);
    }
  });

  it('carries every collection into a backup', () => {
    // Compared against the backup body rather than a parsed round-trip: parsing
    // deliberately re-mints entry ids, which is not what this is guarding.
    const backup = buildBackup(FULL, '');
    for (const key of Object.keys(FULL)) {
      expect(backup[key], `state.${key} is missing from the backup`).toEqual(FULL[key]);
    }
  });
});
