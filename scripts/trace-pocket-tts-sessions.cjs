const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), 'node_modules', 'pocket-tts-js', 'src', 'worker.js');
if (!fs.existsSync(workerPath)) throw new Error(`[VoiceCraft] Pocket TTS worker not found: ${workerPath}`);

let source = fs.readFileSync(workerPath, 'utf8');
if (source.includes('// [VoiceCraft] session diagnostics v1')) {
  console.log('[VoiceCraft] Pocket TTS session diagnostics already installed');
  process.exit(0);
}

const marker = 'async function createSession(language, name, onProgress) {';
const start = source.indexOf(marker);
if (start < 0) throw new Error('[VoiceCraft] createSession() not found in Pocket TTS worker.');
const end = source.indexOf('\nasync function init(', start);
if (end < 0) throw new Error('[VoiceCraft] init() boundary not found in Pocket TTS worker.');

const replacement = `// [VoiceCraft] session diagnostics v1\nasync function createSession(language, name, onProgress) {\n    const bytes = await fetchWithProgress(modelUrl(language, stem(name)), name, onProgress);\n    post({ type: "status", status: \`session-create-start:\${name}\`, bytes: bytes.byteLength, at: Date.now() });\n    const startedAt = performance.now();\n    try {\n        const session = await ort.InferenceSession.create(bytes, {\n            executionProviders: ["wasm"],\n            graphOptimizationLevel: "all",\n        });\n        post({ type: "status", status: \`session-create-success:\${name}\`, elapsedMs: Math.round(performance.now() - startedAt), at: Date.now() });\n        return session;\n    } catch (error) {\n        post({\n            type: "status",\n            status: \`session-create-failure:\${name}\`,\n            elapsedMs: Math.round(performance.now() - startedAt),\n            error: {\n                name: error?.name,\n                message: error?.message,\n                stack: error?.stack,\n            },\n            at: Date.now(),\n        });\n        throw error;\n    }\n}\n`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(workerPath, source);
console.log('[VoiceCraft] installed Pocket TTS ONNX session diagnostics');
