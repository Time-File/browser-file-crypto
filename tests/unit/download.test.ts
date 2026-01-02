import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadAndDecrypt } from '../../src/download';
import { encryptFile } from '../../src/encrypt';
import { generateKeyFile } from '../../src/keyfile';
import { CryptoError } from '../../src/errors';

describe('downloadAndDecrypt', () => {
  const testText = 'Hello, Download Test! 🔐';
  const testData = new TextEncoder().encode(testText);
  const testBlob = new Blob([testData]);
  const testPassword = 'test-password-123';
  const testFileName = 'decrypted-file.txt';

  let mockLink: {
    href: string;
    download: string;
    style: { display: string };
    click: ReturnType<typeof vi.fn>;
  };
  let originalDocument: typeof document;
  let originalURL: typeof URL;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    // Mock link element
    mockLink = {
      href: '',
      download: '',
      style: { display: '' },
      click: vi.fn(),
    };

    // Mock document
    originalDocument = globalThis.document;
    globalThis.document = {
      createElement: vi.fn().mockReturnValue(mockLink),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    } as unknown as Document;

    // Mock URL
    originalURL = globalThis.URL;
    globalThis.URL = {
      createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL;

    // Store original fetch
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.URL = originalURL;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('successful download and decrypt', () => {
    it('should download, decrypt, and save password-encrypted file', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      const encryptedBuffer = await encrypted.arrayBuffer();

      // Mock fetch
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map(),
        arrayBuffer: () => Promise.resolve(encryptedBuffer),
      });

      await downloadAndDecrypt('https://example.com/file.enc', {
        password: testPassword,
        fileName: testFileName,
      });

      expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com/file.enc');
      expect(globalThis.document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.download).toBe(testFileName);
      expect(mockLink.click).toHaveBeenCalled();
      expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should download, decrypt, and save keyfile-encrypted file', async () => {
      const keyFile = generateKeyFile();
      const encrypted = await encryptFile(testBlob, { keyData: keyFile.key });
      const encryptedBuffer = await encrypted.arrayBuffer();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map(),
        arrayBuffer: () => Promise.resolve(encryptedBuffer),
      });

      await downloadAndDecrypt('https://example.com/file.enc', {
        keyData: keyFile.key,
        fileName: testFileName,
      });

      expect(mockLink.click).toHaveBeenCalled();
    });
  });

  describe('progress tracking', () => {
    it('should report progress phases without content-length', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      const encryptedBuffer = await encrypted.arrayBuffer();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map(),
        arrayBuffer: () => Promise.resolve(encryptedBuffer),
      });

      const progressCalls: Array<{ phase: string; progress: number }> = [];

      await downloadAndDecrypt('https://example.com/file.enc', {
        password: testPassword,
        fileName: testFileName,
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      const phases = progressCalls.map((p) => p.phase);
      expect(phases).toContain('downloading');
      expect(phases).toContain('decrypting');
      expect(phases).toContain('complete');

      const lastCall = progressCalls[progressCalls.length - 1];
      expect(lastCall?.phase).toBe('complete');
      expect(lastCall?.progress).toBe(100);
    });

    it('should report progress with content-length and ReadableStream', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      const encryptedBuffer = await encrypted.arrayBuffer();
      const encryptedArray = new Uint8Array(encryptedBuffer);

      // Create a mock ReadableStream
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: encryptedArray.slice(0, 50) })
          .mockResolvedValueOnce({ done: false, value: encryptedArray.slice(50) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      const mockBody = {
        getReader: () => mockReader,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'content-length' ? String(encryptedArray.length) : null),
        },
        body: mockBody,
      });

      const progressCalls: Array<{ phase: string; progress: number }> = [];

      await downloadAndDecrypt('https://example.com/file.enc', {
        password: testPassword,
        fileName: testFileName,
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      const downloadingProgress = progressCalls.filter((p) => p.phase === 'downloading');
      expect(downloadingProgress.length).toBeGreaterThan(1);

      // Download phase should be mapped to 0-50%
      const downloadProgressValues = downloadingProgress.map((p) => p.progress);
      expect(downloadProgressValues[0]).toBe(0);
      expect(downloadProgressValues[downloadProgressValues.length - 1]).toBe(50);
    });
  });

  describe('error handling', () => {
    it('should throw DOWNLOAD_FAILED for HTTP error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        downloadAndDecrypt('https://example.com/notfound.enc', {
          password: testPassword,
          fileName: testFileName,
        })
      ).rejects.toMatchObject({
        code: 'DOWNLOAD_FAILED',
      });
    });

    it('should throw DOWNLOAD_FAILED for network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        downloadAndDecrypt('https://example.com/file.enc', {
          password: testPassword,
          fileName: testFileName,
        })
      ).rejects.toMatchObject({
        code: 'DOWNLOAD_FAILED',
      });
    });

    it('should throw INVALID_PASSWORD for wrong password', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      const encryptedBuffer = await encrypted.arrayBuffer();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map(),
        arrayBuffer: () => Promise.resolve(encryptedBuffer),
      });

      await expect(
        downloadAndDecrypt('https://example.com/file.enc', {
          password: 'wrong-password',
          fileName: testFileName,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_PASSWORD',
      });
    });

    it('should throw INVALID_KEYFILE for wrong keyfile', async () => {
      const keyFile1 = generateKeyFile();
      const keyFile2 = generateKeyFile();
      const encrypted = await encryptFile(testBlob, { keyData: keyFile1.key });
      const encryptedBuffer = await encrypted.arrayBuffer();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map(),
        arrayBuffer: () => Promise.resolve(encryptedBuffer),
      });

      await expect(
        downloadAndDecrypt('https://example.com/file.enc', {
          keyData: keyFile2.key,
          fileName: testFileName,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_KEYFILE',
      });
    });

    it('should preserve CryptoError when thrown from decryptFile', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      const encryptedBuffer = await encrypted.arrayBuffer();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map(),
        arrayBuffer: () => Promise.resolve(encryptedBuffer),
      });

      try {
        await downloadAndDecrypt('https://example.com/file.enc', {
          password: 'wrong-password',
          fileName: testFileName,
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CryptoError);
        expect((error as CryptoError).code).toBe('INVALID_PASSWORD');
      }
    });
  });

  describe('deriving_key phase', () => {
    it('should include deriving_key phase for password mode', async () => {
      const encrypted = await encryptFile(testBlob, { password: testPassword });
      const encryptedBuffer = await encrypted.arrayBuffer();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map(),
        arrayBuffer: () => Promise.resolve(encryptedBuffer),
      });

      const progressCalls: Array<{ phase: string; progress: number }> = [];

      await downloadAndDecrypt('https://example.com/file.enc', {
        password: testPassword,
        fileName: testFileName,
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      const phases = progressCalls.map((p) => p.phase);
      expect(phases).toContain('deriving_key');
    });

    it('should not include deriving_key phase for keyfile mode', async () => {
      const keyFile = generateKeyFile();
      const encrypted = await encryptFile(testBlob, { keyData: keyFile.key });
      const encryptedBuffer = await encrypted.arrayBuffer();

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Map(),
        arrayBuffer: () => Promise.resolve(encryptedBuffer),
      });

      const progressCalls: Array<{ phase: string; progress: number }> = [];

      await downloadAndDecrypt('https://example.com/file.enc', {
        keyData: keyFile.key,
        fileName: testFileName,
        onProgress: (p) => progressCalls.push({ ...p }),
      });

      const phases = progressCalls.map((p) => p.phase);
      expect(phases).not.toContain('deriving_key');
    });
  });
});
