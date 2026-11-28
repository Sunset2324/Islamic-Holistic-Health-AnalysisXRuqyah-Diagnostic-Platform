import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { inviteToken, staffBasePath, staffGate } from '../src/auth.js';
import { createPool, type Db } from '../src/db.js';
import { ensureSchema } from '../src/schema.js';
import { sampleBody, testConfig } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('akun staf: konsultan & admin (MariaDB sungguhan)', () => {
  const config = testConfig(url);
  let db: Db;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ip = 0;
  const nextIp = () => `10.20.${Math.floor(++ip / 250)}.${ip % 250}`;
  const uniq = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    db = createPool(url as string);
    await ensureSchema(db);
    await ensureSchema(db); // idempoten
    app = await buildApp({ config, db, logger: false });
  });
  afterAll(async () => {
    await app.close();
    await db.end();
  });

  const q = async (sql: string, params: unknown[] = []) => (await db.query<RowDataPacket[]>(sql, params))[0];
  const cookieFrom = (res: { headers: Record<string, unknown> }) => {
    const raw = res.headers['set-cookie'];
    const value = (Array.isArray(raw) ? raw[0] : raw) as string;
    return value.split(';')[0]!;
  };
  const gate = () => ({ 'x-staff-gate': staffGate(config.pepper) });
  const req = (method: 'GET' | 'POST' | 'PUT', path: string, cookie?: string, payload?: object, headers: Record<string, string> = {}) =>
    app.inject({ method, url: path, payload, remoteAddress: nextIp(), headers: { ...gate(), ...(cookie ? { cookie } : {}), ...headers } });
  const tokenOf = (invitePath: string) => invitePath.split('#undangan=')[1]!;
  const fullReport = (patch: Record<string, unknown> = {}) => ({
    ruqyahConditions: [] as string[],
    pillars: ['PM', 'PP'],
    ruqyahNotes: 'Catatan penilaian',
    advice: 'Saran',
    clinicalNotes: '',
    psychologicalNotes: 'Psikis-rahasia',
    physicalNotes: 'Fisik-rahasia',
    shareRuqyah: false,
    sharePillars: true,
    shareClinicalNotes: false,
    sharePsychological: true,
    sharePhysical: false,
    ...patch,
  });

  async function newAdmin() {
    const id = randomUUID();
    const email = `admin-${uniq()}@contoh.id`;
    await db.query("INSERT INTO accounts (id, email, role, display_name) VALUES (?, ?, 'admin', 'Admin Uji')", [id, email]);
    const res = await req('POST', '/api/auth/set-password', undefined, { token: inviteToken(config.pepper, { id, password_hash: null }), password: 'admin-password-123' });
    expect(res.statusCode).toBe(200);
    return { id, email, cookie: cookieFrom(res) };
  }

  async function newConsultant(adminCookie: string) {
    const email = `konsultan-${uniq()}@contoh.id`;
    const created = await req('POST', '/api/admin/accounts', adminCookie, { email, displayName: 'Ustadzah Uji' });
    expect(created.statusCode).toBe(201);
    const { id, invitePath } = created.json();
    expect(invitePath.startsWith(`${staffBasePath(config.pepper)}#undangan=`)).toBe(true);
    const set = await req('POST', '/api/auth/set-password', undefined, { token: tokenOf(invitePath), password: 'konsultan-password-123' });
    expect(set.statusCode).toBe(200);
    return { id, email, invitePath, cookie: cookieFrom(set) };
  }

  async function patientCode() {
    const created = await req('POST', '/api/submissions', undefined, sampleBody());
    const { id, editToken } = created.json();
    const code = (await req('POST', `/api/submissions/${id}/access-code`, undefined, undefined, { 'x-edit-token': editToken })).json().code as string;
    return { submissionId: id as string, editToken: editToken as string, code };
  }

  it('undangan sekali pakai, password minimal 12 karakter, cookie aman', async () => {
    const admin = await newAdmin();
    const email = `k-${uniq()}@contoh.id`;
    const { invitePath } = (await req('POST', '/api/admin/accounts', admin.cookie, { email, displayName: 'K' })).json();
    expect((await req('POST', '/api/auth/set-password', undefined, { token: tokenOf(invitePath), password: 'pendek' })).statusCode).toBe(400);
    const ok = await req('POST', '/api/auth/set-password', undefined, { token: tokenOf(invitePath), password: 'password-yang-panjang' });
    expect(ok.statusCode).toBe(200);
    const raw = String(ok.headers['set-cookie']);
    for (const attr of ['__Host-mh_session=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) expect(raw).toContain(attr);
    const reuse = await req('POST', '/api/auth/set-password', undefined, { token: tokenOf(invitePath), password: 'password-lain-panjang' });
    expect(reuse.statusCode).toBe(400);
    const [row] = await q('SELECT password_hash FROM accounts WHERE email = ?', [email]);
    expect(row!.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('login: benar -> sesi; salah -> 401 sama untuk email tak dikenal; 5x gagal -> terkunci', async () => {
    const admin = await newAdmin();
    const c = await newConsultant(admin.cookie);
    const good = await req('POST', '/api/auth/login', undefined, { email: c.email.toUpperCase(), password: 'konsultan-password-123' });
    expect(good.statusCode).toBe(200);
    expect((await req('GET', '/api/auth/me', cookieFrom(good))).json().account.role).toBe('consultant');
    const unknown = await req('POST', '/api/auth/login', undefined, { email: 'tidak-ada@contoh.id', password: 'apa-saja-123456' });
    const wrong = await req('POST', '/api/auth/login', undefined, { email: c.email, password: 'salah-password-1' });
    expect([unknown.statusCode, wrong.statusCode]).toEqual([401, 401]);
    expect(unknown.json()).toEqual(wrong.json());
    for (let i = 0; i < 4; i++) await req('POST', '/api/auth/login', undefined, { email: c.email, password: 'salah-password-1' });
    const locked = await req('POST', '/api/auth/login', undefined, { email: c.email, password: 'konsultan-password-123' });
    expect(locked.statusCode).toBe(429);
  });

  it('tanpa sesi / sesi palsu / peran salah ditolak', async () => {
    const admin = await newAdmin();
    const c = await newConsultant(admin.cookie);
    expect((await req('GET', '/api/staff/consultations')).statusCode).toBe(401);
    expect((await req('GET', '/api/staff/consultations', '__Host-mh_session=palsu.abc')).statusCode).toBe(401);
    const [body, sig] = c.cookie.split('=')[1]!.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, 'base64url').toString()), sub: admin.id })).toString('base64url');
    expect((await req('GET', '/api/auth/me', `__Host-mh_session=${forged}.${sig}`)).statusCode).toBe(401);
    expect((await req('GET', '/api/admin/accounts', c.cookie)).statusCode).toBe(403);
    expect((await req('POST', '/api/staff/access-code', admin.cookie, { code: 'AAAAAAAA' })).statusCode).toBe(403);
  });

  it('alur konsultan: terima kode -> respons terkunci -> isi laporan -> finalkan; data terenkripsi', async () => {
    const admin = await newAdmin();
    const c = await newConsultant(admin.cookie);
    const p = await patientCode();

    const accepted = await req('POST', '/api/staff/access-code', c.cookie, { code: p.code.toLowerCase() });
    expect(accepted.statusCode).toBe(201);
    const { consultationId } = accepted.json();

    // Respons pasien kini terkunci: tidak bisa diubah, kode tidak bisa dipakai ulang.
    expect((await req('PUT', `/api/submissions/${p.submissionId}`, undefined, sampleBody(), { 'x-edit-token': p.editToken })).statusCode).toBe(404);
    expect((await req('POST', '/api/staff/access-code', c.cookie, { code: p.code })).statusCode).toBe(404);

    const list = (await req('GET', '/api/staff/consultations', c.cookie)).json().consultations;
    expect(list.find((x: { id: string }) => x.id === consultationId).patientName).toBe('Rahasia Nama Pasien');

    const detail = (await req('GET', `/api/staff/consultations/${consultationId}`, c.cookie)).json();
    expect(detail.intake.mainComplaint).toBe('Keluhan-pribadi-unik-12345');
    expect(detail.answers['PL-01']).toBe(2);
    expect(detail.readOnly).toBe(false);

    expect((await req('POST', `/api/staff/consultations/${consultationId}/finalize`, c.cookie)).statusCode).toBe(422);
    const report = fullReport({ ruqyahConditions: ['B'], ruqyahNotes: 'Catatan-ruqyah-rahasia', advice: 'Saran-rahasia', shareRuqyah: true });
    // Belum lengkap -> 422: tanpa potensi sama sekali, atau tanpa catatan psikis/fisik.
    for (const partial of [{ ruqyahConditions: [], pillars: [] }, { psychologicalNotes: '' }, { physicalNotes: '  ' }]) {
      expect((await req('PUT', `/api/staff/consultations/${consultationId}`, c.cookie, { ...report, ...partial })).statusCode).toBe(204);
      expect((await req('POST', `/api/staff/consultations/${consultationId}/finalize`, c.cookie)).statusCode).toBe(422);
    }
    expect((await req('PUT', `/api/staff/consultations/${consultationId}`, c.cookie, report)).statusCode).toBe(204);
    const saved = (await req('GET', `/api/staff/consultations/${consultationId}`, c.cookie)).json().report;
    expect(saved).toEqual(report);
    expect((await req('POST', `/api/staff/consultations/${consultationId}/finalize`, c.cookie)).statusCode).toBe(204);
    expect((await req('PUT', `/api/staff/consultations/${consultationId}`, c.cookie, report)).statusCode).toBe(404);

    const [row] = await q('SELECT * FROM consultations WHERE id = ?', [consultationId]);
    expect(row!.status).toBe('final');
    expect(row!.is_current).toBe(1);
    expect(row!.ruqyah_conditions).toBe('B');
    expect(row!.pillar_potentials).toBe('PM,PP');
    for (const col of ['snapshot_intake_enc', 'consultant_advice_enc', 'ruqyah_assessment_notes_enc', 'psychological_notes_enc', 'physical_notes_enc']) {
      for (const secret of ['Rahasia Nama Pasien', 'Keluhan-pribadi-unik-12345', 'Saran-rahasia', 'Catatan-ruqyah-rahasia', 'Psikis-rahasia', 'Fisik-rahasia']) {
        expect((row![col] as Buffer).includes(Buffer.from(secret))).toBe(false);
      }
    }
    const [sub] = await q('SELECT status, expires_at FROM submissions WHERE id = ?', [p.submissionId]);
    expect(sub).toMatchObject({ status: 'in_consultation', expires_at: null });
  });

  it('konsultan lain tidak bisa melihat; admin bisa membaca (baca saja) dan tercatat di audit', async () => {
    const admin = await newAdmin();
    const c1 = await newConsultant(admin.cookie);
    const c2 = await newConsultant(admin.cookie);
    const { consultationId } = (await req('POST', '/api/staff/access-code', c1.cookie, { code: (await patientCode()).code })).json();

    expect((await req('GET', `/api/staff/consultations/${consultationId}`, c2.cookie)).statusCode).toBe(404);
    expect((await req('GET', '/api/staff/consultations', c2.cookie)).json().consultations.some((x: { id: string }) => x.id === consultationId)).toBe(false);

    const asAdmin = await req('GET', `/api/staff/consultations/${consultationId}`, admin.cookie);
    expect(asAdmin.statusCode).toBe(200);
    expect(asAdmin.json().readOnly).toBe(true);
    expect((await req('PUT', `/api/staff/consultations/${consultationId}`, admin.cookie, fullReport())).statusCode).toBe(403);

    const audit = (await req('GET', '/api/admin/audit', admin.cookie)).json().entries as { action: string; entityId: string; actor: { email: string } | null; detail: unknown }[];
    expect(audit.some((e) => e.action === 'view' && e.entityId === consultationId && e.actor?.email === admin.email)).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('Rahasia Nama Pasien');
  });

  it('laporan: pilihan potensi divalidasi (tanpa duplikat/kode asing/kolom lama), disimpan urut', async () => {
    const admin = await newAdmin();
    const c = await newConsultant(admin.cookie);
    const { consultationId } = (await req('POST', '/api/staff/access-code', c.cookie, { code: (await patientCode()).code })).json();
    const put = (body: object) => req('PUT', `/api/staff/consultations/${consultationId}`, c.cookie, body);
    for (const bad of [
      fullReport({ ruqyahConditions: ['A', 'A'] }),
      fullReport({ ruqyahConditions: ['E'] }),
      fullReport({ pillars: ['PL', 'XX'] }),
      fullReport({ ruqyahFinalCondition: 'B' }),
      { ...fullReport(), psychologicalNotes: undefined },
      fullReport({ physicalNotes: 'x'.repeat(4001) }),
    ]) {
      expect((await put(bad)).statusCode, JSON.stringify(bad).slice(0, 80)).toBe(400);
    }
    // Urutan masukan bebas; tersimpan & terbaca urut daftar. Semua 8 potensi boleh dicentang.
    expect((await put(fullReport({ ruqyahConditions: ['D', 'A', 'C', 'B'], pillars: ['FX', 'PL', 'PP', 'PM'] }))).statusCode).toBe(204);
    const r = (await req('GET', `/api/staff/consultations/${consultationId}`, c.cookie)).json().report;
    expect(r.ruqyahConditions).toEqual(['A', 'B', 'C', 'D']);
    expect(r.pillars).toEqual(['PL', 'PM', 'PP', 'FX']);
    // Hanya ruqyah (tanpa pilar) juga sah untuk final.
    expect((await put(fullReport({ ruqyahConditions: ['A'], pillars: [] }))).statusCode).toBe(204);
    expect((await req('POST', `/api/staff/consultations/${consultationId}/finalize`, c.cookie)).statusCode).toBe(204);
  });

  it('migrasi: kondisi lama dipindah ke kolom baru; CHECK lama diganti, tetap menjaga laporan final', async () => {
    const admin = await newAdmin();
    const c = await newConsultant(admin.cookie);
    const { consultationId } = (await req('POST', '/api/staff/access-code', c.cookie, { code: (await patientCode()).code })).json();
    await db.query("UPDATE consultations SET ruqyah_conditions = NULL, ruqyah_final_condition = 'C' WHERE id = ?", [consultationId]);
    await ensureSchema(db);
    const [row] = await q('SELECT ruqyah_conditions FROM consultations WHERE id = ?', [consultationId]);
    expect(row!.ruqyah_conditions).toBe('C');
    const names = (await q(
      "SELECT CONSTRAINT_NAME AS n FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'consultations' AND CONSTRAINT_TYPE = 'CHECK'",
    )).map((x) => x.n);
    expect(names).not.toContain('chk_final_requires_fields');
    expect(names).toContain('chk_final_requires_fields_v2');
    // Pengaman DB: laporan final tanpa saran tetap ditolak database walau lolos dari aplikasi.
    await expect(db.query("UPDATE consultations SET status = 'final', finalized_at = NOW(6), consultant_advice_enc = NULL WHERE id = ?", [consultationId])).rejects.toThrow();
  });

  it('kode akses salah 5x -> konsultan terkunci sementara', async () => {
    const admin = await newAdmin();
    const c = await newConsultant(admin.cookie);
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await req('POST', '/api/staff/access-code', c.cookie, { code: 'ZZZZZZZZ' })).statusCode);
    expect(codes.slice(0, 5)).toEqual([404, 404, 404, 404, 404]);
    expect(codes[5]).toBe(429);
    const p = await patientCode();
    expect((await req('POST', '/api/staff/access-code', c.cookie, { code: p.code })).statusCode).toBe(429);
  });

  it('akun dinonaktifkan / password direset -> sesi lama langsung tidak berlaku', async () => {
    const admin = await newAdmin();
    const c = await newConsultant(admin.cookie);
    expect((await req('POST', `/api/admin/accounts/${c.id}/disable`, admin.cookie)).statusCode).toBe(204);
    expect((await req('GET', '/api/auth/me', c.cookie)).statusCode).toBe(401);
    expect((await req('POST', '/api/auth/login', undefined, { email: c.email, password: 'konsultan-password-123' })).statusCode).toBe(401);
    expect((await req('POST', `/api/admin/accounts/${c.id}/enable`, admin.cookie)).statusCode).toBe(204);
    expect((await req('GET', '/api/auth/me', c.cookie)).statusCode).toBe(200);

    const reset = (await req('POST', `/api/admin/accounts/${c.id}/invite`, admin.cookie)).json().invitePath;
    expect((await req('POST', '/api/auth/set-password', undefined, { token: tokenOf(reset), password: 'password-baru-panjang' })).statusCode).toBe(200);
    expect((await req('GET', '/api/auth/me', c.cookie)).statusCode).toBe(401);
    expect((await req('POST', `/api/admin/accounts/${admin.id}/disable`, admin.cookie)).statusCode).toBe(400);
  });

  it('permintaan dari situs lain (CSRF) ditolak', async () => {
    const admin = await newAdmin();
    const cross = await req('POST', '/api/admin/accounts', admin.cookie, { email: `x-${uniq()}@contoh.id`, displayName: 'X' }, { 'sec-fetch-site': 'cross-site' });
    const badOrigin = await req('POST', '/api/admin/accounts', admin.cookie, { email: `y-${uniq()}@contoh.id`, displayName: 'Y' }, { origin: 'https://jahat.example', host: 'myherbalis.com' });
    const nullOrigin = await req('POST', '/api/auth/logout', admin.cookie, {}, { origin: 'null' });
    expect([cross.statusCode, badOrigin.statusCode, nullOrigin.statusCode]).toEqual([403, 403, 403]);
  });

  it('satu baris yang tidak bisa didekripsi tidak menjatuhkan daftar admin', async () => {
    const admin = await newAdmin();
    const c = await newConsultant(admin.cookie);
    const { consultationId } = (await req('POST', '/api/staff/access-code', c.cookie, { code: (await patientCode()).code })).json();
    const [row] = await q('SELECT patient_id FROM consultations WHERE id = ?', [consultationId]);
    await db.query("UPDATE patients SET display_name_enc = 'blob-rusak-yang-tidak-valid-xxxxxxxxxxxxx' WHERE id = ?", [row!.patient_id]);
    const list = await req('GET', '/api/staff/consultations', admin.cookie);
    expect(list.statusCode).toBe(200);
    expect(list.json().consultations.find((x: { id: string }) => x.id === consultationId).patientName).toBeNull();
  });

  it('API staf tanpa / dengan header gerbang yang salah dijawab 404 (seperti tidak ada)', async () => {
    const admin = await newAdmin();
    const paths: ['GET' | 'POST', string][] = [['POST', '/api/auth/login'], ['GET', '/api/auth/me'], ['GET', '/api/admin/accounts'], ['GET', '/api/staff/consultations']];
    for (const [method, path] of paths) {
      for (const g of [undefined, 'salah', staffGate(config.pepper).replace(/.$/, 'x')]) {
        const res = await app.inject({ method, url: path, payload: method === 'POST' ? { email: admin.email, password: 'admin-password-123' } : undefined, remoteAddress: nextIp(), headers: { cookie: admin.cookie, ...(g ? { 'x-staff-gate': g } : {}) } });
        expect(res.statusCode, `${path} gate=${g}`).toBe(404);
        expect(res.json()).toEqual({ error: 'not_found' });
      }
    }
    // Query string tidak melewati gerbang.
    expect((await app.inject({ method: 'GET', url: '/api/auth/me?x=1', headers: { cookie: admin.cookie } })).statusCode).toBe(404);
    // API pasien tidak terpengaruh gerbang.
    expect((await app.inject({ method: 'POST', url: '/api/submissions', payload: sampleBody(), remoteAddress: nextIp() })).statusCode).toBe(201);
  });

  it('email ganda ditolak 409', async () => {
    const admin = await newAdmin();
    const email = `dup-${uniq()}@contoh.id`;
    expect((await req('POST', '/api/admin/accounts', admin.cookie, { email, displayName: 'A' })).statusCode).toBe(201);
    expect((await req('POST', '/api/admin/accounts', admin.cookie, { email, displayName: 'B' })).statusCode).toBe(409);
  });
});
