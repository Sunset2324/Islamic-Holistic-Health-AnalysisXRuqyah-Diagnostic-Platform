#!/usr/bin/env bash
# shellcheck disable=SC2015  # pola "A && ok || bad" disengaja di skrip uji
# Menguji skrip deploy/ di PostgreSQL SEMENTARA (bukan server sungguhan): setup-postgres, make-env, backup, restore-test, purge.
# Butuh: binari PostgreSQL 16 (initdb, pg_ctl, psql), age, openssl; dijalankan sebagai root (menjalankan Postgres via 'su postgres').
# Setiap pemeriksaan mencetak PASS/FAIL; keluar != 0 bila ada FAIL.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"; PORT="${PGPORT:-5546}"
W="$(mktemp -d /tmp/verify-deploy.XXXXXX)"; chmod 755 "$W"; chown postgres "$W"
ETC="$W/etc"; BK="$W/backups"; mkdir -p "$ETC" "$BK"
PASS=0; FAIL=0
ok()   { echo "PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $1"; FAIL=$((FAIL+1)); }
check(){ local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }
# Gagal DENGAN pesan yang diharapkan (bukan gagal karena sebab lain, mis. koneksi putus).
fails_with(){ local d="$1" pat="$2"; shift 2; local out; if out="$("$@" 2>&1)"; then bad "$d (seharusnya gagal)"; elif echo "$out" | grep -qi -- "$pat"; then ok "$d"; else bad "$d (gagal tapi bukan karena: $pat -> $out)"; fi; }
nocheck(){ local d="$1"; shift; if "$@" >/dev/null 2>&1; then bad "$d"; else ok "$d"; fi; }
cleanup() { su postgres -c "$PGBIN/pg_ctl -D $W/data stop -m fast >/dev/null 2>&1" || true; rm -rf "$W"; }
trap cleanup EXIT

su postgres -c "$PGBIN/initdb -D $W/data -A trust >/dev/null && $PGBIN/pg_ctl -D $W/data -o '-p $PORT -k $W' -l $W/log start >/dev/null" || { echo "gagal menyalakan Postgres"; exit 2; }
sleep 2
# Koneksi TCP wajib kata sandi (seperti produksi); socket lokal tetap trust untuk 'superuser' uji.
sed -i 's#^\(host .*\)trust#\1scram-sha-256#' "$W/data/pg_hba.conf"
su postgres -c "$PGBIN/pg_ctl -D $W/data -o '-p $PORT -k $W' reload >/dev/null"
export ADMIN_PSQL="$PGBIN/psql -h $W -p $PORT -U postgres -X -q -v ON_ERROR_STOP=1"
export ADMIN_PG_RESTORE="$PGBIN/pg_restore -h $W -p $PORT -U postgres"
export PATH="$PGBIN:$PATH" PG_PORT="$PORT" ETC_DIR="$ETC"

echo "== setup-postgres.sh"
check "setup-postgres berhasil"            "$ROOT/deploy/setup-postgres.sh"
check "setup-postgres idempoten (kedua kali)" "$ROOT/deploy/setup-postgres.sh"
q() { $ADMIN_PSQL -d myherbalis -At -c "$1"; }
[ "$(q "select count(*) from pg_class c join pg_roles r on r.oid=c.relowner where relname='submissions' and not r.rolsuper and r.rolname='myherbalis_owner'")" = "1" ] && ok "skema dimiliki owner NON-superuser" || bad "skema dimiliki owner NON-superuser"
[ "$(q "select count(*) from pg_roles where rolname like 'myherbalis_%' and rolsuper")" = "0" ] && ok "tidak ada peran myherbalis_* superuser" || bad "tidak ada peran myherbalis_* superuser"
[ "$(q "select rolcanlogin from pg_roles where rolname='myherbalis_owner'")" = "f" ] && ok "owner tidak bisa login" || bad "owner tidak bisa login"
[ "$(stat -c %a "$ETC/backup.pgpass")" = "600" ] && ok "backup.pgpass berizin 600" || bad "backup.pgpass berizin 600"
[ ! -e "$ETC/.pw_myherbalis_backup" ] && ok "berkas kata sandi sementara dihapus" || bad "berkas kata sandi sementara dihapus"

echo "== make-env.sh"
groupadd -f myherbalis 2>/dev/null
check "make-env berhasil"                    "$ROOT/deploy/make-env.sh"
nocheck "make-env menolak menimpa api.env"   "$ROOT/deploy/make-env.sh"
[ "$(stat -c %a "$ETC/api.env")" = "640" ] && ok "api.env berizin 640" || bad "api.env berizin 640"
URL="$(grep '^DATABASE_URL=' "$ETC/api.env" | cut -d= -f2-)"
check "aplikasi bisa terhubung dengan DATABASE_URL (TCP + kata sandi)" "$PGBIN/psql" "$URL" -At -c "select 1"
[ "$("$PGBIN/psql" "$URL" -At -c "select pg_has_role(current_user,'app_api','member')")" = "t" ] && ok "myherbalis_api anggota app_api" || bad "myherbalis_api anggota app_api"
fails_with "aplikasi TIDAK bisa membaca tabel submissions langsung" "permission denied" "$PGBIN/psql" "$URL" -At -c "select * from submissions"
check "aplikasi bisa memanggil create_submission" "$PGBIN/psql" "$URL" -At -c "select create_submission(repeat('a',64), '\\x01'::bytea, '\\x01'::bytea, '\\x01'::bytea, 1::smallint, 'HHS v1.0', '1.0.0')"
fails_with "kata sandi salah ditolak" "authentication failed" "$PGBIN/psql" "postgres://myherbalis_api:salah@127.0.0.1:$PORT/myherbalis" -At -c "select 1"

