# Keamanan dan privasi pasien (rencana + status)

Status: ✅ sudah ada di repo · 🔜 belum dibuat (jadi syarat saat backend dibangun)

## Prinsip
1. Data pasien tidak keluar ke pihak ketiga (font, gambar, analitik, CDN) — ✅ frontend tidak lagi memanggil host luar.
2. Isi lebih penting dari nama: file unggahan dinilai dari byte-nya, bukan nama/ekstensi/Content-Type — ✅ `server/src/sanitizeImage.ts`.
3. Simpan sesedikit mungkin, selama mungkin seperlunya (hapus otomatis 7 hari untuk respons yang tidak jadi konsultasi).
4. Rahasia (kunci, token, URL database) hanya di `.env`/secret manager, tidak pernah di repo atau chat.

## Unggahan gambar (foto lidah)
✅ `sanitizeImage(buffer)` — diuji 15 kasus, termasuk mutasi (pembersihan dimatikan → tes gagal):
- Nama file dan Content-Type klien diabaikan sepenuhnya.
- Hanya JPEG/PNG/WebP (dari byte awal). SVG, GIF, HTML, PDF, ZIP ditolak.
- File berkepala PNG tetapi isinya HTML/rusak ditolak.
- File PNG/JPEG sah yang ditempeli HTML/skrip di akhir (polyglot) → gambar diterima, tetapi **hasil dibuat ulang** sebagai WebP baru sehingga HTML/skrip hilang.
- Komentar/chunk teks, EXIF (termasuk GPS dan model kamera), XMP, profil warna dibuang. Orientasi EXIF diterapkan ke piksel dulu.
- Batas ukuran file (8 MB), jumlah piksel (40 juta, menahan decompression bomb), gambar beranimasi ditolak, sisi terpanjang hasil 2048 px.

🔜 Saat endpoint unggah dibuat:
- Simpan hanya hasil `sanitizeImage`, tidak pernah file asli. Nama file di server = UUID acak, bukan nama dari klien.
- Simpan di luar folder publik; akses hanya lewat endpoint yang memeriksa hak akses. Enkripsi saat disimpan.
- Sajikan dengan `Content-Type: image/webp`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`, `Cache-Control: private, no-store`.
- Batasi jumlah unggahan per pasien/IP, dan jalankan pemrosesan gambar dengan batas memori/waktu.
- Foto lidah termasuk data biometrik/kesehatan: hapus bersama respons yang kedaluwarsa.

## Frontend
- ✅ Font Plus Jakarta Sans dimuat dari paket lokal (`@fontsource`), bukan Google Fonts.
- ✅ Gambar hero dari Pexels diganti ilustrasi lokal. Tidak ada permintaan ke host lain (diuji di browser: hanya host aplikasi).
- 🔜 Header keamanan di hosting: `Content-Security-Policy` (default-src 'self'), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (matikan kamera/mikrofon/lokasi kecuali dipakai).
- 🔜 Jangan simpan jawaban pasien di localStorage/analitik; token edit di penyimpanan yang dibatasi.

## Backend (usulan, menunggu persetujuan stack)
Node.js + TypeScript, PostgreSQL (user DB berhak minimal), autentikasi dengan library teruji (Argon2id minimal 19 MiB/2 iterasi/1 paralel menurut OWASP), enkripsi kolom sensitif AES-256-GCM dengan kunci di secret manager, validasi skema (Zod), rate limit endpoint kode, log dengan redaksi, audit append-only, backup terenkripsi.

## Catatan hukum (hanya catatan, belum dikerjakan)
- UU PDP (UU 27/2022) dan PP 33/2026 (berlaku 16 Januari 2027 menurut ringkasan SIP Law Firm: https://siplawfirm.id/resources/pp-33-2026-pelindungan-data-pribadi): antara lain pemberitahuan kegagalan pelindungan data 3×24 jam, DPIA untuk pemrosesan skala besar, DPO bila kriteria terpenuhi.
- Belum dicek: perlakuan khusus data kesehatan, lokasi server/residensi data. Konsultasikan ke ahli hukum sebelum dipakai pasien sungguhan.
