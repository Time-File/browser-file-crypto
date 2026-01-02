# Security Specifications

Detailed security specifications and cryptographic design of browser-file-crypto.

## Cryptographic Algorithm

### AES-256-GCM

This library uses **AES-256-GCM** (Galois/Counter Mode) exclusively.

| Property | Value |
|----------|-------|
| Algorithm | AES-GCM |
| Key Size | 256 bits (32 bytes) |
| IV/Nonce Size | 96 bits (12 bytes) |
| Authentication Tag | 128 bits (16 bytes) |

**Why AES-256-GCM?**

- **Authenticated Encryption**: Provides both confidentiality and integrity
- **Hardware Acceleration**: AES-NI support in modern CPUs
- **NIST Recommended**: Standardized in NIST SP 800-38D
- **Web Crypto Support**: Native browser support via SubtleCrypto

---

## Key Derivation

### Password-Based (PBKDF2)

For password-based encryption, keys are derived using PBKDF2.

| Property | Value |
|----------|-------|
| Algorithm | PBKDF2 |
| Hash Function | SHA-256 |
| Iterations | 100,000 |
| Salt Size | 128 bits (16 bytes) |
| Output Key | 256 bits (32 bytes) |

```
derived_key = PBKDF2(password, salt, 100000, SHA-256, 256)
```

**Why 100,000 iterations?**

- Balances security and performance
- Provides approximately 0.1-0.5 seconds of computation
- Resistant to brute-force attacks on modern hardware

### Keyfile-Based

Keyfile-based encryption uses the key directly without derivation.

| Property | Value |
|----------|-------|
| Key Size | 256 bits (32 bytes) |
| Encoding | Base64 |
| Source | Cryptographically secure random |

---

## File Formats

### Standard Encryption (v1.0)

#### Password-Based Format (Marker 0x01)

```
┌─────────────┬──────────────┬─────────────┬─────────────────────────┐
│ Marker (1B) │ Salt (16B)   │ IV (12B)    │ Ciphertext + Tag (16B)  │
└─────────────┴──────────────┴─────────────┴─────────────────────────┘
```

| Field | Size | Description |
|-------|------|-------------|
| Marker | 1 byte | `0x01` - identifies password encryption |
| Salt | 16 bytes | Random salt for PBKDF2 |
| IV | 12 bytes | Random initialization vector |
| Ciphertext | Variable | AES-GCM encrypted data |
| Auth Tag | 16 bytes | GCM authentication tag |

**Minimum File Size**: 45 bytes (1 + 16 + 12 + 16)

#### Keyfile-Based Format (Marker 0x02)

```
┌─────────────┬─────────────┬─────────────────────────┐
│ Marker (1B) │ IV (12B)    │ Ciphertext + Tag (16B)  │
└─────────────┴─────────────┴─────────────────────────┘
```

| Field | Size | Description |
|-------|------|-------------|
| Marker | 1 byte | `0x02` - identifies keyfile encryption |
| IV | 12 bytes | Random initialization vector |
| Ciphertext | Variable | AES-GCM encrypted data |
| Auth Tag | 16 bytes | GCM authentication tag |

**Minimum File Size**: 29 bytes (1 + 12 + 16)

---

### Streaming Encryption (v1.1+)

#### Password-Based Streaming Format (Marker 0x11)

```
┌─────────────┬────────────┬──────────────┬──────────────┬─────────────┬─────────┐
│ Marker (1B) │ Version(1B)│ ChunkSize(4B)│ Salt (16B)   │ BaseIV (12B)│ Chunks  │
└─────────────┴────────────┴──────────────┴──────────────┴─────────────┴─────────┘
```

| Field | Size | Description |
|-------|------|-------------|
| Marker | 1 byte | `0x11` - identifies streaming password encryption |
| Version | 1 byte | Format version (`0x01`) |
| ChunkSize | 4 bytes | Chunk size in bytes (big-endian) |
| Salt | 16 bytes | Random salt for PBKDF2 |
| BaseIV | 12 bytes | Base initialization vector |
| Chunks | Variable | Encrypted chunks |

#### Keyfile-Based Streaming Format (Marker 0x12)

