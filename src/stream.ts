/**
 * Streaming encryption/decryption functions for browser-file-crypto.
 *
 * @description
 * Provides chunk-based encryption/decryption for large files using
 * TransformStream API. Each chunk is independently encrypted with
 * AES-256-GCM, allowing memory-efficient processing of files larger
 * than available RAM.
 *
 * @module stream
 * @since 1.1.0
 */

import {
  ENCRYPTION_MARKER_PASSWORD_STREAM,
  ENCRYPTION_MARKER_KEYFILE_STREAM,
  STREAM_FORMAT_VERSION,
  DEFAULT_CHUNK_SIZE,
  ALGORITHM,
} from './constants';
import { CryptoError } from './errors';
import type {
  StreamEncryptOptions,
  StreamDecryptOptions,
  StreamProgress,
} from './types';
import {
  sliceBuffer,
  deriveKeyFromPassword,
  importKeyFromKeyfile,
  generateSalt,
  generateIV,
} from './utils';

// =============================================================================
// Internal Helper Functions
// =============================================================================

/**
 * Derives a chunk-specific IV from the base IV and chunk index.
 * Uses XOR to combine base IV with chunk index to ensure uniqueness.
 *
 * @param baseIV - The base 12-byte IV
 * @param chunkIndex - The 0-based chunk index
 * @returns A unique 12-byte IV for this chunk
 *
 * @internal
 */
function deriveChunkIV(baseIV: Uint8Array, chunkIndex: number): Uint8Array {
  const iv = new Uint8Array(12);
  iv.set(baseIV);

  // XOR the last 4 bytes with chunk index (little-endian)
  const view = new DataView(iv.buffer);
  const currentValue = view.getUint32(8, true);
  view.setUint32(8, currentValue ^ chunkIndex, true);

  return iv;
}

/**
 * Concatenates two Uint8Arrays.
 *
 * @internal
 */
function concatArrays(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

/**
 * Encrypts a single chunk with AES-GCM.
 *
 * @internal
 */
async function encryptChunk(
  chunk: Uint8Array,
  key: CryptoKey,
  baseIV: Uint8Array,
  chunkIndex: number
): Promise<Uint8Array> {
  const iv = deriveChunkIV(baseIV, chunkIndex);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: sliceBuffer(iv) },
    key,
    sliceBuffer(chunk)
  );

  // Format: [4 bytes chunk length (LE)] + [ciphertext + auth tag]
  const result = new Uint8Array(4 + ciphertext.byteLength);
  new DataView(result.buffer as ArrayBuffer).setUint32(0, ciphertext.byteLength, true);
  result.set(new Uint8Array(ciphertext), 4);

  return result;
}

/**
 * Decrypts a single chunk with AES-GCM.
 *
 * @internal
 */
async function decryptChunk(
  encryptedChunk: Uint8Array,
  key: CryptoKey,
  baseIV: Uint8Array,
  chunkIndex: number
): Promise<Uint8Array> {
  const iv = deriveChunkIV(baseIV, chunkIndex);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: sliceBuffer(iv) },
      key,
      sliceBuffer(encryptedChunk)
    );

    return new Uint8Array(plaintext);
  } catch {
    throw new CryptoError('DECRYPTION_FAILED');
  }
}

/**
 * Creates the streaming encryption header.
 *
 * @internal
 */
function createStreamHeader(
  isPassword: boolean,
  chunkSize: number,
  salt: Uint8Array | null,
  baseIV: Uint8Array
): Uint8Array {
  if (isPassword && salt) {
    // Password-based: marker(1) + version(1) + chunkSize(4) + salt(16) + baseIV(12) = 34 bytes
    const header = new Uint8Array(34);
    header[0] = ENCRYPTION_MARKER_PASSWORD_STREAM;
    header[1] = STREAM_FORMAT_VERSION;
    new DataView(header.buffer).setUint32(2, chunkSize, true);
    header.set(salt, 6);
    header.set(baseIV, 22);
    return header;
  } else {
    // Keyfile-based: marker(1) + version(1) + chunkSize(4) + baseIV(12) = 18 bytes
    const header = new Uint8Array(18);
    header[0] = ENCRYPTION_MARKER_KEYFILE_STREAM;
    header[1] = STREAM_FORMAT_VERSION;
    new DataView(header.buffer).setUint32(2, chunkSize, true);
    header.set(baseIV, 6);
    return header;
  }
}

