const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'services', 'pocketTtsBridge.ts');
if (!fs.existsSync(filePath)) throw new Error(`[VoiceCraft] Diagnostic bridge not found: ${filePath}`);

let source = fs.readFileSync(filePath, 'utf8');
if (source.includes('// [VoiceCraft] diagnostic status handling v1')) {
  console.log('[VoiceCraft] Pocket TTS diagnostic status handling already installed');
  process.exit(0);
}

const startMarker = '    let lastProgressPersisted = 0;\n    let lastProgressLabel = \'\';\n    await instance.load((progress: any) => {';
const start = source.indexOf(startMarker);
const endMarker = '\n    });\n\n    engine = instance;';
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('[VoiceCraft] diagnostic progress callback block not found.');

const replacement = `    // [VoiceCraft] diagnostic status handling v1\n    let lastProgressPersisted = 0;\n    let lastProgressLabel = '';\n    await instance.load((progress: any) => {\n      const workerStatus = typeof progress?.status === 'string' ? progress.status : '';\n      if (workerStatus) {\n        const workerError = progress?.error && typeof progress.error === 'object' ? progress.error : undefined;\n        diagnosticPatch({\n          phase: \`worker:\${workerStatus}\`,\n          completedAt: /success|failure/.test(workerStatus) ? Date.now() : undefined,\n          error: workerError,\n        });\n        return;\n      }\n\n      const label = String(progress?.label || 'progress');\n      const loaded = Number(progress?.loaded || 0);\n      const total = Number(progress?.total || 0);\n      const labelChanged = label !== lastProgressLabel;\n      const completed = total > 0 && loaded >= total;\n      const crossedCheckpoint = loaded - lastProgressPersisted >= 1024 * 1024;\n      if (!labelChanged && !completed && !crossedCheckpoint) return;\n\n      const target = globalThis as any;\n      const list = Array.isArray(target.__VC_POCKET_DIAGNOSTIC__?.loadProgress)\n        ? target.__VC_POCKET_DIAGNOSTIC__.loadProgress\n        : [];\n      const entry = { label, loaded, total, fromCache: progress?.fromCache };\n      diagnosticPatch({\n        phase: \`engine-load:\${label}\`,\n        loadProgress: [...list, entry].slice(-12),\n      });\n      lastProgressPersisted = loaded;\n      lastProgressLabel = label;\n    });`;

source = source.slice(0, start) + replacement + source.slice(end + 6);
fs.writeFileSync(filePath, source);
console.log('[VoiceCraft] installed Pocket TTS diagnostic worker-status handling');
