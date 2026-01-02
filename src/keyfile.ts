/**
 * Keyfile generation and management functions for browser-file-crypto.
 *
 * @module keyfile
 * @since 1.0.0
 */

import { KEYFILE_KEY_LENGTH } from './constants';
import type { KeyFile } from './types';
import { arrayBufferToBase64, base64ToArrayBuffer, generateRandomBytes } from './utils';

/**
 * Generates a new keyfile with a 256-bit random key.
 *
 * @description
 * Creates a cryptographically secure 256-bit (32 bytes) random key
 * using crypto.getRandomValues(). The key is returned as a KeyFile
 * object with metadata including version, algorithm, and creation timestamp.
 *
 * The generated key can be used directly with encryptFile() and decryptFile()
 * without any key derivation (unlike password-based encryption).
 *
 * @returns KeyFile object containing the generated key
 *
 * @example
 * ```typescript
 * const keyFile = generateKeyFile();
 * console.log(keyFile);
 * // {
 * //   version: 1,
 * //   algorithm: 'AES-256-GCM',
 * //   key: 'base64-encoded-32-bytes...',
 * //   createdAt: '2025-01-01T12:00:00.000Z'
 * // }
 *
 * // Use for encryption
 * const encrypted = await encryptFile(file, { keyData: keyFile.key });
 *
 * // Save keyfile for later
 * downloadKeyFile(keyFile.key, 'my-encryption-key');
 * ```
 *
 * @see {@link downloadKeyFile} for saving the keyfile
 * @see {@link parseKeyFile} for loading a saved keyfile
 * @since 1.0.0
 */
export function generateKeyFile(): KeyFile {
  const keyBytes = generateRandomBytes(KEYFILE_KEY_LENGTH);
  const key = arrayBufferToBase64(keyBytes.buffer as ArrayBuffer);

  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    key,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Parses a keyfile from JSON string content.
 *
 * @description
 * Validates and parses a JSON string into a KeyFile object.
 * Performs validation to ensure:
 * - Valid JSON format
 * - Required fields present (version, algorithm, key)
 * - Correct version (1)
 * - Correct algorithm ('AES-256-GCM')
 * - Key is a non-empty string
 *
 * @param content - JSON string content of the keyfile
 * @returns KeyFile object if valid, null if invalid
 *
 * @example
 * ```typescript
 * // From file input
 * const fileInput = document.querySelector('input[type="file"]');
 * fileInput.addEventListener('change', async (e) => {
 *   const file = e.target.files[0];
 *   const content = await file.text();
 *   const keyFile = parseKeyFile(content);
 *
 *   if (keyFile) {
 *     const decrypted = await decryptFile(encrypted, { keyData: keyFile.key });
 *   } else {
 *     console.error('Invalid keyfile format');
 *   }
 * });
 * ```
 *
 * @see {@link generateKeyFile} for creating keyfiles
 * @since 1.0.0
 */
export function parseKeyFile(content: string): KeyFile | null {
  try {
    const parsed = JSON.parse(content) as unknown;

    // Type guard and validation
    if (!isValidKeyFile(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Validates if an object is a valid KeyFile.
 *
 * @internal
 */
function isValidKeyFile(obj: unknown): obj is KeyFile {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  return (
    candidate.version === 1 &&
    candidate.algorithm === 'AES-256-GCM' &&
    typeof candidate.key === 'string' &&
    candidate.key.length > 0 &&
    typeof candidate.createdAt === 'string'
  );
}

/**
 * Downloads a keyfile as a JSON file with customizable extension.
 *
 * @description
 * Creates a downloadable JSON file containing the keyfile data.
 * The file extension can be customized (default: .key).
 *
 * Note: This function uses browser APIs (URL.createObjectURL, document.createElement)
 * and will not work in Node.js or Web Worker environments.
 *
 * @param keyData - Base64-encoded key string (from KeyFile.key)
 * @param fileName - Name for the downloaded file (without extension)
 * @param extension - File extension without dot (default: 'key')
 *
 * @example
 * ```typescript
 * const keyFile = generateKeyFile();
 *
 * // Downloads as 'my-secret-key.key' (default)
 * downloadKeyFile(keyFile.key, 'my-secret-key');
 *
 * // Downloads as 'my-secret-key.tfkey' (custom extension)
 * downloadKeyFile(keyFile.key, 'my-secret-key', 'tfkey');
 *
 * // The downloaded file contains:
 * // {
 * //   "version": 1,
 * //   "algorithm": "AES-256-GCM",
 * //   "key": "base64...",
 * //   "createdAt": "2025-01-01T00:00:00.000Z"
 * // }
 * ```
 *
 * @since 1.0.0
 */
export function downloadKeyFile(keyData: string, fileName: string, extension: string = 'key'): void {
  const keyFile: KeyFile = {
    version: 1,
    algorithm: 'AES-256-GCM',
    key: keyData,
    createdAt: new Date().toISOString(),
  };

  const json = JSON.stringify(keyFile, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.${extension}`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/**
 * Computes SHA-256 hash of a keyfile's key data.
 *
 * @description
 * Generates a SHA-256 hash of the key data for server-side verification.
 * This allows the server to verify that the client has the correct keyfile
 * without ever seeing the actual key.
 *
 * Use case: Store the hash on the server, then verify client-provided
 * hash matches before allowing access to encrypted content.
 *
 * @param keyData - Base64-encoded key string (from KeyFile.key)
 * @returns Promise resolving to hex-encoded SHA-256 hash
 *
 * @example
 * ```typescript
 * const keyFile = generateKeyFile();
 * const hash = await computeKeyFileHash(keyFile.key);
 * console.log(hash); // '3a7bd3e2c1f8...' (64 hex characters)
 *
 * // Send hash to server for storage
 * await fetch('/api/store-key-hash', {
 *   method: 'POST',
 *   body: JSON.stringify({ hash })
 * });
 *
 * // Later, verify keyfile by comparing hashes
 * const uploadedHash = await computeKeyFileHash(uploadedKeyFile.key);
 * const isValid = uploadedHash === storedHash;
 * ```
 *
 * @since 1.0.0
 */
export async function computeKeyFileHash(keyData: string): Promise<string> {
  const keyBuffer = base64ToArrayBuffer(keyData);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBuffer);
  const hashArray = new Uint8Array(hashBuffer);

  // Convert to hex string
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
