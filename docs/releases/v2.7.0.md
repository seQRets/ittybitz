## v2.7.0 🦖 Velociraptor — leaner, faster, review burn-down

Named for the small, fast hunter, because this release makes the app lighter on its feet: the initial bundle sheds the embedded BIP-39 wordlist, and every remaining Info-level item from the last security review is now closed. **Cryptography is unchanged** — `src/lib/crypto.ts` was not touched, and the full regression suite was re-run: v1 encrypt/decrypt round-trips (text, binary + key file), wrong-password rejection, `IBTZ\x01` header layout, and a headerless legacy **v0** ciphertext all decrypt exactly as before. Every prior encrypted file restores identically.

### ⚡ Lazy-loaded BIP-39 wordlist
The ~13 KB embedded English wordlist no longer ships in the initial bundle — it now builds as its own code-split chunk, loaded on demand:

- The chunk is **warmed in the background right after page load**, so the service worker caches it while you're online and **offline seed detection keeps working** (important for air-gapped use).
- If the chunk somehow can't load (offline before it was ever cached), decryption still succeeds — the output is simply treated as plain text instead of failing.
- Seed detection also moved out of a render effect and into the decryption flow itself, so the QR status is set exactly once, when the result is produced.

### 🔒 Security polish
- **Best-effort erase of the result buffer.** After encryption/decryption output is handed off (download, textarea, or QR), the intermediate `ArrayBuffer` is zeroed. This matters most on decrypt, where the buffer briefly held your plaintext. (Best-effort, as always with JS memory — same caveats as `secureErase`.)
- **v0/`IBTZ` magic collision documented.** A legacy headerless ciphertext whose random salt happens to begin with the 4 bytes `IBTZ` (probability 2⁻³² per ciphertext) would be misparsed as a versioned container and fail to decrypt with a confusing error. Impact is availability-only for that one blob — no key or plaintext exposure — and fixing it would require changing the frozen crypto module. Documented as an accepted non-issue in `SECURITY-AUDIT.md` (Informational §5).

### 🐛 Fixes
- **Toast dismiss delay typo.** The stock shadcn `TOAST_REMOVE_DELAY = 1000000` (≈16.7 minutes!) meant dismissed toasts lingered in the DOM long after their exit animation. Now 1 second. Also fixed the listener re-subscription on every toast update.
- **`apple-touch-icon` size declaration** now matches the actual file (1024×1024, was declared 180×180).
- **Service worker precache dedup.** `/` and `/index.html` were both precached (same document, fetched twice on install). Only `/` is precached now, and offline navigations to any path fall back to the cached app shell.

### 📦 Dependency hygiene
- **Cleared the `sharp` high-severity advisory** ([GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), inherited libvips CVEs) via a package override to `sharp ^0.35.0` — Next's own dependency range still pins the vulnerable line. `sharp` is a build-time optional dependency; this static-export app never uses `next/image` optimization, so this is pure hygiene. `npm audit`: **0 vulnerabilities**.
- Bumped `next` 16.2.6 → 16.2.11 (patch releases within the same minor).

### 🧹 Internal cleanup
- Removed unused shadcn exports (`ToastAction`, `DialogFooter`, `DialogClose`) and the dead `action` plumbing in the toaster.
- `renderContent` now uses its `currentMode` parameter consistently instead of mixing it with the `mode` state.
- Feature cards are generated from a data array instead of repeated JSX.

### Verified
- `npm run typecheck` and production build clean; CSP hash post-processing tightened all pages with zero residual `unsafe-inline`.
- Live UI pass: encrypt → decrypt round-trip of a known BIP-39 test vector, SeedQR auto-detection via the lazy chunk, blur-by-default modal invariants (QR canvas only mounted while revealed; download gated on reveal).
