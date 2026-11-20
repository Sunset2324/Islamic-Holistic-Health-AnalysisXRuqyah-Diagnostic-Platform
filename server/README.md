# Server MyHerbalis (tahap awal)

Sudah ada: respons pasien tamu (`/api/submissions`), kode akses, pembersih gambar (`src/sanitizeImage.ts`).
Belum ada: login/akun (Better Auth), sisi konsultan, unggah foto, penghapusan terjadwal.

| Endpoint | Fungsi |
|---|---|
| `POST /api/submissions` | Buat respons. Server membuat token edit (ditampilkan sekali) |
| `GET/PUT/DELETE /api/submissions/:id` | Baca/ubah/hapus, header `x-edit-token` |
| `POST /api/submissions/:id/access-code` | Terbitkan kode akses 8 karakter (kode lama dicabut) |

Token salah, kedaluwarsa, atau terkunci selalu dijawab `404 {"error":"not_found"}` yang sama.

## Menjalankan
```bash
cd server && npm install
cp .env.example .env   # isi nilai acak buatanmu sendiri
npm run dev
```
Variabel `.env` belum dibaca otomatis; muat dengan `node --env-file=.env` atau lewat environment hosting.

## Database
MariaDB/MySQL (Hostinger: MariaDB 11.8). Skema: file impor `myherbalis_hostinger_mariadb_11_8.sql`
(tanpa trigger/procedure). Logika yang dulu ada di fungsi SQL Postgres sekarang di `src/routes/submissions.ts`:
setiap query memakai prepared statement, dan penerbitan kode akses dijalankan dalam transaksi `SELECT ... FOR UPDATE`.
Dari aplikasi di Hostinger, `DATABASE_URL` memakai host `127.0.0.1`, bukan `srvNNNN.hstgr.io`.

## Tes
```bash
npm test     # tes unit (crypto, gambar); tes database dilewati bila TEST_DATABASE_URL tidak ada
TEST_DATABASE_URL=mysql://... TEST_ADMIN_URL=mysql://... npm test   # tes lengkap di database uji (JANGAN database produksi)
```
Lihat `docs/KEAMANAN-PRIVASI.md`.

## Deploy di Hostinger (Node.js, tanpa nginx)
Satu proses Node menyajikan frontend (`dist/`) **dan** `/api`, dengan header keamanan setara `deploy/nginx/`.

| Setelan Node.js di hPanel | Nilai |
|---|---|
| Framework / app type | Express (server app) |
| Node.js | 22 |
| Root directory | `.` (akar repo) |
| Build script | `build:hostinger` (= `vite build` + instal dependensi `server/`) |
| Entry file | `server/start.mjs` |

Variabel environment (isi sendiri di hPanel, jangan dikirim ke siapa pun): `DATABASE_URL`, `HMAC_PEPPER`,
`DATA_KEY_V1`, `DATA_KEY_CURRENT`, `PORT`, `TRUST_PROXY`.
- `DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/NAMA_DB` (password di-URL-encode bila ada karakter khusus).
- `HMAC_PEPPER` dan `DATA_KEY_V1`: buat di komputer sendiri, masing-masing
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Simpan cadangannya di tempat aman:
  kehilangan `DATA_KEY_V1` = data terenkripsi tidak bisa dibaca lagi.
- `DATA_KEY_CURRENT=1`, `TRUST_PROXY=true` (hanya proxy terdekat yang dipercaya). `PORT` biasanya diisi hosting.

### Penghapusan draf kedaluwarsa (cron)
`server/purge.mjs` menghapus respons draf yang melewati 7 hari (kode aksesnya ikut terhapus) dan menandai kode akses
lewat masa berlaku sebagai `expired`. Respons yang sedang dikonsultasikan tidak disentuh. Hanya jumlah baris yang dicatat.
Cron Hostinger (tiap jam):
```
/opt/alt/alt-nodejs22/root/bin/node /home/<user>/domains/<domain>/hbuilds/current/nodejs/server/purge.mjs
```
Cron tidak mewarisi variabel aplikasi; skrip memuat `.env` di akar aplikasi bila `DATABASE_URL` belum ada.

## Akun staf (konsultan & admin)
- Dashboard: `https://<domain>/#/konsultan` (gaya kaca/glossy). Tidak ada pendaftaran publik.
- **Admin pertama** dibuat sekali dari server (mis. lewat cron sekali jalan di Hostinger):
  ```
  /opt/alt/alt-nodejs22/root/bin/node --env-file=/home/<user>/domains/<domain>/hbuilds/config/.env \
    /home/<user>/domains/<domain>/hbuilds/current/nodejs/server/admin.mjs create-admin <email> "<Nama>"
  ```
  Keluarannya alamat undangan relatif (berlaku 1 jam, sekali pakai); buka dengan `https://<domain>` di depannya.
- Admin membuat akun konsultan dari dashboard; tautan undangan berlaku 72 jam dan sekali pakai (juga untuk reset sandi).
- Password: Argon2id (19 MiB, t=2, p=1), minimal 12 karakter; 5x gagal masuk -> terkunci 15 menit.
- Sesi: cookie `__Host-mh_session` (HttpOnly, Secure, SameSite=Strict, 8 jam) bertanda tangan `HMAC_PEPPER`.
  Akun dinonaktifkan atau sandi diganti -> semua sesi lama langsung tidak berlaku. Tidak ada variabel baru.
- Admin membaca laporan dalam mode baca saja; setiap pembukaan/daftar tercatat di `audit_log` (tanpa isi data pasien).
- Skema: kolom `accounts.password_hash` dan `accounts.display_name` ditambahkan otomatis saat start (idempoten).
