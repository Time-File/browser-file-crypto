/**
 * Disk-backed storage for decrypted downloads.
 *
 * @description
 * `Response#blob()` keeps the whole result in memory in WebKit (Safari, every
 * iOS browser and in-app browsers), so decrypting a multi-gigabyte download
 * can exhaust the tab's memory. When the Origin Private File System (OPFS) is
 * available, the decrypted stream is written to a temporary OPFS file instead
 * and the disk-backed `File` is handed to the browser for saving.
 *
 * - `FileSystemFileHandle#createWritable()` is used where available
 *   (Chromium 86+, Firefox 111+, Safari 26+).
 * - Older Safari (15.2-18) only allows writing through
 *   `createSyncAccessHandle()` in a dedicated worker, which is started from an
 *   inline script.
 * - Anything else (no OPFS, private browsing, too little quota, a CSP that
 *   blocks blob: workers) falls back to an in-memory Blob.
 *
 * Temporary files are removed 30 minutes after the save. Files left behind by
 * closed tabs are cleared before each disk-backed download and by
 * {@link cleanupDownloadCache}. A file is never cleared while the page that
 * created it holds its Web Lock (from creation until its own removal), and
 * its age is measured from its last write, not its creation, so a download
 * that took longer than 30 minutes is not removed while it is being saved.
 *
 * @module disk
 * @since 1.3.0
 */

/** OPFS directory holding temporary decrypted downloads. */
export const DOWNLOAD_CACHE_DIRECTORY = 'browser-file-crypto-downloads';

/** Time a saved file stays in OPFS so the browser can finish reading it. */
const KEEP_AFTER_SAVE_MS = 30 * 60 * 1000;

/**
 * Prefix of the Web Lock held for each temporary file while its page can
 * still use it. Other pages skip locked files when clearing the cache.
 */
const LOCK_PREFIX = `${DOWNLOAD_CACHE_DIRECTORY}:`;

/** Bytes buffered before a worker write, to limit postMessage round trips. */
const WORKER_BATCH_BYTES = 4 * 1024 * 1024;

/** Time allowed for the worker to open the file before giving up on it. */
const WORKER_OPEN_TIMEOUT_MS = 10_000;

/** Delays for re-removing a discarded file (see `discard`). */
const DISCARD_RECHECK_DELAYS_MS = [1_000, 5_000, 30_000];

/** Attempts and base delay for removing a temporary file. */
const REMOVE_ATTEMPTS = 5;
const REMOVE_RETRY_DELAY_MS = 100;

/** Free space kept in reserve beyond the expected file size. */
const QUOTA_MARGIN_BYTES = 16 * 1024 * 1024;

/**
 * A temporary OPFS file being written.
 *
 * @internal
 */
export interface DiskTarget {
  /** Destination for the decrypted bytes. Closing it completes the file. */
  writable: WritableStream<Uint8Array>;
  /** Returns the completed, disk-backed file and schedules its removal. */
  finish(): Promise<File>;
  /** Removes the temporary file after a failure. */
  discard(): Promise<void>;
}

/**
 * Removes temporary download files left behind by closed tabs.
 *
 * @description
 * Disk-backed downloads keep their temporary OPFS file for 30 minutes after
 * saving so the browser can finish reading it. Call this on page load to
 * reclaim space left behind by tabs that were closed in the meantime.
 *
 * A file is removed only when it was last written at least `maxAgeMs` ago and
 * no open page is still using it (checked with Web Locks where available).
 * Never throws.
 *
 * @param maxAgeMs - Minimum time since a file was last written (default: 30 minutes)
 *
 * @example
 * ```typescript
 * void cleanupDownloadCache();
 * ```
 *
 * @since 1.3.0
 */
export async function cleanupDownloadCache(maxAgeMs: number = KEEP_AFTER_SAVE_MS): Promise<void> {
  try {
    const root = await getStorageRoot();
    if (!root) return;
    const directory = await root.getDirectoryHandle(DOWNLOAD_CACHE_DIRECTORY);
    await removeStaleEntries(directory, maxAgeMs);
  } catch {
    // No cache directory yet, or OPFS is unavailable: nothing to clean.
  }
}

