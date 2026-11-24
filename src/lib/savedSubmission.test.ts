import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, clearSaved, daysLeft, loadSaved, parseSaved, writeSaved } from '@/lib/savedSubmission';

const ID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'k'.repeat(43);
const NOW = new Date('2026-11-09T00:00:00Z');

function fakeStorage(initial: Record<string, string> = {}, failWrites = false) {
  const data = { ...initial };
  const storage = {
    data,
    getItem: (k: string) => (k in data ? (data[k] as string) : null),
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error('QuotaExceeded');
      data[k] = v;
    },
    removeItem: (k: string) => void delete data[k],
  };
  vi.stubGlobal('window', { localStorage: storage });
  return storage;
}
afterEach(() => vi.unstubAllGlobals());

describe('parseSaved', () => {
  it('menerima data sah', () => {
    expect(parseSaved(JSON.stringify({ id: ID, editToken: TOKEN, expiresAt: '2026-11-15T00:00:00Z' }), NOW)).toEqual({ id: ID, editToken: TOKEN, expiresAt: '2026-11-15T00:00:00Z' });
  });
  it('menolak yang kedaluwarsa, bentuk salah, atau JSON rusak', () => {
    expect(parseSaved(JSON.stringify({ id: ID, editToken: TOKEN, expiresAt: '2026-11-01T00:00:00Z' }), NOW)).toBeNull();
    expect(parseSaved(JSON.stringify({ id: 'bukan-uuid', editToken: TOKEN, expiresAt: null }), NOW)).toBeNull();
    expect(parseSaved(JSON.stringify({ id: ID, editToken: 'pendek', expiresAt: null }), NOW)).toBeNull();
    expect(parseSaved('{rusak', NOW)).toBeNull();
    expect(parseSaved(null, NOW)).toBeNull();
  });
  it('membuang kolom tambahan (tidak mengembalikan jawaban/nama bila ada yang menyusup)', () => {
    const parsed = parseSaved(JSON.stringify({ id: ID, editToken: TOKEN, expiresAt: null, name: 'Budi', answers: { 'PL-01': 1 } }), NOW);
    expect(Object.keys(parsed as object).sort()).toEqual(['editToken', 'expiresAt', 'id']);
  });
});

describe('penyimpanan lokal', () => {
  it('hanya menulis id, token, dan waktu berakhir', () => {
    const storage = fakeStorage();
    expect(writeSaved({ id: ID, editToken: TOKEN, expiresAt: null, ...({ name: 'Budi', answers: { a: 1 } } as object) } as never)).toBe(true);
    const stored = JSON.parse(storage.data[STORAGE_KEY] as string);
    expect(Object.keys(stored).sort()).toEqual(['editToken', 'expiresAt', 'id']);
    expect(storage.data[STORAGE_KEY]).not.toContain('Budi');
  });
  it('gagal menulis (mode privat/penuh) mengembalikan false tanpa melempar', () => {
    fakeStorage({}, true);
    expect(writeSaved({ id: ID, editToken: TOKEN, expiresAt: null })).toBe(false);
  });
  it('penyimpanan tidak tersedia sama sekali tidak melempar', () => {
    vi.stubGlobal('window', { get localStorage(): never { throw new Error('SecurityError'); } });
    expect(loadSaved()).toBeNull();
    expect(writeSaved({ id: ID, editToken: TOKEN, expiresAt: null })).toBe(false);
    expect(() => clearSaved()).not.toThrow();
  });
  it('loadSaved membersihkan entri rusak/kedaluwarsa', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify({ id: 'x', editToken: 'y', expiresAt: null }) });
    expect(loadSaved()).toBeNull();
    expect(STORAGE_KEY in storage.data).toBe(false);
  });
  it('clearSaved menghapus', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: 'x' });
    clearSaved();
    expect(STORAGE_KEY in storage.data).toBe(false);
  });
});

describe('daysLeft', () => {
  it('membulatkan ke atas, 0 bila lewat, null bila tidak ada', () => {
    expect(daysLeft('2026-11-15T12:00:00Z', NOW)).toBe(7);
    expect(daysLeft('2026-11-09T00:00:01Z', NOW)).toBe(1);
    expect(daysLeft('2026-11-08T00:00:00Z', NOW)).toBe(0);
    expect(daysLeft(null, NOW)).toBeNull();
  });
});
