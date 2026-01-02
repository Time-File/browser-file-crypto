# @time-file/browser-file-crypto

<p align="center">
  <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/og-image.png#gh-light-mode-only" alt="browser-file-crypto" width="100%" />
  <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/og-image-dark.png#gh-dark-mode-only" alt="browser-file-crypto" width="100%" />
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/encryption-structure.png#gh-light-mode-only" alt="Encryption Flow" width="100%" />
  <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/encryption-structure-dark.png#gh-dark-mode-only" alt="Encryption Flow" width="100%" />
</p>

<p align="center">
  Zero-dependency file encryption for browsers using Web Crypto API.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@time-file/browser-file-crypto"><img src="https://img.shields.io/npm/v/@time-file/browser-file-crypto.svg" alt="npm version" /></a>
  <a href="https://bundlephobia.com/package/@time-file/browser-file-crypto"><img src="https://img.shields.io/bundlephobia/minzip/@time-file/browser-file-crypto" alt="bundle size" /></a>
  <a href="https://github.com/time-file/browser-file-crypto/stargazers"><img src="https://img.shields.io/github/stars/time-file/browser-file-crypto?style=flat" alt="stars" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
</p>

<p align="center">
  <strong>English</strong> | <a href="./README.ko.md">한국어</a>
</p>

## Features

<p align="center">
  <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/features-grid.png#gh-light-mode-only" alt="Features" width="100%" />
  <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/features-grid-dark.png#gh-dark-mode-only" alt="Features" width="100%" />
</p>

- **Zero-Knowledge** - Client-side encryption, server never sees plaintext
- **Zero-Dependency** - Native Web Crypto API only
- **AES-256-GCM** - Industry-standard authenticated encryption
- **Password & Keyfile** - Two modes for different use cases
- **Progress Callbacks** - Track encryption/decryption progress
- **TypeScript** - Full type definitions
- **Tiny** - < 4KB gzipped

## Why?

Web Crypto API is powerful but verbose. You need ~100 lines of boilerplate just to encrypt a file, and it's easy to make critical mistakes.

