// IttyBitz Service Worker — hand-rolled, zero dependencies
// Cache version: bump this on every release to invalidate stale caches
const CACHE_VERSION = 'ittybitz-v2.9.0';

// Static, hand-maintained part of the app shell.
const APP_SHELL = [
  '/',
  '/logo.svg',
  '/favicon.ico',
  '/manifest.json',
  '/apple-touch-icon.png',
  '/icon-192x192.png',
  '/icon-512x512.png',
  // The standalone recovery tool. Precached so an installed app can still
  // hand the user their offline decryption tool with no network.
  '/ittybitz-recovery.html',
];

// Content-hashed build output (JS chunks, CSS), injected at build time by
// scripts/inject-sw-assets.mjs. DO NOT EDIT BY HAND — the filenames change
// every build.
//
// This list is why offline works. These files cannot be left to the runtime
// fetch handler to pick up opportunistically: on a first visit the page's
// asset requests complete BEFORE this worker controls the page, so they
// never reach the fetch handler and never get cached. The app is a React
// SPA whose HTML is an empty shell, so without them an offline launch
// renders nothing but the manifest's background colour.
//
// It also includes chunks index.html does not reference directly — notably
// the lazily-imported BIP-39 wordlist — so seed detection works offline too.
const BUILD_ASSETS = [
  /* __BUILD_ASSETS__ */
];

// Deduplicated: '/' appears in APP_SHELL and index.html is not listed twice.
const PRECACHE = [...new Set([...APP_SHELL, ...BUILD_ASSETS])];

// ---- Install: precache the app shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // addAll is atomic: if any entry fails the install fails, this worker
      // does not activate, and any previously installed worker keeps serving.
      // That is the behaviour we want — a half-populated cache is exactly the
      // silent breakage this list exists to prevent.
      return cache.addAll(PRECACHE);
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

// ---- Fetch strategies ----
// Navigations (the app shell) are network-first: users always get the
// newest deployed bundle when online, and the cache only serves as an
// offline fallback. Without this, cache-first on '/' could pin returning
// users to a stale bundle — including one with since-fixed security bugs —
// whenever a release forgets to bump CACHE_VERSION.
// Hashed static assets (/_next/static/*) are immutable by construction,
// so cache-first remains correct and fast for them.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests — never cache or intercept cross-origin
  // (this also means any accidental external requests just pass through)
  if (url.origin !== self.location.origin) return;

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const cacheResponse = (request, response) => {
    // Don't cache error responses or opaque responses
    if (!response || response.status !== 200 || response.type !== 'basic') {
      return response;
    }
    // Clone the response — one copy goes to cache, one to the browser
    const toCache = response.clone();
    caches.open(CACHE_VERSION).then((cache) => {
      cache.put(request, toCache);
    });
    return response;
  };

  const isNavigation =
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html';

  if (isNavigation) {
    // Network-first with cache fallback (offline support). Only '/' is
    // precached; any other navigation path (e.g. '/index.html') falls back
    // to the precached app shell when there is no exact cache match.
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse(event.request, response))
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Cache-first for everything else (content-hashed assets, icons, manifest)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) =>
        cacheResponse(event.request, response)
      );
    })
  );
});
