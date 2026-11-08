# Skema PostgreSQL (tanpa Supabase) - draf untuk review

Menggantikan pendekatan `supabase/` (folder itu **draf lama**, sengaja dibiarkan; skema di sini tidak memakai `auth.uid()`, peran `anon/authenticated`, atau RPC Supabase).
Isi: `migrations/0001_init.sql` dan `tests/flow.sql` (104 kasus PASS/FAIL). Belum ada kode backend yang memakainya. Tidak ada kunci/URL di file ini.

## Menjalankan
```bash
createdb myherbalis_test
psql -v ON_ERROR_STOP=1 -d myherbalis_test -f db/migrations/0001_init.sql
psql -v ON_ERROR_STOP=1 -d myherbalis_test -f db/tests/flow.sql   # exit != 0 bila ada FAIL
```
Uji hanya di database kosong. Butuh ekstensi `citext` (contrib) dan Postgres 13+ (`gen_random_uuid`, `sha256` bawaan).

## Tabel
`accounts`, `submissions`, `access_codes`, `patients`, `consultations`, `images`, `account_link_codes`, `account_link_code_reports`, `code_attempts`, `audit_log`; tampilan `patient_visible_reports`.

## Prinsip
| Hal | Cara |
|---|---|
| Kredensial | Tidak ada kolom password. Sesi/hash password/2FA ada di tabel milik library auth (Better Auth). `accounts` = identitas + peran. |
| Enkripsi | Kolom `*_enc` berisi ciphertext dari **aplikasi** (mis. AES-256-GCM). DB tidak memegang kunci. `key_version` = versi kunci baris itu (backend mengenkripsi ulang semua blob satu baris sekaligus bila versi berubah). Kolom `*_enc` tidak disalin ke `audit_log`. |
| Token dan kode | Backend mengirim **HMAC-SHA256 hex** (pepper rahasia di luar DB), bukan nilai asli. Minimal 32 karakter untuk token dipaksa di backend sebelum di-hash. |
| Identitas per transaksi | Backend memanggil `select set_config('app.account_id', '<uuid>', true)` dari sesi terautentikasi. Fungsi dan RLS memakainya. |
| Hak akses | Peran `app_api` (tanpa hak ke `submissions`, `access_codes`, `account_link_codes`, `code_attempts`; hanya baca terbatas dengan RLS; update hanya kolom isian draf laporan). Peran `app_maintenance` hanya boleh `purge_expired_submissions()`. Di produksi buat peran LOGIN dan `grant app_api to ...`. |
| RLS | Lapis kedua. Tidak `FORCE`, karena fungsi `SECURITY DEFINER` (pemilik) perlu melewatinya. Pemilik skema harus peran non-superuser. |

## Alur utama
1. Pasien tamu: `create_submission` (token) → `update_submission` (sampai 7 hari, tidak diperpanjang) → `issue_access_code`. Foto: `attach_submission_image` (maks. 3; hanya metadata, isi di object storage).
2. Konsultan: `accept_access_code` (sekali pakai; respons terkunci) → backend mendekripsi nama → `open_consultation` (salinan blob, foto dipindah) → isi draf lewat `UPDATE` kolom yang diizinkan → `finalize_consultation` (wajib penilaian ruqyah + saran konsultan).
3. Laporan append-only: yang baru menandai yang lama `is_current = false` dan mengisi `supersedes_id`.
4. Pasien melihat hanya lewat `patient_visible_reports`: laporan final yang **dirilis** ke akunnya. Saran konsultan selalu tampil; penilaian ruqyah dan catatan klinis tampil hanya bila `share_*` bernilai true (selain itu NULL). Saran sistem dan snapshot jawaban tidak ada di tampilan itu.
5. Tautan akun: konsultan `create_link_code` (hash, umur ≤ 24 jam, default 15 menit, memilih laporan) → pasien login `redeem_link_code` → `patients.account_id` terisi dan laporan terpilih dirilis. Laporan berikutnya untuk pasien yang sudah tertaut dirilis otomatis saat final.
6. Pasien tanpa akun: `patients.account_id` NULL, tidak ada riwayat untuk pasien; laporan hanya di sisi konsultan.
7. `purge_expired_submissions()` (jadwal harian) menghapus respons draf yang kedaluwarsa dan mengembalikan `storage_key` foto agar objeknya ikut dihapus.

## Asumsi (perlu dikonfirmasi)
1. Konsultan hanya melihat laporan/pasien yang ia buat sendiri (lebih ketat dari draf lama yang membolehkan semua staf). Admin hanya membaca `audit_log`.
2. Kegagalan tebak kode dikembalikan sebagai status `invalid/locked` (bukan error) supaya hitungan percobaan tersimpan; 5 gagal = kunci 15 menit **per akun** (kode salah tidak menunjuk baris). Pembatasan per IP dan untuk token pasien tamu tetap harus ada di API.
3. Kode akses dan kode tautan acak 8 karakter punya entropi rendah; keamanannya bergantung pada HMAC+pepper, umur pendek, sekali pakai, dan lockout.
4. Satu orang bisa punya beberapa baris `patients` (konsultan berbeda); satu akun boleh tertaut ke beberapa baris.
5. Laporan dirilis otomatis saat final bila pasien sudah punya akun (konsultan tidak punya opsi "tahan").
6. Setelah laporan final, respons sementara dihapus; salinan ada di `consultations`.
7. Belum ada: hapus data atas permintaan pasien untuk laporan permanen, retensi laporan, penautan ulang bila akun dihapus.
