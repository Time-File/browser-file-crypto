# Error Handling

Structured error handling with typed error codes for programmatic handling.

## CryptoError Class

All errors thrown by this library are instances of `CryptoError`, which extends the standard `Error` class.

```typescript
class CryptoError extends Error {
  readonly code: CryptoErrorCode;
  readonly message: string;
  readonly name: 'CryptoError';
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVALID_INPUT` | Input is not a valid File, Blob, or ArrayBuffer |
| `PASSWORD_REQUIRED` | Password is required but not provided |
| `KEYFILE_REQUIRED` | Keyfile is required but not provided |
| `INVALID_PASSWORD` | Decryption failed due to incorrect password |
| `INVALID_KEYFILE` | Decryption failed due to incorrect keyfile |
| `INVALID_ENCRYPTED_DATA` | Data is corrupted or not encrypted with this library |
| `ENCRYPTION_FAILED` | Encryption operation failed |
| `DECRYPTION_FAILED` | Decryption operation failed |
| `DOWNLOAD_FAILED` | File download failed |
| `UNSUPPORTED_FORMAT` | Encrypted file format is not supported |

---

## Error Messages

Each error code has a default message:

```typescript
const ERROR_MESSAGES = {
  INVALID_INPUT: 'Input must be a File, Blob, or ArrayBuffer.',
  PASSWORD_REQUIRED: 'Password or keyfile is required for encryption.',
  KEYFILE_REQUIRED: 'Keyfile is required to decrypt this file.',
  INVALID_PASSWORD: 'Decryption failed: incorrect password.',
  INVALID_KEYFILE: 'Decryption failed: incorrect keyfile.',
  INVALID_ENCRYPTED_DATA: 'Invalid encrypted data: file may be corrupted.',
  ENCRYPTION_FAILED: 'Encryption failed.',
  DECRYPTION_FAILED: 'Decryption failed.',
  DOWNLOAD_FAILED: 'File download failed.',
  UNSUPPORTED_FORMAT: 'Unsupported encryption format.',
};
```

---

## Usage Examples

### Basic Error Handling

```typescript
import { decryptFile, CryptoError } from '@time-file/browser-file-crypto';

try {
  const decrypted = await decryptFile(encryptedBlob, { password: 'wrong-password' });
} catch (error) {
  if (error instanceof CryptoError) {
    console.log(error.code);    // 'INVALID_PASSWORD'
    console.log(error.message); // 'Decryption failed: incorrect password.'
  }
}
```

### Type Guard

```typescript
import { decryptFile, isCryptoError } from '@time-file/browser-file-crypto';

try {
  const decrypted = await decryptFile(encryptedBlob, options);
} catch (error) {
  if (isCryptoError(error)) {
    // TypeScript knows error is CryptoError
    console.log(error.code);
  }
}
```

### Switch Statement Handling

```typescript
import { decryptFile, CryptoError } from '@time-file/browser-file-crypto';

try {
  const decrypted = await decryptFile(encryptedBlob, options);
} catch (error) {
  if (error instanceof CryptoError) {
    switch (error.code) {
      case 'INVALID_PASSWORD':
        showNotification('Incorrect password. Please try again.');
        break;
      case 'INVALID_KEYFILE':
        showNotification('Invalid keyfile. Please select the correct file.');
        break;
      case 'INVALID_ENCRYPTED_DATA':
        showNotification('File is corrupted or not encrypted.');
        break;
      case 'KEYFILE_REQUIRED':
        showKeyfileInput();
        break;
      case 'PASSWORD_REQUIRED':
        showPasswordInput();
        break;
      default:
        showNotification('An error occurred: ' + error.message);
    }
  }
}
```

### i18n (Internationalization)

```typescript
import { CryptoError, CryptoErrorCode } from '@time-file/browser-file-crypto';

const errorMessages: Record<CryptoErrorCode, string> = {
  INVALID_INPUT: '잘못된 입력입니다.',
  PASSWORD_REQUIRED: '비밀번호가 필요합니다.',
  KEYFILE_REQUIRED: '키 파일이 필요합니다.',
  INVALID_PASSWORD: '비밀번호가 올바르지 않습니다.',
  INVALID_KEYFILE: '키 파일이 올바르지 않습니다.',
  INVALID_ENCRYPTED_DATA: '손상된 파일입니다.',
  ENCRYPTION_FAILED: '암호화에 실패했습니다.',
  DECRYPTION_FAILED: '복호화에 실패했습니다.',
  DOWNLOAD_FAILED: '다운로드에 실패했습니다.',
  UNSUPPORTED_FORMAT: '지원하지 않는 형식입니다.',
};

try {
  await decryptFile(blob, options);
} catch (error) {
  if (error instanceof CryptoError) {
    const localizedMessage = errorMessages[error.code];
    showNotification(localizedMessage);
  }
}
```

---

## `isCryptoError(error)`

Type guard function to check if an error is a `CryptoError`.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `error` | `unknown` | The error to check |

### Returns

`boolean` - `true` if the error is a `CryptoError`

### Example

```typescript
import { isCryptoError } from '@time-file/browser-file-crypto';

function handleError(error: unknown) {
  if (isCryptoError(error)) {
    // TypeScript narrowing: error is CryptoError
    switch (error.code) {
      case 'INVALID_PASSWORD':
        return 'Wrong password';
      default:
        return error.message;
    }
  }
  return 'Unknown error';
}
```

---

## Common Error Scenarios

### Password vs Keyfile Mismatch

```typescript
// File encrypted with keyfile, but password provided
try {
  await decryptFile(keyfileEncryptedBlob, { password: 'test' });
} catch (error) {
  // error.code === 'KEYFILE_REQUIRED'
}

// File encrypted with password, but keyfile provided
try {
  await decryptFile(passwordEncryptedBlob, { keyData: 'base64key' });
} catch (error) {
  // error.code === 'PASSWORD_REQUIRED'
}
```

### Corrupted File

```typescript
try {
  await decryptFile(corruptedBlob, { password: 'test' });
} catch (error) {
  // error.code === 'INVALID_ENCRYPTED_DATA' or 'INVALID_PASSWORD'
}
```

### Streaming Decryption Errors (v1.1.1+)

Streaming decryption distinguishes between wrong password/keyfile and data corruption:

```typescript
import { decryptFileStream } from '@time-file/browser-file-crypto';

try {
  const stream = decryptFileStream(encryptedBlob, { password: 'wrong' });
  const response = new Response(stream);
  await response.blob();
} catch (error) {
  if (error.code === 'INVALID_PASSWORD') {
    // Wrong password (first chunk failed)
  } else if (error.code === 'INVALID_KEYFILE') {
    // Wrong keyfile (first chunk failed)
  } else if (error.code === 'DECRYPTION_FAILED') {
    // Data corruption (later chunk failed)
  }
}
```

| Error Code | Cause |
|------------|-------|
| `INVALID_PASSWORD` | First chunk decryption failed (wrong password) |
| `INVALID_KEYFILE` | First chunk decryption failed (wrong keyfile) |
| `DECRYPTION_FAILED` | Later chunk decryption failed (data corruption) |
