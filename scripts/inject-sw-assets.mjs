/**
 * Inject the real, content-hashed build output into the service worker's
 * precache list.
 *
 * Why this exists
 * ---------------
 * The app is a React SPA: `index.html` is an empty shell and renders nothing
 * without its JS/CSS chunks. Those chunk filenames are content-hashed and
 * change every build, so they cannot be hand-listed in `public/sw.js`.
 *
 * Leaving them to the service worker's runtime fetch handler does NOT work.
 * On a first visit the page's asset requests complete before the newly
 * installed worker controls the page, so they never pass through the fetch
 * handler and never get cached. The user then goes offline and sees nothing
 * but the manifest's background colour — the app shell loads, but there is
 * no code to run. (This shipped broken from the first PWA release until
 * v2.8.3; see docs/releases/.)
 *
 * So: after `next build`, walk `out/` and write the actual asset paths into
 * `out/sw.js`, replacing the `__BUILD_ASSETS__` placeholder.
 *
 * Fail-closed. This script exits non-zero — failing the build — if the
 * placeholder is missing, if no assets are found, or if the assets that
 * `index.html` actually references are not all covered. A silently
 * half-populated precache list is the exact failure this prevents.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const OUT = 'out';
const SW = join(OUT, 'sw.js');
const PLACEHOLDER = '/* __BUILD_ASSETS__ */';

function fail(msg) {
  console.error(`sw-assets: ERROR — ${msg}`);
  process.exit(1);
}

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else found.push(full);
  }
  return found;
}

// Everything under _next/static is content-hashed and immutable, and includes
// lazily-imported chunks (e.g. the BIP-39 wordlist) that index.html does not
// reference directly but the app needs offline.
const nextDir = join(OUT, '_next', 'static');
let assets = [];
try {
  assets = walk(nextDir)
    .map((f) => '/' + relative(OUT, f).split(sep).join('/'))
    .sort();
} catch {
  fail(`could not read ${nextDir} — did \`next build\` run first?`);
}

if (assets.length === 0) fail(`no assets found under ${nextDir}`);

// Sanity gate: every asset index.html actually references must be in the list.
const html = readFileSync(join(OUT, 'index.html'), 'utf8');
const referenced = [...html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)].map((m) => m[1]);
const missing = [...new Set(referenced)].filter((r) => !assets.includes(r));
if (missing.length) {
  fail(`index.html references assets not found in the build: ${missing.join(', ')}`);
}
if (referenced.length === 0) {
  fail('index.html references no /_next/ assets — the HTML shape changed, this script needs revisiting');
}

let sw;
try {
  sw = readFileSync(SW, 'utf8');
} catch {
  fail(`${SW} not found — is public/sw.js being copied into the build?`);
}

if (!sw.includes(PLACEHOLDER)) {
  fail(`placeholder ${PLACEHOLDER} not found in ${SW}. public/sw.js must keep it inside BUILD_ASSETS.`);
}

const list = assets.map((a) => `  '${a}',`).join('\n');
sw = sw.replace(PLACEHOLDER, list.trim().replace(/^/, '\n  ').replace(/\n\s{2}/g, '\n  ') + '\n');

// Re-read guarantee: the placeholder must be gone and every asset present.
if (sw.includes(PLACEHOLDER)) fail('placeholder still present after replacement');
const notWritten = assets.filter((a) => !sw.includes(`'${a}'`));
if (notWritten.length) fail(`assets missing from written sw.js: ${notWritten.join(', ')}`);

writeFileSync(SW, sw);

const totalKb = Math.round(
  assets.reduce((n, a) => n + statSync(join(OUT, a.slice(1))).size, 0) / 1024
);
console.log(
  `sw-assets: precaching ${assets.length} build asset(s) (~${totalKb} KB), ` +
    `${referenced.length} referenced by index.html, ` +
    `${assets.length - new Set(referenced).size} additional (lazy chunks / manifests)`
);
