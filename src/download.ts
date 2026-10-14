/**
 * Download and decrypt functions for browser-file-crypto.
 *
 * @module download
 * @since 1.0.0
 */

import {
  ENCRYPTION_MARKER_KEYFILE_STREAM,
  ENCRYPTION_MARKER_PASSWORD_STREAM,
} from './constants';
import { CryptoError, toCryptoError } from './errors';
import type {
  DecryptOptions,
  DownloadDecryptOptions,
  DownloadDecryptStreamOptions,
  DownloadStorage,
  ProgressCallback,
  ProgressPhase,
  StreamProgress,
} from './types';
import { decryptFile } from './decrypt';
import { collectToDisk, isQuotaError } from './disk';
import { createDecryptStream, decryptFileStream, streamToBlob } from './stream';

/**
 * Downloads an encrypted file from URL, decrypts it, and saves to disk.
 *
 * @description
 * Combines file download, decryption, and save into a single operation.
 * Progress callback reports both download and decryption phases.
 *
 * Streaming-encrypted files (created by `encryptFileStream` or
 * `encryptFileAuto`) are decrypted while they download, so the ciphertext is
 * never buffered in memory, and the plaintext is assembled in a temporary
 * Origin Private File System file when available (see `storage`), so large
 * files do not have to fit in memory either. Single-shot encrypted files must
 * be decrypted as a whole and are buffered once.
 *
 * Phases:
 * 1. `downloading`: Fetching file from URL (0-50%; 0-95% for
 *    streaming-encrypted files, which decrypt while downloading)
 * 2. `deriving_key`: Key derivation (password mode only)
 * 3. `decrypting` (50-95%): AES-GCM decryption (single-shot files)
 * 4. `complete` (100%): File saved
 *
 * Note: This function uses browser APIs (fetch, URL.createObjectURL, document.createElement)
 * and will not work in Node.js environments.
 *
 * @param url - URL of the encrypted file to download
 * @param options - Options including password/keyData and fileName
 * @returns Promise that resolves when file is saved
 *
 * @throws {CryptoError} When download fails (DOWNLOAD_FAILED). The original
 *   network, stream or memory error is kept as `error.cause`.
 * @throws {CryptoError} When decryption fails (see decryptFile errors)
 *
 * @example
 * ```typescript
 * await downloadAndDecrypt('https://example.com/secret.enc', {
 *   password: 'my-secret',
 *   fileName: 'document.pdf',
 *   onProgress: ({ phase, progress }) => {
 *     console.log(`${phase}: ${progress}%`);
 *   }
 * });
 * ```
 *
 * @see {@link decryptFile} for decryption only
 * @since 1.0.0
 */
export async function downloadAndDecrypt(
  url: string,
  options: DownloadDecryptOptions
): Promise<void> {
  await withMemoryRetry(options.storage, (storage) =>
    downloadAndDecryptOnce(url, options, storage)
  );
}

/**
 * Downloads a streaming-encrypted file from URL, decrypts it, and saves to disk.
 *
 * @description
 * Memory-efficient version of downloadAndDecrypt for streaming-encrypted files.
 * The response body is decrypted chunk by chunk while it downloads, so the
 * ciphertext is never buffered.
 *
 * Phases:
 * 1. `downloading` (0-95%): Fetching and decrypting the file
 * 2. `deriving_key`: Key derivation (password mode only)
 * 3. `complete` (100%): File saved
 *
 * Note: This function uses browser APIs (fetch, URL.createObjectURL, document.createElement)
 * and will not work in Node.js environments.
 *
 * @param url - URL of the streaming-encrypted file to download
 * @param options - Options including password/keyData and fileName
 * @returns Promise that resolves when file is saved
 *
 * @throws {CryptoError} When download fails (DOWNLOAD_FAILED). The original
 *   network, stream or memory error is kept as `error.cause`.
 * @throws {CryptoError} When decryption fails (see decryptFileStream errors)
 *
 * @example
 * ```typescript
 * await downloadAndDecryptStream('https://example.com/large-file.enc', {
 *   password: 'my-secret',
 *   fileName: 'large-video.mp4',
 *   onProgress: ({ phase, progress }) => console.log(`${phase}: ${progress}%`)
 * });
 * ```
 *
 * @see {@link downloadAndDecrypt} for non-streaming files
 * @see {@link decryptFileStream} for decryption only
 * @since 1.1.0
 */
export async function downloadAndDecryptStream(
  url: string,
  options: DownloadDecryptStreamOptions
): Promise<void> {
  await withMemoryRetry(options.storage, (storage) =>
    downloadAndDecryptStreamOnce(url, options, storage)
  );
}

