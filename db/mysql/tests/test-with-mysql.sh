#!/usr/bin/env bash
# Menjalankan uji skema MySQL pada server MySQL 8 SEMENTARA (data di direktori temp, hanya socket lokal).
# Butuh: mysqld (MySQL 8.0), klien mysql, node >= 18. Tidak menyentuh server/database lain.
# Semua kata sandi di sini hanya untuk uji dan dibuat acak per proses.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_DIR="${SQL_DIR:-$(cd "$HERE/.." && pwd)}"
TMP="$(mktemp -d)"
SOCK="$TMP/mysql.sock"
cleanup() { [ -f "$TMP/mysql.pid" ] && kill "$(cat "$TMP/mysql.pid")" 2>/dev/null || true; sleep 1; rm -rf "$TMP"; }
trap cleanup EXIT

mysqld --no-defaults --user="$(id -un)" --initialize-insecure --datadir="$TMP/data" >"$TMP/init.log" 2>&1
mysqld --no-defaults --user="$(id -un)" --datadir="$TMP/data" --socket="$SOCK" --skip-networking --mysqlx=OFF \
  --pid-file="$TMP/mysql.pid" >"$TMP/server.log" 2>&1 &
for _ in $(seq 1 60); do mysqladmin --no-defaults -uroot -S "$SOCK" ping >/dev/null 2>&1 && break; sleep 1; done
M=(mysql --no-defaults -uroot -S "$SOCK")

API_PW="$(openssl rand -hex 12)"; MAINT_PW="$(openssl rand -hex 12)"
"${M[@]}" -e "create database myherbalis character set utf8mb4 collate utf8mb4_0900_ai_ci"
for f in 0001_schema.sql 0002_procedures.sql 0003_grants.sql; do "${M[@]}" -D myherbalis < "$SQL_DIR/$f"; done
"${M[@]}" -e "create user 'uji_api'@'localhost' identified by '$API_PW'; grant 'app_api' to 'uji_api'@'localhost'; set default role 'app_api' to 'uji_api'@'localhost';
              create user 'uji_maint'@'localhost' identified by '$MAINT_PW'; grant 'app_maintenance' to 'uji_maint'@'localhost'; set default role 'app_maintenance' to 'uji_maint'@'localhost';"

cd "$HERE"
[ -d node_modules ] || npm ci --silent 2>/dev/null || npm install --silent
MYSQL_SOCKET="$SOCK" API_USER=uji_api API_PASSWORD="$API_PW" MAINT_USER=uji_maint MAINT_PASSWORD="$MAINT_PW" node flow.mjs
