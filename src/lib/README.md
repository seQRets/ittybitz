# src/lib — reference implementations

These two files are not part of the shipped app. They are kept as **test
oracles**: `scripts/crypto-regression.mts` imports them to prove that the
single-file app and the Recovery tool behave exactly as IttyBitz always has.

- **`crypto.ts`** is the original encrypt/decrypt code for the v0 and v1
  container formats (PBKDF2-SHA256, 1,000,000 iterations, AES-256-GCM). It is
  **frozen**: people hold long-lived secrets encrypted with it, so it must
  never change. The test suite decrypts every historical ciphertext with it
  and checks that the app opens what it produces.
- **`bip39.ts`** holds the canonical BIP-39 English wordlist and the seed
  validation and SeedQR encoding the app is checked against. `npm run build`
  copies the wordlist from here into the app, so the two can never drift;
  after changing this file, run `npm run build`.

Both start with `"use client";`, a leftover from the React version of
IttyBitz (before 3.0.0). It does nothing here, and it stays so that
`crypto.ts` remains byte-for-byte the code that encrypted those files.

The current v2 format (Argon2id) is not implemented here; see
`scripts/build/crypto-core.js` and `scripts/build/argon2.wat`.
