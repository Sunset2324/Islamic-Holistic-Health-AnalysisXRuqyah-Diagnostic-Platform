-- MyHerbalis - prosedur tersimpan MySQL 8.0 (port fungsi SECURITY DEFINER dari versi PostgreSQL).
-- Dijalankan SESUDAH 0001_schema.sql, sebagai pemilik skema (DEFINER = pemilik). Rutin menyimpan sql_mode saat dibuat,
-- jadi mode ketat disetel di bawah.
--
-- Aturan pemakaian (WAJIB untuk backend)
--  1. Aplikasi hanya boleh CALL prosedur ini (lihat 0003_grants.sql); tidak ada SELECT/INSERT/UPDATE tabel langsung.
--  2. Identitas pelaku dikirim EKSPLISIT sebagai p_actor (UUID akun dari sesi terautentikasi, BUKAN dari input klien).
--     Berbeda dari versi PostgreSQL yang memakai set_config per transaksi: parameter eksplisit tidak bisa "tersisa"
--     di koneksi pool dari permintaan sebelumnya.
--  3. Prosedur yang menulis mengelola transaksinya sendiri (START TRANSACTION ... COMMIT; ROLLBACK bila error).
--     Karena itu panggil dalam mode autocommit dan JANGAN memanggilnya di dalam transaksi yang sedang terbuka
--     (START TRANSACTION di dalam prosedur akan meng-COMMIT transaksi yang terbuka itu).
--  4. Kegagalan yang disengaja ('invalid'/'locked') dikembalikan sebagai baris hasil, bukan error, agar hitungan
--     percobaan tersimpan. Pelanggaran aturan dilempar sebagai SQLSTATE 45000 dengan pesan Indonesia.
--  5. Hasil dikembalikan sebagai result set (SELECT), bukan OUT parameter.

SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY';

DELIMITER $$

-- ---------------------------------------------------------------------------
-- Helper (tidak diberi hak ke aplikasi; dipanggil dari dalam prosedur definer)
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_role_of(p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin)
RETURNS VARCHAR(16) CHARACTER SET ascii
READS SQL DATA SQL SECURITY DEFINER
BEGIN
  DECLARE v_role VARCHAR(16) CHARACTER SET ascii DEFAULT NULL;
  SELECT role INTO v_role FROM accounts WHERE id = p_actor AND disabled_at IS NULL;
  RETURN v_role;
END$$

CREATE FUNCTION code_attempt_locked(p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin, p_kind VARCHAR(8))
RETURNS TINYINT(1)
READS SQL DATA SQL SECURITY DEFINER
BEGIN
  DECLARE v_locked TINYINT(1) DEFAULT 0;
  SELECT (locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP(3)) INTO v_locked
    FROM code_attempts WHERE account_id = p_actor AND kind = p_kind;
  RETURN IFNULL(v_locked, 0);
END$$

CREATE PROCEDURE code_attempt_fail(IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin, IN p_kind VARCHAR(8))
SQL SECURITY DEFINER
BEGIN
  INSERT INTO code_attempts (account_id, kind, attempts) VALUES (p_actor, p_kind, 1)
    ON DUPLICATE KEY UPDATE attempts = attempts + 1;
  UPDATE code_attempts SET locked_until = UTC_TIMESTAMP(3) + INTERVAL 15 MINUTE, attempts = 0
   WHERE account_id = p_actor AND kind = p_kind AND attempts >= 5;
END$$

CREATE PROCEDURE code_attempt_reset(IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin, IN p_kind VARCHAR(8))
SQL SECURITY DEFINER
BEGIN
  DELETE FROM code_attempts WHERE account_id = p_actor AND kind = p_kind;
END$$

