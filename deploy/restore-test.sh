#!/usr/bin/env bash
# Uji pemulihan: dekripsi backup, pulihkan ke database SEMENTARA, periksa isinya, lalu hapus database sementara.
# Backup yang belum pernah diuji pulih = belum bisa dianggap ada. Jalankan berkala (mis. bulanan).
# Jalankan di komputer/server LAIN yang memegang kunci privat, atau sementara di server dengan kunci privat yang
# diambil dari penyimpanan offline lalu dihapus lagi. Butuh akses superuser ke PostgreSQL tujuan.
#
# Pemakaian:  restore-test.sh <berkas.dump.age> <berkas-kunci-privat-age> [penanda-teks-yang-HARUS-TIDAK-ada-di-berkas]
set -euo pipefail
umask 077
BACKUP_FILE="${1:?berkas backup (.dump.age)}"
IDENTITY="${2:?berkas kunci privat age}"
FORBIDDEN_MARKER="${3:-}"
ADMIN_PSQL=${ADMIN_PSQL:-"sudo -u postgres psql -X -q -v ON_ERROR_STOP=1"}
ADMIN_PG_RESTORE=${ADMIN_PG_RESTORE:-"sudo -u postgres pg_restore"}
SCRATCH="restore_test_$$"
EXPECTED_TABLES="accounts submissions access_codes patients consultations images account_link_codes account_link_code_reports code_attempts audit_log"

if [ -n "$FORBIDDEN_MARKER" ] && grep -qaF -- "$FORBIDDEN_MARKER" "$BACKUP_FILE"; then
  echo "GAGAL: berkas backup memuat teks terang '$FORBIDDEN_MARKER' (seharusnya terenkripsi)." >&2; exit 1
fi
if [ -f "$BACKUP_FILE.sha256" ]; then ( cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE").sha256" ); fi

cleanup() { $ADMIN_PSQL -d postgres -c "drop database if exists $SCRATCH" >/dev/null 2>&1 || true; }
trap cleanup EXIT
$ADMIN_PSQL -d postgres -c "create database $SCRATCH"

# Memulihkan sebagai superuser ke DB sementara; --no-owner/--no-acl agar tidak bergantung pada peran produksi.
age --decrypt --identity "$IDENTITY" "$BACKUP_FILE" | $ADMIN_PG_RESTORE --no-owner --no-acl --dbname "$SCRATCH" --exit-on-error

fail=0
for t in $EXPECTED_TABLES; do
  if [ "$($ADMIN_PSQL -d "$SCRATCH" -At -c "select to_regclass('public.$t') is not null")" != "t" ]; then echo "GAGAL: tabel $t tidak ada"; fail=1; continue; fi
  echo "tabel $t: $($ADMIN_PSQL -d "$SCRATCH" -At -c "select count(*) from public.$t") baris"
done
for f in create_submission get_submission update_submission accept_access_code finalize_consultation purge_expired_submissions; do
  [ "$($ADMIN_PSQL -d "$SCRATCH" -At -c "select count(*) from pg_proc where proname='$f'")" -ge 1 ] || { echo "GAGAL: fungsi $f tidak ada"; fail=1; }
done
if [ "$fail" -eq 0 ]; then
  echo "PEMULIHAN BERHASIL (database sementara dihapus)."
else
  echo "PEMULIHAN GAGAL" >&2; exit 1
fi
