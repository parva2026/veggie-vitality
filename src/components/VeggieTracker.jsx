import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Leaf, LayoutDashboard, MessageSquare, Stethoscope, Settings, TrendingUp,
  ChevronLeft, ChevronRight, KeyRound, Loader2, Pill,
} from 'lucide-react';

import { useAppState } from '../hooks/useAppState.js';
import { useCurrentDate } from '../hooks/useCurrentDate.js';
import { useToasts } from '../hooks/useToasts.js';
import { useReminders } from '../hooks/useReminders.js';

import { calculateNeeds, computeTotals } from '../lib/nutrition.js';
import { formatDateLabel, isToday, todayKey } from '../lib/dates.js';
import { registerBackButton, hideSplash } from '../lib/platform.js';
import { storageBackendName } from '../lib/storage.js';
import { apiConfigLabel } from '../lib/apiConfig.js';

import { ToastStack, ConfirmDialog } from './ui.jsx';
import { ProfileSetupScreen } from './ProfileSetup.jsx';
import { Dashboard } from './Dashboard.jsx';
import { FoodLogger } from './FoodLogger.jsx';
import { DoctorChat } from './DoctorChat.jsx';
import { Medicines } from './Medicines.jsx';
import { SettingsModal } from './SettingsModal.jsx';
import { HistoryModal } from './HistoryModal.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'log', label: 'Log food', icon: MessageSquare },
  { id: 'meds', label: 'Medicines', icon: Pill },
  { id: 'doctor', label: 'Dr. Veggie', icon: Stethoscope },
];

