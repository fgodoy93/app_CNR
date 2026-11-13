import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/terreno_cnr';
  process.env.JWT_SECRET ??= 'test_jwt_secret_key_that_is_at_least_32_chars_long';
  process.env.APP_ENCRYPTION_KEY ??= '12345678901234567890123456789012';
});

import { decryptBuffer, decryptString, encryptBuffer, encryptString, hmacSha256, safeEqual, sha256, verificationCode } from '../src/lib/crypto';
import { parseApiKey } from '../src/plugins/auth';

describe('crypto & security helpers', () => {
  it('encrypts and decrypts buffers with AES-256-GCM', () => {
    const plain = Buffer.from('evidencia-confidencial-cnr');
    const enc = encryptBuffer(plain);
    expect(enc.equals(plain)).toBe(false);
    expect(decryptBuffer(enc).equals(plain)).toBe(true);
  });

  it('encrypts and decrypts strings', () => {
    const secret = 'whsec_test_123456';
    const enc = encryptString(secret);
    expect(enc).not.toBe(secret);
    expect(decryptString(enc)).toBe(secret);
  });

  it('generates valid verification codes and HMAC signatures', () => {
    const code = verificationCode();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const sig = hmacSha256('my-secret', '{"ok":true}');
    expect(safeEqual(sig, hmacSha256('my-secret', '{"ok":true}'))).toBe(true);
    expect(safeEqual(sig, sha256('other'))).toBe(false);
  });

  it('parses API keys with tc_ prefix', () => {
    const valid = parseApiKey('tc_abcd1234_abcdefghijklmnopqrstuv');
    expect(valid?.prefix).toBe('abcd1234');
    expect(parseApiKey('invalid_key')).toBeNull();
  });
});
