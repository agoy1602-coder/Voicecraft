const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourceDir = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
const targetDir = path.join(root, 'public', 'onnxruntime');

const files = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];

for (const file of files) {
  const source = path.join(sourceDir, file);
  const target = path.join(targetDir, file);
  if (!fs.existsSync(source)) {
    throw new Error(`[VoiceCraft] ONNX Runtime asset not found: ${source}`);
  }
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(source, target);
  const size = fs.statSync(target).size;
  console.log(`[VoiceCraft] bundled ONNX Runtime ${file}: ${(size / 1024 / 1024).toFixed(1)} MB`);
}

console.log('[VoiceCraft] ONNX Runtime WASM + MJS runtime assets bundled locally.');
