# Keyfile Management

Keyfile-based encryption provides an alternative to passwords. A keyfile contains a 256-bit random key that can be used directly for encryption without key derivation.

## `generateKeyFile()`

Generates a new keyfile with a cryptographically secure random key.

### Returns

```typescript
interface KeyFile {
  version: 1;
  algorithm: 'AES-256-GCM';
  key: string;        // Base64-encoded 256-bit key
  createdAt: string;  // ISO 8601 timestamp
}
```

### Example

```typescript
import { generateKeyFile } from '@time-file/browser-file-crypto';

const keyFile = generateKeyFile();
console.log(keyFile);
// {
//   version: 1,
//   algorithm: 'AES-256-GCM',
//   key: 'base64-encoded-32-bytes...',
//   createdAt: '2025-01-01T00:00:00.000Z'
// }
```

---

## `downloadKeyFile(keyData, fileName, extension?)`

Downloads a keyfile to the user's device.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `keyData` | `string` | - | Base64-encoded key (from `keyFile.key`) |
| `fileName` | `string` | - | Base filename (without extension) |
| `extension` | `string` | `'key'` | File extension |

### Example

```typescript
import { generateKeyFile, downloadKeyFile } from '@time-file/browser-file-crypto';

const keyFile = generateKeyFile();

// Download as .key file
downloadKeyFile(keyFile.key, 'my-encryption-key');
// Downloads: my-encryption-key.key

// Download with custom extension
downloadKeyFile(keyFile.key, 'backup-key', 'tfkey');
// Downloads: backup-key.tfkey
```

---

## `parseKeyFile(content)`

Parses a keyfile JSON string and validates its structure.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `content` | `string` | JSON string content of the keyfile |

### Returns

`KeyFile | null` - Parsed keyfile object, or null if invalid

### Example

```typescript
import { parseKeyFile } from '@time-file/browser-file-crypto';

// User uploads a keyfile
const fileInput = document.querySelector('input[type="file"]');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  const content = await file.text();

  const keyFile = parseKeyFile(content);
  if (keyFile) {
    // Valid keyfile, use it for decryption
    const decrypted = await decryptFile(encrypted, { keyData: keyFile.key });
  } else {
    console.error('Invalid keyfile');
  }
});
```

---

## `computeKeyFileHash(keyData)`

Computes a SHA-256 hash of the keyfile for verification purposes.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `keyData` | `string` | Base64-encoded key |

### Returns

`Promise<string>` - Hex-encoded SHA-256 hash

### Example

```typescript
import { generateKeyFile, computeKeyFileHash } from '@time-file/browser-file-crypto';

const keyFile = generateKeyFile();
const hash = await computeKeyFileHash(keyFile.key);

// Store hash on server for verification
await api.storeKeyHash(userId, hash);

// Later, verify the keyfile
const uploadedHash = await computeKeyFileHash(uploadedKeyFile.key);
if (uploadedHash === storedHash) {
  console.log('Keyfile verified');
}
```

---

## Keyfile vs Password

| Aspect | Password | Keyfile |
|--------|----------|---------|
| Key Derivation | PBKDF2 (100k iterations) | None (direct use) |
| Security | Depends on password strength | Always 256-bit entropy |
| Speed | Slower (key derivation) | Faster |
| Storage | Human memory | File storage |
| Sharing | Easy to communicate | Need secure transfer |

### When to Use Keyfiles

- Automated systems (no human input)
- Maximum security (256-bit entropy)
- Performance-critical applications
- When password memorization isn't practical

### When to Use Passwords

- User-facing applications
- When users need to access from multiple devices
- When file storage is inconvenient

---

## Security Considerations

1. **Keyfile Storage**: Store keyfiles securely, separate from encrypted data
2. **Backup**: Keep backup copies of keyfiles - losing the keyfile means losing the data
3. **Sharing**: Use secure channels (encrypted messaging, in-person) to share keyfiles
4. **Hash Verification**: Use `computeKeyFileHash` to verify keyfiles without exposing the key
