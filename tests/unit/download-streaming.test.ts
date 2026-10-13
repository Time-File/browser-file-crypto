import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadAndDecrypt, downloadAndDecryptStream } from '../../src/download';
import { encryptFile } from '../../src/encrypt';
import { encryptFileStream } from '../../src/stream';
import { generateKeyFile } from '../../src/keyfile';
import { CryptoError } from '../../src/errors';

/**
 * Regression coverage for large-file downloads: streaming-encrypted bodies must
 * be decrypted while they arrive (no full ciphertext buffer), and lower-level
 * failures must stay visible as `cause` instead of a bare DOWNLOAD_FAILED.
 */

const password = 'stream-download-password';

function randomBytes(size: number): Uint8Array {
  const data = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += 65536) {
    crypto.getRandomValues(data.subarray(offset, Math.min(offset + 65536, size)));
  }
  return data;
}

async function streamEncrypt(
  data: Uint8Array,
  options: { password?: string; keyData?: string; chunkSize?: number }
): Promise<Uint8Array> {
  const stream = await encryptFileStream(new Blob([data]), options);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A body that delivers `bytes` in `readSize` pieces, optionally failing after `failAfter` bytes. */
function bodyOf(
  bytes: Uint8Array,
  readSize: number,
  failure?: { afterBytes: number; error: unknown }
): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller): void {
      if (failure && offset >= failure.afterBytes) {
        controller.error(failure.error);
        return;
      }
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const end = Math.min(offset + readSize, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
}

function mockResponse(body: ReadableStream<Uint8Array>, contentLength?: number) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers(contentLength ? { 'content-length': String(contentLength) } : {}),
    body,
    arrayBuffer: vi.fn(() => Promise.reject(new Error('ciphertext must not be buffered'))),
    blob: vi.fn(() => Promise.reject(new Error('ciphertext must not be buffered'))),
  };
}

