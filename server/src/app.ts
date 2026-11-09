import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import type { AppConfig } from './config.js';
import { createPool, type Db } from './db.js';
import { registerSubmissionRoutes } from './routes/submissions.js';

export interface BuildOptions {
  config: AppConfig;
  db?: Db;
  logger?: boolean;
  /** Hanya untuk tes: tujuan log. */
  logStream?: NodeJS.WritableStream;
}

export async function buildApp({ config, db, logger = true, logStream }: BuildOptions): Promise<FastifyInstance> {
  const pool = db ?? createPool(config.databaseUrl);

  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: 128 * 1024,
    logger: logger
      ? {
          level: 'info',
          ...(logStream ? { stream: logStream } : {}),
          // Token/kredensial tidak pernah masuk log. Isi body tidak dicatat sama sekali.
          redact: { paths: ['headers["x-edit-token"]', 'headers.authorization', 'headers.cookie', 'req.headers["x-edit-token"]', 'req.headers.authorization', 'req.headers.cookie'], censor: '[disembunyikan]' },
        }
      : false,
  });

  await app.register(helmet, {
    // API murni JSON: tidak ada konten yang boleh dimuat/dijalankan dari responsnya.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  });
  // Penyimpanan batas di memori proses. Bila API dijalankan di >1 instance, pakai store bersama (mis. Redis).
  await app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    return payload;
  });

  app.setErrorHandler((error: unknown, _req, reply) => {
    const err = error as Error;
    if (err instanceof ZodError) return reply.code(400).send({ error: 'invalid_request' });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: 'request_error' });
    app.log.error({ err: { name: err.name, code: (err as { code?: string }).code } }, 'kesalahan tak terduga');
    return reply.code(500).send({ error: 'internal_error' });
  });

  registerSubmissionRoutes(app, { db: pool, config });
  app.addHook('onClose', async () => {
    if (!db) await pool.end();
  });
  return app;
}
