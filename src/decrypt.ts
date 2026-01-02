/**
 * File decryption functions for browser-file-crypto.
 *
 * @module decrypt
 * @since 1.0.0
 */

import {
  SALT_LENGTH,
  IV_LENGTH,
  ENCRYPTION_MARKER_PASSWORD,
  ENCRYPTION_MARKER_KEYFILE,
  ENCRYPTION_MARKER_PASSWORD_STREAM,
  ENCRYPTION_MARKER_KEYFILE_STREAM,
  MIN_ENCRYPTED_SIZE_PASSWORD,
  MIN_ENCRYPTED_SIZE_KEYFILE,
  ALGORITHM,
} from './constants';
import { CryptoError } from './errors';
import type { DecryptOptions, StreamProgress } from './types';
import {
  normalizeInput,
  sliceBuffer,
  deriveKeyFromPassword,
  importKeyFromKeyfile,
} from './utils';
import { decryptFileStream } from './stream';

/**
 * Decrypts a file that was encrypted with encryptFile.
 *
 * @description
 * Automatically detects whether the file was encrypted with password or keyfile
 * based on the marker byte, then decrypts accordingly.
 *
 * For password-encrypted files:
 * - Extracts salt and IV from header
 * - Derives key using PBKDF2
 * - Decrypts with AES-GCM
 *
 * For keyfile-encrypted files:
 * - Extracts IV from header
 * - Imports key directly
 * - Decrypts with AES-GCM
 *
 * @param encrypted - The encrypted data (Blob or ArrayBuffer)
 * @param options - Decryption options including password or keyData
 * @returns Promise resolving to decrypted Blob
 *
 * @throws {CryptoError} When password is required but not provided (PASSWORD_REQUIRED)
 * @throws {CryptoError} When keyfile is required but not provided (KEYFILE_REQUIRED)
 * @throws {CryptoError} When password is incorrect (INVALID_PASSWORD)
 * @throws {CryptoError} When keyfile is incorrect (INVALID_KEYFILE)
 * @throws {CryptoError} When data is corrupted (INVALID_ENCRYPTED_DATA)
 *
 * @example
 * ```typescript
 * // Password-based decryption
 * try {
 *   const decrypted = await decryptFile(encryptedBlob, {
 *     password: 'my-secret',
 *     onProgress: ({ phase, progress }) => console.log(`${phase}: ${progress}%`)
 *   });
 * } catch (error) {
 *   if (error instanceof CryptoError && error.code === 'INVALID_PASSWORD') {
 *     console.log('Wrong password!');
 *   }
 * }
 *
 * // Keyfile-based decryption
 * const decrypted = await decryptFile(encryptedBlob, {
 *   keyData: keyFile.key
 * });
 * ```
 *
 * @see {@link encryptFile} for encryption
 * @see {@link getEncryptionType} for detecting encryption method
 * @since 1.0.0
 */
export async function decryptFile(
  encrypted: Blob | ArrayBuffer,
  options: DecryptOptions
): Promise<Blob> {
  const { password, keyData, onProgress } = options;

  try {
    // Step 1: Normalize input to ArrayBuffer
    onProgress?.({ phase: 'decrypting', progress: 0 });
    const data = new Uint8Array(await normalizeInput(encrypted));
    onProgress?.({ phase: 'decrypting', progress: 5 });

    // Step 2: Check minimum size and read marker
    if (data.length < 1) {
      throw new CryptoError('INVALID_ENCRYPTED_DATA');
    }

    const marker = data[0];

    // Step 3: Branch based on encryption method
    if (marker === ENCRYPTION_MARKER_PASSWORD) {
      if (!password) {
        throw new CryptoError('PASSWORD_REQUIRED');
      }
      return await decryptWithPassword(data, password, onProgress);
    } else if (marker === ENCRYPTION_MARKER_KEYFILE) {
      if (!keyData) {
        throw new CryptoError('KEYFILE_REQUIRED');
      }
      return await decryptWithKeyfile(data, keyData, onProgress);
    } else if (
      marker === ENCRYPTION_MARKER_PASSWORD_STREAM ||
      marker === ENCRYPTION_MARKER_KEYFILE_STREAM
    ) {
      // Auto-delegate to streaming decryption
      return await decryptStreamingFormat(encrypted, options);
    } else {
      throw new CryptoError('UNSUPPORTED_FORMAT');
    }
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError('DECRYPTION_FAILED');
  }
}

