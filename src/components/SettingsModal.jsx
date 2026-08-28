import { useRef, useState } from 'react';
import {
  Settings, Eye, EyeOff, Download, Upload, KeyRound, Loader2, CheckCircle2, ExternalLink,
  Server, RotateCcw,
} from 'lucide-react';
import { Modal, Field } from './ui.jsx';
import { inputClass } from './styles.js';
import { ProfileSetup } from './ProfileSetup.jsx';
import { verifyApiKey, ApiError } from '../lib/ai.js';
import { listModels } from '../lib/apiClient.js';
import { buildBackup, parseBackup } from '../lib/storage.js';
import { saveTextFile } from '../lib/platform.js';
import { todayKey } from '../lib/dates.js';
import {
  PROTOCOLS, DEFAULT_API_CONFIG, GOOGLE_ORIGIN, validateBaseUrl, normalizeApiConfig,
  isDefaultApiConfig, allowedApiOrigins, isOriginAllowed,
} from '../lib/apiConfig.js';

const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export function SettingsModal({
  onClose, apiKey, onSetApiKey, apiConfig, onSetApiConfig, profile, onSaveProfile, state,
  onImport, onRequestReset, onNotify, storageName,
}) {
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [includeApiKey, setIncludeApiKey] = useState(false);
  const [includeChat, setIncludeChat] = useState(true);
  const fileRef = useRef(null);

  // Endpoint drafts. Kept local until "Save endpoint" so a half-typed URL never
  // becomes the live destination for the next request.
  const [protocol, setProtocol] = useState(apiConfig?.protocol ?? DEFAULT_API_CONFIG.protocol);
  const [urlDraft, setUrlDraft] = useState(apiConfig?.baseUrl ?? DEFAULT_API_CONFIG.baseUrl);
  const [modelDraft, setModelDraft] = useState(apiConfig?.model ?? DEFAULT_API_CONFIG.model);
  const [urlError, setUrlError] = useState(null);
  const [models, setModels] = useState(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState(null);
  const [showEndpoint, setShowEndpoint] = useState(() => !isDefaultApiConfig(apiConfig));

  const draftConfig = () => normalizeApiConfig({ protocol, baseUrl: urlDraft, model: modelDraft });

  /** Ask the configured endpoint which models this key can call. */
  const loadModels = async () => {
    setLoadingModels(true);
    setModelsError(null);
    try {
      setModels(await listModels({ apiKey: keyDraft.trim(), config: draftConfig() }));
    } catch (err) {
      setModels(null);
      setModelsError(err instanceof ApiError ? err.message : 'Could not load the model list.');
    } finally {
      setLoadingModels(false);
    }
  };
  const usingGoogle = (apiConfig?.baseUrl ?? DEFAULT_API_CONFIG.baseUrl) === GOOGLE_ORIGIN;
  const endpointHost = (() => {
    try { return new URL(apiConfig?.baseUrl ?? DEFAULT_API_CONFIG.baseUrl).host; } catch { return 'the API'; }
  })();

  /** Validate and persist the endpoint. Returns the saved config, or null. */
  const saveEndpoint = async ({ quiet = false } = {}) => {
    const { url, error } = validateBaseUrl(urlDraft);
    if (error) { setUrlError(error); return null; }
    if (!isOriginAllowed(url)) {
      setUrlError(
        `This build can only contact ${allowedApiOrigins().join(', ')}. `
        + 'Rebuild with VITE_API_ORIGINS set to allow another address — see the README.',
      );
      return null;
    }
    if (!modelDraft.trim()) { setUrlError('Enter the model name to use.'); return null; }

    setUrlError(null);
    const saved = await onSetApiConfig({ protocol, baseUrl: url, model: modelDraft });
    setUrlDraft(saved.baseUrl);
    setModelDraft(saved.model);
    setVerified(false);
    if (!quiet) onNotify({ type: 'success', message: 'API endpoint saved.' });
    return saved;
  };

  const resetEndpoint = async () => {
    setProtocol(DEFAULT_API_CONFIG.protocol);
    setUrlDraft(DEFAULT_API_CONFIG.baseUrl);
    setModelDraft(DEFAULT_API_CONFIG.model);
    setUrlError(null);
    setVerified(false);
    await onSetApiConfig(DEFAULT_API_CONFIG);
    onNotify({ type: 'success', message: 'Back to the default Google endpoint.' });
  };

  const saveKey = async () => {
    await onSetApiKey(keyDraft);
    setVerified(false);
    onNotify({ type: 'success', message: keyDraft.trim() ? 'API key saved.' : 'API key removed.' });
  };

  const testKey = async () => {
    const candidate = keyDraft.trim();
    if (!candidate) { onNotify({ type: 'error', message: 'Enter a key first.' }); return; }
    setVerifying(true);
    setVerified(false);
    try {
      // Test what is on screen, not what was last saved — otherwise editing the
      // endpoint and pressing Test silently checks the old one.
      const config = draftConfig();
      await verifyApiKey(candidate, { config });
      setVerified(true);
      await saveEndpoint({ quiet: true });
      await onSetApiKey(candidate);
      setVerified(true);
      onNotify({ type: 'success', message: 'Key works and has been saved.' });
    } catch (err) {
      onNotify({
        type: 'error',
        message: err instanceof ApiError ? err.message : 'The key could not be verified.',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleExport = async () => {
    try {
      const backup = buildBackup(state, apiKey, { includeApiKey, includeChat, apiConfig });
      const result = await saveTextFile(
        `veggie-tracker-backup-${todayKey()}.json`,
        JSON.stringify(backup, null, 2),
      );
      onNotify({
        type: 'success',
        message: result.method === 'download'
          ? 'Backup downloaded.'
          : 'Backup saved to your Documents folder.',
      });
    } catch (err) {
      console.error('Export failed:', err);
      onNotify({ type: 'error', message: 'The backup could not be saved.' });
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      onNotify({ type: 'error', message: 'That file is too large to be a backup.' });
      return;
    }
    try {
      const { state: imported, apiKey: importedKey, apiConfig: importedConfig } = parseBackup(await file.text());
      onImport(imported, importedKey, importedConfig);
    } catch (err) {
      onNotify({ type: 'error', message: err.message ?? 'That backup could not be read.' });
    }
  };

  if (editingProfile) {
    return (
      <Modal title="Edit profile" icon={Settings} onClose={() => setEditingProfile(false)}>
        <ProfileSetup
          initial={profile ?? undefined}
          submitLabel="Save profile"
          onCancel={() => setEditingProfile(false)}
          onSave={(next) => {
            onSaveProfile(next);
            setEditingProfile(false);
            onNotify({ type: 'success', message: 'Profile updated — your targets have been recalculated.' });
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal title="Settings" icon={Settings} onClose={onClose}>
      <div className="space-y-6">
        {/* ------------------------------------------------------- API key */}
        <section>
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2 flex items-center gap-2">
            <KeyRound className="w-4 h-4" aria-hidden="true" /> API key
          </h3>
          <Field
            label="Key"
            htmlFor="api-key"
            hint={`Stored only on this device and sent to ${usingGoogle ? 'Google' : endpointHost} in a request header. Anyone with access to this device can read it.`}
          >
            <div className="relative">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={keyDraft}
                onChange={(e) => { setKeyDraft(e.target.value); setVerified(false); }}
                placeholder="AIza…"
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                className={`${inputClass(false)} pr-11 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-1 top-1 bottom-1 px-2.5 text-slate-400 hover:text-slate-600"
              >
                {showKey
                  ? <EyeOff className="w-4 h-4" aria-hidden="true" />
                  : <Eye className="w-4 h-4" aria-hidden="true" />}
              </button>
            </div>
          </Field>
          <div className="flex gap-2 mt-2">
            <button
              type="button" onClick={saveKey}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
            >
              Save
            </button>
            <button
              type="button" onClick={testKey} disabled={verifying}
              className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {verifying && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {verified && !verifying && <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />}
              {verifying ? 'Testing…' : 'Test key'}
            </button>
          </div>
          {usingGoogle && (
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank" rel="noopener noreferrer"
              className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline mt-2 inline-flex items-center gap-1"
            >
              Get a free key <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          )}
        </section>

        {/* ------------------------------------------------------ endpoint */}
        <section className="border-t border-slate-100 dark:border-slate-800 pt-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Server className="w-4 h-4" aria-hidden="true" /> Where requests go
            </h3>
            <button
              type="button"
              onClick={() => setShowEndpoint((v) => !v)}
              aria-expanded={showEndpoint}
              className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              {showEndpoint ? 'Hide' : 'Change'}
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {usingGoogle
              ? 'Google Gemini (default).'
              : `${PROTOCOLS[apiConfig.protocol].label} · ${endpointHost} · ${apiConfig.model}`}
          </p>

          {showEndpoint && (
            <div className="mt-3 space-y-3">
              <Field label="API style" htmlFor="api-protocol" hint="How the request is shaped. Most services other than Google use the OpenAI-compatible style.">
                <select
                  id="api-protocol"
                  value={protocol}
                  onChange={(e) => {
                    const next = e.target.value;
                    setProtocol(next);
                    setUrlError(null);
                    // Moving to Gemini with nothing typed yet should land on a
                    // working default rather than an empty box.
                    if (next === 'gemini' && !urlDraft.trim()) setUrlDraft(GOOGLE_ORIGIN);
                    if (!modelDraft.trim()) setModelDraft(PROTOCOLS[next].defaultModel);
                  }}
                  className={inputClass(false)}
                >
                  {Object.values(PROTOCOLS).map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </Field>

              <Field
                label="Address"
                htmlFor="api-url"
                hint={protocol === 'openai'
                  ? 'Include the version segment, e.g. https://openrouter.ai/api/v1 — the app appends /chat/completions.'
                  : 'The server root, e.g. https://generativelanguage.googleapis.com — the app appends the model path.'}
                error={urlError ?? undefined}
              >
                <input
                  id="api-url"
                  type="url"
                  inputMode="url"
                  value={urlDraft}
                  onChange={(e) => { setUrlDraft(e.target.value); setUrlError(null); }}
                  placeholder="https://…"
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  className={`${inputClass(Boolean(urlError))} font-mono text-xs`}
                />
              </Field>

              <Field label="Model" htmlFor="api-model" hint={PROTOCOLS[protocol].modelHint}>
                <input
                  id="api-model"
                  type="text"
                  value={modelDraft}
                  onChange={(e) => { setModelDraft(e.target.value); setUrlError(null); }}
                  autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
                  className={`${inputClass(false)} font-mono text-xs`}
                />
              </Field>

              {/*
                A model name is the one setting with no way to check your work:
                a typo and a revoked key fail identically from in here. This asks
                the endpoint what it actually serves, rather than shipping a
                hard-coded menu that goes stale whenever a model is added.
              */}
              <button
                type="button"
                onClick={loadModels}
                disabled={loadingModels || !keyDraft.trim()}
                className="w-full py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {loadingModels ? 'Asking the endpoint…' : 'Show available models'}
              </button>
              {!keyDraft.trim() && (
                <p className="text-xs text-slate-400 dark:text-slate-500 -mt-1">
                  Add an API key above first — the list is what your key can reach.
                </p>
              )}
              {modelsError && (
                <p className="text-xs text-rose-600 dark:text-rose-400 -mt-1">{modelsError}</p>
              )}
              {models && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto">
                  <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    {models.length} models · tap one to use it
                  </p>
                  {models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => { setModelDraft(m.id); setUrlError(null); }}
                      className={`w-full text-left px-3 py-2 text-xs font-mono border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        m.id === modelDraft.trim() ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {m.id}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button" onClick={() => saveEndpoint()}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                >
                  Save endpoint
                </button>
                <button
                  type="button" onClick={resetEndpoint}
                  className="py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" /> Default
                </button>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                For your safety this build will only talk to:{' '}
                <span className="font-mono break-all">{allowedApiOrigins().join(', ')}</span>.
                Adding another address means rebuilding the app with{' '}
                <span className="font-mono">VITE_API_ORIGINS</span> — see the README. Whatever you
                point this at receives everything you type, including your health questions.
              </p>
            </div>
          )}
        </section>

        {/* ------------------------------------------------------- profile */}
        <section className="border-t border-slate-100 dark:border-slate-800 pt-5">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Profile</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
            {profile
              ? `${profile.name}, ${profile.age} · ${profile.weight}kg · ${profile.height}cm`
              : 'No profile set.'}
          </p>
          <button
            type="button"
            onClick={() => setEditingProfile(true)}
            className="w-full py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Edit profile and targets
          </button>
        </section>

        {/* -------------------------------------------------------- backup */}
        <section className="border-t border-slate-100 dark:border-slate-800 pt-5">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 mb-2">Your data</h3>
          {/*
            The export carries the medicine list and dose history unconditionally.
            That is the most sensitive thing here — a medicine list names conditions
            the user never typed — so it is stated up front rather than left for
            someone to discover by opening the file.
          */}
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            A backup holds your profile, food and water logs, weight history, and your
            medicines and dose history. Keep the file somewhere you would keep medical
            records.
          </p>
          <div className="space-y-2 mb-3">
            <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox" checked={includeChat}
                onChange={(e) => setIncludeChat(e.target.checked)}
                className="mt-0.5 accent-emerald-600"
              />
              Include chat history
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox" checked={includeApiKey}
                onChange={(e) => setIncludeApiKey(e.target.checked)}
                className="mt-0.5 accent-rose-600"
              />
              <span>
                Include my API key
                <span className="block text-[11px] text-rose-500">
                  Not recommended — anyone who opens the backup file can use your key.
                </span>
              </span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button" onClick={handleExport}
              className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" aria-hidden="true" /> Export
            </button>
            <button
              type="button" onClick={() => fileRef.current?.click()}
              className="flex-1 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" aria-hidden="true" /> Import
            </button>
          </div>
          <input
            ref={fileRef} type="file" accept="application/json,.json"
            onChange={handleImportFile} className="hidden" tabIndex={-1}
          />
          <p className="text-[11px] text-slate-400 mt-2">
            Saved on this device only ({storageName}). Nothing is uploaded except the food
            descriptions and questions you send to {usingGoogle ? 'Google Gemini' : endpointHost}.
          </p>
        </section>

        {/* --------------------------------------------------------- reset */}
        <section className="border-t border-slate-100 dark:border-slate-800 pt-5">
          <button
            type="button" onClick={onRequestReset}
            className="w-full py-2.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            Delete all my data
          </button>
        </section>
      </div>
    </Modal>
  );
}
