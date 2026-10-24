#!/usr/bin/env node
/**
 * Refuse to run the crypto tests on a Node.js that cannot run them, with a
 * message a person can act on.
 *
 * The test suite needs Node.js 24.7 or newer: it is TypeScript run directly
 * (built-in type stripping) and it checks IttyBitz's Argon2id against Node's
 * own crypto.argon2Sync, which Node added in 24.7.0. On anything older the
 * suite would stop with a cryptic import error before printing a word, so
 * `npm run test:crypto` runs this plain-JavaScript check first.
 */
import { pathToFileURL } from 'node:url';

const MIN = [24, 7];

export function isRecentEnough(version) {
  const [major, minor] = String(version).replace(/^v/, '').split('.').map(Number);
  return major > MIN[0] || (major === MIN[0] && minor >= MIN[1]);
}

// Run as a script (not imported): check this Node.js and stop if it is too old.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!isRecentEnough(process.versions.node)) {
    console.error(
      `\nIttyBitz's tests need Node.js ${MIN.join('.')} or newer, and this computer has Node.js ${process.versions.node}.\n` +
      'Install the current "LTS" version from https://nodejs.org, then run the command again.\n'
    );
    process.exit(1);
  }
}
