## v 2.4.0 — QR polish + dependency hygiene

A polish release on top of v2.3.0's SeedQR feature. **Cryptography is unchanged** — all prior-version encrypted data decrypts identically.

### 🙈 New: Blurred-by-default Decrypted QR
The decrypted-text QR modal (Standard SeedQR or plain Data QR) now opens **blurred**, matching the shoulder-surfing protection already in place on the decrypted Textarea. You have to deliberately click **"Reveal QR"** before scanning, and closing or reopening the modal resets it back to blurred. The toggle is a low-weight ghost button at the bottom of the modal — well below the QR and the security warning — so it's clearly outside the camera frame when you scan with a hardware wallet.

### 🖼️ White Quiet-Zone Frame on Every QR
All QRs in the app (decrypted-result Seed/Data, donation) now render inside a `bg-white p-4` container, giving the matrix a proper visible quiet zone. Reflective hardware-wallet cameras (Krux, SeedSigner, Coldcard) had trouble locking onto the QR when it was rendered directly on the dark dialog background. Same QR data, just framed.

### 🛡️ Dependency Hygiene
Resolved [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) (PostCSS XSS via unescaped `</style>` in CSS stringify output, moderate severity):

- Direct `postcss` devDependency bumped from `^8.4.40` to `^8.5.13`
- Added an `npm overrides` entry that pins **every** transitive `postcss` in the tree — including the one bundled inside `next@16.2.4` — to `^8.5.13`

`npm audit` now reports `found 0 vulnerabilities`. The vulnerability was build-time only and not exploitable in this codebase (PostCSS only ever processes our own Tailwind output, never untrusted CSS), but the open Dependabot badge is now resolved.

### 🧹 Housekeeping
- `CACHE_VERSION` bumped to `ittybitz-v2.4.0`
- Footer reads v 2.4.0

> ⚠️ **Full backward compatibility** — `src/lib/crypto.ts` is unchanged. Both format v0 (legacy) and v1 (IBTZ header) encrypted payloads decrypt exactly as before. PBKDF2-1M, AES-256-GCM, and the encrypted file format are unchanged.
