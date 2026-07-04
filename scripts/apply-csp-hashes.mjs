#!/usr/bin/env node
/**
 * Post-build CSP hardening for the static export.
 *
 * Next.js emits several inline <script> blocks per page (hydration payloads
 * plus our hand-written service-worker registration). The CSP meta tag in
 * src/app/layout.tsx ships with script-src 'unsafe-inline' so the source
 * stays buildable on its own — this script tightens each built HTML file by
 * replacing 'unsafe-inline' in the script-src directive with sha256 hashes
 * of that file's actual inline scripts.
 *
 * Failure mode is graceful by construction: if this script doesn't run,
 * the meta tag still carries 'unsafe-inline' and the app works exactly as
 * before — the CSP is just looser. If it does run, injected inline scripts
 * are blocked by hash mismatch.
 *
 * style-src 'unsafe-inline' is intentionally left alone: React and Tailwind
 * rely on style="" attributes, which hashes cannot cover (that would need
 * 'unsafe-hashes' and per-attribute hashes — fragile for zero gain here).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = new URL('../out', import.meta.url).pathname;

function htmlFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) found.push(...htmlFiles(p));
    else if (name.endsWith('.html')) found.push(p);
  }
  return found;
}

// Inline scripts whose type makes them executable. Data blocks
// (application/json etc.) never execute, so they need no hash.
const EXECUTABLE_TYPE = /^(?:$|module$|text\/javascript$|application\/javascript$)/i;

function inlineScriptHashes(html) {
  const hashes = new Set();
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const body = m[2];
    if (!body) continue; // external or empty
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i);
    if (typeMatch && !EXECUTABLE_TYPE.test(typeMatch[1].trim())) continue;
    // The browser hashes the raw UTF-8 bytes between the tags, untrimmed.
    const digest = createHash('sha256').update(body, 'utf8').digest('base64');
    hashes.add(`'sha256-${digest}'`);
  }
  return [...hashes];
}

let processed = 0;
let skipped = 0;

// The CSP meta content is HTML-entity-escaped by React (' → &#x27;).
const metaRe =
  /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)("\s*\/?>)/i;

for (const file of htmlFiles(OUT_DIR)) {
  let html = readFileSync(file, 'utf8');

  const metaMatch = html.match(metaRe);
  if (!metaMatch) {
    skipped++;
    continue;
  }

  const hashes = inlineScriptHashes(html);

  // React entity-escapes the attribute (' → &#x27;), and those entities
  // contain semicolons — decode BEFORE splitting the policy on ';'.
  const decode = (s) =>
    s
      .replace(/&#x27;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, '&');
  const policy = decode(metaMatch[2]);

  const newPolicy = policy
    .split(';')
    .map((directive) => {
      if (!/^\s*script-src\b/.test(directive)) return directive;
      return directive.replace(/'unsafe-inline'/, hashes.join(' ') || "'none'");
    })
    .join(';');

  if (newPolicy === policy) {
    skipped++;
    continue;
  }

  // Re-escape for the double-quoted attribute context. Apostrophes are
  // legal raw inside double quotes, so only & < " need escaping.
  const attrEscaped = newPolicy
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');

  html = html.replace(metaRe, `$1${attrEscaped}$3`);
  writeFileSync(file, html, 'utf8');
  processed++;
  console.log(
    `csp-hashes: ${file.replace(OUT_DIR + '/', '')} — ${hashes.length} inline script hash(es)`
  );
}

if (processed === 0) {
  console.error(
    'csp-hashes: ERROR — no HTML file with a script-src \'unsafe-inline\' CSP meta tag was found. ' +
      'Did the CSP move or change shape? Refusing to pass silently.'
  );
  process.exit(1);
}

// Fail-closed verification: after processing, NO built HTML file may still
// carry 'unsafe-inline' in a script-src directive. This catches a file the
// main loop skipped (e.g. a future page whose meta tag didn't match the
// regex) instead of silently shipping a loose policy for it.
const leaked = [];
for (const file of htmlFiles(OUT_DIR)) {
  const html = readFileSync(file, 'utf8');
  const metaMatch = html.match(metaRe);
  if (!metaMatch) continue; // a page with no CSP meta is a separate concern
  const policy = metaMatch[2]
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&');
  const scriptSrc = policy.split(';').find((d) => /^\s*script-src\b/.test(d)) || '';
  if (scriptSrc.includes("'unsafe-inline'")) {
    leaked.push(file.replace(OUT_DIR + '/', ''));
  }
}

if (leaked.length > 0) {
  console.error(
    `csp-hashes: ERROR — script-src still contains 'unsafe-inline' after processing in: ${leaked.join(', ')}. ` +
      'Refusing to ship a loose CSP.'
  );
  process.exit(1);
}

console.log(`csp-hashes: done (${processed} file(s) tightened, ${skipped} skipped, 0 with residual unsafe-inline)`);
