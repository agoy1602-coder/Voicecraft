const VAULT_KEY_VERSION = 1;
const KDF_ITERATIONS = 250000;
const VAULT_KEY_BYTES = 32;
const KDF_SALT_BYTES = 16;
const WRAP_IV_BYTES = 12;

export interface WrappedVaultKey {
  wrappedVaultKey: string;
  kdfSalt: string;
  kdfIterations: number;
  keyVersion: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function deriveRecoveryWrappingKey(
  recoverySecret: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(recoverySecret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function createVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function wrapVaultKey(
  vaultKey: CryptoKey,
  recoverySecret: string
): Promise<WrappedVaultKey> {
  if (!recoverySecret || recoverySecret.length < 12) {
    throw new Error('Vault recovery secret must contain at least 12 characters.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(KDF_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(WRAP_IV_BYTES));
  const wrappingKey = await deriveRecoveryWrappingKey(recoverySecret, salt, KDF_ITERATIONS);
  const rawVaultKey = new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, rawVaultKey)
  );

  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv, 0);
  packed.set(ciphertext, iv.length);

  return {
    wrappedVaultKey: bytesToBase64(packed),
    kdfSalt: bytesToBase64(salt),
    kdfIterations: KDF_ITERATIONS,
    keyVersion: VAULT_KEY_VERSION,
  };
}

export async function unwrapVaultKey(
  record: WrappedVaultKey,
  recoverySecret: string
): Promise<CryptoKey> {
  if (!recoverySecret) {
    throw new Error('Vault recovery secret is required.');
  }
  if (record.keyVersion !== VAULT_KEY_VERSION) {
    throw new Error(`Unsupported vault key version: ${record.keyVersion}`);
  }

  const packed = base64ToBytes(record.wrappedVaultKey);
  const iv = packed.slice(0, WRAP_IV_BYTES);
  const ciphertext = packed.slice(WRAP_IV_BYTES);
  const salt = base64ToBytes(record.kdfSalt);
  const wrappingKey = await deriveRecoveryWrappingKey(
    recoverySecret,
    salt,
    record.kdfIterations
  );

  const rawVaultKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    ciphertext
  );

  if (rawVaultKey.byteLength !== VAULT_KEY_BYTES) {
    throw new Error('Recovered vault key has an invalid length.');
  }

  return crypto.subtle.importKey(
    'raw',
    rawVaultKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function verifyVaultKey(vaultKey: CryptoKey): Promise<void> {
  const probe = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, probe);
  const recovered = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, vaultKey, encrypted)
  );

  if (recovered.length !== probe.length || recovered.some((value, index) => value !== probe[index])) {
    throw new Error('Vault key verification failed.');
  }
}
