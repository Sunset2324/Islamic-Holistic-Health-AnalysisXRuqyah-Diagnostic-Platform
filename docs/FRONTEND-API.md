# Frontend pasien ↔ API respons tamu

Pasien tidak perlu akun. Kuesioner tetap berjalan penuh di perangkat bila server tidak terjangkau; penyimpanan ke server hanya tambahan.

## Alur
1. Pasien mengisi isian awal dan 12 indikator, lalu melihat hasil sementara (dihitung di perangkat).
2. Saat analisis selesai, jawaban disimpan ke server (`POST /api/submissions`). Server membuat token edit dan menampilkannya **sekali**.
3. Di perangkat hanya `{id, editToken, expiresAt}` yang diingat (`localStorage`, kunci `myherbalis.submission.v1`).
4. Saat aplikasi dibuka lagi, bila ada token, `GET` memeriksa data. Halaman awal menampilkan "Anda punya jawaban tersimpan"; tombol "Lihat hasil tersimpan" memulihkan data ke layar.
5. Mengubah: analisis ulang lalu selesai → `PUT` pada respons yang sama (batas 7 hari dari dibuat tidak diperpanjang).
6. "Ajukan konsultasi" → `POST /access-code` → kode 8 karakter besar, bisa disalin. Kode hanya ditampilkan sekali di layar (tidak disimpan di perangkat).
7. "Hapus data saya" (dengan konfirmasi) → `DELETE`; token lokal dihapus setelah server menjawab.

## Yang disimpan di perangkat dan yang tidak
| Disimpan di `localStorage` | Tidak disimpan di perangkat |
|---|---|
| id respons, token edit, waktu berakhir | jawaban, nama, keluhan, Micro-Tag, hasil, kode akses |

Token hanya dikirim lewat header `x-edit-token`: tidak pernah di URL, tidak ada `console.log`, tidak ada analitik. Permintaan memakai `credentials: omit`, `cache: no-store`, `referrerPolicy: no-referrer`.

Catatan: karena memakai `localStorage` agar pasien bisa kembali mengubah dalam 7 hari, di perangkat bersama orang lain bisa membuka data itu. Tombol "Hapus data saya" tersedia di hasil sementara. Bila ingin lebih ketat, ganti ke `sessionStorage` di `src/lib/savedSubmission.ts` (konsekuensinya: tidak bisa mengubah setelah tab ditutup).

## Kesalahan (semua ramah, hasil di layar tetap tampil)
| Situasi | Pesan |
|---|---|
| Jaringan gagal | "Tidak dapat terhubung ke server…" + tombol *Coba simpan lagi* |
| 404 (tidak ada / kedaluwarsa / dikunci konsultan / token salah) | satu pesan yang sama; tidak membedakan penyebab. Tombol *Simpan sebagai data baru* |
| 429 | "Terlalu banyak percobaan…" |
| 400/413/415 | "Data tidak dapat disimpan karena ada isian yang tidak sesuai…" |
| 5xx / isi bukan JSON | "Server sedang bermasalah…" |

Data yang sudah dikunci konsultan tetap bisa dilihat (status terkunci), tetapi tidak bisa diubah. Menyimpan hasil baru dari keadaan itu hanya terjadi bila pasien menekan *Simpan sebagai data baru*; data lama tidak ditimpa.

## Pengembangan
- Dev/preview mem-proxy `/api` ke `http://localhost:3000` (ubah dengan env `API_PROXY_TARGET`). Produksi: reverse proxy yang menyajikan frontend dan `/api` dari satu origin (tanpa CORS).
- Batas dan bentuk data di `src/lib/api.ts` mencerminkan `server/src/validation.ts`; ubah keduanya bersamaan.
- Tes: `npm test` (klien API dengan fetch palsu, penyimpanan token). Uji ujung ke ujung memakai server + Postgres sementara (`server/scripts/test-with-pg.sh` sebagai contoh pola).

## Belum ada
Login pasien (riwayat laporan), pembuatan token lintas perangkat, unggah foto lidah, mode luring penuh.
