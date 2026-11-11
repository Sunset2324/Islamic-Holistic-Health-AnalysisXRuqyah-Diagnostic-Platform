#!/usr/bin/env bash
# Menyiapkan database MyHerbalis di PostgreSQL yang SUDAH terpasang: peran berhak-minimal, kata sandi acak,
# penerapan skema sebagai pemilik NON-superuser, dan file kata sandi (pgpass).
# Dijalankan sebagai root di server. Aman dijalankan ulang (peran/DB yang ada dilewati; kata sandi TIDAK diganti).
#
# Peran yang dibuat:
#   myherbalis_owner   NOLOGIN + CREATEROLE : pemilik skema (tidak bisa dipakai login dari jaringan)
#   myherbalis_api     LOGIN, anggota app_api        : dipakai aplikasi (hak minimal sesuai db/migrations)
#   myherbalis_purge   LOGIN, anggota app_maintenance: hanya boleh menjalankan purge_expired_submissions()
#   myherbalis_backup  LOGIN, BYPASSRLS, pg_read_all_data : hanya membaca, untuk pg_dump
set -euo pipefail
umask 077

DB_NAME="${DB_NAME:-myherbalis}"
ETC_DIR="${ETC_DIR:-/etc/myherbalis}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$(cd "$(dirname "$0")/.." && pwd)/db/migrations}"
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
# Perintah psql sebagai superuser. Default: peer auth lewat pengguna sistem postgres.
ADMIN_PSQL=${ADMIN_PSQL:-"sudo -u postgres psql -X -q -v ON_ERROR_STOP=1"}

psql_admin() { $ADMIN_PSQL "$@"; }
rand_pw() { openssl rand -base64 33 | tr -d '/+=\n' | cut -c1-40; }

[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root." >&2; exit 1; }
mkdir -p "$ETC_DIR"; chmod 711 "$ETC_DIR"   # hanya bisa dilintasi; isi dilindungi izin tiap berkas

# 1. Pastikan PostgreSQL hanya mendengarkan localhost.
listen="$(psql_admin -At -c 'show listen_addresses')"
case "$listen" in
  localhost|127.0.0.1|'localhost,127.0.0.1'|'127.0.0.1,localhost'|'::1,127.0.0.1'|'localhost,::1') ;;
  *) echo "listen_addresses='$listen'. Ubah ke 'localhost' di postgresql.conf lalu restart, jangan membuka database ke internet." >&2; exit 1 ;;
esac
psql_admin -At -c 'show password_encryption' | grep -qx 'scram-sha-256' || echo "PERINGATAN: password_encryption bukan scram-sha-256." >&2

# 2. Peran + database (kata sandi hanya dibuat saat peran baru dibuat; dikirim lewat stdin, bukan argumen).
create_login_role() { # nama atribut-tambahan
  local name="$1" extra="${2:-}"
  if [ "$(psql_admin -At -c "select count(*) from pg_roles where rolname='$name'")" = "0" ]; then
    local pw; pw="$(rand_pw)"
    psql_admin <<SQL
create role $name login $extra password '$pw';
SQL
    printf '%s' "$pw" > "$ETC_DIR/.pw_$name"; chmod 600 "$ETC_DIR/.pw_$name"
    echo "Peran $name dibuat."
  else
    echo "Peran $name sudah ada (kata sandi tidak diubah)."
  fi
}
if [ "$(psql_admin -At -c "select count(*) from pg_roles where rolname='myherbalis_owner'")" = "0" ]; then
  psql_admin -c "create role myherbalis_owner nologin createrole"
fi
create_login_role myherbalis_api
create_login_role myherbalis_purge
create_login_role myherbalis_backup "bypassrls"
psql_admin -c "grant pg_read_all_data to myherbalis_backup"

if [ "$(psql_admin -At -c "select count(*) from pg_database where datname='$DB_NAME'")" = "0" ]; then
  psql_admin -c "create database $DB_NAME owner myherbalis_owner"
  psql_admin -c "revoke all on database $DB_NAME from public"
fi

# 3. Terapkan migrasi sebagai pemilik NON-superuser (SET ROLE), hanya bila skema belum ada.
if [ "$(psql_admin -d "$DB_NAME" -At -c "select to_regclass('public.submissions') is not null")" = "f" ]; then
  for f in "$MIGRATIONS_DIR"/*.sql; do
    echo "Menerapkan $(basename "$f")"
    psql_admin -d "$DB_NAME" -c "set role myherbalis_owner" -f "$f"
  done
else
  echo "Skema sudah ada; migrasi dilewati. Untuk migrasi baru jalankan file barunya secara manual sebagai myherbalis_owner."
fi

# 4. Hubungkan peran login ke peran skema, izinkan connect.
psql_admin -d "$DB_NAME" <<SQL
grant app_api to myherbalis_api;
grant app_maintenance to myherbalis_purge;
grant connect on database $DB_NAME to myherbalis_api, myherbalis_purge, myherbalis_backup;
SQL

# 5. File pgpass. Hanya dibuat bila kata sandi baru tersedia; jika tidak, biarkan yang lama.
write_pgpass() { # file role
  local file="$1" role="$2" pwfile="$ETC_DIR/.pw_$2"
  if [ -f "$pwfile" ]; then
    printf '%s:%s:%s:%s:%s\n' "$PG_HOST" "$PG_PORT" "$DB_NAME" "$role" "$(cat "$pwfile")" > "$file"
    chmod 600 "$file"
    # Pemilik = pengguna layanan yang memakainya (bila sudah dibuat oleh setup-os.sh).
    case "$role" in myherbalis_backup) owner=myherbalis-backup ;; myherbalis_purge) owner=myherbalis-purge ;; *) owner= ;; esac
    if [ -n "$owner" ] && id -u "$owner" >/dev/null 2>&1; then chown "$owner" "$file"; fi
    shred -u "$pwfile" 2>/dev/null || rm -f "$pwfile"
    echo "Ditulis: $file"
  fi
}
write_pgpass "$ETC_DIR/backup.pgpass" myherbalis_backup
write_pgpass "$ETC_DIR/purge.pgpass" myherbalis_purge
# Kata sandi aplikasi disimpan untuk make-env.sh (dipakai sekali, lalu dihapus).
if [ -f "$ETC_DIR/.pw_myherbalis_api" ]; then mv "$ETC_DIR/.pw_myherbalis_api" "$ETC_DIR/.api_db_password"; chmod 600 "$ETC_DIR/.api_db_password"; fi

echo "Selesai. Berikutnya: deploy/make-env.sh, lalu atur pemilik file di $ETC_DIR (lihat docs/DEPLOY-VPS.md)."
