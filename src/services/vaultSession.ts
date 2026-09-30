import type { CryptoKey } from './vaultKeyService';

let activeVaultKey: CryptoKey | null = null;

export function setActiveVaultKey(vaultKey: CryptoKey): void {
  activeVaultKey = vaultKey;
}

export function getActiveVaultKey(): CryptoKey | null {
  return activeVaultKey;
}

export function requireActiveVaultKey(): CryptoKey {
  if (!activeVaultKey) {
    throw new Error('Vault is locked. Recover the vault before accessing account data.');
  }
  return activeVaultKey;
}

export function clearActiveVaultKey(): void {
  activeVaultKey = null;
}

export function hasActiveVaultKey(): boolean {
  return activeVaultKey !== null;
}
