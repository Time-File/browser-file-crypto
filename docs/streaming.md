# Streaming Encryption

> Added in v1.1.0

Memory-efficient encryption and decryption for large files using Web Streams API.

## Overview

The streaming API allows you to encrypt/decrypt files that are too large to fit in memory. Instead of loading the entire file at once, data is processed in configurable chunks (default: 64KB).

### Key Features

- **Memory Efficient**: Only loads one chunk at a time (O(chunk size) vs O(file size))
- **Chunk-based Authentication**: Each chunk has its own authentication tag
- **Configurable Chunk Size**: Adjust based on your memory constraints
- **Progress Tracking**: Real-time progress updates with bytes processed

---

## High-Level API

### `encryptFileStream(file, options)`

Encrypts a file and returns a ReadableStream of encrypted data.

```typescript
import { encryptFileStream } from '@time-file/browser-file-crypto';

const encryptedStream = await encryptFileStream(largeFile, {
  password: 'secret',
  chunkSize: 1024 * 1024,  // 1MB chunks
  onProgress: ({ processedBytes, totalBytes, progress }) => {
    console.log(`${progress}% complete`);
  }
});

// Convert to Blob
const response = new Response(encryptedStream);
const encryptedBlob = await response.blob();

// Or pipe to a writable stream
await encryptedStream.pipeTo(writableStream);
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `file` | `File \| Blob` | The file to encrypt |
| `options` | `StreamEncryptOptions` | Streaming encryption options |

#### StreamEncryptOptions

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `password` | `string` | - | Password for encryption |
| `keyData` | `string` | - | Base64-encoded keyfile key |
| `chunkSize` | `number` | `65536` (64KB) | Size of each chunk in bytes |
| `onProgress` | `StreamProgressCallback` | - | Progress callback |

---

### `decryptFileStream(encrypted, options)`

Decrypts a streaming-encrypted file and returns a ReadableStream.

```typescript
import { decryptFileStream } from '@time-file/browser-file-crypto';

const decryptedStream = decryptFileStream(encryptedBlob, {
  password: 'secret',
  onProgress: ({ processedBytes, processedChunks }) => {
    console.log(`Processed ${processedChunks} chunks`);
  }
});

// Convert to Blob
const response = new Response(decryptedStream);
const decryptedBlob = await response.blob();
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `encrypted` | `File \| Blob \| ReadableStream<Uint8Array>` | Encrypted data |
| `options` | `StreamDecryptOptions` | Streaming decryption options |

---

## Low-Level API

For more control, you can use the TransformStream-based API.

### `createEncryptStream(options)`

Creates a TransformStream for encryption along with the header.

```typescript
import { createEncryptStream } from '@time-file/browser-file-crypto';

const { stream, header } = await createEncryptStream({
  password: 'secret',
  chunkSize: 1024 * 1024
});

// The header must be written first, before the encrypted data
const writer = outputStream.getWriter();
await writer.write(header);
writer.releaseLock();

// Then pipe the file through the encryption stream
await fileStream.pipeThrough(stream).pipeTo(outputStream);
```

#### Returns

```typescript
{
  stream: TransformStream<Uint8Array, Uint8Array>;
  header: Uint8Array;  // Must be written before encrypted data
}
```

---

### `createDecryptStream(options)`

Creates a TransformStream for decryption.

```typescript
import { createDecryptStream } from '@time-file/browser-file-crypto';

const decryptStream = createDecryptStream({
  password: 'secret'
});

// The stream automatically parses the header
await encryptedStream.pipeThrough(decryptStream).pipeTo(outputStream);
```

---

## StreamProgress Object

```typescript
interface StreamProgress {
  phase: 'deriving_key' | 'processing' | 'complete';
  processedBytes: number;     // Total bytes processed
  totalBytes?: number;        // Total size (if known)
  processedChunks: number;    // Number of chunks processed
  progress?: number;          // 0-100 percentage (if totalBytes known)
}
```

---

## Streaming File Format

Streaming encrypted files have a different format from regular encrypted files:

```
Password-based Streaming (marker 0x11):
[marker:1][version:1][chunkSize:4][salt:16][baseIV:12][chunks...]

Keyfile-based Streaming (marker 0x12):
[marker:1][version:1][chunkSize:4][baseIV:12][chunks...]

Each Chunk:
[chunkLength:4][ciphertext + authTag:16]
```

### IV Derivation

Each chunk uses a unique IV derived from the base IV:

```
chunk_iv = base_iv XOR chunk_index
```

This ensures no IV reuse while allowing random access to chunks.

---

## Detection

Use `getEncryptionType()` to detect streaming-encrypted files:

```typescript
import { getEncryptionType, isStreamingEncryption } from '@time-file/browser-file-crypto';

const type = await getEncryptionType(blob);
// 'password-stream' | 'keyfile-stream' for streaming files

if (isStreamingEncryption(type)) {
  // Use decryptFileStream
} else {
  // Use decryptFile
}
```

---

## Best Practices

1. **Choose Appropriate Chunk Size**
   - Smaller chunks = less memory, more overhead
   - Larger chunks = more memory, less overhead
   - Default 64KB works well for most cases
   - Use 1MB+ for very large files on devices with sufficient memory

2. **Handle Errors**
   - Each chunk is independently authenticated
   - Corrupted chunks will throw immediately

3. **Progress Updates**
   - Use `processedBytes` and `totalBytes` for accurate progress
   - `progress` percentage is only available when file size is known

---

## Browser Support

Streaming encryption requires:

| Browser | Version |
|---------|---------|
| Chrome | 67+ |
| Firefox | 102+ |
| Safari | 14.1+ |
| Edge | 79+ |

For browsers without TransformStream support, use the regular `encryptFile`/`decryptFile` API.