/**
 * Parses the streaming encryption header.
 *
 * @internal
 */
function parseStreamHeader(header: Uint8Array): {
  isPassword: boolean;
  version: number;
  chunkSize: number;
  salt: Uint8Array | null;
  baseIV: Uint8Array;
  headerSize: number;
} {
  const marker = header[0];
  const isPassword = marker === ENCRYPTION_MARKER_PASSWORD_STREAM;

  if (
    marker !== ENCRYPTION_MARKER_PASSWORD_STREAM &&
    marker !== ENCRYPTION_MARKER_KEYFILE_STREAM
  ) {
    throw new CryptoError('UNSUPPORTED_FORMAT');
  }

  const version = header[1];
  if (version !== STREAM_FORMAT_VERSION) {
    throw new CryptoError('UNSUPPORTED_FORMAT');
  }

  const chunkSize = new DataView(header.buffer as ArrayBuffer, header.byteOffset).getUint32(
    2,
    true
  );

  if (isPassword) {
    const salt = header.slice(6, 22);
    const baseIV = header.slice(22, 34);
    return { isPassword, version, chunkSize, salt, baseIV, headerSize: 34 };
  } else {
    const baseIV = header.slice(6, 18);
    return { isPassword, version, chunkSize, salt: null, baseIV, headerSize: 18 };
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Creates a streaming encryption TransformStream.
 *
 * @description
 * Creates a TransformStream that encrypts data in chunks using AES-256-GCM.
 * Each chunk is independently encrypted with a unique IV derived from the
 * base IV and chunk index. This allows memory-efficient encryption of
 * arbitrarily large files.
 *
 * @param options - Streaming encryption options
 * @returns Promise resolving to an object containing the TransformStream and header
 *
 * @throws {CryptoError} When neither password nor keyData is provided (PASSWORD_REQUIRED)
 * @throws {CryptoError} When encryption fails (ENCRYPTION_FAILED)
 *
 * @example
 * ```typescript
 * const { stream, header } = await createEncryptStream({
 *   password: 'my-secret',
 *   chunkSize: 1024 * 1024, // 1MB chunks
 *   onProgress: ({ processedBytes }) => console.log(`${processedBytes} bytes processed`)
 * });
 *
 * // Write header first, then pipe data through the stream
 * const writer = writableStream.getWriter();
 * await writer.write(header);
 * writer.releaseLock();
 * await readableStream.pipeThrough(stream).pipeTo(writableStream);
 * ```
 *
 * @since 1.1.0
 */
export async function createEncryptStream(options: StreamEncryptOptions): Promise<{
  stream: TransformStream<Uint8Array, Uint8Array>;
  header: Uint8Array;
}> {
  const { password, keyData, chunkSize = DEFAULT_CHUNK_SIZE, onProgress } = options;

  if (!password && !keyData) {
    throw new CryptoError('PASSWORD_REQUIRED');
  }

  const isPassword = !!password;
  const salt = isPassword ? generateSalt() : null;
  const baseIV = generateIV();

  // Derive or import key
  onProgress?.({
    phase: 'deriving_key',
    processedBytes: 0,
    processedChunks: 0,
  });

  const key = isPassword
    ? await deriveKeyFromPassword(password!, salt!)
    : await importKeyFromKeyfile(keyData!);

  // Create header
  const header = createStreamHeader(isPassword, chunkSize, salt, baseIV);

  // Create transform stream
  let buffer: Uint8Array = new Uint8Array(0);
  let chunkIndex = 0;
  let processedBytes = 0;

  const stream = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      buffer = concatArrays(buffer, chunk) as Uint8Array;

      while (buffer.length >= chunkSize) {
        const toProcess = buffer.slice(0, chunkSize);
        buffer = buffer.slice(chunkSize);

        const encrypted = await encryptChunk(toProcess, key, baseIV, chunkIndex);
        controller.enqueue(encrypted);

        chunkIndex++;
        processedBytes += toProcess.length;

        onProgress?.({
          phase: 'processing',
          processedBytes,
          processedChunks: chunkIndex,
        });
      }
    },

    async flush(controller) {
      // Process remaining buffer (last chunk)
      if (buffer.length > 0) {
        const encrypted = await encryptChunk(buffer, key, baseIV, chunkIndex);
        controller.enqueue(encrypted);
        processedBytes += buffer.length;
        chunkIndex++;
      }

      onProgress?.({
        phase: 'complete',
        processedBytes,
        processedChunks: chunkIndex,
        progress: 100,
      });
    },
  });

  return { stream, header };
}

