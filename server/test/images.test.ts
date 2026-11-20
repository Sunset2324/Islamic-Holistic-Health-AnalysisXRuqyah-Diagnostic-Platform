import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { inviteToken, staffGate } from '../src/auth.js';
import { createPool, type Db } from '../src/db.js';
import { purgeExpired } from '../src/purge.js';
import { ensureSchema } from '../src/schema.js';
import { sniffType } from '../src/sanitizeImage.js';
import { sampleBody, testConfig } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;
const adminUrl = process.env.TEST_ADMIN_URL;
const run = url && adminUrl ? describe : describe.skip;

const SCRIPT = '<script>alert(document.cookie)</script>';
const jpeg = () => sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 230, g: 120, b: 130 } } }).jpeg().toBuffer();

run('foto lidah: unggah aman, terenkripsi, hanya bisa dibuka yang berhak (MariaDB sungguhan)', () => {
  const config = testConfig(url);
  let db: Db;
  let root: Db;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let ip = 0;
  const nextIp = () => `10.30.${Math.floor(++ip / 250)}.${ip % 250}`;

  beforeAll(async () => {
    db = createPool(url as string);
    root = createPool(adminUrl as string);
    await ensureSchema(db);
    app = await buildApp({ config, db, logger: false });
  });
  afterAll(async () => {
    await app.close();
    await db.end();
    await root.end();
  });

  const q = async (sql: string, params: unknown[] = []) => (await root.query<RowDataPacket[]>(sql, params))[0];

  async function newPatient() {
    const res = await app.inject({ method: 'POST', url: '/api/submissions', payload: sampleBody(), remoteAddress: nextIp() });
    const { id, editToken } = res.json();
    return { id: id as string, token: editToken as string };
  }
  const upload = (p: { id: string; token: string }, body: Buffer, contentType = 'application/octet-stream') =>
    app.inject({
      method: 'POST',
      url: `/api/submissions/${p.id}/images`,
      payload: body,
      headers: { 'content-type': contentType, 'x-edit-token': p.token },
      remoteAddress: nextIp(),
    });
  const patientGet = (p: { id: string; token: string }, path = '') =>
    app.inject({ method: 'GET', url: `/api/submissions/${p.id}/images${path}`, headers: { 'x-edit-token': p.token }, remoteAddress: nextIp() });

  it('gambar asli diterima, disimpan sebagai WebP baru terenkripsi; kode yang diselipkan hilang', async () => {
    const p = await newPatient();
    // Polyglot: JPEG sah + HTML/skrip di ekor file + komentar berisi skrip.
    const polyglot = Buffer.concat([await jpeg(), Buffer.from(`<html>${SCRIPT}</html><?php system($_GET['c']); ?>`)]);
    const res = await upload(p, polyglot);
    expect(res.statusCode).toBe(201);
    const { id: imageId } = res.json();

    const [img] = await q('SELECT * FROM images WHERE id = ?', [imageId]);
    expect(img!.submission_id).toBe(p.id);
    expect(img!.mime).toBe('image/webp');
    const [blob] = await q('SELECT * FROM image_blobs WHERE storage_key = ?', [img!.storage_key]);
    const enc = blob!.data_enc as Buffer;
    // Di database hanya ciphertext: bukan WebP, bukan JPEG, tidak ada skrip.
    expect(sniffType(enc)).toBeNull();
    expect(enc.includes(Buffer.from('<script>'))).toBe(false);

    const got = await patientGet(p, `/${imageId}`);
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/webp');
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(got.headers['content-security-policy']).toContain('sandbox');
    expect(got.headers['cache-control']).toBe('no-store');
    expect(sniffType(got.rawPayload)).toBe('webp');
    for (const bad of ['<script', '<html', '<?php', 'system(']) expect(got.rawPayload.includes(Buffer.from(bad)), bad).toBe(false);
    const meta = await sharp(got.rawPayload).metadata();
    expect(meta.exif).toBeUndefined();

    const list = (await patientGet(p)).json();
    expect(list.images).toHaveLength(1);
    expect(list.max).toBe(3);
  });

  it('bukan gambar (HTML/skrip/SVG/PHP/ZIP berkedok gambar) ditolak 422, apa pun Content-Type & namanya', async () => {
    const p = await newPatient();
    const fakes = [
      Buffer.from(`<html>${SCRIPT}</html>`),
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${SCRIPT}</svg>`),
      Buffer.from("<?php echo shell_exec($_GET['c']); ?>"),
      Buffer.from('GIF89a<script>1</script>'),
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]),
      // Kepala JPEG palsu + isi skrip.
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(SCRIPT)]),
    ];
    for (const body of fakes) {
      const res = await upload(p, body);
      expect(res.statusCode, body.subarray(0, 12).toString()).toBe(422);
      expect(res.json().error).toBe('image_rejected');
    }
    // Content-Type lain (mis. klien mengaku image/jpeg atau multipart) tidak diterima sama sekali.
    expect((await upload(p, await jpeg(), 'image/svg+xml')).statusCode).toBe(415);
    expect((await upload(p, Buffer.from(SCRIPT), 'text/html')).statusCode).toBe(415);
    expect(await q('SELECT 1 FROM images WHERE submission_id = ?', [p.id])).toHaveLength(0);
  });

  it('token salah / tanpa token / respons orang lain -> 404 tanpa memproses gambar; kuota 3 foto', async () => {
    const p = await newPatient();
    const other = await newPatient();
    expect((await upload({ id: p.id, token: other.token }, await jpeg())).statusCode).toBe(404);
    expect((await upload({ id: p.id, token: 'A'.repeat(43) }, await jpeg())).statusCode).toBe(404);
    for (let i = 0; i < 3; i++) expect((await upload(p, await jpeg())).statusCode).toBe(201);
    const fourth = await upload(p, await jpeg());
    expect(fourth.statusCode).toBe(409);
    expect(fourth.json().error).toBe('image_limit');

    const [first] = (await patientGet(p)).json().images;
    // Pasien lain tidak bisa membuka/menghapus foto ini walau tahu ID-nya.
    expect((await patientGet(other, `/${first.id}`)).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/submissions/${other.id}/images/${first.id}`, headers: { 'x-edit-token': other.token } })).statusCode).toBe(404);
    const delOther = await app.inject({ method: 'DELETE', url: `/api/submissions/${other.id}/images/${first.id}`, headers: { 'x-edit-token': other.token } });
    expect(delOther.statusCode).toBe(404);
    const del = await app.inject({ method: 'DELETE', url: `/api/submissions/${p.id}/images/${first.id}`, headers: { 'x-edit-token': p.token } });
    expect(del.statusCode).toBe(204);
    expect((await patientGet(p)).json().images).toHaveLength(2);
    expect(await q('SELECT 1 FROM images WHERE id = ?', [first.id])).toHaveLength(0);
  });

  it('file di atas batas ukuran ditolak sebelum diproses', async () => {
    const p = await newPatient();
    const res = await upload(p, Buffer.alloc(8 * 1024 * 1024 + 1, 0xff));
    expect(res.statusCode).toBe(413);
  });

  it('draf dihapus pasien atau kedaluwarsa (purge) -> foto & isinya ikut terhapus', async () => {
    const p = await newPatient();
    const { id: imageId } = (await upload(p, await jpeg())).json();
    const [img] = await q('SELECT storage_key FROM images WHERE id = ?', [imageId]);
    await app.inject({ method: 'DELETE', url: `/api/submissions/${p.id}`, headers: { 'x-edit-token': p.token } });
    expect(await q('SELECT 1 FROM images WHERE id = ?', [imageId])).toHaveLength(0);
    expect(await q('SELECT 1 FROM image_blobs WHERE storage_key = ?', [img!.storage_key])).toHaveLength(0);

    const e = await newPatient();
    const { id: expiredImage } = (await upload(e, await jpeg())).json();
    const [eimg] = await q('SELECT storage_key FROM images WHERE id = ?', [expiredImage]);
    await root.query('UPDATE submissions SET expires_at = NOW(6) - INTERVAL 1 MINUTE WHERE id = ?', [e.id]);
    await purgeExpired(root);
    expect(await q('SELECT 1 FROM image_blobs WHERE storage_key = ?', [eimg!.storage_key])).toHaveLength(0);
  });

  it('kode diterima konsultan -> foto pindah ke konsultasi; hanya konsultan pemilik & admin yang bisa membuka, tercatat di audit', async () => {
    const p = await newPatient();
    const { id: imageId } = (await upload(p, await jpeg())).json();
    const code = (await app.inject({ method: 'POST', url: `/api/submissions/${p.id}/access-code`, headers: { 'x-edit-token': p.token }, remoteAddress: nextIp() })).json().code;

    const gate = { 'x-staff-gate': staffGate(config.pepper) };
    const staff = async (role: 'consultant' | 'admin') => {
      const id = randomUUID();
      await root.query('INSERT INTO accounts (id, email, role, display_name) VALUES (?, ?, ?, ?)', [id, `${role}-${id.slice(0, 8)}@contoh.id`, role, 'Uji']);
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/set-password',
        payload: { token: inviteToken(config.pepper, { id, password_hash: null }), password: 'password-uji-panjang' },
        headers: gate,
        remoteAddress: nextIp(),
      });
      return { id, cookie: String(res.headers['set-cookie']).split(';')[0]! };
    };
    const owner = await staff('consultant');
    const stranger = await staff('consultant');
    const admin = await staff('admin');
    const as = (who: { cookie: string }, path: string, method: 'GET' | 'POST' = 'GET', payload?: object) =>
      app.inject({ method, url: path, payload, headers: { ...gate, cookie: who.cookie }, remoteAddress: nextIp() });

    const { consultationId } = (await as(owner, '/api/staff/access-code', 'POST', { code })).json();
    const [moved] = await q('SELECT submission_id, consultation_id FROM images WHERE id = ?', [imageId]);
    expect(moved).toMatchObject({ submission_id: null, consultation_id: consultationId });
    // Pasien tidak bisa lagi menghapusnya.
    expect((await app.inject({ method: 'DELETE', url: `/api/submissions/${p.id}/images/${imageId}`, headers: { 'x-edit-token': p.token } })).statusCode).toBe(404);

    const detail = (await as(owner, `/api/staff/consultations/${consultationId}`)).json();
    expect(detail.images.map((i: { id: string }) => i.id)).toEqual([imageId]);

    const path = `/api/staff/consultations/${consultationId}/images/${imageId}`;
    const ok = await as(owner, path);
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/webp');
    expect(sniffType(ok.rawPayload)).toBe('webp');
    expect((await as(admin, path)).statusCode).toBe(200);
    expect((await as(stranger, path)).statusCode).toBe(404);
    // Tanpa header gerbang: 404 seperti tidak ada.
    expect((await app.inject({ method: 'GET', url: path, headers: { cookie: owner.cookie } })).statusCode).toBe(404);
    // ID foto dari konsultasi lain tidak bisa "dipinjam" lewat konsultasi sendiri.
    expect((await as(owner, `/api/staff/consultations/${consultationId}/images/${randomUUID()}`)).statusCode).toBe(404);

    const audit = await q("SELECT actor_id, `after` FROM audit_log WHERE action = 'view_image' AND entity_id = ? ORDER BY id", [imageId]);
    expect(audit.map((a) => a.actor_id)).toEqual([owner.id, admin.id]);
  });
});
