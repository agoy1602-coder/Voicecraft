const fs = require('fs');
const path = require('path');

const workerPath = path.join(process.cwd(), 'node_modules', 'pocket-tts-js', 'src', 'worker.js');

if (!fs.existsSync(workerPath)) {
  throw new Error(`[VoiceCraft] Pocket TTS worker not found: ${workerPath}`);
}

let source = fs.readFileSync(workerPath, 'utf8');

const marker = '// [VoiceCraft] resumable model downloader v3';
const markerStart = source.indexOf(marker);
const start = markerStart >= 0 ? markerStart : source.indexOf('async function fetchWithProgress(');
const end = source.indexOf('\nasync function loadOrt(', start);

if (start < 0 || end < 0) {
  throw new Error('[VoiceCraft] Unsupported pocket-tts-js worker layout: fetchWithProgress block not found.');
}

const replacement = `// [VoiceCraft] resumable model downloader v3
// Persist each completed byte range so a refresh/network interruption resumes
// instead of restarting a 100+ MB Pocket TTS bundle from byte zero. Every
// network operation has a finite timeout, so a stalled connection cannot leave
// Create Clone waiting forever. The complete asset is still stored under the
// normal Pocket TTS cache key once every range is present.
const VC_RANGE_SIZE = 2 * 1024 * 1024;
const VC_MAX_ATTEMPTS = 6;
const VC_FETCH_TIMEOUT_MS = 30000;
const VC_RANGE_CACHE_PREFIX = '/__voicecraft_pocket_range_cache__';

function vcSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function vcFetch(url, options = {}, timeoutMs = VC_FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function vcRequest(url, options = {}, attempt = 1) {
    try {
        const response = await vcFetch(url, options);
        if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
        return response;
    } catch (error) {
        if (attempt >= VC_MAX_ATTEMPTS) throw error;
        await vcSleep(Math.min(10000, 500 * 2 ** (attempt - 1)));
        return vcRequest(url, options, attempt + 1);
    }
}

function vcRangeKey(url, start, end) {
    const encoded = encodeURIComponent(url);
    return new Request(\`\${self.location.origin}\${VC_RANGE_CACHE_PREFIX}?url=\${encoded}&start=\${start}&end=\${end}\`);
}

async function vcReadCachedRange(cache, url, start, end, label, total, onProgress, completedBefore) {
    if (!cache) return null;
    try {
        const hit = await cache.match(vcRangeKey(url, start, end));
        if (!hit) return null;
        const buffer = new Uint8Array(await hit.arrayBuffer());
        const expected = end - start + 1;
        if (buffer.byteLength !== expected) {
            await cache.delete(vcRangeKey(url, start, end));
            return null;
        }
        onProgress?.({
            label,
            loaded: Math.min(completedBefore + buffer.byteLength, total),
            total,
            fromCache: true,
        });
        return buffer;
    } catch {
        return null;
    }
}

async function vcReadRange(url, start, end, label, total, onProgress, completedBefore, cache) {
    const cached = await vcReadCachedRange(cache, url, start, end, label, total, onProgress, completedBefore);
    if (cached) return { buffer: cached, wholeFile: false };

    let lastError = null;
    for (let attempt = 1; attempt <= VC_MAX_ATTEMPTS; attempt++) {
        try {
            const response = await vcFetch(url, {
                headers: { Range: \`bytes=\${start}-\${end}\` },
                cache: 'no-store',
            });

            const expected = end - start + 1;
            const isWholeFileFallback = start === 0 && response.status === 200;
            if (response.status !== 206 && !isWholeFileFallback) {
                throw new Error(\`Range request returned HTTP \${response.status}\`);
            }

            const buffer = new Uint8Array(await response.arrayBuffer());
            if (isWholeFileFallback) {
                if (buffer.byteLength !== total) {
                    throw new Error(\`Full-file fallback returned \${buffer.byteLength} of \${total} bytes\`);
                }
            } else if (buffer.byteLength !== expected) {
                throw new Error(\`Incomplete range: received \${buffer.byteLength} of \${expected} bytes\`);
            }

            if (!isWholeFileFallback && cache) {
                try {
                    await cache.put(vcRangeKey(url, start, end), new Response(buffer, {
                        status: 200,
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            'Content-Length': String(buffer.byteLength),
                        },
                    }));
                } catch {
                    // Persistence is best-effort; the current session can continue.
                }
            }

            onProgress?.({
                label,
                loaded: Math.min(completedBefore + buffer.byteLength, total),
                total,
                fromCache: false,
            });
            return { buffer, wholeFile: isWholeFileFallback };
        } catch (error) {
            lastError = error;
            if (attempt < VC_MAX_ATTEMPTS) {
                onProgress?.({ label, loaded: completedBefore, total, fromCache: false });
                await vcSleep(Math.min(10000, 500 * 2 ** (attempt - 1)));
            }
        }
    }

    throw new Error(\`Network error while downloading \${label} at byte \${start}-\${end}: \${lastError?.message || lastError}\`);
}

async function vcDeleteRangeCache(cache, url) {
    if (!cache) return;
    try {
        const keys = await cache.keys();
        const prefix = \`\${self.location.origin}\${VC_RANGE_CACHE_PREFIX}?url=\${encodeURIComponent(url)}&\`;
        await Promise.all(keys
            .filter((request) => request.url.startsWith(prefix))
            .map((request) => cache.delete(request)));
    } catch {
        // Cleanup is best-effort.
    }
}

async function fetchWithProgress(url, label, onProgress) {
    const cache = await openCache();

    if (cache) {
        try {
            const hit = await cache.match(url);
            if (hit) return readBodyWithProgress(hit, label, onProgress, true);
        } catch {
            // Ignore cache failures and continue with network acquisition.
        }
    }

    let total = 0;
    try {
        const head = await vcRequest(url, { method: 'HEAD', cache: 'no-store' });
        total = Number(head.headers.get('content-length')) || 0;
    } catch {
        total = 0;
    }

    if (!total) {
        const response = await vcRequest(url, { cache: 'no-store' });
        const forCache = cache ? response.clone() : null;
        const bytes = await readBodyWithProgress(response, label, onProgress, false);
        if (cache && forCache) {
            try { await cache.put(url, forCache); } catch { /* best effort */ }
        }
        return bytes;
    }

    const parts = [];
    let completed = 0;

    for (let start = 0; start < total; start += VC_RANGE_SIZE) {
        const end = Math.min(total - 1, start + VC_RANGE_SIZE - 1);
        const result = await vcReadRange(url, start, end, label, total, onProgress, completed, cache);

        if (result.wholeFile) {
            if (cache) {
                try { await cache.put(url, new Response(result.buffer, { status: 200 })); } catch { /* best effort */ }
            }
            return result.buffer;
        }

        parts.push(result.buffer);
        completed += result.buffer.byteLength;
    }

    if (completed !== total) {
        throw new Error(\`Network error: \${label} completed at \${completed}/\${total} bytes\`);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
    }

    if (offset !== total) {
        throw new Error(\`Network error: \${label} assembled at \${offset}/\${total} bytes\`);
    }

    if (cache) {
        try {
            await cache.put(url, new Response(bytes, {
                status: 200,
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': String(total),
                },
            }));
        } catch {
            // Storage failure must not prevent this completed model from being
            // used for the current session.
        }
        await vcDeleteRangeCache(cache, url);
    }

    return bytes;
}`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(workerPath, source);
console.log('[VoiceCraft] installed Pocket TTS resumable model downloader v3');
