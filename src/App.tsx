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
import { pocketTtsService } from './services/pocketTtsService';
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
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
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

  // Preload Pocket TTS while online so its model assets are ready for a
  // later airplane-mode Clone. The same service/load promise is shared with
  // cloneVoice(), making this safe if the user starts cloning while warming.
  useEffect(() => {
    if (!isOnline) return;

    let cancelled = false;
    const warm = () => {
      if (cancelled || !navigator.onLine) return;
      pocketTtsService.warmup().catch((error) => {
        if (!cancelled) console.warn('[VoiceCraft] Pocket TTS warmup deferred:', error);
      });
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    let idleHandle: number | null = null;
    const timerHandle = window.setTimeout(() => {
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(warm, { timeout: 5000 });
      } else {
        warm();
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(timerHandle);
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }, [isOnline]);

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
          `Generated \"${newClip.title}\" (${newClip.durationSeconds.toFixed(1)}s) using local engine while Gemini API rate limit cools down (~${result.retryAfterSeconds || 15}s).`,
          'offline_status'
        );
      } else if (result.isOffline) {
        notificationService.notify(
          'Offline Speech Synthesized',
          `Generated \"${newClip.title}\" (${newClip.durationSeconds.toFixed(1)}s) using local client acoustic engine in ${result.latencyMs}ms.`,
          'render_complete'
        );
      } else {
        notificationService.notify(
          'Neural Speech Synthesized',
          `Generated \"${newClip.title}\" (${newClip.durationSeconds.toFixed(1)}s) via ${newClip.voiceName} in ${result.latencyMs}ms.`,
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
