-- MyHerbalis / Holistik Islami - skema MySQL 8.0 (port dari db/migrations/0001_init.sql PostgreSQL). DRAF untuk review.
-- Jalankan sebagai pemilik skema pada database `myherbalis` yang dibuat dengan utf8mb4:
--   create database myherbalis character set utf8mb4 collate utf8mb4_0900_ai_ci;
--   mysql -D myherbalis < 0001_schema.sql && mysql -D myherbalis < 0002_procedures.sql && mysql -D myherbalis < 0003_grants.sql
-- Tidak ada kunci/rahasia di file ini.
--
-- Konvensi (sama dengan versi PostgreSQL)
--  * Kolom *_enc = ciphertext yang dienkripsi OLEH APLIKASI (mis. AES-256-GCM). DB tidak memegang kunci.
--  * Token/kode dikirim backend sebagai HMAC-SHA256 hex (64 karakter, huruf kecil); DB hanya menyimpan hash itu.
--  * ID = UUID dalam CHAR(36) ascii_bin (dibangkitkan DB lewat uuid()).
--  * Waktu = DATETIME(3) dalam UTC. Semua fungsi waktu memakai UTC_TIMESTAMP(3), tidak bergantung time_zone sesi.
--
-- BEDA PENTING dari PostgreSQL (fakta MySQL 8.0, bukan pilihan desain):
--  * Tidak ada Row Level Security. Gantinya: aplikasi TIDAK diberi akses tabel sama sekali, hanya EXECUTE pada
--    prosedur tersimpan (0003_grants.sql). Identitas pelaku dikirim EKSPLISIT sebagai parameter p_actor.
--  * Tidak ada indeks parsial: "satu kode aktif per respons" dan "satu laporan terkini per pasien" memakai
--    kolom generated virtual + unique index (NULL tidak dianggap bentrok).
--  * CHECK tidak boleh mengacu kolom yang punya aksi FK (CASCADE/SET NULL): aturan "gambar punya tepat satu induk"
--    dipindah ke trigger.
--  * Tidak ada trigger TRUNCATE: audit_log dilindungi dengan tidak memberi hak DROP/TRUNCATE/DELETE ke aplikasi.

SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY';

