## v 2.1.0 — Redesign

A visual refresh and a fresh coat of paint on the dependency tree. **Cryptography is unchanged** — every file and text snippet encrypted with any prior version of IttyBitz still decrypts identically.

### 🎨 Apple-Inspired Redesign
- New dark aesthetic built around frosted-glass panels, radial amber/red gradient backgrounds, and SF-style typography
- Gradient hero headline: *"Encrypt anything. Trust nothing."*
- Pill-style segmented tabs (Encrypt / Decrypt) in the header — replacing the full-width gradient tab bar
- New drop zone with a soft dashed border and accent icon tile
- Password field now uses an iOS-style "Show / Hide" text pill instead of an eye icon
- Equal-width Copy / Clear / Generate action chips
- Amber→red gradient CTA with a subtle shadow glow on hover
- Three-up feature grid (AES-256-GCM · 100% Client-Side · No Accounts) restyled as bordered tiles

### 🔑 New Logo
- Redesigned as a keyhole squircle — a single gradient-filled rounded square with a keyhole cut in negative space
- Now ships as an **SVG master** (`public/logo.svg`) so every size renders crisply — no more pixelated rasters
- Dedicated maskable variant (`public/logo-maskable.svg`) for clean PWA icon masking on iOS/Android
- Favicon regenerated as a proper multi-resolution `.ico` (16 / 32 / 48 px)

### 🔒 Security — 9 Dependabot Alerts Patched
All addressed via `npm audit fix` — no breaking changes:

| Package | Severity | Patched |
|---|---|---|
| `next` | 6 alerts (high + moderate) | **16.2.4** — HTTP request smuggling, image cache DoS, postpone DoS, null-origin CSRF bypass (×2), RSC DoS |
| `picomatch` | 2 alerts (high + medium) | **2.3.2** — method injection in POSIX character classes, extglob ReDoS |
| `brace-expansion` | 1 alert (medium) | **2.1.0** — zero-step sequence hang / memory exhaustion |

### 🧹 Housekeeping
- `CACHE_VERSION` bumped to `ittybitz-v2.1.0` — returning users see a clean one-tap "new version available" banner
- Footer version string bumped to 2.1.0
- Dead `RadioGroup` import removed from the encryptor component

> ⚠️ **Full backward compatibility** — the crypto module (`src/lib/crypto.ts`) was not touched. Both format v0 (legacy) and v1 (IBTZ header) encrypted payloads decrypt exactly as before. PBKDF2 parameters, AES-GCM parameters, and key derivation are all identical.
