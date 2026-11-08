import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, hmacHex, newAccessCode, newEditToken, parseKeyRing } from '../src/crypto.js';

const ring = () =>
  parseKeyRing({ DATA_KEY_V1: randomBytes(32).toString('base64'), DATA_KEY_V2: randomBytes(32).toString('base64'), DATA_KEY_CURRENT: '2' });

describe('enkripsi AES-256-GCM', () => {
  it('bolak-balik, dan blob tidak memuat teks asli', () => {
    const r = ring();
    const { blob, keyVersion } = encrypt(r, 'ctx', Buffer.from('nama-rahasia'));
    expect(keyVersion).toBe(2);
    expect(blob.includes(Buffer.from('nama-rahasia'))).toBe(false);
    expect(decrypt(r, 'ctx', keyVersion, blob).toString()).toBe('nama-rahasia');
  });
  it('IV acak: teks sama menghasilkan blob berbeda', () => {
    const r = ring();
    expect(encrypt(r, 'c', Buffer.from('x')).blob.equals(encrypt(r, 'c', Buffer.from('x')).blob)).toBe(false);
  });
  it('konteks berbeda ditolak (blob tidak bisa ditukar antar kolom)', () => {
    const r = ring();
    const { blob, keyVersion } = encrypt(r, 'submission:intake', Buffer.from('x'));
    expect(() => decrypt(r, 'submission:answers', keyVersion, blob)).toThrow();
  });
  it('blob yang diubah satu bit ditolak', () => {
    const r = ring();
    const { blob, keyVersion } = encrypt(r, 'c', Buffer.from('isi'));
    blob[blob.length - 1] = (blob[blob.length - 1] as number) ^ 1;
    expect(() => decrypt(r, 'c', keyVersion, blob)).toThrow();
  });
  it('kunci versi lama masih bisa membuka blob lama setelah rotasi', () => {
    const k1 = randomBytes(32).toString('base64');
    const old = parseKeyRing({ DATA_KEY_V1: k1, DATA_KEY_CURRENT: '1' });
    const { blob } = encrypt(old, 'c', Buffer.from('lama'));
    const rotated = parseKeyRing({ DATA_KEY_V1: k1, DATA_KEY_V2: randomBytes(32).toString('base64'), DATA_KEY_CURRENT: '2' });
    expect(decrypt(rotated, 'c', 1, blob).toString()).toBe('lama');
  });
  it('versi kunci yang tidak ada ditolak', () => {
    const r = ring();
    const { blob } = encrypt(r, 'c', Buffer.from('x'));
    expect(() => decrypt(r, 'c', 9, blob)).toThrow(/tidak tersedia/);
  });
  it('konfigurasi kunci salah ditolak', () => {
    expect(() => parseKeyRing({ DATA_KEY_V1: 'pendek', DATA_KEY_CURRENT: '1' })).toThrow(/32 byte/);
    expect(() => parseKeyRing({ DATA_KEY_V1: randomBytes(32).toString('base64'), DATA_KEY_CURRENT: '3' })).toThrow(/DATA_KEY_CURRENT/);
    expect(() => parseKeyRing({})).toThrow();
  });
});

describe('hash, token, kode', () => {
  it('HMAC bergantung pada pepper dan label', () => {
    const p = randomBytes(32);
    expect(hmacHex(p, 'edit-token', 'abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacHex(p, 'edit-token', 'abc')).toBe(hmacHex(p, 'edit-token', 'abc'));
    expect(hmacHex(p, 'edit-token', 'abc')).not.toBe(hmacHex(p, 'access-code', 'abc'));
    expect(hmacHex(p, 'edit-token', 'abc')).not.toBe(hmacHex(randomBytes(32), 'edit-token', 'abc'));
  });
  it('token edit 43 karakter base64url dan unik', () => {
    const tokens = new Set(Array.from({ length: 200 }, newEditToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it('kode akses 8 karakter tanpa I/O/0/1', () => {
    for (let i = 0; i < 500; i++) expect(newAccessCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });
});
