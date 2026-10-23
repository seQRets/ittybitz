/* ── Argon2id (RFC 9106) — key derivation for the IBTZ v2 format ─────────
   Web Crypto has no Argon2, so it is implemented here. The heavy part —
   filling the memory matrix — is WebAssembly assembled from the readable
   source scripts/build/argon2.wat by scripts/wat.mjs, embedded below as
   base64; `npm run build` reproduces these exact bytes from that source and
   CI checks it. The rest (BLAKE2b, H0, H', the final tag) is the plain
   JavaScript in this block. DOM-free, so the regression suite can run it.

   ittybitzArgon2id(P, S, { m, t, p, T, secret, ad }) -> Promise<Uint8Array>
     P password bytes, S salt (>= 8 bytes), m memory in KiB, t passes,
     p lanes, T tag length in bytes, secret = Argon2 "K", ad = Argon2 "X".
   Output is the standard Argon2id (version 0x13) tag: any conforming
   implementation, e.g. the reference `argon2` CLI or Node's
   crypto.argon2Sync, produces the same bytes from the same inputs.
   ───────────────────────────────────────────────────────────────────────── */
var ITTYBITZ_ARGON2_WASM = "__ARGON2_WASM__";
var ITTYBITZ_ARGON2_BASE = 8192; // byte offset of the memory matrix; must match argon2.wat

// ---- BLAKE2b (RFC 7693), unkeyed, BigInt. It runs only a few dozen times
// per derivation, around the WebAssembly core, so clarity beats speed here.
var ITTYBITZ_B2B_MASK = 0xffffffffffffffffn;
var ITTYBITZ_B2B_IV = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n
];
var ITTYBITZ_B2B_SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0]
];

function ittybitzB2bRotr(x, n) {
  return ((x >> n) | (x << (64n - n))) & ITTYBITZ_B2B_MASK;
}

function ittybitzB2bG(v, a, b, c, d, x, y) {
  var M = ITTYBITZ_B2B_MASK;
  v[a] = (v[a] + v[b] + x) & M; v[d] = ittybitzB2bRotr(v[d] ^ v[a], 32n);
  v[c] = (v[c] + v[d]) & M;     v[b] = ittybitzB2bRotr(v[b] ^ v[c], 24n);
  v[a] = (v[a] + v[b] + y) & M; v[d] = ittybitzB2bRotr(v[d] ^ v[a], 16n);
  v[c] = (v[c] + v[d]) & M;     v[b] = ittybitzB2bRotr(v[b] ^ v[c], 63n);
}

