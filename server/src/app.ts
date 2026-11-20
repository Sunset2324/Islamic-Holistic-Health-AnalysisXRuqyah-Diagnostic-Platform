import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import { createPool, type Db } from './db.js';
import { registerStaffRoutes } from './routes/staff.js';
import { registerSubmissionRoutes } from './routes/submissions.js';
import { registerStatic } from './static.js';

export interface BuildOptions {
  config: AppConfig;
  db?: Db;
  logger?: boolean;
  /** Hanya untuk tes: tujuan log. */
  logStream?: NodeJS.WritableStream;
  /** Folder hasil build frontend (dist/). Bila diisi, frontend disajikan dari proses ini juga (hosting tanpa nginx). */
  staticDir?: string;
}

export async function buildApp({ config, db, logger = true, logStream, staticDir }: BuildOptions): Promise<FastifyInstance> {
  const pool = db ?? createPool(config.databaseUrl);

  const app = Fastify({
    // Hanya SATU proxy terdekat yang dipercaya (bukan seluruh rantai X-Forwarded-For), sehingga klien tidak bisa
    // memalsukan IP dengan mengirim header X-Forwarded-For sendiri untuk lolos dari batas laju.
    trustProxy: config.trustProxy ? (_address: string, hop: number) => hop === 0 : false,
    bodyLimit: 128 * 1024,
    logger: logger
      ? {
          level: 'info',
          ...(logStream ? { stream: logStream } : {}),
          // Token/kredensial tidak pernah masuk log. Isi body tidak dicatat sama sekali.
          redact: {
            paths: [
              'headers["x-edit-token"]', 'headers.authorization', 'headers.cookie', 'headers["set-cookie"]',
              'req.headers["x-edit-token"]', 'req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]',
            ],
            censor: '[disembunyikan]',
          },
        }
      : false,
  });

  // Penyimpanan batas di memori proses. Bila API dijalankan di >1 instance, pakai store bersama (mis. Redis).
  await app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((error: unknown, _req, reply) => {
    const err = error as Error;
    if (err instanceof ZodError) return reply.code(400).send({ error: 'invalid_request' });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: 'request_error' });
    app.log.error({ err: { name: err.name, code: (err as { code?: string }).code } }, 'kesalahan tak terduga');
    return reply.code(500).send({ error: 'internal_error' });
  });

  // Alamat tak dikenal (mis. /api/xyz saat frontend tidak disajikan): JSON 404 tanpa cache.
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff').send({ error: 'not_found' }),
  );

  // API: konteks terpisah dengan header ketat miliknya sendiri (tidak berlaku untuk halaman frontend).
  await app.register(async (api) => {
    await api.register(helmet, {
      // API murni JSON: tidak ada konten yang boleh dimuat/dijalankan dari responsnya.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    });
    api.addHook('onSend', async (_req, reply, payload) => {
      reply.header('Cache-Control', 'no-store');
      return payload;
    });
    registerSubmissionRoutes(api, { db: pool, config });
    registerStaffRoutes(api, { db: pool, config });
  });

  if (staticDir) await app.register(async (web) => registerStatic(web, staticDir));
  app.addHook('onClose', async () => {
    if (!db) await pool.end();
  });
  return app;
}
