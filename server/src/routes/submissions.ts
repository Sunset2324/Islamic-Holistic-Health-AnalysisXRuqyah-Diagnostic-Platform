import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AppConfig } from '../config.js';
import { decrypt, encrypt, hmacHex, newAccessCode, newEditToken } from '../crypto.js';
import { withTransaction, type Db } from '../db.js';
import { ImageRejectedError } from '../sanitizeImage.js';
import {
  MAX_IMAGES_PER_SUBMISSION,
  MAX_UPLOAD_BYTES,
  sanitizeLimited,
  sendImage,
  storeImage,
  toImageList,
  type ImageBlobRow,
  type ImageListRow,
} from '../images.js';
import { answersSchema, idParamSchema, intakeSchema, submissionBodySchema, tagSelectionsSchema, tokenSchema, type SubmissionBody } from '../validation.js';

interface Deps {
  db: Db;
  config: AppConfig;
}

const CTX = { intake: 'submission:intake', answers: 'submission:answers', tags: 'submission:tags' } as const;

interface SubmissionRow extends RowDataPacket {
  id: string;
  status: 'draft' | 'in_consultation';
  intake_enc: Buffer;
  answers_enc: Buffer;
  tag_selections_enc: Buffer;
  key_version: number;
  questionnaire_version: string;
  algorithm_version: string;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
}
interface ExpiryRow extends RowDataPacket {
  expires_at: Date | null;
}

/*
 * Pengganti fungsi SQL Postgres (create/get/update/delete_submission, issue_access_code).
 * Setiap query membatasi baris dengan id + HMAC token sekaligus, sehingga token salah, ID tak dikenal,
 * kedaluwarsa, dan terkunci tidak bisa dibedakan dari luar (semua 404 yang sama).
 */
