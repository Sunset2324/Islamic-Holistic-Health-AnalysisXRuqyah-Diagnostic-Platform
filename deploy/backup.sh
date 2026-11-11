#!/usr/bin/env bash
# Backup harian: pg_dump (format custom) -> dienkripsi dengan age memakai KUNCI PUBLIK -> disimpan lokal -> diunggah ke luar server.
# Kunci PRIVAT age TIDAK ada di server: pencurian server tidak membuka backup lama. Simpan kunci privat offline.
# Dijalankan oleh myherbalis-backup.service (timer harian) sebagai pengguna 'myherbalis-backup'.
set -euo pipefail
umask 077

: "${BACKUP_DIR:=/var/backups/myherbalis}"
: "${AGE_RECIPIENT_FILE:=/etc/myherbalis/backup.age.pub}"
: "${RETENTION_DAYS:=14}"
# Perintah yang dipanggil dengan path file backup sebagai argumen terakhir (mis. rsync/rclone ke tempat lain).
# WAJIB di produksi: backup yang hanya ada di server yang sama ikut hilang bila server hilang.
: "${UPLOAD_CMD:=}"
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-myherbalis_backup}" PGDATABASE="${PGDATABASE:-myherbalis}"
export PGPASSFILE="${PGPASSFILE:-/etc/myherbalis/backup.pgpass}"

[ -s "$AGE_RECIPIENT_FILE" ] || { echo "Kunci publik age tidak ada: $AGE_RECIPIENT_FILE" >&2; exit 1; }
if grep -q 'AGE-SECRET-KEY' "$AGE_RECIPIENT_FILE"; then
  echo "BERHENTI: $AGE_RECIPIENT_FILE berisi kunci PRIVAT. Taruh hanya kunci publik (age1...) di server." >&2; exit 1
fi
mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$BACKUP_DIR/myherbalis-$stamp.dump.age"
tmp="$final.partial"
trap 'rm -f "$tmp"' EXIT

pg_dump --format=custom --no-password | age --recipients-file "$AGE_RECIPIENT_FILE" --output "$tmp"
[ -s "$tmp" ] || { echo "Backup kosong, dibatalkan." >&2; exit 1; }
mv "$tmp" "$final"
( cd "$BACKUP_DIR" && sha256sum "$(basename "$final")" > "$(basename "$final").sha256" )
echo "Backup: $final ($(stat -c %s "$final") byte)"

if [ -n "$UPLOAD_CMD" ]; then
  # shellcheck disable=SC2086  # UPLOAD_CMD sengaja dipecah menjadi perintah + argumen
  $UPLOAD_CMD "$final" "$final.sha256"
  echo "Unggah selesai."
else
  echo "PERINGATAN: UPLOAD_CMD kosong. Backup hanya ada di server ini." >&2
fi

# Hapus yang lebih tua dari RETENTION_DAYS hanya bila ada backup baru yang berhasil dibuat di atas.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'myherbalis-*.dump.age' -o -name 'myherbalis-*.dump.age.sha256' \) -mtime +"$RETENTION_DAYS" -delete
