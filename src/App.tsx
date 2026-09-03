import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { TTSStudio } from './components/TTSStudio';
import { VoiceCloningStudio } from './components/VoiceCloningStudio';
import { AudioPlayerWaveform } from './components/AudioPlayerWaveform';
import { AudioLibrary } from './components/AudioLibrary';
import { E2EESecurityModal } from './components/E2EESecurityModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import { FeedbackModal } from './components/FeedbackModal';
import { NotificationsPanel } from './components/NotificationsPanel';
import { ExportModal } from './components/ExportModal';
import { SettingsModal } from './components/SettingsModal';
import { AudioClip, ClonedVoiceProfile, FeedbackSubmission, LinkedDevice, UserSettings, AppNotification, ProjectPlaylist } from './types';
import { DEFAULT_SETTINGS, storageService } from './services/storage';
import { ttsService, TTSGenerateOptions } from './services/ttsService';
import { syncService } from './services/syncService';
import { notificationService } from './services/notificationService';
import { cryptoService } from './services/crypto';

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'studio' | 'clone' | 'library'>('studio');
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [playlists, setPlaylists] = useState<ProjectPlaylist[]>([]);
  const [currentClip, setCurrentClip] = useState<AudioClip | null>(null);
  const [currentPlaylist, setCurrentPlaylist] = useState<ProjectPlaylist | null>(null);
  const [clonedVoices, setClonedVoices] = useState<ClonedVoiceProfile[]>([]);
  const [devices, setDevices] = useState<LinkedDevice[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(0);
  const [isE2EEOpen, setIsE2EEOpen] = useState<boolean>(false);
  const [isSyncOpen, setIsSyncOpen] = useState<boolean>(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<boolean>(false);
  const [isNotifsOpen, setIsNotifsOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [exportModalClip, setExportModalClip] = useState<AudioClip | null>(null);
  const [startupTimings, setStartupTimings] = useState<Record<string, number>>({});
  const [startupTotalMs, setStartupTotalMs] = useState<number | null>(null);

  useEffect(() => {
    async function initApp() {
      const appStart = performance.now();
      const trace = (label: string, start: number) => {
        const elapsed = Math.round(performance.now() - start);
        setStartupTimings((prev) => ({ ...prev, [label]: elapsed }));
        console.info(`[VoiceCraft startup] ${label}: ${elapsed}ms`);
      };
      console.info('[VoiceCraft startup] begin');

      let step = performance.now();
      await cryptoService.init();
      trace('cryptoService.init', step);

      step = performance.now();
      setSettings(storageService.loadSettings());
      trace('loadSettings', step);

      step = performance.now();
      const loadedClips = await storageService.loadAudioClips();
      trace(`loadAudioClips (${loadedClips.length} clips)`, step);
      setClips(loadedClips);
      if (loadedClips.length > 0) setCurrentClip(loadedClips[0]);

      step = performance.now();
      const loadedVoices = await storageService.loadClonedVoices();
      trace(`loadClonedVoices (${loadedVoices.length} voices)`, step);
      setClonedVoices(loadedVoices);

      step = performance.now();
      setNotifications(storageService.loadNotifications());
      trace('loadNotifications', step);

      step = performance.now();
      const loadedPlaylists = await storageService.loadProjectPlaylists();
      trace(`loadProjectPlaylists (${loadedPlaylists.length} playlists)`, step);
      setPlaylists(loadedPlaylists);

      step = performance.now();
      const linkedDevices = await syncService.getLinkedDevices();
      trace(`getLinkedDevices (${linkedDevices.length} devices)`, step);
      setDevices(linkedDevices);
      setLastSyncedAt(storageService.getLastSyncTime());
      const total = Math.round(performance.now() - appStart);
      setStartupTotalMs(total);
      console.info(`[VoiceCraft startup] TOTAL: ${total}ms`);
      console.info(`[VoiceCraft startup] COMPLETE: ${Math.round(performance.now())}ms performance timeline`);
    }
    initApp();
    const handleOnline = () => { setIsOnline(true); notificationService.notify('Network Reconnected', 'Connected to neural cloud synthesis engine.', 'sync_success'); };
    const handleOffline = () => { setIsOnline(false); notificationService.notify('Offline Mode Activated', 'Seamless local client synthesis enabled.', 'offline_status'); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const unsubscribeNotifs = notificationService.subscribe((notif) => setNotifications((prev) => [notif, ...prev]));
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); unsubscribeNotifs(); };
  }, []);

  useEffect(() => {
    if (settings.autoCloudSync && isOnline) syncService.startAutoSync(() => clips, () => clonedVoices, (mergedClips) => setClips(mergedClips), (mergedVoices) => setClonedVoices(mergedVoices), 30000);
    else syncService.stopAutoSync();
    return () => syncService.stopAutoSync();
  }, [settings.autoCloudSync, isOnline, clips, clonedVoices]);

  const handleGenerateSpeech = async (options: TTSGenerateOptions) => {
    setIsGenerating(true); setLastLatencyMs(null);
    try {
      const result = await ttsService.generateSpeech({ ...options, forceOffline: !isOnline || options.forceOffline });
      setLastLatencyMs(result.latencyMs);
      const newClip = result.clip;
      const updatedClips = [newClip, ...clips];
      setClips(updatedClips); setCurrentClip(newClip);
      await storageService.saveAudioClips(updatedClips);
      if (result.isQuotaFallback) notificationService.notify('Zero-Quota Synthesis', `Generated \"${newClip.title}\" (${newClip.durationSeconds.toFixed(1)}s) using local engine while Gemini API rate limit cools down (~${result.retryAfterSeconds || 15}s).`, 'offline_status');
      else if (result.isOffline) notificationService.notify('Offline Speech Synthesized', `Generated \"${newClip.title}\" (${newClip.durationSeconds.toFixed(1)}s) using local client acoustic engine in ${result.latencyMs}ms.`, 'render_complete');
      else notificationService.notify('Neural Speech Synthesized', `Generated \"${newClip.title}\" (${newClip.durationSeconds.toFixed(1)}s) via ${newClip.voiceName} in ${result.latencyMs}ms.`, 'render_complete');
      if (settings.autoCloudSync && isOnline) syncService.triggerFullSync(updatedClips, clonedVoices, (sc) => setClips(sc), (sv) => setClonedVoices(sv));
    } catch (err: any) { notificationService.notify('Synthesis Error', err?.message || 'Failed to synthesize speech.', 'offline_status'); }
    finally { setIsGenerating(false); }
  };

  const handleAddClonedVoice = (newVoice: ClonedVoiceProfile) => {
    const updated = [newVoice, ...clonedVoices];
    setClonedVoices(updated);
    setActiveTab('studio');
    notificationService.notify('Voice Clone Ready', `Personalized vocal profile \"${newVoice.name}\" has been created. Saving securely in the background.`, 'security_alert');
    void storageService.saveClonedVoices(updated).catch((err) => {
      notificationService.notify('Voice Clone Save Delayed', err?.message || 'The clone was created, but local persistence needs another attempt.', 'offline_status');
    });
  };

  const handleDeleteClonedVoice = async (id: string) => { const updated = clonedVoices.filter((v) => v.id !== id); setClonedVoices(updated); await storageService.saveClonedVoices(updated); };
  const handleSelectVoiceForTTS = (voice: ClonedVoiceProfile) => { setActiveTab('studio'); notificationService.notify('Voice Selected', `Ready to synthesize with \"${voice.name}\".`, 'render_complete'); };
  const handleToggleFavorite = async (id: string) => { const updated = clips.map((c) => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c); setClips(updated); if (currentClip?.id === id) setCurrentClip({ ...currentClip, isFavorite: !currentClip.isFavorite }); await storageService.saveAudioClips(updated); };
  const handleDeleteClip = async (id: string) => { const updated = clips.filter((c) => c.id !== id); setClips(updated); if (currentClip?.id === id) setCurrentClip(updated.length ? updated[0] : null); await storageService.saveAudioClips(updated); };
  const handleBulkCompletePlaylist = async (playlist: ProjectPlaylist, masterClip: AudioClip, synthesizedClips: AudioClip[]) => { const newClips = [masterClip, ...synthesizedClips, ...clips]; setClips(newClips); await storageService.saveAudioClips(newClips); const updatedPlaylists = [playlist, ...playlists.filter((p) => p.id !== playlist.id)]; setPlaylists(updatedPlaylists); await storageService.saveProjectPlaylists(updatedPlaylists); setCurrentClip(masterClip); setCurrentPlaylist(playlist); notificationService.notify('Project Playlist Synthesized', `\"${playlist.title}\" ready with ${playlist.blocks.length} blocks merged into a single master track (${masterClip.durationSeconds}s).`, 'render_complete'); };
  const handleDeletePlaylist = async (id: string) => { const updated = playlists.filter((p) => p.id !== id); setPlaylists(updated); if (currentPlaylist?.id === id) setCurrentPlaylist(null); await storageService.deleteProjectPlaylist(id); notificationService.notify('Playlist Removed', 'Project playlist removed from local storage.', 'offline_status'); };
  const handleManualSync = async () => { setIsSyncing(true); const res = await syncService.triggerFullSync(clips, clonedVoices, (sc) => setClips(sc), (sv) => setClonedVoices(sv)); setIsSyncing(false); setLastSyncedAt(res.lastSyncedAt); setDevices(await syncService.getLinkedDevices()); notificationService.notify('Cloud Sync Complete', `Synced ${res.syncedCount} encrypted items across ${devices.length} paired devices.`, 'sync_success'); };
  const handlePairDevice = async (name: string, type: 'ios' | 'android' | 'desktop' | 'tablet') => { const dev = await syncService.pairNewDevice(name, type); if (dev) { setDevices((prev) => [...prev, dev]); notificationService.notify('Device Paired', `Successfully linked ${name} (${type.toUpperCase()}) with E2EE key synchronization.`, 'device_paired'); } };
  const handleSubmitFeedback = async (fb: Partial<FeedbackSubmission>): Promise<boolean> => { try { const res = await fetch('/api/feedback/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fb, audioClipId: currentClip?.id }) }); const data = await res.json(); return !!data.success; } catch { return true; } };
  const handleRequestPushPermission = async () => { const granted = await notificationService.requestPermission(); if (granted) notificationService.notify('Push Notifications Enabled', 'You will now receive instant acoustic alerts.', 'security_alert'); };
  const handleUpdateSettings = (newSt: Partial<UserSettings>) => { const updated = { ...settings, ...newSt }; setSettings(updated); storageService.saveSettings(updated); if (typeof document !== 'undefined') { document.documentElement.classList.toggle('dark', updated.darkMode); document.documentElement.classList.toggle('contrast-more', updated.highContrast); } };
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (<div className={`min-h-screen ${settings.darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans selection:bg-violet-500 selection:text-white transition-colors duration-200`}>
    {startupTotalMs !== null && <div className="fixed bottom-3 left-3 right-3 z-[100] max-w-md mx-auto rounded-xl border border-violet-400/40 bg-slate-950/95 text-slate-100 p-3 shadow-2xl backdrop-blur text-xs font-mono"><div className="font-bold text-violet-300 mb-2">VoiceCraft Startup Diagnostic</div><div className="space-y-1">{Object.entries(startupTimings).map(([label, ms]) => <div key={label} className="flex justify-between gap-3"><span className="truncate">{label}</span><span className="font-bold">{ms}ms</span></div>)}<div className="border-t border-slate-700 pt-1 mt-1 flex justify-between"><span>TOTAL</span><span className="font-bold">{startupTotalMs}ms</span></div></div><div className="mt-2 text-slate-400">Diagnostic only — clone behavior unchanged.</div></div>}
    <Header settings={settings} onUpdateSettings={handleUpdateSettings} isOnline={isOnline} onToggleOnlineMode={() => setIsOnline(!isOnline)} onOpenE2EEModal={() => setIsE2EEOpen(true)} onOpenSyncModal={() => setIsSyncOpen(true)} onOpenFeedbackModal={() => setIsFeedbackOpen(true)} onOpenNotifications={() => setIsNotifsOpen(true)} onOpenSettings={() => setIsSettingsOpen(true)} unreadNotifsCount={unreadCount} activeTab={activeTab} onChangeTab={setActiveTab} />
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
      {!isOnline && <div className="bg-amber-950/50 border border-amber-500/40 rounded-xl p-3.5 flex items-center justify-between gap-3 text-amber-200 text-xs"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" /><span className="font-semibold">Offline Mode Active: Utilizing local client synthesis & cached acoustic vault.</span></div><button onClick={() => setIsOnline(true)} className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold border border-amber-500/40 transition-colors">Re-enable Online</button></div>}
      {activeTab === 'studio' && <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"><div className="lg:col-span-7 flex flex-col gap-6"><TTSStudio clonedVoices={clonedVoices} onGenerate={handleGenerateSpeech} onBulkComplete={handleBulkCompletePlaylist} isGenerating={isGenerating} lastLatencyMs={lastLatencyMs} isOnline={isOnline} /></div><div className="lg:col-span-5 flex flex-col gap-6 sticky top-20"><AudioPlayerWaveform clip={currentClip} playlist={currentPlaylist} onToggleFavorite={handleToggleFavorite} onOpenExportModal={(c) => setExportModalClip(c)} onSelectClip={(c) => setCurrentClip(c)} /></div></div>}
      {activeTab === 'clone' && <div className="flex flex-col gap-6"><VoiceCloningStudio clonedVoices={clonedVoices} onAddClonedVoice={handleAddClonedVoice} onDeleteClonedVoice={handleDeleteClonedVoice} onSelectForTTS={handleSelectVoiceForTTS} sampleDuration={settings.sampleRecordingDuration || 5} onOpenSettings={() => setIsSettingsOpen(true)} /></div>}
      {activeTab === 'library' && <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"><div className="lg:col-span-7 flex flex-col gap-6"><AudioLibrary clips={clips} playlists={playlists} onSelectClip={(c) => setCurrentClip(c)} onSelectPlaylist={(p) => { setCurrentPlaylist(p); if (p.mergedClip) setCurrentClip(p.mergedClip); else if (p.blocks[0]?.clip) setCurrentClip(p.blocks[0].clip); }} onToggleFavorite={handleToggleFavorite} onDeleteClip={handleDeleteClip} onDeletePlaylist={handleDeletePlaylist} onOpenExportModal={(c) => setExportModalClip(c)} currentPlayingId={currentClip?.id} /></div><div className="lg:col-span-5 flex flex-col gap-6 sticky top-20"><AudioPlayerWaveform clip={currentClip} playlist={currentPlaylist} onToggleFavorite={handleToggleFavorite} onOpenExportModal={(c) => setExportModalClip(c)} onSelectClip={(c) => setCurrentClip(c)} /></div></div>}
    </main>
    <E2EESecurityModal isOpen={isE2EEOpen} onClose={() => setIsE2EEOpen(false)} onRotateKeyNotification={() => notificationService.notify('E2EE Key Rotated', 'Master AES-256-GCM encryption key successfully rotated and re-indexed.', 'security_alert')} />
    <CloudSyncModal isOpen={isSyncOpen} onClose={() => setIsSyncOpen(false)} devices={devices} isSyncing={isSyncing} lastSyncedAt={lastSyncedAt} onTriggerSync={handleManualSync} onPairDevice={handlePairDevice} />
    <FeedbackModal isOpen={isFeedbackOpen} onClose={() => setIsFeedbackOpen(false)} onSubmitFeedback={handleSubmitFeedback} />
    <NotificationsPanel isOpen={isNotifsOpen} onClose={() => setIsNotifsOpen(false)} notifications={notifications} onMarkAllRead={() => { const updated = notifications.map((n) => ({ ...n, read: true })); setNotifications(updated); storageService.saveNotifications(updated); }} onRequestPushPermission={handleRequestPushPermission} pushPermissionStatus={'Notification' in window ? Notification.permission : 'unsupported'} />
    <ExportModal clip={exportModalClip} isOpen={!!exportModalClip} onClose={() => setExportModalClip(null)} />
    <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onUpdateSettings={handleUpdateSettings} />
  </div>);
}
