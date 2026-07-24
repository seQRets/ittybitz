## v2.7.1 🦖 Velociraptor — seed-phrase validation borders

A focused follow-up to v2.7.0 adding one safety feature: **live BIP-39 seed-phrase validation, signaled by a subtle border tint** — no text, no badges, nothing a shoulder-surfer can read. **Cryptography is unchanged** — `src/lib/crypto.ts` was not touched, and the regression suite was re-run: v1 round-trips (text, binary + key file), wrong-password rejection, header layout, and legacy v0 (headerless) ciphertexts all decrypt exactly as before.

### 🟢🔴 Seed-phrase border feedback

**Encrypt → Text:** as you type, IttyBitz checks whether the input is a valid BIP-39 seed phrase (full checksum verification — the same integrity check a hardware wallet performs on import):

- **Green border** — genuinely valid seed phrase. Safe to encrypt as a wallet backup.
- **Red border** — *seed-shaped but invalid*: the right word count (12/15/18/21/24) with a swapped word, a misspelling, or a failing checksum. In other words: a likely transcription error, caught **before** it gets encrypted into a long-term backup.
- **Normal border** — ordinary text. Non-seed secrets are never nagged; a regular 12-word sentence stays neutral.

**Decrypt → Result:** the same border language on the decrypted output. Green confirms your restored backup is a valid seed; red warns that the stored backup itself is seed-shaped but fails validation — worth knowing *before* you need it.

The signal is deliberately color-only and works even while the field is blurred, consistent with the app's shoulder-surfing posture. Validation runs entirely client-side using the lazy-loaded wordlist chunk introduced in v2.7.0, so it works offline and adds nothing to the initial bundle.

### Internal
- `validateBip39()` failure results now carry a `seedShaped` flag (valid word count, at most one unrecognized word). The checksum logic is unchanged.

### Verified
- All eight border states exercised live: valid seed, swapped words, single typo, plain 12-word sentence, short text, ciphertext input (neutral), decrypted valid seed (green + SeedQR), decrypted invalid seed-shaped backup (red + plain QR).
- `npm run typecheck` and production build clean; CSP hash post-processing tightened all pages with zero residual `unsafe-inline`.
