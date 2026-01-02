# Encryption & Decryption

Core encryption and decryption functions for file handling.

## `encryptFile(file, options)`

Encrypts a file using AES-256-GCM.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `file` | `File \| Blob \| ArrayBuffer` | The file to encrypt |
| `options` | `EncryptOptions` | Encryption options |

### EncryptOptions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `password` | `string` | One of password/keyData | Password for encryption |
| `keyData` | `string` | One of password/keyData | Base64-encoded keyfile key |
| `onProgress` | `(progress: Progress) => void` | No | Progress callback |

### Returns

`Promise<Blob>` - Encrypted blob with MIME type `application/octet-stream`

### Example

```typescript
import { encryptFile } from '@time-file/browser-file-crypto';

// Password-based encryption
const encrypted = await encryptFile(file, {
  password: 'my-secret-password',
  onProgress: ({ phase, progress }) => {
    console.log(`${phase}: ${progress}%`);
  }
});

// Keyfile-based encryption
const encrypted = await encryptFile(file, {
  keyData: keyFile.key
});
```

### Throws

| Error Code | Description |
|------------|-------------|
| `PASSWORD_REQUIRED` | Neither password nor keyData provided |
| `INVALID_INPUT` | Invalid file input |
| `ENCRYPTION_FAILED` | Encryption operation failed |

---

## `decryptFile(encrypted, options)`

Decrypts a file that was encrypted with `encryptFile`.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `encrypted` | `Blob \| ArrayBuffer` | The encrypted data |
| `options` | `DecryptOptions` | Decryption options |

### DecryptOptions

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `password` | `string` | For password-encrypted files | Password for decryption |
| `keyData` | `string` | For keyfile-encrypted files | Base64-encoded keyfile key |
| `onProgress` | `(progress: Progress) => void` | No | Progress callback |

### Returns

`Promise<Blob>` - Decrypted blob

### Example

```typescript
import { decryptFile } from '@time-file/browser-file-crypto';

try {
  const decrypted = await decryptFile(encryptedBlob, {
    password: 'my-secret-password',
    onProgress: ({ phase, progress }) => {
      console.log(`${phase}: ${progress}%`);
    }
  });
} catch (error) {
  if (error.code === 'INVALID_PASSWORD') {
    console.log('Wrong password');
  }
}
```

### Throws

| Error Code | Description |
|------------|-------------|
| `PASSWORD_REQUIRED` | Password-encrypted file but no password provided |
| `KEYFILE_REQUIRED` | Keyfile-encrypted file but no keyData provided |
| `INVALID_PASSWORD` | Incorrect password |
| `INVALID_KEYFILE` | Incorrect keyfile |
| `INVALID_ENCRYPTED_DATA` | Data is corrupted or not encrypted |
| `UNSUPPORTED_FORMAT` | Unrecognized encryption format |

---

## Progress Object

Both encryption and decryption support progress callbacks.

```typescript
interface Progress {
  phase: 'deriving_key' | 'encrypting' | 'decrypting' | 'downloading' | 'complete';
  progress: number; // 0-100
}
```

### Phases

| Phase | Description |
|-------|-------------|
| `deriving_key` | PBKDF2 key derivation in progress |
| `encrypting` | AES-GCM encryption in progress |
| `decrypting` | AES-GCM decryption in progress |
| `downloading` | File download in progress (for `downloadAndDecrypt`) |
| `complete` | Operation finished |
