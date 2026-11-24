// Uji coba analisis foto lidah. Lihat src/tongue-cli.ts.
//   cd server
//   node --env-file=.env tongue.mjs foto1.jpg folder-foto/ --csv hasil.csv
// ANTHROPIC_API_KEY diisi di server/.env (sudah di-gitignore). Jangan kirim kunci ke siapa pun.
import { register } from 'tsx/esm/api';

register();
const { runCli } = await import('./src/tongue-cli.ts');
process.exitCode = await runCli(process.argv.slice(2), process.env);
