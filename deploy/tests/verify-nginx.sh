#!/usr/bin/env bash
# Menguji konfigurasi nginx dengan nginx SUNGGUHAN di port uji (bukan produksi), dengan sertifikat swa-tanda-tangan dan
# upstream tiruan. Butuh: nginx, openssl, node, curl, dan folder dist/ hasil `npm run build`.
# shellcheck disable=SC2015
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$ROOT/dist/index.html" ] || { echo "Jalankan npm run build dulu."; exit 2; }
W="$(mktemp -d /tmp/verify-nginx.XXXXXX)"; chmod 755 "$W"
PASS=0; FAIL=0
ok(){ echo "PASS  $1"; PASS=$((PASS+1)); }; bad(){ echo "FAIL  $1"; FAIL=$((FAIL+1)); }
cleanup(){ [ -f "$W/nginx.pid" ] && kill "$(cat "$W/nginx.pid")" 2>/dev/null; [ -f "$W/up.pid" ] && kill "$(cat "$W/up.pid")" 2>/dev/null; rm -rf "$W"; }
trap cleanup EXIT
D=contoh.test; HP=8081; SP=8443; UP=3999

mkdir -p "$W/www" "$W/snippets" "$W/certs" "$W/conf.d" "$W/certbot"
cp -r "$ROOT/dist" "$W/www/myherbalis"
cp "$ROOT/deploy/nginx/myherbalis-headers.conf" "$W/snippets/"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$W/certs/privkey.pem" -out "$W/certs/fullchain.pem" -days 1 -subj "/CN=$D" >/dev/null 2>&1
sed -e "s#/etc/letsencrypt/live/__DOMAIN__#$W/certs#g" -e "s#__DOMAIN__#$D#g" -e "s#/var/www/myherbalis#$W/www/myherbalis#" \
    -e "s#/var/www/certbot#$W/certbot#" -e "s#/etc/nginx/snippets#$W/snippets#g" -e "s#listen 80;#listen $HP;#" -e "s#listen \[::\]:80;#listen [::]:$HP;#" \
    -e "s#listen 443 ssl http2;#listen $SP ssl http2;#" -e "s#listen \[::\]:443 ssl http2;#listen [::]:$SP ssl http2;#" -e "s#127.0.0.1:3000#127.0.0.1:$UP#" \
    -e "s#https://\$host\$request_uri#https://\$host:$SP\$request_uri#" -e '/listen \[::\]/d' "$ROOT/deploy/nginx/myherbalis.conf" > "$W/conf.d/site.conf"  # baris IPv6 dibuang: sandbox tanpa IPv6
