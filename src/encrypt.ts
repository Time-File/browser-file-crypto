/**
 * File encryption functions for browser-file-crypto.
 *
 * @module encrypt
 * @since 1.0.0
 */

import {
  SALT_LENGTH,
  IV_LENGTH,
  ENCRYPTION_MARKER_PASSWORD,
  ENCRYPTION_MARKER_KEYFILE,
  ALGORITHM,
} from './constants';
import { CryptoError } from './errors';
import type { EncryptOptions } from './types';
import {
  normalizeInput,
  sliceBuffer,
  deriveKeyFromPassword,
  importKeyFromKeyfile,
  generateSalt,
  generateIV,
} from './utils';

/**
 * Encrypts a file using AES-256-GCM with password-based key derivation.
 *
 * @description
 * Uses PBKDF2 with 100,000 iterations to derive a 256-bit key from the password.
 * Each encryption generates a unique random salt (16 bytes) and IV (12 bytes).
 * The output format is: [marker(1)] + [salt(16)] + [iv(12)] + [ciphertext + auth tag].
 *
 * For keyfile-based encryption, the key is used directly without derivation.
 * The output format is: [marker(1)] + [iv(12)] + [ciphertext + auth tag].
 *
 * @param file - The file to encrypt (File, Blob, or ArrayBuffer)
 * @param options - Encryption options including password or keyData
 * @returns Promise resolving to encrypted Blob with 'application/octet-stream' MIME type
 *
 * @throws {CryptoError} When neither password nor keyData is provided (PASSWORD_REQUIRED)
 * @throws {CryptoError} When input is invalid (INVALID_INPUT)
 * @throws {CryptoError} When encryption fails (ENCRYPTION_FAILED)
 *
 * @example
 * ```typescript
 * // Password-based encryption
 * const encrypted = await encryptFile(file, {
 *   password: 'my-secret',
 *   onProgress: ({ phase, progress }) => console.log(`${phase}: ${progress}%`)
 * });
 *
 * // Keyfile-based encryption
 * const keyFile = generateKeyFile();
 * const encrypted = await encryptFile(file, {
 *   keyData: keyFile.key,
 *   onProgress: ({ progress }) => updateProgressBar(progress)
 * });
 * ```
 *
 * @see {@link decryptFile} for decryption
 * @see {@link generateKeyFile} for creating keyfiles
 * @since 1.0.0
 */
export async function encryptFile(
  file: File | Blob | ArrayBuffer,
  options: EncryptOptions
): Promise<Blob> {
  const { password, keyData, onProgress } = options;

  // Validate: either password or keyData must be provided
  if (!password && !keyData) {
    throw new CryptoError('PASSWORD_REQUIRED');
  }

  try {
    // Step 1: Normalize input to ArrayBuffer
    onProgress?.({ phase: 'deriving_key', progress: 0 });
    const data = await normalizeInput(file);
    onProgress?.({ phase: 'deriving_key', progress: 10 });

    // Branch based on encryption method
    if (keyData) {
      return await encryptWithKeyfile(data, keyData, onProgress);
    } else {
      return await encryptWithPassword(data, password!, onProgress);
    }
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError('ENCRYPTION_FAILED');
  }
}

/**
 * Encrypts data using password-based key derivation.
 *
 * @internal
 */
async function encryptWithPassword(
  data: ArrayBuffer,
  password: string,
  onProgress?: EncryptOptions['onProgress']
): Promise<Blob> {
  // Step 2: Generate random salt and IV
  const salt = generateSalt();
  const iv = generateIV();
  onProgress?.({ phase: 'deriving_key', progress: 20 });

  // Step 3: Derive key from password
  const key = await deriveKeyFromPassword(password, salt);
  onProgress?.({ phase: 'encrypting', progress: 30 });

  // Step 4: Encrypt with AES-GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: sliceBuffer(iv) },
    key,
    data
  );
  onProgress?.({ phase: 'encrypting', progress: 90 });

  // Step 5: Assemble output: marker + salt + iv + ciphertext
  const result = new Uint8Array(
    1 + SALT_LENGTH + IV_LENGTH + ciphertext.byteLength
  );
  result[0] = ENCRYPTION_MARKER_PASSWORD;
  result.set(salt, 1);
  result.set(iv, 1 + SALT_LENGTH);
  result.set(new Uint8Array(ciphertext), 1 + SALT_LENGTH + IV_LENGTH);

  onProgress?.({ phase: 'complete', progress: 100 });

  return new Blob([result], { type: 'application/octet-stream' });
}

/**
 * Encrypts data using keyfile-based encryption.
 *
 * @internal
 */
async function encryptWithKeyfile(
  data: ArrayBuffer,
  keyData: string,
  onProgress?: EncryptOptions['onProgress']
): Promise<Blob> {
  // Step 2: Generate random IV (no salt needed for keyfile)
  const iv = generateIV();
  onProgress?.({ phase: 'deriving_key', progress: 20 });

  // Step 3: Import key from keyfile
  const key = await importKeyFromKeyfile(keyData);
  onProgress?.({ phase: 'encrypting', progress: 30 });

  // Step 4: Encrypt with AES-GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: sliceBuffer(iv) },
    key,
    data
  );
  onProgress?.({ phase: 'encrypting', progress: 90 });

  // Step 5: Assemble output: marker + iv + ciphertext
  const result = new Uint8Array(1 + IV_LENGTH + ciphertext.byteLength);
  result[0] = ENCRYPTION_MARKER_KEYFILE;
  result.set(iv, 1);
  result.set(new Uint8Array(ciphertext), 1 + IV_LENGTH);

  onProgress?.({ phase: 'complete', progress: 100 });

  return new Blob([result], { type: 'application/octet-stream' });
}
