/**
 * Utility functions for browser-file-crypto.
 *
 * @module utils
 * @internal
 * @since 1.0.0
 */

import {
  SALT_LENGTH,
  IV_LENGTH,
  KEY_LENGTH,
  PBKDF2_ITERATIONS,
  ALGORITHM,
  HASH_ALGORITHM,
} from './constants';
import { CryptoError } from './errors';

/**
 * Normalizes input to ArrayBuffer for consistent processing.
 *
 * @description
 * Accepts File, Blob, or ArrayBuffer and converts to ArrayBuffer.
 * This ensures all encryption/decryption functions work with a consistent type.
 *
 * @param input - File, Blob, or ArrayBuffer to normalize
 * @returns Promise resolving to ArrayBuffer
 *
 * @throws {CryptoError} When input is not a valid type (INVALID_INPUT)
 *
 * @example
 * ```typescript
 * const file = document.querySelector('input').files[0];
 * const buffer = await normalizeInput(file);
 * ```
 *
 * @internal
 */
export async function normalizeInput(
  input: File | Blob | ArrayBuffer
): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) {
    return input;
  }

  if (input instanceof Blob) {
    return input.arrayBuffer();
  }

  throw new CryptoError('INVALID_INPUT');
}

/**
 * Safely slices a TypedArray's buffer to get exact range.
 *
 * @description
 * Required because TypedArray.buffer may reference a larger ArrayBuffer
 * when the TypedArray is a view into a portion of the buffer.
 * This function ensures we get only the exact bytes we need.
 *
 * @param arr - Uint8Array to slice
 * @returns ArrayBuffer containing only the bytes from the Uint8Array
 *
 * @example
 * ```typescript
 * const iv = new Uint8Array(12);
 * const ivBuffer = sliceBuffer(iv);
 * // ivBuffer is guaranteed to be exactly 12 bytes
 * ```
 *
 * @internal
 */
export function sliceBuffer(arr: Uint8Array): ArrayBuffer {
  return (arr.buffer as ArrayBuffer).slice(arr.byteOffset, arr.byteOffset + arr.byteLength);
}

/**
 * Converts ArrayBuffer to base64 string.
 *
 * @description
 * Uses browser's native btoa() for encoding.
 * Handles binary data by converting each byte to a character.
 *
 * @param buffer - ArrayBuffer to encode
 * @returns Base64-encoded string
 *
 * @example
 * ```typescript
 * const key = crypto.getRandomValues(new Uint8Array(32));
 * const base64Key = arrayBufferToBase64(key.buffer);
 * ```
 *
 * @internal
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts base64 string to ArrayBuffer.
 *
 * @description
 * Uses browser's native atob() for decoding.
 * Returns an ArrayBuffer that can be used with Web Crypto API.
 *
 * @param base64 - Base64-encoded string to decode
 * @returns ArrayBuffer containing the decoded bytes
 *
 * @throws {DOMException} When base64 string is invalid
 *
 * @example
 * ```typescript
 * const keyBuffer = base64ToArrayBuffer(keyFile.key);
 * const cryptoKey = await crypto.subtle.importKey('raw', keyBuffer, ...);
 * ```
 *
 * @internal
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derives an AES-256 encryption key from a password using PBKDF2.
 *
 * @description
 * Uses PBKDF2 with SHA-256 and 100,000 iterations to derive a 256-bit key.
 * The derived key is non-extractable for security.
 *
 * @param password - The user-provided password string
 * @param salt - 16-byte random salt for key derivation
 * @returns Promise resolving to a non-extractable CryptoKey
 *
 * @throws {Error} When key derivation fails
 *
 * @example
 * ```typescript
 * const salt = crypto.getRandomValues(new Uint8Array(16));
 * const key = await deriveKeyFromPassword('my-password', salt);
 * ```
 *
 * @internal
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-256 key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: sliceBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGORITHM,
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false, // non-extractable for security
    ['encrypt', 'decrypt']
  );
}

/**
 * Imports raw key bytes for keyfile-based encryption.
 *
 * @description
 * Imports a 256-bit key directly from base64-encoded key data.
 * No key derivation is needed - the key is used as-is.
 * The imported key is non-extractable for security.
 *
 * @param keyData - Base64-encoded 256-bit key string
 * @returns Promise resolving to a non-extractable CryptoKey
 *
 * @throws {CryptoError} When key import fails (INVALID_KEYFILE)
 *
 * @example
 * ```typescript
 * const keyFile = generateKeyFile();
 * const cryptoKey = await importKeyFromKeyfile(keyFile.key);
 * ```
 *
 * @internal
 */
export async function importKeyFromKeyfile(keyData: string): Promise<CryptoKey> {
  try {
    const keyBuffer = base64ToArrayBuffer(keyData);

    return await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: ALGORITHM, length: KEY_LENGTH },
      false, // non-extractable for security
      ['encrypt', 'decrypt']
    );
  } catch {
    throw new CryptoError('INVALID_KEYFILE');
  }
}

/**
 * Generates cryptographically secure random bytes.
 *
 * @description
 * Uses crypto.getRandomValues() for cryptographically secure randomness.
 *
 * @param length - Number of random bytes to generate
 * @returns Uint8Array containing random bytes
 *
 * @example
 * ```typescript
 * const salt = generateRandomBytes(SALT_LENGTH);
 * const iv = generateRandomBytes(IV_LENGTH);
 * ```
 *
 * @internal
 */
export function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Generates a random salt for PBKDF2 key derivation.
 *
 * @returns 16-byte random salt
 *
 * @internal
 */
export function generateSalt(): Uint8Array {
  return generateRandomBytes(SALT_LENGTH);
}

/**
 * Generates a random IV for AES-GCM encryption.
 *
 * @returns 12-byte random IV
 *
 * @internal
 */
export function generateIV(): Uint8Array {
  return generateRandomBytes(IV_LENGTH);
}

/**
 * Default character set for random password generation.
 * Includes uppercase, lowercase, numbers, and special characters.
 */
const PASSWORD_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

/**
 * Default password length.
 */
const DEFAULT_PASSWORD_LENGTH = 16;

/**
 * Generates a cryptographically secure random password.
 *
 * @description
 * Creates a random password using crypto.getRandomValues() for
 * cryptographic randomness. The password includes:
 * - Uppercase letters (A-Z)
 * - Lowercase letters (a-z)
 * - Numbers (0-9)
 * - Special characters (!@#$%^&*)
 *
 * @param length - Password length (default: 16, min: 8, max: 128)
 * @returns Random password string
 *
 * @example
 * ```typescript
 * const password = generateRandomPassword();
 * console.log(password); // e.g., 'Kx9#mP2$vL5@nQ8!'
 *
 * const longPassword = generateRandomPassword(32);
 * console.log(longPassword.length); // 32
 * ```
 *
 * @since 1.0.0
 */
export function generateRandomPassword(length: number = DEFAULT_PASSWORD_LENGTH): string {
  // Clamp length to reasonable bounds
  const safeLength = Math.max(8, Math.min(128, length));

  const randomBytes = generateRandomBytes(safeLength);
  let password = '';

  for (let i = 0; i < safeLength; i++) {
    const index = randomBytes[i] % PASSWORD_CHARSET.length;
    password += PASSWORD_CHARSET[index];
  }

  return password;
}