-- ---------------------------------------------------------------------------
-- Pasien tamu (diakses backend atas nama pasien; token = bukti)
-- ---------------------------------------------------------------------------
CREATE PROCEDURE create_submission(
  IN p_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_intake_enc MEDIUMBLOB, IN p_answers_enc MEDIUMBLOB, IN p_tags_enc MEDIUMBLOB,
  IN p_key_version SMALLINT, IN p_questionnaire_version VARCHAR(64), IN p_algorithm_version VARCHAR(64))
SQL SECURITY DEFINER
BEGIN
  DECLARE v_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin;
  SET v_id = UUID();
  INSERT INTO submissions (id, edit_token_hash, intake_enc, answers_enc, tag_selections_enc, key_version,
                           questionnaire_version, algorithm_version)
  VALUES (v_id, p_token_hash, p_intake_enc, p_answers_enc, p_tags_enc, p_key_version,
          p_questionnaire_version, p_algorithm_version);
  SELECT v_id AS id;
END$$

CREATE PROCEDURE get_submission(
  IN p_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
BEGIN
  SELECT s.id, s.status, s.intake_enc, s.answers_enc, s.tag_selections_enc, s.key_version, s.questionnaire_version,
         s.algorithm_version, s.created_at, s.updated_at, s.expires_at
    FROM submissions s
   WHERE s.id = p_id AND s.edit_token_hash = p_token_hash
     AND (s.expires_at IS NULL OR s.expires_at > UTC_TIMESTAMP(3));
END$$

CREATE PROCEDURE update_submission(
  IN p_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_intake_enc MEDIUMBLOB, IN p_answers_enc MEDIUMBLOB, IN p_tags_enc MEDIUMBLOB, IN p_key_version SMALLINT)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_id FROM submissions
   WHERE id = p_id AND edit_token_hash = p_token_hash AND status = 'draft' AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'respons tidak ditemukan, kedaluwarsa, atau terkunci';
  END IF;
  UPDATE submissions
     SET intake_enc = p_intake_enc, answers_enc = p_answers_enc, tag_selections_enc = p_tags_enc,
         key_version = p_key_version, updated_at = UTC_TIMESTAMP(3)
   WHERE id = v_id;
  COMMIT;
END$$

CREATE PROCEDURE delete_submission(
  IN p_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_id FROM submissions
   WHERE id = p_id AND edit_token_hash = p_token_hash AND status = 'draft' FOR UPDATE;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'respons tidak ditemukan atau terkunci';
  END IF;
  DELETE FROM submissions WHERE id = v_id;
  COMMIT;
END$$

-- Backend membuat kode acak 8 karakter, mengirim hash-nya. Kode lama dicabut.
CREATE PROCEDURE issue_access_code(
  IN p_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_exp DATETIME(3) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id, expires_at INTO v_id, v_exp FROM submissions
   WHERE id = p_id AND edit_token_hash = p_token_hash AND status = 'draft' AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'respons tidak ditemukan, kedaluwarsa, atau terkunci';
  END IF;
  UPDATE access_codes SET status = 'revoked' WHERE submission_id = v_id AND status = 'active';
  INSERT INTO access_codes (submission_id, code_hash, expires_at) VALUES (v_id, p_code_hash, v_exp);
  COMMIT;
END$$

CREATE PROCEDURE attach_submission_image(
  IN p_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_bytes INT, IN p_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_storage_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_img CHAR(36) CHARACTER SET ascii COLLATE ascii_bin;
  DECLARE v_n INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  START TRANSACTION;
  SELECT id INTO v_id FROM submissions
   WHERE id = p_id AND edit_token_hash = p_token_hash AND status = 'draft' AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'respons tidak ditemukan, kedaluwarsa, atau terkunci';
  END IF;
  SELECT COUNT(*) INTO v_n FROM images WHERE submission_id = v_id;
  IF v_n >= 3 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'batas 3 foto per respons';
  END IF;
  SET v_img = UUID();
  INSERT INTO images (id, submission_id, bytes, sha256, storage_key) VALUES (v_img, v_id, p_bytes, p_sha256, p_storage_key);
  COMMIT;
  SELECT v_img AS id;
END$$

-- ---------------------------------------------------------------------------
-- Konsultan
-- ---------------------------------------------------------------------------
-- Konsultan menerima kode. Kegagalan dikembalikan sebagai status (bukan error) agar hitungan percobaan tersimpan.
CREATE PROCEDURE accept_access_code(
  IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
proc: BEGIN
  DECLARE v_ac CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_sub CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_sub_ok CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF IFNULL(app_role_of(p_actor), '') <> 'consultant' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya konsultan';
  END IF;
  IF code_attempt_locked(p_actor, 'access') THEN
    SELECT 'locked' AS status, NULL AS submission_id, NULL AS intake_enc, NULL AS answers_enc, NULL AS tag_selections_enc,
           NULL AS key_version, NULL AS questionnaire_version, NULL AS algorithm_version;
    LEAVE proc;
  END IF;

  START TRANSACTION;
  SET @app_actor_id = p_actor; SET @app_audit_reason = NULL;
  SELECT id, submission_id INTO v_ac, v_sub FROM access_codes
   WHERE code_hash = p_code_hash AND status = 'active' AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE;
  IF v_ac IS NOT NULL THEN
    SELECT id INTO v_sub_ok FROM submissions WHERE id = v_sub AND status = 'draft' FOR UPDATE;
  END IF;
  IF v_ac IS NULL OR v_sub_ok IS NULL THEN
    CALL code_attempt_fail(p_actor, 'access');
    COMMIT;
    SELECT 'invalid' AS status, NULL AS submission_id, NULL AS intake_enc, NULL AS answers_enc, NULL AS tag_selections_enc,
           NULL AS key_version, NULL AS questionnaire_version, NULL AS algorithm_version;
    LEAVE proc;
  END IF;

  CALL code_attempt_reset(p_actor, 'access');
  UPDATE access_codes SET status = 'accepted', accepted_by = p_actor, accepted_at = UTC_TIMESTAMP(3) WHERE id = v_ac;
  UPDATE submissions SET status = 'in_consultation', expires_at = NULL, updated_at = UTC_TIMESTAMP(3) WHERE id = v_sub_ok;
  COMMIT;
  SELECT 'ok' AS status, s.id AS submission_id, s.intake_enc, s.answers_enc, s.tag_selections_enc, s.key_version,
         s.questionnaire_version, s.algorithm_version
    FROM submissions s WHERE s.id = v_sub_ok;
END$$

-- Langkah 2: backend sudah mendekripsi nama pasien dan mengirim ulang terenkripsi (atau memakai pasien yang ada).
CREATE PROCEDURE open_consultation(
  IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_submission_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_patient_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_patient_name_enc MEDIUMBLOB, IN p_patient_key_version SMALLINT)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_sub CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_pid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_cid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin;
  DECLARE v_n INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF IFNULL(app_role_of(p_actor), '') <> 'consultant' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya konsultan';
  END IF;
  START TRANSACTION;
  SET @app_actor_id = p_actor; SET @app_audit_reason = NULL;
  SELECT id INTO v_sub FROM submissions WHERE id = p_submission_id AND status = 'in_consultation' FOR UPDATE;
  IF v_sub IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'respons tidak tersedia';
  END IF;
  SELECT COUNT(*) INTO v_n FROM access_codes
   WHERE submission_id = v_sub AND status = 'accepted' AND accepted_by = p_actor;
  IF v_n = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'kode belum diterima oleh konsultan ini';
  END IF;
  SELECT COUNT(*) INTO v_n FROM consultations WHERE source_submission_id = v_sub;
  IF v_n > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'konsultasi untuk respons ini sudah dibuka';
  END IF;

  IF p_patient_id IS NULL THEN
    IF p_patient_name_enc IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'nama pasien terenkripsi wajib untuk pasien baru';
    END IF;
    SET v_pid = UUID();
    INSERT INTO patients (id, display_name_enc, key_version, created_by)
    VALUES (v_pid, p_patient_name_enc, p_patient_key_version, p_actor);
  ELSE
    SELECT id INTO v_pid FROM patients WHERE id = p_patient_id AND created_by = p_actor;
    IF v_pid IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'pasien tidak ditemukan';
    END IF;
  END IF;

  SET v_cid = UUID();
  INSERT INTO consultations (id, patient_id, consultant_id, source_submission_id, key_version, questionnaire_version,
                             algorithm_version, snapshot_intake_enc, snapshot_answers_enc, snapshot_tags_enc)
  SELECT v_cid, v_pid, p_actor, s.id, s.key_version, s.questionnaire_version, s.algorithm_version,
         s.intake_enc, s.answers_enc, s.tag_selections_enc
    FROM submissions s WHERE s.id = v_sub;
  UPDATE images SET consultation_id = v_cid, submission_id = NULL WHERE submission_id = v_sub;
  COMMIT;
  SELECT v_cid AS id;
END$$

-- Konsultan menyimpan isian draf. SEMUA kolom isian ditimpa dengan nilai yang dikirim (NULL = dikosongkan);
-- kirim ulang nilai lama untuk kolom yang tidak berubah. status/is_current/finalized_at/released_* hanya lewat prosedur lain.
CREATE PROCEDURE update_consultation_draft(
  IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_system_result_enc MEDIUMBLOB, IN p_ruqyah_final_condition CHAR(1),
  IN p_ruqyah_assessment_notes_enc MEDIUMBLOB, IN p_consultant_advice_enc MEDIUMBLOB,
  IN p_clinical_notes_enc MEDIUMBLOB, IN p_share_ruqyah TINYINT, IN p_share_notes TINYINT, IN p_key_version SMALLINT)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF IFNULL(app_role_of(p_actor), '') <> 'consultant' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya konsultan';
  END IF;
  START TRANSACTION;
  SET @app_actor_id = p_actor; SET @app_audit_reason = NULL;
  SELECT id INTO v_id FROM consultations WHERE id = p_id AND consultant_id = p_actor AND status = 'draft' FOR UPDATE;
  IF v_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'laporan tidak ditemukan atau sudah final';
  END IF;
  UPDATE consultations
     SET system_result_enc = p_system_result_enc, ruqyah_final_condition = p_ruqyah_final_condition,
         ruqyah_assessment_notes_enc = p_ruqyah_assessment_notes_enc, consultant_advice_enc = p_consultant_advice_enc,
         clinical_notes_enc = p_clinical_notes_enc, share_ruqyah_with_patient = p_share_ruqyah,
         share_clinical_notes_with_patient = p_share_notes, key_version = p_key_version
   WHERE id = v_id;
  COMMIT;
END$$

-- Finalisasi. Laporan lama pasien menjadi tidak terkini. Dirilis otomatis ke riwayat bila pasien sudah punya akun.
CREATE PROCEDURE finalize_consultation(
  IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_reason VARCHAR(255))
SQL SECURITY DEFINER
BEGIN
  DECLARE v_pid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_src CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_prev CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_acc CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_cond CHAR(1) DEFAULT NULL;
  DECLARE v_notes_len INT DEFAULT NULL;
  DECLARE v_advice_len INT DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF IFNULL(app_role_of(p_actor), '') <> 'consultant' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya konsultan';
  END IF;
  START TRANSACTION;
  SELECT patient_id, source_submission_id, ruqyah_final_condition,
         OCTET_LENGTH(ruqyah_assessment_notes_enc), OCTET_LENGTH(consultant_advice_enc)
    INTO v_pid, v_src, v_cond, v_notes_len, v_advice_len
    FROM consultations WHERE id = p_id AND consultant_id = p_actor AND status = 'draft' FOR UPDATE;
  IF v_pid IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'laporan tidak ditemukan atau sudah final';
  END IF;
  IF v_cond IS NULL OR IFNULL(v_notes_len, 0) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'penilaian ruqyah wajib diisi sebelum final';
  END IF;
  IF IFNULL(v_advice_len, 0) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'saran konsultan wajib diisi sebelum final';
  END IF;
  SELECT account_id INTO v_acc FROM patients WHERE id = v_pid;

  SET @app_actor_id = p_actor;
  SET @app_audit_reason = IFNULL(p_reason, 'finalisasi laporan');
  SELECT id INTO v_prev FROM consultations WHERE patient_id = v_pid AND is_current = 1 AND id <> p_id FOR UPDATE;
  IF v_prev IS NOT NULL THEN
    UPDATE consultations SET is_current = 0 WHERE id = v_prev;
  END IF;
  UPDATE consultations
     SET status = 'final', is_current = 1, finalized_at = UTC_TIMESTAMP(3), supersedes_id = v_prev,
         released_to_patient_at = IF(v_acc IS NOT NULL, UTC_TIMESTAMP(3), NULL)
   WHERE id = p_id;
  IF v_src IS NOT NULL THEN
    DELETE FROM submissions WHERE id = v_src AND status = 'in_consultation';
  END IF;
  COMMIT;
END$$

-- Konsultan membuat kode tautan untuk pasiennya dan memilih laporan final yang akan masuk riwayat pasien.
-- p_consultation_ids = array JSON berisi UUID, mis. '["...","..."]'. p_ttl_minutes: 1..1440 (disarankan 15).
CREATE PROCEDURE create_link_code(
  IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_patient_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_consultation_ids JSON, IN p_ttl_minutes INT)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_pid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_lid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin;
  DECLARE v_len INT DEFAULT 0;
  DECLARE v_n INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF IFNULL(app_role_of(p_actor), '') <> 'consultant' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya konsultan';
  END IF;
  START TRANSACTION;
  SET @app_actor_id = p_actor; SET @app_audit_reason = NULL;
  SELECT id INTO v_pid FROM patients WHERE id = p_patient_id AND created_by = p_actor FOR UPDATE;
  IF v_pid IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'pasien tidak ditemukan';
  END IF;
  IF p_ttl_minutes IS NULL OR p_ttl_minutes <= 0 OR p_ttl_minutes > 1440 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'umur kode harus antara 0 dan 24 jam';
  END IF;
  IF p_consultation_ids IS NULL OR JSON_TYPE(p_consultation_ids) <> 'ARRAY' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'laporan harus final, milik pasien ini, dan minimal satu';
  END IF;
  SET v_len = JSON_LENGTH(p_consultation_ids);
  SELECT COUNT(DISTINCT c.id) INTO v_n
    FROM consultations c
    JOIN JSON_TABLE(p_consultation_ids, '$[*]' COLUMNS (cid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PATH '$')) j
      ON c.id = j.cid
   WHERE c.patient_id = v_pid AND c.consultant_id = p_actor AND c.status = 'final';
  IF v_len = 0 OR v_n <> v_len THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'laporan harus final, milik pasien ini, dan minimal satu';
  END IF;

  UPDATE account_link_codes SET revoked_at = UTC_TIMESTAMP(3)
   WHERE patient_id = v_pid AND redeemed_at IS NULL AND revoked_at IS NULL;
  SET v_lid = UUID();
  INSERT INTO account_link_codes (id, patient_id, code_hash, created_by, expires_at)
  VALUES (v_lid, v_pid, p_code_hash, p_actor, UTC_TIMESTAMP(3) + INTERVAL p_ttl_minutes MINUTE);
  INSERT INTO account_link_code_reports (link_code_id, consultation_id)
  SELECT v_lid, j.cid FROM JSON_TABLE(p_consultation_ids, '$[*]'
         COLUMNS (cid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PATH '$')) j;
  COMMIT;
  SELECT v_lid AS id;
END$$

-- Baca (konsultan): hanya milik konsultan itu sendiri.
CREATE PROCEDURE list_my_patients(IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
BEGIN
  IF IFNULL(app_role_of(p_actor), '') <> 'consultant' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya konsultan';
  END IF;
  SELECT id, display_name_enc, key_version, (account_id IS NOT NULL) AS has_account, created_at
    FROM patients WHERE created_by = p_actor ORDER BY created_at, id;
END$$

CREATE PROCEDURE list_my_consultations(
  IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_patient_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
BEGIN
  IF IFNULL(app_role_of(p_actor), '') <> 'consultant' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya konsultan';
  END IF;
  SELECT id, patient_id, status, is_current, supersedes_id, source_submission_id, key_version, questionnaire_version,
         algorithm_version, ruqyah_final_condition, share_ruqyah_with_patient, share_clinical_notes_with_patient,
         released_to_patient_at, created_at, updated_at, finalized_at
    FROM consultations
   WHERE consultant_id = p_actor AND (p_patient_id IS NULL OR patient_id = p_patient_id)
   ORDER BY created_at DESC, id;
END$$

CREATE PROCEDURE get_my_consultation(
  IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
BEGIN
  IF IFNULL(app_role_of(p_actor), '') <> 'consultant' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya konsultan';
  END IF;
  SELECT * FROM consultations WHERE id = p_id AND consultant_id = p_actor;
END$$

CREATE PROCEDURE list_consultation_images(
  IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_consultation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
BEGIN
  IF IFNULL(app_role_of(p_actor), '') <> 'consultant' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya konsultan';
  END IF;
  SELECT i.id, i.consultation_id, i.mime, i.bytes, i.sha256, i.storage_key, i.created_at
    FROM images i JOIN consultations c ON c.id = i.consultation_id
   WHERE i.consultation_id = p_consultation_id AND c.consultant_id = p_actor
   ORDER BY i.created_at, i.id;
END$$

-- ---------------------------------------------------------------------------
-- Pasien terdaftar
-- ---------------------------------------------------------------------------
-- Pasien yang login memasukkan kode dari konsultan.
CREATE PROCEDURE redeem_link_code(
  IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  IN p_code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
proc: BEGIN
  DECLARE v_lid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_pid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_acc CHAR(36) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL;
  DECLARE v_n INT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF IFNULL(app_role_of(p_actor), '') <> 'patient' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya akun pasien';
  END IF;
  IF code_attempt_locked(p_actor, 'link') THEN
    SELECT 'locked' AS status, NULL AS patient_id, NULL AS released_count;
    LEAVE proc;
  END IF;

  START TRANSACTION;
  SET @app_actor_id = p_actor; SET @app_audit_reason = NULL;
  SELECT id, patient_id INTO v_lid, v_pid FROM account_link_codes
   WHERE code_hash = p_code_hash AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE;
  IF v_lid IS NOT NULL THEN
    SELECT account_id INTO v_acc FROM patients WHERE id = v_pid FOR UPDATE;
    IF v_acc IS NOT NULL AND v_acc <> p_actor THEN
      SET v_lid = NULL;
    END IF;
  END IF;
  IF v_lid IS NULL THEN
    CALL code_attempt_fail(p_actor, 'link');
    COMMIT;
    SELECT 'invalid' AS status, NULL AS patient_id, NULL AS released_count;
    LEAVE proc;
  END IF;

  CALL code_attempt_reset(p_actor, 'link');
  SET @app_audit_reason = 'tautan akun lewat kode konsultan';
  UPDATE patients SET account_id = p_actor WHERE id = v_pid;
  UPDATE consultations SET released_to_patient_at = UTC_TIMESTAMP(3)
   WHERE id IN (SELECT consultation_id FROM account_link_code_reports WHERE link_code_id = v_lid)
     AND status = 'final' AND released_to_patient_at IS NULL;
  SET v_n = ROW_COUNT();
  UPDATE account_link_codes SET redeemed_at = UTC_TIMESTAMP(3), redeemed_by = p_actor WHERE id = v_lid;
  COMMIT;
  SELECT 'ok' AS status, v_pid AS patient_id, v_n AS released_count;
END$$

-- Pengganti view patient_visible_reports: hanya laporan final yang dirilis ke akun pasien itu.
-- Saran konsultan selalu ada; penilaian ruqyah/catatan klinis hanya bila flag true (selain itu NULL).
-- system_result dan snapshot jawaban TIDAK ada di hasil ini.
CREATE PROCEDURE list_patient_reports(IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin)
SQL SECURITY DEFINER
BEGIN
  SELECT c.id AS consultation_id, c.patient_id, c.finalized_at, c.questionnaire_version, c.key_version,
         c.consultant_advice_enc,
         IF(c.share_ruqyah_with_patient = 1, c.ruqyah_final_condition, NULL) AS ruqyah_final_condition,
         IF(c.share_ruqyah_with_patient = 1, c.ruqyah_assessment_notes_enc, NULL) AS ruqyah_assessment_notes_enc,
         IF(c.share_clinical_notes_with_patient = 1, c.clinical_notes_enc, NULL) AS clinical_notes_enc
    FROM consultations c
    JOIN patients p ON p.id = c.patient_id
    JOIN accounts a ON a.id = p.account_id AND a.disabled_at IS NULL
   WHERE c.status = 'final' AND c.released_to_patient_at IS NOT NULL AND p.account_id = p_actor
   ORDER BY c.finalized_at DESC, c.id;
END$$

-- ---------------------------------------------------------------------------
-- Admin dan pemeliharaan
-- ---------------------------------------------------------------------------
CREATE PROCEDURE list_audit(
  IN p_actor CHAR(36) CHARACTER SET ascii COLLATE ascii_bin, IN p_limit INT, IN p_before_id BIGINT)
SQL SECURITY DEFINER
BEGIN
  DECLARE v_limit INT DEFAULT 100;
  IF IFNULL(app_role_of(p_actor), '') <> 'admin' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'hanya admin';
  END IF;
  IF p_limit IS NOT NULL AND p_limit BETWEEN 1 AND 500 THEN SET v_limit = p_limit; END IF;
  SELECT id, at, actor_id, action, entity, entity_id, reason, old_values, new_values
    FROM audit_log WHERE (p_before_id IS NULL OR id < p_before_id) ORDER BY id DESC LIMIT v_limit;
END$$

-- Hapus respons yang tidak jadi berkonsultasi. Mengembalikan storage_key foto agar objeknya ikut dihapus.
CREATE PROCEDURE purge_expired_submissions()
SQL SECURITY DEFINER
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; DROP TEMPORARY TABLE IF EXISTS tmp_purge_keys; RESIGNAL; END;
  DROP TEMPORARY TABLE IF EXISTS tmp_purge_keys;
  CREATE TEMPORARY TABLE tmp_purge_keys (storage_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL);
  START TRANSACTION;
  UPDATE access_codes SET status = 'expired' WHERE status = 'active' AND expires_at <= UTC_TIMESTAMP(3);
  INSERT INTO tmp_purge_keys (storage_key)
  SELECT i.storage_key FROM images i
   WHERE i.submission_id IN (SELECT s.id FROM submissions s WHERE s.status = 'draft' AND s.expires_at <= UTC_TIMESTAMP(3));
  DELETE FROM submissions WHERE status = 'draft' AND expires_at <= UTC_TIMESTAMP(3);
  COMMIT;
  SELECT storage_key FROM tmp_purge_keys;
  DROP TEMPORARY TABLE tmp_purge_keys;
END$$

DELIMITER ;