// One compression: h (8 words) absorbs a 128-byte block; t = bytes so far.
function ittybitzB2bCompress(h, block, t, last) {
  var m = new Array(16), v = h.concat(ITTYBITZ_B2B_IV), i, r, s;
  for (i = 0; i < 16; i++) {
    var w = 0n;
    for (var k = 7; k >= 0; k--) w = (w << 8n) | BigInt(block[i * 8 + k]);
    m[i] = w;
  }
  v[12] ^= t & ITTYBITZ_B2B_MASK;
  v[13] ^= t >> 64n;
  if (last) v[14] ^= ITTYBITZ_B2B_MASK;
  for (r = 0; r < 12; r++) {
    s = ITTYBITZ_B2B_SIGMA[r % 10];
    ittybitzB2bG(v, 0, 4, 8, 12, m[s[0]], m[s[1]]);
    ittybitzB2bG(v, 1, 5, 9, 13, m[s[2]], m[s[3]]);
    ittybitzB2bG(v, 2, 6, 10, 14, m[s[4]], m[s[5]]);
    ittybitzB2bG(v, 3, 7, 11, 15, m[s[6]], m[s[7]]);
    ittybitzB2bG(v, 0, 5, 10, 15, m[s[8]], m[s[9]]);
    ittybitzB2bG(v, 1, 6, 11, 12, m[s[10]], m[s[11]]);
    ittybitzB2bG(v, 2, 7, 8, 13, m[s[12]], m[s[13]]);
    ittybitzB2bG(v, 3, 4, 9, 14, m[s[14]], m[s[15]]);
  }
  for (i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
}

// BLAKE2b with an output of outLen bytes (1..64).
function ittybitzBlake2b(outLen, data) {
  var h = ITTYBITZ_B2B_IV.slice(), n = data.length, off = 0, i;
  h[0] ^= 0x01010000n ^ BigInt(outLen);
  while (n - off > 128) {
    ittybitzB2bCompress(h, data.subarray(off, off + 128), BigInt(off + 128), false);
    off += 128;
  }
  var last = new Uint8Array(128);
  last.set(data.subarray(off));
  ittybitzB2bCompress(h, last, BigInt(n), true);
  var out = new Uint8Array(outLen);
  for (i = 0; i < outLen; i++) out[i] = Number((h[i >> 3] >> BigInt(8 * (i & 7))) & 0xffn);
  return out;
}

function ittybitzLE32(n) {
  return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
}

function ittybitzConcat(parts) {
  var len = 0, i, off = 0;
  for (i = 0; i < parts.length; i++) len += parts[i].length;
  var out = new Uint8Array(len);
  for (i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
  return out;
}

// H' (RFC 9106 section 3.3): the variable-length hash built on BLAKE2b.
function ittybitzHPrime(T, x) {
  var input = ittybitzConcat([ittybitzLE32(T), x]);
  if (T <= 64) return ittybitzBlake2b(T, input);
  var r = Math.ceil(T / 32) - 2, out = new Uint8Array(T);
  var v = ittybitzBlake2b(64, input);
  out.set(v.subarray(0, 32), 0);
  for (var i = 1; i < r; i++) {
    v = ittybitzBlake2b(64, v);
    out.set(v.subarray(0, 32), i * 32);
  }
  out.set(ittybitzBlake2b(T - 32 * r, v), 32 * r);
  return out;
}

var ittybitzArgon2Module = null; // compiled once, instantiated per derivation

async function ittybitzArgon2id(P, S, opts) {
  var m = opts.m, t = opts.t, p = opts.p, T = opts.T || 32;
  var K = opts.secret || new Uint8Array(0), X = opts.ad || new Uint8Array(0);
  var whole = function (n) { return typeof n === 'number' && n === Math.floor(n); };
  if (!(whole(m) && whole(t) && whole(p) && whole(T) && p >= 1 && p <= 255 && t >= 1 &&
        m >= 8 * p && m <= 4194304 && T >= 4 && S.length >= 8)) {
    throw new Error('Invalid Argon2id parameters.');
  }
  var mPrime = 4 * p * Math.floor(m / (4 * p)), laneLen = mPrime / p, lane, j, k;
  var h0 = ittybitzBlake2b(64, ittybitzConcat([
    ittybitzLE32(p), ittybitzLE32(T), ittybitzLE32(m), ittybitzLE32(t),
    ittybitzLE32(0x13), ittybitzLE32(2), // version 0x13, type 2 = Argon2id
    ittybitzLE32(P.length), P, ittybitzLE32(S.length), S,
    ittybitzLE32(K.length), K, ittybitzLE32(X.length), X
  ]));

  if (!ittybitzArgon2Module) {
    var bin = atob(ITTYBITZ_ARGON2_WASM), code = new Uint8Array(bin.length);
    for (k = 0; k < bin.length; k++) code[k] = bin.charCodeAt(k);
    ittybitzArgon2Module = WebAssembly.compile(code);
  }
  var instance = await WebAssembly.instantiate(await ittybitzArgon2Module);
  var memory = instance.exports.memory;
  var need = Math.ceil((ITTYBITZ_ARGON2_BASE + mPrime * 1024) / 65536) - memory.buffer.byteLength / 65536;
  if (need > 0) memory.grow(need);
  var heap = new Uint8Array(memory.buffer);
  try {
    // The first two blocks of each lane: H'(H0 || LE32(column) || LE32(lane)).
    for (lane = 0; lane < p; lane++) {
      for (j = 0; j < 2; j++) {
        var first = ittybitzHPrime(1024, ittybitzConcat([h0, ittybitzLE32(j), ittybitzLE32(lane)]));
        heap.set(first, ITTYBITZ_ARGON2_BASE + (lane * laneLen + j) * 1024);
        first.fill(0);
      }
    }
    instance.exports.fill(p, laneLen, t);
    // Final block: XOR of the last block of every lane; the tag is H'(it).
    var c = heap.slice(ITTYBITZ_ARGON2_BASE + (laneLen - 1) * 1024, ITTYBITZ_ARGON2_BASE + laneLen * 1024);
    for (lane = 1; lane < p; lane++) {
      var at = ITTYBITZ_ARGON2_BASE + (lane * laneLen + laneLen - 1) * 1024;
      for (k = 0; k < 1024; k++) c[k] ^= heap[at + k];
    }
    var tag = ittybitzHPrime(T, c);
    c.fill(0);
    return tag;
  } finally {
    heap.fill(0); // best-effort: the matrix is password-derived
    h0.fill(0);
  }
}
