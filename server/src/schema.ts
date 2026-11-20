import type { Db } from './db.js';

/**
 * Tambahan skema di atas myherbalis_hostinger_mariadb_11_8.sql. Idempoten (IF NOT EXISTS), aman dijalankan
 * setiap kali aplikasi start. Hanya MENAMBAH kolom yang boleh kosong; tidak pernah mengubah/menghapus data.
 */
const MIGRATIONS = [
  // Hash Argon2id (format PHC). NULL = akun undangan yang belum membuat password.
  'ALTER TABLE accounts ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL',
  // Nama tampilan staf (bukan data pasien).
  'ALTER TABLE accounts ADD COLUMN IF NOT EXISTS display_name VARCHAR(100) NULL',
  // Isi foto (WebP hasil pembersihan, terenkripsi AES-256-GCM). Metadata tetap di tabel images.
  // Terhapus otomatis bila baris images terhapus (yang terhapus otomatis bersama submission).
  `CREATE TABLE IF NOT EXISTS image_blobs (
     storage_key CHAR(36) NOT NULL PRIMARY KEY,
     key_version SMALLINT NOT NULL,
     data_enc MEDIUMBLOB NOT NULL,
     CONSTRAINT fk_blob_image FOREIGN KEY (storage_key) REFERENCES images(storage_key) ON DELETE CASCADE
   ) ENGINE=InnoDB`,
];

export async function ensureSchema(db: Db): Promise<void> {
  for (const sql of MIGRATIONS) await db.query(sql);
}