describe('streaming downloads', () => {
  let saved: Blob[];
  let originalDocument: typeof document;
  let originalURL: typeof URL;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    saved = [];
    originalDocument = globalThis.document;
    originalURL = globalThis.URL;
    originalFetch = globalThis.fetch;

    globalThis.document = {
      createElement: vi.fn().mockReturnValue({ style: {}, click: vi.fn() }),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    } as unknown as Document;
    globalThis.URL = {
      createObjectURL: vi.fn((blob: Blob) => {
        saved.push(blob);
        return 'blob:mock-url';
      }),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.URL = originalURL;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function savedBytes(): Promise<Uint8Array> {
    expect(saved).toHaveLength(1);
    return new Uint8Array(await saved[0]!.arrayBuffer());
  }

  describe('downloadAndDecrypt', () => {
    it('decrypts a streaming-encrypted body as it arrives, without buffering the ciphertext', async () => {
      const plaintext = randomBytes(10_000);
      const encrypted = await streamEncrypt(plaintext, { password, chunkSize: 1024 });
      const response = mockResponse(bodyOf(encrypted, 777), encrypted.length);
      globalThis.fetch = vi.fn().mockResolvedValue(response);

      await downloadAndDecrypt('https://example.com/large.enc', { password, fileName: 'large.bin' });

      expect(await savedBytes()).toEqual(plaintext);
      expect(response.arrayBuffer).not.toHaveBeenCalled();
      expect(response.blob).not.toHaveBeenCalled();
    });

    it('decrypts many encrypted chunks delivered in a single network read', async () => {
      const keyFile = generateKeyFile();
      const plaintext = randomBytes(50_000);
      const encrypted = await streamEncrypt(plaintext, { keyData: keyFile.key, chunkSize: 512 });
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockResponse(bodyOf(encrypted, encrypted.length), encrypted.length));

      await downloadAndDecrypt('https://example.com/large.enc', {
        keyData: keyFile.key,
        fileName: 'large.bin',
      });

      expect(await savedBytes()).toEqual(plaintext);
    });

    it('reports INVALID_PASSWORD, not DOWNLOAD_FAILED, for a wrong password on a streamed body', async () => {
      const encrypted = await streamEncrypt(randomBytes(4096), { password, chunkSize: 1024 });
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockResponse(bodyOf(encrypted, 300), encrypted.length));

      await expect(
        downloadAndDecrypt('https://example.com/large.enc', {
          password: 'wrong-password',
          fileName: 'large.bin',
        })
      ).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
      expect(saved).toHaveLength(0);
    });

    it('keeps the network error as cause when a streamed body fails midway', async () => {
      const encrypted = await streamEncrypt(randomBytes(20_000), { password, chunkSize: 1024 });
      const networkError = new TypeError('Load failed');
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse(
          bodyOf(encrypted, 1000, { afterBytes: 5000, error: networkError }),
          encrypted.length
        )
      );

      const failure = await downloadAndDecrypt('https://example.com/large.enc', {
        password,
        fileName: 'large.bin',
      }).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(CryptoError);
      expect((failure as CryptoError).code).toBe('DOWNLOAD_FAILED');
      expect((failure as CryptoError).message).toBe('File download failed.');
      expect((failure as CryptoError).cause).toBe(networkError);
      expect(saved).toHaveLength(0);
    });

    it('keeps the network error as cause when a single-shot body fails midway', async () => {
      const encrypted = new Uint8Array(
        await (await encryptFile(new Blob([randomBytes(8000)]), { password })).arrayBuffer()
      );
      const networkError = new TypeError('network error');
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse(
          bodyOf(encrypted, 1000, { afterBytes: 3000, error: networkError }),
          encrypted.length
        )
      );

      const failure = await downloadAndDecrypt('https://example.com/file.enc', {
        password,
        fileName: 'file.bin',
      }).catch((error: unknown) => error);

      expect((failure as CryptoError).code).toBe('DOWNLOAD_FAILED');
      expect((failure as CryptoError).cause).toBe(networkError);
    });

    it('keeps the fetch rejection as cause', async () => {
      const fetchError = new TypeError('Failed to fetch');
      globalThis.fetch = vi.fn().mockRejectedValue(fetchError);

      const failure = await downloadAndDecrypt('https://example.com/file.enc', {
        password,
        fileName: 'file.bin',
      }).catch((error: unknown) => error);

      expect((failure as CryptoError).code).toBe('DOWNLOAD_FAILED');
      expect((failure as CryptoError).cause).toBe(fetchError);
    });

    it('still decrypts single-shot encrypted bodies', async () => {
      const plaintext = randomBytes(3000);
      const encrypted = new Uint8Array(
        await (await encryptFile(new Blob([plaintext]), { password })).arrayBuffer()
      );
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockResponse(bodyOf(encrypted, 500), encrypted.length));

      await downloadAndDecrypt('https://example.com/file.enc', { password, fileName: 'file.bin' });

      expect(await savedBytes()).toEqual(plaintext);
    });

    it('handles a single-shot body whose Content-Length is missing', async () => {
      const plaintext = randomBytes(3000);
      const encrypted = new Uint8Array(
        await (await encryptFile(new Blob([plaintext]), { password })).arrayBuffer()
      );
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(bodyOf(encrypted, 700)));

      await downloadAndDecrypt('https://example.com/file.enc', { password, fileName: 'file.bin' });

      expect(await savedBytes()).toEqual(plaintext);
    });

    it('emits each download percentage once and finishes at 100', async () => {
      const encrypted = await streamEncrypt(randomBytes(200_000), { password, chunkSize: 4096 });
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue(mockResponse(bodyOf(encrypted, 100), encrypted.length));
      const events: Array<{ phase: string; progress: number }> = [];

      await downloadAndDecrypt('https://example.com/large.enc', {
        password,
        fileName: 'large.bin',
        onProgress: (progress) => events.push({ ...progress }),
      });

      const downloading = events.filter((event) => event.phase === 'downloading');
      // ~2000 network reads, but at most one event per percentage point.
      expect(downloading.length).toBeLessThanOrEqual(96);
      const values = downloading.map((event) => event.progress);
      expect(values).toEqual([...values].sort((a, b) => a - b));
      expect(Math.max(...values)).toBeLessThanOrEqual(95);
      expect(events.map((event) => event.phase)).toContain('deriving_key');
      // Decryption starts while the body is still downloading.
      const derivingAt = events.findIndex((event) => event.phase === 'deriving_key');
      const lastDownloadingAt = events.map((event) => event.phase).lastIndexOf('downloading');
      expect(derivingAt).toBeLessThan(lastDownloadingAt);
      expect(events[events.length - 1]).toEqual({ phase: 'complete', progress: 100 });
    });
  });

  describe('downloadAndDecryptStream', () => {
    it('decrypts the response body as it arrives', async () => {
      const plaintext = randomBytes(12_345);
      const encrypted = await streamEncrypt(plaintext, { password, chunkSize: 2048 });
      const response = mockResponse(bodyOf(encrypted, 999), encrypted.length);
      globalThis.fetch = vi.fn().mockResolvedValue(response);

      await downloadAndDecryptStream('https://example.com/large.enc', {
        password,
        fileName: 'large.bin',
      });

      expect(await savedBytes()).toEqual(plaintext);
      expect(response.blob).not.toHaveBeenCalled();
    });

    it('keeps the network error as cause when the body fails midway', async () => {
      const encrypted = await streamEncrypt(randomBytes(20_000), { password, chunkSize: 1024 });
      const networkError = new TypeError('Load failed');
      globalThis.fetch = vi.fn().mockResolvedValue(
        mockResponse(
          bodyOf(encrypted, 1000, { afterBytes: 4000, error: networkError }),
          encrypted.length
        )
      );

      const failure = await downloadAndDecryptStream('https://example.com/large.enc', {
        password,
        fileName: 'large.bin',
      }).catch((error: unknown) => error);

      expect((failure as CryptoError).code).toBe('DOWNLOAD_FAILED');
      expect((failure as CryptoError).cause).toBe(networkError);
    });
  });
});
