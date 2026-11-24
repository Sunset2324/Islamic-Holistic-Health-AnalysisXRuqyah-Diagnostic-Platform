import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { withTransaction, type Db } from './db.js';

/**
 * Penghapusan terjadwal (pengganti fungsi Postgres purge_expired_submissions):
 * 1. kode akses aktif yang lewat masa berlaku -> 'expired';
 * 2. respons DRAF yang melewati expires_at (7 hari) dihapus. Kode akses, foto (images), dan isi foto terenkripsi
 *    (image_blobs) ikut terhapus oleh database (ON DELETE CASCADE): foto disimpan di database, bukan di folder.
 * Respons yang sudah 'in_consultation' tidak pernah disentuh.
 * Hanya JUMLAH baris yang dikembalikan/dicatat, tidak pernah data pasien.
 */
export interface PurgeResult {
  expiredCodes: number;
  deletedSubmissions: number;
  imageStorageKeys: string[];
}

export async function purgeExpired(db: Db): Promise<PurgeResult> {
  return withTransaction(db, async (conn) => {
    const [codes] = await conn.execute<ResultSetHeader>(
      "UPDATE access_codes SET status = 'expired' WHERE status = 'active' AND expires_at <= NOW(6)",
    );
    const [images] = await conn.execute<(RowDataPacket & { storage_key: string })[]>(
      `SELECT i.storage_key FROM images i
         JOIN submissions s ON s.id = i.submission_id
        WHERE s.status = 'draft' AND s.expires_at <= NOW(6)`,
    );
    const [subs] = await conn.execute<ResultSetHeader>(
      "DELETE FROM submissions WHERE status = 'draft' AND expires_at <= NOW(6)",
    );
    return { expiredCodes: codes.affectedRows, deletedSubmissions: subs.affectedRows, imageStorageKeys: images.map((r) => r.storage_key) };
  });
}
