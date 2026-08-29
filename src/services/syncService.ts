import { AudioClip, ClonedVoiceProfile, LinkedDevice } from '../types';
import { cryptoService } from './crypto';
import { storageService } from './storage';

export interface SyncStatusResult {
  isSyncing: boolean;
  lastSyncedAt: number;
  syncedCount: number;
  serverTotal: number;
  e2eeActive: boolean;
  activeDevicesCount: number;
  error: string | null;
}

class SyncService {
  private isSyncing: boolean = false;
  private autoSyncTimer: any = null;

  async triggerFullSync(
    clips: AudioClip[],
    voices: ClonedVoiceProfile[],
    onSyncedClips?: (mergedClips: AudioClip[]) => void,
    onSyncedVoices?: (mergedVoices: ClonedVoiceProfile[]) => void
  ): Promise<SyncStatusResult> {
    if (this.isSyncing) {
      return {
        isSyncing: true,
        lastSyncedAt: storageService.getLastSyncTime(),
        syncedCount: 0,
        serverTotal: 0,
        e2eeActive: true,
        activeDevicesCount: 1,
        error: null,
      };
    }

    this.isSyncing = true;
    const deviceId = storageService.getDeviceId();
    const userId = 'user_default';

    try {
      // 1. Prepare Encrypted Records for Push
      const recordsToPush: any[] = [];

      // Encrypt clips
      for (const clip of clips) {
        const serializableClip = { ...clip, audioBlobUrl: '' };
        const encrypted = await cryptoService.encrypt(serializableClip);
        recordsToPush.push({
          id: clip.id,
          userId,
          deviceId,
          recordType: 'audio',
          encryptedData: JSON.stringify(encrypted),
          checksum: encrypted.checksum,
          version: 1,
          updatedAt: clip.createdAt,
        });
      }

      // Encrypt cloned voices
      for (const voice of voices) {
        const encrypted = await cryptoService.encrypt(voice);
        recordsToPush.push({
          id: voice.id,
          userId,
          deviceId,
          recordType: 'voice_profile',
          encryptedData: JSON.stringify(encrypted),
          checksum: encrypted.checksum,
          version: 1,
          updatedAt: voice.createdAt,
        });
      }

      // Push to Server
      const pushRes = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          deviceId,
          records: recordsToPush,
        }),
      });

      const pushData = await pushRes.json();

      // Pull Remote Updates
      const lastSyncTime = storageService.getLastSyncTime();
      const pullRes = await fetch('/api/sync/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sinceTimestamp: 0, // pull all to ensure consistency
        }),
      });

      const pullData = await pullRes.json();
      const remoteRecords: any[] = pullData.records || [];

      // Decrypt incoming records
      const pulledClips: AudioClip[] = [];
      const pulledVoices: ClonedVoiceProfile[] = [];

      for (const r of remoteRecords) {
        try {
          const decrypted = await cryptoService.decrypt(r.encryptedData);
          if (r.recordType === 'audio' && decrypted && decrypted.id) {
            pulledClips.push(decrypted);
          } else if (r.recordType === 'voice_profile' && decrypted && decrypted.id) {
            pulledVoices.push(decrypted);
          }
        } catch {
          // Record decryption skipped
        }
      }

      // Merge clips (deduplicating by ID)
      const mergedClipsMap = new Map<string, AudioClip>();
      clips.forEach((c) => mergedClipsMap.set(c.id, c));
      pulledClips.forEach((c) => {
        if (!mergedClipsMap.has(c.id)) {
          // Rehydrate blob url if base64 available
          if (c.audioBase64) {
            try {
              const bin = atob(c.audioBase64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              const blob = new Blob([bytes], { type: 'audio/wav' });
              c.audioBlobUrl = URL.createObjectURL(blob);
            } catch {}
          }
          c.synced = true;
          mergedClipsMap.set(c.id, c);
        }
      });

      const mergedVoicesMap = new Map<string, ClonedVoiceProfile>();
      voices.forEach((v) => mergedVoicesMap.set(v.id, v));
      pulledVoices.forEach((v) => {
        if (!mergedVoicesMap.has(v.id)) {
          mergedVoicesMap.set(v.id, v);
        }
      });

      const finalClips = Array.from(mergedClipsMap.values());
      const finalVoices = Array.from(mergedVoicesMap.values());

      if (onSyncedClips) onSyncedClips(finalClips);
      if (onSyncedVoices) onSyncedVoices(finalVoices);

      const now = Date.now();
      storageService.setLastSyncTime(now);
      await storageService.saveAudioClips(finalClips);
      await storageService.saveClonedVoices(finalVoices);

      // Fetch linked devices
      const devices = await this.getLinkedDevices();

      this.isSyncing = false;
      return {
        isSyncing: false,
        lastSyncedAt: now,
        syncedCount: recordsToPush.length,
        serverTotal: pushData.serverTotalCount || finalClips.length,
        e2eeActive: true,
        activeDevicesCount: devices.length,
        error: null,
      };
    } catch (err: any) {
      this.isSyncing = false;
      return {
        isSyncing: false,
        lastSyncedAt: storageService.getLastSyncTime(),
        syncedCount: 0,
        serverTotal: clips.length,
        e2eeActive: true,
        activeDevicesCount: 1,
        error: err.message || 'Sync failed',
      };
    }
  }

  async getLinkedDevices(): Promise<LinkedDevice[]> {
    try {
      const res = await fetch('/api/sync/devices?userId=user_default');
      const data = await res.json();
      return data.devices || [];
    } catch {
      return [
        {
          deviceId: storageService.getDeviceId(),
          userId: 'user_default',
          deviceName: 'Web Studio Browser',
          deviceType: 'desktop',
          lastSeen: Date.now(),
          ipMasked: '127.0.0.1',
          appVersion: 'v2.4.0',
        },
      ];
    }
  }

  async pairNewDevice(deviceName: string, deviceType: 'ios' | 'android' | 'desktop' | 'tablet'): Promise<LinkedDevice | null> {
    try {
      const res = await fetch('/api/sync/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user_default',
          deviceName,
          deviceType,
          appVersion: 'v2.4.0',
        }),
      });
      const data = await res.json();
      return data.device || null;
    } catch {
      return null;
    }
  }

  startAutoSync(
    getClips: () => AudioClip[],
    getVoices: () => ClonedVoiceProfile[],
    onSyncedClips: (clips: AudioClip[]) => void,
    onSyncedVoices: (voices: ClonedVoiceProfile[]) => void,
    intervalMs: number = 30000
  ) {
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
    this.autoSyncTimer = setInterval(() => {
      if (navigator.onLine) {
        this.triggerFullSync(getClips(), getVoices(), onSyncedClips, onSyncedVoices);
      }
    }, intervalMs);
  }

  stopAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }
}

export const syncService = new SyncService();
