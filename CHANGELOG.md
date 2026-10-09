# Changelog

Every IttyBitz release, newest first. Full notes for each version live in [`docs/releases/`](docs/releases/) and on the [GitHub releases page](https://github.com/seQRets/ittybitz/releases).

> **Cryptography has never changed.** Key derivation has been identical since v1.0 — PBKDF2-SHA256 @ 1,000,000 iterations, AES-256-GCM, 16-byte salt, 12-byte IV. Only two container formats have ever existed: **v0** (headerless, v1.0–v1.4.0) and **v1** (`IBTZ` header, v2.0.0 onward). Anything encrypted with any version still decrypts today, and `npm run test:crypto` proves it against real ciphertexts from every release.

## 3.x

| Version | Date | Summary |
|---|---|---|
| [**3.0.15** 🦕 Iguanodon](docs/releases/v3.0.15.md) | 2026-10-09 | Encrypting now requires ticking **I have saved this password somewhere safe** (the password is cleared on encrypt; the box unticks when the password changes); shorter post-encrypt and key-file messages; README corrections. Cryptography untouched. |
| [**3.0.14** 🦕 Iguanodon](docs/releases/v3.0.14.md) | 2026-10-09 | Generated key files are named by their fingerprint (`ittybitz-key-[0e64cc39].bin`); key-file fingerprints shown in square brackets; the notice no longer advises keeping the key file with the password. Cryptography untouched. |
| [**3.0.13** 🦕 Iguanodon](docs/releases/v3.0.13.md) | 2026-10-09 | Faint hint grey raised to `#838391` to meet WCAG AA contrast (was 3.9:1) in the app, the Recovery tool and the old-PWA offline notice. Found by Dean Rie. No file changes size; cryptography untouched. |
| [**3.0.12** 🦕 Iguanodon](docs/releases/v3.0.12.md) | 2026-10-09 | Review fixes from Dean Rie: several files at once, key-file fingerprint, printable emergency card for encrypted text, empty key files refused, keyboard tabs and other accessibility and privacy fixes, CI reproducibility check. Sizes corrected (Recovery tool 30 KB). Cryptography untouched. |
| [**3.0.11** 🦕 Iguanodon](docs/releases/v3.0.11.md) | 2026-09-26 | The Recovery tool's subtitle carries a **Download this tool** link, visible before scrolling. |
| [**3.0.10** 🦕 Iguanodon](docs/releases/v3.0.10.md) | 2026-09-26 | The live Recovery tool offers its own download (**Download this tool** in its footer), and its version label now tracks the app release instead of the file's own version. |
| [**3.0.9** 🦕 Iguanodon](docs/releases/v3.0.9.md) | 2026-09-26 | Footer: **Recovery tool** opens the live tool again (the hero line and feature card keep the download); **Download app** renamed **Download IttyBitz app**. Recovery tool unchanged. |
| [**3.0.8** 🦕 Iguanodon](docs/releases/v3.0.8.md) | 2026-09-26 | The Recovery tool is now explained on the page (a **Recoverable without us** feature card and a hero line) and the footer link downloads the release asset instead of opening the live recovery page. Recovery tool unchanged. |
| [**3.0.7** 🦕 Iguanodon](docs/releases/v3.0.7.md) | 2026-09-24 | Secret text is blurred from the first character typed or pasted (click the eye to reveal). The app never reads the clipboard: auto-clear no longer triggers a clipboard-permission prompt a minute after a copy; the seed fingerprint is cleared together with the secret after encrypting. Recovery tool unchanged. |
| [**3.0.6** 🦕 Iguanodon](docs/releases/v3.0.6.md) | 2026-09-23 | The Recovery tool shows its version in its footer (the file's own version, bumped only when the file changes, so a copy on an old USB stick can be matched to its release checksum); READMEs corrected to 27 KB. |
| [**3.0.5** 🦕 Iguanodon](docs/releases/v3.0.5.md) | 2026-09-12 | New layout: logo and **IttyBitz** headline centred at the top, Encrypt / Decrypt switch moved into the card above File / Text. Bug fixes from a code review: plain QR of decrypted text now encodes UTF-8 (non-Latin-1 text scanned to garbage); a save-your-password notice appears the moment a password is accepted (green border or Generate), while it is still on screen, since the field is cleared after encrypting; deferred blob-URL revoke so Safari does not cancel downloads. CSP hash scanner hardened against `<script>` inside HTML comments; stale comments removed. No crypto changes. |
| [**3.0.4** 🦕 Iguanodon](docs/releases/v3.0.4.md) | 2026-09-12 | Security hardening: hash-pinned CSP (`script-src 'sha256-…'`, no `unsafe-inline`) in both files; JS anti-framing guard; published `SHA256SUMS.txt` + `update-csp-hashes.mjs`. No behavior or crypto changes. |
| [**3.0.3** 🦕 Iguanodon](docs/releases/v3.0.3.md) | 2026-09-08 | Permanent **Download app** link in the footer, so getting the file no longer depends on the dismissible banner; it serves the published release asset rather than a "Save Page As" copy, which is unverifiable against the release checksum. |
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

Release names are dinosaur-themed. Since [v3.0.0](docs/releases/v3.0.0.md) IttyBitz is a single static file, so each release: sets the footer version in `scripts/build/head.html` and runs `npm run build` (which reassembles `site/index.html`, pins each inline `<script>` block into both shipped files' CSP as a `'sha256-…'` source, and regenerates `SHA256SUMS.txt`); bumps the version in `package.json`; runs `npm run test:crypto` (must pass); adds a notes file at `docs/releases/vX.Y.Z.md`; adds a row to this file; repins the recovery download links in `README.md` and `Recover/README.md`; then publishes the two HTML files **and `SHA256SUMS.txt`** as verified assets. Copy the built files to their release-asset names first so they match `SHA256SUMS.txt` (which the `sw.js` migration page and offline banner point users to):

```bash
cp site/index.html ittybitz.html
cp site/ittybitz-recovery.html ittybitz-recovery.html
gh release create vX.Y.Z --title "vX.Y.Z 🦕 Name" --notes-file docs/releases/vX.Y.Z.md --latest \
  ittybitz.html ittybitz-recovery.html SHA256SUMS.txt
```
