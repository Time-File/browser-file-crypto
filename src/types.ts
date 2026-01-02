/**
 * Core type definitions for browser-file-crypto.
 *
 * @module types
 * @since 1.0.0
 */

/**
 * Progress phase during encryption/decryption operations.
 *
 * @description
 * - `deriving_key`: PBKDF2 key derivation in progress (password mode)
 * - `encrypting`: AES-GCM encryption in progress
 * - `decrypting`: AES-GCM decryption in progress
 * - `downloading`: File download in progress (downloadAndDecrypt)
 * - `complete`: Operation finished successfully
 */
export type ProgressPhase =
  | 'deriving_key'
  | 'encrypting'
  | 'decrypting'
  | 'downloading'
  | 'complete';

/**
 * Progress information for encryption/decryption operations.
 *
 * @example
 * ```typescript
 * onProgress: ({ phase, progress }) => {
 *   console.log(`${phase}: ${progress}%`);
 * }
 * ```
 */
export interface Progress {
  /** Current phase of the operation */
  phase: ProgressPhase;

  /** Progress percentage (0-100) */
  progress: number;
}

/**
 * Callback function for progress updates.
 *
 * @param progress - Current progress information
 */
export type ProgressCallback = (progress: Progress) => void;

/**
 * Options for file encryption.
 *
 * @description
 * Either `password` or `keyData` must be provided, but not both.
 *
 * @example
 * ```typescript
 * // Password-based encryption
 * const options: EncryptOptions = {
 *   password: 'my-secret-password',
 *   onProgress: ({ progress }) => console.log(`${progress}%`)
 * };
 *
 * // Keyfile-based encryption
 * const options: EncryptOptions = {
 *   keyData: keyFile.key,
 *   onProgress: ({ progress }) => console.log(`${progress}%`)
 * };
 * ```
 */
export interface EncryptOptions {
  /** Password for encryption (required if keyData not provided) */
  password?: string;

  /** Base64-encoded key data from keyfile (required if password not provided) */
  keyData?: string;

  /** Progress callback for UI updates */
  onProgress?: ProgressCallback;
}

/**
 * Options for file decryption.
 *
 * @description
 * The correct option (password or keyData) must match the encryption method used.
 * Use `getEncryptionType()` to detect which method was used.
 *
 * @example
 * ```typescript
 * const options: DecryptOptions = {
 *   password: 'my-secret-password',
 *   onProgress: ({ phase, progress }) => {
 *     if (phase === 'complete') console.log('Done!');
 *   }
 * };
 * ```
 */
export interface DecryptOptions {
  /** Password for decryption (required for password-encrypted files) */
  password?: string;

  /** Base64-encoded key data (required for keyfile-encrypted files) */
  keyData?: string;

  /** Progress callback for UI updates */
  onProgress?: ProgressCallback;
}

/**
 * Options for download and decrypt operation.
 *
 * @description
 * Extends DecryptOptions with fileName for the downloaded file.
 *
 * @example
 * ```typescript
 * await downloadAndDecrypt('https://example.com/file.enc', {
 *   password: 'secret',
 *   fileName: 'document.pdf',
 *   onProgress: ({ phase, progress }) => console.log(`${phase}: ${progress}%`)
 * });
 * ```
 */
export interface DownloadDecryptOptions extends DecryptOptions {
  /** File name to use when saving the decrypted file */
  fileName: string;
}

/**
 * Key file structure for keyfile-based encryption.
 *
 * @description
 * Contains a 256-bit random key for direct AES-256-GCM encryption.
 * No key derivation is needed - the key is used directly.
 *
 * @example
 * ```typescript
 * const keyFile = generateKeyFile();
 * // {
 * //   version: 1,
 * //   algorithm: 'AES-256-GCM',
 * //   key: 'base64-encoded-32-bytes',
 * //   createdAt: '2025-01-01T00:00:00.000Z'
 * // }
 * ```
 */
export interface KeyFile {
  /** Key file format version */
  version: 1;

  /** Encryption algorithm identifier */
  algorithm: 'AES-256-GCM';

  /** Base64-encoded 256-bit key */
  key: string;

  /** ISO 8601 timestamp of key creation */
  createdAt: string;
}

/**
 * Encryption type detected from encrypted data.
 *
 * @description
 * - `password`: File was encrypted with a password (marker byte 0x01)
 * - `keyfile`: File was encrypted with a keyfile (marker byte 0x02)
 * - `password-stream`: File was encrypted with password streaming (marker byte 0x11)
 * - `keyfile-stream`: File was encrypted with keyfile streaming (marker byte 0x12)
 * - `unknown`: Unrecognized format or not encrypted with this library
 */
export type EncryptionType =
  | 'password'
  | 'keyfile'
  | 'password-stream'
  | 'keyfile-stream'
  | 'unknown';

// =============================================================================
// Streaming Encryption Types (v1.1.0)
// =============================================================================

/**
 * Progress phase during streaming encryption/decryption operations.
 *
 * @since 1.1.0
 */
export type StreamProgressPhase = 'deriving_key' | 'processing' | 'complete';

/**
 * Progress information for streaming encryption/decryption operations.
 *
 * @since 1.1.0
 */
export interface StreamProgress {
  /** Current phase of the operation */
  phase: StreamProgressPhase;

  /** Number of bytes processed so far */
  processedBytes: number;

  /** Total bytes to process (undefined if unknown, e.g., for streams) */
  totalBytes?: number;

  /** Number of chunks processed so far */
  processedChunks: number;

  /** Progress percentage (0-100), only available when totalBytes is known */
  progress?: number;
}

/**
 * Callback function for streaming progress updates.
 *
 * @since 1.1.0
 */
export type StreamProgressCallback = (progress: StreamProgress) => void;

/**
 * Options for streaming file encryption.
 *
 * @since 1.1.0
 */
export interface StreamEncryptOptions {
  /** Password for encryption (required if keyData not provided) */
  password?: string;

  /** Base64-encoded key data from keyfile (required if password not provided) */
  keyData?: string;

  /** Chunk size in bytes (default: 65536 = 64KB) */
  chunkSize?: number;

  /** Progress callback for UI updates */
  onProgress?: StreamProgressCallback;
}

/**
 * Options for streaming file decryption.
 *
 * @since 1.1.0
 */
export interface StreamDecryptOptions {
  /** Password for decryption (required for password-encrypted files) */
  password?: string;

  /** Base64-encoded key data (required for keyfile-encrypted files) */
  keyData?: string;

  /** Progress callback for UI updates */
  onProgress?: StreamProgressCallback;
}