/**
 * Opens a temporary OPFS file for a decrypted download, or returns null when
 * disk-backed storage cannot be used and the caller should buffer in memory.
 *
 * @internal
 */
export async function openDiskTarget(expectedBytes?: number): Promise<DiskTarget | null> {
  let directory: FileSystemDirectoryHandle;
  try {
    const root = await getStorageRoot();
    if (!root || !(await hasRoomFor(expectedBytes))) return null;
    directory = await root.getDirectoryHandle(DOWNLOAD_CACHE_DIRECTORY, { create: true });
    await removeStaleEntries(directory, KEEP_AFTER_SAVE_MS);
  } catch {
    return null;
  }

  const name = `${Date.now()}-${randomSuffix()}`;
  // Taken before the file exists so no other page can see it unlocked.
  const releaseLock = await holdLock(name);
  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await directory.getFileHandle(name, { create: true });
  } catch {
    releaseLock();
    return null;
  }

  const remove = async (): Promise<void> => {
    try {
      await removeWithRetry(directory, name);
    } finally {
      releaseLock();
    }
  };

  const target =
    (await openWritableTarget(fileHandle)) ?? (await openWorkerTarget(name));
  if (!target) {
    await remove();
    return null;
  }

  return {
    writable: target.writable,
    async finish(): Promise<File> {
      const file = await fileHandle.getFile();
      setTimeout(() => void remove(), KEEP_AFTER_SAVE_MS);
      return file;
    },
    async discard(): Promise<void> {
      await target.release();
      await remove();
      // WebKit can still complete queued writes of an aborted writable after
      // the entry was removed, recreating a partial file. Remove it again
      // once those have drained.
      for (const delay of DISCARD_RECHECK_DELAYS_MS) {
        setTimeout(() => void remove(), delay);
      }
    },
  };
}

/**
 * Writes a decrypted stream to disk when possible and returns the result as a
 * Blob (a disk-backed File, or an in-memory Blob as a fallback).
 *
 * @internal
 */
export async function collectToDisk(
  stream: ReadableStream<Uint8Array>,
  expectedBytes: number | undefined,
  toBlob: (stream: ReadableStream<Uint8Array>) => Promise<Blob>
): Promise<Blob> {
  const target = await openDiskTarget(expectedBytes);
  if (!target) return toBlob(stream);

  try {
    // pipeTo rejects with the source's own error (network drop, wrong
    // password) or the destination's (quota), and closes the file on success.
    await stream.pipeTo(target.writable);
    return await target.finish();
  } catch (error) {
    await target.discard();
    throw error;
  }
}

/**
 * True for storage quota failures, which are retried in memory.
 *
 * @internal
 */
export function isQuotaError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: unknown }).name === 'QuotaExceededError'
  );
}

// =============================================================================
// Internal helpers
// =============================================================================

interface OpenTarget {
  writable: WritableStream<Uint8Array>;
  /** Releases the file lock after a failure so it can be removed. */
  release(): Promise<void>;
}

async function getStorageRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') {
    return null;
  }
  return navigator.storage.getDirectory();
}

async function hasRoomFor(expectedBytes: number | undefined): Promise<boolean> {
  if (!expectedBytes || typeof navigator.storage.estimate !== 'function') return true;
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (quota === undefined || usage === undefined) return true;
    return quota - usage >= expectedBytes + QUOTA_MARGIN_BYTES;
  } catch {
    return true;
  }
}

/**
 * Removes temporary files that no open page is using and that were last
 * written at least `maxAgeMs` ago.
 *
 * The age is taken from the file's last write (`File#lastModified`, updated
 * when a download completes), not from the creation time in its name: a
 * download that took longer than `maxAgeMs` must not be removed while the
 * browser is still saving it.
 */
