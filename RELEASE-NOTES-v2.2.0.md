## v 2.2.0 — Polish

A small feature release with UX refinements and a logo tune-up. **Cryptography is unchanged** — all prior-version encrypted data decrypts identically.

### 🙈 New: Show/Hide Toggle on the Secret Text Field
The plaintext input in **Encrypt → Text** mode was unconditionally visible — a shoulder-surfing risk when entering sensitive material like seed phrases or private keys. It now has the same blur toggle as the decrypted output:

- Defaults to **visible** (consistent with typing into any form field)
- Eye icon top-right of the textarea blurs the field on demand
- Only appears in encrypt mode; decrypt-mode input is ciphertext so blurring it would be purely cosmetic
- Resets to visible on mode change

### ✍️ Password Placeholder Differentiated by Mode
- **Encrypt:** *"Enter a strong password"* (unchanged)
- **Decrypt:** *"Enter decryption password"* — the old copy implied the user should generate a strong password at decrypt time, which is misleading. Decryption just recalls the password set at encryption.

### 🔑 Logo Polish
- **Tighter header corners** — at 28px, the iOS-squircle logo combined with Tailwind's `rounded-lg` read as a solid circle. The header now inlines the same keyhole geometry with a gentler `rx=48/512` (≈9.4%) for a clean rounded square. The PWA icon and favicon keep the iOS squircle because platform conventions expect that shape there.
- **Richer gradient** — mid-stop pulled from 50% → 20%, so the yellow reads as a corner highlight and the orange→red range dominates the mark. Same colors, more saturated feel at every size.

### 🐛 Favicon Fix
A stray `src/app/favicon.ico` (unrelated to IttyBitz branding, sitting there since February) was silently overriding `/public/favicon.ico` via Next 13+'s app-directory convention. Deleted it so the keyhole favicon now actually ships.

### 🧹 Housekeeping
- `CACHE_VERSION` bumped to `ittybitz-v2.2.0` — returning users see the "new version available" banner and a clean reload picks up the updated SW

> ⚠️ **Full backward compatibility** — the crypto module (`src/lib/crypto.ts`) was not touched. Both format v0 (legacy) and v1 (IBTZ header) encrypted payloads decrypt exactly as before.
