/**
 * Encryption type detection functions for browser-file-crypto.
 *
 * @module detect
 * @since 1.0.0
 */

import {
  ENCRYPTION_MARKER_PASSWORD,
  ENCRYPTION_MARKER_KEYFILE,
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
 * whether it was encrypted with a password or keyfile.
 *
 * - Marker 0x01: Password-based encryption
 * - Marker 0x02: Keyfile-based encryption
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
 *     // Show password input
 *     break;
 *   case 'keyfile':
 *     // Show keyfile picker
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

  return 'unknown';
}

/**
 * Checks if data appears to be encrypted with this library.
 *
 * @description
 * Performs a quick check to determine if the data was likely encrypted
 * with browser-file-crypto. This checks:
 * 1. The marker byte is valid (0x01 or 0x02)
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

  // Check password-encrypted format
  if (
    marker === ENCRYPTION_MARKER_PASSWORD &&
    bytes.length >= MIN_ENCRYPTED_SIZE_PASSWORD
  ) {
    return true;
  }

  // Check keyfile-encrypted format
  if (
    marker === ENCRYPTION_MARKER_KEYFILE &&
    bytes.length >= MIN_ENCRYPTED_SIZE_KEYFILE
  ) {
    return true;
  }

  return false;
}
