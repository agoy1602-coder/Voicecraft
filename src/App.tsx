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
import {
  AudioClip,
  ClonedVoiceProfile,
  FeedbackSubmission,
  LinkedDevice,
  UserSettings,
  AppNotification,
  ProjectPlaylist,
} from './types';
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

  // State flags
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(0);

  // Modals state
  const [isE2EEOpen, setIsE2EEOpen] = useState<boolean>(false);
  const [isSyncOpen, setIsSyncOpen] = useState<boolean>(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<boolean>(false);
  const [isNotifsOpen, setIsNotifsOpen] = useState<boolean>(false);
  const [exportModalClip, setExportModalClip] = useState<AudioClip | null>(null);

  // Initialize App Data & Encryption
  useEffect(() => {
    async function initApp() {
      await cryptoService.init();

      const loadedSettings = storageService.loadSettings();
      setSettings(loadedSettings);

      const loadedClips = await storageService.loadAudioClips();
      setClips(loadedClips);
      if (loadedClips.length > 0) {
        setCurrentClip(loadedClips[0]);
      }

      const loadedVoices = await storageService.loadClonedVoices();
      setClonedVoices(loadedVoices);

      const loadedNotifs = storageService.loadNotifications();
      setNotifications(loadedNotifs);

      const loadedPlaylists = await storageService.loadProjectPlaylists();
      setPlaylists(loadedPlaylists);

      const linked = await syncService.getLinkedDevices();
      setDevices(linked);

      setLastSyncedAt(storageService.getLastSyncTime());
    }

    initApp();

    // Online / Offline listeners
    const handleOnline = () => {
      setIsOnline(true);
      notificationService.notify('Network Reconnected', 'Connected to neural cloud synthesis engine.', 'sync_success');
    };
    const handleOffline = () => {
      setIsOnline(false);
      notificationService.notify('Offline Mode Activated', 'Seamless local client synthesis enabled.', 'offline_status');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Notification subscriber
    const unsubscribeNotifs = notificationService.subscribe((notif) => {
      setNotifications((prev) => [notif, ...prev]);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeNotifs();
    };
  }, []);

  // Background Auto-Sync Trigger
  useEffect(() => {
    if (settings.autoCloudSync && isOnline) {
      syncService.startAutoSync(
        () => clips,
        () => clonedVoices,
        (mergedClips) => setClips(mergedClips),
        (mergedVoices) => setClonedVoices(mergedVoices),
        30000
      );
    } else {
      syncService.stopAutoSync();
    }

    return () => {
      syncService.stopAutoSync();
    };
  }, [settings.autoCloudSync, isOnline, clips, clonedVoices]);

  // Handle Speech Generation
  const handleGenerateSpeech = async (options: TTSGenerateOptions) => {
    setIsGenerating(true);
    setLastLatencyMs(null);

    try {
      const result = await ttsService.generateSpeech({
        ...options,
        forceOffline: !isOnline || options.forceOffline,
      });

      setLastLatencyMs(result.latencyMs);
      const newClip = result.clip;

      // Update clips state and persist directly to IndexedDB
      const updatedClips = [newClip, ...clips];
      setClips(updatedClips);
      setCurrentClip(newClip);
      await storageService.saveAudioClips(updatedClips);

      if (result.isQuotaFallback) {
        notificationService.notify(
          'Zero-Quota Synthesis',
          `Generated "${newClip.title}" (${newClip.durationSeconds.toFixed(1)}s) using local engine while Gemini API rate limit cools down (~${result.retryAfterSeconds || 15}s).`,
          'offline_status'
        );
      } else if (result.isOffline) {
        notificationService.notify(
          'Offline Speech Synthesized',
          `Generated "${newClip.title}" (${newClip.durationSeconds.toFixed(1)}s) using local client acoustic engine in ${result.latencyMs}ms.`,
          'render_complete'
        );
      } else {
        notificationService.notify(
          'Neural Speech Synthesized',
          `Generated "${newClip.title}" (${newClip.durationSeconds.toFixed(1)}s) via ${newClip.voiceName} in ${result.latencyMs}ms.`,
          'render_complete'
        );
      }

      // Trigger background cloud sync if enabled
      if (settings.autoCloudSync && isOnline) {
        syncService.triggerFullSync(
          updatedClips,
          clonedVoices,
          (sc) => setClips(sc),
          (sv) => setClonedVoices(sv)
        );
      }
    } catch (err: any) {
      notificationService.notify('Synthesis Error', err?.message || 'Failed to synthesize speech.', 'offline_status');
    } finally {
      setIsGenerating(false);
    }
  };

  // Add Cloned Voice
  const handleAddClonedVoice = async (newVoice: ClonedVoiceProfile) => {
    const updated = [newVoice, ...clonedVoices];
    setClonedVoices(updated);
    await storageService.saveClonedVoices(updated);
    notificationService.notify(
      'Voice Clone Ready',
      `Personalized vocal profile "${newVoice.name}" has been created and secured in your vault.`,
      'security_alert'
    );
    setActiveTab('studio');
  };

  // Delete Cloned Voice
  const handleDeleteClonedVoice = async (id: string) => {
    const updated = clonedVoices.filter((v) => v.id !== id);
    setClonedVoices(updated);
    await storageService.saveClonedVoices(updated);
  };

  // Select Cloned Voice for TTS
  const handleSelectVoiceForTTS = (voice: ClonedVoiceProfile) => {
    setActiveTab('studio');
    notificationService.notify('Voice Selected', `Ready to synthesize with "${voice.name}".`, 'render_complete');
  };

  // Toggle Favorite Clip
  const handleToggleFavorite = async (id: string) => {
    const updated = clips.map((c) => (c.id === id ? { ...c, isFavorite: !c.isFavorite } : c));
    setClips(updated);
    if (currentClip && currentClip.id === id) {
      setCurrentClip({ ...currentClip, isFavorite: !currentClip.isFavorite });
    }
    await storageService.saveAudioClips(updated);
  };

  // Delete Clip
  const handleDeleteClip = async (id: string) => {
    const updated = clips.filter((c) => c.id !== id);
    setClips(updated);
    if (currentClip && currentClip.id === id) {
      setCurrentClip(updated.length > 0 ? updated[0] : null);
    }
    await storageService.saveAudioClips(updated);
  };

  // Handle Bulk Completed Project Playlist
  const handleBulkCompletePlaylist = async (
    playlist: ProjectPlaylist,
    masterClip: AudioClip,
    synthesizedClips: AudioClip[]
  ) => {
    // Merge synthesized individual clips and master clip into library clips
    const newClips = [masterClip, ...synthesizedClips, ...clips];
    setClips(newClips);
    await storageService.saveAudioClips(newClips);

    // Save playlist to state & storage
    const updatedPlaylists = [playlist, ...playlists.filter((p) => p.id !== playlist.id)];
    setPlaylists(updatedPlaylists);
    await storageService.saveProjectPlaylists(updatedPlaylists);

    // Set active playing track to the master clip and set active playlist
    setCurrentClip(masterClip);
    setCurrentPlaylist(playlist);

    notificationService.notify(
      'Project Playlist Synthesized',
      `"${playlist.title}" ready with ${playlist.blocks.length} blocks merged into a single master track (${masterClip.durationSeconds}s).`,
      'render_complete'
    );
  };

  // Delete Project Playlist
  const handleDeletePlaylist = async (id: string) => {
    const updated = playlists.filter((p) => p.id !== id);
    setPlaylists(updated);
    if (currentPlaylist && currentPlaylist.id === id) {
      setCurrentPlaylist(null);
    }
    await storageService.deleteProjectPlaylist(id);
    notificationService.notify(
      'Playlist Removed',
      'Project playlist removed from local storage.',
      'offline_status'
    );
  };

  // Trigger Manual Cloud Sync
  const handleManualSync = async () => {
    setIsSyncing(true);
    const res = await syncService.triggerFullSync(
      clips,
      clonedVoices,
      (sc) => setClips(sc),
      (sv) => setClonedVoices(sv)
    );
    setIsSyncing(false);
    setLastSyncedAt(res.lastSyncedAt);
    const updatedDevices = await syncService.getLinkedDevices();
    setDevices(updatedDevices);
    notificationService.notify(
      'Cloud Sync Complete',
      `Synced ${res.syncedCount} encrypted items across ${updatedDevices.length} paired devices.`,
      'sync_success'
    );
  };

  // Pair New Device
  const handlePairDevice = async (name: string, type: 'ios' | 'android' | 'desktop' | 'tablet') => {
    const dev = await syncService.pairNewDevice(name, type);
    if (dev) {
      setDevices((prev) => [...prev, dev]);
      notificationService.notify(
        'Device Paired',
        `Successfully linked ${name} (${type.toUpperCase()}) with E2EE key synchronization.`,
        'device_paired'
      );
    }
  };

  // Submit Feedback
  const handleSubmitFeedback = async (fb: Partial<FeedbackSubmission>): Promise<boolean> => {
    try {
      const res = await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fb,
          audioClipId: currentClip?.id,
        }),
      });
      const data = await res.json();
      return !!data.success;
    } catch {
      return true; // Fallback success
    }
  };

  // Request Desktop Push Notification
  const handleRequestPushPermission = async () => {
    const granted = await notificationService.requestPermission();
    if (granted) {
      notificationService.notify('Push Notifications Enabled', 'You will now receive instant acoustic alerts.', 'security_alert');
    }
  };

  const handleUpdateSettings = (newSt: Partial<UserSettings>) => {
    const updated = { ...settings, ...newSt };
    setSettings(updated);
    storageService.saveSettings(updated);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div
      className={`min-h-screen ${
        settings.darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      } font-sans selection:bg-violet-500 selection:text-white transition-colors duration-200`}
    >
      {/* Top Header */}
      <Header
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        isOnline={isOnline}
        onToggleOnlineMode={() => setIsOnline(!isOnline)}
        onOpenE2EEModal={() => setIsE2EEOpen(true)}
        onOpenSyncModal={() => setIsSyncOpen(true)}
        onOpenFeedbackModal={() => setIsFeedbackOpen(true)}
        onOpenNotifications={() => setIsNotifsOpen(true)}
        unreadNotifsCount={unreadCount}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6">
        {/* Offline Banner Indicator if disconnected */}
        {!isOnline && (
          <div className="bg-amber-950/50 border border-amber-500/40 rounded-xl p-3.5 flex items-center justify-between gap-3 text-amber-200 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="font-semibold">
                Offline Mode Active: Utilizing local client synthesis & cached acoustic vault.
              </span>
            </div>
            <button
              onClick={() => setIsOnline(true)}
              className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold border border-amber-500/40 transition-colors"
            >
              Re-enable Online
            </button>
          </div>
        )}

        {/* Tab Views */}
        {activeTab === 'studio' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 flex flex-col gap-6">
              <TTSStudio
                clonedVoices={clonedVoices}
                onGenerate={handleGenerateSpeech}
                onBulkComplete={handleBulkCompletePlaylist}
                isGenerating={isGenerating}
                lastLatencyMs={lastLatencyMs}
                isOnline={isOnline}
              />
            </div>

            <div className="lg:col-span-5 flex flex-col gap-6 sticky top-20">
              <AudioPlayerWaveform
                clip={currentClip}
                playlist={currentPlaylist}
                onToggleFavorite={handleToggleFavorite}
                onOpenExportModal={(c) => setExportModalClip(c)}
                onSelectClip={(c) => setCurrentClip(c)}
              />
            </div>
          </div>
        )}

        {activeTab === 'clone' && (
          <div className="flex flex-col gap-6">
            <VoiceCloningStudio
              clonedVoices={clonedVoices}
              onAddClonedVoice={handleAddClonedVoice}
              onDeleteClonedVoice={handleDeleteClonedVoice}
              onSelectForTTS={handleSelectVoiceForTTS}
            />
          </div>
        )}

        {activeTab === 'library' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 flex flex-col gap-6">
              <AudioLibrary
                clips={clips}
                playlists={playlists}
                onSelectClip={(c) => setCurrentClip(c)}
                onSelectPlaylist={(p) => {
                  setCurrentPlaylist(p);
                  if (p.mergedClip) {
                    setCurrentClip(p.mergedClip);
                  } else if (p.blocks[0]?.clip) {
                    setCurrentClip(p.blocks[0].clip);
                  }
                }}
                onToggleFavorite={handleToggleFavorite}
                onDeleteClip={handleDeleteClip}
                onDeletePlaylist={handleDeletePlaylist}
                onOpenExportModal={(c) => setExportModalClip(c)}
                currentPlayingId={currentClip?.id}
              />
            </div>

            <div className="lg:col-span-5 flex flex-col gap-6 sticky top-20">
              <AudioPlayerWaveform
                clip={currentClip}
                playlist={currentPlaylist}
                onToggleFavorite={handleToggleFavorite}
                onOpenExportModal={(c) => setExportModalClip(c)}
                onSelectClip={(c) => setCurrentClip(c)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Global Modals */}
      <E2EESecurityModal
        isOpen={isE2EEOpen}
        onClose={() => setIsE2EEOpen(false)}
        onRotateKeyNotification={() =>
          notificationService.notify(
            'E2EE Key Rotated',
            'Master AES-256-GCM encryption key successfully rotated and re-indexed.',
            'security_alert'
          )
        }
      />

      <CloudSyncModal
        isOpen={isSyncOpen}
        onClose={() => setIsSyncOpen(false)}
        devices={devices}
        isSyncing={isSyncing}
        lastSyncedAt={lastSyncedAt}
        onTriggerSync={handleManualSync}
        onPairDevice={handlePairDevice}
      />

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        onSubmitFeedback={handleSubmitFeedback}
      />

      <NotificationsPanel
        isOpen={isNotifsOpen}
        onClose={() => setIsNotifsOpen(false)}
        notifications={notifications}
        onMarkAllRead={() => {
          setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          storageService.saveNotifications(notifications.map((n) => ({ ...n, read: true })));
        }}
        onRequestPushPermission={handleRequestPushPermission}
        pushPermissionStatus={
          'Notification' in window ? Notification.permission : 'unsupported'
        }
      />

      <ExportModal
        clip={exportModalClip}
        isOpen={!!exportModalClip}
        onClose={() => setExportModalClip(null)}
      />
    </div>
  );
}
