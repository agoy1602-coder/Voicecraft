const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), 'node_modules', 'pocket-tts-js', 'src', 'worker.js');
if (!fs.existsSync(workerPath)) throw new Error(`[VoiceCraft] Pocket TTS worker not found: ${workerPath}`);

let source = fs.readFileSync(workerPath, 'utf8');
if (source.includes('// [VoiceCraft] cache diagnostics v1')) {
  console.log('[VoiceCraft] Pocket TTS cache diagnostics already installed');
  process.exit(0);
}

const marker = '// [VoiceCraft] cache diagnostics v1';
const openMarker = 'async function openCache() {';
const openIndex = source.indexOf(openMarker);
if (openIndex < 0) throw new Error('[VoiceCraft] openCache() not found in Pocket TTS worker.');

const fetchMarker = 'async function fetchWithProgress(url, label, onProgress) {';
const fetchIndex = source.indexOf(fetchMarker);
if (fetchIndex < 0) throw new Error('[VoiceCraft] fetchWithProgress() not found in Pocket TTS worker.');

const diagnosticOpen = `${marker}\nasync function __vcDiagnosticOpenCache() {\n    if (!config?.cache) { console.warn('[VoiceCraft][PocketTTS] cache disabled'); return null; }\n    try {\n        if (typeof caches === 'undefined') { console.error('[VoiceCraft][PocketTTS] Cache Storage unavailable in worker'); return null; }\n        const name = config.cacheName || CACHE_NAME;\n        const cache = await caches.open(name);\n        console.log('[VoiceCraft][PocketTTS] cache opened:', name);\n        return cache;\n    } catch (error) {\n        console.error('[VoiceCraft][PocketTTS] cache open FAILED:', error);\n        return null;\n    }\n}\n\n`;

source = source.slice(0, openIndex) + diagnosticOpen + source.slice(openIndex);
source = source.replace(
  'const cache = await openCache();',
  "const cache = await __vcDiagnosticOpenCache();"
);

// Make cache persistence failures observable without changing control flow.
source = source.replace(
  'try { await cache.put(url, forCache); } catch {}',
  "try { await cache.put(url, forCache); console.log('[VoiceCraft][PocketTTS] cached asset:', url); } catch (error) { console.error('[VoiceCraft][PocketTTS] cache.put FAILED:', url, error); }"
);
source = source.replace(
  'try { await cache.put(url, new Response(result.buffer, { status: 200 })); } catch {}',
  "try { await cache.put(url, new Response(result.buffer, { status: 200 })); console.log('[VoiceCraft][PocketTTS] cached full-file fallback:', url); } catch (error) { console.error('[VoiceCraft][PocketTTS] full-file cache.put FAILED:', url, error); }"
);

fs.writeFileSync(workerPath, source);
console.log('[VoiceCraft] installed Pocket TTS cache diagnostics v1');
