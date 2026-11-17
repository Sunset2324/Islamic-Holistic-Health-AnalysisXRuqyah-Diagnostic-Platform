# Skema MySQL 8.0 - draf untuk review

Port dari `db/migrations/0001_init.sql` (PostgreSQL). Tabel, aturan bisnis, dan alur sama; cara penjagaan aksesnya berbeda karena MySQL tidak punya Row Level Security.
Isi: `0001_schema.sql` (tabel + trigger), `0002_procedures.sql` (prosedur), `0003_grants.sql` (peran dan hak), `tests/flow.mjs` (138 kasus), `tests/test-with-mysql.sh`.
Belum ada kode backend yang memakainya (backend `server/` masih memakai PostgreSQL). Tidak ada kunci/URL/kata sandi di berkas ini.

## Menjalankan uji
```bash
db/mysql/tests/test-with-mysql.sh      # server MySQL sementara (socket lokal, data di folder temp), exit != 0 bila ada FAIL
```
Butuh `mysqld` 8.0, klien `mysql`, `node` >= 18, `openssl`. Diuji pada MySQL 8.0.46 (Ubuntu 24.04). **Belum diuji** pada MariaDB, MySQL 8.4/9.x, atau hosting bersama.
Syarat versi yang dipakai skema: expression default (8.0.13+), CHECK ditegakkan (8.0.16+), JSON_TABLE (8.0.4+), collation `utf8mb4_0900_as_ci` (8.0.1+), peran (8.0.0+).

## Model akses (pengganti RLS)
| Hal | PostgreSQL (lama) | MySQL (ini) |
|---|---|---|
| Hak aplikasi | SELECT terbatas + RLS + EXECUTE fungsi | **Hanya EXECUTE prosedur**; nol hak pada tabel |
| Identitas pelaku | `set_config('app.account_id')` per transaksi | Parameter eksplisit `p_actor` di tiap prosedur (dari sesi terautentikasi, bukan input klien) |
| Baca konsultan/pasien | SELECT + kebijakan RLS, view `patient_visible_reports` | `list_my_patients`, `list_my_consultations`, `get_my_consultation`, `list_consultation_images`, `list_patient_reports` |
| Edit draf laporan | UPDATE kolom tertentu (GRANT kolom) | `update_consultation_draft` (menimpa SEMUA kolom isian) |
| Indeks parsial | `... WHERE status='active'` | Kolom generated virtual + UNIQUE (NULL tidak bentrok) |
| `uuid[]`, `interval` | tipe array, parameter interval | array JSON (`JSON_TABLE`), menit (`p_ttl_minutes`) |
| Trigger TRUNCATE audit | ada | **tidak ada di MySQL**; aplikasi tidak diberi DROP/TRUNCATE/DELETE |
| `before`/`after` di audit_log | kolom jsonb | `old_values`/`new_values` (BEFORE kata terlarang) |

## Prosedur untuk aplikasi
Pasien tamu: `create_submission`, `get_submission`, `update_submission`, `delete_submission`, `issue_access_code`, `attach_submission_image`.
Konsultan: `accept_access_code`, `open_consultation`, `update_consultation_draft`, `finalize_consultation`, `create_link_code`, lalu prosedur baca di atas.
Pasien terdaftar: `redeem_link_code`, `list_patient_reports`. Admin: `list_audit`. Pemeliharaan: `purge_expired_submissions` (peran `app_maintenance`).
Tidak diberi hak ke aplikasi: `app_role_of`, `code_attempt_*`.
Hasil dikembalikan sebagai result set (baris pertama dari `CALL`). `accept_access_code` dan `redeem_link_code` mengembalikan kolom `status` (`ok`/`invalid`/`locked`), kegagalan lain dilempar sebagai SQLSTATE 45000 dengan pesan Indonesia.

## Aturan untuk backend
1. Panggil dalam **autocommit** dan jangan di dalam transaksi terbuka: prosedur menulis memulai transaksinya sendiri (`START TRANSACTION`), sehingga akan meng-COMMIT transaksi terbuka. Rollback otomatis bila error (diuji).
2. Sambungkan sebagai pengguna LOGIN berperan `app_api` (bukan pemilik skema). Kata sandi dari secret manager.
3. Kirim waktu/UTC tidak perlu: semua waktu di DB memakai `UTC_TIMESTAMP(3)` dan disimpan DATETIME(3) UTC. Klien sebaiknya `timezone: 'Z'`.
4. Jalankan migrasi dengan `sql_mode` ketat (berkas sudah menyetelnya); rutin menyimpan mode saat dibuat.
5. `update_consultation_draft` menimpa seluruh kolom isian: kirim ulang nilai lama untuk kolom yang tidak berubah.

## Perbedaan perilaku yang perlu diketahui (fakta dari uji, bukan asumsi)
- `FOREIGN KEY ... ON DELETE SET NULL/CASCADE` tidak mengaktifkan trigger, sehingga `consultations.source_submission_id` yang menjadi NULL karena respons dihapus **tidak** tercatat di audit (di PostgreSQL tercatat).
- Variabel sesi `@app_actor_id`/`@app_audit_reason` untuk audit disetel oleh prosedur sebelum menulis. Tulisan langsung oleh pemilik skema memakai nilai yang tersisa di sesi itu.
- Mutasi yang diuji dan **terdeteksi** (13): hak SELECT bocor, filter pemilik hilang, unique laporan terkini hilang, flag berbagi diabaikan, rollback handler hilang, purge tanpa filter kedaluwarsa, cek admin salah, cek akun nonaktif hilang, trigger append-only hilang, ambang kunci salah, audit menyalin ciphertext, cek saran konsultan hilang, cek rekam milik akun lain hilang, serta hilangnya seluruh kunci baris pada penerimaan kode.
  Satu mutasi **tidak terdeteksi**: menghapus `FOR UPDATE` pada baris `access_codes` saja. Ini aman karena kunci pada `submissions` tetap menjaga sekali pakai (mutasi ekuivalen, lapisan kedua).

## Peringatan hosting
- Membuat prosedur/trigger sebagai non-SUPER pada server ber-binary-log bisa gagal (error 1419) kecuali `log_bin_trust_function_creators=1`. **Belum diverifikasi** apakah hosting bersama Hostinger mengizinkannya.
- Pada hosting bersama biasanya hanya ada satu pengguna database. Bila begitu, pemisahan peran `app_api`/`app_maintenance` dan pembatasan "tanpa akses tabel" tidak bisa ditegakkan oleh DB: pelindungnya tinggal kode backend. **Belum diverifikasi** untuk paket Hostinger tertentu.
