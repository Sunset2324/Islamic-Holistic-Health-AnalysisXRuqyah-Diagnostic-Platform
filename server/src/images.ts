import { randomUUID } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { decrypt, encrypt, type KeyRing } from './crypto.js';
import type { Db } from './db.js';
import { sanitizeImage, sniffType, type CleanImage } from './sanitizeImage.js';

/**
 * Foto lidah pasien.
 *
 * Lapisan keamanan (berurutan):
 * 1. Token pasien diperiksa SEBELUM gambar diproses (tidak ada kerja berat untuk orang asing).
 * 2. Isi file diperiksa dari byte-nya, bukan nama/ekstensi/Content-Type. Hanya JPEG/PNG/WebP asli.
 * 3. Gambar didekode lalu DIGAMBAR ULANG menjadi WebP baru (sanitizeImage): skrip/HTML yang diselipkan,
 *    polyglot, EXIF/GPS, profil warna, dll. tidak ikut. File asli tidak pernah disimpan.
 * 4. Hasilnya dienkripsi AES-256-GCM (konteks terikat storage_key) dan disimpan di database, bukan di folder
 *    publik: tidak ada URL langsung, tidak bisa dieksekusi server, ikut terhapus bersama datanya (CASCADE).
 * 5. Saat disajikan: diperiksa ulang harus WebP, Content-Type tetap image/webp, nosniff, CSP sandbox.
 */

export const MAX_IMAGES_PER_SUBMISSION = 3;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Membatasi pemrosesan gambar bersamaan (memori/CPU hosting bersama terbatas). */
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: (() => void)[] = [];
export async function withImageSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await fn();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

export const sanitizeLimited = (input: Buffer): Promise<CleanImage> => withImageSlot(() => sanitizeImage(input));

const blobCtx = (storageKey: string) => `image:${storageKey}`;

/** Menyimpan gambar yang SUDAH dibersihkan. Pemanggil bertanggung jawab atas transaksi & otorisasi. */
export async function storeImage(conn: Db | PoolConnection, ring: KeyRing, owner: { submissionId: string }, clean: CleanImage) {
  const id = randomUUID();
  const storageKey = randomUUID();
  const sealed = encrypt(ring, blobCtx(storageKey), clean.data);
  await conn.execute('INSERT INTO images (id, submission_id, mime, bytes, sha256, storage_key) VALUES (?, ?, ?, ?, ?, ?)', [
    id,
    owner.submissionId,
    clean.mime,
    clean.bytes,
    clean.sha256,
    storageKey,
  ]);
  await conn.execute('INSERT INTO image_blobs (storage_key, key_version, data_enc) VALUES (?, ?, ?)', [storageKey, sealed.keyVersion, sealed.blob]);
  return { id, bytes: clean.bytes };
}

export interface ImageBlobRow extends RowDataPacket {
  storage_key: string;
  key_version: number;
  data_enc: Buffer;
}

export interface ImageListRow extends RowDataPacket {
  id: string;
  bytes: number;
  created_at: Date;
}

export const toImageList = (rows: ImageListRow[]) => rows.map((r) => ({ id: r.id, bytes: r.bytes, createdAt: r.created_at }));

/** Mendekripsi lalu mengirim gambar. Apa pun yang bukan WebP (tidak seharusnya terjadi) tidak pernah dikirim. */
export function sendImage(reply: FastifyReply, ring: KeyRing, row: ImageBlobRow) {
  const data = decrypt(ring, blobCtx(row.storage_key), row.key_version, row.data_enc);
  if (sniffType(data) !== 'webp') return reply.code(404).send({ error: 'not_found' });
  return reply
    .header('Content-Type', 'image/webp')
    .header('Content-Disposition', 'inline; filename="foto.webp"')
    .header('Content-Security-Policy', "default-src 'none'; sandbox")
    .header('X-Content-Type-Options', 'nosniff')
    .header('Cache-Control', 'private, no-store')
    .send(data);
}
