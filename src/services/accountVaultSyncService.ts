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
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function encryptPayload(value: unknown, key: CryptoKey): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(packed);
}

async function decryptPayload<T>(payload: string, key: CryptoKey): Promise<T> {
  const packed = fromBase64(payload);
  if (packed.length <= 12) throw new Error('Invalid encrypted sync payload.');
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
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
  const rows = await Promise.all([
    ...voices.map(async (voice) => ({
      user_id: userId,
      record_id: voice.id,
      record_type: 'voice_profile' as const,
      encrypted_payload: await encryptPayload(voice, key),
      version: 1,
      updated_at: recordUpdatedAt(voice.createdAt),
      deleted_at: null,
    })),
    ...clips.map(async (clip) => ({
      user_id: userId,
      record_id: clip.id,
      record_type: 'audio' as const,
      encrypted_payload: await encryptPayload({ ...clip, audioBlobUrl: '' }, key),
      version: 1,
      updated_at: recordUpdatedAt(clip.createdAt),
      deleted_at: null,
    })),
  ]);

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
    .select('record_id,record_type,encrypted_payload,version,updated_at,deleted_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  const voices: ClonedVoiceProfile[] = [];
  const clips: AudioClip[] = [];

  for (const row of (data || []) as SyncRecordRow[]) {
    try {
      if (row.record_type === 'voice_profile') {
        const voice = await decryptPayload<ClonedVoiceProfile>(row.encrypted_payload, key);
        if (voice.id === row.record_id) voices.push(voice);
      } else {
        const clip = await decryptPayload<AudioClip>(row.encrypted_payload, key);
        if (clip.id === row.record_id) {
          clip.synced = true;
          if (clip.audioBase64) {
            try {
              const bin = atob(clip.audioBase64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              clip.audioBlobUrl = URL.createObjectURL(new Blob([bytes], { type: clip.format || 'audio/wav' }));
            } catch {
              clip.audioBlobUrl = '';
            }
          }
          clips.push(clip);
        }
      }
    } catch {
      // Keep undecryptable records server-side; never turn them into local deletions.
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
    if (!voiceMap.has(voice.id)) voiceMap.set(voice.id, voice);
  }

  for (const clip of localClips) clipMap.set(clip.id, clip);
  for (const clip of pulled.clips) {
    if (!clipMap.has(clip.id)) clipMap.set(clip.id, clip);
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
