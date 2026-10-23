#!/usr/bin/env node
/**
 * Assemble site/index.html — the single-file IttyBitz — from reviewable parts.
 *
 * There is no framework and no bundler. This script only concatenates:
 *   scripts/build/head.html          hand-written page (HTML + CSS)
 *   scripts/build/qrcode-lib.js      kazuhikoarase/qrcode-generator (MIT), verbatim
 *   <argon2 core>                    argon2-core.template.js + the WebAssembly assembled
 *                                    from scripts/build/argon2.wat by scripts/wat.mjs
 *   scripts/build/crypto-core.js     DOM-free encrypt/decrypt (v0/v1 mirror src/lib/crypto.ts)
 *   <bip39 core>                     generated from src/lib/bip39.ts (canonical wordlist)
 *   scripts/build/app.js             the UI wiring
 *
 * The committed site/index.html is the shipped artifact; this script exists so
 * that artifact is reproducible and its provenance auditable. Users never run
 * it — they just open the HTML file. After running, `npm run test:crypto`
 * re-verifies the result against crypto.ts and the historical fixtures.
 *
 * The same generated Argon2id block is also written into the hand-edited
 * site/ittybitz-recovery.html, replacing the contents of its
 * <script id="ittybitz-argon2"> element, so both files carry identical
 * key-derivation code built from one source.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assemble } from "./wat.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const BUILD = join(HERE, "build");

function read(p) {
  return readFileSync(p, "utf8");
}

// 1. Extract the canonical BIP-39 wordlist verbatim from the frozen reference.
const bip39Ts = read(join(ROOT, "src", "lib", "bip39.ts"));
const m = bip39Ts.match(/const WORDLIST_RAW\s*=\s*\n?\s*"([^"]*)"\s*;/);
if (!m) {
  console.error("ERROR: could not find WORDLIST_RAW in src/lib/bip39.ts");
  process.exit(1);
}
const wordlist = m[1];
const wordCount = wordlist.split(" ").length;
if (wordCount !== 2048) {
  console.error(`ERROR: expected 2048 words in bip39.ts, extracted ${wordCount}`);
  process.exit(1);
}

// 2. Fill the BIP-39 template.
const bip39Core = read(join(BUILD, "bip39-core.template.js")).replace("__WORDLIST__", wordlist);
if (bip39Core.includes("__WORDLIST__")) {
  console.error("ERROR: BIP-39 wordlist placeholder was not substituted (is the token unique in the template?)");
  process.exit(1);
}

// 3. Assemble the Argon2id WebAssembly from its readable source and embed it.
const wasm = assemble(read(join(BUILD, "argon2.wat")));
const argon2Core = read(join(BUILD, "argon2-core.template.js"))
  .replace("__ARGON2_WASM__", Buffer.from(wasm).toString("base64"));
if (argon2Core.includes("__ARGON2_WASM__")) {
  console.error("ERROR: Argon2 WebAssembly placeholder was not substituted");
  process.exit(1);
}

// 4. Read the remaining parts.
const head = read(join(BUILD, "head.html"));
const qrcode = read(join(BUILD, "qrcode-lib.js"));
const cryptoCore = read(join(BUILD, "crypto-core.js"));
const fingerprint = read(join(BUILD, "fingerprint-core.js"));
const app = read(join(BUILD, "app.js"));

// 5. Assemble. Script ids match what scripts/crypto-regression.mts extracts.
const out =
  head +
  '\n<script id="ittybitz-vendor-qrcode">\n' + qrcode +
  '\n</script>\n<script id="ittybitz-argon2">\n' + argon2Core +
  '\n</script>\n<script id="ittybitz-crypto-core">\n' + cryptoCore +
  '\n</script>\n<script id="ittybitz-bip39">\n' + bip39Core +
  '\n</script>\n<script id="ittybitz-fingerprint">\n' + fingerprint +
  '\n</script>\n<script>\n' + app +
  '\n</script>\n</body>\n</html>\n';

const target = join(ROOT, "site", "index.html");
writeFileSync(target, out);
console.log(`Built site/index.html — ${out.length} bytes (${wordCount} BIP-39 words inlined, Argon2id WebAssembly ${wasm.length} bytes).`);

// 6. Refresh the same Argon2id block inside the recovery tool.
const recoveryPath = join(ROOT, "site", "ittybitz-recovery.html");
const recovery = read(recoveryPath);
const blockRe = /(<script id="ittybitz-argon2">\n)[\s\S]*?(\n<\/script>)/;
if (!blockRe.test(recovery)) {
  console.error('ERROR: no <script id="ittybitz-argon2"> block in site/ittybitz-recovery.html');
  process.exit(1);
}
const recoveryOut = recovery.replace(blockRe, (_, open, close) => open + argon2Core + close);
if (recoveryOut !== recovery) {
  writeFileSync(recoveryPath, recoveryOut);
  console.log("Refreshed the Argon2id block in site/ittybitz-recovery.html.");
}
