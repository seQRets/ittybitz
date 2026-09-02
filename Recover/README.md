# 🪶 IttyBitz Recovery

### ⬇️ [**Download the Recovery tool**](https://github.com/seQRets/ittybitz/releases/download/v2.9.2/ittybitz-recovery.html)

*Saves `ittybitz-recovery.html` to your computer · 26 KB · no installation · works offline forever*

Or **[open it in your browser](https://ittybitz.app/ittybitz-recovery.html)** to use it right now without saving — but a copy on your own disk is the whole point.

<br/>

This is the file that decrypts your IttyBitz data when nothing else is available.

It has no dependencies, makes no network requests, needs no build step and requires no installation. Open it in any browser — including on a machine that has never been online — and it decrypts your files and text.

**Save it next to your encrypted data.** On the same USB stick, the same backup drive, the same safe. A recovery tool you have to go looking for is a recovery tool you don't have.

<br/>

## Where the file lives

This folder is a signpost, not a second copy. The tool itself is one file, kept in one place:

**📄 [`public/ittybitz-recovery.html`](../public/ittybitz-recovery.html)** — read the source in this repository. (This link shows the code; use the download link above to get the file itself.)

It sits in `public/` because that is the directory this site serves from, so the file needs no build step, no copying and no processing to reach [ittybitz.app/ittybitz-recovery.html](https://ittybitz.app/ittybitz-recovery.html). The simplest possible path from repository to your hands — which is the right property for the one file you may need when everything else has failed.

This folder exists so you can *find* it. Recovering your own data should never depend on knowing which directory a web framework serves from.

<br/>

## Getting the file onto your disk

**The download link above** is the direct route — your browser saves the file straight to your computer, no steps in between.

**If you would rather save it from the page**, or the link ever stops working:

1. Open **[ittybitz.app/ittybitz-recovery.html](https://ittybitz.app/ittybitz-recovery.html)**
2. Press **⌘S** (Mac) or **Ctrl+S** (Windows / Linux) — or use *File → Save Page As…*
3. If your browser offers a format, choose **"Web Page, HTML Only"** — not "Complete". The page is a single file; "Complete" adds a folder you don't need.
4. Save it wherever your encrypted data is — the same USB stick, the same backup drive.

A copy saved this way runs perfectly well. It may differ from the published file by a few bytes depending on the browser, so if you want the checksum below to match exactly, use the download link rather than Save As.

<br/>

## Using it

1. **Double-click the saved file.** It opens in your browser and runs from your disk. No server, no internet, no installation.
2. Drop in your encrypted file, or paste your encrypted text.
3. Enter your password, and your key file if you used one.

That's it. Nothing is uploaded, because nothing *can* be uploaded — see below.

You can disconnect from the network entirely first, and it will work exactly the same. That is the intended way to use it.

<br/>

## Verify it before you trust it

```bash
shasum -a 256 ittybitz-recovery.html
```

Compare the result against the checksum published with the [release](../CHANGELOG.md). The file is byte-identical wherever you got it — this repository, the website, or the release asset — so one checksum verifies them all.

<br/>

## What makes it trustworthy

- **Decrypt-only.** Half the code to audit. Create new secrets with the full app; this one only opens what you already have.
- **Verified against every release.** CI replays 32 real ciphertexts from v1.0 onward through this exact file on every change. If it ever disagreed with the main implementation about a real ciphertext, the build fails.
- **Enforced offline.** Its `Content-Security-Policy` blocks all network access outright. "Nothing is sent" is structurally true here, not a promise you have to take on faith.
- **Self-documenting.** The container format and key derivation are written into the file's own source, so your data stays recoverable even if the page itself never runs.
