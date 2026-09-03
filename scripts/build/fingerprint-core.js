/* ── BIP-32 master fingerprint ────────────────────────────────────────────
   Vendored verbatim from seQRets/My-Seed-Phrase (myseedphrase.app). DOM-free.

   phrase -> seed (PBKDF2-SHA512, empty passphrase) -> master key
   (HMAC-SHA512 "Bitcoin seed") -> compressed public key -> first four bytes of
   RIPEMD160(SHA256(pubkey)). The last two steps need secp256k1 and RIPEMD-160,
   which no browser API provides, so both are implemented here — the one place
   this file rolls its own primitives.

   Display only: nothing is signed and no key leaves masterFingerprint(). The
   crypto regression suite holds it to the published test vector.
   ───────────────────────────────────────────────────────────────────────── */
var hexOf = function (b) { return [].map.call(b, function (x) { return x.toString(16).padStart(2, '0'); }).join(''); };

function ripemd160(msg) {
  var rotl = function (x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; };
  var f = function (j, x, y, z) {
    return j < 16 ? x ^ y ^ z : j < 32 ? (x & y) | (~x & z) : j < 48 ? (x | ~y) ^ z
      : j < 64 ? (x & z) | (y & ~z) : x ^ (y | ~z);
  };
  var K1 = [0, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
  var K2 = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0];
  var R1 = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13];
  var R2 = [5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11];
  var S1 = [11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6];
  var S2 = [8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11];
  var len = msg.length, total = ((len + 9 + 63) >> 6) << 6;
  var m = new Uint8Array(total); m.set(msg); m[len] = 0x80;
  var bits = len * 8;
  for (var i = 0; i < 8; i++)
    m[total - 8 + i] = (i < 4 ? bits >>> (8 * i) : Math.floor(bits / 4294967296) >>> (8 * (i - 4))) & 0xff;
  var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  var X = new Uint32Array(16);
  for (var off = 0; off < total; off += 64) {
    for (var i2 = 0; i2 < 16; i2++)
      X[i2] = m[off+4*i2] | m[off+4*i2+1] << 8 | m[off+4*i2+2] << 16 | m[off+4*i2+3] << 24;
    var a = h0, b = h1, c = h2, d = h3, e = h4;
    var A = h0, B = h1, C = h2, D = h3, E = h4;
    for (var j = 0; j < 80; j++) {
      var t = (rotl((a + f(j, b, c, d) + X[R1[j]] + K1[j >> 4]) >>> 0, S1[j]) + e) >>> 0;
      a = e; e = d; d = rotl(c, 10); c = b; b = t;
      t = (rotl((A + f(79 - j, B, C, D) + X[R2[j]] + K2[j >> 4]) >>> 0, S2[j]) + E) >>> 0;
      A = E; E = D; D = rotl(C, 10); C = B; B = t;
    }
    var tt = (h1 + c + D) >>> 0;
    h1 = (h2 + d + E) >>> 0; h2 = (h3 + e + A) >>> 0;
    h3 = (h4 + a + B) >>> 0; h4 = (h0 + b + C) >>> 0; h0 = tt;
  }
  var out = new Uint8Array(20);
  [h0, h1, h2, h3, h4].forEach(function (h, i) {
    out[4*i] = h & 255; out[4*i+1] = (h >>> 8) & 255;
    out[4*i+2] = (h >>> 16) & 255; out[4*i+3] = (h >>> 24) & 255;
  });
  return out;
}

// secp256k1 compressed public key, affine double-and-add with BigInt.
var SECP_P = 2n ** 256n - 2n ** 32n - 977n;
var SECP_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
var SECP_G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
              0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
function secpMod(a) { var r = a % SECP_P; return r < 0n ? r + SECP_P : r; }
function secpInv(a) {
  var t = 0n, nt = 1n, r = SECP_P, nr = secpMod(a);
  while (nr !== 0n) { var q = r / nr; var x1 = t - q * nt; t = nt; nt = x1; var x2 = r - q * nr; r = nr; nr = x2; }
  return secpMod(t);
}
function secpAdd(P, Q) {
  if (!P) return Q; if (!Q) return P;
  var px = P[0], py = P[1], qx = Q[0], qy = Q[1];
  if (px === qx) {
    if (secpMod(py + qy) === 0n) return null;                    // inverse points
    var s = secpMod(3n * px * px * secpInv(2n * py));            // doubling
    var x = secpMod(s * s - 2n * px);
    return [x, secpMod(s * (px - x) - py)];
  }
  var s2 = secpMod((qy - py) * secpInv(qx - px));
  var x2 = secpMod(s2 * s2 - px - qx);
  return [x2, secpMod(s2 * (px - x2) - py)];
}
function secpPub(priv) {
  if (priv <= 0n || priv >= SECP_N) return null;                 // invalid key
  var R = null, A = SECP_G;
  for (var k = priv; k > 0n; k >>= 1n) {
    if (k & 1n) R = secpAdd(R, A);
    A = secpAdd(A, A);
  }
  var out = new Uint8Array(33);
  out[0] = R[1] & 1n ? 3 : 2;
  var x = R[0];
  for (var i = 32; i >= 1; i--) { out[i] = Number(x & 255n); x >>= 8n; }
  return out;
}

async function bip39Seed(words) {
  var enc = new TextEncoder();
  var key = await crypto.subtle.importKey('raw', enc.encode(words.join(' ')), 'PBKDF2', false, ['deriveBits']);
  // 2048 rounds, salt "mnemonic" — an empty BIP-39 passphrase is assumed.
  var bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-512', salt: enc.encode('mnemonic'), iterations: 2048 }, key, 512);
  return new Uint8Array(bits);
}
async function fingerprintOfSeed(seed) {
  var hk = await crypto.subtle.importKey('raw', new TextEncoder().encode('Bitcoin seed'),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  var I = new Uint8Array(await crypto.subtle.sign('HMAC', hk, seed));
  var pub = secpPub(BigInt('0x' + hexOf(I.slice(0, 32))));
  if (!pub) return null;                       // probability about 2^-127
  var sha = new Uint8Array(await crypto.subtle.digest('SHA-256', pub));
  return hexOf(ripemd160(sha).slice(0, 4));
}
async function masterFingerprint(words) { return fingerprintOfSeed(await bip39Seed(words)); }
