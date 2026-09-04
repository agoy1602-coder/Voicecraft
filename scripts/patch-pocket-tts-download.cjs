const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), 'node_modules', 'pocket-tts-js', 'src', 'worker.js');
if (!fs.existsSync(workerPath)) throw new Error(`[VoiceCraft] Pocket TTS worker not found: ${workerPath}`);

let source = fs.readFileSync(workerPath, 'utf8');
const marker = '// [VoiceCraft] resumable model downloader v4';
const markerStart = source.indexOf(marker);
const start = markerStart >= 0 ? markerStart : source.indexOf('async function fetchWithProgress(');
const end = source.indexOf('\nasync function loadOrt(', start);
if (start < 0 || end < 0) throw new Error('[VoiceCraft] Unsupported pocket-tts-js worker layout: fetchWithProgress block not found.');

const replacement = `// [VoiceCraft] resumable model downloader v4
const __VC_POCKET_V4_RANGE_SIZE = 2 * 1024 * 1024;
const __VC_POCKET_V4_MAX_ATTEMPTS = 6;
const __VC_POCKET_V4_FETCH_TIMEOUT_MS = 30000;
const __VC_POCKET_V4_RANGE_CACHE_PREFIX = '/__voicecraft_pocket_range_cache_v4__';

function __vcPocketV4Sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function __vcPocketV4Fetch(url, options = {}, timeoutMs = __VC_POCKET_V4_FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { ...options, signal: controller.signal }); }
    finally { clearTimeout(timer); }
}

async function __vcPocketV4Request(url, options = {}, attempt = 1) {
    try {
        const response = await __vcPocketV4Fetch(url, options);
        if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
        return response;
    } catch (error) {
        if (attempt >= __VC_POCKET_V4_MAX_ATTEMPTS) throw error;
        await __vcPocketV4Sleep(Math.min(10000, 500 * 2 ** (attempt - 1)));
        return __vcPocketV4Request(url, options, attempt + 1);
    }
}

function __vcPocketV4RangeKey(url, start, end) {
    const encoded = encodeURIComponent(url);
    return new Request(\`\${self.location.origin}\${__VC_POCKET_V4_RANGE_CACHE_PREFIX}?url=\${encoded}&start=\${start}&end=\${end}\`);
}

async function __vcPocketV4ReadCachedRange(cache, url, start, end, label, total, onProgress, completedBefore) {
    if (!cache) return null;
    try {
        const hit = await cache.match(__vcPocketV4RangeKey(url, start, end));
        if (!hit) return null;
        const buffer = new Uint8Array(await hit.arrayBuffer());
        const expected = end - start + 1;
        if (buffer.byteLength !== expected) { await cache.delete(__vcPocketV4RangeKey(url, start, end)); return null; }
        onProgress?.({ label, loaded: Math.min(completedBefore + buffer.byteLength, total), total, fromCache: true });
        return buffer;
    } catch { return null; }
}

async function __vcPocketV4ReadRange(url, start, end, label, total, onProgress, completedBefore, cache) {
    const cached = await __vcPocketV4ReadCachedRange(cache, url, start, end, label, total, onProgress, completedBefore);
    if (cached) return { buffer: cached, wholeFile: false };
    let lastError = null;
    for (let attempt = 1; attempt <= __VC_POCKET_V4_MAX_ATTEMPTS; attempt++) {
        try {
            const response = await __vcPocketV4Fetch(url, { headers: { Range: \`bytes=\${start}-\${end}\` }, cache: 'no-store' });
            const expected = end - start + 1;
            const isWholeFileFallback = start === 0 && response.status === 200;
            if (response.status !== 206 && !isWholeFileFallback) throw new Error(\`Range request returned HTTP \${response.status}\`);
            const buffer = new Uint8Array(await response.arrayBuffer());
            if (isWholeFileFallback) {
                if (buffer.byteLength !== total) throw new Error(\`Full-file fallback returned \${buffer.byteLength} of \${total} bytes\`);
            } else if (buffer.byteLength !== expected) throw new Error(\`Incomplete range: received \${buffer.byteLength} of \${expected} bytes\`);
            if (!isWholeFileFallback && cache) {
                try { await cache.put(__vcPocketV4RangeKey(url, start, end), new Response(buffer, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(buffer.byteLength) } })); } catch {}
            }
            onProgress?.({ label, loaded: Math.min(completedBefore + buffer.byteLength, total), total, fromCache: false });
            return { buffer, wholeFile: isWholeFileFallback };
        } catch (error) {
            lastError = error;
            if (attempt < __VC_POCKET_V4_MAX_ATTEMPTS) {
                onProgress?.({ label, loaded: completedBefore, total, fromCache: false });
                await __vcPocketV4Sleep(Math.min(10000, 500 * 2 ** (attempt - 1)));
            }
        }
    }
    throw new Error(\`Network error while downloading \${label} at byte \${start}-\${end}: \${lastError?.message || lastError}\`);
}

async function __vcPocketV4DeleteRangeCache(cache, url) {
    if (!cache) return;
    try {
        const keys = await cache.keys();
        const prefix = \`\${self.location.origin}\${__VC_POCKET_V4_RANGE_CACHE_PREFIX}?url=\${encodeURIComponent(url)}&\`;
        await Promise.all(keys.filter((request) => request.url.startsWith(prefix)).map((request) => cache.delete(request)));
    } catch {}
}

async function fetchWithProgress(url, label, onProgress) {
    const cache = await openCache();
    if (cache) {
        try { const hit = await cache.match(url); if (hit) return readBodyWithProgress(hit, label, onProgress, true); } catch {}
    }
    let total = 0;
    try {
        const head = await __vcPocketV4Request(url, { method: 'HEAD', cache: 'no-store' });
        total = Number(head.headers.get('content-length')) || 0;
    } catch {}
    if (!total) {
        const response = await __vcPocketV4Request(url, { cache: 'no-store' });
        const forCache = cache ? response.clone() : null;
        const bytes = await readBodyWithProgress(response, label, onProgress, false);
        if (cache && forCache) { try { await cache.put(url, forCache); } catch {} }
        return bytes;
    }
    const parts = [];
    let completed = 0;
    for (let start = 0; start < total; start += __VC_POCKET_V4_RANGE_SIZE) {
        const end = Math.min(total - 1, start + __VC_POCKET_V4_RANGE_SIZE - 1);
        const result = await __vcPocketV4ReadRange(url, start, end, label, total, onProgress, completed, cache);
        if (result.wholeFile) {
            if (cache) { try { await cache.put(url, new Response(result.buffer, { status: 200 })); } catch {} }
            return result.buffer;
        }
        parts.push(result.buffer);
        completed += result.buffer.byteLength;
    }
    if (completed !== total) throw new Error(\`Network error: \${label} completed at \${completed}/\${total} bytes\`);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    if (offset !== total) throw new Error(\`Network error: \${label} assembled at \${offset}/\${total} bytes\`);
    if (cache) {
        try { await cache.put(url, new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(total) } })); } catch {}
        await __vcPocketV4DeleteRangeCache(cache, url);
    }
    return bytes;
}`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(workerPath, source);
console.log('[VoiceCraft] installed Pocket TTS resumable model downloader v4');
