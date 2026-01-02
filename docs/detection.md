# Type Detection

Utilities for detecting encryption types and checking if files are encrypted.

## `getEncryptionType(data)`

Detects the encryption type of encrypted data by reading the marker byte.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Blob \| ArrayBuffer` | The encrypted data to check |

### Returns

`Promise<EncryptionType>`

```typescript
type EncryptionType =
  | 'password'         // Marker 0x01 - Password-based
  | 'keyfile'          // Marker 0x02 - Keyfile-based
  | 'password-stream'  // Marker 0x11 - Streaming password-based (v1.1.0+)
  | 'keyfile-stream'   // Marker 0x12 - Streaming keyfile-based (v1.1.0+)
  | 'unknown';         // Not encrypted with this library
```

### Example

```typescript
import { getEncryptionType, decryptFile, decryptFileStream, isStreamingEncryption } from '@time-file/browser-file-crypto';

const type = await getEncryptionType(encryptedBlob);

switch (type) {
  case 'password':
    const decrypted = await decryptFile(encryptedBlob, { password });
    break;
  case 'keyfile':
    const decrypted = await decryptFile(encryptedBlob, { keyData });
    break;
  case 'password-stream':
    const stream = decryptFileStream(encryptedBlob, { password });
    break;
  case 'keyfile-stream':
    const stream = decryptFileStream(encryptedBlob, { keyData });
    break;
  case 'unknown':
    throw new Error('File not encrypted with this library');
}
```

---

## `isEncryptedFile(data)`

Quick check to determine if data was encrypted with this library.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `Blob \| ArrayBuffer` | The data to check |

### Returns

`Promise<boolean>` - `true` if the file appears to be encrypted

### Example

```typescript
import { isEncryptedFile } from '@time-file/browser-file-crypto';

const file = event.target.files[0];
const isEncrypted = await isEncryptedFile(file);

if (isEncrypted) {
  showDecryptionUI();
} else {
  showEncryptionUI();
}
```

### Note

This is a format check, not a cryptographic verification. It checks:
1. Valid marker byte (0x01, 0x02, 0x11, or 0x12)
2. Minimum file size for the format

---

## `isStreamingEncryption(type)`

> Added in v1.1.0

Helper function to check if an encryption type is a streaming format.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `EncryptionType` | The encryption type to check |

### Returns

`boolean` - `true` if the type is `'password-stream'` or `'keyfile-stream'`

### Example

```typescript
import { getEncryptionType, isStreamingEncryption, decryptFile, decryptFileStream } from '@time-file/browser-file-crypto';

const type = await getEncryptionType(blob);

if (isStreamingEncryption(type)) {
  // Use streaming decryption
  const stream = decryptFileStream(blob, options);
} else if (type !== 'unknown') {
  // Use regular decryption
  const decrypted = await decryptFile(blob, options);
}
```

---

## Marker Bytes

| Marker | Hex | Type |
|--------|-----|------|
| Password | `0x01` | Standard password-based encryption |
| Keyfile | `0x02` | Standard keyfile-based encryption |
| Password Stream | `0x11` | Streaming password-based encryption |
| Keyfile Stream | `0x12` | Streaming keyfile-based encryption |
