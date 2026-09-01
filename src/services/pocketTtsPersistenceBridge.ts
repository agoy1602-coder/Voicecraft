import type { ClonedVoiceProfile } from '../types';
import { cryptoService } from './crypto';
import { storageService } from './storage';

const BACKUP_KEY = 'voicecraft_pocket_tts_voice_backup_v1';

/**
 * Adds a second encrypted browser persistence layer for Pocket TTS voice profiles.
 * IndexedDB remains the primary store; localStorage is only a recovery copy so a
 * transient IndexedDB read/write failure cannot make a saved clone disappear.
 */
export function installPocketTtsPersistenceBridge(): void {
  const storage = storageService as any;
  if (storage.__pocketTtsPersistenceInstalled) return;
  storage.__pocketTtsPersistenceInstalled = true;

  const originalLoad = storage.loadClonedVoices.bind(storage);
  const originalSave = storage.saveClonedVoices.bind(storage);

  storage.saveClonedVoices = async (voices: ClonedVoiceProfile[]) => {
    // Keep the existing encrypted IndexedDB path as the primary store.
    await originalSave(voices);

    // Keep a small encrypted recovery copy. This never stores the voice sample
    // in plaintext and uses the same device-local E2EE key as the main vault.
    try {
      const encrypted = await cryptoService.encrypt(voices);
      localStorage.setItem(BACKUP_KEY, JSON.stringify(encrypted));
    } catch {
      // IndexedDB remains the primary persistence path.
    }
  };

  storage.loadClonedVoices = async (): Promise<ClonedVoiceProfile[]> => {
    const voices = await originalLoad();

    if (voices.length > 0) {
      // Refresh the recovery copy whenever the primary store succeeds.
      try {
        const encrypted = await cryptoService.encrypt(voices);
        localStorage.setItem(BACKUP_KEY, JSON.stringify(encrypted));
      } catch {}
      return voices;
    }

    // Recover only when the primary store returned no profiles.
    try {
      const backup = localStorage.getItem(BACKUP_KEY);
      if (!backup) return voices;
      const recovered = await cryptoService.decrypt(backup);
      if (Array.isArray(recovered)) {
        const pocketVoices = recovered.filter(
          (voice): voice is ClonedVoiceProfile =>
            !!voice && voice.type === 'cloned' && voice.provider === 'pocket-tts'
        );
        if (pocketVoices.length > 0) {
          // Repair the primary store for the next reload.
          await originalSave(pocketVoices);
          return pocketVoices;
        }
      }
    } catch {
      // Recovery is best-effort; never block app startup.
    }

    return voices;
  };
}
