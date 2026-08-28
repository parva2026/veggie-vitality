import React from 'react';
import { AlertTriangle } from 'lucide-react';

import { loadState, buildBackup } from '../lib/storage.js';
import { saveTextFile } from '../lib/platform.js';
import { STORAGE_KEY, LEGACY_STORAGE_KEYS } from '../lib/constants.js';

/**
 * Last-ditch read straight out of localStorage, for when even `loadState` is
 * the thing that is broken.
 *
 * The legacy blob carried the Gemini API key inline, so the key is stripped
 * before the text ever reaches a file: a rescue export is exactly the file a
 * user forwards to someone for help.
 */
function rawFallbackExport() {
  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const { apiKey: _dropped, ...rest } = JSON.parse(raw);
      return JSON.stringify(rest, null, 2);
    } catch {
      // Unparseable — still worth rescuing, but redact the key textually rather
      // than shipping a truncated v9 blob with the credential still inside.
      return raw.replace(/"apiKey"\s*:\s*"[^"]*"/g, '"apiKey":""');
    }
  }
  return null;
}

/**
 * Catches render errors so a single bad value cannot leave the user staring at
 * a white screen with no way out. Offers an export escape hatch, because the
 * data is almost always still fine even when rendering it is not.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, exportState: 'idle' }; // idle | busy | done | unsent | empty | failed
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Veggie Tracker crashed while rendering:', error, info);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  /**
   * Rescue export.
   *
   * Goes through the normal storage layer so it works on Android, where the data
   * lives in Capacitor Preferences and an anchor-click download is a no-op — the
   * old version silently produced nothing there. The API key is never included:
   * this file exists to be handed to someone who can help.
   */
  handleExport = async () => {
    this.setState({ exportState: 'busy' });

    let text = null;
    try {
      const { state, recovered } = await loadState();
      if (!recovered) text = JSON.stringify(buildBackup(state, ''), null, 2);
    } catch {
      // Fall through to the raw read below.
    }
    if (text === null) {
      try { text = rawFallbackExport(); } catch { text = null; }
    }
    if (!text) { this.setState({ exportState: 'empty' }); return; }

    try {
      // On Android the file leaves through the share sheet, and dismissing that
      // sheet is not a failure - but it is not a saved backup either, and the
      // whole point of this screen is that the user is about to lose data.
      const result = await saveTextFile('veggie_tracker_rescue_backup.json', text);
      this.setState({ exportState: result.ok ? 'done' : 'unsent' });
    } catch {
      this.setState({ exportState: 'failed' });
    }
  };

  exportMessage() {
    switch (this.state.exportState) {
      case 'done': return 'Backup exported. Your API key was not included.';
      case 'unsent': return 'Nothing was sent. Tap again and choose where to save the file.';
      case 'empty': return 'No saved data was found on this device.';
      case 'failed': return 'The backup could not be written to this device.';
      default: return null;
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-lg p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-rose-500" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 mb-2">Something went wrong</h1>
          <p className="text-sm text-slate-500 mb-6">
            The app hit an unexpected error. Your saved data is still on this device — you can
            download a copy before reloading.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={this.handleExport}
              disabled={this.state.exportState === 'busy'}
              className="px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              {this.state.exportState === 'busy' ? 'Saving…' : 'Download my data'}
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900"
            >
              Reload the app
            </button>
          </div>
          {this.exportMessage() && (
            <p role="status" className="mt-3 text-xs text-slate-500">{this.exportMessage()}</p>
          )}
          {import.meta.env?.DEV && (
            <pre className="mt-4 text-left text-[10px] text-rose-600 bg-rose-50 p-2 rounded overflow-auto max-h-40">
              {String(this.state.error?.stack ?? this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