/**
 * Creates a streaming decryption TransformStream.
 *
 * @description
 * Creates a TransformStream that decrypts streaming-encrypted data.
 * The stream automatically parses the header and decrypts each chunk
 * using the appropriate key derivation method.
 *
 * @param options - Streaming decryption options
 * @returns A TransformStream that decrypts data
 *
 * @throws {CryptoError} When password is required but not provided (PASSWORD_REQUIRED)
 * @throws {CryptoError} When keyfile is required but not provided (KEYFILE_REQUIRED)
 * @throws {CryptoError} When decryption fails (DECRYPTION_FAILED)
 * @throws {CryptoError} When format is unsupported (UNSUPPORTED_FORMAT)
 *
 * @example
 * ```typescript
 * const stream = createDecryptStream({
 *   password: 'my-secret',
 *   onProgress: ({ processedBytes }) => console.log(`${processedBytes} bytes processed`)
 * });
 *
 * await encryptedStream.pipeThrough(stream).pipeTo(outputStream);
 * ```
 *
 * @since 1.1.0
 */
export function createDecryptStream(
  options: StreamDecryptOptions
): TransformStream<Uint8Array, Uint8Array> {
  const { password, keyData, onProgress } = options;

  let buffer: Uint8Array = new Uint8Array(0);
  let headerParsed = false;
  let key: CryptoKey | null = null;
  let baseIV: Uint8Array | null = null;
  let chunkIndex = 0;
  let processedBytes = 0;
  let isPasswordMode = false;
  let headerSize = 0;

  return new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      buffer = concatArrays(buffer, chunk) as Uint8Array;

      // Parse header if not yet done
      if (!headerParsed) {
        // Need at least the marker to determine header size
        if (buffer.length < 2) return;

        const marker = buffer[0];
        const minHeaderSize =
          marker === ENCRYPTION_MARKER_PASSWORD_STREAM ? 34 : 18;

        if (buffer.length < minHeaderSize) return;

        const headerData = buffer.slice(0, minHeaderSize);
        const parsed = parseStreamHeader(headerData);

        isPasswordMode = parsed.isPassword;
        // Note: parsed.chunkSize is available but not needed for decryption
        // since each chunk includes its own length prefix
        baseIV = parsed.baseIV;
        headerSize = parsed.headerSize;

        // Validate credentials
        if (isPasswordMode && !password) {
          throw new CryptoError('PASSWORD_REQUIRED');
        }
        if (!isPasswordMode && !keyData) {
          throw new CryptoError('KEYFILE_REQUIRED');
        }

        // Derive or import key
        onProgress?.({
          phase: 'deriving_key',
          processedBytes: 0,
          processedChunks: 0,
        });

        key = isPasswordMode
          ? await deriveKeyFromPassword(password!, parsed.salt!)
          : await importKeyFromKeyfile(keyData!);

        // Remove header from buffer
        buffer = buffer.slice(headerSize);
        headerParsed = true;
      }

      // Process complete chunks
      // Each encrypted chunk: 4 bytes length + ciphertext + 16 bytes auth tag
      while (buffer.length >= 4) {
        const encryptedChunkSize = new DataView(
          buffer.buffer as ArrayBuffer,
          buffer.byteOffset
        ).getUint32(0, true);
        const totalChunkSize = 4 + encryptedChunkSize;

        if (buffer.length < totalChunkSize) break;

        const encryptedData = buffer.slice(4, totalChunkSize);
        buffer = buffer.slice(totalChunkSize);

        const decrypted = await decryptChunk(encryptedData, key!, baseIV!, chunkIndex);
        controller.enqueue(decrypted);

        processedBytes += decrypted.length;
        chunkIndex++;

        onProgress?.({
          phase: 'processing',
          processedBytes,
          processedChunks: chunkIndex,
        });
      }
    },

    async flush() {
      // Any remaining data should have been processed
      if (buffer.length > 0) {
        throw new CryptoError('INVALID_ENCRYPTED_DATA');
      }

      onProgress?.({
        phase: 'complete',
        processedBytes,
        processedChunks: chunkIndex,
        progress: 100,
      });
    },
  });
}

