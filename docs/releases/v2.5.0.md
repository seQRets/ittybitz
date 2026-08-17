## v 2.5.0 🦖 T-Rex — security hardening + QR workflow polish

A hardening and polish release driven by a fresh full-codebase security review. **Cryptography is unchanged** — `src/lib/crypto.ts` was not touched, and all prior-version encrypted data (format v0 legacy and v1 `IBTZ` header) decrypts identically.

### 🔒 Security fixes (from the review)

- **Decrypted secret could render un-blurred on input-type switch.** Flipping the File/Text pill while a decrypted secret was on screen carried the output across the switch — fully visible, with the blur toggle gone. The output and all QR state now clear on input-type change.
- **"Hidden" QR was sharp in the DOM.** The blurred QR canvas was fully painted behind a CSS filter, readable by devtools or any extension with DOM access. The QR canvas (and the hi-res download canvas) are now only **mounted while revealed** — a neutral placeholder renders otherwise. The SeedQR payload is also no longer stored in React state; it's derived at render time, only while revealed.
- **Service worker could pin users to a stale bundle.** The app shell was cache-first, so a release that forgot to bump the cache version would never reach returning users — including releases containing security fixes. Navigations are now **network-first with cache fallback** (offline support unchanged); content-hashed `/_next/static/` assets remain cache-first.
- **Filename validation hardened** against C0 control characters and Unicode bidirectional-override characters (RTLO extension spoofing on decrypted downloads).
- **QR error-correction level pinned** to `L` explicitly on all capacity-bounded QRs, matching the 2,953-char limit (the old comment claimed level M, whose real limit is 2,331).

### 🛡️ CSP: `'unsafe-inline'` eliminated from script-src

A new post-build step (`scripts/apply-csp-hashes.mjs`, wired into `npm run build` and therefore into the Pages deploy workflow) computes sha256 hashes of every inline script actually emitted into the built HTML and replaces `script-src 'unsafe-inline'` with the hash list. Injected inline scripts are now blocked by hash mismatch — verified with a live injection test against the production build.

Failure mode is graceful: if the step doesn't run, the source CSP still carries `'unsafe-inline'` (the previous behavior); if the CSP ever changes shape, the build fails loudly instead of shipping a silently loose policy.

### 📥 New: Download button for decrypted QRs

The SeedQR / Data QR modal now offers **Download PNG** — an exactly **1024×1024** PNG with a spec-compliant 4-module quiet zone baked in, normalized to be devicePixelRatio-independent. Filenames: `ittybitz-seedqr.png` / `ittybitz-qr.png`.

- The button only activates **while the QR is revealed** — it sits in place (dimmed) otherwise, so the layout never jumps.
- The download toast reminds you the file encodes your decrypted secret and should be stored as carefully as the secret itself.
- Note: this deliberately supersedes v2.3.0's "no download for plaintext QRs" stance, by explicit owner decision.

### 🎨 QR polish

- The **encrypted-text QR** now sits in the same white quiet-zone frame as the decryption-side QRs instead of melting into the dark dialog.
- The encrypted QR stays unblurred by design: it's ciphertext — sharing it is the point. The asymmetry is intentional UX language: *blurred = secret, visible = safe to share.*
- Reveal/Hide and Download PNG buttons have fixed widths — zero pixel shift across reveal/hide cycles.

### 🧹 Dead-code sweep

- Deleted unused `ui/card.tsx`, `ui/radio-group.tsx`, and the orphaned `icon-512x512-maskable.png`
- Dropped unused deps `@radix-ui/react-radio-group` and `@types/qrcode.react` (qrcode.react 3.x ships its own types)
- Removed the dead `start` script (`next start` is meaningless with `output: 'export'`)
- Removed the unused `qrCodeRef`; un-exported bip39 internals (`BIP39_WORDLIST` + types) that nothing imported
- Pruned stale Tailwind config: `src/pages` glob, `chart-*` colors, accordion keyframes/animations

### 🧹 Housekeeping

- `CACHE_VERSION` bumped to `ittybitz-v2.5.0`; footer reads v 2.5.0

> ⚠️ **Full backward compatibility** — PBKDF2-1M, AES-256-GCM, and the encrypted file format are unchanged. Both format v0 (legacy) and v1 (IBTZ header) payloads decrypt exactly as before.
