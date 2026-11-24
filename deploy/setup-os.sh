#!/usr/bin/env bash
# Penyiapan dasar server Ubuntu LTS BARU: pembaruan, firewall, fail2ban, pembaruan otomatis, pengguna layanan, SSH hanya kunci.
# Dijalankan sebagai root. TIDAK DIUJI di server sungguhan (hanya lolos shellcheck); jalankan per bagian dan baca setiap langkah.
#
# !! BAHAYA TERKUNCI DARI SERVER !!  Bagian SSH mematikan login kata sandi dan login root. Skrip menolak lanjut bila
# pengguna admin belum punya authorized_keys. Setelah selesai, JANGAN tutup sesi SSH lama sebelum berhasil
# login di sesi BARU dengan kunci. Bila ragu, pakai konsol web penyedia (VNC/terminal) sebagai jalan keluar.
#
# Pemakaian:  ADMIN_USER=namaanda ./setup-os.sh
set -euo pipefail

ADMIN_USER="${ADMIN_USER:?isi ADMIN_USER dengan pengguna non-root yang sudah punya SSH key (dan sudo)}"
export DEBIAN_FRONTEND=noninteractive
[ "$(id -u)" -eq 0 ] || { echo "Jalankan sebagai root." >&2; exit 1; }
id "$ADMIN_USER" >/dev/null 2>&1 || { echo "Pengguna $ADMIN_USER tidak ada. Buat dulu: adduser $ADMIN_USER && usermod -aG sudo $ADMIN_USER" >&2; exit 1; }
KEYS="$(getent passwd "$ADMIN_USER" | cut -d: -f6)/.ssh/authorized_keys"
[ -s "$KEYS" ] || { echo "$KEYS kosong/tidak ada. Pasang SSH key $ADMIN_USER dulu, lalu uji login dengan key, baru jalankan ulang." >&2; exit 1; }

echo "== 1. Pembaruan dan paket"
apt-get update
apt-get -y upgrade
apt-get install -y --no-install-recommends ufw fail2ban unattended-upgrades nginx certbot postgresql age openssl curl ca-certificates

echo "== 2. Pembaruan keamanan otomatis"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

echo "== 3. Pengguna layanan (tanpa login, tanpa shell)"
for u in myherbalis myherbalis-backup myherbalis-purge; do
  id "$u" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$u"
done
mkdir -p /opt/myherbalis /var/backups/myherbalis /etc/myherbalis
chown myherbalis-backup /var/backups/myherbalis; chmod 700 /var/backups/myherbalis
chmod 711 /etc/myherbalis

echo "== 4. Firewall: hanya SSH (dibatasi laju), HTTP, HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== 5. fail2ban (jail sshd bawaan Ubuntu aktif)"
systemctl enable --now fail2ban

echo "== 6. SSH hanya kunci, tanpa login root"
cat > /etc/ssh/sshd_config.d/10-myherbalis.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
sshd -t
systemctl reload ssh || systemctl reload sshd
echo "SSH dimuat ulang. BUKA SESI BARU dan uji login dengan kunci SEKARANG sebelum menutup sesi ini."

echo "== 7. Zona waktu dibiarkan UTC (disarankan; timer systemd memakai UTC)."
echo "Selesai. Berikutnya: deploy/setup-postgres.sh, lalu ikuti docs/DEPLOY-VPS.md."
