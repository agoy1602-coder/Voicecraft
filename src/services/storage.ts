import { AudioClip, ClonedVoiceProfile, UserSettings, AppNotification, ProjectPlaylist } from '../types';
import { cryptoService } from './crypto';
import { pcmToWavBlob } from './audioExport';

const STORAGE_KEYS = {
  SETTINGS: 'voicecraft_settings',
  CLONED_VOICES: 'voicecraft_cloned_voices',
  AUDIO_CLIPS: 'voicecraft_audio_clips_e2ee',
  NOTIFICATIONS: 'voicecraft_notifications',
  LAST_SYNC: 'voicecraft_last_sync_time',
  DEVICE_ID: 'voicecraft_device_id',
  PROJECT_PLAYLISTS: 'voicecraft_project_playlists',
};

export const DEFAULT_SETTINGS: UserSettings = {
  darkMode: true,
  highContrast: false,
  sampleRecordingDuration: 5,
  defaultLanguage: 'en-US',
  defaultTone: 'professional',
  defaultVoice: 'voice_zephyr',
  autoCloudSync: true,
  pushNotificationsEnabled: true,
  e2eeEnabled: true,
  offlineFallbackEnabled: true,
  audioQuality: 'high',
};

const DB_NAME = 'voicecraft_e2ee_db';
const DB_VERSION = 1;
const STORE_CLIPS = 'audio_clips';
const STORE_VOICES = 'cloned_voices';
const STORE_KV = 'kv_store';
export const MAX_AUDIO_CLIPS = 5;

class StorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryClipsCache: AudioClip[] = [];

  constructor() {
    this.initDatabase();
    this.migrateLegacyLocalStorage();
  }

  private initDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported in this environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_CLIPS)) {
          db.createObjectStore(STORE_CLIPS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_VOICES)) {
          db.createObjectStore(STORE_VOICES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Migrate old data from localStorage into IndexedDB and clean up localStorage to free quota
   */
  private async migrateLegacyLocalStorage() {
    try {
      const legacyClips = localStorage.getItem(STORAGE_KEYS.AUDIO_CLIPS);
      if (legacyClips) {
        try {
          let parsed: AudioClip[] = [];
          if (legacyClips.startsWith('{') && legacyClips.includes('ciphertext')) {
            parsed = await cryptoService.decrypt(legacyClips);
          } else {
            parsed = JSON.parse(legacyClips);
          }
          if (Array.isArray(parsed) && parsed.length > 0) {
            await this.saveAudioClips(parsed);
          }
        } catch {
          // Skip corrupt legacy clip
        }
        // Remove from localStorage to immediately free quota
        localStorage.removeItem(STORAGE_KEYS.AUDIO_CLIPS);
      }

      const legacyVoices = localStorage.getItem(STORAGE_KEYS.CLONED_VOICES);
      if (legacyVoices) {
        try {
          let parsed: ClonedVoiceProfile[] = [];
          if (legacyVoices.startsWith('{') && legacyVoices.includes('ciphertext')) {
            parsed = await cryptoService.decrypt(legacyVoices);
          } else {
            parsed = JSON.parse(legacyVoices);
          }
          if (Array.isArray(parsed) && parsed.length > 0) {
            await this.saveClonedVoices(parsed);
          }
        } catch {
          // Skip corrupt legacy voice
        }
        localStorage.removeItem(STORAGE_KEYS.CLONED_VOICES);
      }
    } catch {
      // Legacy migration complete
    }
  }

  getDeviceId(): string {
    let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!id) {
      id = `dev_web_${Math.random().toString(36).substring(2, 9)}`;
      try {
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
      } catch {}
    }
    return id;
  }

  loadSettings(): UserSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(settings: UserSettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {
      // localStorage write fallback
    }
  }

  async loadClonedVoices(): Promise<ClonedVoiceProfile[]> {
    try {
      const db = await this.initDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_VOICES, 'readonly');
        const store = tx.objectStore(STORE_VOICES);
        const req = store.getAll();

        req.onsuccess = async () => {
          const records = req.result || [];
          const voices: ClonedVoiceProfile[] = [];

          for (const item of records) {
            if (item.encryptedData) {
              try {
                const dec = await cryptoService.decrypt(item.encryptedData);
                if (dec && dec.id) voices.push(dec);
              } catch {
                if (item.id) voices.push(item);
              }
            } else if (item.id) {
              voices.push(item);
            }
          }
          resolve(voices);
        };

        req.onerror = () => {
          resolve([]);
        };
      });
    } catch {
      return [];
    }
  }

  async saveClonedVoices(voices: ClonedVoiceProfile[]): Promise<void> {
    // Encrypt everything before opening the IndexedDB transaction. Awaiting
    // Web Crypto inside an active transaction can make the transaction
    // inactive before store.put(), causing cloned voices to disappear after refresh.
    const encryptedRecords = await Promise.all(
      voices.map(async (voice) => {
        const encrypted = await cryptoService.encrypt(voice);
        return {
          id: voice.id,
          encryptedData: JSON.stringify(encrypted),
          createdAt: voice.createdAt,
          name: voice.name,
        };
      })
    );

    const db = await this.initDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_VOICES, 'readwrite');
      const store = tx.objectStore(STORE_VOICES);
      store.clear();
      for (const record of encryptedRecords) {
        store.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Cloned voice storage transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('Cloned voice storage transaction aborted'));
    });
  }

  async loadAudioClips(): Promise<AudioClip[]> {
    try {
      const db = await this.initDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_CLIPS, 'readonly');
        const store = tx.objectStore(STORE_CLIPS);
        const req = store.getAll();

        req.onsuccess = async () => {
          const rawItems = req.result || [];
          const clips: AudioClip[] = [];

          for (const item of rawItems) {
            let clip: AudioClip | null = null;
            if (item.encryptedData) {
              try {
                clip = await cryptoService.decrypt(item.encryptedData);
              } catch {
                clip = item;
              }
            } else {
              clip = item;
            }

            if (clip && clip.id) {
              // Rehydrate transient blob URLs from durable Base64 audio.
              // Older cloud-generated clips stored raw PCM, while current clips store WAV.
              if (clip.audioBase64 && (!clip.audioBlobUrl || clip.audioBlobUrl.startsWith('blob:'))) {
                try {
                  const binary = atob(clip.audioBase64);
                  const bytes = new Uint8Array(binary.length);
                  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

                  const isWav = bytes.length >= 12
                    && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
                    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WAVE';

                  // Legacy cloud clips contain raw 16-bit PCM; add a WAV header.
                  const audioBlob = isWav
                    ? new Blob([bytes], { type: 'audio/wav' })
                    : pcmToWavBlob(bytes.buffer, clip.sampleRate || 24000, 1);

                  clip.audioBlobUrl = URL.createObjectURL(audioBlob);

                  // Normalize legacy PCM records so future saves persist a complete WAV.
                  if (!isWav) {
                    const wavBytes = new Uint8Array(await audioBlob.arrayBuffer());
                    let wavBinary = '';
                    const chunkSize = 0x8000;
                    for (let offset = 0; offset < wavBytes.length; offset += chunkSize) {
                      wavBinary += String.fromCharCode(...wavBytes.subarray(offset, Math.min(offset + chunkSize, wavBytes.length)));
                    }
                    clip.audioBase64 = btoa(wavBinary);
                  }
                } catch {
                  // Preserve clip metadata if audio cannot be rehydrated.
                }
              }
              clips.push(clip);
            }
          }

          // Sort by creation time newest first
          clips.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          const retainedClips = clips.slice(0, MAX_AUDIO_CLIPS);
          this.memoryClipsCache = retainedClips;
          resolve(retainedClips);
        };

        req.onerror = () => {
          resolve(this.memoryClipsCache);
        };
      });
    } catch {
      return this.memoryClipsCache;
    }
  }

  async saveAudioClips(clips: AudioClip[]): Promise<void> {
    const retainedClips = [...clips]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, MAX_AUDIO_CLIPS);
    this.memoryClipsCache = retainedClips;

    // Encrypt before opening the IndexedDB write transaction. Awaiting crypto
    // work inside an active transaction can cause the transaction to become
    // inactive before store.put(), which made generated clips disappear on refresh.
    const encryptedRecords = await Promise.all(
      retainedClips.map(async (clip) => {
        const serializableClip: AudioClip = {
          ...clip,
          audioBlobUrl: '', // Rehydrate from audioBase64 after reload
        };
        const encrypted = await cryptoService.encrypt(serializableClip);
        return {
          id: clip.id,
          encryptedData: JSON.stringify(encrypted),
          createdAt: clip.createdAt,
          title: clip.title,
          audioBase64: clip.audioBase64,
        };
      })
    );

    const db = await this.initDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CLIPS, 'readwrite');
      const store = tx.objectStore(STORE_CLIPS);
      store.clear();
      for (const record of encryptedRecords) {
        store.put(record);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Audio Library storage transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('Audio Library storage transaction aborted'));
    });
  }

  async saveSingleClip(clip: AudioClip): Promise<void> {
    const current = await this.loadAudioClips();
    const updated = [clip, ...current.filter((c) => c.id !== clip.id)]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, MAX_AUDIO_CLIPS);
    await this.saveAudioClips(updated);
  }

  async deleteAudioClip(id: string): Promise<void> {
    try {
      this.memoryClipsCache = this.memoryClipsCache.filter((c) => c.id !== id);
      const db = await this.initDatabase();
      const tx = db.transaction(STORE_CLIPS, 'readwrite');
      const store = tx.objectStore(STORE_CLIPS);
      store.delete(id);
    } catch {
      // Delete complete
    }
  }

  loadNotifications(): AppNotification[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveNotifications(notifs: AppNotification[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs.slice(0, 50)));
    } catch {}
  }

  getLastSyncTime(): number {
    try {
      const t = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
      return t ? parseInt(t, 10) : 0;
    } catch {
      return 0;
    }
  }

  setLastSyncTime(time: number): void {
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_SYNC, time.toString());
    } catch {}
  }

  async loadProjectPlaylists(): Promise<ProjectPlaylist[]> {
    try {
      const db = await this.initDatabase();
      const raw = await new Promise<any>((resolve) => {
        const tx = db.transaction(STORE_KV, 'readonly');
        const store = tx.objectStore(STORE_KV);
        const req = store.get('project_playlists');
        req.onsuccess = () => resolve(req.result?.value || null);
        req.onerror = () => resolve(null);
      });

      let playlists: ProjectPlaylist[] = [];
      if (raw) {
        if (typeof raw === 'string' && raw.startsWith('{') && raw.includes('ciphertext')) {
          try {
            playlists = await cryptoService.decrypt(raw);
          } catch {
            playlists = [];
          }
        } else if (Array.isArray(raw)) {
          playlists = raw;
        }
      }

      if (!playlists || !playlists.length) {
        // Fallback to localStorage
        const ls = localStorage.getItem(STORAGE_KEYS.PROJECT_PLAYLISTS);
        if (ls) {
          try {
            playlists = JSON.parse(ls);
          } catch {}
        }
      }

      return Array.isArray(playlists) ? playlists : [];
    } catch {
      try {
        const ls = localStorage.getItem(STORAGE_KEYS.PROJECT_PLAYLISTS);
        return ls ? JSON.parse(ls) : [];
      } catch {
        return [];
      }
    }
  }

  async saveProjectPlaylists(playlists: ProjectPlaylist[]): Promise<void> {
    try {
      // Strip transient blob URLs from storage representation
      const sanitized = playlists.map((p) => ({
        ...p,
        blocks: p.blocks.map((b) => ({
          ...b,
          clip: b.clip ? { ...b.clip, audioBlobUrl: '' } : undefined,
        })),
        mergedClip: p.mergedClip ? { ...p.mergedClip, audioBlobUrl: '' } : undefined,
      }));

      // Store in KV store
      const db = await this.initDatabase();
      const tx = db.transaction(STORE_KV, 'readwrite');
      const store = tx.objectStore(STORE_KV);
      const encrypted = await cryptoService.encrypt(sanitized);
      store.put({ key: 'project_playlists', value: JSON.stringify(encrypted) });

      // Save lightweight copy in localStorage
      localStorage.setItem(
        STORAGE_KEYS.PROJECT_PLAYLISTS,
        JSON.stringify(
          sanitized.map((p) => ({
            ...p,
            blocks: p.blocks.map((b) => ({
              ...b,
              clip: b.clip ? { ...b.clip, audioBase64: undefined, audioBlobUrl: '' } : undefined,
            })),
            mergedClip: p.mergedClip ? { ...p.mergedClip, audioBase64: undefined, audioBlobUrl: '' } : undefined,
          }))
        )
      );
    } catch {
      // Fallback
    }
  }

  async saveSingleProjectPlaylist(playlist: ProjectPlaylist): Promise<void> {
    const all = await this.loadProjectPlaylists();
    const idx = all.findIndex((p) => p.id === playlist.id);
    let updated: ProjectPlaylist[];
    if (idx >= 0) {
      updated = [...all];
      updated[idx] = playlist;
    } else {
      updated = [playlist, ...all];
    }
    await this.saveProjectPlaylists(updated);
  }

  async deleteProjectPlaylist(id: string): Promise<void> {
    const all = await this.loadProjectPlaylists();
    const filtered = all.filter((p) => p.id !== id);
    await this.saveProjectPlaylists(filtered);
  }
}

export const storageService = new StorageService();