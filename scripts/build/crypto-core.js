/* ── IttyBitz crypto core — encrypt + decrypt ─────────────────────────────
   Kept free of DOM references so the project's regression suite can extract
   this exact block and run it against the historical ciphertext fixtures and
   an independent implementation, in both directions.

   New files are written in format v2 (since IttyBitz 3.1.0):
     IBTZ 0x02 || m u32 LE || t u8 || p u8 || salt(16) || iv(12) || AES-256-GCM ciphertext
   The key is Argon2id (RFC 9106, version 0x13) with a 32-byte output:
     password = the UTF-8 password bytes
     salt     = the 16 salt bytes
     secret   = SHA-256 of the key file, when one is used (Argon2's "K" input)
     m, t, p  = memory in KiB, passes, lanes, as stored in the header
   The whole 39-byte header is the AES-GCM additional data, so it is
   authenticated along with the ciphertext.

   Older formats still decrypt, exactly as before and identical to
   src/lib/crypto.ts:
     v1  IBTZ 0x01 || salt(16) || iv(12) || ciphertext        (2.0.0 – 3.0.17)
     v0  salt(16) || iv(12) || ciphertext                     (1.0 – 1.4.0)
   with PBKDF2-SHA256 @ 1,000,000 iterations over the UTF-8 password bytes,
   the key file bytes (if any) appended after them.

   The output depends only on (password, key file, salt, iv, parameters) —
   never on the CryptoKey's declared usages.

   If you change anything in this block, `npm run test:crypto` must still pass.
   ───────────────────────────────────────────────────────────────────────── */
var ITTYBITZ_PBKDF2_ITERATIONS = 1000000;
var ITTYBITZ_SALT_LENGTH = 16;
var ITTYBITZ_IV_LENGTH = 12;
var ITTYBITZ_MAGIC = [0x49, 0x42, 0x54, 0x5a]; // "IBTZ"
var ITTYBITZ_VERSION = 2;
var ITTYBITZ_MAX_VERSION = 2;
// Argon2id settings written into new files: 64 MiB of memory, 3 passes, 1
// lane (RFC 9106's second recommended option). They travel in each file's
// header, so a later release can raise them without changing the format.
var ITTYBITZ_ARGON2_M = 65536;
var ITTYBITZ_ARGON2_T = 3;
var ITTYBITZ_ARGON2_P = 1;
var ITTYBITZ_V2_HEADER = 39; // magic 4 + version 1 + m 4 + t 1 + p 1 + salt 16 + iv 12
var ITTYBITZ_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
var ITTYBITZ_MAX_PASSWORD_LENGTH = 1024;

function ittybitzFormatVersion(bytes) {
  if (bytes.length < 5) return 0;
  for (var i = 0; i < 4; i++) if (bytes[i] !== ITTYBITZ_MAGIC[i]) return 0;
  return bytes[4];
}

function ittybitzValidatePassword(password) {
  if (typeof password !== 'string') throw new Error('Password must be a string.');
  if (password.length > ITTYBITZ_MAX_PASSWORD_LENGTH) throw new Error('Password is too long.');
  if (password.indexOf('\0') >= 0) throw new Error('Password contains invalid characters.');
}

// v2: Argon2id. A key file enters as SHA-256(key file) in Argon2's secret
// input, so it is bound with a fixed length and never concatenated.
async function ittybitzDeriveKeyV2(password, salt, keyFileBytes, prm, usages) {
  var pw = new TextEncoder().encode(password);
  var secret = keyFileBytes && keyFileBytes.length
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', keyFileBytes))
    : new Uint8Array(0);
  var raw = await ittybitzArgon2id(pw, salt, { m: prm.m, t: prm.t, p: prm.p, T: 32, secret: secret });
  try {
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, usages);
  } finally {
    raw.fill(0); pw.fill(0); secret.fill(0);
  }
}

// Read and sanity-check a v2 header's Argon2id settings. The bounds keep a
// damaged or hostile file from asking for gigabytes of memory before the
// authentication check could reject it.
function ittybitzV2Params(bytes) {
  var m = (bytes[5] | (bytes[6] << 8) | (bytes[7] << 16) | (bytes[8] << 24)) >>> 0;
  var t = bytes[9], p = bytes[10];
  if (p < 1 || p > 16 || t < 1 || t > 64 || m < 8 * p || m > 1048576) {
    throw new Error('This file asks for key-derivation settings IttyBitz does not accept. It may be damaged.');
  }
  return { m: m, t: t, p: p };
}

