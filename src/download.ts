/**
 * Download and decrypt functions for browser-file-crypto.
 *
 * @module download
 * @since 1.0.0
 */

import { CryptoError } from './errors';
import type { DownloadDecryptOptions } from './types';
import { decryptFile } from './decrypt';

/**
 * Downloads an encrypted file from URL, decrypts it, and saves to disk.
 *
 * @description
 * Combines file download, decryption, and save into a single operation.
 * Progress callback reports both download and decryption phases.
 *
 * Phases:
 * 1. `downloading` (0-50%): Fetching file from URL
 * 2. `deriving_key` (50-60%): Key derivation (password mode only)
 * 3. `decrypting` (60-95%): AES-GCM decryption
 * 4. `complete` (100%): File saved
 *
 * Note: This function uses browser APIs (fetch, URL.createObjectURL, document.createElement)
 * and will not work in Node.js environments.
 *
 * @param url - URL of the encrypted file to download
 * @param options - Options including password/keyData and fileName
 * @returns Promise that resolves when file is saved
 *
 * @throws {CryptoError} When download fails (DOWNLOAD_FAILED)
 * @throws {CryptoError} When decryption fails (see decryptFile errors)
 *
 * @example
 * ```typescript
 * await downloadAndDecrypt('https://example.com/secret.enc', {
 *   password: 'my-secret',
 *   fileName: 'document.pdf',
 *   onProgress: ({ phase, progress }) => {
 *     console.log(`${phase}: ${progress}%`);
 *     // downloading: 25%
 *     // downloading: 50%
 *     // deriving_key: 55%
 *     // decrypting: 80%
 *     // complete: 100%
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
  const { fileName, onProgress, ...decryptOptions } = options;

  try {
    // Phase 1: Download file
    onProgress?.({ phase: 'downloading', progress: 0 });

    const response = await fetch(url);

    if (!response.ok) {
      throw new CryptoError(
        'DOWNLOAD_FAILED',
        `Download failed: ${response.status} ${response.statusText}`
      );
    }

    // Track download progress if content-length is available
    const contentLength = response.headers.get('content-length');
    let encryptedData: ArrayBuffer;

    if (contentLength && response.body) {
      encryptedData = await downloadWithProgress(
        response.body,
        parseInt(contentLength, 10),
        (downloadProgress) => {
          // Map download progress to 0-50%
          onProgress?.({ phase: 'downloading', progress: Math.round(downloadProgress * 50) });
        }
      );
    } else {
      // Fallback: no progress tracking
      onProgress?.({ phase: 'downloading', progress: 25 });
      encryptedData = await response.arrayBuffer();
    }

    onProgress?.({ phase: 'downloading', progress: 50 });

    // Phase 2 & 3: Decrypt with progress mapping
    const decrypted = await decryptFile(encryptedData, {
      ...decryptOptions,
      onProgress: (progress) => {
        // Map decryption progress (0-100) to (50-95)
        const mappedProgress = 50 + Math.round(progress.progress * 0.45);
        onProgress?.({
          phase: progress.phase === 'complete' ? 'complete' : progress.phase,
          progress: progress.phase === 'complete' ? 100 : mappedProgress,
        });
      },
    });

    // Phase 4: Save file
    saveFile(decrypted, fileName);
    onProgress?.({ phase: 'complete', progress: 100 });
  } catch (error) {
    if (error instanceof CryptoError) {
      throw error;
    }
    throw new CryptoError('DOWNLOAD_FAILED');
  }
}

/**
 * Downloads with progress tracking using ReadableStream.
 *
 * @internal
 */
async function downloadWithProgress(
  body: ReadableStream<Uint8Array>,
  contentLength: number,
  onProgress: (progress: number) => void
): Promise<ArrayBuffer> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedLength = 0;
  let done = false;

  while (!done) {
    const result = await reader.read();
    done = result.done;

    if (result.value) {
      chunks.push(result.value);
      receivedLength += result.value.length;

      const progress = receivedLength / contentLength;
      onProgress(Math.min(progress, 1));
    }
  }

  // Combine chunks into single ArrayBuffer
  const result = new Uint8Array(receivedLength);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }

  return result.buffer;
}

/**
 * Saves a Blob as a file download.
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

  URL.revokeObjectURL(url);
}