cp "$ROOT/deploy/nginx/00-myherbalis-http.conf" "$W/conf.d/00.conf"
cat > "$W/nginx.conf" <<CONF
pid $W/nginx.pid; error_log $W/error.log; worker_processes 1;
events {}
http { access_log off; include /etc/nginx/mime.types; default_type application/octet-stream;
  client_body_temp_path $W/tmp1; proxy_temp_path $W/tmp2; fastcgi_temp_path $W/tmp3; uwsgi_temp_path $W/tmp4; scgi_temp_path $W/tmp5;
  include $W/conf.d/*.conf; }
CONF
cat > "$W/up.mjs" <<'JS'
import http from 'node:http';
http.createServer((req, res) => { let n = 0; req.on('data', (c) => (n += c.length)); req.on('end', () => {
  res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ xff: req.headers['x-forwarded-for'], proto: req.headers['x-forwarded-proto'], host: req.headers.host, bytes: n }));
}); }).listen(Number(process.argv[2]), '127.0.0.1');
JS
node "$W/up.mjs" "$UP" & echo $! > "$W/up.pid"

nginx -t -p "$W" -c "$W/nginx.conf" >/dev/null 2>&1 && ok "nginx -t: sintaks konfigurasi valid" || { bad "nginx -t"; nginx -t -p "$W" -c "$W/nginx.conf"; exit 1; }
nginx -p "$W" -c "$W/nginx.conf"; sleep 1
H() { curl -sk --max-time 10 -D - -o /dev/null "$@"; }
B() { curl -sk --max-time 10 "$@"; }
S="https://127.0.0.1:$SP"

h="$(H "http://127.0.0.1:$HP/halaman?x=1")"
echo "$h" | grep -q "301" && echo "$h" | grep -qi "location: https://" && ok "HTTP dialihkan (301) ke HTTPS" || bad "HTTP -> HTTPS"
h="$(H "$S/")"
for hd in "strict-transport-security" "x-content-type-options: nosniff" "referrer-policy: no-referrer" "x-frame-options: DENY" "content-security-policy: default-src 'self'" "permissions-policy" "cache-control: no-cache"; do
  echo "$h" | grep -qi "$hd" && ok "halaman utama memuat header: $hd" || bad "halaman utama memuat header: $hd"
done
echo "$h" | grep -qi "^server: nginx/" && bad "versi nginx tidak boleh tampil" || ok "versi nginx tidak tampil"
A="$(basename "$(find "$W/www/myherbalis/assets" -name '*.js' | head -1)")"
h="$(H "$S/assets/$A")"; echo "$h" | grep -qi "cache-control: public, max-age=31536000, immutable" && ok "aset ber-hash di-cache lama" || bad "aset ber-hash di-cache lama"
echo "$h" | grep -qi "content-security-policy" && ok "aset juga memuat header keamanan" || bad "aset juga memuat header keamanan"
h="$(H "$S/rute-spa/tidak-ada")"; echo "$h" | grep -q " 200" && ok "rute SPA jatuh ke index.html (200)" || bad "rute SPA jatuh ke index.html"
h="$(H "$S/assets/tidak-ada.js")"; echo "$h" | grep -q " 404" && ok "aset yang tidak ada = 404 (bukan index.html)" || bad "aset yang tidak ada = 404"
h="$(H "$S/.git/config")"; echo "$h" | grep -q " 404" && ok "berkas tersembunyi ditolak (404)" || bad "berkas tersembunyi ditolak"

r="$(B -H 'X-Forwarded-For: 6.6.6.6' "$S/api/submissions/x")"
echo "$r" | grep -q '"xff":"127.0.0.1"' && ok "X-Forwarded-For dari klien DIABAIKAN (diisi IP asli)" || bad "X-Forwarded-For diabaikan ($r)"
echo "$r" | grep -q '"proto":"https"' && ok "X-Forwarded-Proto = https" || bad "X-Forwarded-Proto = https"
code="$(head -c 200000 /dev/zero | tr '\0' a | curl -sk -o /dev/null -w '%{http_code}' -X POST --data-binary @- "$S/api/submissions")"
[ "$code" = "413" ] && ok "badan >128 KB ditolak nginx (413)" || bad "badan >128 KB ditolak nginx (kode $code)"
h="$(H "$S/api/x")"; echo "$h" | grep -qi "strict-transport-security" && ok "respons API memuat HSTS" || bad "respons API memuat HSTS"
n429=0; for _ in $(seq 1 80); do c="$(curl -sk -o /dev/null -w '%{http_code}' "$S/api/x")"; [ "$c" = "429" ] && n429=$((n429+1)); done
[ "$n429" -gt 0 ] && ok "batas laju nginx aktif (429 setelah burst; $n429 dari 80)" || bad "batas laju nginx aktif"
proto="$(curl -sk --tlsv1.1 --tls-max 1.1 -o /dev/null -w '%{http_code}' "$S/" 2>/dev/null)"; [ "$proto" = "000" ] && ok "TLS 1.1 ditolak" || bad "TLS 1.1 ditolak ($proto)"

if command -v node >/dev/null && NODE_PATH="$(npm root -g 2>/dev/null)" node -e "require('playwright')" 2>/dev/null; then
  NODE_PATH="$(npm root -g)" node "$ROOT/deploy/tests/csp-browser.cjs" "$S/" && ok "alur pasien penuh di browser tanpa pelanggaran CSP" || bad "alur pasien di browser melanggar CSP"
else
  echo "LEWATI  uji browser CSP (playwright tidak terpasang)"
fi

echo; echo "Ringkasan: $PASS PASS, $FAIL FAIL"; [ "$FAIL" -eq 0 ]
