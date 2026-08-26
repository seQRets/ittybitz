# IttyBitz Security Audit

**Date:** August 25, 2026
**Scope:** Full codebase review of IttyBitz v2.8.1 "Triceratops" (client-side encryption tool)
**Files reviewed:** `src/lib/crypto.ts`, `src/lib/bip39.ts`, `src/components/encryptor-tool.tsx`, `src/app/layout.tsx`, `scripts/apply-csp-hashes.mjs`, `scripts/crypto-regression.mts`, `public/sw.js`, `public/manifest.json`, `next.config.js`, `package.json`, `package-lock.json`, `.github/workflows/deploy.yml`, `.github/workflows/crypto-regression.yml`, `README.md`

---

## Summary

IttyBitz v2.8.1 is a static, client-side-only encryption tool with a minimal attack surface and a solid cryptographic core. This review found **no exploitable vulnerabilities** of High or Medium severity in the current code. Every finding raised in the prior audit (v2.2.0, April 2026) was independently re-verified against current code rather than assumed to still hold — see the Remediation History section below.

Six releases have shipped since the prior audit (v2.3.0 through v2.8.1), adding BIP-39/SeedQR hardware-wallet export, meta-tag CSP hash-hardening, and supply-chain hardening in CI. The security posture has **improved** over that window, not regressed.

The app's security posture is genuinely strong for its threat model:

- Static Next.js export (`output: 'export'`) — no server, no API routes, no server actions.
- Zero outbound network requests at runtime (no fonts, analytics, CDNs, or trackers) — verified via source grep, not just claimed.
- All cryptography uses the Web Crypto API with conservative parameters, unchanged since v1.0.
- No user-controlled HTML rendering; the only `dangerouslySetInnerHTML` in the codebase is a static, hardcoded service-worker registration script.
- No secrets in the client bundle; no `process.env` / `NEXT_PUBLIC_*` references outside a single `NODE_ENV` check gating the CSP tag.
- `npm audit`: 0 vulnerabilities across 115 packages.

Findings are grouped by severity below.

---

## High Severity

_None._

---

## Medium Severity

_None._

---

## Low Severity / Defense-in-Depth

### 1. PBKDF2 instead of a memory-hard KDF

**Location:** `src/lib/crypto.ts`, `deriveKey()`

PBKDF2-HMAC-SHA-256 at 1,000,000 iterations is acceptable and meets current OWASP recommendations. It is not resistant to GPU or ASIC-based attacks the way memory-hard KDFs like Argon2id or scrypt are. This is a "good vs. better" gap, not a vulnerability. Unchanged since the v2.2.0 audit — same constant, same tradeoff.

**Recommendation:** Consider migrating to Argon2id when browser support allows (a WebAssembly Argon2 implementation is feasible today but adds bundle size). If staying on PBKDF2, document the rationale (already done in the CHANGELOG banner and README).

### 2. `secureErase` is best-effort, not a guarantee

**Location:** `src/lib/crypto.ts`, `secureErase()`

JavaScript's garbage collector can copy buffer contents to new memory locations at any time, and JIT compilers may optimize away writes to "dead" buffers. `TextEncoder.encode()` also creates intermediate copies the app cannot reach. The current implementation (random overwrite + zero-fill, with a zero-fill fallback when `crypto.getRandomValues` is unavailable) is sound and byte-identical to what the v2.2.0 audit reviewed — only a JSDoc comment has changed since.

**Recommendation:** Continue to treat memory erasure as best-effort. The README already frames it accurately; keep it that way.

---

## Informational

### 3. Content Security Policy — script-src hash-hardened, `style-src` still `unsafe-inline` (production-only)

**Location:** `src/app/layout.tsx`, `scripts/apply-csp-hashes.mjs`

**Changed since the v2.2.0 audit.** The prior review noted `'unsafe-inline'` in `script-src` was "required because Next.js emits several inline hydration scripts per page whose content changes every build, making nonces/hashes impractical for a static export." That's no longer the shipped state.

`scripts/apply-csp-hashes.mjs` now runs as a mandatory post-build step (`"build": "next build && node scripts/apply-csp-hashes.mjs"`) that walks every built HTML file, computes SHA-256 hashes of each inline `<script>` block's actual rendered content, and rewrites the CSP meta tag's `script-src` to replace `'unsafe-inline'` with the per-file hash list. It is fail-closed by construction: the build fails if any built HTML file still contains `'unsafe-inline'` in `script-src` after processing, or if no CSP meta tag is found at all — verified by reading the independent second scan pass, not just the comment claiming it.

Residual, unchanged limitations (both already correctly documented and not newly discovered here):

- `style-src 'unsafe-inline'` remains, and is correctly left alone — React/Tailwind emit `style="..."` attributes that CSP hashes cannot cover without `'unsafe-hashes'` plus per-attribute hashing, assessed as not worth the fragility given the app renders no user-controlled HTML.
- `frame-ancestors` still cannot be set via a `<meta>` tag (CSP L3 restricts this to real HTTP headers), and GitHub Pages still can't emit custom headers. Clickjacking protection remains unavailable without fronting the site with a CDN capable of header injection (e.g. Cloudflare Transform Rules). Unchanged from the v2.2.0 audit and remains the one honest gap in an otherwise strong CSP.
- Report-only reporting (`report-uri` / `report-to`) is also meta-ineligible; violations won't phone home, consistent with the app's no-network-egress posture anyway.

