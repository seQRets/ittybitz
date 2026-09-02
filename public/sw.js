// IttyBitz Service Worker — hand-rolled, zero dependencies
// Cache version: bump this on every release to invalidate stale caches
const CACHE_VERSION = 'ittybitz-v2.9.3';

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

// Last-resort page for an offline launch when the app shell was never cached
// (e.g. an older worker that only cached the shell, before offline was fixed).
// Better an honest, actionable message than a blank coloured screen.
const OFFLINE_FALLBACK_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>IttyBitz — offline setup needed</title></head>' +
  '<body style="margin:0;min-height:100vh;display:flex;align-items:center;' +
  'justify-content:center;background:#000;color:#f4f4f5;font:16px/1.6 system-ui,' +
  '-apple-system,sans-serif;padding:2rem;text-align:center">' +
  '<div style="max-width:26rem"><h1 style="font-size:1.5rem;margin:0 0 .75rem">IttyBitz</h1>' +
  '<p style="color:#a1a1aa;margin:0">This device has not finished caching the app ' +
  'for offline use. Connect to the internet once and reopen IttyBitz to complete ' +
  'setup — after that it works offline.</p></div></body></html>';

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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter((key) => key !== CACHE_VERSION);
    // Only an UPDATE has stale caches to clear; a first install has none.
    // That distinction gates the banner below: telling a brand-new visitor
    // "a new version is available — tap to reload" is wrong, and on a
    // security tool it reads as a bug at best and phishing at worst.
    const isUpdate = stale.length > 0;
    await Promise.all(stale.map((key) => caches.delete(key)));
    // install's addAll is atomic, so whenever this worker activates the
    // precache is already complete — there is nothing to repair here.
    await self.clients.claim();
    if (isUpdate) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.postMessage({ type: 'SW_UPDATED' }));
    }
  })());
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
    // Network-first, with an offline fallback that can never resolve to
    // undefined. `respondWith(undefined)` is treated as a network error and
    // paints the manifest's blank background — the exact failure this guards
    // against. Try the exact request, then the precached app shell, then a
    // tiny built-in page that tells the user what to do rather than showing
    // nothing.
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse(event.request, response))
        .catch(async () => {
          const cached =
            (await caches.match(event.request)) ||
            (await caches.match('/')) ||
            (await caches.match('/index.html'));
          if (cached) return cached;
          return new Response(OFFLINE_FALLBACK_HTML, {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        })
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
