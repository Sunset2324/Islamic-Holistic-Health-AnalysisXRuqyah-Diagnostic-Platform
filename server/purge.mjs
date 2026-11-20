// Dijalankan cron (Hostinger: hPanel -> Advanced -> Cron Jobs), mis. tiap jam:
//   /opt/alt/alt-nodejs22/root/bin/node /home/<user>/domains/<domain>/hbuilds/current/nodejs/server/purge.mjs
// Cron tidak mewarisi variabel environment aplikasi, jadi bila DATABASE_URL belum ada, berkas .env yang ditulis
// Hostinger di akar aplikasi (satu tingkat di atas folder server/) dimuat. Berkas itu tidak pernah dicetak.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

if (!process.env.DATABASE_URL) {
  const envFile = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}
register();
await import('./src/purge-cli.ts');
