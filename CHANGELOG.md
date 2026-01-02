# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
