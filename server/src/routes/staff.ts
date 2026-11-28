import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import {
  LoginGuard,
  clearSessionCookie,
  emailSchema,
  hashPassword,
  inviteToken,
  invitePath,
  issueSession,
  loadAccountRow,
  passwordFingerprint,
  passwordSchema,
  readToken,
  sessionAccount,
  staffGate,
  toStaff,
  verifyPassword,
  type StaffAccount,
} from '../auth.js';
import type { AppConfig } from '../config.js';
import { decrypt, encrypt, hmacHex, normalizeCode, safeEqual, type KeyRing } from '../crypto.js';
import { withTransaction, type Db } from '../db.js';
import { sendImage, toImageList, type ImageBlobRow, type ImageListRow } from '../images.js';
import { answersSchema, idParamSchema, intakeSchema, tagSelectionsSchema } from '../validation.js';

interface Deps {
  db: Db;
  config: AppConfig;
}

declare module 'fastify' {
  interface FastifyRequest {
    staff?: StaffAccount;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Enkripsi data konsultasi. Konteks AAD memuat ID baris, sehingga blob tidak bisa dipindah ke baris
 * atau kolom lain. Semua kolom terenkripsi satu baris memakai satu key_version; setiap penulisan
 * mengenkripsi ulang semuanya dengan kunci terbaru (rotasi kunci berjalan alami).
 * ---------------------------------------------------------------------------------------------- */
const SNAPSHOT_FIELDS = ['snapshot_intake_enc', 'snapshot_answers_enc', 'snapshot_tags_enc'] as const;
const NOTE_FIELDS = [
  'ruqyah_assessment_notes_enc',
  'consultant_advice_enc',
  'clinical_notes_enc',
  'psychological_notes_enc',
  'physical_notes_enc',
] as const;
type EncField = (typeof SNAPSHOT_FIELDS)[number] | (typeof NOTE_FIELDS)[number];
const ctx = (consultationId: string, field: EncField) => `consultation:${consultationId}:${field}`;
const nameCtx = (patientId: string) => `patient:${patientId}:display_name`;

function seal(ring: KeyRing, context: string, value: unknown) {
  return encrypt(ring, context, Buffer.from(JSON.stringify(value), 'utf8')).blob;
}
function open<T>(ring: KeyRing, context: string, keyVersion: number, blob: Buffer | null): T | null {
  if (!blob) return null;
  return JSON.parse(decrypt(ring, context, keyVersion, blob).toString('utf8')) as T;
}

interface ConsultationRow extends RowDataPacket {
  id: string;
  patient_id: string;
  consultant_id: string;
  status: 'draft' | 'final';
  key_version: number;
  questionnaire_version: string;
  algorithm_version: string;
  snapshot_intake_enc: Buffer;
  snapshot_answers_enc: Buffer;
  snapshot_tags_enc: Buffer;
  /** Kolom lama (satu kondisi). Tidak ditulis lagi; isinya sudah dipindah ke ruqyah_conditions. */
  ruqyah_final_condition: 'A' | 'B' | 'C' | 'D' | null;
  /** MariaDB SET: string "A,C" (urut definisi), "" atau null. */
  ruqyah_conditions: string | null;
  pillar_potentials: string | null;
  ruqyah_assessment_notes_enc: Buffer | null;
  consultant_advice_enc: Buffer | null;
  clinical_notes_enc: Buffer | null;
  psychological_notes_enc: Buffer | null;
  physical_notes_enc: Buffer | null;
  share_ruqyah_with_patient: number;
  share_pillars_with_patient: number;
  share_clinical_notes_with_patient: number;
  share_psychological_with_patient: number;
  share_physical_with_patient: number;
  created_at: Date;
  updated_at: Date;
  finalized_at: Date | null;
  consultant_email: string;
  consultant_name: string | null;
  patient_name_enc: Buffer;
  patient_key_version: number;
}

const CONSULTATION_SELECT = `
  SELECT c.*, a.email AS consultant_email, a.display_name AS consultant_name,
         p.display_name_enc AS patient_name_enc, p.key_version AS patient_key_version
    FROM consultations c
    JOIN accounts a ON a.id = c.consultant_id
    JOIN patients p ON p.id = c.patient_id`;

export const RUQYAH_CODES = ['A', 'B', 'C', 'D'] as const;
export const PILLAR_CODES = ['PL', 'PM', 'PP', 'FX'] as const;

/** Pilihan unik, disimpan urut sesuai daftar (sama seperti cara MariaDB menyimpan SET). */
const pick = <T extends readonly [string, ...string[]]>(codes: T) =>
  z
    .array(z.enum(codes))
    .max(codes.length)
    .refine((v) => new Set(v).size === v.length, 'duplikat')
    .transform((v) => codes.filter((c) => v.includes(c)));

/** Isi kolom SET dari database -> daftar kode yang dikenal. */
export function parseSet<T extends readonly string[]>(raw: string | null, codes: T): T[number][] {
  if (!raw) return [];
  const parts = raw.split(',');
  return codes.filter((c) => parts.includes(c));
}

const reportSchema = z.strictObject({
  ruqyahConditions: pick(RUQYAH_CODES),
  pillars: pick(PILLAR_CODES),
  ruqyahNotes: z.string().max(4000),
  advice: z.string().max(8000),
  clinicalNotes: z.string().max(8000),
  psychologicalNotes: z.string().max(4000),
  physicalNotes: z.string().max(4000),
  shareRuqyah: z.boolean(),
  sharePillars: z.boolean(),
  shareClinicalNotes: z.boolean(),
  sharePsychological: z.boolean(),
  sharePhysical: z.boolean(),
});

const loginSchema = z.strictObject({ email: emailSchema, password: z.string().min(1).max(256) });
const setPasswordSchema = z.strictObject({ token: z.string().min(1).max(512), password: passwordSchema });
const accessCodeSchema = z.strictObject({ code: z.string().max(32) });
const newAccountSchema = z.strictObject({ email: emailSchema, displayName: z.string().trim().min(1).max(100) });

const CODE_MAX_FAILS = 5;
const CODE_LOCK_MINUTES = 15;

export function registerStaffRoutes(app: FastifyInstance, { db, config }: Deps): void {
  const { pepper, keyRing } = config;
  const loginGuard = new LoginGuard();

  async function audit(
    conn: Db | PoolConnection,
    actor: StaffAccount | null,
    action: string,
    entity: string,
    entityId: string,
    after: Record<string, unknown> | null = null,
  ): Promise<void> {
    // Hanya metadata (nama kolom, status). Isi data pasien TIDAK PERNAH masuk audit_log.
    await conn.execute('INSERT INTO audit_log (actor_id, action, entity, entity_id, `after`) VALUES (?, ?, ?, ?, ?)', [
      actor?.id ?? null,
      action,
      entity,
      entityId,
      after ? JSON.stringify(after) : null,
    ]);
  }

  /* --- Gerbang alamat rahasia: API staf hanya menjawab permintaan dari halaman staf yang sah. ---
   * Tanpa header x-staff-gate yang benar, /api/auth|staff|admin dijawab 404 seperti alamat yang tidak ada,
   * sehingga bot tidak menemukan endpoint login untuk ditebak-tebak. */
  const gate = staffGate(pepper);
  app.addHook('onRequest', async (req, reply) => {
    // Dicocokkan dengan POLA rute yang cocok (bukan URL mentah), jadi query string/trik URL tidak bisa melewatinya.
    if (!/^\/api\/(auth|staff|admin)\//.test(req.routeOptions.url ?? '')) return;
    const header = req.headers['x-staff-gate'];
    if (typeof header !== 'string' || !safeEqual(header, gate)) return reply.code(404).send({ error: 'not_found' });
  });

  /* --- Perlindungan CSRF: cookie SameSite=Strict + tolak permintaan pengubah dari situs lain. --- */
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD') return;
    const site = req.headers['sec-fetch-site'];
    const origin = req.headers.origin;
    const host = req.headers.host;
    let crossOrigin = typeof site === 'string' && site !== 'same-origin' && site !== 'none';
    if (origin) {
      try {
        crossOrigin ||= !host || new URL(origin).host !== host;
      } catch {
        crossOrigin = true; // Origin rusak / "null" -> anggap dari luar.
      }
    }
    if (crossOrigin) return reply.code(403).send({ error: 'forbidden' });
  });

