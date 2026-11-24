# Panduan penyiapan server VPS (satu server)

Untuk: pengembang fullstack yang belum biasa mengurus server. Target: VPS Linux (Ubuntu LTS, akses root), satu server berisi
Nginx + Node (API) + PostgreSQL. **Belum diuji di VPS sungguhan.** Bagian yang sudah diuji di sandbox dan caranya ada di bagian 13.

> **Aturan utama:** jangan pernah memberikan akses root, SSH, kata sandi database, `.env`, atau kunci enkripsi kepada AI atau
> orang yang tidak berwenang, termasuk lewat chat. Semua rahasia dibuat dan disimpan di server atau brankas milikmu sendiri.

## 1. Minimum yang tidak boleh dilewati (budget terbatas)
| Boleh ditunda | TIDAK boleh dilewati sebelum ada pasien sungguhan |
|---|---|
| Server cadangan, pemantauan berbayar, CDN | TLS (HTTPS), firewall, SSH hanya kunci |
| Domain mewah, email transaksional | **Backup harian terenkripsi + salinannya di luar server + uji pemulihan** |
| Redis untuk batas laju (selama 1 instance) | Kunci enkripsi dicadangkan di luar server, terpisah dari backup database |
| | Database tidak terbuka ke internet; pembaruan keamanan otomatis |

Tanpa server layak, pakai **data contoh** saja. Jangan memasukkan data pasien sungguhan ke laptop atau paket gratis yang bisa menjeda/menghapus database.

