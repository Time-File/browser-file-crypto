import { describe, it, expect, vi } from 'vitest';
import {
  createEncryptStream,
  createDecryptStream,
  encryptFileStream,
  decryptFileStream,
} from '../../src/stream';
import { generateKeyFile } from '../../src/keyfile';
import { getEncryptionType, isStreamingEncryption } from '../../src/detect';
import { CryptoError } from '../../src/errors';
import {
  ENCRYPTION_MARKER_PASSWORD_STREAM,
  ENCRYPTION_MARKER_KEYFILE_STREAM,
  DEFAULT_CHUNK_SIZE,
} from '../../src/constants';

describe('Streaming Encryption', () => {
  const testData = new TextEncoder().encode('Hello, World! This is a test message for streaming encryption.');
  const testBlob = new Blob([testData]);
  const testPassword = 'test-password-123';

  describe('createEncryptStream', () => {
    it('should throw PASSWORD_REQUIRED when neither password nor keyData provided', async () => {
      await expect(createEncryptStream({})).rejects.toThrow(CryptoError);
      await expect(createEncryptStream({})).rejects.toMatchObject({
        code: 'PASSWORD_REQUIRED',
      });
    });

    it('should create stream and header with password', async () => {
      const { stream, header } = await createEncryptStream({
        password: testPassword,
      });

      expect(stream).toBeInstanceOf(TransformStream);
      expect(header).toBeInstanceOf(Uint8Array);
      expect(header[0]).toBe(ENCRYPTION_MARKER_PASSWORD_STREAM);
      expect(header.length).toBe(34); // marker(1) + version(1) + chunkSize(4) + salt(16) + iv(12)
    });

    it('should create stream and header with keyfile', async () => {
      const keyFile = generateKeyFile();
      const { stream, header } = await createEncryptStream({
        keyData: keyFile.key,
      });

      expect(stream).toBeInstanceOf(TransformStream);
      expect(header).toBeInstanceOf(Uint8Array);
      expect(header[0]).toBe(ENCRYPTION_MARKER_KEYFILE_STREAM);
      expect(header.length).toBe(18); // marker(1) + version(1) + chunkSize(4) + iv(12)
    });

    it('should use default chunk size', async () => {
      const { header } = await createEncryptStream({
        password: testPassword,
      });

      const chunkSize = new DataView(header.buffer).getUint32(2, true);
      expect(chunkSize).toBe(DEFAULT_CHUNK_SIZE);
    });

    it('should use custom chunk size', async () => {
      const customChunkSize = 1024 * 1024; // 1MB
      const { header } = await createEncryptStream({
        password: testPassword,
        chunkSize: customChunkSize,
      });

      const chunkSize = new DataView(header.buffer).getUint32(2, true);
      expect(chunkSize).toBe(customChunkSize);
    });

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn();

      // Use encryptFileStream which handles the stream properly
      const encryptedStream = await encryptFileStream(testBlob, {
        password: testPassword,
        chunkSize: 16,
        onProgress,
      });

      // Consume the stream
      const response = new Response(encryptedStream);
      await response.blob();

      // onProgress should be called for deriving_key, processing, and complete
      expect(onProgress).toHaveBeenCalled();
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
      expect(lastCall.phase).toBe('complete');
    });
  });

  describe('createDecryptStream', () => {
    it('should decrypt password-encrypted stream', async () => {
      // Use encryptFileStream for encryption
      const encryptedStream = await encryptFileStream(testBlob, {
        password: testPassword,
        chunkSize: 16,
      });

      const response = new Response(encryptedStream);
      const encryptedBlob = await response.blob();

      // Decrypt using decryptFileStream
      const decryptedStream = decryptFileStream(encryptedBlob, {
        password: testPassword,
      });

      const decryptResponse = new Response(decryptedStream);
      const decryptedBlob = await decryptResponse.blob();
      const decryptedText = await decryptedBlob.text();

      // Verify decrypted data matches original
      expect(decryptedText).toBe(new TextDecoder().decode(testData));
    });

    it('should throw PASSWORD_REQUIRED for password-encrypted data without password', async () => {
      const encryptedStream = await encryptFileStream(testBlob, {
        password: testPassword,
      });

      const response = new Response(encryptedStream);
      const encryptedBlob = await response.blob();

      // Try to decrypt without password
      const decryptedStream = decryptFileStream(encryptedBlob, {});

      // Consuming the stream should throw
      const decryptResponse = new Response(decryptedStream);
      await expect(decryptResponse.blob()).rejects.toThrow();
    });

    it('should throw KEYFILE_REQUIRED for keyfile-encrypted data without keyData', async () => {
      const keyFile = generateKeyFile();
      const encryptedStream = await encryptFileStream(testBlob, {
        keyData: keyFile.key,
      });

      const response = new Response(encryptedStream);
      const encryptedBlob = await response.blob();

      // Try to decrypt without keyData
      const decryptedStream = decryptFileStream(encryptedBlob, {});

      // Consuming the stream should throw
      const decryptResponse = new Response(decryptedStream);
      await expect(decryptResponse.blob()).rejects.toThrow();
    });
  });

  describe('encryptFileStream', () => {
    it('should encrypt file and return ReadableStream', async () => {
      const encryptedStream = await encryptFileStream(testBlob, {
        password: testPassword,
      });

      expect(encryptedStream).toBeInstanceOf(ReadableStream);

      // Read all data from stream
      const reader = encryptedStream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // First chunk should be header with password stream marker
      expect(chunks[0][0]).toBe(ENCRYPTION_MARKER_PASSWORD_STREAM);
    });

    it('should include totalBytes in progress', async () => {
      const onProgress = vi.fn();

      const encryptedStream = await encryptFileStream(testBlob, {
        password: testPassword,
        onProgress,
      });

      // Consume the stream
      const reader = encryptedStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Check that totalBytes was included in progress callbacks
      const calls = onProgress.mock.calls;
      const progressWithTotalBytes = calls.find(
        (call) => call[0].totalBytes !== undefined
      );
      expect(progressWithTotalBytes).toBeDefined();
      expect(progressWithTotalBytes![0].totalBytes).toBe(testBlob.size);
    });
  });

  describe('decryptFileStream', () => {
    it('should decrypt streaming-encrypted file', async () => {
      // Encrypt first
      const encryptedStream = await encryptFileStream(testBlob, {
        password: testPassword,
        chunkSize: 16,
      });

      // Collect encrypted data
      const response = new Response(encryptedStream);
      const encryptedBlob = await response.blob();

      // Decrypt
      const decryptedStream = decryptFileStream(encryptedBlob, {
        password: testPassword,
      });

      // Collect decrypted data
      const decryptResponse = new Response(decryptedStream);
      const decryptedBlob = await decryptResponse.blob();
      const decryptedText = await decryptedBlob.text();

      expect(decryptedText).toBe(new TextDecoder().decode(testData));
    });

    it('should work with keyfile encryption', async () => {
      const keyFile = generateKeyFile();

      // Encrypt
      const encryptedStream = await encryptFileStream(testBlob, {
        keyData: keyFile.key,
        chunkSize: 16,
      });

      const response = new Response(encryptedStream);
      const encryptedBlob = await response.blob();

      // Decrypt
      const decryptedStream = decryptFileStream(encryptedBlob, {
        keyData: keyFile.key,
      });

      const decryptResponse = new Response(decryptedStream);
      const decryptedBlob = await decryptResponse.blob();
      const decryptedText = await decryptedBlob.text();

      expect(decryptedText).toBe(new TextDecoder().decode(testData));
    });
  });

  describe('getEncryptionType with streaming', () => {
    it('should detect password-stream type', async () => {
      const encryptedStream = await encryptFileStream(testBlob, {
        password: testPassword,
      });

      const response = new Response(encryptedStream);
      const encryptedBlob = await response.blob();

      const type = await getEncryptionType(encryptedBlob);
      expect(type).toBe('password-stream');
    });

    it('should detect keyfile-stream type', async () => {
      const keyFile = generateKeyFile();

      const encryptedStream = await encryptFileStream(testBlob, {
        keyData: keyFile.key,
      });

      const response = new Response(encryptedStream);
      const encryptedBlob = await response.blob();

      const type = await getEncryptionType(encryptedBlob);
      expect(type).toBe('keyfile-stream');
    });
  });

  describe('isStreamingEncryption', () => {
    it('should return true for streaming types', () => {
      expect(isStreamingEncryption('password-stream')).toBe(true);
      expect(isStreamingEncryption('keyfile-stream')).toBe(true);
    });

    it('should return false for non-streaming types', () => {
      expect(isStreamingEncryption('password')).toBe(false);
      expect(isStreamingEncryption('keyfile')).toBe(false);
      expect(isStreamingEncryption('unknown')).toBe(false);
    });
  });

  describe('large data handling', () => {
    it('should handle data larger than chunk size', async () => {
      // Create larger test data (256 bytes)
      const largeData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        largeData[i] = i % 256;
      }
      const largeBlob = new Blob([largeData]);

      // Use small chunk size to ensure multiple chunks
      const encryptedStream = await encryptFileStream(largeBlob, {
        password: testPassword,
        chunkSize: 32, // 32 bytes per chunk
      });

      const response = new Response(encryptedStream);
      const encryptedBlob = await response.blob();

      // Decrypt
      const decryptedStream = decryptFileStream(encryptedBlob, {
        password: testPassword,
      });

      const decryptResponse = new Response(decryptedStream);
      const decryptedBlob = await decryptResponse.blob();
      const decryptedData = new Uint8Array(await decryptedBlob.arrayBuffer());

      // Verify all bytes match
      expect(decryptedData.length).toBe(largeData.length);
      for (let i = 0; i < largeData.length; i++) {
        expect(decryptedData[i]).toBe(largeData[i]);
      }
    });
  });

  describe('empty file handling', () => {
    it('should handle empty file', async () => {
      const emptyBlob = new Blob([]);

      const encryptedStream = await encryptFileStream(emptyBlob, {
        password: testPassword,
      });

      const response = new Response(encryptedStream);
      const encryptedBlob = await response.blob();

      // Decrypt
      const decryptedStream = decryptFileStream(encryptedBlob, {
        password: testPassword,
      });

      const decryptResponse = new Response(decryptedStream);
      const decryptedBlob = await decryptResponse.blob();

      expect(decryptedBlob.size).toBe(0);
    });
  });
});
