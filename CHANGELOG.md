# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
