import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import { decrypt, encrypt, hmacHex, newAccessCode, newEditToken } from '../crypto.js';
import { isBusinessError, type Db } from '../db.js';
import { answersSchema, idParamSchema, intakeSchema, submissionBodySchema, tagSelectionsSchema, tokenSchema, type SubmissionBody } from '../validation.js';

interface Deps {
  db: Db;
  config: AppConfig;
}

const CTX = { intake: 'submission:intake', answers: 'submission:answers', tags: 'submission:tags' } as const;

export function registerSubmissionRoutes(app: FastifyInstance, { db, config }: Deps): void {
  const tokenHash = (token: string) => hmacHex(config.pepper, 'edit-token', token);
  const codeHash = (code: string) => hmacHex(config.pepper, 'access-code', code);

  /** Token wajib ada dan berbentuk benar. Gagal/ salah/ kedaluwarsa/ terkunci semua dijawab 404 yang sama. */
  function readToken(req: FastifyRequest): string | null {
    const header = req.headers['x-edit-token'];
    const parsed = tokenSchema.safeParse(typeof header === 'string' ? header : '');
    return parsed.success ? parsed.data : null;
  }
  const notFound = { error: 'not_found' };

  function seal(body: SubmissionBody) {
    const intake = encrypt(config.keyRing, CTX.intake, Buffer.from(JSON.stringify(body.intake)));
    const answers = encrypt(config.keyRing, CTX.answers, Buffer.from(JSON.stringify(body.answers)));
    const tags = encrypt(config.keyRing, CTX.tags, Buffer.from(JSON.stringify(body.tagSelections)));
    return { intake: intake.blob, answers: answers.blob, tags: tags.blob, keyVersion: intake.keyVersion };
  }

  // Pasien membuat respons. Token dibuat server dan ditampilkan SEKALI; DB hanya menyimpan HMAC-nya.
  app.post('/api/submissions', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = submissionBodySchema.parse(req.body);
    const token = newEditToken();
    const sealed = seal(body);
    const { rows } = await db.query<{ id: string }>(
      'select create_submission($1, $2, $3, $4, $5::smallint, $6, $7) as id',
      [tokenHash(token), sealed.intake, sealed.answers, sealed.tags, sealed.keyVersion, body.questionnaireVersion, body.algorithmVersion],
    );
    const { rows: meta } = await db.query<{ expires_at: Date }>('select expires_at from get_submission($1, $2)', [rows[0]!.id, tokenHash(token)]);
    return reply.code(201).send({ id: rows[0]!.id, editToken: token, expiresAt: meta[0]?.expires_at ?? null });
  });

  app.get('/api/submissions/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const token = readToken(req);
    if (!token) return reply.code(404).send(notFound);
    const { rows } = await db.query('select * from get_submission($1, $2)', [id, tokenHash(token)]);
    const row = rows[0];
    if (!row) return reply.code(404).send(notFound);
    const open = (ctx: string, blob: Buffer) => JSON.parse(decrypt(config.keyRing, ctx, row.key_version, blob).toString('utf8'));
    return {
      id: row.id,
      status: row.status,
      intake: intakeSchema.parse(open(CTX.intake, row.intake_enc)),
      answers: answersSchema.parse(open(CTX.answers, row.answers_enc)),
      tagSelections: tagSelectionsSchema.parse(open(CTX.tags, row.tag_selections_enc)),
      questionnaireVersion: row.questionnaire_version,
      algorithmVersion: row.algorithm_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
    };
  });

  app.put('/api/submissions/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = submissionBodySchema.parse(req.body);
    const token = readToken(req);
    if (!token) return reply.code(404).send(notFound);
    const sealed = seal(body);
    try {
      await db.query('select update_submission($1, $2, $3, $4, $5, $6::smallint)', [id, tokenHash(token), sealed.intake, sealed.answers, sealed.tags, sealed.keyVersion]);
    } catch (err) {
      if (isBusinessError(err)) return reply.code(404).send(notFound);
      throw err;
    }
    return reply.code(204).send();
  });

  app.delete('/api/submissions/:id', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const token = readToken(req);
    if (!token) return reply.code(404).send(notFound);
    try {
      await db.query('select delete_submission($1, $2)', [id, tokenHash(token)]);
    } catch (err) {
      if (isBusinessError(err)) return reply.code(404).send(notFound);
      throw err;
    }
    return reply.code(204).send();
  });

  // Kode akses (Digital Handshake). Kode lama dicabut; kode baru ditampilkan sekali.
  app.post('/api/submissions/:id/access-code', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const token = readToken(req);
    if (!token) return reply.code(404).send(notFound);
    const code = newAccessCode();
    try {
      await db.query('select issue_access_code($1, $2, $3)', [id, tokenHash(token), codeHash(code)]);
    } catch (err) {
      if (isBusinessError(err)) return reply.code(404).send(notFound);
      throw err;
    }
    const { rows } = await db.query<{ expires_at: Date }>('select expires_at from get_submission($1, $2)', [id, tokenHash(token)]);
    return reply.code(201).send({ code, expiresAt: rows[0]?.expires_at ?? null });
  });
}
