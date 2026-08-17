## v2.8.0 🦕 Triceratops — modernized stack, proven against every version ever shipped

Three horns for three pieces of work: React 19, Tailwind CSS v4, and a cross-version fixture corpus that proves the whole thing still opens files encrypted by any IttyBitz release, ever. **No user-facing changes, and cryptography is unchanged** — `src/lib/crypto.ts` was not touched.

### 🔐 Every version ever shipped, verified

The headline isn't the dependency bumps — it's what now guards them.

Investigating the repository's history established the facts this rests on. **Key derivation has never changed:** PBKDF2-SHA256 @ 1,000,000 iterations, AES-256-GCM, 16-byte salt, 12-byte IV, UTF-8 password bytes, key file appended after the password — byte-for-byte identical from v1.0 to today, with only TypeScript ceremony and comments differing along the way. And exactly **two wire formats** exist in the wild:

```
v0   salt(16) || IV(12) || ciphertext                    (v1.0 – v1.4.0)
v1   "IBTZ" || 0x01 || salt(16) || IV(12) || ciphertext  (v2.0.0 – now)
```

That made a much stronger test possible than testing against a stand-in. The real `crypto.ts` was extracted from **all 17 released tags** and executed directly: encrypt with each version's own code, then decrypt with the current implementation. **144 ciphertexts** — 18 versions × 4 payload types (12-word seed, 24-word seed, unicode/emoji, ASCII) × with and without a key file — **every one decrypts correctly**, both before and after the upgrades in this release.

32 of those are now frozen as permanent fixtures spanning the era boundaries (v1.0, v1.4.0, v2.0.0, v2.7.3) and both wire formats. The suite runs **45 checks in about 3 seconds**, on every push and pull request:

```bash
npm run test:crypto
```

Fixtures are append-only. Each entry is a promise that a real person's file still opens.

### ⚛️ React 19.2

Next 16 accepts React 18 or 19, and all seven Radix packages already declared `^19` support, so this was a clean move. It was also overdue: React 18 has had no release since 18.3.1 in April 2024, while React ships an active backport channel for 19.0.x — staying on 18 meant the next advisory would have forced an upgrade under pressure instead of by choice.

`forwardRef` is deprecated but still functional in 19, so none of the 18 `forwardRef` components needed rewriting. The only source change was widening one ref type, since React 19's `useRef<T>(null)` now yields `RefObject<T | null>`.

### 🎨 Tailwind CSS v4

Configuration moves from `tailwind.config.ts` (now deleted) into a CSS-first `@theme` block, the PostCSS plugin becomes `@tailwindcss/postcss`, and the custom component layer becomes `@utility`. Migrated with the official upgrade tool, then reviewed and verified by hand.

`tailwindcss-animate` turned out to load fine under v4 via the `@plugin` directive, so no swap to `tw-animate-css` was needed — avoiding trading a stable dependency for one with its own v2 breaking change pending.

Two details were chased down specifically, because a silent CSS regression here would be a *wrong signal* rather than a cosmetic bug:

- **Blur protection.** v4 renames `blur-sm` → `blur-xs`. Verified the class migrated correctly and that `--blur-xs` resolves to `4px`, computing to `filter: blur(4px)` — identical strength to v3, on both the secret input and the decrypted output.
- **Seed-validation borders.** `--color-success` and `--color-destructive` survive the `@theme` migration. All eight states re-verified: valid 12-word and 24-word seeds green; swapped words, a single typo, and a bad 24-word checksum red; plain sentence, short text, and prose neutral.

### Verified
- 144-ciphertext cross-version corpus decrypts after both upgrades; 45-check suite passing.
- **SeedQR output byte-identical** — PNG hashes unchanged through qrcode.react v4, React 19, and Tailwind v4, with the 4-module quiet zone intact. Printed seed backups are unaffected.
- Reveal invariants intact: zero canvases mounted while the QR is hidden, download gated on reveal, canvases unmounted again on hide.
- Toast and dialog animations running, mobile layout correct, no console errors.
- `npm run typecheck` clean, production build clean with CSP hashes on all pages and zero residual `unsafe-inline`, `npm audit` reporting 0 vulnerabilities.
