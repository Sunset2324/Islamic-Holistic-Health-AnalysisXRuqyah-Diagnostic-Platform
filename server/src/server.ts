import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { ensureSchema } from './schema.js';

// Hasil build frontend (../../dist dari server/src). Bila ada, disajikan dari proses ini (Hostinger Node.js).
const distDir = fileURLToPath(new URL('../../dist/', import.meta.url));

const config = loadConfig();
const db = createPool(config.databaseUrl);
await ensureSchema(db);
const app = await buildApp({ config, db, staticDir: existsSync(distDir) ? distDir : undefined });
app.addHook('onClose', async () => {
  await db.end();
});
await app.listen({ port: config.port, host: '0.0.0.0' });
