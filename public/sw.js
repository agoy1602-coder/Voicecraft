const CACHE_NAME = 'voicecraft-offline-shell-v2';
const CACHE_PREFIX = 'voicecraft-offline-shell-';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const shellUrl = new URL('./index.html', self.registration.scope).href;
    try {
      const response = await fetch(shellUrl, {cache: 'reload'});
      if (response.ok) await cache.put(shellUrl, response.clone());
    } catch (_) {
      // The shell is populated by successful online fetches when installation
      // happens in an already-cached/offline-capable session.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Only remove previous VoiceCraft offline-shell versions. Never delete
    // unrelated application caches, including Pocket TTS's own model cache.
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Navigation: network first while online, deterministic cached shell when offline.
    if (request.mode === 'navigate') {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          const shellUrl = new URL('./index.html', self.registration.scope).href;
          await cache.put(shellUrl, networkResponse.clone());
        }
        return networkResponse;
      } catch (_) {
        const shellUrl = new URL('./index.html', self.registration.scope).href;
        const cachedShell = await cache.match(shellUrl);
        return cachedShell || Response.error();
      }
    }

    // Static application resources: cache first, then populate from network.
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
