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

  // Laporan akhir (blueprint bagian 12, 28 November 2026): potensi ruqyah A-D dan 4 pilar boleh dicentang lebih dari
  // satu; catatan kondisi psikis dan fisik (terenkripsi, AAD per baris+kolom) masing-masing dengan centang "sertakan".
  `ALTER TABLE consultations
     ADD COLUMN IF NOT EXISTS ruqyah_conditions SET('A','B','C','D') NULL,
     ADD COLUMN IF NOT EXISTS pillar_potentials SET('PL','PM','PP','FX') NULL,
     ADD COLUMN IF NOT EXISTS psychological_notes_enc LONGBLOB NULL,
     ADD COLUMN IF NOT EXISTS physical_notes_enc LONGBLOB NULL,
     ADD COLUMN IF NOT EXISTS share_pillars_with_patient BOOLEAN NOT NULL DEFAULT FALSE,
     ADD COLUMN IF NOT EXISTS share_psychological_with_patient BOOLEAN NOT NULL DEFAULT FALSE,
     ADD COLUMN IF NOT EXISTS share_physical_with_patient BOOLEAN NOT NULL DEFAULT FALSE`,
  // Data lama: kondisi tunggal dipindah ke kolom pilihan baru (hanya bila belum pernah dipindah).
  `UPDATE consultations SET ruqyah_conditions = ruqyah_final_condition
    WHERE ruqyah_conditions IS NULL AND ruqyah_final_condition IS NOT NULL`,
  // CHECK lama mewajibkan tepat satu kondisi ruqyah untuk final; kini ruqyah boleh kosong bila ada pilar.
  // Penggantinya tetap menjaga catatan penilaian, saran, dan waktu final. Aturan "minimal satu potensi" dan
  // "catatan psikis & fisik wajib" dijaga di server (laporan final lama belum punya kolom itu).
  'ALTER TABLE consultations DROP CONSTRAINT IF EXISTS chk_final_requires_fields',
  `ALTER TABLE consultations ADD CONSTRAINT IF NOT EXISTS chk_final_requires_fields_v2 CHECK (
     status = 'draft' OR (
       ruqyah_assessment_notes_enc IS NOT NULL AND OCTET_LENGTH(ruqyah_assessment_notes_enc) > 0
       AND consultant_advice_enc IS NOT NULL AND OCTET_LENGTH(consultant_advice_enc) > 0
       AND finalized_at IS NOT NULL
     )
   )`,
];

export async function ensureSchema(db: Db): Promise<void> {
  for (const sql of MIGRATIONS) await db.query(sql);
}
