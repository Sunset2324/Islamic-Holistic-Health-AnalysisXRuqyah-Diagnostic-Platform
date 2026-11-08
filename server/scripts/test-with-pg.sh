#!/usr/bin/env bash
# Menjalankan tes integrasi di Postgres sementara (dibuat lalu dihapus). Hanya untuk pengembangan/CI.
# Butuh binari Postgres 16 (initdb, pg_ctl) dan menjalankannya sebagai pengguna non-root.
set -euo pipefail
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
RUN_AS="${RUN_AS:-postgres}"      # kosongkan bila sudah non-root: RUN_AS=""
DIR="$(mktemp -d /tmp/pgint.XXXXXX)"; chmod 755 "$DIR"; PORT="${PGPORT:-5545}"
as() { if [ -n "$RUN_AS" ]; then su "$RUN_AS" -c "$*"; else bash -c "$*"; fi; }
[ -n "$RUN_AS" ] && chown "$RUN_AS" "$DIR"
cleanup() { as "$PGBIN/pg_ctl -D $DIR/data stop -m fast >/dev/null 2>&1" || true; rm -rf "$DIR"; }
trap cleanup EXIT
as "$PGBIN/initdb -D $DIR/data -A trust >/dev/null && $PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log start >/dev/null"
sleep 2
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
psql -h "$DIR" -p "$PORT" -U postgres -q -v ON_ERROR_STOP=1 -c "create database t" >/dev/null
psql -h "$DIR" -p "$PORT" -U postgres -d t -q -v ON_ERROR_STOP=1 -f "$ROOT/db/migrations/0001_init.sql" >/dev/null
psql -h "$DIR" -p "$PORT" -U postgres -d t -q -c "alter role app_api login password 'tes-saja'" >/dev/null
export TEST_DATABASE_URL="postgres://app_api:tes-saja@127.0.0.1:$PORT/t"
export TEST_ADMIN_URL="postgres://postgres@127.0.0.1:$PORT/t"
as "true"; sed -i 's/^#\?listen_addresses.*/listen_addresses = '"'127.0.0.1'"'/' "$DIR/data/postgresql.conf" 2>/dev/null || true
as "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR' -l $DIR/log restart >/dev/null"; sleep 2
cd "$ROOT/server" && npx vitest run "$@"
