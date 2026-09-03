/* ── IttyBitz crypto core — encrypt + decrypt ─────────────────────────────
   Kept free of DOM references so the project's regression suite can extract
   this exact block and run it against the historical ciphertext fixtures in
   BOTH directions (encrypt→crypto.ts and crypto.ts→decrypt).

   Wire format, identical to src/lib/crypto.ts:
     IBTZ\x01 || salt(16) || iv(12) || AES-256-GCM ciphertext
   Key derivation: PBKDF2-SHA256 @ 1,000,000 iterations over the UTF-8
   password bytes, with the key file bytes (if any) appended after them.
   v0 (headerless) containers from IttyBitz 1.x still decrypt.

   The PBKDF2/AES output depends only on (password, key file, salt, iv) — never
   on the CryptoKey's declared usages — so a key derived here with ['encrypt']
   interoperates byte-for-byte with the app's ['encrypt','decrypt'] key.

   If you change anything in this block, `npm run test:crypto` must still pass.
   ───────────────────────────────────────────────────────────────────────── */
var ITTYBITZ_PBKDF2_ITERATIONS = 1000000;
var ITTYBITZ_SALT_LENGTH = 16;
var ITTYBITZ_IV_LENGTH = 12;
var ITTYBITZ_MAGIC = [0x49, 0x42, 0x54, 0x5a]; // "IBTZ"
var ITTYBITZ_VERSION = 1;
var ITTYBITZ_MAX_VERSION = 1;
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
 * Encrypt bytes into an IttyBitz v1 container.
 * @param {Uint8Array} bytes     plaintext bytes
 * @param {string}     password
 * @param {Uint8Array|null} keyFileBytes
 * @returns {Promise<Uint8Array>} IBTZ\x01 || salt || iv || ciphertext
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
  var key = await ittybitzDeriveKey(password, salt, keyFileBytes, ['encrypt']);
  var ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, bytes));

  var out = new Uint8Array(5 + salt.length + iv.length + ct.length);
  out[0] = ITTYBITZ_MAGIC[0];
  out[1] = ITTYBITZ_MAGIC[1];
  out[2] = ITTYBITZ_MAGIC[2];
  out[3] = ITTYBITZ_MAGIC[3];
  out[4] = ITTYBITZ_VERSION;
  out.set(salt, 5);
  out.set(iv, 5 + salt.length);
  out.set(ct, 5 + salt.length + iv.length);
  return out;
}

/**
 * Decrypt an IttyBitz container (v0 legacy or v1).
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
