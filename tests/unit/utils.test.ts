import { describe, it, expect } from 'vitest';
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateRandomPassword,
} from '../../src/utils';
import {
  SALT_LENGTH,
  IV_LENGTH,
} from '../../src/constants';

describe('arrayBufferToBase64', () => {
  it('should convert empty buffer to empty string', () => {
    const buffer = new ArrayBuffer(0);
    expect(arrayBufferToBase64(buffer)).toBe('');
  });

  it('should convert buffer to valid base64', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const base64 = arrayBufferToBase64(bytes.buffer);
    expect(base64).toBe('SGVsbG8=');
  });

  it('should handle binary data correctly', () => {
    const bytes = new Uint8Array([0, 127, 128, 255]);
    const base64 = arrayBufferToBase64(bytes.buffer);
    expect(base64).toBe('AH+A/w==');
  });
});

describe('base64ToArrayBuffer', () => {
  it('should convert empty string to empty buffer', () => {
    const buffer = base64ToArrayBuffer('');
    expect(buffer.byteLength).toBe(0);
  });

  it('should convert valid base64 to buffer', () => {
    const buffer = base64ToArrayBuffer('SGVsbG8=');
    const bytes = new Uint8Array(buffer);
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  it('should handle binary data correctly', () => {
    const buffer = base64ToArrayBuffer('AH+A/w==');
    const bytes = new Uint8Array(buffer);
    expect(Array.from(bytes)).toEqual([0, 127, 128, 255]);
  });

  it('should throw on invalid base64', () => {
    expect(() => base64ToArrayBuffer('not-valid-base64!!!')).toThrow();
  });
});

describe('base64 roundtrip', () => {
  it('should roundtrip random data', () => {
    const original = crypto.getRandomValues(new Uint8Array(100));
    const base64 = arrayBufferToBase64(original.buffer);
    const restored = new Uint8Array(base64ToArrayBuffer(base64));
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('should roundtrip salt-sized data', () => {
    const original = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const base64 = arrayBufferToBase64(original.buffer);
    const restored = new Uint8Array(base64ToArrayBuffer(base64));
    expect(restored.length).toBe(SALT_LENGTH);
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('should roundtrip IV-sized data', () => {
    const original = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const base64 = arrayBufferToBase64(original.buffer);
    const restored = new Uint8Array(base64ToArrayBuffer(base64));
    expect(restored.length).toBe(IV_LENGTH);
    expect(Array.from(restored)).toEqual(Array.from(original));
  });
});

describe('generateRandomPassword', () => {
  it('should generate password with default length of 16', () => {
    const password = generateRandomPassword();
    expect(password.length).toBe(16);
  });

  it('should generate password with specified length', () => {
    const password = generateRandomPassword(24);
    expect(password.length).toBe(24);
  });

  it('should enforce minimum length of 8', () => {
    const password = generateRandomPassword(4);
    expect(password.length).toBe(8);
  });

  it('should enforce maximum length of 128', () => {
    const password = generateRandomPassword(200);
    expect(password.length).toBe(128);
  });

  it('should generate unique passwords', () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 100; i++) {
      passwords.add(generateRandomPassword());
    }
    expect(passwords.size).toBe(100);
  });

  it('should only contain valid characters', () => {
    const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    const password = generateRandomPassword(100);
    for (const char of password) {
      expect(validChars).toContain(char);
    }
  });
});