- ❌ Reusing IV (catastrophic for security)
- ❌ Low PBKDF2 iterations (brute-forceable)
- ❌ Missing salt/IV in output (can't decrypt later)
- ❌ Wrong ArrayBuffer slicing (corrupted data)


> This library handles it all.

```typescript
// ❌ Before - Raw Web Crypto API
const encoder = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const keyMaterial = await crypto.subtle.importKey(
  'raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']
);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
  keyMaterial,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt']
);
const arrayBuffer = await file.arrayBuffer();
const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  arrayBuffer
);
const result = new Uint8Array(1 + salt.length + iv.length + ciphertext.byteLength);
result.set([0x01], 0);
result.set(salt, 1);
result.set(iv, 17);
result.set(new Uint8Array(ciphertext), 29);
// ... and decryption is another 30 lines
```

```typescript
// ✅ After - With this library
const encrypted = await encryptFile(file, { password: 'secret' });
const decrypted = await decryptFile(encrypted, { password: 'secret' });
```

**Done.**

## Comparison

| Feature | crypto-js | @aws-crypto | Web Crypto (direct) | **browser-file-crypto** |
|---------|-----------|-------------|---------------------|------------------------|
| Maintained | ❌ Deprecated | ✅ | - | ✅ |
| Bundle size | ~50KB | ~200KB+ | 0 | **< 4KB** |
| Dependencies | Many | Many | None | **None** |
| File-focused API | ❌ | ⚠️ | ❌ | **✅** |
| Progress callbacks | ❌ | ❌ | ❌ | **✅** |
| Keyfile mode | ❌ | ❌ | ❌ | **✅** |
| Type detection | ❌ | ❌ | ❌ | **✅** |
| TypeScript | ❌ | ✅ | - | **✅** |

## Install

```bash
npm install @time-file/browser-file-crypto
# or
pnpm add @time-file/browser-file-crypto
```

## Quick Start

```typescript
import { encryptFile, decryptFile } from '@time-file/browser-file-crypto';

// Encrypt
const file = document.querySelector('input[type="file"]').files[0];
const encrypted = await encryptFile(file, {
  password: 'my-secret-password',
  onProgress: ({ phase, progress }) => console.log(`${phase}: ${progress}%`)
});

// Decrypt
const decrypted = await decryptFile(encrypted, {
  password: 'my-secret-password'
});
```

## API

### `encryptFile(file, options)`

```typescript
const encrypted = await encryptFile(file, {
  password: 'secret',        // OR
  keyData: keyFile.key,      // use keyfile
  onProgress: (p) => {}      // optional
});
```

### `decryptFile(encrypted, options)`

```typescript
const decrypted = await decryptFile(encrypted, {
  password: 'secret',        // OR
  keyData: keyFile.key,
  onProgress: (p) => {}
});
```

### Keyfile Mode

No password to remember:

```typescript
import { generateKeyFile, downloadKeyFile, parseKeyFile } from '@time-file/browser-file-crypto';

const keyFile = generateKeyFile();
downloadKeyFile(keyFile.key, 'my-secret-key');           // saves .key file (default)

// custom extension
downloadKeyFile(keyFile.key, 'my-secret-key', 'tfkey');  // saves .tfkey file

const encrypted = await encryptFile(file, { keyData: keyFile.key });

// Later, load and use
const content = await uploadedFile.text();
const loaded = parseKeyFile(content);
if (loaded) {
  const decrypted = await decryptFile(encrypted, { keyData: loaded.key });
}
```

### Utilities

```typescript
import { getEncryptionType, isEncryptedFile, generateRandomPassword } from '@time-file/browser-file-crypto';

await getEncryptionType(blob);  // 'password' | 'keyfile' | 'unknown'
await isEncryptedFile(blob);    // true | false
generateRandomPassword(24);     // 'Kx9#mP2$vL5@nQ8!...'
```

### Download & Decrypt

```typescript
import { downloadAndDecrypt } from '@time-file/browser-file-crypto';

await downloadAndDecrypt('https://example.com/secret.enc', {
  password: 'secret',
  fileName: 'document.pdf',
  onProgress: ({ phase, progress }) => console.log(`${phase}: ${progress}%`)
});
```

### Error Handling

```typescript
import { isCryptoError } from '@time-file/browser-file-crypto';

try {
  await decryptFile(encrypted, { password: 'wrong' });
} catch (error) {
  if (isCryptoError(error)) {
    // error.code: 'INVALID_PASSWORD' | 'INVALID_KEYFILE' | 'INVALID_ENCRYPTED_DATA'
  }
}
```

## Security

### Spec

| Component | Value |
|-----------|-------|
| Algorithm | AES-256-GCM |
| Key Derivation | PBKDF2 (SHA-256, 100k iterations) |
| Salt | 16 bytes (random per encryption) |
| IV | 12 bytes (random per encryption) |
| Auth Tag | 16 bytes |

### File Format

<p align="center">
  <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/file-format.png#gh-light-mode-only" alt="File Format" width="100%" />
  <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/file-format-dark.png#gh-dark-mode-only" alt="File Format" width="100%" />
</p>

```
Password-encrypted
=> [0x01] + [salt:16] + [iv:12] + [ciphertext + auth_tag:16]

Keyfile-encrypted
=> [0x02] + [iv:12] + [ciphertext + auth_tag:16]
```

### Notes

- Keys are non-extractable (`extractable: false`)
- Random IV/salt per encryption = no identical ciphertexts
- AES-GCM = authenticated encryption (tamper detection)
- 100k PBKDF2 iterations = brute-force resistant

## Browser Support

| Browser | Version |
|---------|---------|
| Chrome | 80+ |
| Firefox | 74+ |
| Safari | 14+ |
| Edge | 80+ |

Also works in Node.js 18+, Deno, Cloudflare Workers.

## TypeScript

```typescript
import type {
  EncryptOptions,
  DecryptOptions,
  Progress,
  KeyFile,
  EncryptionType,
  CryptoErrorCode
} from '@time-file/browser-file-crypto';
```

## Links

- [Changelog](./CHANGELOG.md)
- [License](./LICENSE)
- [npm](https://www.npmjs.com/package/@time-file/browser-file-crypto)
- [GitHub](https://github.com/time-file/browser-file-crypto)

## License

[MIT](./LICENSE)

---

<p align="center">
  <a href="https://timefile.co/en">
    <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/timefile-footer.png#gh-light-mode-only" alt="Made by timefile.co" />
    <img src="https://raw.githubusercontent.com/Time-File/browser-file-crypto/refs/heads/main/public/timefile-footer-dark.png#gh-dark-mode-only" alt="Made by timefile.co" />
  </a>
</p>
