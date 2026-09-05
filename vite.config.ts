import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

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
  const appPath = isVercel ? '' : '/Voicecraft';

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      offlineOrtRuntimePlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['manifest.webmanifest'],
        manifest: {
          name: 'VoiceCraft AI',
          short_name: 'VoiceCraft',
          description: 'Neural text-to-speech and local voice cloning studio with offline synthesis.',
          start_url: `${appPath || ''}/`,
          scope: `${appPath || ''}/`,
          display: 'standalone',
          background_color: '#020617',
          theme_color: '#7c3aed',
        },
        workbox: {
          navigateFallback: `${appPath}/index.html`,
          globPatterns: ['**/*.{js,css,html,mjs,wasm,svg,ico,png,webp}'],
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
          mode: 'development',
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/huggingface\.co\/vlapky\/pocket-tts-onnx\/resolve\/main\/onnx\/english_2026-04\/.*$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'voicecraft-pocket-tts-offline-v1',
                cacheableResponse: {statuses: [200]},
              },
            },
            {
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@1\.20\.0\/dist\/.*$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'voicecraft-ort-offline-v1',
                cacheableResponse: {statuses: [200]},
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
