/**
 * Vitest setup file for Node.js environment.
 * Provides browser-like globals using Node.js built-in modules.
 */

import { webcrypto } from 'node:crypto';
import { Blob, File } from 'node:buffer';
import { TextEncoder, TextDecoder } from 'node:util';

// Setup global crypto
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as Crypto;
}

// Setup global Blob and File
if (!globalThis.Blob) {
  globalThis.Blob = Blob as unknown as typeof globalThis.Blob;
}

if (!globalThis.File) {
  globalThis.File = File as unknown as typeof globalThis.File;
}

// Setup TextEncoder/TextDecoder
if (!globalThis.TextEncoder) {
  globalThis.TextEncoder = TextEncoder;
}

if (!globalThis.TextDecoder) {
  globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}
