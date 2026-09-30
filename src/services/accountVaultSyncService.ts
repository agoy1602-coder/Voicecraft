import { getSupabaseClient } from './supabaseClient';
import { storageService } from './storage';
import { AudioClip, ClonedVoiceProfile } from '../types';
import { requireActiveVaultKey } from './vaultSession';

interface SyncRecordRow {
  record_id: string;
  record_type: 'audio' | 'voice_profile';
  encrypted_payload: string;
  version: number;
  updated_at: string;
  deleted_at: string | null;
  storage_path: string | null;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function encryptJson(value: unknown, key: CryptoKey): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  return encryptBytes(plaintext, key);
}

async function encryptBytes(plaintext: Uint8Array, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(packed);
}

async function decryptJson<T>(payload: string, key: CryptoKey): Promise<T> {
  const plaintext = await decryptBytes(payload, key);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

async function decryptBytes(payload: string, key: CryptoKey): Promise<Uint8Array> {
  const packed = fromBase64(payload);
  if (packed.length <= 12) throw new Error('Invalid encrypted sync payload.');
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}

async function readClipAudioBytes(clip: AudioClip): Promise<Uint8Array | null> {
  if (clip.audioBase64) return fromBase64(clip.audioBase64);

  if (clip.audioBlobUrl && clip.audioBlobUrl.startsWith('blob:')) {
    try {
      const response = await fetch(clip.audioBlobUrl);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
    } catch {
      // Fall through: the clip may be metadata-only.
    }
  }

  return null;
}

function audioBlobFromBytes(bytes: Uint8Array, mimeType: string): Blob {
  return new Blob([bytes], { type: mimeType || 'audio/wav' });
}

function recordUpdatedAt(value: number): string {
  return new Date(value || Date.now()).toISOString();
}

export interface AccountSyncResult {
  pulledVoices: number;
  pulledClips: number;
  pushedRecords: number;
  serverRecords: number;
}

export async function pushAccountVault(
  voices: ClonedVoiceProfile[],
  clips: AudioClip[]
): Promise<number> {
  const supabase = getSupabaseClient();
  const key = requireActiveVaultKey();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('A signed-in account is required for vault sync.');

  const userId = userData.user.id;

  const voiceRows = await Promise.all(
    voices.map(async (voice) => ({
      user_id: userId,
      record_id: voice.id,
      record_type: 'voice_profile' as const,
      encrypted_payload: await encryptJson(voice, key),
      version: 1,
      updated_at: recordUpdatedAt(voice.createdAt),
      deleted_at: null,
      storage_path: null,
    }))
  );

  const audioRows: Array<{
    user_id: string;
    record_id: string;
    record_type: 'audio';
    encrypted_payload: string;
    version: number;
    updated_at: string;
    deleted_at: null;
    storage_path: string | null;
  }> = [];

  for (const clip of clips) {
    const audioBytes = await readClipAudioBytes(clip);
    let storagePath: string | null = null;

    if (audioBytes && audioBytes.length > 0) {
      storagePath = `${userId}/${clip.id}.enc`;
      const encryptedAudio = await encryptBytes(audioBytes, key);
      const encryptedBlob = audioBlobFromBytes(fromBase64(encryptedAudio), 'application/octet-stream');

      const { error: uploadError } = await supabase.storage
        .from('vault-audio')
        .upload(storagePath, encryptedBlob, {
          contentType: 'application/octet-stream',
          upsert: true,
        });

      if (uploadError) throw uploadError;
    }

    if (!storagePath) {
      const { data: existingRecord, error: existingError } = await supabase
        .from('sync_records')
        .select('storage_path')
        .eq('record_id', clip.id)
        .eq('record_type', 'audio')
        .maybeSingle();
      if (existingError) throw existingError;
      storagePath = existingRecord?.storage_path ?? null;
    }

    const metadataOnlyClip = { ...clip, audioBase64: undefined, audioBlobUrl: '' };
    audioRows.push({
      user_id: userId,
      record_id: clip.id,
      record_type: 'audio',
      encrypted_payload: await encryptJson(metadataOnlyClip, key),
      version: 1,
      updated_at: recordUpdatedAt(clip.createdAt),
      deleted_at: null,
      storage_path: storagePath,
    });
  }

  const rows = [...voiceRows, ...audioRows];

  if (rows.length === 0) {
    throw new Error('Refusing to push an empty account vault.');
  }

  const { error } = await supabase.from('sync_records').upsert(rows, {
    onConflict: 'user_id,record_id',
  });
  if (error) throw error;

  return rows.length;
}

export async function pullAccountVault(): Promise<{
  voices: ClonedVoiceProfile[];
  clips: AudioClip[];
  serverRecords: number;
}> {
  const supabase = getSupabaseClient();
  const key = requireActiveVaultKey();

  const { data, error } = await supabase
    .from('sync_records')
    .select('record_id,record_type,encrypted_payload,version,updated_at,deleted_at,storage_path')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const voices: ClonedVoiceProfile[] = [];
  const clips: AudioClip[] = [];

  for (const row of (data || []) as SyncRecordRow[]) {
    try {
      if (row.record_type === 'voice_profile') {
        const voice = await decryptJson<ClonedVoiceProfile>(row.encrypted_payload, key);
        if (voice.id === row.record_id) voices.push(voice);
        continue;
      }

      const clip = await decryptJson<AudioClip>(row.encrypted_payload, key);
      if (clip.id !== row.record_id) continue;

      clip.synced = true;

      if (row.storage_path) {
        try {
          const { data: encryptedFile, error: downloadError } = await supabase.storage
            .from('vault-audio')
            .download(row.storage_path);

          if (!downloadError) {
            const encryptedBytes = new Uint8Array(await encryptedFile.arrayBuffer());
            const decryptedAudio = await decryptBytes(toBase64(encryptedBytes), key);
            clip.audioBase64 = toBase64(decryptedAudio);
            clip.audioBlobUrl = URL.createObjectURL(
              audioBlobFromBytes(decryptedAudio, clip.format || 'audio/wav')
            );
          }
        } catch {
          // Preserve metadata even if the encrypted blob is temporarily unavailable.
        }
      }

      clips.push(clip);
    } catch {
      // Keep undecryptable metadata records server-side; never turn them into local deletions.
    }
  }

  return { voices, clips, serverRecords: data?.length || 0 };
}

export async function syncAccountVault(
  localVoices: ClonedVoiceProfile[],
  localClips: AudioClip[]
): Promise<AccountSyncResult> {
  const pulled = await pullAccountVault();

  const voiceMap = new Map<string, ClonedVoiceProfile>();
  const clipMap = new Map<string, AudioClip>();

  for (const voice of localVoices) voiceMap.set(voice.id, voice);
  for (const voice of pulled.voices) {
    const local = voiceMap.get(voice.id);
    if (!local || (voice.createdAt || 0) > (local.createdAt || 0)) {
      voiceMap.set(voice.id, voice);
    }
  }

  for (const clip of localClips) clipMap.set(clip.id, clip);
  for (const clip of pulled.clips) {
    const local = clipMap.get(clip.id);
    if (!local || (clip.createdAt || 0) > (local.createdAt || 0)) {
      clipMap.set(clip.id, clip);
    }
  }

  const mergedVoices = Array.from(voiceMap.values());
  const mergedClips = Array.from(clipMap.values())
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 5);

  if (mergedVoices.length === 0 && mergedClips.length === 0) {
    throw new Error('Account sync stopped because no recoverable local or server records exist.');
  }

  await storageService.saveClonedVoices(mergedVoices);
  await storageService.saveAudioClips(mergedClips);

  const pushedRecords = await pushAccountVault(mergedVoices, mergedClips);

  return {
    pulledVoices: pulled.voices.length,
    pulledClips: pulled.clips.length,
    pushedRecords,
    serverRecords: pulled.serverRecords,
  };
}
