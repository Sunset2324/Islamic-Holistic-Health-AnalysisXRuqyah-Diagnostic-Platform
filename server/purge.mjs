// Dijalankan cron (Hostinger: hPanel -> Advanced -> Cron Jobs), tiap jam:
//   /opt/alt/alt-nodejs22/root/bin/node --env-file=/home/<user>/domains/<domain>/hbuilds/config/.env //     /home/<user>/domains/<domain>/hbuilds/current/nodejs/server/purge.mjs
// Cron tidak mewarisi variabel environment aplikasi; Hostinger menyimpannya di hbuilds/config/.env.
// Cadangan: bila DATABASE_URL tetap belum ada, .env di akar aplikasi (di luar Hostinger) dimuat. Isinya tidak pernah dicetak.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

if (!process.env.DATABASE_URL) {
  const envFile = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}
register();
await import('./src/purge-cli.ts');
