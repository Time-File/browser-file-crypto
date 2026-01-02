import { describe, it, expect } from 'vitest';
import { encryptFile, encryptFileAuto } from '../../src/encrypt';
import { decryptFile } from '../../src/decrypt';
import { encryptFileStream } from '../../src/stream';
import { generateKeyFile } from '../../src/keyfile';
import { getEncryptionType } from '../../src/detect';
import { CryptoError } from '../../src/errors';
import {
  ENCRYPTION_MARKER_PASSWORD,
  ENCRYPTION_MARKER_KEYFILE,
  ENCRYPTION_MARKER_PASSWORD_STREAM,
  ENCRYPTION_MARKER_KEYFILE_STREAM,
} from '../../src/constants';

describe('encryptFileAuto', () => {
  const testText = 'Hello, World! 안녕하세요! 🔐';
  const testData = new TextEncoder().encode(testText);
  const testBlob = new Blob([testData]);
  const testPassword = 'test-password-123';

  describe('input validation', () => {
    it('should throw PASSWORD_REQUIRED when neither password nor keyData provided', async () => {
      await expect(
        encryptFileAuto(testBlob, { autoStreaming: true })
      ).rejects.toMatchObject({
        code: 'PASSWORD_REQUIRED',
      });
    });
  });

  describe('auto streaming disabled', () => {
    it('should use standard encryption when autoStreaming is false', async () => {
      const encrypted = await encryptFileAuto(testBlob, {
        password: testPassword,
        autoStreaming: false,
      });

      const bytes = new Uint8Array(await encrypted.arrayBuffer());
      expect(bytes[0]).toBe(ENCRYPTION_MARKER_PASSWORD);
    });

    it('should use standard encryption when autoStreaming is undefined', async () => {
      const encrypted = await encryptFileAuto(testBlob, {
        password: testPassword,
      });

      const bytes = new Uint8Array(await encrypted.arrayBuffer());
      expect(bytes[0]).toBe(ENCRYPTION_MARKER_PASSWORD);
    });
  });

  describe('auto streaming enabled', () => {
    it('should use standard encryption for small files below threshold', async () => {
      const encrypted = await encryptFileAuto(testBlob, {
        password: testPassword,
        autoStreaming: true,
        streamingThreshold: 1024 * 1024, // 1MB threshold
      });

      const bytes = new Uint8Array(await encrypted.arrayBuffer());
      expect(bytes[0]).toBe(ENCRYPTION_MARKER_PASSWORD);
    });

    it('should use streaming encryption for files above threshold', async () => {
      // Create a file larger than threshold
      const largeData = new Uint8Array(100);
      const largeBlob = new Blob([largeData]);

      const encrypted = await encryptFileAuto(largeBlob, {
        password: testPassword,
        autoStreaming: true,
        streamingThreshold: 50, // Very low threshold for testing
      });

      const bytes = new Uint8Array(await encrypted.arrayBuffer());
      expect(bytes[0]).toBe(ENCRYPTION_MARKER_PASSWORD_STREAM);
    });

    it('should use keyfile streaming encryption when keyData provided and above threshold', async () => {
      const keyFile = generateKeyFile();
      const largeData = new Uint8Array(100);
      const largeBlob = new Blob([largeData]);

      const encrypted = await encryptFileAuto(largeBlob, {
        keyData: keyFile.key,
        autoStreaming: true,
        streamingThreshold: 50,
      });

      const bytes = new Uint8Array(await encrypted.arrayBuffer());
      expect(bytes[0]).toBe(ENCRYPTION_MARKER_KEYFILE_STREAM);
    });
  });

  describe('progress callback', () => {
    it('should call onProgress with correct phases for standard encryption', async () => {
      const progressCalls: Array<{ phase: string; progress: number }> = [];

      await encryptFileAuto(testBlob, {
        password: testPassword,
        autoStreaming: false,
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      const phases = progressCalls.map((p) => p.phase);
      expect(phases).toContain('deriving_key');
      expect(phases).toContain('encrypting');
      expect(phases).toContain('complete');
    });

    it('should call onProgress with correct phases for streaming encryption', async () => {
      // Use larger data (200KB) to ensure 'encrypting' phase is reported
      const largeData = new Uint8Array(200 * 1024);
      const largeBlob = new Blob([largeData]);
      const progressCalls: Array<{ phase: string; progress: number }> = [];

      await encryptFileAuto(largeBlob, {
        password: testPassword,
        autoStreaming: true,
        streamingThreshold: 50,
        chunkSize: 16 * 1024, // 16KB chunks to ensure multiple chunks
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      const phases = progressCalls.map((p) => p.phase);
      expect(phases).toContain('deriving_key');
      expect(phases).toContain('encrypting');
      expect(phases).toContain('complete');
    });
  });

  describe('roundtrip', () => {
    it('should decrypt standard encryption with decryptFile', async () => {
      const encrypted = await encryptFileAuto(testBlob, {
        password: testPassword,
        autoStreaming: false,
      });

      const decrypted = await decryptFile(encrypted, { password: testPassword });
      const text = await decrypted.text();
      expect(text).toBe(testText);
    });

    it('should decrypt streaming encryption with decryptFile (auto-detection)', async () => {
      const largeData = new Uint8Array(100);
      for (let i = 0; i < 100; i++) largeData[i] = i;
      const largeBlob = new Blob([largeData]);

      const encrypted = await encryptFileAuto(largeBlob, {
        password: testPassword,
        autoStreaming: true,
        streamingThreshold: 50,
      });

      // decryptFile should auto-detect streaming format
      const decrypted = await decryptFile(encrypted, { password: testPassword });
      const decryptedData = new Uint8Array(await decrypted.arrayBuffer());

      expect(decryptedData.length).toBe(100);
      for (let i = 0; i < 100; i++) {
        expect(decryptedData[i]).toBe(i);
      }
    });
  });
});

describe('decryptFile streaming auto-detection', () => {
  const testText = 'Hello, Streaming World!';
  const testData = new TextEncoder().encode(testText);
  const testBlob = new Blob([testData]);
  const testPassword = 'test-password-123';

  it('should auto-detect and decrypt password-stream encrypted file', async () => {
    // Encrypt with streaming
    const encryptedStream = await encryptFileStream(testBlob, {
      password: testPassword,
    });
    const response = new Response(encryptedStream);
    const encrypted = await response.blob();

    // Verify it's streaming format
    const type = await getEncryptionType(encrypted);
    expect(type).toBe('password-stream');

    // decryptFile should handle it automatically
    const decrypted = await decryptFile(encrypted, { password: testPassword });
    const text = await decrypted.text();
    expect(text).toBe(testText);
  });

  it('should auto-detect and decrypt keyfile-stream encrypted file', async () => {
    const keyFile = generateKeyFile();

    // Encrypt with streaming
    const encryptedStream = await encryptFileStream(testBlob, {
      keyData: keyFile.key,
    });
    const response = new Response(encryptedStream);
    const encrypted = await response.blob();

    // Verify it's streaming format
    const type = await getEncryptionType(encrypted);
    expect(type).toBe('keyfile-stream');

    // decryptFile should handle it automatically
    const decrypted = await decryptFile(encrypted, { keyData: keyFile.key });
    const text = await decrypted.text();
    expect(text).toBe(testText);
  });

  it('should throw PASSWORD_REQUIRED for password-stream without password', async () => {
    const encryptedStream = await encryptFileStream(testBlob, {
      password: testPassword,
    });
    const response = new Response(encryptedStream);
    const encrypted = await response.blob();

    await expect(decryptFile(encrypted, {})).rejects.toMatchObject({
      code: 'PASSWORD_REQUIRED',
    });
  });

  it('should throw KEYFILE_REQUIRED for keyfile-stream without keyData', async () => {
    const keyFile = generateKeyFile();
    const encryptedStream = await encryptFileStream(testBlob, {
      keyData: keyFile.key,
    });
    const response = new Response(encryptedStream);
    const encrypted = await response.blob();

    await expect(decryptFile(encrypted, {})).rejects.toMatchObject({
      code: 'KEYFILE_REQUIRED',
    });
  });

  it('should throw INVALID_PASSWORD for wrong password on streaming file', async () => {
    const encryptedStream = await encryptFileStream(testBlob, {
      password: testPassword,
    });
    const response = new Response(encryptedStream);
    const encrypted = await response.blob();

    await expect(
      decryptFile(encrypted, { password: 'wrong-password' })
    ).rejects.toMatchObject({
      code: 'INVALID_PASSWORD',
    });
  });

  it('should work with ArrayBuffer input', async () => {
    const encryptedStream = await encryptFileStream(testBlob, {
      password: testPassword,
    });
    const response = new Response(encryptedStream);
    const encryptedBlob = await response.blob();
    const encryptedBuffer = await encryptedBlob.arrayBuffer();

    const decrypted = await decryptFile(encryptedBuffer, { password: testPassword });
    const text = await decrypted.text();
    expect(text).toBe(testText);
  });

  it('should call onProgress callback for streaming decryption', async () => {
    const encryptedStream = await encryptFileStream(testBlob, {
      password: testPassword,
    });
    const response = new Response(encryptedStream);
    const encrypted = await response.blob();

    const progressCalls: Array<{ phase: string; progress: number }> = [];

    await decryptFile(encrypted, {
      password: testPassword,
      onProgress: (p) => progressCalls.push({ ...p }),
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    const lastCall = progressCalls[progressCalls.length - 1];
    expect(lastCall?.phase).toBe('complete');
  });
});
