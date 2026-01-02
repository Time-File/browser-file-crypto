/**
 * Encryption type detection functions for browser-file-crypto.
 *
 * @module detect
 * @since 1.0.0
 */

import {
  ENCRYPTION_MARKER_PASSWORD,
  ENCRYPTION_MARKER_KEYFILE,
  ENCRYPTION_MARKER_PASSWORD_STREAM,
  ENCRYPTION_MARKER_KEYFILE_STREAM,
  MIN_ENCRYPTED_SIZE_PASSWORD,
  MIN_ENCRYPTED_SIZE_KEYFILE,
} from './constants';
import type { EncryptionType } from './types';
import { normalizeInput } from './utils';

/**
 * Detects the encryption type of encrypted data.
 *
 * @description
 * Reads the first byte (marker) of the encrypted data to determine
 * whether it was encrypted with a password or keyfile, and whether
 * it uses streaming or non-streaming encryption.
 *
 * - Marker 0x01: Password-based encryption (non-streaming)
 * - Marker 0x02: Keyfile-based encryption (non-streaming)
 * - Marker 0x11: Password-based streaming encryption
 * - Marker 0x12: Keyfile-based streaming encryption
 * - Other: Unknown format
 *
 * @param data - The encrypted data (Blob or ArrayBuffer)
 * @returns Promise resolving to encryption type
 *
 * @example
 * ```typescript
 * const type = await getEncryptionType(encryptedBlob);
 *
 * switch (type) {
 *   case 'password':
 *     // Use decryptFile with password
 *     break;
 *   case 'keyfile':
 *     // Use decryptFile with keyData
 *     break;
 *   case 'password-stream':
 *     // Use decryptFileStream with password
 *     break;
 *   case 'keyfile-stream':
 *     // Use decryptFileStream with keyData
 *     break;
 *   case 'unknown':
 *     // Show error: not encrypted with this library
 *     break;
 * }
 * ```
 *
 * @see {@link isEncryptedFile} for simple encryption check
 * @since 1.0.0
 */
export async function getEncryptionType(
  data: Blob | ArrayBuffer
): Promise<EncryptionType> {
  const buffer = await normalizeInput(data);
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 1) {
    return 'unknown';
  }

  const marker = bytes[0];

  if (marker === ENCRYPTION_MARKER_PASSWORD) {
    return 'password';
  }

  if (marker === ENCRYPTION_MARKER_KEYFILE) {
    return 'keyfile';
  }

  if (marker === ENCRYPTION_MARKER_PASSWORD_STREAM) {
    return 'password-stream';
  }

  if (marker === ENCRYPTION_MARKER_KEYFILE_STREAM) {
    return 'keyfile-stream';
  }

  return 'unknown';
}

/**
 * Minimum header size for password-based streaming encryption.
 * marker(1) + version(1) + chunkSize(4) + salt(16) + baseIV(12) = 34 bytes
 */
const MIN_STREAM_HEADER_PASSWORD = 34;

/**
 * Minimum header size for keyfile-based streaming encryption.
 * marker(1) + version(1) + chunkSize(4) + baseIV(12) = 18 bytes
 */
const MIN_STREAM_HEADER_KEYFILE = 18;

/**
 * Checks if data appears to be encrypted with this library.
 *
 * @description
 * Performs a quick check to determine if the data was likely encrypted
 * with browser-file-crypto. This checks:
 * 1. The marker byte is valid (0x01, 0x02, 0x11, or 0x12)
 * 2. The data meets minimum size requirements
 *
 * Note: This is not a cryptographic verification. It only checks
 * the format markers and size constraints.
 *
 * @param data - The data to check (Blob or ArrayBuffer)
 * @returns Promise resolving to true if data appears to be encrypted
 *
 * @example
 * ```typescript
 * const file = event.target.files[0];
 * const isEncrypted = await isEncryptedFile(file);
 *
 * if (isEncrypted) {
 *   showDecryptionUI();
 * } else {
 *   showEncryptionUI();
 * }
 * ```
 *
 * @since 1.0.0
 */
export async function isEncryptedFile(data: Blob | ArrayBuffer): Promise<boolean> {
  const buffer = await normalizeInput(data);
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 1) {
    return false;
  }

  const marker = bytes[0];

  // Check password-encrypted format (non-streaming)
  if (
    marker === ENCRYPTION_MARKER_PASSWORD &&
    bytes.length >= MIN_ENCRYPTED_SIZE_PASSWORD
  ) {
    return true;
  }

  // Check keyfile-encrypted format (non-streaming)
  if (
    marker === ENCRYPTION_MARKER_KEYFILE &&
    bytes.length >= MIN_ENCRYPTED_SIZE_KEYFILE
  ) {
    return true;
  }

  // Check password-encrypted streaming format
  if (
    marker === ENCRYPTION_MARKER_PASSWORD_STREAM &&
    bytes.length >= MIN_STREAM_HEADER_PASSWORD
  ) {
    return true;
  }

  // Check keyfile-encrypted streaming format
  if (
    marker === ENCRYPTION_MARKER_KEYFILE_STREAM &&
    bytes.length >= MIN_STREAM_HEADER_KEYFILE
  ) {
    return true;
  }

  return false;
}

/**
 * Checks if the encryption type is a streaming format.
 *
 * @description
 * Helper function to determine if the encryption type uses
 * streaming encryption, which requires different decryption methods.
 *
 * @param type - The encryption type
 * @returns true if the type is a streaming format
 *
 * @example
 * ```typescript
 * const type = await getEncryptionType(encryptedBlob);
 *
 * if (isStreamingEncryption(type)) {
 *   const decrypted = decryptFileStream(encryptedBlob, { password });
 * } else {
 *   const decrypted = await decryptFile(encryptedBlob, { password });
 * }
 * ```
 *
 * @since 1.1.0
 */
export function isStreamingEncryption(type: EncryptionType): boolean {
  return type === 'password-stream' || type === 'keyfile-stream';
}
