# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2026-10-14

### Changed

- **`downloadAndDecrypt` streams streaming-encrypted files** - The response body is decrypted while it downloads instead of being buffered whole, so large files no longer hold the full ciphertext (plus a combined copy) in memory. Single-shot files are buffered once into a pre-sized buffer.
- **`downloadAndDecryptStream` decrypts the response body directly** instead of reading it into a Blob first.
- Download progress is emitted once per percentage point instead of once per network chunk, and only moves forward. Streaming-encrypted downloads report `downloading` 0-95% (decryption runs in parallel), then `complete`.
- The saved file's object URL is revoked after 40 seconds instead of immediately after `click()`, which could cancel large saves in Safari and Firefox.
- Streaming decryption no longer re-copies the remaining buffer once per encrypted chunk when a network read contains many chunks.

### Added

- `CryptoError` accepts `{ cause }` and keeps the original failure. `DOWNLOAD_FAILED`, `DECRYPTION_FAILED` and `ENCRYPTION_FAILED` raised for unexpected errors (network drops, stream errors, memory allocation failures) now carry the original error as `error.cause`.

### Fixed

- Wrong password/keyfile on a streaming-encrypted file now reports `INVALID_PASSWORD` / `INVALID_KEYFILE` in browsers. Chromium rejects `Response#blob()` with a generic `TypeError` when the source stream errors, which previously surfaced as `DECRYPTION_FAILED` (`decryptFile`) or `DOWNLOAD_FAILED` (`downloadAndDecryptStream`).

## [1.1.2] - 2026-01-02

### Fixed

- Fixed TypeScript strict mode errors with missing return types on callbacks
- Removed unnecessary type assertions flagged by ESLint
- Fixed `async flush()` method without `await` expression in `createDecryptStream`

## [1.1.1] - 2026-01-02

### Added

- **`encryptFileAuto`** - Hybrid encryption that automatically switches to streaming for large files
  - Configurable size threshold (default: 100MB)
  - Same API as `encryptFile` with additional options
- **`downloadAndDecryptStream`** - Streaming version of `downloadAndDecrypt` for large files
- **Auto-detection in `decryptFile`** - Now automatically handles streaming-encrypted files
  - No need to check format and call separate functions
  - Seamlessly delegates to streaming decryption when needed
- New types: `AutoEncryptOptions`, `DownloadDecryptStreamOptions`

### Changed

- **StreamProgressPhase unified** - Now uses `'encrypting'` / `'decrypting'` instead of `'processing'`
  - Aligns with non-streaming `Progress` phases for UI compatibility
  - Easier to share progress UI components between streaming and non-streaming modes

### Fixed

- `decryptFile` no longer throws `UNSUPPORTED_FORMAT` for streaming-encrypted files

## [1.1.0] - 2026-01-02

### Added

- **Streaming Encryption/Decryption** for memory-efficient large file handling
  - `encryptFileStream` - Stream-based file encryption
  - `decryptFileStream` - Stream-based file decryption
  - `createEncryptStream` - Low-level encryption TransformStream
  - `createDecryptStream` - Low-level decryption TransformStream
  - `isStreamingEncryption` - Check if encryption type is streaming format
- New encryption markers for streaming format (`0x11`, `0x12`)
- Chunk-based processing with configurable chunk size (default: 64KB)
- Independent authentication per chunk for streaming integrity
- New types: `StreamEncryptOptions`, `StreamDecryptOptions`, `StreamProgress`
- Constants: `DEFAULT_CHUNK_SIZE`, `STREAM_FORMAT_VERSION`

### Changed

- `getEncryptionType` now returns `'password-stream'` or `'keyfile-stream'` for streaming-encrypted files
- `isEncryptedFile` now recognizes streaming format markers
- `EncryptionType` extended with streaming types

## [1.0.0] - 2025-01-01

### Added

- Initial release
- `encryptFile` - AES-256-GCM file encryption with password or keyfile
- `decryptFile` - File decryption with automatic type detection
- `generateKeyFile` - 256-bit random key generation
- `parseKeyFile` - Keyfile JSON parsing with validation
- `downloadKeyFile` - Browser download helper for keyfiles
- `computeKeyFileHash` - SHA-256 hash for server-side verification
- `getEncryptionType` - Detect encryption method (password/keyfile)
- `isEncryptedFile` - Check if file is encrypted
- `generateRandomPassword` - Cryptographically secure password generation
- `downloadAndDecrypt` - Download from URL + decrypt + save
- `CryptoError` - Typed error class with error codes
- Progress callbacks for all async operations
- Full TypeScript support with exported types
- Zero dependencies - uses only Web Crypto API
