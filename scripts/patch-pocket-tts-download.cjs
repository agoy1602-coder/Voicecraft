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

// v5 fix: a large whole-file Cache.put() can fail on Android even after the
// complete response was downloaded. v4 then deleted its successful 2 MiB
// range entries, leaving the asset unavailable after an offline refresh.
// Keep those ranges and reconstruct the file from them on the next load.
const rangeRestore = `
async function __vcPocketV5ReadCompleteFromRanges(cache, url, label, onProgress) {
    if (!cache) return null;
    try {
        const prefix = \`\${self.location.origin}\${__VC_POCKET_V4_RANGE_CACHE_PREFIX}?url=\${encodeURIComponent(url)}&\`;
        const keys = await cache.keys();
        const ranges = keys.map((request) => {
            if (!request.url.startsWith(prefix)) return null;
            const parsed = new URL(request.url);
            const start = Number(parsed.searchParams.get('start'));
            const end = Number(parsed.searchParams.get('end'));
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) return null;
            return { request, start, end };
        }).filter(Boolean).sort((a, b) => a.start - b.start);
        if (!ranges.length || ranges[0].start !== 0) return null;
        let next = 0;
        let total = 0;
        const parts = [];
        for (const range of ranges) {
            if (range.start !== next) return null;
            const response = await cache.match(range.request);
            if (!response) return null;
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.byteLength !== range.end - range.start + 1) return null;
            parts.push(bytes);
            next = range.end + 1;
            total += bytes.byteLength;
        }
        if (!total) return null;
        const assembled = new Uint8Array(total);
        let offset = 0;
        for (const part of parts) { assembled.set(part, offset); offset += part.byteLength; }
        onProgress?.({ label, loaded: total, total, fromCache: true });
        return assembled;
    } catch { return null; }
}

async function __vcPocketV5PersistWholeFile(cache, url, bytes) {
    if (!cache) return false;
    try {
        await cache.put(url, new Response(bytes, {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.byteLength) }
        }));
        return true;
    } catch (error) {
        console.warn('[VoiceCraft] Pocket TTS whole-file cache failed; retaining range cache:', url, error);
        return false;
    }
}
`;

const fetchStart = source.indexOf('async function fetchWithProgress(');
const fetchEnd = source.indexOf('\nasync function loadOrt(', fetchStart);
if (fetchStart < 0 || fetchEnd < 0) throw new Error('[VoiceCraft] v5 fetchWithProgress patch target not found.');

const v5Fetch = `async function fetchWithProgress(url, label, onProgress) {
    const cache = await openCache();
    if (cache) {
        try {
            const hit = await cache.match(url);
            if (hit) return readBodyWithProgress(hit, label, onProgress, true);
        } catch {}
        const ranged = await __vcPocketV5ReadCompleteFromRanges(cache, url, label, onProgress);
        if (ranged) return ranged;
    }
    let total = 0;
    try {
        const head = await __vcPocketV4Request(url, { method: 'HEAD', cache: 'no-store' });
        total = Number(head.headers.get('content-length')) || 0;
    } catch {}
    if (!total) {
        const response = await __vcPocketV4Request(url, { cache: 'no-store' });
        const bytes = await readBodyWithProgress(response, label, onProgress, false);
        await __vcPocketV5PersistWholeFile(cache, url, bytes);
        return bytes;
    }
    const parts = [];
    let completed = 0;
    for (let start = 0; start < total; start += __VC_POCKET_V4_RANGE_SIZE) {
        const end = Math.min(total - 1, start + __VC_POCKET_V4_RANGE_SIZE - 1);
        const result = await __vcPocketV4ReadRange(url, start, end, label, total, onProgress, completed, cache);
        if (result.wholeFile) {
            await __vcPocketV5PersistWholeFile(cache, url, result.buffer);
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
    const persisted = await __vcPocketV5PersistWholeFile(cache, url, bytes);
    if (persisted) await __vcPocketV4DeleteRangeCache(cache, url);
    // When persisted=false the range cache is deliberately retained for offline reload.
    return bytes;
}`;

source = source.slice(0, fetchStart) + rangeRestore + '\n' + v5Fetch + source.slice(fetchEnd);
source = source.replace('// [VoiceCraft] resumable model downloader v4', '// [VoiceCraft] resumable model downloader v5');

fs.writeFileSync(workerPath, source);
console.log('[VoiceCraft] installed Pocket TTS resumable model downloader v5');
