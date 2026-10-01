import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const syncPath = path.join(repoRoot, 'src/services/accountVaultSyncService.ts');
const source = fs.readFileSync(syncPath, 'utf8');

assert.equal(
  source.includes('.slice(0, 5)'),
  false,
  'Account Vault sync must not truncate merged clips to five records.'
);

const localClips = Array.from({ length: 6 }, (_, index) => ({
  id: `local-${index + 1}`,
  createdAt: 1000 + index,
}));

const pulledClips = Array.from({ length: 2 }, (_, index) => ({
  id: `server-${index + 1}`,
  createdAt: 2000 + index,
}));

const clipMap = new Map();
for (const clip of localClips) clipMap.set(clip.id, clip);
for (const clip of pulledClips) {
  const local = clipMap.get(clip.id);
  if (!local || (clip.createdAt || 0) > (local.createdAt || 0)) {
    clipMap.set(clip.id, clip);
  }
}

const mergedClips = Array.from(clipMap.values()).sort(
  (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
);

assert.equal(mergedClips.length, 8, 'Merge path must preserve all local and server clips.');
assert.deepEqual(
  mergedClips.map((clip) => clip.id),
  ['server-2', 'server-1', 'local-6', 'local-5', 'local-4', 'local-3', 'local-2', 'local-1'],
  'Merged clips must remain complete and sorted newest-first.'
);

console.log('PASS: Account Vault clip preservation regression (8/8 clips retained).');
