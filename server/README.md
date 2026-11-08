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

## Tes
```bash
npm test                      # tes unit (crypto, gambar); tes database dilewati
./scripts/test-with-pg.sh     # tes lengkap di Postgres sementara (butuh binari Postgres 16)
```
Lihat `docs/KEAMANAN-PRIVASI.md` dan `db/README.md`.
