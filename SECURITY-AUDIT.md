# IttyBitz Security Audit

**Date:** April 23, 2026
**Scope:** Full codebase review of IttyBitz v2.2.0 (client-side encryption tool)
**Files reviewed:** `src/lib/crypto.ts`, `src/components/encryptor-tool.tsx`, `src/app/layout.tsx`, `src/components/ui/*`, `next.config.js`, `package.json`, `public/sw.js`, `public/manifest.json`, `README.md`

---

## Summary

IttyBitz v2.2.0 is a static, client-side-only encryption tool with a minimal attack surface and a solid cryptographic core. This review found **no exploitable vulnerabilities** of High or Medium severity in the current code. Every finding raised in the prior audit (v1.3.0, March 2026) has been remediated — see the Remediation History section below.

The app's security posture is genuinely strong for its threat model:

- Static Next.js export (`output: 'export'`) — no server, no API routes, no server actions.
- Zero outbound network requests at runtime (no fonts, analytics, CDNs, or trackers).
- All cryptography uses the Web Crypto API with conservative parameters.
- No user-controlled HTML rendering; the only `dangerouslySetInnerHTML` in the codebase is a static, hardcoded service-worker registration script.
- No secrets in the client bundle; no `process.env` / `NEXT_PUBLIC_*` references in `src/`.

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

PBKDF2-HMAC-SHA-256 at 1,000,000 iterations is acceptable and meets current OWASP recommendations. It is not resistant to GPU or ASIC-based attacks the way memory-hard KDFs like Argon2id or scrypt are. This is a "good vs. better" gap, not a vulnerability.

**Recommendation:** Consider migrating to Argon2id when browser support allows (a WebAssembly Argon2 implementation is feasible today but adds bundle size). If staying on PBKDF2, document the rationale.

### 2. `secureErase` is best-effort, not a guarantee

**Location:** `src/lib/crypto.ts`, `secureErase()`

JavaScript's garbage collector can copy buffer contents to new memory locations at any time, and JIT compilers may optimize away writes to "dead" buffers. `TextEncoder.encode()` also creates intermediate copies the app cannot reach. The current implementation (random overwrite + zero-fill, with a zero-fill fallback when `crypto.getRandomValues` is unavailable) is sound, and the `Math.random()` fallback flagged in the prior audit has been removed.

**Recommendation:** Continue to treat memory erasure as best-effort. The README already frames it accurately; keep it that way.

---

## Informational

### 3. Content Security Policy — shipped via meta tag (production-only)

A strict CSP is now emitted via a `<meta http-equiv="Content-Security-Policy">` tag in `src/app/layout.tsx`, gated on `process.env.NODE_ENV === 'production'` so React's dev-mode `eval()` usage is unaffected.

Shipped policy:

```
default-src 'none';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
worker-src 'self';
manifest-src 'self';
object-src 'none';
base-uri 'self';
form-action 'none'
```

Notes on the tradeoffs:

- `'unsafe-inline'` in `script-src` is required because Next.js emits several inline hydration scripts per page whose content changes every build, making nonces/hashes impractical for a static export. The exposure is small given the app renders no user-controlled HTML.
- `'unsafe-inline'` in `style-src` is required because React and Tailwind emit `style="..."` attributes.
- `frame-ancestors` is **not** enforceable via meta — CSP L3 restricts it to real headers. Since the app is hosted on GitHub Pages (no custom header support), the only way to add clickjacking protection would be to front the site with a CDN like Cloudflare that can inject headers via a Transform Rule. Not currently in scope.
- Report-only reporting (`report-uri` / `report-to`) is also meta-ineligible; violations won't phone home, which is consistent with the app's no-network-egress posture anyway.

### 4. Subresource integrity for any future CDN assets

The app currently loads **no** external resources, which is ideal. If any CDN dependency is ever added, it should use SRI hashes.

---

## Remediation History (from the v1.3.0 audit, March 2026)

For continuity, every finding from the previous audit has been addressed:

| # | Prior finding | Status | Evidence |
|---|---|---|---|
| 1 | Google Fonts loaded from `fonts.googleapis.com` | **Fixed** | No external font imports in `src/app/layout.tsx`; no `fonts.googleapis.com` references anywhere in `src/` or `public/`. |
| 2 | Misleading FIPS 140-2 / NSA Suite B / GDPR certification claims | **Fixed** | `README.md` now uses "uses AES-256-GCM and PBKDF2-HMAC-SHA-256, which are approved under FIPS 140-2 (note: this app has not undergone formal FIPS certification)". Suite B and GDPR claims removed. |
| 3 | `Math.random()` fallback in `secureErase` | **Fixed** | `src/lib/crypto.ts` now zero-fills on CSPRNG failure — no `Math.random` in any security path. |
| 4 | No format version identifier in encrypted output | **Fixed** | Output now begins with `IBTZ\x01` magic + version byte. Decryption is backward-compatible with v0 blobs. |
| 5 | PBKDF2 instead of memory-hard KDF | **Open (Low)** | Re-logged as Low-severity item above. |
| 6 | Clipboard auto-clear overstated | **Fixed** | Toast copy softened to reflect best-effort behavior ("may not work if tab loses focus"). |
| 7 | `secureErase` mutates caller's buffer | **Fixed (documented)** | JSDoc on `encryptFile` / `decryptFile` now explicitly warns the caller's `keyFileBuffer` is zeroed in-place. Behavior unchanged — the erase is intentional for secure cleanup. |
| 8 | Version mismatch between `package.json` and UI | **Fixed** | Both report `2.2.0`. |
| 9 | Error message sanitization fragile | **Fixed** | Allow-list of known-safe messages with generic fallback in `encryptor-tool.tsx`. |
| 10 | No CSP | **Fixed (meta tag)** | Strict CSP now emitted from `src/app/layout.tsx` in production builds. See Informational #3 for policy details and `frame-ancestors` caveat. |
| 11 | Unused `placehold.co` remote image pattern | **Fixed** | `next.config.js` no longer configures `images.remotePatterns`. |
| 12 | "No External Dependencies" claim imprecise | **Fixed** | Claim is now accurate — app makes zero external network requests. |

---

## What the app continues to do well

- AES-256-GCM for authenticated encryption.
- 1,000,000 PBKDF2 iterations — high end of current OWASP guidance.
- `crypto.getRandomValues()` exclusively; no `Math.random()` in any security-relevant code path.
- Password generator uses rejection sampling to avoid modulo bias.
- Thorough input validation: filename sanitization (blocks `..`, `/`, `\`, null bytes, >255 chars), file size limits, password length bounds.
- `CryptoKey` created with `extractable: false`.
- Generic decryption error messages to avoid oracle leaks.
- Static export — no server-side code, eliminating an entire class of vulnerabilities (SSRF, injection, auth bypass, SSRF, deserialization).
- No `dangerouslySetInnerHTML` on user input. The single occurrence in `src/app/layout.tsx` is a static, hardcoded service-worker registration script with no interpolation.
- Service-worker `message` handler uses `textContent` (not `innerHTML`), and SW `postMessage` is same-origin-only by browser design.
- External links use `rel="noopener noreferrer"`.
- Zero third-party runtime scripts, fonts, analytics, or trackers.

---

## Overall assessment

For the threat model the app targets — a user who wants to encrypt a file or secret locally, without trusting a server or a third party — IttyBitz v2.2.0 is well-built. The codebase does not currently contain any vulnerability that a security engineer would flag as blocking.
