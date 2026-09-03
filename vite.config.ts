import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

const OFFLINE_ORT_FILES = [
  'ort.min.mjs',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
] as const;

function offlineOrtRuntimePlugin(): Plugin {
  return {
    name: 'voicecraft-offline-ort-runtime',
    generateBundle() {
      const runtimeDir = path.resolve(__dirname, 'node_modules/onnxruntime-web/dist');
      for (const fileName of OFFLINE_ORT_FILES) {
        const sourcePath = path.join(runtimeDir, fileName);
        if (!fs.existsSync(sourcePath)) {
          throw new Error(`Missing ONNX Runtime Web asset: ${sourcePath}`);
        }
        this.emitFile({
          type: 'asset',
          fileName: `ort/${fileName}`,
          source: fs.readFileSync(sourcePath),
        });
      }
    },
  };
}

export default defineConfig(() => {
  const isVercel = process.env.VERCEL === '1';
  const base = isVercel ? '/' : '/Voicecraft/';

  return {
    base,
    plugins: [react(), tailwindcss(), offlineOrtRuntimePlugin()],
    resolve: {
      alias: {'@': path.resolve(__dirname, '.')},
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});