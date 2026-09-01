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

**This is the only copy of the recovery tool in the repository. Edit it here.**

Next.js serves static files exclusively from `public/`, so a copy has to exist there for the dev server to serve it and for the production build to emit it into `out/`. That copy is *generated*, not committed:

```
Recover/ittybitz-recovery.html   ← the one tracked file; edit this
        │
        │  scripts/sync-recovery.mjs  (runs on every npm run dev / npm run build)
        ▼
public/ittybitz-recovery.html    ← generated, gitignored, never edited
        │
        ▼
out/ittybitz-recovery.html       ← published as ittybitz.app/ittybitz-recovery.html
```

Two committed copies of a decryption tool would be a drift hazard — someone edits one, the other silently goes stale, and a published checksum stops meaning anything. Generating the served copy removes that risk structurally: there is nothing to keep in sync, because the second file does not exist until build time.

`npm run test:crypto` reads this file directly, so the 32-fixture replay always tests the copy you edited, with no build step in between.
