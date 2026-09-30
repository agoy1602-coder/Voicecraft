import { AudioClip, ClonedVoiceProfile } from '../types';
import { storageService } from './storage';
import { saveWrappedVaultKey } from './accountService';
import {
  createVaultKey,
  verifyVaultKey,
  wrapVaultKey,
} from './vaultKeyService';
import {
  verifyVaultRecords,
  writeVaultRecords,
} from './vaultStorage';

export interface VaultMigrationResult {
  voiceCount: number;
  audioCount: number;
  keyVersion: number;
}

export async function migrateLocalVaultToAccount(
  recoverySecret: string
): Promise<VaultMigrationResult> {
  if (!recoverySecret || recoverySecret.length < 12) {
    throw new Error('Vault recovery secret must contain at least 12 characters.');
  }

  // Read through the existing storage service so the current E2EE format remains
  // the source of truth. Nothing in the existing stores is modified here.
  const [voices, clips] = await Promise.all([
    storageService.loadClonedVoices(),
    storageService.loadAudioClips(),
  ]);

  const vaultKey = await createVaultKey();
  await verifyVaultKey(vaultKey);

  // Build the new encrypted copy in parallel versioned stores. The existing
  // voice/audio stores remain untouched if any step below fails.
  await writeVaultRecords(vaultKey, voices, clips);

  // Verify every new record can be decrypted before the recovery key is
  // persisted remotely.
  await verifyVaultRecords(vaultKey, voices, clips);

  // The server receives only the recovery-wrapped Vault Key. The raw Vault Key
  // never leaves this browser context.
  const wrappedVaultKey = await wrapVaultKey(vaultKey, recoverySecret);
  await saveWrappedVaultKey(wrappedVaultKey);

  return {
    voiceCount: voices.length,
    audioCount: clips.length,
    keyVersion: wrappedVaultKey.keyVersion,
  };
}
