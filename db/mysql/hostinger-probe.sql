-- Probe kemampuan database (aman: hanya membuat tabel/rutin bernama zz_probe_* lalu menghapusnya).
-- Tujuan: memastikan MySQL di hosting mendukung semua fitur yang dipakai skema SEBELUM skema asli dipasang.
-- Jalankan di database KOSONG/uji. Tidak ada kata sandi di berkas ini dan hasilnya tidak berisi kata sandi.
-- Cara: phpMyAdmin > pilih database > tab SQL > tempel seluruh isi > Go.
-- Bila berhenti di satu pernyataan karena error, CATAT pesan errornya dan nomor tes (komentar "-- TES n" di atasnya),
-- hapus pernyataan itu, lalu jalankan sisanya. Di akhir jalankan bagian BERSIH-BERSIH (juga bila terhenti di tengah).

-- BERSIH-BERSIH awal (aman dijalankan berulang)
DROP TRIGGER IF EXISTS zz_probe_trg;
DROP PROCEDURE IF EXISTS zz_probe_proc;
DROP FUNCTION IF EXISTS zz_probe_fn;
DROP TABLE IF EXISTS zz_probe_child;
DROP TABLE IF EXISTS zz_probe;

-- TES 1: versi dan pengaturan (informasi; kirim hasil kolom ini)
SELECT VERSION() AS versi, @@version_comment AS jenis, @@default_storage_engine AS engine,
       @@character_set_database AS charset_db, @@collation_database AS collation_db,
       @@log_bin AS log_bin, @@log_bin_trust_function_creators AS trust_func_creators,
       @@sql_mode AS sql_mode, @@time_zone AS time_zone;

-- TES 2: collation dan charset yang dipakai skema (gagal di MariaDB: tidak punya utf8mb4_0900_as_ci)
CREATE TABLE zz_probe (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (uuid()),
  email VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci NOT NULL,
  status ENUM('a', 'b') NOT NULL DEFAULT 'a',
  hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  blobcol MEDIUMBLOB NOT NULL,
  t DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  PRIMARY KEY (id),
  UNIQUE KEY zz_probe_email (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- TES 3: CHECK + REGEXP_LIKE (gagal bila CHECK tidak ditegakkan atau REGEXP_LIKE tidak ada)
ALTER TABLE zz_probe ADD CONSTRAINT zz_probe_chk CHECK (REGEXP_LIKE(hash, '^[0-9a-f]{64}$', 'c') AND OCTET_LENGTH(blobcol) BETWEEN 1 AND 65536);

-- TES 4: kolom generated virtual + unique index (pengganti indeks parsial)
ALTER TABLE zz_probe ADD COLUMN only_a CHAR(36) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (IF(status = 'a', id, NULL)) VIRTUAL;
ALTER TABLE zz_probe ADD UNIQUE KEY zz_probe_only_a (only_a);

-- TES 5: foreign key dengan CASCADE
CREATE TABLE zz_probe_child (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  CONSTRAINT zz_probe_fk FOREIGN KEY (parent_id) REFERENCES zz_probe (id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- TES 6: JSON_TABLE (dipakai create_link_code)
SELECT j.cid FROM JSON_TABLE('["a","b"]', '$[*]' COLUMNS (cid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PATH '$')) j;

-- TES 7: membuat prosedur dengan SQL SECURITY DEFINER (tanpa BEGIN...END, jadi tidak perlu DELIMITER)
CREATE PROCEDURE zz_probe_proc() SQL SECURITY DEFINER SELECT 1 AS ok;

-- TES 8: memanggil prosedur
CALL zz_probe_proc();

-- TES 9: membuat fungsi READS SQL DATA (sering ditolak di server ber-binary-log tanpa SUPER: error 1419)
CREATE FUNCTION zz_probe_fn() RETURNS INT READS SQL DATA RETURN 1;

-- TES 10: membuat trigger (error 1419 / "TRIGGER command denied" bila tidak diizinkan)
CREATE TRIGGER zz_probe_trg BEFORE INSERT ON zz_probe FOR EACH ROW SET NEW.t = UTC_TIMESTAMP(3);

-- TES 11: INSERT valid (harus berhasil)
INSERT INTO zz_probe (email, hash, blobcol) VALUES ('a@contoh.test', REPEAT('a', 64), 'x');

-- TES 12: membuat peran (biasanya DITOLAK di hosting bersama; bukan penghalang, hanya menentukan pemisahan hak)
CREATE ROLE zz_probe_role;

-- TES 13: hak pengguna saat ini (kirim hasil kolom ini; tidak berisi kata sandi)
SELECT CURRENT_USER() AS pengguna;
SHOW GRANTS FOR CURRENT_USER();

-- TES 14: INSERT yang melanggar CHECK. Error "Check constraint 'zz_probe_chk' is violated" di sini ADALAH HASIL YANG BENAR.
-- Bila INSERT ini justru berhasil, CHECK tidak ditegakkan (laporkan!). Karena error menghentikan skrip, jalankan BERSIH-BERSIH di bawah sebagai tempelan terpisah.
INSERT INTO zz_probe (email, hash, blobcol) VALUES ('b@contoh.test', 'pendek', 'x');

-- ===== BERSIH-BERSIH akhir (tempel dan jalankan TERPISAH setelah semua tes di atas) =====
DROP ROLE IF EXISTS zz_probe_role;
DROP TRIGGER IF EXISTS zz_probe_trg;
DROP PROCEDURE IF EXISTS zz_probe_proc;
DROP FUNCTION IF EXISTS zz_probe_fn;
DROP TABLE IF EXISTS zz_probe_child;
DROP TABLE IF EXISTS zz_probe;