export function VeggieTracker() {
  const { toasts, notify, dismiss } = useToasts();
  const { state, apiKey, apiConfig, status, actions } = useAppState({ onNotice: notify });
  const { currentDate, shiftDate, goToDate, goToToday } = useCurrentDate();

  const [tab, setTab] = useState('dashboard');
  const [modal, setModal] = useState(null); // 'settings' | 'history' | null
  const [confirmState, setConfirmState] = useState(null);
  const [storageName, setStorageName] = useState('this device');

  useEffect(() => { storageBackendName().then(setStorageName).catch(() => {}); }, []);
  useEffect(() => { if (!status.loading) hideSplash(); }, [status.loading]);

  // Android hardware back: close whatever is on top rather than killing the app.
  // Returns true when the press was consumed; otherwise the app exits.
  useEffect(() => registerBackButton(() => {
    if (confirmState) { setConfirmState(null); return true; }
    if (modal) { setModal(null); return true; }
    if (tab !== 'dashboard') { setTab('dashboard'); return true; }
    if (!isToday(currentDate)) { goToToday(); return true; }
    return false;
  }), [confirmState, modal, tab, currentDate, goToToday]);

  const profile = state.userProfile;
  const goals = useMemo(() => calculateNeeds(profile), [profile]);
  const entries = useMemo(() => state.logs[currentDate] ?? [], [state.logs, currentDate]);
  const totals = useMemo(() => computeTotals(entries), [entries]);
  const water = state.waterLogs[currentDate] ?? 0;

  // A tapped reminder should land where the user can act on it. Only the kind
  // is trusted here — `extra` comes back from the OS alarm store, so it is
  // treated as untrusted input and never used to look anything up.
  const handleReminderTapped = useCallback((extra) => {
    if (extra?.kind === 'medicine') { setModal(null); setTab('meds'); goToToday(); }
  }, [goToToday]);

  const reminders = useReminders({
    medicines: state.medicines,
    waterReminder: state.waterReminder,
    onNotify: notify,
    onTapped: handleReminderTapped,
  });

  const handleRemoveMedicine = useCallback((medicine) => {
    setConfirmState({
      title: `Remove ${medicine.name}?`,
      message: 'Its reminders stop immediately. The doses you already marked as taken stay in your history.',
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () => {
        actions.removeMedicine(medicine.id);
        setConfirmState(null);
        notify({ type: 'info', message: `${medicine.name} removed.` });
      },
    });
  }, [actions, notify]);

  const handleImport = useCallback((importedState, importedKey, importedConfig) => {
    const finish = () => {
      setConfirmState(null);
      setModal(null);
      goToToday();
    };

    // A backup file can carry an API key, and now the address that key is sent
    // to. Adopting either silently would let a backup someone sent you swap in
    // *their* key, or point the app at *their* server, quietly routing every
    // food description and health question through it. So both stay a separate,
    // explicit decision — and the destination is named in the question.
    const endpoint = importedConfig ? apiConfigLabel(importedConfig) : 'Google';
    const offerKey = () => setConfirmState({
      title: 'Use the API key in this backup?',
      message: `This backup also contains an API key${importedConfig ? ` and a custom server address (${endpoint})` : ''}.\n\nOnly accept it if this is your own backup. Everything you type — your food descriptions and your health questions — would then be sent to ${endpoint} using that key, where whoever owns it can read them.`,
      confirmLabel: 'Use that key',
      danger: true,
      onConfirm: async () => {
        if (importedConfig) await actions.setApiConfig(importedConfig);
        await actions.setApiKey(importedKey);
        finish();
        notify({ type: 'success', message: 'Backup and API settings imported.' });
      },
      onCancel: () => {
        finish();
        notify({ type: 'success', message: 'Backup imported. The key in the file was ignored.' });
      },
    });

    setConfirmState({
      title: 'Replace your data?',
      message: 'Importing this backup will replace everything currently stored on this device. This cannot be undone.',
      confirmLabel: 'Import and replace',
      danger: true,
      onConfirm: async () => {
        actions.replaceState(importedState);
        if (importedKey) { offerKey(); return; }
        finish();
        notify({ type: 'success', message: 'Backup imported.' });
      },
    });
  }, [actions, goToToday, notify]);

  const handleReset = useCallback(() => {
    setConfirmState({
      title: 'Delete everything?',
      message: 'This permanently deletes your profile, food logs, weight history and API key from this device. Export a backup first if you want to keep it.',
      confirmLabel: 'Delete everything',
      danger: true,
      onConfirm: async () => {
        await actions.resetEverything();
        setConfirmState(null);
        setModal(null);
        setTab('dashboard');
        goToToday();
        notify({ type: 'info', message: 'All data deleted.' });
      },
    });
  }, [actions, goToToday, notify]);

  if (status.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-50 dark:bg-slate-950">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" aria-hidden="true" />
        <span className="sr-only">Loading your data</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <>
        <ProfileSetupScreen onSave={actions.setProfile} />
        <ToastStack toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* ----------------------------------------------------------- header */}
      <header className="bg-emerald-700 dark:bg-emerald-900 text-white pt-[env(safe-area-inset-top)] sticky top-0 z-30 shadow-md">
        <div className="max-w-2xl mx-auto w-full px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Leaf className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h1 className="font-bold truncate">Hi, {profile.name}</h1>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button" onClick={() => setModal('history')}
                aria-label="History" title="History"
                className="p-2 rounded-lg hover:bg-white/10"
              >
                <TrendingUp className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                type="button" onClick={() => setModal('settings')}
                aria-label="Settings" title="Settings"
                className="p-2 rounded-lg hover:bg-white/10"
              >
                <Settings className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-2 bg-white/10 rounded-lg">
            <button
              type="button" onClick={() => shiftDate(-1)}
              aria-label="Previous day"
              className="p-2 rounded-lg hover:bg-white/10"
            >
              <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goToToday}
              disabled={isToday(currentDate)}
              className="text-sm font-medium px-3 py-1 disabled:cursor-default"
            >
              {formatDateLabel(currentDate)}
            </button>
            <button
              type="button" onClick={() => shiftDate(1)}
              disabled={currentDate >= todayKey()}
              aria-label="Next day"
              className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {!apiKey && (
        <button
          type="button"
          onClick={() => setModal('settings')}
          className="w-full bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 text-xs px-4 py-2 flex items-center justify-center gap-2 hover:bg-amber-200"
        >
          <KeyRound className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Add an API key ({apiConfigLabel(apiConfig)}) to log any food and ask questions.
        </button>
      )}

      {/* -------------------------------------------------------------- body */}
      <main className="flex-1 relative max-w-2xl mx-auto w-full overflow-hidden">
        {tab === 'dashboard' && (
          <div className="absolute inset-0 overflow-y-auto">
            <Dashboard
              profile={profile}
              goals={goals}
              totals={totals}
              entries={entries}
              water={water}
              onRemoveEntry={(id) => actions.removeEntry(currentDate, id)}
              onAdjustWater={(delta) => actions.adjustWater(currentDate, delta)}
              onRecordWeight={actions.recordWeight}
              onNotify={notify}
            />
          </div>
        )}

        {tab === 'log' && (
          <FoodLogger
            apiKey={apiKey}
            apiConfig={apiConfig}
            currentDate={currentDate}
            onAddEntries={actions.addEntries}
            onNotify={notify}
          />
        )}

        {tab === 'meds' && (
          <div className="absolute inset-0 overflow-y-auto">
            <Medicines
              medicines={state.medicines}
              medLogs={state.medLogs}
              waterReminder={state.waterReminder}
              currentDate={currentDate}
              reminders={reminders}
              onAdd={actions.addMedicine}
              onUpdate={actions.updateMedicine}
              onRequestRemove={handleRemoveMedicine}
              onToggleDose={actions.setDoseTaken}
              onWaterReminderChange={actions.setWaterReminder}
              onNotify={notify}
            />
          </div>
        )}

        {tab === 'doctor' && (
          <DoctorChat
            apiKey={apiKey}
            apiConfig={apiConfig}
            history={state.docHistory}
            onAppend={actions.appendDocMessages}
            onClear={actions.clearDocHistory}
            profile={profile}
            goals={goals}
            logs={state.logs}
            waterLogs={state.waterLogs}
            weightHistory={state.weightHistory}
            currentDate={currentDate}
            onNotify={notify}
            onOpenSettings={() => setModal('settings')}
          />
        )}
      </main>

      {/* --------------------------------------------------------------- nav */}
      <nav
        className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)] sticky bottom-0 z-30"
        aria-label="Sections"
      >
        <div className="max-w-2xl mx-auto w-full flex">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-medium ${
                tab === id
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* ------------------------------------------------------------ modals */}
      {modal === 'settings' && (
        <SettingsModal
          onClose={() => setModal(null)}
          apiKey={apiKey}
          onSetApiKey={actions.setApiKey}
          apiConfig={apiConfig}
          onSetApiConfig={actions.setApiConfig}
          profile={profile}
          onSaveProfile={actions.setProfile}
          state={state}
          onImport={handleImport}
          onRequestReset={handleReset}
          onNotify={notify}
          storageName={storageName}
        />
      )}

      {modal === 'history' && (
        <HistoryModal
          onClose={() => setModal(null)}
          logs={state.logs}
          waterLogs={state.waterLogs}
          weightHistory={state.weightHistory}
          goals={goals}
          onSelectDate={goToDate}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          onCancel={() => setConfirmState(null)}
          {...confirmState}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

export default VeggieTracker;
