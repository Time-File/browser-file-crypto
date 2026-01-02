import { describe, it, expect } from 'vitest';
import { encryptFile } from '../../src/encrypt';
import { decryptFile } from '../../src/decrypt';
import { generateKeyFile, parseKeyFile } from '../../src/keyfile';
import { getEncryptionType } from '../../src/detect';
import { generateRandomPassword } from '../../src/utils';

describe('Encryption/Decryption Roundtrip', () => {
  describe('password-based roundtrip', () => {
    it('should preserve text file content exactly', async () => {
      const originalText = 'Hello, World! 안녕하세요! 🔐 Special chars: <>&"\' \\n\\t';
      const originalBlob = new Blob([originalText], { type: 'text/plain' });
      const password = 'my-secret-password';

      const encrypted = await encryptFile(originalBlob, { password });
      const decrypted = await decryptFile(encrypted, { password });

      const decryptedText = await decrypted.text();
      expect(decryptedText).toBe(originalText);
    });

    it('should preserve binary file content exactly', async () => {
      // Create binary data with all byte values
      const binaryData = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        binaryData[i] = i;
      }
      const originalBlob = new Blob([binaryData], { type: 'application/octet-stream' });
      const password = 'binary-password';

      const encrypted = await encryptFile(originalBlob, { password });
      const decrypted = await decryptFile(encrypted, { password });

      const decryptedData = new Uint8Array(await decrypted.arrayBuffer());
      expect(Array.from(decryptedData)).toEqual(Array.from(binaryData));
    });

    it('should preserve empty file', async () => {
      const emptyBlob = new Blob([]);
      const password = 'empty-password';

      const encrypted = await encryptFile(emptyBlob, { password });
      const decrypted = await decryptFile(encrypted, { password });

      expect(decrypted.size).toBe(0);
    });

    it('should work with generated random password', async () => {
      const originalText = 'Secret message';
      const originalBlob = new Blob([originalText]);
      const password = generateRandomPassword(32);

      const encrypted = await encryptFile(originalBlob, { password });
      const decrypted = await decryptFile(encrypted, { password });

      expect(await decrypted.text()).toBe(originalText);
    });

    it('should work with unicode password', async () => {
      const originalText = 'Secret data';
      const originalBlob = new Blob([originalText]);
      const unicodePassword = '密码🔑пароль';

      const encrypted = await encryptFile(originalBlob, { password: unicodePassword });
      const decrypted = await decryptFile(encrypted, { password: unicodePassword });

      expect(await decrypted.text()).toBe(originalText);
    });
  });

  describe('keyfile-based roundtrip', () => {
    it('should preserve text file content exactly', async () => {
      const originalText = 'Keyfile encrypted content! 키파일 암호화!';
      const originalBlob = new Blob([originalText]);
      const keyFile = generateKeyFile();

      const encrypted = await encryptFile(originalBlob, { keyData: keyFile.key });
      const decrypted = await decryptFile(encrypted, { keyData: keyFile.key });

      expect(await decrypted.text()).toBe(originalText);
    });

    it('should preserve binary file content exactly', async () => {
      const binaryData = crypto.getRandomValues(new Uint8Array(1000));
      const originalBlob = new Blob([binaryData]);
      const keyFile = generateKeyFile();

      const encrypted = await encryptFile(originalBlob, { keyData: keyFile.key });
      const decrypted = await decryptFile(encrypted, { keyData: keyFile.key });

      const decryptedData = new Uint8Array(await decrypted.arrayBuffer());
      expect(Array.from(decryptedData)).toEqual(Array.from(binaryData));
    });

    it('should work with parsed keyfile', async () => {
      const originalText = 'Test with parsed keyfile';
      const originalBlob = new Blob([originalText]);

      // Generate and serialize keyfile
      const keyFile = generateKeyFile();
      const keyFileJson = JSON.stringify(keyFile);

      // Parse keyfile back
      const parsedKeyFile = parseKeyFile(keyFileJson);
      expect(parsedKeyFile).not.toBeNull();

      const encrypted = await encryptFile(originalBlob, { keyData: keyFile.key });
      const decrypted = await decryptFile(encrypted, { keyData: parsedKeyFile!.key });

      expect(await decrypted.text()).toBe(originalText);
    });
  });

  describe('encryption type detection', () => {
    it('should correctly identify password encryption', async () => {
      const blob = new Blob(['test']);
      const encrypted = await encryptFile(blob, { password: 'test' });

      const type = await getEncryptionType(encrypted);
      expect(type).toBe('password');
    });

    it('should correctly identify keyfile encryption', async () => {
      const blob = new Blob(['test']);
      const keyFile = generateKeyFile();
      const encrypted = await encryptFile(blob, { keyData: keyFile.key });

      const type = await getEncryptionType(encrypted);
      expect(type).toBe('keyfile');
    });
  });

  describe('large file handling', () => {
    // Helper to generate large random data (works around 65KB limit)
    function generateLargeRandomData(size: number): Uint8Array {
      const data = new Uint8Array(size);
      const chunkSize = 65536;
      for (let i = 0; i < size; i += chunkSize) {
        const chunk = crypto.getRandomValues(new Uint8Array(Math.min(chunkSize, size - i)));
        data.set(chunk, i);
      }
      return data;
    }

    it('should handle 100KB file with password', async () => {
      const largeData = generateLargeRandomData(100 * 1024);
      const originalBlob = new Blob([largeData]);
      const password = 'large-file-password';

      const encrypted = await encryptFile(originalBlob, { password });
      const decrypted = await decryptFile(encrypted, { password });

      const decryptedData = new Uint8Array(await decrypted.arrayBuffer());
      expect(decryptedData.length).toBe(largeData.length);
      expect(Array.from(decryptedData)).toEqual(Array.from(largeData));
    });

    it('should handle 100KB file with keyfile', async () => {
      const largeData = generateLargeRandomData(100 * 1024);
      const originalBlob = new Blob([largeData]);
      const keyFile = generateKeyFile();

      const encrypted = await encryptFile(originalBlob, { keyData: keyFile.key });
      const decrypted = await decryptFile(encrypted, { keyData: keyFile.key });

      const decryptedData = new Uint8Array(await decrypted.arrayBuffer());
      expect(decryptedData.length).toBe(largeData.length);
      expect(Array.from(decryptedData)).toEqual(Array.from(largeData));
    });
  });

  describe('multiple encryptions', () => {
    it('should produce different ciphertexts for same plaintext', async () => {
      const originalBlob = new Blob(['Same content']);
      const password = 'same-password';

      const encrypted1 = await encryptFile(originalBlob, { password });
      const encrypted2 = await encryptFile(originalBlob, { password });

      const bytes1 = new Uint8Array(await encrypted1.arrayBuffer());
      const bytes2 = new Uint8Array(await encrypted2.arrayBuffer());

      // Ciphertexts should differ due to random IV/salt
      expect(Array.from(bytes1)).not.toEqual(Array.from(bytes2));

      // But both should decrypt to same plaintext
      const decrypted1 = await decryptFile(encrypted1, { password });
      const decrypted2 = await decryptFile(encrypted2, { password });

      expect(await decrypted1.text()).toBe('Same content');
      expect(await decrypted2.text()).toBe('Same content');
    });
  });

  describe('File input type', () => {
    it('should handle File object', async () => {
      const file = new File(['File content'], 'test.txt', { type: 'text/plain' });
      const password = 'file-password';

      const encrypted = await encryptFile(file, { password });
      const decrypted = await decryptFile(encrypted, { password });

      expect(await decrypted.text()).toBe('File content');
    });

    it('should handle ArrayBuffer input', async () => {
      const data = new TextEncoder().encode('ArrayBuffer content');
      const password = 'buffer-password';

      const encrypted = await encryptFile(data.buffer, { password });
      const decrypted = await decryptFile(encrypted, { password });

      expect(await decrypted.text()).toBe('ArrayBuffer content');
    });
  });
});
