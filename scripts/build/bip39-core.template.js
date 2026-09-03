/* ── BIP-39 core — validation + Standard SeedQR ───────────────────────────
   Assembled by scripts/build-app.mjs: the wordlist placeholder below is filled
   with the canonical list extracted verbatim from src/lib/bip39.ts, so it can
   never drift from the reviewed source of truth. DOM-free.

   Enforces all four BIP-0039 invariants (word count, membership, 11-bit
   packing, SHA-256 checksum). No key material is ever touched here.
   Canonical English wordlist, SHA-256:
   2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda
   ───────────────────────────────────────────────────────────────────────── */
var BIP39_WORDLIST = "__WORDLIST__".split(" ");
var BIP39_INDEX = {};
for (var _bi = 0; _bi < BIP39_WORDLIST.length; _bi++) BIP39_INDEX[BIP39_WORDLIST[_bi]] = _bi;
if (BIP39_WORDLIST.length !== 2048) {
  console.error('[bip39] expected 2048 words, got ' + BIP39_WORDLIST.length);
}
var BIP39_VALID_COUNTS = { 12: 1, 15: 1, 18: 1, 21: 1, 24: 1 };

/**
 * Validate a candidate BIP-39 English mnemonic.
 * @returns {Promise<{valid:true,words:string[],entropyBits:number}
 *   | {valid:false,reason:string,seedShaped:boolean}>}
 */
async function ittybitzValidateBip39(input) {
  var words = input.normalize('NFKD').toLowerCase().trim().split(/\s+/).filter(Boolean);

  if (!BIP39_VALID_COUNTS[words.length]) {
    return { valid: false, reason: 'wrong-word-count', seedShaped: false };
  }

  var indices = [];
  var unknown = 0;
  for (var i = 0; i < words.length; i++) {
    var idx = BIP39_INDEX[words[i]];
    if (idx === undefined) { unknown++; continue; }
    indices.push(idx);
  }
  if (unknown > 0) {
    return { valid: false, reason: 'unknown-word', seedShaped: unknown <= 1 };
  }

  var totalBits = words.length * 11;
  var checksumBits = totalBits / 33;
  var entropyBits = totalBits - checksumBits;
  var entropyBytes = entropyBits / 8;

  var packed = new Uint8Array(Math.ceil(totalBits / 8));
  var bitPos = 0;
  for (var j = 0; j < indices.length; j++) {
    var v = indices[j];
    for (var b = 10; b >= 0; b--) {
      if ((v >> b) & 1) packed[bitPos >> 3] |= 0x80 >> (bitPos & 7);
      bitPos++;
    }
  }

  var entropy = packed.slice(0, entropyBytes);
  var checksumByte = packed[entropyBytes] || 0;
  var givenChecksum = checksumByte >> (8 - checksumBits);

  var digest = new Uint8Array(await crypto.subtle.digest('SHA-256', entropy.slice().buffer));
  var expectedChecksum = digest[0] >> (8 - checksumBits);

  if (givenChecksum !== expectedChecksum) {
    return { valid: false, reason: 'checksum-mismatch', seedShaped: true };
  }
  return { valid: true, words: words, entropyBits: entropyBits };
}

/**
 * Encode a validated mnemonic as a Standard SeedQR numeric payload
 * (each word index zero-padded to 4 digits, concatenated).
 */
function ittybitzToSeedQR(words) {
  var out = '';
  for (var i = 0; i < words.length; i++) {
    var idx = BIP39_INDEX[words[i]];
    if (idx === undefined) throw new Error('toSeedQR: word "' + words[i] + '" not in BIP-39 wordlist');
    var s = '' + idx;
    while (s.length < 4) s = '0' + s;
    out += s;
  }
  return out;
}
