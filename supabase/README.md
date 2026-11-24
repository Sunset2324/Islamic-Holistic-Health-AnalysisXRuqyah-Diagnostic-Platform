# Skema database (Fase 2, draf)

Berisi `migrations/0001_init.sql` dan `tests/flow.sql` (uji alur). **Belum ada kode aplikasi yang memakainya.**
Tidak ada kunci/URL di sini. URL dan anon key Supabase disimpan di `.env` (sudah di-gitignore), jangan dikirim ke siapa pun.

## Cara memakai
1. Buat proyek Supabase, buka SQL Editor, jalankan `0001_init.sql`.
2. Aktifkan ekstensi `pg_cron`, lalu jadwalkan penghapusan harian (perintahnya ada di komentar akhir file SQL).
3. Buat akun konsultan lewat Auth, lalu tambahkan barisnya di `staff_profiles`.

## Rancangan singkat
| Kebutuhan | Cara |
|---|---|
| Pasien tamu tanpa akun, respons privat dan bisa diubah | Token rahasia 32+ karakter dibuat di perangkat pasien; DB hanya menyimpan hash. Akses hanya lewat fungsi RPC, tidak ada akses tabel langsung. |
| Hapus otomatis 7 hari | `submissions.expires_at` + `purge_expired_submissions()` (pg_cron). |
| Digital Handshake | `issue_access_code` membuat kode 8 karakter; `accept_access_code` oleh konsultan mengakhiri kode, mengunci respons, membuat pasien + laporan draf. |
| Penilaian ruqyah wajib | Constraint `final_requires_ruqyah` + pengecekan di `finalize_consultation`. |
| Pasien tidak melihat hasil akhir | Tidak ada kebijakan baca untuk anon/pasien pada `consultations`. |
| Laporan permanen, diganti hanya oleh laporan baru | Append-only; `is_current` + `supersedes_id`; laporan final tidak bisa diubah langsung. |
| Jejak audit (HHS hal. 10) | `audit_log` lewat trigger (sebelum/sesudah, pelaku, waktu, alasan), append-only, hanya admin yang bisa baca. |

## Asumsi yang perlu kamu putuskan
1. Hitung mundur 7 hari mulai dari respons dibuat, tidak diperpanjang oleh pengeditan.
2. Respons terkunci begitu konsultan menerima kode.
3. Koreksi laporan final dibuat sebagai laporan baru, bukan menimpa (agar audit utuh). Belum ada mekanisme hapus atas permintaan pasien untuk laporan permanen.
4. Kode akses disimpan apa adanya (8 karakter, berumur pendek). Pembatasan percobaan tebak kode (rate limit) belum ada dan perlu ditambahkan di sisi API.
5. Data `intake` dan `answers` belum dienkripsi di level kolom; standar keamanan kamu tentukan nanti.
6. Hasil hitung sistem (`system_result`) diisi aplikasi; DB tidak menghitung ulang HHS.