**Recommendation:** None required for shipped behavior. If GitHub Pages is ever fronted with a CDN capable of header injection, add `frame-ancestors 'none'` at that layer to close the clickjacking gap.

### 4. Subresource integrity for any future CDN assets

The app currently loads **no** external resources, which is ideal. If any CDN dependency is ever added, it should use SRI hashes. Unchanged since the v2.2.0 audit.

### 5. Legacy (v0) ciphertext / `IBTZ` magic collision — accepted, documented only

The v1 container format is detected by a 4-byte magic prefix (`IBTZ`, bytes `49 42 54 5A`) followed by a version byte. Legacy v0 ciphertexts are headerless and begin directly with the random 16-byte PBKDF2 salt. If a v0 blob's salt happens to start with those same 4 bytes (probability 2⁻³² per ciphertext), the decoder misparses it as a versioned container:

- If the 5th byte is `0x01`, it is parsed as v1 with wrong offsets; AES-GCM authentication then fails and the user gets the generic "Decryption failed" error.
- If the 5th byte is greater than `0x01`, the user gets a misleading "encrypted with a newer version" error.
- (If the 5th byte is `0x00`, the version resolves to 0 and the blob still parses correctly.)

Impact is availability only for the affected blob — no key or plaintext exposure — and the workaround is trivial (any hex editor can confirm the blob is v0). At p≈2⁻³² this will essentially never occur in practice, and fixing it would require changing `src/lib/crypto.ts`, which is frozen for backward compatibility with long-horizon ciphertexts. Accepted as a documented non-issue; unchanged since the v2.2.0 audit — the format-detection logic is byte-identical to what was reviewed then.

### 6. `src/lib/bip39.ts` — highest-scrutiny new surface, thoroughly verified, no defects found

**Location:** `src/lib/bip39.ts` (new since the v2.2.0 audit)

This module feeds hardware-wallet imports directly via Standard SeedQR — a wrong word index would be a silent wrong-wallet QR with no error surfaced to the user. Given the stakes, this was independently verified rather than trusting the module's own claims or its own test suite:

- **Wordlist integrity:** the embedded 2048-word list hashes to `sha256:2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda`, an exact match to the canonical BIP-39 English wordlist and to the hash documented in the file's own header comment. Confirmed 2048 entries, no duplicates, alphabetically sorted, first word `abandon`, last word `zoo`.
- **Checksum math:** the bit-packing formula (`checksumBits = totalBits/33`, `entropyBits = totalBits - checksumBits`) was manually re-derived against the BIP-39 spec for all five supported word counts (12/15/18/21/24), not just the three covered by the repo's own regression tests.
- **Test vectors:** the 12-word and 24-word all-zero-entropy vectors in `scripts/crypto-regression.mts` match the canonical Trezor/BIP-39 reference test vectors independent of this repo's own fixtures — a genuine cross-check, not circular verification.
- **SeedQR digit encoding:** manually verified against the wordlist — "about" is index 3, and the 12-word vector's SeedQR digit string ends in `0003`, matching. Format (4-digit zero-padded decimal per word index) matches the SeedSigner Standard SeedQR spec.
- **Isolation from the frozen crypto core:** `bip39.ts` never imports from or calls into `crypto.ts`; it operates purely on already-decrypted plaintext for QR-display purposes only.
- **Regression suite run directly** (`npm run test:crypto`): 62/62 checks passed, including all BIP-39/SeedQR vectors and negative cases (bad checksum, unknown word, wrong word count, non-wordlist word rejected by `toStandardSeedQR`).

No defects found — unusually careful work for a from-scratch BIP-39 implementation.

### 7. Supply-chain hardening in `.github/workflows/` — new since the v2.2.0 audit, independently verified

**Location:** `.github/workflows/deploy.yml`, `.github/workflows/crypto-regression.yml`

- **SHA-pinning:** all four third-party action references (`actions/checkout`, `actions/setup-node`, `actions/upload-pages-artifact`, `actions/deploy-pages`) are pinned to full 40-character commit SHAs with version-tag comments. Confirmed against the GitHub API that all four SHAs resolve exactly to the tag stated in the comment.
- **`persist-credentials: false`** on every checkout — the `GITHUB_TOKEN` is never written to `.git/config` where a compromised build-time dependency could read it.
- **Least-privilege permissions:** workflow-level `permissions: {}` in both files, with each job requesting only what it needs (`contents: read` for build/test jobs; `pages: write` + `id-token: write` only in the separate `deploy` job, which runs no third-party build code).
- **`npm ci --ignore-scripts`:** verified empirically — scanned all 115 installed packages' `package.json` files for `preinstall`/`install`/`postinstall` hooks. Found zero. The flag costs nothing today and is a legitimate forward-looking control against a future compromised transitive dependency shipping an install-time payload.
- **`crypto-regression.yml`** intentionally skips `npm ci` entirely for the frozen-crypto regression job, since `crypto.ts` and `bip39.ts` have zero runtime dependencies — a smaller, more auditable job unaffected by a dependency-level compromise.