async function removeStaleEntries(
  directory: FileSystemDirectoryHandle,
  maxAgeMs: number
): Promise<void> {
  const iterable = directory as unknown as { keys?: () => AsyncIterable<string> };
  if (typeof iterable.keys !== 'function') return;
  const candidates: string[] = [];
  for await (const name of iterable.keys()) {
    const createdAt = parseInt(name.split('-')[0] ?? '', 10);
    // The last write is never earlier than the creation, so recent files are skipped cheaply.
    if (Number.isFinite(createdAt) && Date.now() - createdAt >= maxAgeMs) {
      candidates.push(name);
    }
  }
  await Promise.all(
    candidates.map((name) =>
      ifUnlocked(name, async () => {
        const createdAt = parseInt(name.split('-')[0] ?? '', 10);
        const file = await (await directory.getFileHandle(name)).getFile();
        const lastWrite = Math.max(createdAt, file.lastModified || 0);
        if (Date.now() - lastWrite >= maxAgeMs) {
          await directory.removeEntry(name);
        }
      }).catch(() => undefined)
    )
  );
}

interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => unknown
  ): Promise<unknown>;
}

function lockManager(): LockManagerLike | null {
  try {
    const locks =
      typeof navigator === 'undefined'
        ? undefined
        : (navigator as unknown as { locks?: LockManagerLike }).locks;
    return typeof locks?.request === 'function' ? locks : null;
  } catch {
    return null;
  }
}

/**
 * Holds the Web Lock of a temporary file until the returned function is
 * called (or the page goes away). Returns a no-op when Web Locks are
 * unavailable, in which case other pages rely on the file's age alone.
 */
async function holdLock(name: string): Promise<() => void> {
  const noop = (): void => undefined;
  return new Promise((resolve) => {
    try {
      const locks = lockManager();
      if (!locks) {
        resolve(noop);
        return;
      }
      let release: () => void = noop;
      locks
        .request(LOCK_PREFIX + name, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(noop);
            return undefined;
          }
          return new Promise<void>((done) => {
            release = done;
            resolve(() => release());
          });
        })
        .catch(() => resolve(noop));
    } catch {
      // Some sandboxed contexts throw instead of rejecting; go on without a lock.
      resolve(noop);
    }
  });
}

/**
 * Runs `action` only if no page holds the file's Web Lock, keeping the lock
 * for the duration so the check and the action cannot interleave with a
 * page that is about to use it.
 */
async function ifUnlocked(name: string, action: () => Promise<void>): Promise<void> {
  const locks = lockManager();
  if (!locks) {
    await action();
    return;
  }
  let granted = false;
  try {
    await locks.request(LOCK_PREFIX + name, { ifAvailable: true }, async (lock) => {
      granted = true;
      if (lock) await action();
    });
  } catch (error) {
    if (granted) throw error;
    // Web Locks refused the request: fall back to the file's age alone.
    await action();
  }
}

/**
 * Removes an entry, retrying briefly: WebKit can release a closed sync access
 * handle's lock asynchronously, so an immediate removal may still be refused.
 * Whatever remains is cleared by the stale-entry sweep later.
 */
