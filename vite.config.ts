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

/**
 * Pocket TTS streams large ONNX files directly from Hugging Face. On mobile,
 * an otherwise valid HTTP response can lose its ReadableStream connection
 * after several MB. The upstream package currently turns that into a generic
 * "network error" with no retry, which makes Create Clone appear stuck.
 *
 * Patch the installed package at build time rather than maintaining a fork.
 * The patch resumes interrupted downloads with HTTP Range requests and only
 * stores the completed response in Cache Storage.
 */
function pocketTtsResumableDownloadPlugin(): Plugin {
  return {
    name: 'voicecraft-pocket-tts-resumable-download',
    configResolved() {
      const workerPath = path.resolve(__dirname, 'node_modules/pocket-tts-js/src/worker.js');
      if (!fs.existsSync(workerPath)) {
        throw new Error(`Pocket TTS worker not found: ${workerPath}`);
      }

      const source = fs.readFileSync(workerPath, 'utf8');
      if (source.includes('VoiceCraft resumable download patch')) return;

      const startMarker = 'async function fetchWithProgress(';
      const endMarker = '\nasync function loadOrt(';
      const start = source.indexOf(startMarker);
      const end = source.indexOf(endMarker, start);
      if (start < 0 || end < 0) {
        throw new Error('Unable to locate Pocket TTS fetchWithProgress() for the network retry patch.');
      }

      const replacement = `// VoiceCraft resumable download patch\nasync function fetchWithProgress(url, label, onProgress) {\n    const cache = await openCache();\n    if (cache) {\n        try {\n            const hit = await cache.match(url);\n            if (hit) return readBodyWithProgress(hit, label, onProgress, true);\n        } catch {\n            /* fall through to network */\n        }\n    }\n\n    const MAX_ATTEMPTS = 5;\n    const RETRY_DELAY_MS = 1000;\n    let received = 0;\n    let expectedTotal = 0;\n    const chunks = [];\n    let lastError = null;\n\n    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {\n        try {\n            const headers = received > 0 ? { Range: \`bytes=\${received}-\` } : undefined;\n            const res = await fetch(url, { cache: 'no-store', headers });\n            if (!res.ok) throw new Error(\`HTTP \${res.status}\`);\n\n            const contentRange = res.headers.get('content-range');\n            const contentLength = Number(res.headers.get('content-length')) || 0;\n\n            // A resume request must return 206. If the origin ignores Range,\n            // restart from byte zero instead of corrupting the model.\n            if (received > 0 && res.status !== 206) {\n                received = 0;\n                expectedTotal = contentLength;\n                chunks.length = 0;\n                const fresh = await fetch(url, { cache: 'no-store' });\n                if (!fresh.ok) throw new Error(\`HTTP \${fresh.status}\`);\n                const freshBytes = await readBodyWithProgress(fresh, label, onProgress, false);\n                if (cache) {\n                    try {\n                        await cache.put(url, new Response(freshBytes, { headers: { 'Content-Type': fresh.headers.get('content-type') || 'application/octet-stream' } }));\n                    } catch {}\n                }\n                return freshBytes;\n            }\n\n            if (res.status === 200 && received === 0) {\n                expectedTotal = contentLength;\n            } else if (res.status === 206 && contentRange) {\n                const match = contentRange.match(/bytes\\s+\\d+-(\\d+)\\/(\\d+)/i);\n                if (match) expectedTotal = Number(match[2]);\n            }\n\n            if (!res.body) throw new Error('Response body unavailable');\n            const reader = res.body.getReader();\n            let attemptLoaded = 0;\n            for (;;) {\n                const { done, value } = await reader.read();\n                if (done) break;\n                chunks.push(value);\n                received += value.byteLength;\n                attemptLoaded += value.byteLength;\n                onProgress?.({ label, loaded: received, total: expectedTotal || received, fromCache: false });\n            }\n\n            if (!expectedTotal || received >= expectedTotal) {\n                const out = new Uint8Array(received);\n                let offset = 0;\n                for (const chunk of chunks) {\n                    out.set(chunk, offset);\n                    offset += chunk.byteLength;\n                }\n                if (cache) {\n                    try {\n                        await cache.put(url, new Response(out, { headers: { 'Content-Type': res.headers.get('content-type') || 'application/octet-stream', 'Content-Length': String(out.byteLength) } }));\n                    } catch {\n                        /* quota exceeded or storage unavailable — proceed */\n                    }\n                }\n                return out;\n            }\n\n            throw new Error(\`Connection ended early after \${attemptLoaded} bytes\`);\n        } catch (error) {\n            lastError = error;\n            if (attempt === MAX_ATTEMPTS) break;\n            onProgress?.({ label: \`Retrying \${label} download (attempt \${attempt + 1}/\${MAX_ATTEMPTS})…\` });\n            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));\n        }\n    }\n\n    throw new Error(\`Network download failed for \${label} after \${MAX_ATTEMPTS} attempts: \${lastError instanceof Error ? lastError.message : String(lastError)}\`);\n}\n`;

      fs.writeFileSync(workerPath, source.slice(0, start) + replacement + source.slice(end), 'utf8');
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
      pocketTtsResumableDownloadPlugin(),
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
