/**
 * browser-file-crypto
 *
 * Zero-dependency file encryption for browsers using Web Crypto API.
 * Provides AES-256-GCM encryption with password or keyfile-based keys.
 *
 * @packageDocumentation
 * @module browser-file-crypto
 * @since 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   encryptFile,
 *   decryptFile,
 *   generateKeyFile,
 *   getEncryptionType
 * } from '@time-file/browser-file-crypto';
 *
 * // Password-based encryption
 * const encrypted = await encryptFile(file, {
 *   password: 'my-secret',
 *   onProgress: ({ phase, progress }) => console.log(`${phase}: ${progress}%`)
 * });
 *
 * // Keyfile-based encryption
 * const keyFile = generateKeyFile();
 * const encrypted = await encryptFile(file, { keyData: keyFile.key });
 *
 * // Decryption
 * const decrypted = await decryptFile(encrypted, { password: 'my-secret' });
 * ```
 */

// =============================================================================
// Core Encryption/Decryption
// =============================================================================

export { encryptFile, encryptFileAuto } from './encrypt';
export { decryptFile } from './decrypt';

// =============================================================================
// Streaming Encryption/Decryption (v1.1.0)
// =============================================================================

export {
  createEncryptStream,
  createDecryptStream,
  encryptFileStream,
  decryptFileStream,
} from './stream';

// =============================================================================
// Detection & Utilities
// =============================================================================

export { getEncryptionType, isEncryptedFile, isStreamingEncryption } from './detect';
export { generateRandomPassword } from './utils';

// =============================================================================
// Keyfile Management
// =============================================================================

export {
  generateKeyFile,
  parseKeyFile,
  downloadKeyFile,
  computeKeyFileHash,
} from './keyfile';

// =============================================================================
// Download & Decrypt
// =============================================================================

export { downloadAndDecrypt, downloadAndDecryptStream } from './download';

// =============================================================================
// Types
// =============================================================================

export type {
  EncryptOptions,
  DecryptOptions,
  DownloadDecryptOptions,
  Progress,
  ProgressPhase,
  ProgressCallback,
  KeyFile,
  EncryptionType,
  // Streaming types (v1.1.0)
  StreamEncryptOptions,
  StreamDecryptOptions,
  StreamProgress,
  StreamProgressPhase,
  StreamProgressCallback,
  // v1.1.1 additions
  DownloadDecryptStreamOptions,
  AutoEncryptOptions,
} from './types';

// =============================================================================
// Errors
// =============================================================================

export { CryptoError, isCryptoError } from './errors';
export type { CryptoErrorCode } from './errors';

// =============================================================================
// Constants (for advanced users)
// =============================================================================

export {
  SALT_LENGTH,
  IV_LENGTH,
  KEY_LENGTH,
  PBKDF2_ITERATIONS,
  KEYFILE_KEY_LENGTH,
  ENCRYPTION_MARKER_PASSWORD,
  ENCRYPTION_MARKER_KEYFILE,
  AUTH_TAG_LENGTH,
  MIN_ENCRYPTED_SIZE_PASSWORD,
  MIN_ENCRYPTED_SIZE_KEYFILE,
  ALGORITHM,
  HASH_ALGORITHM,
  // Streaming constants (v1.1.0)
  ENCRYPTION_MARKER_PASSWORD_STREAM,
  ENCRYPTION_MARKER_KEYFILE_STREAM,
  DEFAULT_CHUNK_SIZE,
  STREAM_FORMAT_VERSION,
} from './constants';
