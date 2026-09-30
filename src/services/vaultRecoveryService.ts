import { loadWrappedVaultKey } from './accountService';
import { unwrapVaultKey, verifyVaultKey } from './vaultKeyService';
import { setActiveVaultKey } from './vaultSession';

export async function recoverAccountVault(recoverySecret: string): Promise<void> {
  const record = await loadWrappedVaultKey();
  if (!record) {
    throw new Error('No account vault recovery record exists for this account.');
  }

  const vaultKey = await unwrapVaultKey(record, recoverySecret);
  await verifyVaultKey(vaultKey);
  setActiveVaultKey(vaultKey);
}