/**
 * Runs a download, retrying once in memory when disk-backed storage runs out
 * of quota mid-download (e.g. a small quota in an in-app browser). Wraps
 * unexpected failures in DOWNLOAD_FAILED, keeping the original as `cause`.
 *
 * @internal
 */
async function withMemoryRetry(
  requested: DownloadStorage | undefined,
  run: (storage: DownloadStorage) => Promise<void>
): Promise<void> {
  const storage = requested ?? 'auto';
  try {
    await run(storage);
  } catch (error) {
    if (storage === 'memory' || !isQuotaError(error)) {
      throw toCryptoError(error, 'DOWNLOAD_FAILED');
    }
    try {
      await run('memory');
    } catch (retryError) {
      throw toCryptoError(retryError, 'DOWNLOAD_FAILED');
    }
  }
}

/** @internal */
async function downloadAndDecryptOnce(
  url: string,
  options: DownloadDecryptOptions,
  storage: DownloadStorage
): Promise<void> {
  const { fileName, onProgress, password, keyData } = options;
  const decryptOptions = { password, keyData };
  const report = createReporter(onProgress);

  // Phase 1: Download file
  report('downloading', 0);

  const response = await fetchEncrypted(url);
  const totalBytes = readContentLength(response);
  let decrypted: Blob;

  if (response.body) {
    let downloadShare = 50;
    const source = await openBody(response.body, (receivedBytes) => {
      if (!totalBytes) return;
      const ratio = Math.min(receivedBytes / totalBytes, 1);
      report('downloading', Math.round(ratio * downloadShare));
    });

    if (source.streaming) {
      // Bytes are counted as they are replayed, so this applies from the first chunk.
      downloadShare = 95;
      // Decrypt while downloading: the ciphertext is never held in memory,
      // and the plaintext goes to disk when the browser allows it.
      decrypted = await collectDecrypted(
        source.stream.pipeThrough(
          createDecryptStream({
            ...decryptOptions,
            onProgress: (progress: StreamProgress) => {
              if (progress.phase === 'deriving_key') {
                report('deriving_key', report.last());
              }
            },
          })
        ),
        totalBytes,
        storage
      );
    } else {
      if (!totalBytes) report('downloading', 25);
      const encryptedData = await readAll(source.stream, totalBytes);
      report('downloading', 50);
      decrypted = await decryptWithProgress(encryptedData, decryptOptions, report);
    }
  } else {
    // Fallback: no body stream, no progress tracking
    report('downloading', 25);
    const encryptedData = await response.arrayBuffer();
    report('downloading', 50);
    decrypted = await decryptWithProgress(encryptedData, decryptOptions, report);
  }

  // Phase 4: Save file
  saveFile(decrypted, fileName);
  report('complete', 100);
}

/** @internal */
async function downloadAndDecryptStreamOnce(
  url: string,
  options: DownloadDecryptStreamOptions,
  storage: DownloadStorage
): Promise<void> {
  const { fileName, password, keyData, onProgress } = options;
  const state: { processedBytes: number; processedChunks: number; totalBytes?: number } = {
    processedBytes: 0,
    processedChunks: 0,
  };

  const report = createReporter((progress) => {
    onProgress?.({ ...progress, ...state });
  });

  const decryptOptions = {
    password,
    keyData,
    onProgress: (progress: StreamProgress): void => {
      state.processedBytes = progress.processedBytes;
      state.processedChunks = progress.processedChunks;
      if (progress.phase === 'deriving_key') {
        report('deriving_key', report.last());
      }
    },
  };

  report('downloading', 0);

  const response = await fetchEncrypted(url);
  const totalBytes = readContentLength(response);
  state.totalBytes = totalBytes;
  let decrypted: Blob;

  if (response.body) {
    const source = await openBody(response.body, (receivedBytes) => {
      if (!totalBytes) return;
      report('downloading', Math.round(Math.min(receivedBytes / totalBytes, 1) * 95));
    });
    if (!totalBytes) report('downloading', 25);
    decrypted = await collectDecrypted(
      source.stream.pipeThrough(createDecryptStream(decryptOptions)),
      totalBytes,
      storage
    );
  } else {
    report('downloading', 25);
    const encryptedBlob = await response.blob();
    decrypted = await collectDecrypted(
      decryptFileStream(encryptedBlob, decryptOptions),
      totalBytes ?? encryptedBlob.size,
      storage
    );
  }

  saveFile(decrypted, fileName);
  report('complete', 100);
}

/**
 * Assembles a decrypted stream on disk (OPFS) when allowed and available,
 * otherwise in memory.
 *
 * @internal
 */