  const requireStaff = (roles: readonly StaffAccount['role'][]) => async (req: FastifyRequest, reply: FastifyReply) => {
    const staff = await sessionAccount(db, pepper, req);
    if (!staff) return reply.code(401).send({ error: 'unauthenticated' });
    if (!roles.includes(staff.role)) return reply.code(403).send({ error: 'forbidden' });
    req.staff = staff;
  };
  const anyStaff = requireStaff(['consultant', 'admin']);
  const consultantOnly = requireStaff(['consultant']);
  const adminOnly = requireStaff(['admin']);

  /* =================================== Autentikasi =================================== */

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body);
    if (loginGuard.locked(email)) return reply.code(429).send({ error: 'locked' });
    const row = await loadAccountRow(db, 'email', email);
    const usable = row && !row.disabled_at && (row.role === 'consultant' || row.role === 'admin');
    const ok = await verifyPassword(usable ? row.password_hash : null, password);
    if (!ok || !row || !usable) {
      loginGuard.fail(email);
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    loginGuard.reset(email);
    issueSession(reply, pepper, row);
    await audit(db, toStaff(row), 'login', 'accounts', row.id);
    return { account: toStaff(row) };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.header('Set-Cookie', clearSessionCookie());
    return reply.code(204).send();
  });

  app.get('/api/auth/me', async (req, reply) => {
    const staff = await sessionAccount(db, pepper, req);
    if (!staff) return reply.code(401).send({ error: 'unauthenticated' });
    return { account: staff };
  });

  // Membuat password dari tautan undangan (juga dipakai untuk reset oleh admin). Sekali pakai.
  app.post('/api/auth/set-password', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (req, reply) => {
    const { token, password } = setPasswordSchema.parse(req.body);
    const payload = readToken(pepper, 'invite', token);
    const row = payload ? await loadAccountRow(db, 'id', payload.sub) : null;
    if (!payload || !row || row.disabled_at || !toStaff(row) || !safeEqual(payload.pf, passwordFingerprint(pepper, row.password_hash))) {
      return reply.code(400).send({ error: 'invalid_invite' });
    }
    const hashed = await hashPassword(password);
    // Syarat password_hash lama ikut di WHERE: dua permintaan bersamaan dengan token sama -> hanya satu berhasil.
    const [res] = await db.execute<ResultSetHeader>(
      'UPDATE accounts SET password_hash = ? WHERE id = ? AND password_hash <=> ?',
      [hashed, row.id, row.password_hash],
    );
    if (res.affectedRows === 0) return reply.code(400).send({ error: 'invalid_invite' });
    await audit(db, toStaff(row), 'set_password', 'accounts', row.id);
    issueSession(reply, pepper, { id: row.id, password_hash: hashed });
    return { account: toStaff(row) };
  });

  /* ================================ Konsultan: kode akses ================================ */

  app.post('/api/staff/access-code', { preHandler: consultantOnly, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const staff = req.staff as StaffAccount;
    const code = normalizeCode(accessCodeSchema.parse(req.body).code);

    const [locks] = await db.execute<RowDataPacket[]>(
      "SELECT 1 FROM code_attempts WHERE account_id = ? AND kind = 'access' AND locked_until > NOW(6)",
      [staff.id],
    );
    if (locks.length) return reply.code(429).send({ error: 'locked' });

    const codeHash = hmacHex(pepper, 'access-code', code);
    const consultationId = await withTransaction(db, async (conn) => {
      const [rows] = await conn.execute<RowDataPacket[]>(
        `SELECT ac.id AS code_id, s.id AS submission_id, s.intake_enc, s.answers_enc, s.tag_selections_enc, s.key_version,
                s.questionnaire_version, s.algorithm_version
           FROM access_codes ac JOIN submissions s ON s.id = ac.submission_id
          WHERE ac.code_hash = ? AND ac.status = 'active' AND ac.expires_at > NOW(6)
            AND s.status = 'draft' AND s.expires_at > NOW(6)
          FOR UPDATE`,
        [codeHash],
      );
      const sub = rows[0];
      if (!sub) return null;

      const intake = intakeSchema.parse(JSON.parse(decrypt(keyRing, 'submission:intake', sub.key_version, sub.intake_enc).toString('utf8')));
      const answers = answersSchema.parse(JSON.parse(decrypt(keyRing, 'submission:answers', sub.key_version, sub.answers_enc).toString('utf8')));
      const tags = tagSelectionsSchema.parse(JSON.parse(decrypt(keyRing, 'submission:tags', sub.key_version, sub.tag_selections_enc).toString('utf8')));

      await conn.execute("UPDATE access_codes SET status = 'accepted', accepted_by = ?, accepted_at = NOW(6) WHERE id = ?", [staff.id, sub.code_id]);
      await conn.execute("UPDATE submissions SET status = 'in_consultation', expires_at = NULL, updated_at = NOW(6) WHERE id = ?", [sub.submission_id]);

      const patientId = randomUUID();
      await conn.execute('INSERT INTO patients (id, display_name_enc, key_version, created_by) VALUES (?, ?, ?, ?)', [
        patientId,
        seal(keyRing, nameCtx(patientId), intake.name),
        keyRing.currentVersion,
        staff.id,
      ]);
      const id = randomUUID();
      await conn.execute(
        `INSERT INTO consultations (id, patient_id, consultant_id, source_submission_id, key_version, questionnaire_version,
                                    algorithm_version, snapshot_intake_enc, snapshot_answers_enc, snapshot_tags_enc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          patientId,
          staff.id,
          sub.submission_id,
          keyRing.currentVersion,
          sub.questionnaire_version,
          sub.algorithm_version,
          seal(keyRing, ctx(id, 'snapshot_intake_enc'), intake),
          seal(keyRing, ctx(id, 'snapshot_answers_enc'), answers),
          seal(keyRing, ctx(id, 'snapshot_tags_enc'), tags),
        ],
      );
      // Foto lidah pindah milik ke konsultasi (tidak lagi bisa diubah/dihapus pasien, tidak ikut purge draf).
      await conn.execute('UPDATE images SET submission_id = NULL, consultation_id = ? WHERE submission_id = ?', [id, sub.submission_id]);
      await conn.execute("DELETE FROM code_attempts WHERE account_id = ? AND kind = 'access'", [staff.id]);
      await audit(conn, staff, 'accept_code', 'consultations', id);
      return id;
    });

    if (!consultationId) {
      await db.execute(
        `INSERT INTO code_attempts (account_id, kind, attempts, locked_until) VALUES (?, 'access', 1, NULL)
         ON DUPLICATE KEY UPDATE
           attempts = IF(locked_until IS NOT NULL AND locked_until <= NOW(6), 1, attempts + 1),
           locked_until = IF(attempts >= ?, NOW(6) + INTERVAL ${CODE_LOCK_MINUTES} MINUTE, IF(locked_until <= NOW(6), NULL, locked_until))`,
        [staff.id, CODE_MAX_FAILS],
      );
      return reply.code(404).send({ error: 'invalid_code' });
    }
    return reply.code(201).send({ consultationId });
  });

  /* ================================ Konsultasi ================================ */

  function canRead(staff: StaffAccount, row: ConsultationRow) {
    return staff.role === 'admin' || row.consultant_id === staff.id;
  }

  async function loadConsultation(id: string): Promise<ConsultationRow | null> {
    const [rows] = await db.execute<ConsultationRow[]>(`${CONSULTATION_SELECT} WHERE c.id = ?`, [id]);
    return rows[0] ?? null;
  }

  /** Nama pasien untuk daftar. Satu baris yang tidak bisa didekripsi (mis. kunci hilang) tidak boleh menjatuhkan seluruh daftar. */
  const patientName = (row: ConsultationRow): string | null => {
    try {
      return open<string>(keyRing, nameCtx(row.patient_id), row.patient_key_version, row.patient_name_enc) ?? '';
    } catch {
      app.log.error({ consultationId: row.id }, 'nama pasien tidak bisa didekripsi');
      return null;
    }
  };

  app.get('/api/staff/consultations', { preHandler: anyStaff }, async (req) => {
    const staff = req.staff as StaffAccount;
    const [rows] = await db.execute<ConsultationRow[]>(
      `${CONSULTATION_SELECT} ${staff.role === 'admin' ? '' : 'WHERE c.consultant_id = ?'} ORDER BY c.updated_at DESC LIMIT 500`,
      staff.role === 'admin' ? [] : [staff.id],
    );
    if (staff.role === 'admin') await audit(db, staff, 'list', 'consultations', staff.id, { count: rows.length });
    return {
      consultations: rows.map((r) => ({
        id: r.id,
        patientName: patientName(r),
        status: r.status,
        consultant: { id: r.consultant_id, email: r.consultant_email, displayName: r.consultant_name },
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        finalizedAt: r.finalized_at,
      })),
    };
  });

  app.get('/api/staff/consultations/:id', { preHandler: anyStaff }, async (req, reply) => {
    const staff = req.staff as StaffAccount;
    const { id } = idParamSchema.parse(req.params);
    const row = await loadConsultation(id);
    if (!row || !canRead(staff, row)) return reply.code(404).send({ error: 'not_found' });
    await audit(db, staff, 'view', 'consultations', id);
    const kv = row.key_version;
    const [images] = await db.execute<ImageListRow[]>('SELECT id, bytes, created_at FROM images WHERE consultation_id = ? ORDER BY created_at', [id]);
    return {
      id: row.id,
      status: row.status,
      readOnly: row.status === 'final' || row.consultant_id !== staff.id,
      consultant: { id: row.consultant_id, email: row.consultant_email, displayName: row.consultant_name },
      patientName: patientName(row) ?? '',
      intake: open(keyRing, ctx(id, 'snapshot_intake_enc'), kv, row.snapshot_intake_enc),
      answers: open(keyRing, ctx(id, 'snapshot_answers_enc'), kv, row.snapshot_answers_enc),
      tagSelections: open(keyRing, ctx(id, 'snapshot_tags_enc'), kv, row.snapshot_tags_enc),
      questionnaireVersion: row.questionnaire_version,
      algorithmVersion: row.algorithm_version,
      report: {
        ruqyahConditions: parseSet(row.ruqyah_conditions, RUQYAH_CODES),
        pillars: parseSet(row.pillar_potentials, PILLAR_CODES),
        ruqyahNotes: open<string>(keyRing, ctx(id, 'ruqyah_assessment_notes_enc'), kv, row.ruqyah_assessment_notes_enc) ?? '',
        advice: open<string>(keyRing, ctx(id, 'consultant_advice_enc'), kv, row.consultant_advice_enc) ?? '',
        clinicalNotes: open<string>(keyRing, ctx(id, 'clinical_notes_enc'), kv, row.clinical_notes_enc) ?? '',
        psychologicalNotes: open<string>(keyRing, ctx(id, 'psychological_notes_enc'), kv, row.psychological_notes_enc) ?? '',
        physicalNotes: open<string>(keyRing, ctx(id, 'physical_notes_enc'), kv, row.physical_notes_enc) ?? '',
        shareRuqyah: !!row.share_ruqyah_with_patient,
        sharePillars: !!row.share_pillars_with_patient,
        shareClinicalNotes: !!row.share_clinical_notes_with_patient,
        sharePsychological: !!row.share_psychological_with_patient,
        sharePhysical: !!row.share_physical_with_patient,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      finalizedAt: row.finalized_at,
      images: toImageList(images),
    };
  });

  /** Foto lidah pasien. Hak baca sama dengan konsultasinya; setiap pembukaan foto tercatat di audit. */
  app.get('/api/staff/consultations/:id/images/:imageId', { preHandler: anyStaff }, async (req, reply) => {
    const staff = req.staff as StaffAccount;
    const { id, imageId } = idParamSchema.extend({ imageId: z.uuid() }).parse(req.params);
    const row = await loadConsultation(id);
    if (!row || !canRead(staff, row)) return reply.code(404).send({ error: 'not_found' });
    const [blobs] = await db.execute<ImageBlobRow[]>(
      `SELECT b.storage_key, b.key_version, b.data_enc
         FROM images i JOIN image_blobs b ON b.storage_key = i.storage_key
        WHERE i.id = ? AND i.consultation_id = ?`,
      [imageId, id],
    );
    if (!blobs[0]) return reply.code(404).send({ error: 'not_found' });
    await audit(db, staff, 'view_image', 'images', imageId, { consultationId: id });
    return sendImage(reply, keyRing, blobs[0]);
  });

  /** Simpan laporan (draf). Hanya konsultan pemilik, hanya selama draf. Admin tidak bisa mengubah. */
  app.put('/api/staff/consultations/:id', { preHandler: consultantOnly }, async (req, reply) => {
    const staff = req.staff as StaffAccount;
    const { id } = idParamSchema.parse(req.params);
    const body = reportSchema.parse(req.body);
    const done = await withTransaction(db, async (conn) => {
      const [rows] = await conn.execute<ConsultationRow[]>(
        "SELECT * FROM consultations WHERE id = ? AND consultant_id = ? AND status = 'draft' FOR UPDATE",
        [id, staff.id],
      );
      const row = rows[0];
      if (!row) return false;
      // Enkripsi ulang SEMUA kolom dengan kunci terbaru supaya satu key_version berlaku untuk seluruh baris.
      const kv = row.key_version;
      const snap = SNAPSHOT_FIELDS.map((f) => seal(keyRing, ctx(id, f), open(keyRing, ctx(id, f), kv, row[f])));
      const note = (f: (typeof NOTE_FIELDS)[number], v: string) => (v.trim() ? seal(keyRing, ctx(id, f), v) : null);
      await conn.execute(
        `UPDATE consultations SET key_version = ?, snapshot_intake_enc = ?, snapshot_answers_enc = ?, snapshot_tags_enc = ?,
                ruqyah_conditions = ?, pillar_potentials = ?,
                ruqyah_assessment_notes_enc = ?, consultant_advice_enc = ?, clinical_notes_enc = ?,
                psychological_notes_enc = ?, physical_notes_enc = ?,
                share_ruqyah_with_patient = ?, share_pillars_with_patient = ?, share_clinical_notes_with_patient = ?,
                share_psychological_with_patient = ?, share_physical_with_patient = ?, updated_at = NOW(6)
          WHERE id = ?`,
        [
          keyRing.currentVersion,
          ...snap,
          body.ruqyahConditions.join(','),
          body.pillars.join(','),
          note('ruqyah_assessment_notes_enc', body.ruqyahNotes),
          note('consultant_advice_enc', body.advice),
          note('clinical_notes_enc', body.clinicalNotes),
          note('psychological_notes_enc', body.psychologicalNotes),
          note('physical_notes_enc', body.physicalNotes),
          body.shareRuqyah,
          body.sharePillars,
          body.shareClinicalNotes,
          body.sharePsychological,
          body.sharePhysical,
          id,
        ],
      );
      await audit(conn, staff, 'update', 'consultations', id, { fields: Object.keys(body) });
      return true;
    });
    if (!done) return reply.code(404).send({ error: 'not_found' });
    return reply.code(204).send();
  });

  /** Finalkan: satu laporan aktif per pasien (pengganti partial unique index), dalam transaksi + kunci baris pasien. */
  app.post('/api/staff/consultations/:id/finalize', { preHandler: consultantOnly }, async (req, reply) => {
    const staff = req.staff as StaffAccount;
    const { id } = idParamSchema.parse(req.params);
    const result = await withTransaction(db, async (conn) => {
      const [rows] = await conn.execute<ConsultationRow[]>(
        "SELECT * FROM consultations WHERE id = ? AND consultant_id = ? AND status = 'draft' FOR UPDATE",
        [id, staff.id],
      );
      const row = rows[0];
      if (!row) return 'not_found' as const;
      const hasPotential = parseSet(row.ruqyah_conditions, RUQYAH_CODES).length + parseSet(row.pillar_potentials, PILLAR_CODES).length > 0;
      const notesDone = row.ruqyah_assessment_notes_enc && row.consultant_advice_enc && row.psychological_notes_enc && row.physical_notes_enc;
      if (!hasPotential || !notesDone) return 'incomplete' as const;
      await conn.execute('SELECT id FROM patients WHERE id = ? FOR UPDATE', [row.patient_id]);
      await conn.execute('UPDATE consultations SET is_current = FALSE WHERE patient_id = ? AND is_current = TRUE', [row.patient_id]);
      await conn.execute(
        "UPDATE consultations SET status = 'final', is_current = TRUE, finalized_at = NOW(6), updated_at = NOW(6) WHERE id = ?",
        [id],
      );
      await audit(conn, staff, 'finalize', 'consultations', id);
      return 'ok' as const;
    });
    if (result === 'not_found') return reply.code(404).send({ error: 'not_found' });
    if (result === 'incomplete') return reply.code(422).send({ error: 'incomplete' });
    return reply.code(204).send();
  });

  /* ================================ Admin ================================ */

  interface AccountListRow extends RowDataPacket {
    id: string;
    email: string;
    role: string;
    display_name: string | null;
    created_at: Date;
    disabled_at: Date | null;
    has_password: number;
  }

  app.get('/api/admin/accounts', { preHandler: adminOnly }, async () => {
    const [rows] = await db.execute<AccountListRow[]>(
      `SELECT id, email, role, display_name, created_at, disabled_at, password_hash IS NOT NULL AS has_password
         FROM accounts WHERE role IN ('consultant', 'admin') ORDER BY role, email`,
    );
    return {
      accounts: rows.map((r) => ({
        id: r.id,
        email: r.email,
        role: r.role,
        displayName: r.display_name,
        createdAt: r.created_at,
        disabledAt: r.disabled_at,
        hasPassword: !!r.has_password,
      })),
    };
  });

  app.post('/api/admin/accounts', { preHandler: adminOnly, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req, reply) => {
    const staff = req.staff as StaffAccount;
    const { email, displayName } = newAccountSchema.parse(req.body);
    const id = randomUUID();
    try {
      await db.execute("INSERT INTO accounts (id, email, role, display_name) VALUES (?, ?, 'consultant', ?)", [id, email, displayName]);
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') return reply.code(409).send({ error: 'email_taken' });
      throw err;
    }
    await audit(db, staff, 'create', 'accounts', id, { role: 'consultant' });
    return reply.code(201).send({ id, invitePath: invitePath(pepper, inviteToken(pepper, { id, password_hash: null })) });
  });

  /** Tautan undangan baru (juga berfungsi sebagai reset password). Sesi akun itu otomatis berakhir setelah dipakai. */
  app.post('/api/admin/accounts/:id/invite', { preHandler: adminOnly }, async (req, reply) => {
    const staff = req.staff as StaffAccount;
    const { id } = idParamSchema.parse(req.params);
    const row = await loadAccountRow(db, 'id', id);
    if (!row || row.role !== 'consultant') return reply.code(404).send({ error: 'not_found' });
    await audit(db, staff, 'invite', 'accounts', id);
    return { invitePath: invitePath(pepper, inviteToken(pepper, row)) };
  });

  for (const action of ['disable', 'enable'] as const) {
    app.post(`/api/admin/accounts/:id/${action}`, { preHandler: adminOnly }, async (req, reply) => {
      const staff = req.staff as StaffAccount;
      const { id } = idParamSchema.parse(req.params);
      if (id === staff.id) return reply.code(400).send({ error: 'cannot_change_self' });
      const [res] = await db.execute<ResultSetHeader>(
        `UPDATE accounts SET disabled_at = ${action === 'disable' ? 'NOW(6)' : 'NULL'} WHERE id = ? AND role = 'consultant'`,
        [id],
      );
      if (res.affectedRows === 0) return reply.code(404).send({ error: 'not_found' });
      await audit(db, staff, action, 'accounts', id);
      return reply.code(204).send();
    });
  }

  interface AuditRow extends RowDataPacket {
    id: number;
    at: Date;
    action: string;
    entity: string;
    entity_id: string;
    after: unknown;
    actor_email: string | null;
    actor_role: string | null;
  }

  app.get('/api/admin/audit', { preHandler: adminOnly }, async () => {
    const [rows] = await db.execute<AuditRow[]>(
      `SELECT l.id, l.at, l.action, l.entity, l.entity_id, l.\`after\`, a.email AS actor_email, a.role AS actor_role
         FROM audit_log l LEFT JOIN accounts a ON a.id = l.actor_id
        ORDER BY l.id DESC LIMIT 300`,
    );
    return {
      entries: rows.map((r) => ({
        id: r.id,
        at: r.at,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        detail: typeof r.after === 'string' ? JSON.parse(r.after) : r.after,
        actor: r.actor_email ? { email: r.actor_email, role: r.actor_role } : null,
      })),
    };
  });
}
