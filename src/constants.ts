/**
 * Cryptographic constants used throughout the library.
 * These values follow industry best practices for AES-256-GCM.
 *
 * @module constants
 * @since 1.0.0
 */

/**
 * Salt length in bytes for PBKDF2 key derivation.
 * 16 bytes (128 bits) provides sufficient randomness to prevent rainbow table attacks.
 */
export const SALT_LENGTH = 16;

/**
 * Initialization vector length in bytes for AES-GCM.
 * 12 bytes (96 bits) is the recommended IV size for AES-GCM per NIST SP 800-38D.
 */
export const IV_LENGTH = 12;

/**
 * AES key length in bits.
 * 256 bits provides the highest security level for AES.
 */
export const KEY_LENGTH = 256;

/**
 * PBKDF2 iteration count for key derivation.
 * 100,000 iterations balance security and performance.
 * Higher values increase resistance to brute-force attacks.
 */
export const PBKDF2_ITERATIONS = 100_000;

/**
 * Key file raw key length in bytes (256-bit).
 * Matches the AES-256 key size requirement.
 */
export const KEYFILE_KEY_LENGTH = 32;

/**
 * Encryption marker byte for password-based encryption.
 * Used to identify the encryption method when decrypting.
 */
export const ENCRYPTION_MARKER_PASSWORD = 0x01;

/**
 * Encryption marker byte for keyfile-based encryption.
 * Used to identify the encryption method when decrypting.
 */
export const ENCRYPTION_MARKER_KEYFILE = 0x02;

/**
 * Encryption marker byte for password-based streaming encryption.
 * Used to identify streaming encryption with password.
 * @since 1.1.0
 */
export const ENCRYPTION_MARKER_PASSWORD_STREAM = 0x11;

/**
 * Encryption marker byte for keyfile-based streaming encryption.
 * Used to identify streaming encryption with keyfile.
 * @since 1.1.0
 */
export const ENCRYPTION_MARKER_KEYFILE_STREAM = 0x12;

/**
 * Default chunk size for streaming encryption (64KB).
 * @since 1.1.0
 */
export const DEFAULT_CHUNK_SIZE = 64 * 1024;

/**
 * Streaming format version.
 * @since 1.1.0
 */
export const STREAM_FORMAT_VERSION = 0x01;

/**
 * AES-GCM authentication tag length in bytes.
 * 16 bytes (128 bits) is the default and recommended tag size.
 */
export const AUTH_TAG_LENGTH = 16;

/**
 * Minimum encrypted file size for password-based encryption.
 * Header (1 + 16 + 12 = 29 bytes) + Auth tag (16 bytes) = 45 bytes.
 */
export const MIN_ENCRYPTED_SIZE_PASSWORD = 1 + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;

/**
 * Minimum encrypted file size for keyfile-based encryption.
 * Header (1 + 12 = 13 bytes) + Auth tag (16 bytes) = 29 bytes.
 */
export const MIN_ENCRYPTED_SIZE_KEYFILE = 1 + IV_LENGTH + AUTH_TAG_LENGTH;

/**
 * Algorithm identifier string for AES-GCM.
 */
export const ALGORITHM = 'AES-GCM' as const;

/**
 * Hash algorithm used in PBKDF2 key derivation.
 */
export const HASH_ALGORITHM = 'SHA-256' as const;
