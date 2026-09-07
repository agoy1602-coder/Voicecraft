const fs = require('node:fs');
const path = require('node:path');

const workerPath = path.join(process.cwd(), 'node_modules', 'pocket-tts-js', 'src', 'worker.js');
if (!fs.existsSync(workerPath)) {
  throw new Error(`[VoiceCraft] Pocket TTS worker not found: ${workerPath}`);
}

let source = fs.readFileSync(workerPath, 'utf8');

const needle = `async function createSession(language, name, onProgress) {\n    const bytes = await fetchWithProgress(modelUrl(language, stem(name)), name, onProgress);\n    return ort.InferenceSession.create(bytes, {\n        executionProviders: ["wasm"],\n        graphOptimizationLevel: "all",\n    });\n}`;

const replacement = `async function createSession(language, name, onProgress) {\n    const bytes = await fetchWithProgress(modelUrl(language, stem(name)), name, onProgress);\n    // mimi_encoder session creation is the confirmed initialization bottleneck.\n    // Keep full optimization for the generation models; only the voice encoder\n    // uses basic optimization so session compilation does not stall startup.\n    const graphOptimizationLevel = name === "mimi_encoder" ? "basic" : "all";\n    return ort.InferenceSession.create(bytes, {\n        executionProviders: ["wasm"],\n        graphOptimizationLevel,\n    });\n}`;

if (source.includes(replacement)) {
  console.log('[VoiceCraft] Pocket TTS mimi_encoder session patch already present.');
  process.exit(0);
}

if (!source.includes(needle)) {
  throw new Error('[VoiceCraft] Unsupported pocket-tts-js worker layout: createSession block not found.');
}

source = source.replace(needle, replacement);
fs.writeFileSync(workerPath, source);
console.log('[VoiceCraft] Patched Pocket TTS mimi_encoder session optimization: all -> basic.');
