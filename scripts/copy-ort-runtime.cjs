const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const sourceDir = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
const targetDir = path.join(root, 'public', 'ort');

const files = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
];

fs.mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const source = path.join(sourceDir, file);
  const target = path.join(targetDir, file);
  if (!fs.existsSync(source)) {
    throw new Error(`[ORT-PACKAGE] Missing ${source}`);
  }
  fs.copyFileSync(source, target);
  console.log(`[ORT-PACKAGE] Copied ${file} -> public/ort/${file}`);
}

console.log('[ORT-PACKAGE] Local ONNX Runtime WASM assets ready.');
