## v 2.6.0 🦕 Ankylosaurus — security hardening + internal cleanup

Named for the armored, club-tailed dinosaur, because this release is all about hardening the shell. Driven by a fresh full-codebase security + quality review. **Cryptography is unchanged** — `src/lib/crypto.ts` was not touched, and a ciphertext produced before this release was verified to decrypt to the exact same plaintext (12/15/18/21/24-word seeds, key-file, and wrong-password paths all validated). Every prior encrypted file (format v0 legacy and v1 `IBTZ` header) restores identically.

### 🛡️ Supply-chain hardening (deploy pipeline)
- **Scoped-down workflow permissions.** The build job (which runs untrusted transitive `npm ci` install scripts) now holds only `contents: read` — it can no longer write GitHub Pages or mint an OIDC identity. Those permissions are granted only to the isolated deploy job.
- **`persist-credentials: false`** on checkout, so the token is never written into `.git/config` where a dependency script could read it.
- **All GitHub Actions pinned to commit SHAs** (not mutable tags), defending against a hijacked-tag supply-chain attack. Added `dependabot.yml` (npm + github-actions) so the pins stay patched automatically.

### 🔒 CSP: fail-closed build guard
The post-build CSP-hashing step now verifies, after processing, that **no** built HTML file still carries `'unsafe-inline'` in its `script-src`. If a future page ever slips through the rewrite, the build fails loudly instead of silently shipping a loose policy.

### 🐛 Fixes
- **Password strength gate accepts all generated symbols.** The strength checker's symbol set omitted several characters the password generator actually uses (`_ - + ~ \` [ ] ; / =`), so ~1 in 1,800 generated passwords — and any manual password relying only on those symbols — was wrongly rejected. The checker now matches the generator charset exactly.

### 🧼 Internal refactor (no behavior change)
- Extracted a single `RevealableQr` component shared by the decrypted-secret modal's seed and plain-text branches. The security-sensitive reveal/blur behavior (blur by default, mount the live QR canvas only while revealed, disable download until revealed) now has **one source of truth** instead of ~90 lines of drifting duplication. All invariants re-verified end-to-end.
- Consolidated the QR-PNG download plumbing into shared helpers.
- Derived password strength from state instead of storing it (removed a state variable and its sync points); dropped a `React.memo` that could never bail out.
- Migrated the deprecated `qrcode.react` default export to the named `QRCodeCanvas` (behavior-identical; avoids a break on the library's next major).

### 🧹 Dead-code purge
- Removed a broken `lint` script (Next 16 dropped `next lint` and there's no ESLint config), unused Tailwind theme colors + their CSS variables, unused font families, a duplicate CSS rule, and a no-op color entry.
- Added a `.gitignore` (the repo had none) for build output and OS cruft.

### 🧹 Housekeeping
- `CACHE_VERSION` bumped to `ittybitz-v2.6.0`; footer reads v2.6.0.

> ⚠️ **Full backward compatibility** — PBKDF2 (1,000,000 iterations), AES-256-GCM, and the encrypted file format are unchanged. Verified: a pre-release ciphertext still decrypts to its original secret.
