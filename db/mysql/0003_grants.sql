-- MyHerbalis - hak akses MySQL 8.0. Jalankan sebagai pemilik skema/admin yang boleh CREATE ROLE dan GRANT.
-- Ganti `myherbalis` bila nama database berbeda (GRANT tidak bisa memakai variabel).
--
-- Model: aplikasi TIDAK punya hak apa pun pada tabel. Satu-satunya jalan masuk adalah EXECUTE pada prosedur.
-- Prosedur berjalan sebagai pemilik (SQL SECURITY DEFINER) dan memeriksa p_actor sendiri. Inilah pengganti RLS.
-- Tidak diberi hak ke aplikasi: fungsi/prosedur bantu (app_role_of, code_attempt_*), seluruh tabel, DDL (DROP/TRUNCATE).
--
-- Produksi: buat pengguna LOGIN terpisah (kata sandi dari secret manager, jangan ditulis di berkas ini), lalu:
--   CREATE USER 'myherbalis_api'@'127.0.0.1' IDENTIFIED BY '<dari secret manager>';
--   GRANT app_api TO 'myherbalis_api'@'127.0.0.1';  SET DEFAULT ROLE app_api TO 'myherbalis_api'@'127.0.0.1';
-- (dan hal serupa untuk app_maintenance). Pengguna LOGIN TIDAK boleh sama dengan pemilik skema.

CREATE ROLE IF NOT EXISTS 'app_api', 'app_maintenance';

GRANT EXECUTE ON PROCEDURE myherbalis.create_submission TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.get_submission TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.update_submission TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.delete_submission TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.issue_access_code TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.attach_submission_image TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.accept_access_code TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.open_consultation TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.update_consultation_draft TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.finalize_consultation TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.create_link_code TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.list_my_patients TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.list_my_consultations TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.get_my_consultation TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.list_consultation_images TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.redeem_link_code TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.list_patient_reports TO 'app_api';
GRANT EXECUTE ON PROCEDURE myherbalis.list_audit TO 'app_api';

GRANT EXECUTE ON PROCEDURE myherbalis.purge_expired_submissions TO 'app_maintenance';

-- Penjadwalan harian (cron/systemd timer, pengguna dengan peran app_maintenance):
--   CALL purge_expired_submissions();   -- hapus objek foto sesuai storage_key yang dikembalikan
