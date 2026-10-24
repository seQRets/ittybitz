#!/usr/bin/env node
/**
 * CSP hash maintenance for the single-file build.
 *
 * Each shipped HTML file carries a Content-Security-Policy meta tag. This
 * script replaces its script-src source list with the sha256 hashes of that
 * file's actual inline <script> blocks — the browser then executes only those
 * exact blocks and refuses any injected or altered script (hash mismatch).
 * The source list it replaces can be 'unsafe-inline' (scripts/build/head.html
 * is written that way, so the page also runs unbuilt) or an older set of
 * hashes (site/ittybitz-recovery.html, which is edited in place). The one
 * keyword kept is 'wasm-unsafe-eval', which lets the page compile its own
 * embedded WebAssembly (the Argon2id core) and nothing else.
 *
 * It also (re)generates SHA256SUMS.txt in the repo root, covering the two
 * shipped artifacts under their release-asset names, so a downloader can
 * `sha256sum -c SHA256SUMS.txt` against the files attached to a release.
 *
 * Run after any edit to either HTML file, before committing:
 *     node scripts/update-csp-hashes.mjs      (or: npm run update-csp-hashes)
 * `npm run build` runs it automatically after assembling site/index.html.
 *
 * Idempotent: a second run with unchanged script blocks writes nothing.
 * It ends by saying, in plain words, whether the files now in site/ are
 * byte-for-byte the ones SHA256SUMS.txt already listed — which is how
 * someone who downloads the source can confirm that the build reproduces
 * the published IttyBitz exactly.
 * Plain Node, zero dependencies. It never touches the cryptographic logic,
 * container format, wordlist, or self-tests — only the CSP meta tag and the
 * checksums file.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// [ repo path, name used in SHA256SUMS.txt / the GitHub release asset ]
const FILES = [
  ['site/index.html', 'ittybitz.html'],
  ['site/ittybitz-recovery.html', 'ittybitz-recovery.html'],
];

// Inline scripts whose type makes them executable. Data blocks
// (application/json etc.) never execute, so they need no hash.
const EXECUTABLE_TYPE = /^(?:$|module$|text\/javascript$|application\/javascript$)/i;

// Our CSP meta is hand-written and plain (raw single quotes, not entity-
// escaped), and spans two lines: the http-equiv, then the content attribute.
const META_RE =
  /(<meta http-equiv="Content-Security-Policy"\s+content=")([^"]*)(">)/i;

// Source keywords carried over into the pinned script-src. 'wasm-unsafe-eval'
// permits compiling the page's own embedded WebAssembly (the Argon2id core)
// and nothing else — no eval(), no injected script — so it survives the
// rewrite; 'unsafe-inline' and any stale hashes do not.
const KEPT_SCRIPT_KEYWORDS = ["'wasm-unsafe-eval'"];

// Walk the markup the way the HTML parser does: an HTML comment hides
// everything up to its "-->", and a <script> body runs to the first
// "</script>" regardless of what it contains. A naive regex would treat a
// literal "<script>" inside a comment as a real block and hash the wrong bytes
// — which pins a hash the browser never matches and silently kills the page.
function inlineScriptBlocks(html) {
  const blocks = [];
  const next = /<!--|<script\b/gi;
  let pos = 0;
  let m;
  while ((m = next.exec(html)) !== null) {
    if (m[0] === '<!--') {
      const end = html.indexOf('-->', m.index + 4);
      if (end < 0) break; // unterminated comment hides the rest of the file
      pos = end + 3;
    } else {
      const open = html.indexOf('>', m.index);
      if (open < 0) break;
      const close = html.indexOf('</script>', open + 1);
      if (close < 0) break;
      blocks.push({ attrs: html.slice(m.index + 7, open), body: html.slice(open + 1, close) });
      pos = close + 9;
    }
    next.lastIndex = pos;
  }
  return blocks;
}

function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const { attrs, body } of inlineScriptBlocks(html)) {
    if (!body) continue; // external or empty
    if (/\bsrc\s*=/i.test(attrs)) continue; // external
    const type = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i);
    if (type && !EXECUTABLE_TYPE.test(type[1].trim())) continue;
    // The browser hashes the raw UTF-8 bytes between the tags, untrimmed.
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return [...hashes];
}

function tightenCsp(filePath) {
  const abs = join(ROOT, filePath);
  const html = readFileSync(abs, 'utf8');

  const meta = html.match(META_RE);
  if (!meta) {
    console.error(`update-csp-hashes: ERROR — no Content-Security-Policy meta tag in ${filePath}.`);
    process.exit(1);
  }

  const hashes = inlineScriptHashes(html);
  if (hashes.length === 0) {
    console.error(`update-csp-hashes: ERROR — no inline <script> blocks found in ${filePath}.`);
    process.exit(1);
  }

  const policy = meta[2];
  let sawScriptSrc = false;
  const newPolicy = policy
    .split(';')
    .map((directive) => {
      if (!/^\s*script-src\b/.test(directive)) return directive;
      sawScriptSrc = true;
      // Replace the script-src source list (whether it currently reads
      // 'unsafe-inline' or an older set of hashes) with the freshly computed
      // hashes, keeping only the allow-listed keywords above — this is what
      // makes re-running after an edit correct, and a no-op when nothing
      // changed.
      const kept = KEPT_SCRIPT_KEYWORDS.filter((k) => directive.split(/\s+/).includes(k));
      return directive.replace(/^(\s*script-src)\b.*$/, `$1 ${[...kept, ...hashes].join(' ')}`);
    })
    .join(';');

  if (!sawScriptSrc) {
    console.error(`update-csp-hashes: ERROR — CSP in ${filePath} has no script-src directive.`);
    process.exit(1);
  }

  if (newPolicy === policy) {
    console.log(`update-csp-hashes: ${filePath} — already current (${hashes.length} hash(es))`);
    return;
  }

  writeFileSync(abs, html.replace(META_RE, `$1${newPolicy}$3`), 'utf8');
  console.log(`update-csp-hashes: ${filePath} — pinned ${hashes.length} inline script hash(es)`);
}

function verifyNoUnsafeInline(filePath) {
  const html = readFileSync(join(ROOT, filePath), 'utf8');
  const meta = html.match(META_RE);
  const scriptSrc = (meta ? meta[2] : '').split(';').find((d) => /^\s*script-src\b/.test(d)) || '';
  if (scriptSrc.includes("'unsafe-inline'")) {
    console.error(`update-csp-hashes: ERROR — script-src still contains 'unsafe-inline' in ${filePath}.`);
    process.exit(1);
  }
}

function regenerateChecksums() {
  const lines = FILES.map(([filePath, assetName]) => {
    const buf = readFileSync(join(ROOT, filePath));
    return `${createHash('sha256').update(buf).digest('hex')}  ${assetName}`;
  });
  const out = lines.join('\n') + '\n';
  const target = join(ROOT, 'SHA256SUMS.txt');
  let existing = '';
  try { existing = readFileSync(target, 'utf8'); } catch { /* first run */ }
  if (existing === out) {
    console.log('update-csp-hashes: SHA256SUMS.txt — already current');
    return true;
  }
  writeFileSync(target, out, 'utf8');
  console.log('update-csp-hashes: SHA256SUMS.txt — regenerated');
  return false;
}

for (const [filePath] of FILES) tightenCsp(filePath);
for (const [filePath] of FILES) verifyNoUnsafeInline(filePath);
const identical = regenerateChecksums();
console.log(identical
  ? '\nDone. The files you built are identical, byte for byte, to the published ones listed in SHA256SUMS.txt.\n'
  : '\nDone. SHA256SUMS.txt was updated because the files in site/ changed. That is expected after editing\n' +
    'the source. If you did not change anything, the build did not reproduce the published files.\n');
