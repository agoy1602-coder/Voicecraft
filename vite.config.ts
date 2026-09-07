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

// The Pocket TTS worker currently asks ONNX Runtime Web to run full graph
// optimization while creating the Mimi encoder session. The deployed trace
// proves that the failure boundary is inside that session creation, after the
// model has been fetched and after ORT/thread isolation has been verified.
// Keep the model, execution provider, inference code, and all other sessions
// unchanged; only disable the expensive graph-optimization pass for this
// worker's session construction.
function pocketTtsSessionCompatibilityPlugin(): Plugin {
  return {
    name: 'voicecraft-pocket-tts-session-compatibility',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/pocket-tts-js/src/worker.js')) return null;
      const needle = 'graphOptimizationLevel: "all"';
      if (!code.includes(needle)) return null;
      return {
        code: code.replace(needle, 'graphOptimizationLevel: "disabled"'),
        map: null,
      };
    },
  };
}

export default defineConfig(() => {
  // GitHub Pages serves the app from /Voicecraft/, while the Vercel
  // frontend serves it from the domain root. Keep both deployments valid.
  const isVercel = process.env.VERCEL === '1';
  const base = isVercel ? '/' : '/Voicecraft/';
  const appPath = isVercel ? '' : '/Voicecraft';

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      pocketTtsSessionCompatibilityPlugin(),
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
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