echo "== backup.sh / restore-test.sh"
MARK="MARKER-RAHASIA-XYZ-12345"
q "insert into accounts (email, role) values ('$MARK@contoh.id', 'patient')" >/dev/null
age-keygen -o "$W/id.txt" 2>/dev/null; grep '^# public key:' "$W/id.txt" | cut -d' ' -f4 > "$ETC/backup.age.pub"
export BACKUP_DIR="$BK" AGE_RECIPIENT_FILE="$ETC/backup.age.pub" PGPASSFILE="$ETC/backup.pgpass" PGPORT="$PORT"
check "backup berhasil (peran backup membaca semua baris lewat RLS)" "$ROOT/deploy/backup.sh"
F="$(find "$BK" -maxdepth 1 -name '*.dump.age' | sort | head -1)"
nocheck "berkas backup TIDAK memuat teks terang" grep -qaF "$MARK" "$F"
check "restore-test berhasil + penanda tidak ada di berkas" "$ROOT/deploy/restore-test.sh" "$F" "$W/id.txt" "$MARK"
out="$("$ROOT/deploy/restore-test.sh" "$F" "$W/id.txt" 2>&1)"
echo "$out" | grep -q "tabel accounts: 1 baris" && ok "isi pulih utuh (accounts = 1 baris)" || bad "isi pulih utuh (accounts = 1 baris)"
age-keygen -o "$W/other.txt" 2>/dev/null
fails_with "restore dengan kunci privat SALAH gagal" "no identity matched" "$ROOT/deploy/restore-test.sh" "$F" "$W/other.txt"
cp "$F" "$W/rusak.dump.age"; printf '\x00' | dd of="$W/rusak.dump.age" bs=1 seek=300 conv=notrunc 2>/dev/null
nocheck "restore berkas yang diubah satu byte gagal" "$ROOT/deploy/restore-test.sh" "$W/rusak.dump.age" "$W/id.txt"
fails_with "backup menolak berkas yang berisi kunci PRIVAT" "kunci PRIVAT" env AGE_RECIPIENT_FILE="$W/id.txt" "$ROOT/deploy/backup.sh"
$ADMIN_PSQL -d myherbalis -c "alter role myherbalis_backup nobypassrls" 
fails_with "tanpa BYPASSRLS pg_dump gagal (bukan backup diam-diam tak lengkap)" "row-level security" "$ROOT/deploy/backup.sh"
$ADMIN_PSQL -d myherbalis -c "alter role myherbalis_backup bypassrls"
check "UPLOAD_CMD dipanggil dengan path berkas" env UPLOAD_CMD="cp -t $W" "$ROOT/deploy/backup.sh"
ls "$W"/myherbalis-*.dump.age >/dev/null 2>&1 && ok "berkas diunggah ada di tujuan" || bad "berkas diunggah ada di tujuan"

echo "== purge.sh"
export PGPASSFILE="$ETC/purge.pgpass"
# Satu respons kedaluwarsa (dari create_submission di atas) + satu respons kedaluwarsa dengan 2 foto + satu respons MASIH berlaku.
$ADMIN_PSQL -d myherbalis <<SQL
insert into submissions (edit_token_hash, intake_enc, answers_enc, tag_selections_enc, key_version, questionnaire_version, algorithm_version, expires_at)
  select repeat('b',64), '\\x01', '\\x01', '\\x01', 1, 'HHS v1.0', '1.0.0', now() - interval '1 minute';
insert into submissions (edit_token_hash, intake_enc, answers_enc, tag_selections_enc, key_version, questionnaire_version, algorithm_version)
  values (repeat('c',64), '\\x01', '\\x01', '\\x01', 1, 'HHS v1.0', '1.0.0');
insert into images (submission_id, bytes, sha256, storage_key)
  select id, 10, repeat('a',64), gen_random_uuid() from submissions where edit_token_hash = repeat('b',64) union all
  select id, 10, repeat('a',64), gen_random_uuid() from submissions where edit_token_hash = repeat('b',64);
update submissions set expires_at = now() - interval '1 minute' where edit_token_hash = repeat('a',64);
SQL
before="$(q "select count(*) from submissions")"
out="$("$ROOT/deploy/purge.sh" 2>&1)"
echo "$out" | grep -q "perlu dihapus dari penyimpanan objek: 2" && ok "purge melaporkan 2 foto yang perlu dihapus" || bad "purge melaporkan 2 foto ($out)"
[ "$before" = "3" ] && [ "$(q "select count(*) from submissions")" = "1" ] && ok "2 respons kedaluwarsa terhapus, 1 yang masih berlaku tetap ada" || bad "hasil purge (sebelum=$before)"
[ "$(q "select count(*) from images")" = "0" ] && ok "foto ikut terhapus dari tabel" || bad "foto ikut terhapus dari tabel"
fails_with "peran purge tidak bisa membaca tabel" "permission denied" "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U myherbalis_purge -d myherbalis -w -c "select * from submissions"

echo; echo "Ringkasan: $PASS PASS, $FAIL FAIL"; [ "$FAIL" -eq 0 ]
