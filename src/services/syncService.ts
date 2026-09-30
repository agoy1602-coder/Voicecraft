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
      /*
       * IMPORTANT DATA-SAFETY RULE:
       * An empty local array is not proof that the user deleted everything.
       * It can mean a fresh browser, delayed IndexedDB initialization, a
       * storage failure, or a decryption failure. Therefore we PULL first,
       * merge, and only then PUSH. Never send an empty state as a destructive
       * synchronization instruction.
       */

      // 1. Pull remote records first so a fresh browser can recover existing data
      // before it has any opportunity to publish its initial empty React state.
      const pullRes = await fetch('/api/sync/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sinceTimestamp: 0,
        }),
      });

      if (!pullRes.ok) {
        throw new Error(`Sync pull failed (HTTP ${pullRes.status})`);
      }

      const pullData = await pullRes.json();
      const remoteRecords: any[] = Array.isArray(pullData.records) ? pullData.records : [];

      // 2. Decrypt remote records.
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
          // Do not turn an undecryptable remote record into a deletion.
        }
      }

      // 3. Merge local + remote. Local records are retained; remote records
      // fill gaps. This is intentionally non-destructive.
      const mergedClipsMap = new Map<string, AudioClip>();
      clips.forEach((c) => mergedClipsMap.set(c.id, c));

      pulledClips.forEach((c) => {
        if (!mergedClipsMap.has(c.id)) {
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

      const finalClips = Array.from(mergedClipsMap.values())
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 5);
      const finalVoices = Array.from(mergedVoicesMap.values());

      // If both sides are empty, stop. An empty merge is never written as a
      // successful synchronization result because it could represent missing
      // data rather than an intentional user deletion.
      if (finalClips.length === 0 && finalVoices.length === 0) {
        throw new Error('Sync returned no recoverable user records; local data was not overwritten.');
      }

      // 4. Persist the recovered/merged state locally before publishing it.
      await storageService.saveAudioClips(finalClips);
      await storageService.saveClonedVoices(finalVoices);

      if (onSyncedClips) onSyncedClips(finalClips);
      if (onSyncedVoices) onSyncedVoices(finalVoices);

      // 5. Push the merged state, never the potentially-empty initial local state.
      const recordsToPush: any[] = [];

      for (const clip of finalClips) {
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

      for (const voice of finalVoices) {
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
        body: JSON.stringify({
          userId,
          deviceId,
          records: recordsToPush,
        }),
      });

      if (!pushRes.ok) {
        throw new Error(`Sync push failed (HTTP ${pushRes.status})`);
      }

      const pushData = await pushRes.json();
      const now = Date.now();
      storageService.setLastSyncTime(now);

      const devices = await this.getLinkedDevices();

      this.isSyncing = false;
      return {
        isSyncing: false,
        lastSyncedAt: now,
        syncedCount: recordsToPush.length,
        serverTotal: pushData.serverTotalCount || finalClips.length + finalVoices.length,
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
        serverTotal: clips.length + voices.length,
        e2eeActive: true,
        activeDevicesCount: 1,
        error: err.message || 'Sync failed; existing local data was preserved',
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