// v0 / v1: PBKDF2-SHA256, unchanged since IttyBitz 1.0.
async function ittybitzDeriveKey(password, salt, keyFileBytes, usages) {
  var pw = new TextEncoder().encode(password);
  var material;
  if (keyFileBytes && keyFileBytes.length) {
    material = new Uint8Array(pw.length + keyFileBytes.length);
    material.set(pw, 0);
    material.set(keyFileBytes, pw.length);
  } else {
    material = pw;
  }
  var base = await crypto.subtle.importKey('raw', material, { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: ITTYBITZ_PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

/**
 * Encrypt bytes into an IttyBitz v2 container (Argon2id).
 * @param {Uint8Array} bytes     plaintext bytes
 * @param {string}     password
 * @param {Uint8Array|null} keyFileBytes
 * @returns {Promise<Uint8Array>} IBTZ 0x02 || m || t || p || salt || iv || ciphertext
 */
async function ittybitzEncrypt(bytes, password, keyFileBytes) {
  if (!bytes || !bytes.length) throw new Error('Cannot process empty data.');
  if (bytes.length > ITTYBITZ_MAX_FILE_SIZE) {
    throw new Error('File is too large. Maximum size is ' + (ITTYBITZ_MAX_FILE_SIZE / 1024 / 1024) + 'MB.');
  }
  if (!password) throw new Error('A password is required for encryption.');
  ittybitzValidatePassword(password);

  var salt = crypto.getRandomValues(new Uint8Array(ITTYBITZ_SALT_LENGTH));
  var iv = crypto.getRandomValues(new Uint8Array(ITTYBITZ_IV_LENGTH));
  var prm = { m: ITTYBITZ_ARGON2_M, t: ITTYBITZ_ARGON2_T, p: ITTYBITZ_ARGON2_P };

  var head = new Uint8Array(ITTYBITZ_V2_HEADER);
  head.set(ITTYBITZ_MAGIC, 0);
  head[4] = ITTYBITZ_VERSION;
  head[5] = prm.m & 255; head[6] = (prm.m >>> 8) & 255; head[7] = (prm.m >>> 16) & 255; head[8] = (prm.m >>> 24) & 255;
  head[9] = prm.t;
  head[10] = prm.p;
  head.set(salt, 11);
  head.set(iv, 27);

  var key = await ittybitzDeriveKeyV2(password, salt, keyFileBytes, prm, ['encrypt']);
  var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: head }, key, bytes));

  var out = new Uint8Array(head.length + ct.length);
  out.set(head, 0);
  out.set(ct, head.length);
  return out;
}

/**
 * Decrypt an IttyBitz container (v0 legacy, v1, or v2).
 * @param {Uint8Array} bytes     raw container bytes
 * @param {string}     password
 * @param {Uint8Array|null} keyFileBytes
 * @returns {Promise<Uint8Array>} plaintext bytes
 */
async function ittybitzDecrypt(bytes, password, keyFileBytes) {
  if (!bytes || !bytes.length) throw new Error('No data to decrypt.');
  ittybitzValidatePassword(password);

  var version = ittybitzFormatVersion(bytes);
  if (version > ITTYBITZ_MAX_VERSION) {
    throw new Error('This file was encrypted with a newer version of IttyBitz than this tool understands.');
  }
  if (version === 2) {
    if (bytes.length <= ITTYBITZ_V2_HEADER) throw new Error('Invalid encrypted data format — file is too short.');
    var prm = ittybitzV2Params(bytes);
    var head = bytes.slice(0, ITTYBITZ_V2_HEADER);
    var key2 = await ittybitzDeriveKeyV2(password, bytes.slice(11, 27), keyFileBytes, prm, ['decrypt']);
    var plain2 = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(27, ITTYBITZ_V2_HEADER), additionalData: head },
      key2, bytes.slice(ITTYBITZ_V2_HEADER));
    return new Uint8Array(plain2);
  }
  var offset = version >= 1 ? 5 : 0;

  var headerEnd = offset + ITTYBITZ_SALT_LENGTH + ITTYBITZ_IV_LENGTH;
  if (bytes.length <= headerEnd) throw new Error('Invalid encrypted data format — file is too short.');

  var salt = bytes.slice(offset, offset + ITTYBITZ_SALT_LENGTH);
  var iv = bytes.slice(offset + ITTYBITZ_SALT_LENGTH, headerEnd);
  var ciphertext = bytes.slice(headerEnd);

  var key = await ittybitzDeriveKey(password, salt, keyFileBytes, ['decrypt']);
  var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
  return new Uint8Array(plain);
}
