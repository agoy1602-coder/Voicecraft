const fs = require('fs');
const path = require('path');

const root = process.cwd();
const source = path.join(root, 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.wasm');
const targetDir = path.join(root, 'public', 'onnxruntime');
const target = path.join(targetDir, 'ort-wasm-simd-threaded.wasm');

if (!fs.existsSync(source)) {
  throw new Error(`[VoiceCraft] ONNX Runtime WASM not found: ${source}`);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
const size = fs.statSync(target).size;
console.log(`[VoiceCraft] bundled ONNX Runtime WASM locally: ${(size / 1024 / 1024).toFixed(1)} MB`);
