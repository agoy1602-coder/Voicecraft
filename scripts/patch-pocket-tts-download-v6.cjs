const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), 'node_modules', 'pocket-tts-js', 'src', 'worker.js');
if (!fs.existsSync(workerPath)) throw new Error(`[VoiceCraft] Pocket TTS worker not found: ${workerPath}`);

let source = fs.readFileSync(workerPath, 'utf8');
const start = source.indexOf('async function fetchWithProgress(');
const end = source.indexOf('\nasync function loadOrt(', start);
if (start < 0 || end < 0) throw new Error('[VoiceCraft] Unsupported pocket-tts-js worker layout: fetchWithProgress block not found.');

const replacement = String.raw`// [VoiceCraft] offline persistence downloader v6
const __VC_POCKET_V6_DB = 'voicecraft-pocket-tts-v6';
const __VC_POCKET_V6_STORE = 'assets';

function __vcPocketV6OpenDb() {
    return new Promise((resolve, reject) => {
        try {
            const request = indexedDB.open(__VC_POCKET_V6_DB, 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(__VC_POCKET_V6_STORE)) request.result.createObjectStore(__VC_POCKET_V6_STORE);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
        } catch (e) { reject(e); }
    });
}

async function __vcPocketV6Get(url) {
    try {
        const db = await __vcPocketV6OpenDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(__VC_POCKET_V6_STORE, 'readonly');
            const req = tx.objectStore(__VC_POCKET_V6_STORE).get(url);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
            tx.oncomplete = () => db.close();
            tx.onerror = () => reject(tx.error);
        });
    } catch { return null; }
}

async function __vcPocketV6Put(url, bytes) {
    try {
        const db = await __vcPocketV6OpenDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(__VC_POCKET_V6_STORE, 'readwrite');
            tx.objectStore(__VC_POCKET_V6_STORE).put(bytes.buffer, url);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        });
        db.close();
        return true;
    } catch (e) {
        console.warn('[VoiceCraft] Pocket TTS IndexedDB persistence failed:', url, e);
        return false;
    }
}

async function fetchWithProgress(url, label, onProgress) {
    const cache = await openCache();
    if (cache) {
        try {
            const hit = await cache.match(url);
            if (hit) return readBodyWithProgress(hit, label, onProgress, true);
        } catch {}
    }

    const idbHit = await __vcPocketV6Get(url);
    if (idbHit) {
        const bytes = new Uint8Array(idbHit);
        onProgress?.({ label, loaded: bytes.byteLength, total: bytes.byteLength, fromCache: true });
        console.log('[VoiceCraft] Pocket TTS asset restored from IndexedDB:', label, bytes.byteLength);
        return bytes;
    }

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const bytes = await readBodyWithProgress(response, label, onProgress, false);

    const persisted = await __vcPocketV6Put(url, bytes);
    if (persisted) console.log('[VoiceCraft] Pocket TTS asset persisted in IndexedDB:', label, bytes.byteLength);

    if (cache) {
        try {
            await cache.put(url, new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.byteLength) } }));
        } catch (e) {
            console.warn('[VoiceCraft] Pocket TTS Cache Storage persistence failed; IndexedDB remains authoritative:', label, e);
        }
    }
    return bytes;
}`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(workerPath, source);
console.log('[VoiceCraft] installed Pocket TTS offline persistence downloader v6');