async function removeWithRetry(directory: FileSystemDirectoryHandle, name: string): Promise<void> {
  for (let attempt = 0; attempt < REMOVE_ATTEMPTS; attempt++) {
    try {
      await directory.removeEntry(name);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return;
      await new Promise((resolve) => setTimeout(resolve, REMOVE_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
}

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function openWritableTarget(fileHandle: FileSystemFileHandle): Promise<OpenTarget | null> {
  if (typeof fileHandle.createWritable !== 'function') return null;
  try {
    const writable = await fileHandle.createWritable();
    return {
      // FileSystemWritableFileStream accepts Uint8Array chunks.
      writable: writable as unknown as WritableStream<Uint8Array>,
      async release(): Promise<void> {
        // Discards the uncommitted data; a no-op once the pipe already aborted it.
        await writable.abort().catch(() => undefined);
      },
    };
  } catch {
    return null;
  }
}

/**
 * Source of the worker that writes through a synchronous access handle.
 * Handle methods other than write() were asynchronous before Safari 17, so
 * every call is awaited.
 */
const WORKER_SOURCE = `
let handle = null;
let offset = 0;
self.onmessage = async (event) => {
  const message = event.data;
  try {
    if (message.type === 'open') {
      const root = await navigator.storage.getDirectory();
      const directory = await root.getDirectoryHandle(message.directory);
      const file = await directory.getFileHandle(message.name);
      handle = await file.createSyncAccessHandle();
      self.postMessage({ type: 'ok' });
    } else if (message.type === 'write') {
      const data = new Uint8Array(message.buffer);
      let written = 0;
      while (written < data.length) {
        const count = handle.write(data.subarray(written), { at: offset + written });
        if (!count) throw new Error('Write made no progress');
        written += count;
      }
      offset += data.length;
      self.postMessage({ type: 'ok' });
    } else if (message.type === 'close') {
      if (handle) {
        await handle.flush();
        await handle.close();
        handle = null;
      }
      self.postMessage({ type: 'ok' });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      name: (error && error.name) || 'Error',
      message: (error && error.message) || String(error),
    });
  }
};
`;

async function openWorkerTarget(name: string): Promise<OpenTarget | null> {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return null;

  let worker: Worker;
  try {
    const source = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
    try {
      worker = new Worker(source);
    } finally {
      URL.revokeObjectURL(source);
    }
  } catch {
    return null;
  }

  // The protocol is strictly request/response: WritableStream never issues
  // a write before the previous one has resolved.
  const call = (message: object, transfer: Transferable[] = []): Promise<void> =>
    new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ type: string; name?: string; message?: string }>): void => {
        if (event.data.type === 'ok') {
          resolve();
        } else {
          const error = new Error(event.data.message ?? 'Disk write failed');
          error.name = event.data.name ?? 'Error';
          reject(error);
        }
      };
      worker.onerror = (event): void => {
        event.preventDefault();
        reject(new Error(event.message || 'Disk worker failed'));
      };
      worker.postMessage(message, transfer);
    });

  try {
    await withTimeout(
      call({ type: 'open', directory: DOWNLOAD_CACHE_DIRECTORY, name }),
      WORKER_OPEN_TIMEOUT_MS
    );
  } catch {
    worker.terminate();
    return null;
  }

  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let terminated = false;
  let busy: Promise<void> = Promise.resolve();

  const flush = async (): Promise<void> => {
    if (pendingBytes === 0) return;
    const batch = new Uint8Array(pendingBytes);
    let position = 0;
    for (const chunk of pending) {
      batch.set(chunk, position);
      position += chunk.length;
    }
    pending = [];
    pendingBytes = 0;
    busy = call({ type: 'write', buffer: batch.buffer }, [batch.buffer]);
    await busy;
  };

  // Closes the access handle (releasing its lock so the file can be removed)
  // and stops the worker. Safe to call more than once.
  const shutdown = async (): Promise<void> => {
    if (terminated) return;
    terminated = true;
    try {
      await busy.catch(() => undefined);
      await withTimeout(call({ type: 'close' }), WORKER_OPEN_TIMEOUT_MS);
    } catch {
      // The worker is terminated below regardless.
    } finally {
      worker.terminate();
    }
  };

  const writable = new WritableStream<Uint8Array>({
    async write(chunk): Promise<void> {
      pending.push(chunk);
      pendingBytes += chunk.length;
      if (pendingBytes >= WORKER_BATCH_BYTES) await flush();
    },
    async close(): Promise<void> {
      try {
        await flush();
        await call({ type: 'close' });
      } finally {
        terminated = true;
        worker.terminate();
      }
    },
    async abort(): Promise<void> {
      pending = [];
      pendingBytes = 0;
      await shutdown();
    },
  });

  return { writable, release: shutdown };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}