const SQL = {
  insert: `INSERT INTO submissions
             (id, edit_token_hash, intake_enc, answers_enc, tag_selections_enc, key_version, questionnaire_version, algorithm_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  select: `SELECT id, status, intake_enc, answers_enc, tag_selections_enc, key_version, questionnaire_version,
                  algorithm_version, created_at, updated_at, expires_at
             FROM submissions
            WHERE id = ? AND edit_token_hash = ? AND (expires_at IS NULL OR expires_at > NOW(6))`,
  expiry: 'SELECT expires_at FROM submissions WHERE id = ?',
  update: `UPDATE submissions
              SET intake_enc = ?, answers_enc = ?, tag_selections_enc = ?, key_version = ?, updated_at = NOW(6)
            WHERE id = ? AND edit_token_hash = ? AND status = 'draft' AND expires_at > NOW(6)`,
  delete: "DELETE FROM submissions WHERE id = ? AND edit_token_hash = ? AND status = 'draft'",
  lockDraft: `SELECT expires_at FROM submissions
               WHERE id = ? AND edit_token_hash = ? AND status = 'draft' AND expires_at > NOW(6)
               FOR UPDATE`,
  revokeCodes: "UPDATE access_codes SET status = 'revoked' WHERE submission_id = ? AND status = 'active'",
  insertCode: 'INSERT INTO access_codes (id, submission_id, code_hash, expires_at) VALUES (?, ?, ?, ?)',
  isDraft: `SELECT 1 FROM submissions
             WHERE id = ? AND edit_token_hash = ? AND status = 'draft' AND expires_at > NOW(6)`,
  countImages: 'SELECT COUNT(*) AS n FROM images WHERE submission_id = ?',
  listImages: `SELECT i.id, i.bytes, i.created_at
                 FROM images i JOIN submissions s ON s.id = i.submission_id
                WHERE s.id = ? AND s.edit_token_hash = ? AND (s.expires_at IS NULL OR s.expires_at > NOW(6))
                ORDER BY i.created_at`,
  imageBlob: `SELECT b.storage_key, b.key_version, b.data_enc
                FROM images i
                JOIN image_blobs b ON b.storage_key = i.storage_key
                JOIN submissions s ON s.id = i.submission_id
               WHERE i.id = ? AND s.id = ? AND s.edit_token_hash = ? AND (s.expires_at IS NULL OR s.expires_at > NOW(6))`,
  deleteImage: `DELETE i FROM images i JOIN submissions s ON s.id = i.submission_id
                 WHERE i.id = ? AND s.id = ? AND s.edit_token_hash = ? AND s.status = 'draft'`,
} as const;

const imageParamSchema = idParamSchema.extend({ imageId: idParamSchema.shape.id });

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
    const id = randomUUID();
    await db.execute(SQL.insert, [id, tokenHash(token), sealed.intake, sealed.answers, sealed.tags, sealed.keyVersion, body.questionnaireVersion, body.algorithmVersion]);
    const [meta] = await db.execute<ExpiryRow[]>(SQL.expiry, [id]);
    return reply.code(201).send({ id, editToken: token, expiresAt: meta[0]?.expires_at ?? null });
  });

  app.get('/api/submissions/:id', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const token = readToken(req);
    if (!token) return reply.code(404).send(notFound);
    const [rows] = await db.execute<SubmissionRow[]>(SQL.select, [id, tokenHash(token)]);
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
    const [res] = await db.execute<ResultSetHeader>(SQL.update, [sealed.intake, sealed.answers, sealed.tags, sealed.keyVersion, id, tokenHash(token)]);
    if (res.affectedRows === 0) return reply.code(404).send(notFound);
    return reply.code(204).send();
  });

  app.delete('/api/submissions/:id', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const token = readToken(req);
    if (!token) return reply.code(404).send(notFound);
    const [res] = await db.execute<ResultSetHeader>(SQL.delete, [id, tokenHash(token)]);
    if (res.affectedRows === 0) return reply.code(404).send(notFound);
    return reply.code(204).send();
  });

  // Kode akses (Digital Handshake). Kode lama dicabut; kode baru ditampilkan sekali.
  app.post('/api/submissions/:id/access-code', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const token = readToken(req);
    if (!token) return reply.code(404).send(notFound);
    const code = newAccessCode();
    // MariaDB tidak punya partial unique index: satu kode aktif per respons dijaga dengan mengunci baris
    // submission (SELECT ... FOR UPDATE) selama cabut-lalu-terbitkan, dalam satu transaksi.
    const expiresAt = await withTransaction(db, async (conn) => {
      const [locked] = await conn.execute<ExpiryRow[]>(SQL.lockDraft, [id, tokenHash(token)]);
      const sub = locked[0];
      if (!sub || !sub.expires_at) return null;
      await conn.execute(SQL.revokeCodes, [id]);
      await conn.execute(SQL.insertCode, [randomUUID(), id, codeHash(code), sub.expires_at]);
      return sub.expires_at;
    });
    if (!expiresAt) return reply.code(404).send(notFound);
    return reply.code(201).send({ code, expiresAt });
  });

  /* ------------------------------- Foto lidah (opsional) -------------------------------
   * Badan permintaan = byte mentah (application/octet-stream). Nama file & jenis dari klien diabaikan;
   * yang menentukan hanya isi file (lihat images.ts). */
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  app.post(
    '/api/submissions/:id/images',
    { bodyLimit: MAX_UPLOAD_BYTES, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const token = readToken(req);
      if (!token) return reply.code(404).send(notFound);
      // Otorisasi dulu, baru kerja berat.
      const [ok] = await db.execute<RowDataPacket[]>(SQL.isDraft, [id, tokenHash(token)]);
      if (!ok.length) return reply.code(404).send(notFound);
      if (!Buffer.isBuffer(req.body)) return reply.code(415).send({ error: 'unsupported_media_type' });

      let clean;
      try {
        clean = await sanitizeLimited(req.body);
      } catch (err) {
        if (err instanceof ImageRejectedError) return reply.code(422).send({ error: 'image_rejected', reason: err.code });
        throw err;
      }

      const stored = await withTransaction(db, async (conn) => {
        const [locked] = await conn.execute<ExpiryRow[]>(SQL.lockDraft, [id, tokenHash(token)]);
        if (!locked[0]) return 'not_found' as const;
        const [count] = await conn.execute<(RowDataPacket & { n: number })[]>(SQL.countImages, [id]);
        if (Number(count[0]?.n ?? 0) >= MAX_IMAGES_PER_SUBMISSION) return 'limit' as const;
        return storeImage(conn, config.keyRing, { submissionId: id }, clean);
      });
      if (stored === 'not_found') return reply.code(404).send(notFound);
      if (stored === 'limit') return reply.code(409).send({ error: 'image_limit', max: MAX_IMAGES_PER_SUBMISSION });
      return reply.code(201).send(stored);
    },
  );

  app.get('/api/submissions/:id/images', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const token = readToken(req);
    if (!token) return reply.code(404).send(notFound);
    const [rows] = await db.execute<ImageListRow[]>(SQL.listImages, [id, tokenHash(token)]);
    return { images: toImageList(rows), max: MAX_IMAGES_PER_SUBMISSION };
  });

  app.get('/api/submissions/:id/images/:imageId', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id, imageId } = imageParamSchema.parse(req.params);
    const token = readToken(req);
    if (!token) return reply.code(404).send(notFound);
    const [rows] = await db.execute<ImageBlobRow[]>(SQL.imageBlob, [imageId, id, tokenHash(token)]);
    if (!rows[0]) return reply.code(404).send(notFound);
    return sendImage(reply, config.keyRing, rows[0]);
  });

  app.delete('/api/submissions/:id/images/:imageId', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id, imageId } = imageParamSchema.parse(req.params);
    const token = readToken(req);
    if (!token) return reply.code(404).send(notFound);
    const [res] = await db.execute<ResultSetHeader>(SQL.deleteImage, [imageId, id, tokenHash(token)]);
    if (res.affectedRows === 0) return reply.code(404).send(notFound);
    return reply.code(204).send();
  });
}
