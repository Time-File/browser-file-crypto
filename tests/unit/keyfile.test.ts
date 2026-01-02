import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateKeyFile,
  parseKeyFile,
  downloadKeyFile,
  computeKeyFileHash,
} from '../../src/keyfile';

describe('keyfile', () => {
  describe('generateKeyFile', () => {
    it('should generate a valid keyfile', () => {
      const keyFile = generateKeyFile();

      expect(keyFile.version).toBe(1);
      expect(keyFile.algorithm).toBe('AES-256-GCM');
      expect(typeof keyFile.key).toBe('string');
      expect(keyFile.key.length).toBeGreaterThan(0);
      expect(typeof keyFile.createdAt).toBe('string');
    });

    it('should generate unique keys each time', () => {
      const keyFile1 = generateKeyFile();
      const keyFile2 = generateKeyFile();

      expect(keyFile1.key).not.toBe(keyFile2.key);
    });

    it('should generate 32-byte key (256 bits)', () => {
      const keyFile = generateKeyFile();
      // Base64 of 32 bytes = 44 characters (with padding)
      expect(keyFile.key.length).toBe(44);
    });
  });

  describe('parseKeyFile', () => {
    it('should parse a valid keyfile JSON', () => {
      const keyFile = generateKeyFile();
      const json = JSON.stringify(keyFile);

      const parsed = parseKeyFile(json);

      expect(parsed).not.toBeNull();
      expect(parsed?.version).toBe(1);
      expect(parsed?.algorithm).toBe('AES-256-GCM');
      expect(parsed?.key).toBe(keyFile.key);
    });

    it('should return null for invalid JSON', () => {
      const result = parseKeyFile('not valid json');
      expect(result).toBeNull();
    });

    it('should return null for wrong version', () => {
      const result = parseKeyFile(
        JSON.stringify({
          version: 2,
          algorithm: 'AES-256-GCM',
          key: 'test',
          createdAt: new Date().toISOString(),
        })
      );
      expect(result).toBeNull();
    });

    it('should return null for wrong algorithm', () => {
      const result = parseKeyFile(
        JSON.stringify({
          version: 1,
          algorithm: 'AES-128-GCM',
          key: 'test',
          createdAt: new Date().toISOString(),
        })
      );
      expect(result).toBeNull();
    });

    it('should return null for missing key', () => {
      const result = parseKeyFile(
        JSON.stringify({
          version: 1,
          algorithm: 'AES-256-GCM',
          createdAt: new Date().toISOString(),
        })
      );
      expect(result).toBeNull();
    });

    it('should return null for empty key', () => {
      const result = parseKeyFile(
        JSON.stringify({
          version: 1,
          algorithm: 'AES-256-GCM',
          key: '',
          createdAt: new Date().toISOString(),
        })
      );
      expect(result).toBeNull();
    });

    it('should return null for null input parsed', () => {
      const result = parseKeyFile('null');
      expect(result).toBeNull();
    });

    it('should return null for non-object JSON', () => {
      const result = parseKeyFile('"string"');
      expect(result).toBeNull();
    });

    it('should return null for missing createdAt', () => {
      const result = parseKeyFile(
        JSON.stringify({
          version: 1,
          algorithm: 'AES-256-GCM',
          key: 'test',
        })
      );
      expect(result).toBeNull();
    });
  });

  describe('downloadKeyFile', () => {
    let mockLink: {
      href: string;
      download: string;
      style: { display: string };
      click: ReturnType<typeof vi.fn>;
    };
    let originalDocument: typeof document;
    let originalURL: typeof URL;

    beforeEach(() => {
      mockLink = {
        href: '',
        download: '',
        style: { display: '' },
        click: vi.fn(),
      };

      originalDocument = globalThis.document;
      globalThis.document = {
        createElement: vi.fn().mockReturnValue(mockLink),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
      } as unknown as Document;

      originalURL = globalThis.URL;
      globalThis.URL = {
        createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
        revokeObjectURL: vi.fn(),
      } as unknown as typeof URL;
    });

    afterEach(() => {
      globalThis.document = originalDocument;
      globalThis.URL = originalURL;
      vi.restoreAllMocks();
    });

    it('should create and trigger download link', () => {
      const keyFile = generateKeyFile();
      downloadKeyFile(keyFile.key, 'my-key');

      expect(globalThis.document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.download).toBe('my-key.tfkey');
      expect(mockLink.click).toHaveBeenCalled();
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should set link display to none', () => {
      const keyFile = generateKeyFile();
      downloadKeyFile(keyFile.key, 'test');

      expect(mockLink.style.display).toBe('none');
    });

    it('should append and remove link from document body', () => {
      const keyFile = generateKeyFile();
      downloadKeyFile(keyFile.key, 'test');

      expect(globalThis.document.body.appendChild).toHaveBeenCalledWith(mockLink);
      expect(globalThis.document.body.removeChild).toHaveBeenCalledWith(mockLink);
    });
  });

  describe('computeKeyFileHash', () => {
    it('should compute SHA-256 hash of key data', async () => {
      const keyFile = generateKeyFile();
      const hash = await computeKeyFileHash(keyFile.key);

      // SHA-256 produces 64 hex characters
      expect(hash.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it('should produce consistent hash for same key', async () => {
      const keyFile = generateKeyFile();
      const hash1 = await computeKeyFileHash(keyFile.key);
      const hash2 = await computeKeyFileHash(keyFile.key);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', async () => {
      const keyFile1 = generateKeyFile();
      const keyFile2 = generateKeyFile();
      const hash1 = await computeKeyFileHash(keyFile1.key);
      const hash2 = await computeKeyFileHash(keyFile2.key);

      expect(hash1).not.toBe(hash2);
    });
  });
});