/**
 * Encrypts a file using streaming encryption.
 *
 * @description
 * Convenience function that encrypts a File or Blob using streaming
 * encryption and returns a ReadableStream of the encrypted data.
 * The stream includes the encryption header followed by encrypted chunks.
 *
 * @param file - The file to encrypt
 * @param options - Streaming encryption options
 * @returns Promise resolving to a ReadableStream of encrypted data
 *
 * @throws {CryptoError} When neither password nor keyData is provided (PASSWORD_REQUIRED)
 * @throws {CryptoError} When encryption fails (ENCRYPTION_FAILED)
 *
 * @example
 * ```typescript
 * const encryptedStream = await encryptFileStream(largeFile, {
 *   password: 'my-secret',
 *   chunkSize: 1024 * 1024,  // 1MB chunks
 *   onProgress: ({ processedBytes, totalBytes }) => {
 *     const percent = Math.round((processedBytes / totalBytes!) * 100);
 *     console.log(`${percent}%`);
 *   }
 * });
 *
 * // Convert to Blob
 * const response = new Response(encryptedStream);
 * const encryptedBlob = await response.blob();
 * ```
 *
 * @since 1.1.0
 */
export async function encryptFileStream(
  file: File | Blob,
  options: StreamEncryptOptions
): Promise<ReadableStream<Uint8Array>> {
  const totalBytes = file.size;

  // Wrap onProgress to include totalBytes
  const wrappedOnProgress = options.onProgress
    ? (progress: StreamProgress) => {
        options.onProgress!({
          ...progress,
          totalBytes,
          progress:
            progress.phase === 'complete'
              ? 100
              : Math.round((progress.processedBytes / totalBytes) * 100),
        });
      }
    : undefined;

  const { stream, header } = await createEncryptStream({
    ...options,
    onProgress: wrappedOnProgress,
  });

  // Create a stream that first emits the header, then the encrypted data
  const fileStream = file.stream() as ReadableStream<Uint8Array>;
  const encryptedDataStream = fileStream.pipeThrough(stream);

  // Create a combined stream: header + encrypted data
  let headerSent = false;
  const reader = encryptedDataStream.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // Send header first
      if (!headerSent) {
        controller.enqueue(header);
        headerSent = true;
        return;
      }

      // Then send encrypted data
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      }
    },

    cancel() {
      reader.releaseLock();
    },
  });
}

/**
 * Decrypts a streaming-encrypted file.
 *
 * @description
 * Convenience function that decrypts a streaming-encrypted File, Blob,
 * or ReadableStream and returns a ReadableStream of the decrypted data.
 *
 * @param encrypted - The encrypted data (File, Blob, or ReadableStream)
 * @param options - Streaming decryption options
 * @returns A ReadableStream of decrypted data
 *
 * @throws {CryptoError} When password is required but not provided (PASSWORD_REQUIRED)
 * @throws {CryptoError} When keyfile is required but not provided (KEYFILE_REQUIRED)
 * @throws {CryptoError} When decryption fails (DECRYPTION_FAILED)
 *
 * @example
 * ```typescript
 * const decryptedStream = decryptFileStream(encryptedBlob, {
 *   password: 'my-secret',
 *   onProgress: ({ processedBytes }) => console.log(`${processedBytes} bytes decrypted`)
 * });
 *
 * // Convert to Blob
 * const response = new Response(decryptedStream);
 * const decryptedBlob = await response.blob();
 * ```
 *
 * @since 1.1.0
 */
export function decryptFileStream(
  encrypted: File | Blob | ReadableStream<Uint8Array>,
  options: StreamDecryptOptions
): ReadableStream<Uint8Array> {
  const stream = createDecryptStream(options);

  if (encrypted instanceof ReadableStream) {
    return encrypted.pipeThrough(stream);
  }

  return (encrypted.stream() as ReadableStream<Uint8Array>).pipeThrough(stream);
}
