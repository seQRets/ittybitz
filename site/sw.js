// IttyBitz migration service worker
// ─────────────────────────────────────────────────────────────────────────
// v3.0.0 turned IttyBitz into a single self-contained HTML file and removed
// the PWA. But devices that installed an earlier version still have a service
// worker registered at this URL (/sw.js), and browsers re-fetch this file to
// keep it up to date. This minimal worker REPLACES the old caching worker on
// the next online launch of any such install. It:
//
//   • caches nothing and deletes the old caches, so it can never serve a stale
//     copy of the app;
//   • online, passes navigations through to the network, so the installed app
//     always loads the current single-file IttyBitz;
//   • offline, serves a short "IttyBitz is now a file — download it for offline
//     use" page instead of the old cached app, to move people onto the file.
//
// The app itself (site/index.html) registers NO service worker, so no NEW
// visitor ever gets one. This exists only to retire the installs that already
// exist, and can be deleted once they have aged out.

const MIGRATION_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>IttyBitz is now a single file</title></head>' +
  '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
  'background:#000;color:#f4f4f5;font:16px/1.6 system-ui,-apple-system,sans-serif;padding:2rem;text-align:center">' +
  '<div style="max-width:28rem">' +
  '<h1 style="font-size:1.5rem;margin:0 0 .75rem">IttyBitz has moved</h1>' +
  '<p style="color:#a1a1aa;margin:0 0 1.25rem">For offline use, IttyBitz is now a single HTML file you download once and keep — ' +
  "no install needed. You're offline right now: reconnect, download the file below, then double-click it to open " +
  'IttyBitz right in your browser — no separate app, works offline anywhere, forever.</p>' +
  '<a href="https://github.com/seQRets/ittybitz/releases/latest/download/ittybitz.html" ' +
  'style="display:inline-block;background:linear-gradient(to bottom right,#fbbf24,#f97316,#ef4444);color:#000;' +
  'font-weight:600;text-decoration:none;padding:.7rem 1.25rem;border-radius:12px">Download IttyBitz</a>' +
  '<p style="color:#6e6e77;font-size:13px;margin:1.25rem 0 0">Or open ' +
  '<a href="https://ittybitz.app" style="color:#f59e0b">ittybitz.app</a> in your browser.</p>' +
  '</div></body></html>';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop every cache the old worker created — nothing here is cached.
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Only intercept page navigations. The single-file app has no subresources,
  // so everything else just goes to the network untouched.
  if (req.mode !== 'navigate') return;
  event.respondWith(
    fetch(req).catch(
      () =>
        new Response(MIGRATION_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
    )
  );
});
