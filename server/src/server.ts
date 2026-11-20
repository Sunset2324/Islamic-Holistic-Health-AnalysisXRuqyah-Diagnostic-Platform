import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

// Hasil build frontend (../../dist dari server/src). Bila ada, disajikan dari proses ini (Hostinger Node.js).
const distDir = fileURLToPath(new URL('../../dist/', import.meta.url));

const config = loadConfig();
const app = await buildApp({ config, staticDir: existsSync(distDir) ? distDir : undefined });
await app.listen({ port: config.port, host: '0.0.0.0' });