/**
 * Decrypts data that was encrypted with password.
 *
 * @internal
 */
async function decryptWithPassword(
  data: Uint8Array,
  password: string,
  onProgress?: DecryptOptions['onProgress']
): Promise<Blob> {
  // Validate minimum size
  if (data.length < MIN_ENCRYPTED_SIZE_PASSWORD) {
    throw new CryptoError('INVALID_ENCRYPTED_DATA');
  }

  onProgress?.({ phase: 'deriving_key', progress: 10 });

  // Extract components: marker(1) + salt(16) + iv(12) + ciphertext
  const salt = data.slice(1, 1 + SALT_LENGTH);
  const iv = data.slice(1 + SALT_LENGTH, 1 + SALT_LENGTH + IV_LENGTH);
  const ciphertext = data.slice(1 + SALT_LENGTH + IV_LENGTH);

  // Derive key from password
  const key = await deriveKeyFromPassword(password, salt);
  onProgress?.({ phase: 'decrypting', progress: 30 });

  // Decrypt with AES-GCM
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: sliceBuffer(iv) },
      key,
      ciphertext
    );
    onProgress?.({ phase: 'complete', progress: 100 });

    return new Blob([plaintext]);
  } catch {
    throw new CryptoError('INVALID_PASSWORD');
  }
}

/**
 * Decrypts data that was encrypted with keyfile.
 *
 * @internal
 */
async function decryptWithKeyfile(
  data: Uint8Array,
  keyData: string,
  onProgress?: DecryptOptions['onProgress']
): Promise<Blob> {
  // Validate minimum size
  if (data.length < MIN_ENCRYPTED_SIZE_KEYFILE) {
    throw new CryptoError('INVALID_ENCRYPTED_DATA');
  }

  onProgress?.({ phase: 'decrypting', progress: 10 });

  // Extract components: marker(1) + iv(12) + ciphertext
  const iv = data.slice(1, 1 + IV_LENGTH);
  const ciphertext = data.slice(1 + IV_LENGTH);

  // Import key from keyfile
  const key = await importKeyFromKeyfile(keyData);
  onProgress?.({ phase: 'decrypting', progress: 30 });

  // Decrypt with AES-GCM
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: sliceBuffer(iv) },
      key,
      ciphertext
    );
    onProgress?.({ phase: 'complete', progress: 100 });

    return new Blob([plaintext]);
  } catch {
    throw new CryptoError('INVALID_KEYFILE');
  }
}

/**
 * Decrypts streaming-encrypted data by delegating to decryptFileStream.
 *
 * @description
 * This function provides automatic fallback for streaming-encrypted files
 * when decryptFile() is called. It converts the streaming output back to
 * a Blob for API compatibility.
 *
 * @internal
 */
async function decryptStreamingFormat(
  encrypted: Blob | ArrayBuffer,
  options: DecryptOptions
): Promise<Blob> {
  const { password, keyData, onProgress } = options;

  // Convert ArrayBuffer to Blob if needed
  const blob = encrypted instanceof Blob ? encrypted : new Blob([encrypted]);

  // Map StreamProgress callback to Progress callback
  const streamOnProgress = onProgress
    ? (progress: StreamProgress): void => {
      onProgress({
        phase: progress.phase as 'deriving_key' | 'decrypting' | 'complete',
        progress: progress.progress ?? Math.round((progress.processedBytes / (progress.totalBytes || 1)) * 100),
      });
    }
    : undefined;

  // Use decryptFileStream and collect result
  const decryptedStream = decryptFileStream(blob, {
    password,
    keyData,
    onProgress: streamOnProgress,
  });

  // Convert stream to Blob
  const response = new Response(decryptedStream);
  return await response.blob();
}
