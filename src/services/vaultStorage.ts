import { AudioClip, ClonedVoiceProfile } from '../types';

interface VaultEncryptedRecord {
  id: string;
  encryptedPayload: string;
  updatedAt: number;
}

const VAULT_DB_VERSION = 2;
const DB_NAME = 'voicecraft_e2ee_db';
const STORE_AUDIO = 'vault_audio_clips';
const STORE_VOICES = 'vault_cloned_voices';

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function encryptJson(value: unknown, key: CryptoKey): Promise<string> {
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return toBase64(packed);
}

async function decryptJson<T>(payload: string, key: CryptoKey): Promise<T> {
  const packed = fromBase64(payload);
  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

function openVaultDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VAULT_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_VOICES)) {
        db.createObjectStore(STORE_VOICES, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Vault database open failed'));
  });
}

async function replaceStore(
  db: IDBDatabase,
  storeName: string,
  records: VaultEncryptedRecord[]
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    for (const record of records) store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error(`Vault store write failed: ${storeName}`));
    tx.onabort = () => reject(tx.error || new Error(`Vault store transaction aborted: ${storeName}`));
  });
}

async function readStore(
  db: IDBDatabase,
  storeName: string
): Promise<VaultEncryptedRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve((request.result || []) as VaultEncryptedRecord[]);
    request.onerror = () => reject(request.error || new Error(`Vault store read failed: ${storeName}`));
  });
}

export async function writeVaultRecords(
  vaultKey: CryptoKey,
  voices: ClonedVoiceProfile[],
  clips: AudioClip[]
): Promise<void> {
  const [voiceRecords, clipRecords] = await Promise.all([
    Promise.all(
      voices.map(async (voice) => ({
        id: voice.id,
        encryptedPayload: await encryptJson(voice, vaultKey),
        updatedAt: voice.createdAt || Date.now(),
      }))
    ),
    Promise.all(
      clips.map(async (clip) => ({
        id: clip.id,
        encryptedPayload: await encryptJson({ ...clip, audioBlobUrl: '' }, vaultKey),
        updatedAt: clip.createdAt || Date.now(),
      }))
    ),
  ]);

  const db = await openVaultDatabase();
  try {
    await replaceStore(db, STORE_VOICES, voiceRecords);
    await replaceStore(db, STORE_AUDIO, clipRecords);
  } finally {
    db.close();
  }
}

export async function verifyVaultRecords(
  vaultKey: CryptoKey,
  expectedVoices: ClonedVoiceProfile[],
  expectedClips: AudioClip[]
): Promise<void> {
  const db = await openVaultDatabase();
  try {
    const [voiceRecords, clipRecords] = await Promise.all([
      readStore(db, STORE_VOICES),
      readStore(db, STORE_AUDIO),
    ]);

    if (voiceRecords.length !== expectedVoices.length) {
      throw new Error('Vault voice record count verification failed.');
    }
    if (clipRecords.length !== expectedClips.length) {
      throw new Error('Vault audio record count verification failed.');
    }

    const expectedVoiceIds = new Set(expectedVoices.map((voice) => voice.id));
    const expectedClipIds = new Set(expectedClips.map((clip) => clip.id));

    for (const record of voiceRecords) {
      if (!expectedVoiceIds.has(record.id)) {
        throw new Error(`Unexpected vault voice record: ${record.id}`);
      }
      const recovered = await decryptJson<ClonedVoiceProfile>(record.encryptedPayload, vaultKey);
      if (recovered.id !== record.id) {
        throw new Error(`Vault voice decrypt verification failed: ${record.id}`);
      }
    }

    for (const record of clipRecords) {
      if (!expectedClipIds.has(record.id)) {
        throw new Error(`Unexpected vault audio record: ${record.id}`);
      }
      const recovered = await decryptJson<AudioClip>(record.encryptedPayload, vaultKey);
      if (recovered.id !== record.id) {
        throw new Error(`Vault audio decrypt verification failed: ${record.id}`);
      }
    }
  } finally {
    db.close();
  }
}
