# Changelog

Every IttyBitz release, newest first. Full notes for each version live in [`docs/releases/`](docs/releases/) and on the [GitHub releases page](https://github.com/seQRets/ittybitz/releases).

> **Cryptography has never changed.** Key derivation has been identical since v1.0 — PBKDF2-SHA256 @ 1,000,000 iterations, AES-256-GCM, 16-byte salt, 12-byte IV. Only two container formats have ever existed: **v0** (headerless, v1.0–v1.4.0) and **v1** (`IBTZ` header, v2.0.0 onward). Anything encrypted with any version still decrypts today, and `npm run test:crypto` proves it against real ciphertexts from every release.

## 3.x

| Version | Date | Summary |
|---|---|---|
| [**3.0.2** 🦕 Iguanodon](docs/releases/v3.0.2.md) | 2026-09-03 | BIP-39 master fingerprint (encrypt, decrypt, and beside the SeedQR); QR modal shows a blurred QR instead of a blank box; shorter SeedQR modal; horizontal non-overlapping result/secret controls; action-based eye icons; readable secret font + copy button; offline-download banner. |
| [**3.0.1** 🦕 Iguanodon](docs/releases/v3.0.1.md) | 2026-09-03 | Inline favicon; footer centered on mobile; gentle migration worker retires the old PWA — online it loads the single-file app, offline it points installed users to the download. |
| [**3.0.0** 🦕 Iguanodon](docs/releases/v3.0.0.md) | 2026-09-03 | **The single-file era.** The whole app is now one self-contained HTML file — no framework, no build for users, no service worker, zero dependencies. Offline is "save the file." Cryptography unchanged and gated in CI in both directions against the frozen reference. |

## 2.x

| Version | Date | Summary |
|---|---|---|
| [**2.9.3** 🦕 Archaeopteryx](docs/releases/v2.9.3.md) | 2026-09-02 | Offline PWA hardening — no more blank screen; the worker self-repairs on the next online open |
| [**2.9.2** 🦕 Archaeopteryx](docs/releases/v2.9.2.md) | 2026-09-02 | Recovery app: key file clears on tab switch; footer simplified to a repo link |
| [**2.9.1** 🦕 Archaeopteryx](docs/releases/v2.9.1.md) | 2026-09-02 | Nine defects from a code review — key-file toggle could be silently ignored; recovery app hardening; spurious first-install banner; Base64 errors named correctly |
| [**2.9.0** 🦕 Archaeopteryx](docs/releases/v2.9.0.md) | 2026-09-01 | **Standalone Recovery app** — one offline HTML file that decrypts your data without this project existing; offline PWA fixed (it never worked) |
| [**2.8.2** 🦕 Triceratops](docs/releases/v2.8.2.md) | 2026-08-31 | Next.js 16.3.3 — two Critical RCE advisories patched upstream (not reachable in a static export); supply chain verified against the registry |
| [**2.8.1** 🦕 Triceratops](docs/releases/v2.8.1.md) | 2026-08-25 | Password generator could emit a password failing the app's own strength gate (1 in 41); BIP-39/SeedQR gated in CI; `npm ci --ignore-scripts` |
| [**2.8.0** 🦕 Triceratops](docs/releases/v2.8.0.md) | 2026-07-27 | React 19, Tailwind CSS v4, and a cross-version fixture corpus proving ciphertexts from all 17 prior releases still decrypt |
| [**2.7.3** 🦖 Velociraptor](docs/releases/v2.7.3.md) | 2026-07-26 | Permanent crypto regression gate in CI; lucide-react v1 and qrcode.react v4 |
| [**2.7.2** 🦖 Velociraptor](docs/releases/v2.7.2.md) | 2026-07-26 | postcss advisory fix (GHSA-r28c-9q8g-f849); Dependabot queue drained |
| [**2.7.1** 🦖 Velociraptor](docs/releases/v2.7.1.md) | 2026-07-24 | Live BIP-39 seed validation — green/red border feedback, checksum-verified |
| [**2.7.0** 🦖 Velociraptor](docs/releases/v2.7.0.md) | 2026-07-24 | Lazy-loaded BIP-39 wordlist, result-buffer erase, review burn-down |
| [**2.6.0** 🦕 Ankylosaurus](docs/releases/v2.6.0.md) | 2026-07-04 | Supply-chain hardening: SHA-pinned actions, scoped job permissions, fail-closed CSP guard |
| [**2.5.0** 🦖 T-Rex](docs/releases/v2.5.0.md) | 2026-06-12 | Security hardening and QR workflow polish |
| [**2.4.0**](docs/releases/v2.4.0.md) | 2026-05-06 | QR polish and dependency hygiene |
| [**2.3.0**](docs/releases/v2.3.0.md) | 2026-05-01 | SeedQR + Data QR for decrypted output — scan straight into a hardware wallet |
| [**2.2.0**](docs/releases/v2.2.0.md) | 2026-04-22 | UX refinements and logo tune-up |
| [**2.1.0**](docs/releases/v2.1.0.md) | 2026-04-22 | Visual redesign |
| [**2.0.0** 🔑 Lockdown](docs/releases/v2.0.0.md) | 2026-03-14 | Independent security audit, PWA support, zero external requests, `IBTZ` container format introduced |

## 1.x

Detailed notes for these predate the `docs/releases/` files and live on the releases page.

| Version | Date | Summary |
|---|---|---|
| [**1.4.0**](https://github.com/seQRets/ittybitz/releases/tag/v1.4.0) | 2026-02-26 | Desktop app shell and security hardening |
| [**1.3**](https://github.com/seQRets/ittybitz/releases/tag/v1.3) | 2026-01-13 | Version 1.3 |
| [**1.2.1**](https://github.com/seQRets/ittybitz/releases/tag/v1.2.1) | 2025-12-04 | Version 1.2.1 |
| [**1.2**](https://github.com/seQRets/ittybitz/releases/tag/v1.2) | 2025-11-14 | Version 1.2 |
| [**1.1**](https://github.com/seQRets/ittybitz/releases/tag/v1.1) | 2025-08-20 | Version 1.1 |
| [**1.0**](https://github.com/seQRets/ittybitz/releases/tag/v1.0) | 2025-08-17 | Initial release |

---

### How releases are made

Release names are dinosaur-themed. Since [v3.0.0](docs/releases/v3.0.0.md) IttyBitz is a single static file, so each release: sets the footer version in `scripts/build/head.html` and runs `npm run build` to reassemble `site/index.html`; bumps the version in `package.json`; runs `npm run test:crypto` (must pass); adds a notes file at `docs/releases/vX.Y.Z.md`; adds a row to this file; repins the recovery download links in `README.md` and `Recover/README.md`; then is published with the two HTML files as verified assets:

```bash
gh release create vX.Y.Z --title "vX.Y.Z 🦕 Name" --notes-file docs/releases/vX.Y.Z.md --latest \
  ittybitz.html ittybitz-recovery.html
```
