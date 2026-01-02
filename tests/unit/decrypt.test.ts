import { describe, it, expect } from 'vitest';
import { encryptFile } from '../../src/encrypt';
import { decryptFile } from '../../src/decrypt';
import { generateKeyFile } from '../../src/keyfile';
import { getEncryptionType, isEncryptedFile } from '../../src/detect';
import { CryptoError } from '../../src/errors';
import {
  ENCRYPTION_MARKER_PASSWORD,
  ENCRYPTION_MARKER_KEYFILE,
} from '../../src/constants';

describe('decryptFile', () => {
  const testText = 'Hello, World! 안녕하세요! 🔐';
  const testData = new TextEncoder().encode(testText);
  const testBlob = new Blob([testData]);
  const testPassword = 'test-password-123';

  describe('password-based decryption', () => {
    it('should decrypt password-encrypted file correctly', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      const decrypted = await decryptFile(encrypted, { password: testPassword });

      const text = await decrypted.text();
      expect(text).toBe(testText);
    });

    it('should throw INVALID_PASSWORD for wrong password', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });

      await expect(
        decryptFile(encrypted, { password: 'wrong-password' })
      ).rejects.toMatchObject({
        code: 'INVALID_PASSWORD',
      });
    });

    it('should throw PASSWORD_REQUIRED when password not provided', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });

      await expect(decryptFile(encrypted, {})).rejects.toMatchObject({
        code: 'PASSWORD_REQUIRED',
      });
    });

    it('should throw KEYFILE_REQUIRED when trying to decrypt password file with keyData', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      const keyFile = generateKeyFile();

      // Should fail because it expects keyfile but file was encrypted with password
      await expect(
        decryptFile(encrypted, { keyData: keyFile.key })
      ).rejects.toMatchObject({
        code: 'PASSWORD_REQUIRED',
      });
    });
  });

  describe('keyfile-based decryption', () => {
    it('should decrypt keyfile-encrypted file correctly', async () => {
      const keyFile = generateKeyFile();
      const encrypted = await encryptFile(testBlob, { keyData: keyFile.key });
      const decrypted = await decryptFile(encrypted, { keyData: keyFile.key });

      const text = await decrypted.text();
      expect(text).toBe(testText);
    });

    it('should throw INVALID_KEYFILE for wrong keyfile', async () => {
      const keyFile1 = generateKeyFile();
      const keyFile2 = generateKeyFile();

      const encrypted = await encryptFile(testBlob, { keyData: keyFile1.key });

      await expect(
        decryptFile(encrypted, { keyData: keyFile2.key })
      ).rejects.toMatchObject({
        code: 'INVALID_KEYFILE',
      });
    });

    it('should throw KEYFILE_REQUIRED when keyData not provided', async () => {
      const keyFile = generateKeyFile();
      const encrypted = await encryptFile(testBlob, { keyData: keyFile.key });

      await expect(decryptFile(encrypted, {})).rejects.toMatchObject({
        code: 'KEYFILE_REQUIRED',
      });
    });
  });

  describe('error handling', () => {
    it('should throw INVALID_ENCRYPTED_DATA for empty data', async () => {
      const emptyBlob = new Blob([]);

      await expect(
        decryptFile(emptyBlob, { password: testPassword })
      ).rejects.toMatchObject({
        code: 'INVALID_ENCRYPTED_DATA',
      });
    });

    it('should throw UNSUPPORTED_FORMAT for invalid marker', async () => {
      const invalidData = new Uint8Array([0xFF, 0x00, 0x00]);
      const invalidBlob = new Blob([invalidData]);

      await expect(
        decryptFile(invalidBlob, { password: testPassword })
      ).rejects.toMatchObject({
        code: 'UNSUPPORTED_FORMAT',
      });
    });

    it('should throw INVALID_ENCRYPTED_DATA for truncated password-encrypted data', async () => {
      // Create data with password marker but too short
      const truncated = new Uint8Array([ENCRYPTION_MARKER_PASSWORD, 0x00, 0x00]);
      const truncatedBlob = new Blob([truncated]);

      await expect(
        decryptFile(truncatedBlob, { password: testPassword })
      ).rejects.toMatchObject({
        code: 'INVALID_ENCRYPTED_DATA',
      });
    });

    it('should throw INVALID_ENCRYPTED_DATA for truncated keyfile-encrypted data', async () => {
      const truncated = new Uint8Array([ENCRYPTION_MARKER_KEYFILE, 0x00, 0x00]);
      const truncatedBlob = new Blob([truncated]);
      const keyFile = generateKeyFile();

      await expect(
        decryptFile(truncatedBlob, { keyData: keyFile.key })
      ).rejects.toMatchObject({
        code: 'INVALID_ENCRYPTED_DATA',
      });
    });
  });

  describe('progress callback', () => {
    it('should call onProgress with correct phases', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      const progressCalls: Array<{ phase: string; progress: number }> = [];

      await decryptFile(encrypted, {
        password: testPassword,
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      const phases = progressCalls.map((p) => p.phase);
      expect(phases).toContain('decrypting');
      expect(phases).toContain('complete');

      const lastCall = progressCalls[progressCalls.length - 1];
      expect(lastCall?.progress).toBe(100);
      expect(lastCall?.phase).toBe('complete');
    });
  });
});

describe('getEncryptionType', () => {
  const testBlob = new Blob([new TextEncoder().encode('test')]);

  it('should return "password" for password-encrypted file', async () => {
    const encrypted = await encryptFile(testBlob, { password: 'test' });
    const type = await getEncryptionType(encrypted);
    expect(type).toBe('password');
  });

  it('should return "keyfile" for keyfile-encrypted file', async () => {
    const keyFile = generateKeyFile();
    const encrypted = await encryptFile(testBlob, { keyData: keyFile.key });
    const type = await getEncryptionType(encrypted);
    expect(type).toBe('keyfile');
  });

  it('should return "unknown" for empty data', async () => {
    const empty = new Blob([]);
    const type = await getEncryptionType(empty);
    expect(type).toBe('unknown');
  });

  it('should return "unknown" for invalid marker', async () => {
    const invalid = new Blob([new Uint8Array([0xFF])]);
    const type = await getEncryptionType(invalid);
    expect(type).toBe('unknown');
  });

  it('should accept ArrayBuffer input', async () => {
    const encrypted = await encryptFile(testBlob, { password: 'test' });
    const buffer = await encrypted.arrayBuffer();
    const type = await getEncryptionType(buffer);
    expect(type).toBe('password');
  });
});

describe('isEncryptedFile', () => {
  const testBlob = new Blob([new TextEncoder().encode('test')]);

  it('should return true for password-encrypted file', async () => {
    const encrypted = await encryptFile(testBlob, { password: 'test' });
    const result = await isEncryptedFile(encrypted);
    expect(result).toBe(true);
  });

  it('should return true for keyfile-encrypted file', async () => {
    const keyFile = generateKeyFile();
    const encrypted = await encryptFile(testBlob, { keyData: keyFile.key });
    const result = await isEncryptedFile(encrypted);
    expect(result).toBe(true);
  });

  it('should return false for empty data', async () => {
    const empty = new Blob([]);
    const result = await isEncryptedFile(empty);
    expect(result).toBe(false);
  });

  it('should return false for plain text', async () => {
    const result = await isEncryptedFile(testBlob);
    expect(result).toBe(false);
  });

  it('should return false for data with valid marker but too short', async () => {
    const short = new Blob([new Uint8Array([ENCRYPTION_MARKER_PASSWORD, 0x00])]);
    const result = await isEncryptedFile(short);
    expect(result).toBe(false);
  });
});
