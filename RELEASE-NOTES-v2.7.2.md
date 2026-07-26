## v2.7.2 🦖 Velociraptor — postcss advisory fix

A security-hygiene patch. **No user-facing changes, and cryptography is unchanged** — `src/lib/crypto.ts` was not touched, and the regression suite was re-run: v1 round-trips (text, binary + key file), wrong-password rejection, `IBTZ\x01` header layout, and legacy v0 (headerless) ciphertexts all decrypt exactly as before. Every previously encrypted file restores identically.

### 🔒 Cleared a high-severity postcss advisory

[GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) — *PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure*. Fixed by raising the `postcss` override from `^8.5.13` to `^8.5.18` (resolves to 8.5.23).

Notes:

- postcss is a **build-time** dependency (Tailwind's CSS pipeline). It never ships to the browser, so this was never exploitable against users of the deployed site — it's a build-pipeline hardening fix.
- The advisory was not caught automatically: the project's existing `postcss` override pinned the vulnerable range, and Dependabot's own update run for it failed. Worth remembering that overrides can mask advisories from the automated tooling.
- `npm audit fix --force` "resolves" this by downgrading Next.js to 9.3.3 — **do not run it**. The override bump is the correct fix.

`npm audit`: **0 vulnerabilities**.

### 📦 Dependency maintenance

Merged the outstanding Dependabot queue (all verified against a clean build and a full UI pass):

- **GitHub Actions pins refreshed** — `checkout` v4.3.1 → v7.0.1, `setup-node` v4.4.0 → v7.0.0, `upload-pages-artifact` v3.0.1 → v5.0.0, `deploy-pages` v4.0.5 → v5.0.0. This also clears the Node 20 deprecation warning that had been appearing in every deploy log. All actions remain SHA-pinned.
- **Radix UI refreshed** — `react-slot`, `react-tabs`, `react-switch` (all within existing semver ranges). Tab switching, the key-file toggle, `asChild` slot rendering, and a full encrypt→decrypt round-trip with seed-border validation were verified in the browser.
- **`@types/node`** 20 → 26, and a transitive `sucrase`/`brace-expansion` cleanup.

**TypeScript 7 was evaluated and rejected** — it is the native (`tsgo`) port and drops the JS compiler API that Next.js requires, failing the build outright. Tracked separately; TypeScript 6 is the viable path.

### Verified
- `npm audit` clean; `npm run typecheck` clean; production build clean with CSP hashes applied to all pages and zero residual `unsafe-inline`.
- Crypto regression suite passed, including decryption of a legacy headerless (v0) ciphertext.