-- ---------------------------------------------------------------------------
-- Akun (pasien terdaftar, konsultan, admin). Kredensial dikelola library autentikasi di tabel miliknya sendiri.
-- ---------------------------------------------------------------------------
CREATE TABLE accounts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (uuid()),
  email VARCHAR(320) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_as_ci NOT NULL,
  role ENUM('patient', 'consultant', 'admin') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  disabled_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY accounts_email_uq (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ---------------------------------------------------------------------------
-- Respons pra-konsultasi (sementara, privat; pasien tamu tanpa akun)
-- ---------------------------------------------------------------------------
CREATE TABLE submissions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (uuid()),
  edit_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('draft', 'in_consultation') NOT NULL DEFAULT 'draft',
  intake_enc MEDIUMBLOB NOT NULL,
  answers_enc MEDIUMBLOB NOT NULL,
  tag_selections_enc MEDIUMBLOB NOT NULL,
  key_version SMALLINT NOT NULL,
  questionnaire_version VARCHAR(64) NOT NULL,
  algorithm_version VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  updated_at DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  -- 7 hari dari dibuat; TIDAK diperpanjang oleh pengeditan. NULL setelah masuk konsultasi.
  expires_at DATETIME(3) NULL DEFAULT ((utc_timestamp(3) + INTERVAL 7 DAY)),
  PRIMARY KEY (id),
  KEY submissions_expires_idx (status, expires_at),
  CONSTRAINT submissions_token_fmt CHECK (REGEXP_LIKE(edit_token_hash, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT submissions_intake_len CHECK (OCTET_LENGTH(intake_enc) BETWEEN 1 AND 65536),
  CONSTRAINT submissions_answers_len CHECK (OCTET_LENGTH(answers_enc) BETWEEN 1 AND 65536),
  CONSTRAINT submissions_tags_len CHECK (OCTET_LENGTH(tag_selections_enc) BETWEEN 1 AND 131072),
  CONSTRAINT submissions_key_version CHECK (key_version > 0),
  CONSTRAINT submissions_expiry_rule CHECK ((status = 'draft' AND expires_at IS NOT NULL) OR status = 'in_consultation')
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Kode akses (Digital Handshake), 8 karakter, sekali pakai. Hanya HASH yang disimpan.
CREATE TABLE access_codes (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (uuid()),
  submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('active', 'accepted', 'expired', 'revoked') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  expires_at DATETIME(3) NOT NULL,
  accepted_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  accepted_at DATETIME(3) NULL,
  -- pengganti indeks parsial: terisi hanya untuk kode aktif, sehingga unique memaksa satu kode aktif per respons
  active_submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (IF(status = 'active', submission_id, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY access_codes_hash_uq (code_hash),
  UNIQUE KEY access_codes_one_active (active_submission_id),
  CONSTRAINT access_codes_hash_fmt CHECK (REGEXP_LIKE(code_hash, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT access_codes_sub_fk FOREIGN KEY (submission_id) REFERENCES submissions (id) ON DELETE CASCADE,
  CONSTRAINT access_codes_acc_fk FOREIGN KEY (accepted_by) REFERENCES accounts (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ---------------------------------------------------------------------------
-- Pasien (rekam sisi konsultan). account_id NULL = pasien tanpa akun: tidak ada riwayat untuk pasien.
-- ---------------------------------------------------------------------------
CREATE TABLE patients (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (uuid()),
  display_name_enc MEDIUMBLOB NOT NULL,
  key_version SMALLINT NOT NULL,
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  PRIMARY KEY (id),
  KEY patients_account_idx (account_id),
  KEY patients_created_by_idx (created_by),
  CONSTRAINT patients_name_len CHECK (OCTET_LENGTH(display_name_enc) BETWEEN 1 AND 4096),
  CONSTRAINT patients_key_version CHECK (key_version > 0),
  CONSTRAINT patients_acc_fk FOREIGN KEY (account_id) REFERENCES accounts (id),
  CONSTRAINT patients_creator_fk FOREIGN KEY (created_by) REFERENCES accounts (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ---------------------------------------------------------------------------
-- Laporan konsultasi (permanen, append-only per pasien)
-- ---------------------------------------------------------------------------
CREATE TABLE consultations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (uuid()),
  patient_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  consultant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('draft', 'final') NOT NULL DEFAULT 'draft',
  is_current TINYINT(1) NOT NULL DEFAULT 0,
  supersedes_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  source_submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  key_version SMALLINT NOT NULL,
  questionnaire_version VARCHAR(64) NOT NULL,
  algorithm_version VARCHAR(64) NOT NULL,
  -- Salinan data pasien saat konsultasi dimulai
  snapshot_intake_enc MEDIUMBLOB NOT NULL,
  snapshot_answers_enc MEDIUMBLOB NOT NULL,
  snapshot_tags_enc MEDIUMBLOB NOT NULL,
  -- Hasil hitung sistem (HHS, pilar, ajuan A-D). TIDAK PERNAH diteruskan ke pasien.
  system_result_enc MEDIUMBLOB NULL,
  -- Isian konsultan (wajib saat final)
  ruqyah_final_condition ENUM('A', 'B', 'C', 'D') NULL,
  ruqyah_assessment_notes_enc MEDIUMBLOB NULL,
  consultant_advice_enc MEDIUMBLOB NULL,
  clinical_notes_enc MEDIUMBLOB NULL,
  -- Opsional: apa yang ikut terlihat pasien. Saran konsultan selalu terlihat bila laporan dirilis.
  share_ruqyah_with_patient TINYINT(1) NOT NULL DEFAULT 0,
  share_clinical_notes_with_patient TINYINT(1) NOT NULL DEFAULT 0,
  released_to_patient_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  updated_at DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  finalized_at DATETIME(3) NULL,
  -- pengganti indeks parsial: terisi hanya untuk laporan terkini
  current_patient_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin
    GENERATED ALWAYS AS (IF(is_current = 1, patient_id, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY consultations_one_current (current_patient_id),
  KEY consultations_patient_idx (patient_id, created_at),
  KEY consultations_consultant_idx (consultant_id),
  CONSTRAINT consultations_key_version CHECK (key_version > 0),
  CONSTRAINT consultations_final_requires_fields CHECK (
    status = 'draft'
    OR (ruqyah_final_condition IS NOT NULL
        AND ruqyah_assessment_notes_enc IS NOT NULL AND OCTET_LENGTH(ruqyah_assessment_notes_enc) > 0
        AND consultant_advice_enc IS NOT NULL AND OCTET_LENGTH(consultant_advice_enc) > 0
        AND finalized_at IS NOT NULL)),
  CONSTRAINT consultations_current_requires_final CHECK (is_current = 0 OR status = 'final'),
  CONSTRAINT consultations_release_requires_final CHECK (released_to_patient_at IS NULL OR status = 'final'),
  CONSTRAINT consultations_patient_fk FOREIGN KEY (patient_id) REFERENCES patients (id),
  CONSTRAINT consultations_consultant_fk FOREIGN KEY (consultant_id) REFERENCES accounts (id),
  CONSTRAINT consultations_supersedes_fk FOREIGN KEY (supersedes_id) REFERENCES consultations (id),
  CONSTRAINT consultations_source_fk FOREIGN KEY (source_submission_id) REFERENCES submissions (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Metadata foto lidah (opsional). Isi file ada di object storage terenkripsi, BUKAN di DB.
-- Hanya hasil sanitizeImage (WebP bersih) yang boleh disimpan.
CREATE TABLE images (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (uuid()),
  submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  consultation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  mime VARCHAR(32) NOT NULL DEFAULT 'image/webp',
  bytes INT NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  storage_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (uuid()),
  created_at DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  PRIMARY KEY (id),
  UNIQUE KEY images_storage_key_uq (storage_key),
  KEY images_submission_idx (submission_id),
  KEY images_consultation_idx (consultation_id),
  CONSTRAINT images_mime CHECK (mime = 'image/webp'),
  CONSTRAINT images_bytes CHECK (bytes BETWEEN 1 AND 16777216),
  CONSTRAINT images_sha_fmt CHECK (REGEXP_LIKE(sha256, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT images_sub_fk FOREIGN KEY (submission_id) REFERENCES submissions (id) ON DELETE CASCADE,
  CONSTRAINT images_cons_fk FOREIGN KEY (consultation_id) REFERENCES consultations (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ---------------------------------------------------------------------------
-- Kode tautan akun: dibuat KONSULTAN, dimasukkan pasien yang sedang login.
-- ---------------------------------------------------------------------------
CREATE TABLE account_link_codes (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (uuid()),
  patient_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  expires_at DATETIME(3) NOT NULL,
  redeemed_at DATETIME(3) NULL,
  redeemed_by CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  revoked_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY link_codes_hash_uq (code_hash),
  KEY link_codes_patient_idx (patient_id),
  CONSTRAINT link_codes_hash_fmt CHECK (REGEXP_LIKE(code_hash, '^[0-9a-f]{64}$', 'c')),
  CONSTRAINT link_code_ttl CHECK (expires_at <= created_at + INTERVAL 24 HOUR),
  CONSTRAINT link_codes_patient_fk FOREIGN KEY (patient_id) REFERENCES patients (id),
  CONSTRAINT link_codes_creator_fk FOREIGN KEY (created_by) REFERENCES accounts (id),
  CONSTRAINT link_codes_redeemer_fk FOREIGN KEY (redeemed_by) REFERENCES accounts (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Laporan yang dipilih konsultan untuk muncul di riwayat pasien saat kode dipakai.
CREATE TABLE account_link_code_reports (
  link_code_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  consultation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (link_code_id, consultation_id),
  CONSTRAINT link_reports_code_fk FOREIGN KEY (link_code_id) REFERENCES account_link_codes (id) ON DELETE CASCADE,
  CONSTRAINT link_reports_cons_fk FOREIGN KEY (consultation_id) REFERENCES consultations (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- Pembatas tebak kode per akun (kode salah tidak menunjuk baris mana pun, jadi dicatat per akun).
CREATE TABLE code_attempts (
  account_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  kind ENUM('access', 'link') NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  PRIMARY KEY (account_id, kind),
  CONSTRAINT code_attempts_acc_fk FOREIGN KEY (account_id) REFERENCES accounts (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ---------------------------------------------------------------------------
-- Jejak audit (append-only). Kolom *_enc sengaja tidak disalin ke audit.
-- (kolom `before`/`after` di versi PostgreSQL diganti old_values/new_values karena BEFORE adalah kata terlarang di MySQL)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  at DATETIME(3) NOT NULL DEFAULT (utc_timestamp(3)),
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  action VARCHAR(16) NOT NULL,
  entity VARCHAR(64) NOT NULL,
  entity_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason VARCHAR(255) NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
DELIMITER $$

CREATE TRIGGER consultations_touch BEFORE UPDATE ON consultations FOR EACH ROW
BEGIN
  SET NEW.updated_at = UTC_TIMESTAMP(3);
END$$

-- Aturan "gambar punya tepat satu induk" (tidak bisa CHECK karena submission_id punya aksi FK).
CREATE TRIGGER images_one_parent_ins BEFORE INSERT ON images FOR EACH ROW
BEGIN
  IF (NEW.submission_id IS NULL) = (NEW.consultation_id IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'gambar harus punya tepat satu induk (images_one_parent)';
  END IF;
END$$
CREATE TRIGGER images_one_parent_upd BEFORE UPDATE ON images FOR EACH ROW
BEGIN
  IF (NEW.submission_id IS NULL) = (NEW.consultation_id IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'gambar harus punya tepat satu induk (images_one_parent)';
  END IF;
END$$

-- Audit: pelaku dan alasan datang dari variabel sesi @app_actor_id / @app_audit_reason yang DISETEL OLEH PROSEDUR
-- sebelum menulis. (Pada tulisan langsung oleh pemilik skema, nilai yang tersisa di sesi itulah yang terpakai.)
CREATE TRIGGER consultations_audit_ins AFTER INSERT ON consultations FOR EACH ROW
BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, reason, old_values, new_values)
  VALUES (@app_actor_id, 'INSERT', 'consultations', NEW.id, @app_audit_reason, NULL, JSON_OBJECT(
    'id', NEW.id, 'patient_id', NEW.patient_id, 'consultant_id', NEW.consultant_id, 'status', NEW.status,
    'is_current', NEW.is_current, 'supersedes_id', NEW.supersedes_id, 'source_submission_id', NEW.source_submission_id,
    'key_version', NEW.key_version, 'questionnaire_version', NEW.questionnaire_version,
    'algorithm_version', NEW.algorithm_version, 'ruqyah_final_condition', NEW.ruqyah_final_condition,
    'share_ruqyah_with_patient', NEW.share_ruqyah_with_patient,
    'share_clinical_notes_with_patient', NEW.share_clinical_notes_with_patient,
    'released_to_patient_at', NEW.released_to_patient_at, 'created_at', NEW.created_at,
    'updated_at', NEW.updated_at, 'finalized_at', NEW.finalized_at));
END$$
CREATE TRIGGER consultations_audit_upd AFTER UPDATE ON consultations FOR EACH ROW
BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, reason, old_values, new_values)
  VALUES (@app_actor_id, 'UPDATE', 'consultations', NEW.id, @app_audit_reason,
  JSON_OBJECT(
    'id', OLD.id, 'patient_id', OLD.patient_id, 'consultant_id', OLD.consultant_id, 'status', OLD.status,
    'is_current', OLD.is_current, 'supersedes_id', OLD.supersedes_id, 'source_submission_id', OLD.source_submission_id,
    'key_version', OLD.key_version, 'questionnaire_version', OLD.questionnaire_version,
    'algorithm_version', OLD.algorithm_version, 'ruqyah_final_condition', OLD.ruqyah_final_condition,
    'share_ruqyah_with_patient', OLD.share_ruqyah_with_patient,
    'share_clinical_notes_with_patient', OLD.share_clinical_notes_with_patient,
    'released_to_patient_at', OLD.released_to_patient_at, 'created_at', OLD.created_at,
    'updated_at', OLD.updated_at, 'finalized_at', OLD.finalized_at),
  JSON_OBJECT(
    'id', NEW.id, 'patient_id', NEW.patient_id, 'consultant_id', NEW.consultant_id, 'status', NEW.status,
    'is_current', NEW.is_current, 'supersedes_id', NEW.supersedes_id, 'source_submission_id', NEW.source_submission_id,
    'key_version', NEW.key_version, 'questionnaire_version', NEW.questionnaire_version,
    'algorithm_version', NEW.algorithm_version, 'ruqyah_final_condition', NEW.ruqyah_final_condition,
    'share_ruqyah_with_patient', NEW.share_ruqyah_with_patient,
    'share_clinical_notes_with_patient', NEW.share_clinical_notes_with_patient,
    'released_to_patient_at', NEW.released_to_patient_at, 'created_at', NEW.created_at,
    'updated_at', NEW.updated_at, 'finalized_at', NEW.finalized_at));
END$$
CREATE TRIGGER consultations_audit_del AFTER DELETE ON consultations FOR EACH ROW
BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, reason, old_values, new_values)
  VALUES (@app_actor_id, 'DELETE', 'consultations', OLD.id, @app_audit_reason, JSON_OBJECT(
    'id', OLD.id, 'patient_id', OLD.patient_id, 'consultant_id', OLD.consultant_id, 'status', OLD.status,
    'is_current', OLD.is_current, 'supersedes_id', OLD.supersedes_id, 'source_submission_id', OLD.source_submission_id,
    'key_version', OLD.key_version, 'questionnaire_version', OLD.questionnaire_version,
    'algorithm_version', OLD.algorithm_version, 'ruqyah_final_condition', OLD.ruqyah_final_condition,
    'share_ruqyah_with_patient', OLD.share_ruqyah_with_patient,
    'share_clinical_notes_with_patient', OLD.share_clinical_notes_with_patient,
    'released_to_patient_at', OLD.released_to_patient_at, 'created_at', OLD.created_at,
    'updated_at', OLD.updated_at, 'finalized_at', OLD.finalized_at), NULL);
END$$

CREATE TRIGGER patients_audit_ins AFTER INSERT ON patients FOR EACH ROW
BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, reason, old_values, new_values)
  VALUES (@app_actor_id, 'INSERT', 'patients', NEW.id, @app_audit_reason, NULL, JSON_OBJECT(
    'id', NEW.id, 'key_version', NEW.key_version, 'account_id', NEW.account_id,
    'created_by', NEW.created_by, 'created_at', NEW.created_at));
END$$
CREATE TRIGGER patients_audit_upd AFTER UPDATE ON patients FOR EACH ROW
BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, reason, old_values, new_values)
  VALUES (@app_actor_id, 'UPDATE', 'patients', NEW.id, @app_audit_reason,
  JSON_OBJECT('id', OLD.id, 'key_version', OLD.key_version, 'account_id', OLD.account_id,
              'created_by', OLD.created_by, 'created_at', OLD.created_at),
  JSON_OBJECT('id', NEW.id, 'key_version', NEW.key_version, 'account_id', NEW.account_id,
              'created_by', NEW.created_by, 'created_at', NEW.created_at));
END$$
CREATE TRIGGER patients_audit_del AFTER DELETE ON patients FOR EACH ROW
BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, reason, old_values, new_values)
  VALUES (@app_actor_id, 'DELETE', 'patients', OLD.id, @app_audit_reason, JSON_OBJECT(
    'id', OLD.id, 'key_version', OLD.key_version, 'account_id', OLD.account_id,
    'created_by', OLD.created_by, 'created_at', OLD.created_at), NULL);
END$$

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log bersifat append-only';
END$$
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log bersifat append-only';
END$$

DELIMITER ;
