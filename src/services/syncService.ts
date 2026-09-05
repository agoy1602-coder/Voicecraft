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
  private isSyncing = false;
  private autoSyncTimer: any = null;

  async triggerFullSync(
    clips: AudioClip[],
    voices: ClonedVoiceProfile[],
    onSyncedClips?: (mergedClips: AudioClip[]) => void,
    onSyncedVoices?: (mergedVoices: ClonedVoiceProfile[]) => void,
  ): Promise<SyncStatusResult> {
    if (!navigator.onLine) {
      return {
        isSyncing: false,
        lastSyncedAt: storageService.getLastSyncTime(),
        syncedCount: 0,
        serverTotal: clips.length,
        e2eeActive: true,
        activeDevicesCount: 1,
        error: null,
      };
    }

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
      const recordsToPush: any[] = [];

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

      const pushRes = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, deviceId, records: recordsToPush }),
      });
      const pushData = await pushRes.json();

      const pullRes = await fetch('/api/sync/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, sinceTimestamp: 0 }),
      });
      const pullData = await pullRes.json();
      const remoteRecords: any[] = pullData.records || [];

      const pulledClips: AudioClip[] = [];
      const pulledVoices: ClonedVoiceProfile[] = [];
      for (const r of remoteRecords) {
        try {
          const decrypted = await cryptoService.decrypt(r.encryptedData);
          if (r.recordType === 'audio' && decrypted?.id) pulledClips.push(decrypted);
          else if (r.recordType === 'voice_profile' && decrypted?.id) pulledVoices.push(decrypted);
        } catch {
          // Skip records that cannot be decrypted locally.
        }
      }

      const mergedClipsMap = new Map<string, AudioClip>();
      clips.forEach((c) => mergedClipsMap.set(c.id, c));
      pulledClips.forEach((c) => {
        if (!mergedClipsMap.has(c.id)) {
          if (c.audioBase64) {
            try {
              const bin = atob(c.audioBase64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              c.audioBlobUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
            } catch {
              // Keep the record without a blob URL.
            }
          }
          c.synced = true;
          mergedClipsMap.set(c.id, c);
        }
      });

      const mergedVoicesMap = new Map<string, ClonedVoiceProfile>();
      voices.forEach((v) => mergedVoicesMap.set(v.id, v));
      pulledVoices.forEach((v) => {
        if (!mergedVoicesMap.has(v.id)) mergedVoicesMap.set(v.id, v);
      });

      const finalClips = Array.from(mergedClipsMap.values());
      const finalVoices = Array.from(mergedVoicesMap.values());
      onSyncedClips?.(finalClips);
      onSyncedVoices?.(finalVoices);

      const now = Date.now();
      storageService.setLastSyncTime(now);
      await storageService.saveAudioClips(finalClips);
      await storageService.saveClonedVoices(finalVoices);

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
        error: err?.message || 'Sync failed',
      };
    }
  }

  async getLinkedDevices(): Promise<LinkedDevice[]> {
    const localDevice = (): LinkedDevice => ({
      deviceId: storageService.getDeviceId(),
      userId: 'user_default',
      deviceName: 'Web Studio Browser',
      deviceType: 'desktop',
      lastSeen: Date.now(),
      ipMasked: '127.0.0.1',
      appVersion: 'v2.4.0',
    });

    // Offline startup must never wait on a server request. The local device is
    // enough to keep the UI interactive; a future online event can sync again.
    if (!navigator.onLine) return [localDevice()];

    try {
      const res = await fetch('/api/sync/devices?userId=user_default');
      if (!res.ok) return [localDevice()];
      const data = await res.json();
      return data.devices?.length ? data.devices : [localDevice()];
    } catch {
      return [localDevice()];
    }
  }

  async pairNewDevice(deviceName: string, deviceType: 'ios' | 'android' | 'desktop' | 'tablet'): Promise<LinkedDevice | null> {
    if (!navigator.onLine) return null;
    try {
      const res = await fetch('/api/sync/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'user_default', deviceName, deviceType, appVersion: 'v2.4.0' }),
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
    intervalMs = 30000,
  ) {
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
    this.autoSyncTimer = setInterval(() => {
      if (navigator.onLine) this.triggerFullSync(getClips(), getVoices(), onSyncedClips, onSyncedVoices);
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
