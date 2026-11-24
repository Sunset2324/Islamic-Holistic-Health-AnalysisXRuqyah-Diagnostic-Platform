#!/usr/bin/env bash
# Penghapusan terjadwal: respons draf yang melewati 7 hari. Hanya jumlah baris yang dicatat, tidak ada data pasien.
# TODO: fungsi mengembalikan storage_key foto yang harus ikut dihapus dari penyimpanan objek. Karena unggah foto
#       belum ada, daftar itu belum diproses; saat fitur foto dibuat, ganti skrip ini agar menghapus objeknya juga.
set -euo pipefail
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-myherbalis_purge}" PGDATABASE="${PGDATABASE:-myherbalis}"
export PGPASSFILE="${PGPASSFILE:-/etc/myherbalis/purge.pgpass}"
# Fungsi SQL menghapus respons kedaluwarsa dan HANYA mengembalikan storage_key foto yang harus dihapus dari penyimpanan objek.
# Jumlah respons yang terhapus tidak dikembalikan fungsi, jadi yang dicatat di sini adalah jumlah foto yang menunggu dihapus.
n="$(psql -X -At --no-password -v ON_ERROR_STOP=1 -c 'select count(*) from purge_expired_submissions()')"
echo "purge selesai; foto yang perlu dihapus dari penyimpanan objek: $n"
