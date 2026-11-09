/**
 * Penyimpanan token edit di perangkat pasien (hanya {id, editToken, expiresAt}).
 * JANGAN menyimpan jawaban, nama, atau keluhan di sini; semuanya hanya ada di server (terenkripsi).
 *
 * Memakai localStorage agar pasien bisa kembali mengubah jawabannya dalam 7 hari. Konsekuensinya, di perangkat
 * bersama orang lain bisa membuka data itu; karena itu ada tombol "Hapus data saya" dan data dibersihkan saat berakhir.
 * Semua akses dibungkus try/catch karena penyimpanan bisa tidak tersedia (mode privat, diblokir).
 */
export const STORAGE_KEY = 'myherbalis.submission.v1';

export interface SavedSubmission {
  id: string;
  editToken: string;
  /** ISO string, atau null bila server tidak memberi tahu. */
  expiresAt: string | null;
}

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

export function parseSaved(raw: string | null, now: Date = new Date()): SavedSubmission | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedSubmission>;
    if (typeof value.id !== 'string' || !ID_RE.test(value.id)) return null;
    if (typeof value.editToken !== 'string' || !TOKEN_RE.test(value.editToken)) return null;
    const expiresAt = typeof value.expiresAt === 'string' ? value.expiresAt : null;
    if (expiresAt && !(Date.parse(expiresAt) > now.getTime())) return null;
    return { id: value.id, editToken: value.editToken, expiresAt };
  } catch {
    return null;
  }
}

export function loadSaved(): SavedSubmission | null {
  try {
    const saved = parseSaved(window.localStorage.getItem(STORAGE_KEY));
    if (!saved) window.localStorage.removeItem(STORAGE_KEY);
    return saved;
  } catch {
    return null;
  }
}

/** Mengembalikan false bila penyimpanan gagal (pasien diberi tahu bahwa tidak bisa kembali mengubah di perangkat ini). */
export function writeSaved(saved: SavedSubmission): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: saved.id, editToken: saved.editToken, expiresAt: saved.expiresAt }));
    return true;
  } catch {
    return false;
  }
}

export function clearSaved(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* tidak ada yang bisa dilakukan */
  }
}

export function daysLeft(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - now.getTime();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}