No findings. Above what most static-site projects bother with.

---

## Remediation History (from the v1.3.0 audit, March 2026, and the v2.2.0 audit, April 2026)

| # | Prior finding | Status | Evidence |
|---|---|---|---|
| 1 | Google Fonts loaded from `fonts.googleapis.com` | **Fixed** | No external font imports; no `fonts.googleapis.com` references anywhere in `src/` or `public/`. |
| 2 | Misleading FIPS 140-2 / NSA Suite B / GDPR certification claims | **Fixed** | README FIPS disclaimer text unchanged and accurate since the v2.2.0 audit. Suite B and GDPR claims remain removed. |
| 3 | `Math.random()` fallback in `secureErase` | **Fixed** | `src/lib/crypto.ts` zero-fills on CSPRNG failure — no `Math.random` in any security path. |
| 4 | No format version identifier in encrypted output | **Fixed** | Output begins with `IBTZ\x01` magic + version byte. Decryption remains backward-compatible with v0 blobs. |
| 5 | PBKDF2 instead of memory-hard KDF | **Open (Low)** | Re-logged as Low-severity item #1 above. Unchanged. |
| 6 | Clipboard auto-clear overstated | **Fixed** | Toast copy remains softened to reflect best-effort behavior. |
| 7 | `secureErase` mutates caller's buffer | **Fixed (documented)** | JSDoc on `encryptFile` / `decryptFile` still explicitly warns the caller's `keyFileBuffer` is zeroed in-place. |
| 8 | Version mismatch between `package.json` and UI | **Fixed** | Both report `2.8.1`; UI footer string matches exactly. |
| 9 | Error message sanitization fragile | **Fixed** | Allow-list of known-safe messages intact in `encryptor-tool.tsx`, now extended to also cover the "encrypted with a newer version" message. |
| 10 | No CSP | **Fixed, then hardened further** | Strict CSP shipped from `src/app/layout.tsx`. `script-src` upgraded from `'unsafe-inline'` to build-time SHA-256 hashes since the v2.2.0 audit — see Informational #3. |
| 11 | Unused `placehold.co` remote image pattern | **Fixed** | `next.config.js` still has no `images.remotePatterns`. |
| 12 | "No External Dependencies" claim imprecise | **Fixed** | Claim remains accurate — zero external network requests, confirmed by source grep (no `fetch`/`XMLHttpRequest`/bare `http(s)://` outside three user-clicked `noopener noreferrer` links). |

---

## What the app continues to do well

- AES-256-GCM for authenticated encryption.
- 1,000,000 PBKDF2 iterations — high end of current OWASP guidance.
- `crypto.getRandomValues()` exclusively; no `Math.random()` in any security-relevant code path.
- Password generator uses rejection sampling to avoid modulo bias, and (as of v2.8.1) resamples the whole password until it clears the strength gate, fixing a ~2.4% false-rejection rate the app's own check used to produce against its own generator output.
- Thorough input validation: filename sanitization (blocks `..`, `/`, `\`, null bytes, >255 chars, and — new since v2.2.0 — Unicode RTLO/bidi-override characters used for extension spoofing), file size limits, password length bounds.
- `CryptoKey` created with `extractable: false`.
- Generic decryption error messages to avoid oracle leaks.
- Static export — no server-side code, eliminating an entire class of vulnerabilities (SSRF, injection, auth bypass, deserialization).
- No `dangerouslySetInnerHTML` on user input. The single occurrence in `src/app/layout.tsx` is a static, hardcoded service-worker registration script with no interpolation.
- Service-worker `message` handler uses `textContent` (not `innerHTML`), and SW `postMessage` is same-origin-only by browser design.
- External links use `rel="noopener noreferrer"`.
- Zero third-party runtime scripts, fonts, analytics, or trackers.
- A permanent crypto regression suite (`scripts/crypto-regression.mts`, 62 checks) replays real historical ciphertexts from every tagged release — catches "encrypt and decrypt silently drifting together" bugs that self-consistent round-trip tests cannot, and is CI-gated on every change.
- CI supply-chain hardening — SHA-pinned actions verified correct against upstream tags, scoped per-job permissions, `persist-credentials: false`, empirically-confirmed-necessary `--ignore-scripts` — above what most static-site projects do.

---

## Overall assessment

For the threat model the app targets — a user who wants to encrypt a file or secret locally, without trusting a server or a third party — IttyBitz v2.8.1 is well-built, and its security posture has genuinely improved since the last audit rather than drifted. The codebase does not currently contain any vulnerability that a security engineer would flag as blocking. The single highest-consequence addition since the last audit — BIP-39/SeedQR hardware-wallet export, where a silent bug means a QR that scans clean into the wrong wallet — was built with real engineering discipline around its own failure modes and checks out under independent verification against the canonical wordlist hash, canonical BIP-39 test vectors, and hand-derived checksum math, not just against the project's own test suite.
