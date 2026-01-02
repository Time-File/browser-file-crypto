/**
 * Error handling for browser-file-crypto.
 *
 * @module errors
 * @since 1.0.0
 */

/**
 * Error codes for CryptoError.
 *
 * @description
 * - `INVALID_INPUT`: Input is not a valid File, Blob, or ArrayBuffer
 * - `PASSWORD_REQUIRED`: Password is required but not provided
 * - `KEYFILE_REQUIRED`: Keyfile is required but not provided
 * - `INVALID_PASSWORD`: Decryption failed due to incorrect password
 * - `INVALID_KEYFILE`: Decryption failed due to incorrect keyfile
 * - `INVALID_ENCRYPTED_DATA`: Data is corrupted or not encrypted with this library
 * - `ENCRYPTION_FAILED`: Encryption operation failed
 * - `DECRYPTION_FAILED`: Decryption operation failed
 * - `DOWNLOAD_FAILED`: File download failed
 * - `UNSUPPORTED_FORMAT`: Encrypted file format is not supported
 */
export type CryptoErrorCode =
  | 'INVALID_INPUT'
  | 'PASSWORD_REQUIRED'
  | 'KEYFILE_REQUIRED'
  | 'INVALID_PASSWORD'
  | 'INVALID_KEYFILE'
  | 'INVALID_ENCRYPTED_DATA'
  | 'ENCRYPTION_FAILED'
  | 'DECRYPTION_FAILED'
  | 'DOWNLOAD_FAILED'
  | 'UNSUPPORTED_FORMAT';

/**
 * Error messages for each error code.
 */
const ERROR_MESSAGES: Record<CryptoErrorCode, string> = {
  INVALID_INPUT: 'Input must be a File, Blob, or ArrayBuffer.',
  PASSWORD_REQUIRED: 'Password or keyfile is required for encryption.',
  KEYFILE_REQUIRED: 'Keyfile is required to decrypt this file.',
  INVALID_PASSWORD: 'Decryption failed: incorrect password.',
  INVALID_KEYFILE: 'Decryption failed: incorrect keyfile.',
  INVALID_ENCRYPTED_DATA: 'Invalid encrypted data: file may be corrupted.',
  ENCRYPTION_FAILED: 'Encryption failed.',
  DECRYPTION_FAILED: 'Decryption failed.',
  DOWNLOAD_FAILED: 'File download failed.',
  UNSUPPORTED_FORMAT: 'Unsupported encryption format.',
};

/**
 * Custom error class for crypto operations.
 *
 * @description
 * Provides structured error handling with error codes for programmatic handling.
 * Each error includes a code that can be used for i18n or specific error handling.
 *
 * @example
 * ```typescript
 * try {
 *   await decryptFile(data, { password: 'wrong' });
 * } catch (error) {
 *   if (error instanceof CryptoError) {
 *     console.log(error.code);    // 'INVALID_PASSWORD'
 *     console.log(error.message); // 'Decryption failed: incorrect password.'
 *
 *     switch (error.code) {
 *       case 'INVALID_PASSWORD':
 *         showPasswordError();
 *         break;
 *       case 'INVALID_ENCRYPTED_DATA':
 *         showCorruptedFileError();
 *         break;
 *     }
 *   }
 * }
 * ```
 *
 * @see {@link CryptoErrorCode} for all available error codes
 * @since 1.0.0
 */
export class CryptoError extends Error {
  /** Error code for programmatic handling */
  readonly code: CryptoErrorCode;

  /**
   * Creates a new CryptoError.
   *
   * @param code - Error code identifying the type of error
   * @param message - Optional custom message (defaults to predefined message)
   */
  constructor(code: CryptoErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'CryptoError';
    this.code = code;

    // Maintains proper stack trace in V8 environments (Chrome, Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CryptoError);
    }
  }
}

/**
 * Type guard to check if an error is a CryptoError.
 *
 * @param error - The error to check
 * @returns True if the error is a CryptoError
 *
 * @example
 * ```typescript
 * try {
 *   await decryptFile(data, options);
 * } catch (error) {
 *   if (isCryptoError(error)) {
 *     console.log(error.code);
 *   }
 * }
 * ```
 */
export function isCryptoError(error: unknown): error is CryptoError {
  return error instanceof CryptoError;
}
