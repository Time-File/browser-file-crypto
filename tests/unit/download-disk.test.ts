import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadAndDecrypt, downloadAndDecryptStream } from '../../src/download';
import { cleanupDownloadCache, DOWNLOAD_CACHE_DIRECTORY } from '../../src/disk';
import { encryptFileStream } from '../../src/stream';
import { CryptoError } from '../../src/errors';

/**
 * Disk-backed (OPFS) assembly of decrypted downloads, against an in-memory
 * fake of the Origin Private File System.
 */

const password = 'disk-download-password';
const THIRTY_MINUTES = 30 * 60 * 1000;

class FakeFileHandle {
  committed: Uint8Array[] = [];
  writableOpen = false;
  failWritesAfterBytes: number | undefined;

  constructor(
    readonly name: string,
    readonly supportsWritable: boolean
  ) {}

  get createWritable(): (() => Promise<WritableStream<Uint8Array>>) | undefined {
    if (!this.supportsWritable) return undefined;
    return async () => {
      const staged: Uint8Array[] = [];
      let written = 0;
      this.writableOpen = true;
      return new WritableStream<Uint8Array>({
        write: (chunk) => {
          written += chunk.length;
          if (this.failWritesAfterBytes !== undefined && written > this.failWritesAfterBytes) {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
          }
          staged.push(chunk.slice());
        },
        close: () => {
          this.committed = staged;
          this.writableOpen = false;
        },
        abort: () => {
          this.writableOpen = false;
        },
      });
    };
  }

  async getFile(): Promise<File> {
    return new File(this.committed, this.name);
  }
}

class FakeDirectory {
  readonly files = new Map<string, FakeFileHandle>();
  readonly directories = new Map<string, FakeDirectory>();
  supportsWritable = true;
  failWritesAfterBytes: number | undefined;

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FakeDirectory> {
    let directory = this.directories.get(name);
    if (!directory) {
      if (!options?.create) throw new DOMException('Not found', 'NotFoundError');
      directory = new FakeDirectory();
      directory.supportsWritable = this.supportsWritable;
      directory.failWritesAfterBytes = this.failWritesAfterBytes;
      this.directories.set(name, directory);
    }
    return directory;
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<FakeFileHandle> {
    let file = this.files.get(name);
    if (!file) {
      if (!options?.create) throw new DOMException('Not found', 'NotFoundError');
      file = new FakeFileHandle(name, this.supportsWritable);
      file.failWritesAfterBytes = this.failWritesAfterBytes;
      this.files.set(name, file);
    }
    return file;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name) && !this.directories.delete(name)) {
      throw new DOMException('Not found', 'NotFoundError');
    }
  }

  async *keys(): AsyncGenerator<string> {
    for (const name of [...this.files.keys(), ...this.directories.keys()]) yield name;
  }
}

function randomBytes(size: number): Uint8Array {
  const data = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += 65536) {
    crypto.getRandomValues(data.subarray(offset, Math.min(offset + 65536, size)));
  }
  return data;
}

async function streamEncrypt(data: Uint8Array): Promise<Uint8Array> {
  const stream = await encryptFileStream(new Blob([data]), { password, chunkSize: 1024 });
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

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

function respondWith(bytes: Uint8Array, failure?: { afterBytes: number; error: unknown }) {
  return () =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-length': String(bytes.length) }),
      body: bodyOf(bytes, 700, failure),
    });
}

