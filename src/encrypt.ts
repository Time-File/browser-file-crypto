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
  DEFAULT_CHUNK_SIZE,
} from './constants';
import { CryptoError } from './errors';
import type { EncryptOptions, AutoEncryptOptions, StreamProgress } from './types';
import {
  normalizeInput,
  sliceBuffer,
  deriveKeyFromPassword,
  importKeyFromKeyfile,
  generateSalt,
  generateIV,
} from './utils';
import { encryptFileStream } from './stream';

/**
 * Default file size threshold for automatic streaming (100MB).
 */
const DEFAULT_STREAMING_THRESHOLD = 100 * 1024 * 1024;

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

/**
 * Encrypts a file with automatic streaming mode for large files.
 *
 * @description
 * Hybrid encryption function that automatically chooses between
 * non-streaming and streaming encryption based on file size.
 *
 * - Files smaller than threshold: Uses standard encryptFile (faster for small files)
 * - Files larger than threshold: Uses encryptFileStream (memory-efficient for large files)
 *
 * Default threshold is 100MB, configurable via options.
 *
 * @param file - The file to encrypt (File or Blob)
 * @param options - Auto encryption options including threshold settings
 * @returns Promise resolving to encrypted Blob
 *
 * @throws {CryptoError} When neither password nor keyData is provided (PASSWORD_REQUIRED)
 * @throws {CryptoError} When encryption fails (ENCRYPTION_FAILED)
 *
 * @example
 * ```typescript
 * // Auto mode with default 100MB threshold
 * const encrypted = await encryptFileAuto(file, {
 *   password: 'my-secret',
 *   autoStreaming: true,
 *   onProgress: ({ phase, progress }) => console.log(`${phase}: ${progress}%`)
 * });
 *
 * // Custom threshold (50MB)
 * const encrypted = await encryptFileAuto(file, {
 *   password: 'my-secret',
 *   autoStreaming: true,
 *   streamingThreshold: 50 * 1024 * 1024,
 *   chunkSize: 1024 * 1024  // 1MB chunks for streaming
 * });
 * ```
 *
 * @see {@link encryptFile} for non-streaming encryption
 * @see {@link encryptFileStream} for streaming encryption
 * @since 1.1.0
 */
export async function encryptFileAuto(
  file: File | Blob,
  options: AutoEncryptOptions
): Promise<Blob> {
  const {
    password,
    keyData,
    onProgress,
    autoStreaming = false,
    streamingThreshold = DEFAULT_STREAMING_THRESHOLD,
    chunkSize = DEFAULT_CHUNK_SIZE,
  } = options;

  // Validate: either password or keyData must be provided
  if (!password && !keyData) {
    throw new CryptoError('PASSWORD_REQUIRED');
  }

  // Determine whether to use streaming
  const useStreaming = autoStreaming && file.size > streamingThreshold;

  if (useStreaming) {
    // Use streaming encryption for large files
    const streamOnProgress = onProgress
      ? (progress: StreamProgress): void => {
        onProgress({
          phase: progress.phase as 'deriving_key' | 'encrypting' | 'complete',
          progress: progress.progress ?? Math.round((progress.processedBytes / file.size) * 100),
        });
      }
      : undefined;

    const encryptedStream = await encryptFileStream(file, {
      password,
      keyData,
      chunkSize,
      onProgress: streamOnProgress,
    });

    // Convert stream to Blob
    const response = new Response(encryptedStream);
    return await response.blob();
  } else {
    // Use standard encryption for small files
    return await encryptFile(file, { password, keyData, onProgress });
  }
}
