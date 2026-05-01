## v 2.3.0 — SeedQR + Data QR for decrypted output

A feature release focused on getting decrypted secrets *off the screen and into your hardware wallet* in one scan. **Cryptography is unchanged** — all prior-version encrypted data decrypts identically. The new code is purely a display-layer addition.

### 🌱 New: Standard SeedQR for BIP-39 seed phrases
When the decrypted text is a valid BIP-39 mnemonic, the QR button next to the result reads **"Show SeedQR"** and produces a [Standard SeedQR](https://github.com/SeedSigner/seedsigner/blob/main/docs/seed_qr/README.md) — each word's index in the BIP-39 wordlist (0–2047) zero-padded to four digits, concatenated as numeric data. Compatible with:

- Coldcard Q
- SeedSigner
- Sparrow Wallet
- Specter DIY
- Krux
- Keystone
- Blockstream Jade

Detection is provably correct — the app validates all four BIP-39 invariants:
1. Word count ∈ {12, 15, 18, 21, 24}
2. Every word in the canonical BIP-39 English wordlist
3. Words pack cleanly into 11-bit indices
4. The trailing checksum bits match `SHA-256(entropy)`

Random 24-word strings won't false-positive: they'd have to coincidentally pass an 8-bit checksum (1-in-256 odds for the worst case), and they'd have to be in the wordlist to begin with.

### 📦 New: Data QR for non-seed text
If the decrypted text isn't a BIP-39 phrase, the same button becomes **"Show QR"** and renders the full decrypted text as a plain QR (up to 2,953 characters — QR version 40, error-correction M, byte mode). Above that limit, a clear "too long" message replaces the QR.

### 🛡️ Security details
- **No download.** The QR for decrypted text never offers a "save as PNG" option. Plaintext seeds and secrets stay on-screen only.
- **Visible warning** on every modal: "Anyone who scans this QR can recover your seed/text. Show only on a trusted device and screen."
- **No new cryptographic primitives.** BIP-39 checksum verification uses `crypto.subtle.digest('SHA-256', ...)` directly from the Web Crypto API — independent of the encryption code path. `src/lib/crypto.ts` is unchanged.
- **State resets cleanly** when switching between encrypt and decrypt tabs.
- **Quiet zone.** The QR sits inside a white frame so reflective hardware-wallet cameras (Krux, SeedSigner) can lock onto it.

### 🙏 Credit
This feature began as a contribution from [@kennethlcrow](https://github.com/kennethlcrow) in [PR #9](https://github.com/seQRets/ittybitz/pull/9). The PR was scoped to a free-form QR input next to the decrypted text and a Coldcard-Q-tested round-trip. The spirit of the proposal — including the "no download for plaintext QRs" instinct — is preserved here. This release advances the idea by auto-detecting BIP-39 and switching to Standard SeedQR encoding so hardware-wallet seed import works in one scan.

### 🧹 Housekeeping
- `CACHE_VERSION` bumped to `ittybitz-v2.3.0`
- Footer reads v 2.3.0
- Embedded BIP-39 English wordlist (sha256 `2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda`) — adds ~13 KB to the bundle, no network fetches

> ⚠️ **Full backward compatibility** — both format v0 (legacy) and v1 (IBTZ header) encrypted payloads decrypt exactly as before. The encrypt path is untouched.
