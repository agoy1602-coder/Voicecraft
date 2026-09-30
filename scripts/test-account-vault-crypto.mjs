import { strict as assert } from 'node:assert';
import { createVaultKey, unwrapVaultKey, verifyVaultKey, wrapVaultKey } from '../src/services/vaultKeyService.ts';

const recoverySecret = 'synthetic-recovery-secret-2026';
const wrongSecret = 'wrong-recovery-secret-2026';

const vaultKey = await createVaultKey();
await verifyVaultKey(vaultKey);

const wrapped = await wrapVaultKey(vaultKey, recoverySecret);
assert.equal(wrapped.keyVersion, 1);
assert.equal(wrapped.kdfIterations, 250000);
assert.ok(wrapped.wrappedVaultKey.length > 0);
assert.ok(wrapped.kdfSalt.length > 0);

const recovered = await unwrapVaultKey(wrapped, recoverySecret);
await verifyVaultKey(recovered);

const probe = new TextEncoder().encode('clonevoice-vault-round-trip');
const iv = crypto.getRandomValues(new Uint8Array(12));
const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, probe);
const decrypted = new Uint8Array(
  await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, recovered, encrypted)
);
assert.deepEqual(Array.from(decrypted), Array.from(probe));

await assert.rejects(
  () => unwrapVaultKey(wrapped, wrongSecret),
  /OperationError|decrypt|failed/i
);

console.log('ACCOUNT_VAULT_CRYPTO_TEST_PASS');
console.log(JSON.stringify({
  keyVersion: wrapped.keyVersion,
  kdfIterations: wrapped.kdfIterations,
  probeBytes: probe.length,
  wrongSecretRejected: true,
}));