## 2. Kebutuhan dan pilihan
- VPS KVM dengan root penuh, 2 GB RAM atau lebih nyaman (Node + Postgres + Nginx), disk 40 GB+. Pilih **lokasi saat memesan**; lokasi tidak bisa diganti tanpa backup dan pasang ulang. (Hostinger menyebut lokasi VPS Asia: India, Indonesia, Malaysia; verifikasi saat memesan.)
- Domain yang A-recordnya mengarah ke IP server (untuk sertifikat Let's Encrypt).
- Sistem operasi: Ubuntu LTS. Skrip ditulis dan diuji untuk Ubuntu 24.04 (Nginx 1.24, PostgreSQL 16). **Versi lain belum diuji.**
- Tanpa Docker: lebih sedikit bagian yang bergerak untuk satu server kecil. (Pilihan ini penilaian saya, bukan keharusan.)
- Node.js 22 (server diuji di v22). Pasang dengan cara resmi dari nodejs.org atau repositori yang kamu percaya, lalu cek `node -v`. Cara pemasangan ini **tidak saya uji**.

## 3. Sebelum menyentuh server (di komputermu)
1. Buat SSH key bila belum: `ssh-keygen -t ed25519`. Simpan kunci privat dengan aman.
2. Pesan VPS, pilih Ubuntu LTS dan lokasi. Tambahkan **kunci publik** saat pesan bila ada opsinya.
3. Buat kunci **age** untuk backup (di komputermu, BUKAN di server): `age-keygen -o backup-kunci-privat.txt`. Baris `# public key: age1...` adalah kunci publik; hanya itu yang masuk server. **Kunci privat disimpan offline** (mis. di pengelola kata sandi dan satu salinan fisik). Tanpanya backup tidak bisa dibuka.

## 4. Penyiapan server baru
Masuk sebagai root dengan kunci, buat pengguna admin, lalu jalankan skrip:
```bash
adduser namaanda && usermod -aG sudo namaanda
mkdir -p /home/namaanda/.ssh && cp ~/.ssh/authorized_keys /home/namaanda/.ssh/ && chown -R namaanda: /home/namaanda/.ssh
# DI SESI LAIN: ssh namaanda@IP  -> pastikan BISA masuk dengan kunci sebelum lanjut
git clone <repo-kamu> /opt/myherbalis && cd /opt/myherbalis
ADMIN_USER=namaanda sudo -E ./deploy/setup-os.sh
```
`setup-os.sh` memperbarui paket, mengaktifkan pembaruan keamanan otomatis, firewall (22 dibatasi laju, 80, 443), fail2ban, pengguna layanan tanpa login, dan **mematikan login kata sandi dan login root**. **Bahaya terkunci:** skrip menolak lanjut bila `namaanda` belum punya kunci, tetapi tetap uji login di sesi baru sebelum menutup sesi lama. Bila terkunci, pakai konsol web dari penyedia.

## 5. PostgreSQL
```bash
sudo ./deploy/setup-postgres.sh
```
Skrip: memastikan Postgres hanya mendengarkan localhost, membuat peran `myherbalis_owner` (pemilik skema, **tidak bisa login**, non-superuser), `myherbalis_api` (aplikasi), `myherbalis_purge`, dan `myherbalis_backup`, dengan kata sandi acak yang ditulis ke `/etc/myherbalis/*.pgpass` berizin 600. Lalu menerapkan `db/migrations` sebagai pemilik non-superuser. Aman dijalankan ulang; kata sandi tidak diganti.
- Enkripsi at-rest: **jangan berasumsi disk VPS terenkripsi.** Kolom sensitif sudah dienkripsi oleh aplikasi (AES-256-GCM), jadi isi database tanpa kunci aplikasi tidak terbaca. Namun nama-nama tabel, waktu, dan metadata tetap terlihat. Tanyakan ke penyedia apakah disk dienkripsi; bila tidak, anggap tidak.
- Migrasi baru di masa depan: jalankan sebagai `myherbalis_owner` (`sudo -u postgres psql -d myherbalis -c "set role myherbalis_owner" -f file.sql`), jangan sebagai superuser.

## 6. Rahasia aplikasi
```bash
sudo ./deploy/make-env.sh
```
Membuat `/etc/myherbalis/api.env` berisi `DATABASE_URL`, `HMAC_PEPPER`, `DATA_KEY_V1`, `DATA_KEY_CURRENT`, `PORT`, `TRUST_PROXY=true` (nilai acak baru; tidak menimpa berkas yang ada).
- **Segera** salin `HMAC_PEPPER` dan `DATA_KEY_V1` ke tempat aman di luar server (brankas/pengelola kata sandi), **terpisah dari backup database**.
- **`DATA_KEY_*` hilang = semua data terenkripsi tidak bisa dibuka selamanya.** `HMAC_PEPPER` hilang = semua token dan kode akses yang ada tidak berlaku lagi.
- Jangan menaruh rahasia di repo, chat, tiket, atau screenshot.
- Rotasi kunci: tambah `DATA_KEY_V2`, ubah `DATA_KEY_CURRENT=2`, restart. Data baru memakai V2, data lama tetap terbaca dengan V1 (jangan hapus V1). **Skrip enkripsi-ulang data lama belum ada (TODO).**

## 7. Aplikasi
```bash
cd /opt/myherbalis
npm ci && npm run build                  # frontend -> dist/
cd server && npm ci                      # TODO: butuh devDependencies karena menjalankan lewat tsx (lihat bagian 12)
sudo mkdir -p /var/www/myherbalis && sudo rsync -a --delete ../dist/ /var/www/myherbalis/
sudo chown -R myherbalis:myherbalis /opt/myherbalis/server   # hanya baca bagi layanan; ganti ke root bila ingin lebih ketat
sudo cp ../deploy/systemd/*.service ../deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now myherbalis-api
sudo systemctl status myherbalis-api --no-pager && sudo journalctl -u myherbalis-api -n 30 --no-pager
```
Unit `myherbalis-api` berjalan sebagai pengguna tanpa hak, dengan hardening systemd (tanpa kapabilitas, sistem berkas hanya-baca, syscall dibatasi, **hanya boleh berbicara ke localhost**). `MemoryDenyWriteExecute` sengaja tidak dipasang karena V8 membutuhkannya.

## 8. Nginx dan HTTPS
```bash
D=contoh.id                                         # domainmu
sudo cp deploy/nginx/00-myherbalis-http.conf /etc/nginx/conf.d/
sudo mkdir -p /etc/nginx/snippets /var/www/certbot
sudo cp deploy/nginx/myherbalis-headers.conf /etc/nginx/snippets/
sed "s/__DOMAIN__/$D/g" deploy/nginx/myherbalis.conf | sudo tee /etc/nginx/sites-available/myherbalis >/dev/null
```
Urutan sertifikat (agar `nginx -t` tidak gagal karena sertifikat belum ada):
1. Di `/etc/nginx/sites-available/myherbalis`, **komentari dulu blok `server { listen 443 ... }`**, aktifkan situs (`sudo ln -s ../sites-available/myherbalis /etc/nginx/sites-enabled/`, hapus `default`), `sudo nginx -t && sudo systemctl reload nginx`.
2. `sudo certbot certonly --webroot -w /var/www/certbot -d $D` (pembaruan otomatis lewat timer certbot dari paketnya; cek `systemctl list-timers | grep certbot`).
3. Buka komentar blok 443, `sudo nginx -t && sudo systemctl reload nginx`.
Konfigurasi memuat: HSTS (`max-age` 1 tahun, **tanpa preload**; preload sulit dibatalkan), CSP ketat (`default-src 'self'`, tanpa `unsafe-inline`), `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, Permissions-Policy yang mematikan kamera/mikrofon/lokasi (longgarkan saat fitur foto/suara dibuat), batas badan 128 KB (sama dengan server), batas laju 10 permintaan/detik/IP, X-Forwarded-For diisi ulang (tidak bisa dipalsukan klien), versi Nginx disembunyikan, aset ber-hash di-cache lama, halaman utama `no-cache`, `/api` tidak di-cache.
Catatan: `http2` ditulis di baris `listen` agar jalan di Nginx 1.24; di Nginx ≥ 1.25.1 itu hanya memberi peringatan *deprecated*.

## 9. Backup dan uji pemulihan (WAJIB)
1. Taruh **kunci publik** age: `echo 'age1...' | sudo tee /etc/myherbalis/backup.age.pub` (dan pastikan tidak ada kunci privat di server: `grep -r AGE-SECRET-KEY /etc /opt /home` harus kosong).
2. Siapkan tujuan unggah **di luar server** dan isi `/etc/myherbalis/backup.env`, contoh: `UPLOAD_CMD=rsync -e "ssh -i /etc/myherbalis/backup_ed25519" -t` atau perintah `rclone` pilihanmu. Backup yang hanya ada di server yang sama ikut hilang bila server hilang. (Sampai UPLOAD_CMD diisi, skrip memberi peringatan.)
3. `sudo cp deploy/systemd/myherbalis-backup.* /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now myherbalis-backup.timer` lalu uji manual: `sudo systemctl start myherbalis-backup.service && journalctl -u myherbalis-backup -n 20 --no-pager`.
4. Backup = `pg_dump` format custom, dienkripsi **age memakai kunci publik** (pencuri server tidak bisa membuka backup lama). Peran `myherbalis_backup` punya `BYPASSRLS`; tanpanya `pg_dump` gagal (diuji), jadi tidak ada backup diam-diam tak lengkap.
5. **Uji pemulihan** minimal sebulan sekali dan setelah perubahan skema, di mesin lain (butuh kunci privat age): `./deploy/restore-test.sh berkas.dump.age kunci-privat.txt`. Skrip memulihkan ke database sementara, memeriksa tabel/fungsi, mencetak jumlah baris, lalu menghapusnya. Backup yang belum pernah diuji pulih belum bisa dianggap ada.
6. Retensi lokal 14 hari (`RETENTION_DAYS`). Tentukan retensi di tujuan unggah sendiri. Cadangan **kunci enkripsi aplikasi dan kunci privat age disimpan terpisah** dari backup database.

## 10. Penghapusan terjadwal
`sudo systemctl enable --now myherbalis-purge.timer` (harian 03:15 UTC). Menghapus respons draf yang lewat 7 hari lewat `purge_expired_submissions()` sebagai peran `myherbalis_purge` yang hanya boleh menjalankan fungsi itu. Fungsi mengembalikan `storage_key` foto; **TODO:** karena unggah foto belum ada, daftar itu belum diproses. Saat foto dibuat, objeknya harus ikut dihapus. Skrip hanya mencatat jumlah, tidak ada data pasien. Log systemd diputar oleh journald; atur batas dengan `SystemMaxUse=` di `/etc/systemd/journald.conf` bila disk kecil.

## 11. Pemantauan minimum dan insiden
- Cek berkala (cron atau layanan gratis dari luar): `curl -s -o /dev/null -w '%{http_code}' https://DOMAIN/api/submissions/00000000-0000-4000-8000-000000000000` harus `404` (itu tanda API hidup). **Endpoint `/health` belum ada (TODO).**
- Pantau disk (`df -h`), `systemctl --failed`, masa berlaku sertifikat (`certbot certificates`), dan apakah `unattended-upgrades` berjalan (`/var/log/unattended-upgrades/`).
- Dugaan kebocoran: (1) isolasi: matikan layanan/firewall yang perlu, jangan hapus bukti; (2) ganti rahasia yang mungkin terbaca (kata sandi DB, pepper, kunci SSH; ingat mengganti `HMAC_PEPPER` mencabut token/kode yang ada, dan kunci enkripsi lama harus dipertahankan untuk membaca data); (3) catat kronologi dan data yang terdampak; (4) evaluasi penyebab sebelum membuka layanan lagi. Aspek hukum pemberitahuan disimpan sebagai catatan terpisah (`docs/KEAMANAN-PRIVASI.md`).

## 12. Yang BELUM ada di kode (jangan dianggap siap)
- **Login/akun dan sisi konsultan di server** (sedang direncanakan; tanpa itu, kode akses belum bisa diterima konsultan).
- Unggah foto lidah dan penghapusan objeknya; pembatasan unggahan di Nginx.
- `/health` endpoint; `server.ts` mendengarkan `0.0.0.0` (diamankan sementara oleh firewall dan `IPAddressAllow=localhost` pada unit, tetapi sebaiknya `127.0.0.1`).
- Build produksi server: sekarang berjalan lewat `tsx` (devDependency) sehingga `npm ci --omit=dev` tidak bisa dipakai.
- Pembacaan `.env` otomatis; sekarang rahasia dibaca dari environment (`EnvironmentFile` di unit).
- Skrip enkripsi-ulang untuk rotasi kunci; batas laju bersama (Redis) bila API dijalankan lebih dari satu instance.
- Pemantauan, peringatan otomatis, dan rencana pemulihan bencana tertulis.

## 13. Apa yang sudah diverifikasi (di sandbox, bukan VPS)
| Bagian | Cara verifikasi | Hasil |
|---|---|---|
| Semua skrip bash | `shellcheck` | bersih |
| setup-postgres, make-env, backup, restore-test, purge | `deploy/tests/verify-scripts.sh` pada PostgreSQL 16 sementara dengan koneksi TCP + kata sandi | 29 PASS, 0 FAIL |
| nginx | `deploy/tests/verify-nginx.sh` dengan nginx 1.24 sungguhan + sertifikat swa-tanda-tangan + upstream tiruan | 22 PASS, 0 FAIL |
| CSP | Alur pasien lengkap di Chromium lewat nginx uji; mutasi `img-src 'none'` terdeteksi | tanpa pelanggaran |
| Unit systemd | `systemd-analyze verify` | tidak ada kesalahan sintaks; hanya keluhan jalur yang tidak ada di sandbox |

Yang **tidak** teruji: `setup-os.sh` (hanya `shellcheck` dan `bash -n`), efek nyata hardening systemd, certbot dan Let's Encrypt, `UPLOAD_CMD` ke tujuan sungguhan, enkripsi disk penyedia, dan perilaku di Ubuntu selain 24.04.

## 14. Daftar periksa sebelum menerima pasien sungguhan
- [ ] HTTPS aktif dan menjawab 301 dari HTTP; `ssllabs`/`curl -I` memuat HSTS dan CSP
- [ ] Login SSH kata sandi dan root mati; hanya kunci; firewall aktif (`sudo ufw status`)
- [ ] `psql` dari luar server ke port 5432 **gagal** (`nc -zv IP 5432`)
- [ ] `api.env` berizin 640 dan tidak ada di repo; salinan `DATA_KEY_V1` dan `HMAC_PEPPER` ada di luar server
- [ ] Backup harian berjalan, **sudah diunggah ke luar server**, dan **uji pemulihan berhasil** minimal sekali
- [ ] Kunci privat age TIDAK ada di server
- [ ] Timer purge berjalan (`systemctl list-timers`)
- [ ] Pembaruan keamanan otomatis aktif
- [ ] Login konsultan dan sisi konsultan selesai dan diuji; akun konsultan hanya lewat undangan
- [ ] Kamu pernah mencoba skenario "server hilang": pulihkan ke server baru dari backup + kunci
- [ ] Catatan hukum di `docs/KEAMANAN-PRIVASI.md` sudah dikonsultasikan ke ahli hukum
