# 🪶 IttyBitz Recovery

**[⬇️ Download `ittybitz-recovery.html`](ittybitz-recovery.html)** — one file, 26 KB, no installation.

This is the file that decrypts your IttyBitz data when nothing else is available.

It has no dependencies, makes no network requests, needs no build step and requires no installation. Open it in any browser — including on a machine that has never been online — and it decrypts your files and text.

**Save it next to your encrypted data.** On the same USB stick, the same backup drive, the same safe. A recovery tool you have to go and find is a recovery tool you don't have.

<br/>

## Why this folder exists

Recovering your own data should never depend on `ittybitz.app` resolving, on GitHub Pages serving, on this project still being maintained, or on its author still being around.

So the tool sits here, at the top level of the repository, where it stays easy to find years from now — not buried in a build directory that only makes sense to developers.

<br/>

## How to use it

1. Download `ittybitz-recovery.html` (link above, or use the file in this folder).
2. Open it in any browser. Double-clicking it works; no server needed.
3. Drop in your encrypted file, or paste your encrypted text.
4. Enter your password, and your key file if you used one.

That's it. Nothing is uploaded, because nothing *can* be uploaded — see below.

<br/>

## Verify it before you trust it

```bash
shasum -a 256 ittybitz-recovery.html
```

Compare the result against the checksum published with the [release](../CHANGELOG.md). The file is byte-identical wherever you get it — this folder, the website, or the release asset — so one checksum verifies them all.

<br/>

## What makes it trustworthy

- **Decrypt-only.** Half the code to audit. Create new secrets with the full app; this one only opens what you already have.
- **Verified against every release.** CI replays 32 real ciphertexts from v1.0 onward through this exact file on every change. If it ever disagreed with the main implementation about a real ciphertext, the build fails.
- **Enforced offline.** Its `Content-Security-Policy` blocks all network access outright. "Nothing is sent" is structurally true here, not a promise you have to take on faith.
- **Self-documenting.** The container format and key derivation are written into the file's own source, so your data stays recoverable even if the page itself never runs.

<br/>

## A note for maintainers

Two copies of this file exist, deliberately:

| Path | Purpose |
|---|---|
| `Recover/ittybitz-recovery.html` | Discoverable copy — what users find when browsing the repo |
| `public/ittybitz-recovery.html` | Served copy — becomes `ittybitz.app/ittybitz-recovery.html`, and is precached by the service worker for offline use |

They are **kept byte-identical by CI**. `npm run test:crypto` compares them and fails if they differ, so neither can silently go stale.

When editing the recovery tool, change `public/ittybitz-recovery.html` and copy it here:

```bash
cp public/ittybitz-recovery.html Recover/ittybitz-recovery.html
```
