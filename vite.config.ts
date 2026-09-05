import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

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
          runtimeCaching: [
            {
              urlPattern: /\/assets\/worker-[^/]+\.js$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'voicecraft-pocket-workers-v1',
                cacheableResponse: { statuses: [0, 200] },
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: /\/assets\/.+\.(?:js|mjs)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'voicecraft-offline-js-v1',
                cacheableResponse: { statuses: [0, 200] },
                expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // Pocket TTS worker resolves its local ORT runtime under
              // /onnxruntime/. Keep Workbox on the exact same path.
              urlPattern: /\/onnxruntime\/.+\.(?:mjs|wasm)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'voicecraft-offline-ort-v1',
                cacheableResponse: { statuses: [0, 200] },
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
