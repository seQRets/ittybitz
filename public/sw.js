// IttyBitz Service Worker — hand-rolled, zero dependencies
// Cache version: bump this on every release to invalidate stale caches
const CACHE_VERSION = 'ittybitz-v2.2.1-icons';

// App shell files to precache on install.
// For a static Next.js export the HTML entry point and key assets are enough;
// the rest (JS chunks, CSS) are picked up at runtime via the fetch handler.
const APP_SHELL = [
  '/',
  '/index.html',
  '/logo.webp',
  '/favicon.ico',
  '/manifest.json',
];

// ---- Install: precache the app shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  // Activate immediately instead of waiting for existing tabs to close
  self.skipWaiting();
});

// ---- Activate: clean up old caches ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();

  // Notify all open tabs that a new version is active
  self.clients.matchAll({ type: 'window' }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: 'SW_UPDATED' });
    });
  });
});

// ---- Fetch: cache-first for same-origin, skip cross-origin entirely ----
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests — never cache or intercept cross-origin
  // (this also means any accidental external requests just pass through)
  if (url.origin !== self.location.origin) return;

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Don't cache error responses or opaque responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response — one copy goes to cache, one to the browser
        const toCache = response.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(event.request, toCache);
        });

        return response;
      });
    })
  );
});
