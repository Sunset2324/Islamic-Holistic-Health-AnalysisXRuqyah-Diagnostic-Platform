import { Writable } from 'node:stream';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { sampleBody, testConfig } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_ADMIN_URL;
const run = url && adminUrl ? describe : describe.skip;

run('API respons pasien tamu (Postgres sungguhan)', () => {
  const config = testConfig(url);
  const pool = createPool(url as string);
  const admin = new pg.Pool({ connectionString: adminUrl });
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ config, db: pool, logger: false });
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
    await admin.end();
  });

  const create = async (body = sampleBody()) => {
    const res = await app.inject({ method: 'POST', url: '/api/submissions', payload: body, remoteAddress: `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
    return { res, json: res.json() };
  };
  const auth = (token: string) => ({ 'x-edit-token': token });

  it('membuat respons: token 43 karakter, tanpa teks asli di database', async () => {
    const { res, json } = await create();
    expect(res.statusCode).toBe(201);
    expect(json.editToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { rows } = await admin.query('select * from submissions where id = $1', [json.id]);
    const row = rows[0];
    expect(row.edit_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.edit_token_hash).not.toContain(json.editToken);
    for (const col of ['intake_enc', 'answers_enc', 'tag_selections_enc'] as const) {
      expect((row[col] as Buffer).includes(Buffer.from('Rahasia Nama Pasien'))).toBe(false);
      expect((row[col] as Buffer).includes(Buffer.from('Keluhan-pribadi-unik-12345'))).toBe(false);
      expect((row[col] as Buffer).includes(Buffer.from('HOPELESSNESS'))).toBe(false);
    }
    expect(row.key_version).toBe(2);
  });

  it('membaca kembali dengan token benar; token salah/tanpa token/ID tidak dikenal sama-sama 404', async () => {
    const { json } = await create();
    const ok = await app.inject({ method: 'GET', url: `/api/submissions/${json.id}`, headers: auth(json.editToken) });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().intake.name).toBe('Rahasia Nama Pasien');
    expect(ok.json().answers['PL-03']).toBeNull();
    expect(ok.json().tagSelections['PP-01'].tagIds).toEqual(['HOPELESSNESS']);
    const wrong = await app.inject({ method: 'GET', url: `/api/submissions/${json.id}`, headers: auth('A'.repeat(43)) });
    const none = await app.inject({ method: 'GET', url: `/api/submissions/${json.id}` });
    const unknown = await app.inject({ method: 'GET', url: '/api/submissions/00000000-0000-4000-8000-000000000000', headers: auth(json.editToken) });
    for (const r of [wrong, none, unknown]) {
      expect(r.statusCode).toBe(404);
      expect(r.json()).toEqual({ error: 'not_found' });
    }
    expect((await app.inject({ method: 'GET', url: '/api/submissions/bukan-uuid', headers: auth(json.editToken) })).statusCode).toBe(400);
  });

  it('pasien bisa mengubah respons; token salah tidak bisa', async () => {
    const { json } = await create();
    const next = sampleBody({ answers: { 'PL-01': 5 } });
    const bad = await app.inject({ method: 'PUT', url: `/api/submissions/${json.id}`, headers: auth('B'.repeat(43)), payload: next });
    expect(bad.statusCode).toBe(404);
    const put = await app.inject({ method: 'PUT', url: `/api/submissions/${json.id}`, headers: auth(json.editToken), payload: next });
    expect(put.statusCode).toBe(204);
    const got = await app.inject({ method: 'GET', url: `/api/submissions/${json.id}`, headers: auth(json.editToken) });
    expect(got.json().answers).toEqual({ 'PL-01': 5 });
  });

  it('kode akses: 8 karakter, hanya hash di database, kode baru mencabut yang lama', async () => {
    const { json } = await create();
    const first = await app.inject({ method: 'POST', url: `/api/submissions/${json.id}/access-code`, headers: auth(json.editToken) });
    const second = await app.inject({ method: 'POST', url: `/api/submissions/${json.id}/access-code`, headers: auth(json.editToken) });
    expect(first.statusCode).toBe(201);
    expect(first.json().code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(second.json().code).not.toBe(first.json().code);
    const { rows } = await admin.query('select code_hash, status from access_codes where submission_id = $1 order by created_at', [json.id]);
    expect(rows.map((r) => r.status)).toEqual(['revoked', 'active']);
    for (const r of rows) {
      expect(r.code_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.code_hash).not.toContain(first.json().code);
    }
    const noAuth = await app.inject({ method: 'POST', url: `/api/submissions/${json.id}/access-code` });
    expect(noAuth.statusCode).toBe(404);
  });

  it('setelah dikunci konsultan: tidak bisa diubah dan tidak bisa meminta kode', async () => {
    const { json } = await create();
    await admin.query("update submissions set status = 'in_consultation', expires_at = null where id = $1", [json.id]);
    const put = await app.inject({ method: 'PUT', url: `/api/submissions/${json.id}`, headers: auth(json.editToken), payload: sampleBody() });
    const code = await app.inject({ method: 'POST', url: `/api/submissions/${json.id}/access-code`, headers: auth(json.editToken) });
    const del = await app.inject({ method: 'DELETE', url: `/api/submissions/${json.id}`, headers: auth(json.editToken) });
    expect([put.statusCode, code.statusCode, del.statusCode]).toEqual([404, 404, 404]);
  });

  it('respons kedaluwarsa tidak bisa dibaca', async () => {
    const { json } = await create();
    await admin.query("update submissions set expires_at = now() - interval '1 minute' where id = $1", [json.id]);
    expect((await app.inject({ method: 'GET', url: `/api/submissions/${json.id}`, headers: auth(json.editToken) })).statusCode).toBe(404);
  });

  it('hapus atas permintaan pasien', async () => {
    const { json } = await create();
    expect((await app.inject({ method: 'DELETE', url: `/api/submissions/${json.id}`, headers: auth(json.editToken) })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/api/submissions/${json.id}`, headers: auth(json.editToken) })).statusCode).toBe(404);
    const { rowCount } = await admin.query('select 1 from submissions where id = $1', [json.id]);
    expect(rowCount).toBe(0);
  });

  it('validasi: kolom asing, nilai di luar batas, dan tipe salah ditolak 400', async () => {
    const base = sampleBody();
    const cases: unknown[] = [
      { ...base, extra: 1 },
      { ...base, intake: { ...base.intake, age: 200 } },
      { ...base, intake: { ...base.intake, mainComplaint: 'x'.repeat(1001) } },
      { ...base, answers: { 'PL-01': 6 } },
      { ...base, answers: { 'XX-99': 3 } },
      { ...base, tagSelections: { 'PP-01': { tagIds: ['huruf-kecil'], otherNote: '' } } },
      { ...base, tagSelections: { 'PP-01': { tagIds: [], otherNote: 'x'.repeat(251) } } },
      { ...base, questionnaireVersion: '<script>' },
    ];
    for (const payload of cases) {
      const res = await app.inject({ method: 'POST', url: '/api/submissions', payload: payload as object, remoteAddress: '10.9.9.9' });
      expect(res.statusCode, JSON.stringify(payload).slice(0, 80)).toBe(400);
    }
  });

  it('badan bukan JSON ditolak (415)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/submissions', payload: 'bukan objek', remoteAddress: '10.9.9.8' });
    expect(res.statusCode).toBe(415);
  });

  it('badan terlalu besar ditolak', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/submissions', payload: { x: 'a'.repeat(200_000) }, remoteAddress: '10.8.8.8' });
    expect(res.statusCode).toBe(413);
  });

  it('header keamanan dan tanpa cache', async () => {
    const { res } = await create();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('peran app_api tidak bisa membaca tabel submissions/access_codes langsung', async () => {
    await expect(pool.query('select * from submissions')).rejects.toThrow(/permission denied/);
    await expect(pool.query('select * from access_codes')).rejects.toThrow(/permission denied/);
  });

  it('batas laju pembuatan respons: lebih dari 10 per jam per IP -> 429', async () => {
    const fresh = await buildApp({ config, db: pool, logger: false });
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await fresh.inject({ method: 'POST', url: '/api/submissions', payload: sampleBody(), remoteAddress: '10.7.7.7' });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    await fresh.close();
  });

  it('log tidak memuat token, isi isian, atau kode', async () => {
    const chunks: string[] = [];
    const stream = new Writable({ write(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); } });
    const logged = await buildApp({ config, db: pool, logStream: stream });
    const created = await logged.inject({ method: 'POST', url: '/api/submissions', payload: sampleBody(), remoteAddress: '10.6.6.6' });
    const { id, editToken } = created.json();
    const code = (await logged.inject({ method: 'POST', url: `/api/submissions/${id}/access-code`, headers: auth(editToken), remoteAddress: '10.6.6.6' })).json().code;
    await logged.inject({ method: 'GET', url: `/api/submissions/${id}`, headers: auth(editToken), remoteAddress: '10.6.6.6' });
    // Paksa header tercatat untuk menguji redaksi (log bawaan tidak mencatat header; ini jaring pengaman bila ada kode yang mencatatnya).
    logged.log.info({ headers: { 'x-edit-token': 'RAHASIA-TOKEN-XYZ', authorization: 'Bearer RAHASIA-BEARER', cookie: 'sid=RAHASIA-COOKIE' } }, 'uji redaksi');
    await logged.close();
    const all = chunks.join('');
    for (const secret of ['RAHASIA-TOKEN-XYZ', 'RAHASIA-BEARER', 'RAHASIA-COOKIE']) expect(all.includes(secret)).toBe(false);
    expect(all).toContain('[disembunyikan]');
    expect(all.length).toBeGreaterThan(0);
    for (const secret of [editToken, code, 'Rahasia Nama Pasien', 'Keluhan-pribadi-unik-12345']) expect(all.includes(secret)).toBe(false);
  });
});
