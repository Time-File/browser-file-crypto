import { describe, it, expect } from 'vitest';
import { CryptoError, isCryptoError } from '../../src/errors';

describe('CryptoError', () => {
  describe('constructor', () => {
    it('should create error with default message', () => {
      const error = new CryptoError('INVALID_PASSWORD');

      expect(error.code).toBe('INVALID_PASSWORD');
      expect(error.message).toBe('Decryption failed: incorrect password.');
      expect(error.name).toBe('CryptoError');
    });

    it('should create error with custom message', () => {
      const error = new CryptoError('INVALID_PASSWORD', 'Custom message');

      expect(error.code).toBe('INVALID_PASSWORD');
      expect(error.message).toBe('Custom message');
    });

    it('should be instanceof Error', () => {
      const error = new CryptoError('INVALID_INPUT');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(CryptoError);
    });

    it('should have stack trace', () => {
      const error = new CryptoError('ENCRYPTION_FAILED');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('CryptoError');
    });
  });

  describe('error codes', () => {
    it('should support all error codes', () => {
      const codes = [
        'INVALID_INPUT',
        'PASSWORD_REQUIRED',
        'KEYFILE_REQUIRED',
        'INVALID_PASSWORD',
        'INVALID_KEYFILE',
        'INVALID_ENCRYPTED_DATA',
        'ENCRYPTION_FAILED',
        'DECRYPTION_FAILED',
        'DOWNLOAD_FAILED',
        'UNSUPPORTED_FORMAT',
      ] as const;

      for (const code of codes) {
        const error = new CryptoError(code);
        expect(error.code).toBe(code);
        expect(error.message.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('isCryptoError', () => {
  it('should return true for CryptoError', () => {
    const error = new CryptoError('INVALID_PASSWORD');
    expect(isCryptoError(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('Regular error');
    expect(isCryptoError(error)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isCryptoError(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isCryptoError(undefined)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isCryptoError('error')).toBe(false);
  });

  it('should return false for plain object', () => {
    expect(isCryptoError({ code: 'INVALID_PASSWORD', message: 'test' })).toBe(false);
  });
});
