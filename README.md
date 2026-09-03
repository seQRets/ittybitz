# 🔒 IttyBitz

<br/>

**Tired of worrying where your private files and notes end up?**

With this client-side encryption tool, you can lock down your sensitive information right in your browser—nothing ever leaves your device. 
Whether you’re protecting confidential work documents before sharing them, or storing personal notes you don’t want synced to the cloud, this tool makes security effortless.

IttyBitz offers a secure and private way to encrypt sensitive information directly in your browser without ever sending it to a server.

<p align=center>
<img width="800" alt="IttyBitz" src="docs/hero.svg" />
</p>

<br/>

> ### 🪶 Locked out? Start here.
>
> **[⬇️ Get the Recovery tool →](Recover/)**
>
> One 26 KB HTML file that decrypts your IttyBitz data with **no installation, no network and no dependencies** — even if this website, this project and its author are all gone. Save it next to your encrypted files.

<br/>

## ⚙️ Core features

Here’s what you can do with IttyBitz:
- **Client-side encryption/decryption**: all cryptographic operations happen in your browser. Your files and secrets are never sent to a server.
- **Password & key file protection**: secure your data with a strong password, an optional key file, or both for an added layer of security. You can use any existing file or generate a new, cryptographically secure key file directly within the app.
- **File & text support**: encrypt and decrypt both files and text snippets.
- **QR code sharing**: easily share encrypted text snippets via a downloadable QR code.
- **Hardware-wallet SeedQR export**: when decrypted text is a valid BIP-39 seed phrase, IttyBitz auto-detects it and can display a **Standard SeedQR** for direct import into hardware wallets (Coldcard, SeedSigner, Sparrow, Specter, Krux, Keystone, Jade). Any other decrypted text can be shown as a plain QR. Both are blurred until you deliberately reveal them.
- **One self-contained file**: the entire app is a single HTML file — no dependencies, no build, no service worker. Save it (or *File → Save Page As…* from [ittybitz.app](https://ittybitz.app)) and it runs offline forever, on an air-gapped machine, from a USB stick, in twenty years.
- **Privacy-focused UI**: the secret text field offers a show/hide blur toggle to prevent shoulder-surfing during input, and decrypted output is blurred by default until you tap to reveal.
- **Clipboard auto-clear**: copied passwords and output are wiped from the clipboard after 60 seconds (best-effort; requires the tab to retain focus).
- **Backward-compatible file format**: encrypted payloads include an `IBTZ` version header so the app can evolve without breaking old files. Anything encrypted with prior versions still decrypts identically.
- **No accounts required**: works entirely without user accounts or sign-ins.

<br/>

## 🥤 How to Use IttyBitz

At the top, you’ll find two simple tabs:  **Encrypt**  and **Decrypt**.

- In **Encrypt** mode, you can lock away a file or a text snippet with a password, a key file, or both.

| Encrypting a file | Encrypting text |
|---	|---	|
|	1.	Select the Encrypt tab.|	1.	Select the Encrypt tab.|   	
|	2.	Ensure the File option is selected.	|	2.	Choose the Text option.|
|	3.	Upload the file you wish to encrypt.|	3.	Enter your text in the provided box.|
|	4.	Enter a strong password. For extra security, toggle "Use Key File" to either select an existing file or generate and download a new one. |	4.	Enter a password. For extra security, toggle "Use Key File" to add a key file.|
|	5.	Click Encrypt and download the encrypted file for safekeeping.|	5.	After encrypting, you can copy the text, or click the **QR code icon** to view and download the encrypted output as a PNG file for easy, secure sharing.|

- In **Decrypt** mode, you simply unlock your protected content and get it back instantly—only if you hold the right key.

| Decrypting a file | Decrypting a text |
|---	|---	|
|	1.	Select the Decrypt tab.|	1.	Select the Decrypt tab.|   	
|	2.	Ensure the File option is selected.|	2.	Choose the Text option.|
|	3.	Upload the encrypted file.|		3.	Paste your encrypted text into the box.|
|	4.	Enter the same password (and the key file, if used) and click Decrypt.|		4.	Enter the password (and optional key file).|
|	5.	Download the decrypted file.|	5.	Copy the decrypted text output.|

<br/>

## 🛡️Security features

The security of your data is the highest priority. Here is a summary of the security measures built into IttyBitz:

- **Client-Side operations:** all encryption and decryption processes happen entirely within your browser. Your password, key files, and secret data are **never** transmitted over the internet or stored on any server.

- **Strong encryption standard:** IttyBitz uses **AES-256-GCM**, a modern authenticated encryption cipher that provides both confidentiality and data integrity.
- **Strong key derivation:** your password is not used directly as the encryption key. Instead, it is run through the **PBKDF2** (Password-Based Key Derivation Function 2) algorithm with **1,000,000 iterations**. This makes brute-force attacks against your password extremely slow and computationally expensive, even for weak passwords.
- **Cryptographically secure randomness:** the application uses `window.crypto.getRandomValues()` to generate the salt for key derivation, the Initialization Vector (IV) for AES-GCM, the random characters for the password generator, and the data for the key file generator. This is a cryptographically secure pseudo-random number generator (CSPRNG) that is suitable for security-sensitive applications.
- **Password strength indicator:** to encourage strong security practices, the UI provides real-time feedback, guiding users to create passwords that are at least 24 characters long and contain a mix of character types.
- **Best-effort memory clearing:** after an encryption or decryption operation is complete, the application overwrites sensitive variables (like the derived key and salt) in memory. Note: JavaScript's garbage collector may retain copies of data elsewhere in the heap, so this is a best-effort mitigation rather than a guarantee.
- **No user tracking:** the application does not use cookies, analytics, or trackers. Your activity is your own.

<br/>

## 🔬 Third-party validation

### **Independent security review**
This application has undergone a detailed security analysis. You can view the full report here: [Security analysis report](https://claude.ai/public/artifacts/f4bb6437-1130-4fd3-bc56-74b2399274f9) 🔗

The current audit findings and accepted tradeoffs are tracked in-repo: [SECURITY-AUDIT.md](SECURITY-AUDIT.md)

### **Open source advantage**
- **Transparent code**: every line of security code is publicly auditable
- **Community verified**: security experts worldwide can review our implementation
- **No hidden backdoors**: impossible to hide security vulnerabilities

### **Industry-standard algorithms**
- **FIPS-approved algorithms**: uses AES-256-GCM and PBKDF2-HMAC-SHA-256, which are approved under FIPS 140-2 (note: this app has not undergone formal FIPS certification)
- **Strong key derivation**: 1,000,000 PBKDF2 iterations to resist brute-force attacks
- **Privacy-focused design**: no accounts, no servers, no tracking — all operations stay in your browser

<br/>

## 🪶 Recovery tool — decrypt without IttyBitz

**[⬇️ Download it](https://github.com/seQRets/ittybitz/releases/download/v3.0.0/ittybitz-recovery.html)** (26 KB, one file) · [open it in your browser](https://ittybitz.app/ittybitz-recovery.html) · [how to save and use it](Recover/)

A standalone page that decrypts your IttyBitz files with **no dependencies, no network, no installation and no build step**. Save it alongside your encrypted data — on the same USB stick, the same backup drive, the same safe.

It exists so that recovering your own data never depends on this website resolving, on GitHub Pages serving, on this project still being maintained, or on its author still being around. Open it in any browser, on an air-gapped machine, in twenty years.

It is decrypt-only, its `Content-Security-Policy` blocks all network access outright, and CI replays 32 real ciphertexts from v1.0 onward through the exact published file on every change — so it cannot silently drift from the main implementation.

**[`Recover/`](Recover/) covers the rest**: how to save it to your own disk, how to verify its checksum, why it can be trusted, and where the file lives in this repository.

<br/>

## 📋 Release history

Every version, with what changed in each, is listed in the [**changelog**](CHANGELOG.md). Full notes per release live in [`docs/releases/`](docs/releases/).

Cryptography has never changed across any release — anything encrypted with any version of IttyBitz still decrypts today, and that guarantee is enforced automatically in CI against real ciphertexts from every prior release.

<br/>

## 📜 Licensing

IttyBitz is free software released under the [**GNU General Public License v3.0**](LICENSE).

You are free to use, modify, and distribute this software. Any derivative works must also be released under the GPLv3.

<br/>

## 💻 Run it locally / offline

IttyBitz is **one HTML file**. There is nothing to install, compile, or configure — not for you, not for anyone you share it with.

**Three ways to get a local copy:**

1. **Download it** from the [latest release](https://github.com/seQRets/ittybitz/releases/latest) — grab `ittybitz.html`, then double-click it. Done.
2. **Save the page**: open [ittybitz.app](https://ittybitz.app), then *File → Save Page As…* (⌘S / Ctrl+S). If your browser asks, choose **"Web Page, HTML Only"** — it is a single file, so "Complete" only adds a folder you don't need.
3. **Clone the repo** and open `site/index.html`, or serve it:

```bash
git clone https://github.com/seQRets/ittybitz.git
cd ittybitz
npm run dev   # serves site/ at http://localhost:9002
```

Once you have the file it works with the network disconnected — Web Crypto runs in your browser, and nothing is fetched, uploaded, or logged. A `Content-Security-Policy` in the file enforces that: it cannot make a network request even if it tried.

**Verify it before you trust it** (recommended for a security tool):

```bash
shasum -a 256 ittybitz.html
```

Compare against the checksum published with the [release](CHANGELOG.md). The file is byte-identical wherever you got it — the website, the release asset, or this repository's `site/index.html`.

### 🧰 Build from source (contributors only)

You never need this to *use* IttyBitz — the shipped [`site/index.html`](site/index.html) is the product. The build exists so that file is reproducible from small, auditable parts.

```bash
npm run build        # reassembles site/index.html from scripts/build/*
npm run test:crypto  # crypto regression gate (zero dependencies)
```

`build` concatenates the hand-written page, the vendored [`qrcode-generator`](https://github.com/kazuhikoarase/qrcode-generator) (MIT), the DOM-free crypto core, and a BIP-39 core generated from `src/lib/bip39.ts` (so the wordlist can never drift). `test:crypto` proves the assembled file both decrypts every historical ciphertext **and** round-trips against the frozen reference implementation in [`src/lib/crypto.ts`](src/lib/crypto.ts) — in both directions, with and without key files.

There are **no runtime or build dependencies**: `node` (22.6+, for native TypeScript stripping) and Python 3 (only for `npm run dev`'s static server) are all that is used.

## ❤️ Support this project

If you find IttyBitz useful, please consider supporting its development. Your donation helps keep the project alive and ad-free.

**Donate:** [https://coinos.io/seQRets/receive](https://coinos.io/seQRets/receive)
