"use client";

const PBKDF2_ITERATIONS = 1000000;
const SALT_LENGTH = 16; // bytes
const IV_LENGTH = 12; // bytes for AES-GCM
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_PASSWORD_LENGTH = 1024; // Reasonable upper bound

// Format version header: "IBTZ" magic bytes + 1-byte version number
// v0 (legacy): no header — raw salt || iv || ciphertext
// v1: IBTZ\x01 || salt || iv || ciphertext
const FORMAT_MAGIC = new Uint8Array([0x49, 0x42, 0x54, 0x5A]); // "IBTZ"
const FORMAT_VERSION = 1;
const FORMAT_HEADER_LENGTH = FORMAT_MAGIC.length + 1; // 5 bytes

function hasFormatHeader(data: Uint8Array): boolean {
  if (data.length < FORMAT_HEADER_LENGTH) return false;
  return data[0] === FORMAT_MAGIC[0] &&
         data[1] === FORMAT_MAGIC[1] &&
         data[2] === FORMAT_MAGIC[2] &&
         data[3] === FORMAT_MAGIC[3];
}

function getFormatVersion(data: Uint8Array): number {
  if (!hasFormatHeader(data)) return 0; // legacy format
  return data[4]!;
}

// Enhanced secure memory clearing
function secureErase(buffer: ArrayBuffer | Uint8Array | null | undefined): void {
  if (!buffer) return;
  
  const view = buffer instanceof ArrayBuffer 
    ? new Uint8Array(buffer) 
    : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  // Multiple overwrite passes with random data (best-effort; JS GC may retain copies)
  for (let pass = 0; pass < 3; pass++) {
    try {
      crypto.getRandomValues(view);
    } catch {
      // If CSPRNG is unavailable, zero-fill only — never use Math.random() for security ops
      view.fill(0);
      return;
    }
  }
  
  // Final zero pass
  view.fill(0);
}