describe('disk-backed downloads', () => {
  let root: FakeDirectory;
  let saved: Blob[];
  let estimate: { quota?: number; usage?: number };
  let getDirectory: ReturnType<typeof vi.fn>;
  let originalDocument: typeof document;
  let originalURL: typeof URL;
  let originalFetch: typeof fetch;

  const cache = (): FakeDirectory | undefined => root.directories.get(DOWNLOAD_CACHE_DIRECTORY);

  beforeEach(() => {
    root = new FakeDirectory();
    saved = [];
    estimate = { quota: 10 * 1024 * 1024 * 1024, usage: 0 };
    getDirectory = vi.fn(() => Promise.resolve(root));
    vi.stubGlobal('navigator', {
      storage: { getDirectory, estimate: () => Promise.resolve(estimate) },
    });

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
    vi.unstubAllGlobals();
    vi.useRealTimers();
    globalThis.document = originalDocument;
    globalThis.URL = originalURL;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('assembles a streamed download in an OPFS file and saves that file', async () => {
    const plaintext = randomBytes(20_000);
    const encrypted = await streamEncrypt(plaintext);
    globalThis.fetch = vi.fn(respondWith(encrypted)) as unknown as typeof fetch;

    await downloadAndDecrypt('https://example.com/large.enc', { password, fileName: 'large.bin' });

    expect(saved).toHaveLength(1);
    expect(saved[0]).toBeInstanceOf(File);
    expect(new Uint8Array(await saved[0]!.arrayBuffer())).toEqual(plaintext);
    expect(cache()?.files.size).toBe(1);
  });

  it('removes the temporary file 30 minutes after saving', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const encrypted = await streamEncrypt(randomBytes(5000));
    globalThis.fetch = vi.fn(respondWith(encrypted)) as unknown as typeof fetch;

    await downloadAndDecrypt('https://example.com/large.enc', { password, fileName: 'large.bin' });
    expect(cache()?.files.size).toBe(1);

    await vi.advanceTimersByTimeAsync(THIRTY_MINUTES);
    expect(cache()?.files.size).toBe(0);
  });

  it('applies to downloadAndDecryptStream as well', async () => {
    const plaintext = randomBytes(9000);
    const encrypted = await streamEncrypt(plaintext);
    globalThis.fetch = vi.fn(respondWith(encrypted)) as unknown as typeof fetch;

    await downloadAndDecryptStream('https://example.com/large.enc', {
      password,
      fileName: 'large.bin',
    });

    expect(saved[0]).toBeInstanceOf(File);
    expect(new Uint8Array(await saved[0]!.arrayBuffer())).toEqual(plaintext);
  });

  it("keeps everything in memory with storage: 'memory'", async () => {
    const plaintext = randomBytes(5000);
    const encrypted = await streamEncrypt(plaintext);
    globalThis.fetch = vi.fn(respondWith(encrypted)) as unknown as typeof fetch;

    await downloadAndDecrypt('https://example.com/large.enc', {
      password,
      fileName: 'large.bin',
      storage: 'memory',
    });

    expect(getDirectory).not.toHaveBeenCalled();
    expect(new Uint8Array(await saved[0]!.arrayBuffer())).toEqual(plaintext);
  });

  it('falls back to memory when the storage quota cannot hold the file', async () => {
    const plaintext = randomBytes(5000);
    const encrypted = await streamEncrypt(plaintext);
    estimate = { quota: 1024, usage: 0 };
    globalThis.fetch = vi.fn(respondWith(encrypted)) as unknown as typeof fetch;

    await downloadAndDecrypt('https://example.com/large.enc', { password, fileName: 'large.bin' });

    expect(cache()).toBeUndefined();
    expect(new Uint8Array(await saved[0]!.arrayBuffer())).toEqual(plaintext);
  });

  it('falls back to memory when OPFS cannot be written from this context', async () => {
    root.supportsWritable = false; // and Node has no Worker
    const plaintext = randomBytes(5000);
    const encrypted = await streamEncrypt(plaintext);
    globalThis.fetch = vi.fn(respondWith(encrypted)) as unknown as typeof fetch;

    await downloadAndDecrypt('https://example.com/large.enc', { password, fileName: 'large.bin' });

    expect(new Uint8Array(await saved[0]!.arrayBuffer())).toEqual(plaintext);
    expect(cache()?.files.size).toBe(0);
  });

  it('falls back to memory when OPFS is unavailable (e.g. private browsing)', async () => {
    getDirectory.mockRejectedValue(new DOMException('Denied', 'SecurityError'));
    const plaintext = randomBytes(5000);
    globalThis.fetch = vi.fn(respondWith(await streamEncrypt(plaintext))) as unknown as typeof fetch;

    await downloadAndDecrypt('https://example.com/large.enc', { password, fileName: 'large.bin' });

    expect(new Uint8Array(await saved[0]!.arrayBuffer())).toEqual(plaintext);
  });

  it('retries in memory when the disk quota runs out mid-download', async () => {
    root.failWritesAfterBytes = 3000;
    const plaintext = randomBytes(20_000);
    const encrypted = await streamEncrypt(plaintext);
    const fetchMock = vi.fn(respondWith(encrypted));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await downloadAndDecrypt('https://example.com/large.enc', { password, fileName: 'large.bin' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(saved).toHaveLength(1);
    expect(saved[0]).not.toBeInstanceOf(File);
    expect(new Uint8Array(await saved[0]!.arrayBuffer())).toEqual(plaintext);
    expect(cache()?.files.size).toBe(0);
  });

  it('removes the partial file and keeps the cause when the network drops', async () => {
    const encrypted = await streamEncrypt(randomBytes(20_000));
    const networkError = new TypeError('Load failed');
    globalThis.fetch = vi.fn(
      respondWith(encrypted, { afterBytes: 6000, error: networkError })
    ) as unknown as typeof fetch;

    const failure = await downloadAndDecrypt('https://example.com/large.enc', {
      password,
      fileName: 'large.bin',
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CryptoError);
    expect((failure as CryptoError).code).toBe('DOWNLOAD_FAILED');
    expect((failure as CryptoError).cause).toBe(networkError);
    expect(saved).toHaveLength(0);
    expect(cache()?.files.size).toBe(0);
  });

  it('reports INVALID_PASSWORD and removes the partial file for a wrong password', async () => {
    const encrypted = await streamEncrypt(randomBytes(5000));
    globalThis.fetch = vi.fn(respondWith(encrypted)) as unknown as typeof fetch;

    await expect(
      downloadAndDecrypt('https://example.com/large.enc', {
        password: 'wrong-password',
        fileName: 'large.bin',
      })
    ).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    expect(cache()?.files.size).toBe(0);
  });

  it('clears stale temporary files before a new disk-backed download', async () => {
    const directory = await root.getDirectoryHandle(DOWNLOAD_CACHE_DIRECTORY, { create: true });
    await directory.getFileHandle(`${Date.now() - THIRTY_MINUTES - 1000}-stale`, { create: true });
    await directory.getFileHandle(`${Date.now()}-recent`, { create: true });
    globalThis.fetch = vi.fn(
      respondWith(await streamEncrypt(randomBytes(3000)))
    ) as unknown as typeof fetch;

    await downloadAndDecrypt('https://example.com/large.enc', { password, fileName: 'large.bin' });

    const names = [...directory.files.keys()];
    expect(names.some((name) => name.endsWith('-stale'))).toBe(false);
    expect(names.some((name) => name.endsWith('-recent'))).toBe(true);
    expect(names).toHaveLength(2);
  });

  describe('cleanupDownloadCache', () => {
    it('removes files older than the given age', async () => {
      const directory = await root.getDirectoryHandle(DOWNLOAD_CACHE_DIRECTORY, { create: true });
      await directory.getFileHandle(`${Date.now() - 5000}-old`, { create: true });
      await directory.getFileHandle(`${Date.now()}-new`, { create: true });

      await cleanupDownloadCache(1000);

      expect([...directory.files.keys()].map((name) => name.split('-')[1])).toEqual(['new']);
    });

    it('does not create the cache directory', async () => {
      await cleanupDownloadCache();
      expect(cache()).toBeUndefined();
    });

    it('never throws when OPFS is unavailable', async () => {
      vi.stubGlobal('navigator', {});
      await expect(cleanupDownloadCache()).resolves.toBeUndefined();
      getDirectory.mockRejectedValue(new Error('denied'));
      vi.stubGlobal('navigator', { storage: { getDirectory } });
      await expect(cleanupDownloadCache()).resolves.toBeUndefined();
    });
  });
});
