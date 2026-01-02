import { describe, it, expect, vi } from 'vitest';
import { encryptFile } from '../../src/encrypt';
import { generateKeyFile } from '../../src/keyfile';
import { CryptoError } from '../../src/errors';
import {
  ENCRYPTION_MARKER_PASSWORD,
  ENCRYPTION_MARKER_KEYFILE,
  SALT_LENGTH,
  IV_LENGTH,
  MIN_ENCRYPTED_SIZE_PASSWORD,
  MIN_ENCRYPTED_SIZE_KEYFILE,
} from '../../src/constants';

describe('encryptFile', () => {
  const testData = new TextEncoder().encode('Hello, World!');
  const testBlob = new Blob([testData]);
  const testPassword = 'test-password-123';

  describe('input validation', () => {
    it('should throw PASSWORD_REQUIRED when neither password nor keyData provided', async () => {
      await expect(encryptFile(testBlob, {})).rejects.toThrow(CryptoError);
      await expect(encryptFile(testBlob, {})).rejects.toMatchObject({
        code: 'PASSWORD_REQUIRED',
      });
    });

    it('should accept File input', async () => {
      const file = new File([testData], 'test.txt', { type: 'text/plain' });
      const encrypted = await encryptFile(file, { password: testPassword });
      expect(encrypted).toBeInstanceOf(Blob);
    });

    it('should accept Blob input', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      expect(encrypted).toBeInstanceOf(Blob);
    });

    it('should accept ArrayBuffer input', async () => {
      const encrypted = await encryptFile(testData.buffer, { password: testPassword });
      expect(encrypted).toBeInstanceOf(Blob);
    });
  });

  describe('password-based encryption', () => {
    it('should produce Blob with correct MIME type', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      expect(encrypted.type).toBe('application/octet-stream');
    });

    it('should produce output with password marker', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      const bytes = new Uint8Array(await encrypted.arrayBuffer());
      expect(bytes[0]).toBe(ENCRYPTION_MARKER_PASSWORD);
    });

    it('should produce output larger than minimum size', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      expect(encrypted.size).toBeGreaterThanOrEqual(MIN_ENCRYPTED_SIZE_PASSWORD);
    });

    it('should produce different output for same input (random IV/salt)', async () => {
      const encrypted1 = await encryptFile(testBlob, { password: testPassword });
      const encrypted2 = await encryptFile(testBlob, { password: testPassword });

      const bytes1 = new Uint8Array(await encrypted1.arrayBuffer());
      const bytes2 = new Uint8Array(await encrypted2.arrayBuffer());

      // Salt and IV should differ
      const salt1 = bytes1.slice(1, 1 + SALT_LENGTH);
      const salt2 = bytes2.slice(1, 1 + SALT_LENGTH);
      expect(Array.from(salt1)).not.toEqual(Array.from(salt2));
    });

    it('should handle empty file', async () => {
      const emptyBlob = new Blob([]);
      const encrypted = await encryptFile(emptyBlob, { password: testPassword });
      expect(encrypted.size).toBe(MIN_ENCRYPTED_SIZE_PASSWORD);
    });

    it('should handle unicode password', async () => {
      const unicodePassword = '비밀번호🔐中文密码';
      const encrypted = await encryptFile(testBlob, { password: unicodePassword });
      expect(encrypted).toBeInstanceOf(Blob);
    });
  });

  describe('keyfile-based encryption', () => {
    it('should produce output with keyfile marker', async () => {
      const keyFile = generateKeyFile();
      const encrypted = await encryptFile(testBlob, { keyData: keyFile.key });
      const bytes = new Uint8Array(await encrypted.arrayBuffer());
      expect(bytes[0]).toBe(ENCRYPTION_MARKER_KEYFILE);
    });

    it('should produce output larger than minimum size', async () => {
      const keyFile = generateKeyFile();
      const encrypted = await encryptFile(testBlob, { keyData: keyFile.key });
      expect(encrypted.size).toBeGreaterThanOrEqual(MIN_ENCRYPTED_SIZE_KEYFILE);
    });

    it('should produce different output for same input (random IV)', async () => {
      const keyFile = generateKeyFile();
      const encrypted1 = await encryptFile(testBlob, { keyData: keyFile.key });
      const encrypted2 = await encryptFile(testBlob, { keyData: keyFile.key });

      const bytes1 = new Uint8Array(await encrypted1.arrayBuffer());
      const bytes2 = new Uint8Array(await encrypted2.arrayBuffer());

      // IV should differ
      const iv1 = bytes1.slice(1, 1 + IV_LENGTH);
      const iv2 = bytes2.slice(1, 1 + IV_LENGTH);
      expect(Array.from(iv1)).not.toEqual(Array.from(iv2));
    });

    it('should handle empty file', async () => {
      const keyFile = generateKeyFile();
      const emptyBlob = new Blob([]);
      const encrypted = await encryptFile(emptyBlob, { keyData: keyFile.key });
      expect(encrypted.size).toBe(MIN_ENCRYPTED_SIZE_KEYFILE);
    });
  });

  describe('progress callback', () => {
    it('should call onProgress with correct phases for password encryption', async () => {
      const progressCalls: Array<{ phase: string; progress: number }> = [];

      await encryptFile(testBlob, {
        password: testPassword,
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      const phases = progressCalls.map((p) => p.phase);
      expect(phases).toContain('deriving_key');
      expect(phases).toContain('encrypting');
      expect(phases).toContain('complete');

      // Should end at 100%
      const lastCall = progressCalls[progressCalls.length - 1];
      expect(lastCall?.progress).toBe(100);
      expect(lastCall?.phase).toBe('complete');
    });

    it('should call onProgress with correct phases for keyfile encryption', async () => {
      const keyFile = generateKeyFile();
      const progressCalls: Array<{ phase: string; progress: number }> = [];

      await encryptFile(testBlob, {
        keyData: keyFile.key,
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      const phases = progressCalls.map((p) => p.phase);
      expect(phases).toContain('encrypting');
      expect(phases).toContain('complete');

      const lastCall = progressCalls[progressCalls.length - 1];
      expect(lastCall?.progress).toBe(100);
    });

    it('should report monotonically increasing progress', async () => {
      const progressValues: number[] = [];

      await encryptFile(testBlob, {
        password: testPassword,
        onProgress: (p) => progressValues.push(p.progress),
      });

      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]!);
      }
    });
  });

  describe('large file handling', () => {
    it('should handle 100KB file', async () => {
      // Use smaller chunks due to Node.js crypto.getRandomValues 65KB limit
      const chunk1 = crypto.getRandomValues(new Uint8Array(50 * 1024));
      const chunk2 = crypto.getRandomValues(new Uint8Array(50 * 1024));
      const largeData = new Uint8Array(100 * 1024);
      largeData.set(chunk1, 0);
      largeData.set(chunk2, 50 * 1024);
      const largeBlob = new Blob([largeData]);

      const encrypted = await encryptFile(largeBlob, { password: testPassword });
      expect(encrypted.size).toBeGreaterThan(largeBlob.size);
    });
  });
});
