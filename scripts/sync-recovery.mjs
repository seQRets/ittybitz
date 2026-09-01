/**
 * Stages the standalone recovery tool for serving.
 *
 * The tool lives at Recover/ittybitz-recovery.html — top level, where a user
 * locked out of their data can actually find it. That is the ONE copy in this
 * repository, and the only one anybody should ever edit.
 *
 * But Next.js serves static files exclusively from public/, so the file has to
 * be present there for `next dev` to serve it and for `next build` to emit it
 * into out/. Rather than keep a second copy under version control — two copies
 * of a decrypt tool is a drift hazard, and the whole point is that this file
 * is trustworthy — public/ittybitz-recovery.html is generated here, gitignored,
 * and rewritten before every dev run and every build.
 *
 * Net effect: one tracked copy, one published URL, no chance of the two
 * disagreeing, because one of them does not exist until build time.
 */
import { copyFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, "..", "Recover", "ittybitz-recovery.html");
const DEST = join(HERE, "..", "public", "ittybitz-recovery.html");

if (!existsSync(SOURCE)) {
  console.error(
    `sync-recovery: FATAL — canonical recovery file missing at Recover/ittybitz-recovery.html.\n` +
      `  Without it the app ships a footer link and a service-worker precache entry\n` +
      `  pointing at a file that does not exist. Restore it before building.`
  );
  process.exit(1);
}

mkdirSync(dirname(DEST), { recursive: true });
copyFileSync(SOURCE, DEST);

const sha = createHash("sha256").update(readFileSync(DEST)).digest("hex");
const kb = (readFileSync(DEST).byteLength / 1024).toFixed(1);
console.log(
  `sync-recovery: Recover/ittybitz-recovery.html -> public/ (${kb} KB, sha256 ${sha.slice(0, 8)})`
);