// Enhanced input validation
function validateInputs(dataBuffer: ArrayBuffer, password: string, isEncryption: boolean): void {
  if (!dataBuffer || !(dataBuffer instanceof ArrayBuffer)) {
    throw new Error("Valid data buffer is required.");
  }
  
  if (dataBuffer.byteLength === 0) {
    throw new Error("Cannot process empty data.");
  }
  
  if (isEncryption && dataBuffer.byteLength > MAX_FILE_SIZE) {
    throw new Error(`File is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
  }
  
  if (typeof password !== 'string') {
    throw new Error("Password must be a string.");
  }
  
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error("Password is too long.");
  }
  
  // Check for null bytes in password (security issue)
  if (password.includes('\0')) {
    throw new Error("Password contains invalid characters.");
  }
}

// Derive a key from password and/or keyfile using PBKDF2
async function deriveKey(password: string, salt: Uint8Array, keyFileData: ArrayBuffer | null): Promise<CryptoKey> {
  const passwordEncoder = new TextEncoder();
  const passwordBytes = passwordEncoder.encode(password);
  // Create a proper ArrayBuffer-backed Uint8Array
  const passwordBuffer = new Uint8Array(new ArrayBuffer(passwordBytes.length));
  passwordBuffer.set(passwordBytes);
  let baseMaterial: Uint8Array = passwordBuffer;
  let combined: Uint8Array | null = null;
  
  try {
    // Combine password and keyfile data to form the base material for key derivation
    if (keyFileData) {
      const combinedBuffer = new ArrayBuffer(baseMaterial.length + keyFileData.byteLength);
      combined = new Uint8Array(combinedBuffer);
      combined.set(new Uint8Array(baseMaterial), 0);
      combined.set(new Uint8Array(keyFileData), baseMaterial.length);
      baseMaterial = combined;
    }
    
    const baseKey = await crypto.subtle.importKey(
      'raw',
      baseMaterial as BufferSource,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false, // Don't allow key export for security
      ['encrypt', 'decrypt']
    );

    return derivedKey;
  } finally {
    // Secure cleanup of all sensitive intermediate data
    secureErase(passwordBuffer);
    if (combined) secureErase(combined);
  }
}

/**
 * Encrypts a file buffer using a password and an optional key file.
 * @param dataBuffer The content of the file or text to encrypt.
 * @param password The password for encryption. Must not be empty.
 * @param keyFileBuffer Optional buffer from a key file. NOTE: the caller's
 *   buffer is zeroed in-place after use as part of secure cleanup. Do not
 *   reuse it after calling this function; clone beforehand if you need to.
 * @returns A promise that resolves with the encrypted data as an ArrayBuffer.
 */
export async function encryptFile(dataBuffer: ArrayBuffer, password: string, keyFileBuffer: ArrayBuffer | null): Promise<ArrayBuffer> {
  // Enhanced validation
  validateInputs(dataBuffer, password, true);
  
  if (!password) {
    throw new Error("A password is required for encryption.");
  }
  
  // Verify crypto availability
  if (!crypto.subtle) {
    throw new Error("Web Crypto API not available.");
  }
  
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  let key: CryptoKey | null = null;
  let encryptedContent: ArrayBuffer | null = null;
  
  try {
    key = await deriveKey(password, salt, keyFileBuffer);

    encryptedContent = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      dataBuffer
    );

    // Prepend format header, salt, and IV to the encrypted content.
    // Format v1: IBTZ\x01 || salt || iv || ciphertext
    const header = new Uint8Array(FORMAT_HEADER_LENGTH);
    header.set(FORMAT_MAGIC, 0);
    header[FORMAT_MAGIC.length] = FORMAT_VERSION;

    const encryptedFile = new Uint8Array(header.length + salt.length + iv.length + encryptedContent.byteLength);
    encryptedFile.set(header, 0);
    encryptedFile.set(salt, header.length);
    encryptedFile.set(iv, header.length + salt.length);
    encryptedFile.set(new Uint8Array(encryptedContent), header.length + salt.length + iv.length);

    return encryptedFile.buffer;
  } catch (error) {
    throw new Error("Encryption failed. Please try again.");
  } finally {
    // Comprehensive cleanup
    secureErase(salt);
    secureErase(iv);
    if (keyFileBuffer) secureErase(keyFileBuffer);
    if (encryptedContent) secureErase(new Uint8Array(encryptedContent));
    key = null; // Help GC
  }
}

/**
 * Decrypts an encrypted file buffer using a password and an optional key file.
 * @param encryptedBuffer The content of the encrypted file (salt + IV + ciphertext).
 * @param password The password for decryption.
 * @param keyFileBuffer Optional buffer from a key file. NOTE: the caller's
 *   buffer is zeroed in-place after use as part of secure cleanup. Do not
 *   reuse it after calling this function; clone beforehand if you need to.
 * @returns A promise that resolves with the decrypted data as an ArrayBuffer.
 * @throws Will throw an error if decryption fails.
 */
export async function decryptFile(encryptedBuffer: ArrayBuffer, password: string, keyFileBuffer: ArrayBuffer | null): Promise<ArrayBuffer> {
  // Enhanced validation
  validateInputs(encryptedBuffer, password, false);
  
  if (!password && !keyFileBuffer) {
    throw new Error("A password or key file is required for decryption.");
  }
  
  // Verify crypto availability
  if (!crypto.subtle) {
    throw new Error("Web Crypto API not available.");
  }
  
  // Detect format version and adjust offsets accordingly
  // v0 (legacy): salt || iv || ciphertext
  // v1: IBTZ\x01 || salt || iv || ciphertext
  const fullData = new Uint8Array(encryptedBuffer);
  const version = getFormatVersion(fullData);
  const dataOffset = version >= 1 ? FORMAT_HEADER_LENGTH : 0;

  if (version > FORMAT_VERSION) {
    throw new Error('This file was encrypted with a newer version of IttyBitz. Please update the app.');
  }

  const totalHeaderLength = dataOffset + SALT_LENGTH + IV_LENGTH;
  if (encryptedBuffer.byteLength <= totalHeaderLength) {
    throw new Error('Invalid encrypted data format.');
  }

  const salt = new Uint8Array(encryptedBuffer.slice(dataOffset, dataOffset + SALT_LENGTH));
  const iv = new Uint8Array(encryptedBuffer.slice(dataOffset + SALT_LENGTH, totalHeaderLength));
  const encryptedContent = new Uint8Array(encryptedBuffer.slice(totalHeaderLength));

  let key: CryptoKey | null = null;
  
  try {
    key = await deriveKey(password, salt, keyFileBuffer);
    
    const decryptedContent = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      encryptedContent as BufferSource
    );
    
    return decryptedContent;
  } catch (error) {
    // Generic error to prevent information leakage
    throw new Error('Decryption failed. The password or key file may be incorrect, or the data may be corrupted.');
  } finally {
    // Comprehensive cleanup
    secureErase(salt);
    secureErase(iv);
    secureErase(encryptedContent);
    if (keyFileBuffer) secureErase(keyFileBuffer);
    key = null; // Help GC
  }
}