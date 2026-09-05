const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), 'node_modules', 'pocket-tts-js', 'src', 'worker.js');
if (!fs.existsSync(workerPath)) throw new Error(`[VoiceCraft] Pocket TTS worker not found: ${workerPath}`);

let source = fs.readFileSync(workerPath, 'utf8');
const marker = '/* [VoiceCraft] bundled ONNX Runtime Web v1 */';
if (!source.includes(marker)) {
  source = `${marker}\nimport * as __VC_ORT_MODULE from "onnxruntime-web/wasm";\n${source}`;
}

const start = source.indexOf('async function loadOrt()');
const end = source.indexOf('\nasync function createSession', start);
if (start < 0 || end < 0) throw new Error('[VoiceCraft] Unsupported Pocket TTS worker layout: loadOrt block not found.');

const replacement = `async function loadOrt() {
    if (ort) return;
    post({ type: "status", status: "loading-runtime" });

    // [VoiceCraft] v8: keep the ORT JS loader and matching WASM binary
    // same-origin. ONNX Runtime dynamically imports the .mjs runtime; if its
    // path is not overridden it resolves relative to the Vite worker chunk
    // (/assets), which caused the production "Failed to fetch dynamically
    // imported module" failure.
    ort = __VC_ORT_MODULE.default || __VC_ORT_MODULE;
    const runtimeBase = new URL('/onnxruntime/', self.location.origin).href;
    const wasmUrl = new URL('ort-wasm-simd-threaded.wasm', runtimeBase).href;
    const mjsUrl = new URL('ort-wasm-simd-threaded.mjs', runtimeBase).href;
    const wasmBytes = await fetchWithProgress(
        wasmUrl,
        'onnxruntime-wasm',
        (p) => post({ type: 'progress', ...p })
    );
    ort.env.wasm.wasmBinary = wasmBytes.buffer;
    ort.env.wasm.wasmPaths = {
        'ort-wasm-simd-threaded.mjs': mjsUrl,
        'ort-wasm-simd-threaded.wasm': wasmUrl,
    };
    ort.env.wasm.simd = true;
    ort.env.wasm.numThreads = self.crossOriginIsolated
        ? Math.min(navigator.hardwareConcurrency || 4, config.maxThreads || 8)
        : 1;
    precomputeFlowBuffers();
}`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(workerPath, source);
console.log('[VoiceCraft] installed Pocket TTS local ONNX Runtime v8');
