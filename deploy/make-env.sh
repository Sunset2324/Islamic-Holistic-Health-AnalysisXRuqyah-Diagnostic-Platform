#!/usr/bin/env bash
# Membuat /etc/myherbalis/api.env berisi rahasia ACAK baru. Dijalankan sekali di server sebagai root.
# Rahasia dibuat DI SERVER dan tidak pernah lewat chat, repo, atau AI.
# SETELAH ini: salin DATA_KEY_V1 dan HMAC_PEPPER ke tempat penyimpanan aman di LUAR server (pengelola kata sandi/brankas),
# TERPISAH dari backup database. Kunci hilang = data terenkripsi tidak bisa dibuka lagi.
set -euo pipefail
umask 077
ETC_DIR="${ETC_DIR:-/etc/myherbalis}"
DB_NAME="${DB_NAME:-myherbalis}"
PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
OUT="$ETC_DIR/api.env"
[ -e "$OUT" ] && { echo "$OUT sudah ada. Tidak ditimpa (menimpa kunci = data lama tidak terbaca)." >&2; exit 1; }
[ -f "$ETC_DIR/.api_db_password" ] || { echo "Tidak ada $ETC_DIR/.api_db_password. Jalankan setup-postgres.sh dulu." >&2; exit 1; }
cat > "$OUT" <<ENV
DATABASE_URL=postgres://myherbalis_api:$(cat "$ETC_DIR/.api_db_password")@$PG_HOST:$PG_PORT/$DB_NAME
HMAC_PEPPER=$(openssl rand -base64 32)
DATA_KEY_V1=$(openssl rand -base64 32)
DATA_KEY_CURRENT=1
PORT=3000
TRUST_PROXY=true
ENV
shred -u "$ETC_DIR/.api_db_password" 2>/dev/null || rm -f "$ETC_DIR/.api_db_password"
chmod 640 "$OUT"; chgrp myherbalis "$OUT" 2>/dev/null || true
echo "Dibuat: $OUT"
echo "WAJIB: simpan salinan HMAC_PEPPER dan DATA_KEY_V1 di luar server SEKARANG, terpisah dari backup database."
