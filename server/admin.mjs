// Alat admin dari server/cron. Lihat src/admin-cli.ts.
//   /opt/alt/alt-nodejs22/root/bin/node --env-file=/home/<user>/domains/<domain>/hbuilds/config/.env \
//     /home/<user>/domains/<domain>/hbuilds/current/nodejs/server/admin.mjs create-admin <email> "<Nama>"
import { register } from 'tsx/esm/api';

register();
await import('./src/admin-cli.ts');