function collectDecrypted(
  stream: ReadableStream<Uint8Array>,
  expectedBytes: number | undefined,
  storage: DownloadStorage
): Promise<Blob> {
  return storage === 'memory'
    ? streamToBlob(stream)
    : collectToDisk(stream, expectedBytes, streamToBlob);
}

/**
 * Fetches the URL and rejects non-2xx responses.
 *
 * @internal
 */
async function fetchEncrypted(url: string): Promise<Response> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new CryptoError(
      'DOWNLOAD_FAILED',
      `Download failed: ${response.status} ${response.statusText}`
    );
  }
  return response;
}

/**
 * Reads a positive Content-Length, if the server sent one.
 *
 * @internal
 */
function readContentLength(response: Response): number | undefined {
  const header = response.headers?.get('content-length');
  const length = header ? parseInt(header, 10) : NaN;
  return Number.isFinite(length) && length > 0 ? length : undefined;
}

/**
 * Peeks at the first bytes of the body to detect the encryption format and
 * returns a stream that replays them, reporting the received byte count.
 *
 * @internal
 */
async function openBody(
  body: ReadableStream<Uint8Array>,
  onReceived: (receivedBytes: number) => void
): Promise<{ streaming: boolean; stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  let receivedBytes = 0;

  // Skips empty reads so `pull` always enqueues or closes (an empty pull
  // would otherwise stall the stream).
  const readNonEmpty = async (): Promise<Uint8Array | undefined> => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return undefined;
      if (value && value.length > 0) return value;
    }
  };

  let pending = await readNonEmpty();
  const marker = pending?.[0];

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller): Promise<void> {
      const next = pending ?? (await readNonEmpty());
      pending = undefined;
      if (!next) {
        controller.close();
        return;
      }
      receivedBytes += next.length;
      onReceived(receivedBytes);
      controller.enqueue(next);
    },
    async cancel(reason): Promise<void> {
      await reader.cancel?.(reason);
    },
  });

  return {
    streaming:
      marker === ENCRYPTION_MARKER_PASSWORD_STREAM || marker === ENCRYPTION_MARKER_KEYFILE_STREAM,
    stream,
  };
}

/**
 * Reads a whole stream into one ArrayBuffer. When the size is known the
 * buffer is allocated once and filled in place, so the ciphertext is held a
 * single time instead of as a chunk list plus a combined copy.
 *
 * @internal
 */
async function readAll(
  stream: ReadableStream<Uint8Array>,
  expectedBytes: number | undefined
): Promise<ArrayBuffer> {
  const reader = stream.getReader();
  let buffer = new Uint8Array(expectedBytes ?? 0);
  let length = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (length + value.length > buffer.length) {
      const grown = new Uint8Array(Math.max(buffer.length * 2, length + value.length));
      grown.set(buffer.subarray(0, length));
      buffer = grown;
    }
    buffer.set(value, length);
    length += value.length;
  }

  const data = buffer.buffer;
  return length === buffer.length ? data : data.slice(0, length);
}

/** @internal */
type Reporter = ((phase: ProgressPhase, progress: number) => void) & {
  last: () => number;
};

/**
 * Wraps the progress callback so `downloading` percentages only move forward
 * and each value is emitted once, instead of once per network chunk (large
 * files arrive in many thousands of chunks).
 *
 * @internal
 */
function createReporter(onProgress: ProgressCallback | undefined): Reporter {
  let lastProgress = 0;
  let lastDownloading = -1;

  const report = ((phase: ProgressPhase, progress: number): void => {
    if (phase === 'downloading') {
      if (progress <= lastDownloading) return;
      lastDownloading = progress;
    }
    lastProgress = progress;
    onProgress?.({ phase, progress });
  }) as Reporter;
  report.last = (): number => lastProgress;
  return report;
}

/**
 * Decrypts a fully downloaded file, mapping decryption progress to 50-95%.
 *
 * @internal
 */
async function decryptWithProgress(
  encryptedData: ArrayBuffer,
  decryptOptions: Omit<DecryptOptions, 'onProgress'>,
  report: Reporter
): Promise<Blob> {
  return decryptFile(encryptedData, {
    ...decryptOptions,
    onProgress: (progress) => {
      if (progress.phase === 'complete') return;
      report(progress.phase, 50 + Math.round(progress.progress * 0.45));
    },
  });
}

/** @internal */
const OBJECT_URL_REVOKE_DELAY_MS = 40_000;

/**
 * Saves a Blob as a file download.
 *
 * @description
 * The object URL is revoked after a delay: revoking it in the same task as
 * `click()` can cancel the save in Safari and Firefox, especially for large
 * blobs.
 *
 * @internal
 */
function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS);
}