```
┌─────────────┬────────────┬──────────────┬──────────────┬─────────┐
│ Marker (1B) │ Version(1B)│ ChunkSize(4B)│ BaseIV (12B) │ Chunks  │
└─────────────┴────────────┴──────────────┴──────────────┴─────────┘
```

| Field | Size | Description |
|-------|------|-------------|
| Marker | 1 byte | `0x12` - identifies streaming keyfile encryption |
| Version | 1 byte | Format version (`0x01`) |
| ChunkSize | 4 bytes | Chunk size in bytes (big-endian) |
| BaseIV | 12 bytes | Base initialization vector |
| Chunks | Variable | Encrypted chunks |

#### Chunk Format

```
┌───────────────────┬─────────────────────────────────┐
│ ChunkLength (4B)  │ EncryptedData + AuthTag (16B)   │
└───────────────────┴─────────────────────────────────┘
```

| Field | Size | Description |
|-------|------|-------------|
| ChunkLength | 4 bytes | Total chunk size including auth tag |
| EncryptedData | Variable | AES-GCM encrypted chunk data |
| Auth Tag | 16 bytes | Per-chunk authentication tag |

#### IV Derivation for Chunks

Each chunk uses a unique IV derived from the base IV:

```
chunk_iv = base_iv XOR chunk_index
```

Where `chunk_index` is a 64-bit counter XORed with the last 8 bytes of the base IV. This ensures:
- No IV reuse across chunks
- Deterministic IV generation for potential random access
- Cryptographic security maintained

---

## Keyfile Format

```json
{
  "version": 1,
  "algorithm": "AES-256-GCM",
  "key": "<base64-encoded-32-bytes>",
  "createdAt": "2025-01-01T00:00:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| version | number | Format version (always 1) |
| algorithm | string | Algorithm identifier |
| key | string | Base64-encoded 256-bit key |
| createdAt | string | ISO 8601 timestamp |

---

## Security Properties

### Confidentiality

- **AES-256**: 256-bit keys provide 2^256 possible key combinations
- **Unique IVs**: Random IVs prevent identical plaintexts from producing identical ciphertexts
- **Streaming IVs**: Per-chunk IV derivation prevents IV reuse

### Integrity

- **GCM Authentication**: 128-bit authentication tag detects any tampering
- **Per-Chunk Authentication**: Streaming encryption authenticates each chunk independently
- **Early Failure**: Corrupted data detected immediately during decryption

### Key Protection

- **No Key Storage**: Keys are never stored; derived from passwords or keyfiles on demand
- **Memory Cleanup**: Keys exist only during operation (JavaScript limitations apply)
- **PBKDF2 Hardening**: 100,000 iterations slow brute-force attacks

---

## Security Best Practices

### Password Selection

```typescript
// Good: Long, random passwords
const password = "correct-horse-battery-staple-42!";

// Better: Use keyfiles for automated systems
const keyFile = generateKeyFile();
```

### Keyfile Storage

1. **Separate Storage**: Keep keyfiles separate from encrypted data
2. **Backup**: Maintain secure backups of keyfiles
3. **Access Control**: Restrict keyfile access to authorized users only
4. **Secure Transfer**: Use encrypted channels to share keyfiles

### Application Security

```typescript
// Always handle errors
try {
  const decrypted = await decryptFile(blob, { password });
} catch (error) {
  if (error.code === 'INVALID_PASSWORD') {
    // Don't reveal if password or file is wrong
    showError('Decryption failed');
  }
}

// Clear sensitive data when done
password = '';
keyData = '';
```

---

## Limitations

### Browser Security Model

- **JavaScript Memory**: No guaranteed secure memory clearing
- **Side Channels**: Timing attacks possible in JavaScript
- **Randomness**: Depends on browser's crypto.getRandomValues()

### Not Suitable For

- **Key Management**: Use dedicated HSMs for production key storage
- **Multi-Party Encryption**: No support for shared keys or threshold encryption
- **Forward Secrecy**: Same key encrypts all files

---

## Compliance Notes

This library implements cryptographic primitives following:

- **NIST SP 800-38D**: AES-GCM specification
- **NIST SP 800-132**: PBKDF2 recommendations
- **OWASP Guidelines**: Secure cryptographic practices

For compliance-critical applications, consult with security professionals to ensure the implementation meets your specific requirements.
