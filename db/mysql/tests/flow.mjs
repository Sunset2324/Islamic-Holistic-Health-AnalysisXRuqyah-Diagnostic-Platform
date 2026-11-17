// Uji alur skema MySQL (port db/tests/flow.sql). Dijalankan oleh test-with-mysql.sh pada database KOSONG.
// Lingkungan: MYSQL_SOCKET (atau MYSQL_HOST/MYSQL_PORT), MYSQL_ROOT_USER/MYSQL_ROOT_PASSWORD (admin uji),
// API_USER/API_PASSWORD (peran app_api), MAINT_USER/MAINT_PASSWORD (peran app_maintenance). Semua nilai hanya untuk uji.
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';

const base = process.env.MYSQL_SOCKET ? { socketPath: process.env.MYSQL_SOCKET } : { host: process.env.MYSQL_HOST ?? '127.0.0.1', port: Number(process.env.MYSQL_PORT ?? 3306) };
const common = { ...base, database: 'myherbalis', timezone: 'Z', dateStrings: true, multipleStatements: false };
const root = await mysql.createConnection({ ...common, user: process.env.MYSQL_ROOT_USER ?? 'root', password: process.env.MYSQL_ROOT_PASSWORD ?? '' });
const api = await mysql.createConnection({ ...common, user: process.env.API_USER, password: process.env.API_PASSWORD });
const maint = await mysql.createConnection({ ...common, user: process.env.MAINT_USER, password: process.env.MAINT_PASSWORD });

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond === true) { pass++; console.log('PASS ', name); } else { fail++; console.log('FAIL ', name); } };
const h = (s) => crypto.createHash('sha256').update(s).digest('hex');
const b = (s) => Buffer.from(s, 'utf8');
const uuid = () => crypto.randomUUID();
const rowsOf = (res) => (Array.isArray(res) && Array.isArray(res[0]) ? res[0] : []);

async function call(conn, proc, args = []) {
  const [res] = await conn.query(`CALL ${proc}(${args.map(() => '?').join(', ')})`, args);
  return rowsOf(res);
}
async function throws(name, fn, pat) {
  try { await fn(); ok(`${name} (seharusnya error)`, false); }
  catch (e) { ok(name, pat === undefined || new RegExp(pat, 'i').test(e.sqlMessage ?? e.message)); }
}
const q = async (conn, sql, args = []) => (await conn.query(sql, args))[0];
const n1 = async (sql, args = []) => Number(Object.values((await q(root, sql, args))[0])[0]);

const A1 = '00000000-0000-0000-0000-0000000000a1', A2 = '00000000-0000-0000-0000-0000000000a2';
const B1 = '00000000-0000-0000-0000-0000000000b1', B2 = '00000000-0000-0000-0000-0000000000b2';
const C1 = '00000000-0000-0000-0000-0000000000c1';
await q(root, `insert into accounts (id, email, role) values (?, 'konsultan.a@contoh.test', 'consultant'), (?, 'konsultan.b@contoh.test', 'consultant'),
  (?, 'pasien.a@contoh.test', 'patient'), (?, 'pasien.b@contoh.test', 'patient'), (?, 'admin@contoh.test', 'admin')`, [A1, A2, B1, B2, C1]);

// Alur lengkap sebagai konsultan: submission -> kode -> terima -> buka -> isi -> final
async function makeFinalReport(consultant, patient, tag, shareRuqyah, shareNotes) {
  const [{ id: sid }] = await call(api, 'create_submission', [h('tok-' + tag), b('intake'), b('answers'), b('tags'), 1, 'HHS v1.0', '1.0.0']);
  await call(api, 'issue_access_code', [sid, h('tok-' + tag), h('code-' + tag)]);
  await call(api, 'accept_access_code', [consultant, h('code-' + tag)]);
  const [{ id: cid }] = await call(api, 'open_consultation', [consultant, sid, patient, patient === null ? b('Nama ' + tag) : null, 1]);
  await call(api, 'update_consultation_draft', [consultant, cid, b('SISTEM-' + tag), 'B', b('RUQYAH-' + tag), b('SARAN-' + tag), b('CATATAN-' + tag), shareRuqyah ? 1 : 0, shareNotes ? 1 : 0, 1]);
  await call(api, 'finalize_consultation', [consultant, cid, 'uji']);
  return cid;
}

console.log('--- 1. Pasien tamu: token, edit, kode akses');
const tok = h('token-pasien-1');
const [{ id: sid }] = await call(api, 'create_submission', [tok, b('intake-v1'), b('answers-v1'), b('tags-v1'), 1, 'HHS v1.0', '1.0.0']);
ok('create_submission mengembalikan id', typeof sid === 'string' && sid.length === 36);
ok('token salah: get_submission kosong', (await call(api, 'get_submission', [sid, h('token-salah')])).length === 0);
ok('token benar: get_submission ada', (await call(api, 'get_submission', [sid, tok])).length === 1);
await throws('token salah: update ditolak', () => call(api, 'update_submission', [sid, h('token-salah'), b('x'), b('x'), b('x'), 1]), 'tidak ditemukan');
await call(api, 'update_submission', [sid, tok, b('intake-v2'), b('answers-v2'), b('tags-v2'), 1]);
const got = (await call(api, 'get_submission', [sid, tok]))[0];
ok('pasien dapat mengubah respons (draft)', Buffer.compare(got.answers_enc, b('answers-v2')) === 0);
await throws('token salah: delete ditolak', () => call(api, 'delete_submission', [sid, h('token-salah')]));
await throws('token salah: issue_access_code ditolak', () => call(api, 'issue_access_code', [sid, h('token-salah'), h('kode-x')]));
await call(api, 'issue_access_code', [sid, tok, h('KODE0001')]);
await call(api, 'issue_access_code', [sid, tok, h('KODE0002')]);
ok('menerbitkan ulang kode mencabut kode lama', await n1(`select count(*) from access_codes where submission_id = ? and status = 'revoked'`, [sid]) === 1);
ok('hanya satu kode aktif per respons', await n1(`select count(*) from access_codes where submission_id = ? and status = 'active'`, [sid]) === 1);
ok('kedaluwarsa 7 hari dari dibuat', await n1(`select count(*) from submissions where id = ? and expires_at > utc_timestamp(3) + interval '6 23' day_hour and expires_at <= utc_timestamp(3) + interval 7 day`, [sid]) === 1);
await throws('hash token berformat salah ditolak (check)', () => call(api, 'create_submission', ['pendek', b('x'), b('x'), b('x'), 1, 'a', 'b']), 'check');
await throws('hash token huruf besar ditolak (check peka huruf)', () => call(api, 'create_submission', ['A'.repeat(64), b('x'), b('x'), b('x'), 1, 'a', 'b']), 'check');
await throws('blob kosong ditolak (check panjang)', () => call(api, 'create_submission', [h('z'), b(''), b('x'), b('x'), 1, 'a', 'b']), 'check');
await throws('key_version 0 ditolak (check)', () => call(api, 'create_submission', [h('z'), b('x'), b('x'), b('x'), 0, 'a', 'b']), 'check');

console.log('--- 2. Konsultan menerima kode, respons terkunci');
let r = (await call(api, 'accept_access_code', [A1, h('KODE-SALAH')]))[0];
ok('kode salah: status invalid', r.status === 'invalid');
r = (await call(api, 'accept_access_code', [A1, h('KODE0001')]))[0];
ok('kode lama (dicabut): status invalid', r.status === 'invalid');
r = (await call(api, 'accept_access_code', [A1, h('KODE0002')]))[0];
ok('kode benar: status ok + blob diteruskan', r.status === 'ok' && r.submission_id === sid && Buffer.compare(r.answers_enc, b('answers-v2')) === 0);
r = (await call(api, 'accept_access_code', [A1, h('KODE0002')]))[0];
ok('kode sekali pakai: kedua kalinya invalid', r.status === 'invalid');
await throws('respons terkunci: pasien tak bisa mengubah', () => call(api, 'update_submission', [sid, tok, b('x'), b('x'), b('x'), 1]));
await throws('respons terkunci: pasien tak bisa terbitkan kode', () => call(api, 'issue_access_code', [sid, tok, h('KODE0003')]));
await throws('respons terkunci: pasien tak bisa menghapus', () => call(api, 'delete_submission', [sid, tok]));
await throws('akun pasien tak bisa menerima kode akses', () => call(api, 'accept_access_code', [B1, h('KODE0002')]), 'hanya konsultan');
await throws('konsultan lain tak bisa membuka konsultasi', () => call(api, 'open_consultation', [A2, sid, null, b('Nama'), 1]), 'belum diterima');
await throws('pasien baru wajib nama terenkripsi', () => call(api, 'open_consultation', [A1, sid, null, null, 1]), 'nama pasien');
const [{ id: cid1 }] = await call(api, 'open_consultation', [A1, sid, null, b('Budi (terenkripsi)'), 1]);
ok('open_consultation membuat laporan draf', typeof cid1 === 'string');
await throws('konsultasi tak bisa dibuka dua kali', () => call(api, 'open_consultation', [A1, sid, null, b('Nama'), 1]), 'tersedia|sudah dibuka');
ok('konsultan A melihat laporannya', (await call(api, 'list_my_consultations', [A1, null])).length === 1);
ok('konsultan B tidak melihat laporan konsultan A', (await call(api, 'list_my_consultations', [A2, null])).length === 0);
ok('konsultan B tidak melihat pasien konsultan A', (await call(api, 'list_my_patients', [A2])).length === 0);
ok('konsultan B tidak bisa membaca laporan A lewat id', (await call(api, 'get_my_consultation', [A2, cid1])).length === 0);
ok('konsultan A bisa membaca laporannya lewat id', (await call(api, 'get_my_consultation', [A1, cid1])).length === 1);
ok('respons berstatus in_consultation tanpa kedaluwarsa', await n1(`select count(*) from submissions where id = ? and status = 'in_consultation' and expires_at is null`, [sid]) === 1);
ok('pasien baru tanpa akun (tanpa riwayat)', await n1('select count(*) from patients where account_id is null') === 1);
await throws('akun pasien tak bisa memakai prosedur konsultan', () => call(api, 'list_my_patients', [B1]), 'hanya konsultan');
await throws('identitas tak dikenal ditolak', () => call(api, 'list_my_patients', [uuid()]), 'hanya konsultan');

console.log('--- 3. Finalisasi wajib ruqyah + saran; kolom terkunci');
await throws('finalisasi tanpa ruqyah ditolak', () => call(api, 'finalize_consultation', [A1, cid1, null]), 'ruqyah');
await call(api, 'update_consultation_draft', [A1, cid1, null, 'C', b('catatan ruqyah'), null, null, 0, 0, 1]);
await throws('finalisasi tanpa saran konsultan ditolak', () => call(api, 'finalize_consultation', [A1, cid1, null]), 'saran');
await throws('konsultan lain tak bisa mengubah draf', () => call(api, 'update_consultation_draft', [A2, cid1, null, 'C', b('x'), b('x'), null, 0, 0, 1]), 'hanya konsultan|tidak ditemukan');
await throws('akun pasien tak bisa mengubah draf', () => call(api, 'update_consultation_draft', [B1, cid1, null, 'C', b('x'), b('x'), null, 0, 0, 1]), 'hanya konsultan');
await throws('kondisi ruqyah di luar A-D ditolak', () => call(api, 'update_consultation_draft', [A1, cid1, null, 'Z', b('x'), b('x'), null, 0, 0, 1]));
await throws('konsultan tak bisa mengubah status langsung (tanpa hak tabel)', () => q(api, `update consultations set status = 'final' where id = ?`, [cid1]), 'denied');
await throws('konsultan tak bisa mengubah is_current langsung', () => q(api, 'update consultations set is_current = 1 where id = ?', [cid1]), 'denied');
await throws('konsultan tak bisa merilis ke pasien langsung', () => q(api, 'update consultations set released_to_patient_at = utc_timestamp(3) where id = ?', [cid1]), 'denied');
await call(api, 'update_consultation_draft', [A1, cid1, b('hasil sistem'), 'C', b('catatan ruqyah'), b('saran konsultan'), b('catatan klinis'), 0, 0, 1]);
await call(api, 'finalize_consultation', [A1, cid1, 'konsultasi pertama']);
ok('finalisasi lolos bila ruqyah + saran lengkap', (await q(root, 'select status from consultations where id = ?', [cid1]))[0].status === 'final');
await throws('laporan final tidak bisa diubah (prosedur menolak)', () => call(api, 'update_consultation_draft', [A1, cid1, null, 'C', b('x'), b('ubah setelah final'), b('ubah setelah final'), 0, 0, 1]), 'sudah final');
ok('laporan final: is_current = 1', (await q(root, 'select is_current from consultations where id = ?', [cid1]))[0].is_current === 1);
ok('isi laporan final tidak berubah', Buffer.compare((await q(root, 'select clinical_notes_enc from consultations where id = ?', [cid1]))[0].clinical_notes_enc, b('catatan klinis')) === 0);
ok('respons sementara dihapus setelah final (salinan ada di laporan)', await n1('select count(*) from submissions where id = ?', [sid]) === 0);
await throws('constraint: laporan final tanpa saran ditolak langsung di tabel', () => q(root, 'update consultations set consultant_advice_enc = null where id = ?', [cid1]), 'final_requires_fields');
await throws('finalisasi dua kali ditolak', () => call(api, 'finalize_consultation', [A1, cid1, null]), 'sudah final');

console.log('--- 4. Laporan baru menggantikan yang lama (append-only)');
const pid = (await q(root, 'select patient_id from consultations where id = ?', [cid1]))[0].patient_id;
const cid2 = await makeFinalReport(A1, pid, 'ke-2', true, true);
let row = (await q(root, 'select * from consultations where id = ?', [cid1]))[0];
ok('laporan lama tetap ada tetapi tidak terkini', row.status === 'final' && row.is_current === 0);
row = (await q(root, 'select * from consultations where id = ?', [cid2]))[0];
ok('laporan baru terkini dan menunjuk supersedes_id', row.is_current === 1 && row.supersedes_id === cid1);
ok('hanya satu laporan terkini per pasien', await n1('select count(*) from consultations where patient_id = ? and is_current = 1', [pid]) === 1);
await throws('dua is_current untuk satu pasien ditolak (unique)', () => q(root, 'update consultations set is_current = 1 where id = ?', [cid1]), 'duplicate');
await throws('open_consultation: pasien milik konsultan lain ditolak', async () => {
  const [{ id: s }] = await call(api, 'create_submission', [h('tok-x1'), b('i'), b('a'), b('t'), 1, 'HHS v1.0', '1.0.0']);
  await call(api, 'issue_access_code', [s, h('tok-x1'), h('code-x1')]);
  await call(api, 'accept_access_code', [A2, h('code-x1')]);
  await call(api, 'open_consultation', [A2, s, pid, null, 1]);
}, 'pasien tidak ditemukan');

console.log('--- 5. Tautan akun lewat kode dari konsultan + riwayat pasien');
ok('akun pasien belum tertaut: riwayat kosong', (await call(api, 'list_patient_reports', [B1])).length === 0);
await throws('akun pasien tak bisa membuat kode tautan', () => call(api, 'create_link_code', [B1, pid, h('X'.repeat(8)), JSON.stringify([cid1]), 15]), 'hanya konsultan');
await throws('konsultan lain tak bisa membuat kode untuk pasien ini', () => call(api, 'create_link_code', [A2, pid, h('LINK-B'), JSON.stringify([cid1]), 15]), 'pasien tidak ditemukan');
await throws('umur kode > 24 jam ditolak', () => call(api, 'create_link_code', [A1, pid, h('LINK-X'), JSON.stringify([cid1]), 1500]), 'umur kode');
await throws('umur kode 0 ditolak', () => call(api, 'create_link_code', [A1, pid, h('LINK-X0'), JSON.stringify([cid1]), 0]), 'umur kode');
await throws('kode tautan tanpa laporan ditolak', () => call(api, 'create_link_code', [A1, pid, h('LINK-Y'), '[]', 15]), 'laporan');
await throws('kode tautan dengan laporan bukan milik pasien ditolak', () => call(api, 'create_link_code', [A1, pid, h('LINK-Z'), JSON.stringify([uuid()]), 15]), 'laporan');
await throws('kode tautan dengan laporan draf ditolak', async () => {
  const [{ id: s }] = await call(api, 'create_submission', [h('tok-draf-link'), b('i'), b('a'), b('t'), 1, 'HHS v1.0', '1.0.0']);
  await call(api, 'issue_access_code', [s, h('tok-draf-link'), h('code-draf-link')]);
  await call(api, 'accept_access_code', [A1, h('code-draf-link')]);
  const [{ id: d }] = await call(api, 'open_consultation', [A1, s, pid, null, 1]);
  await call(api, 'create_link_code', [A1, pid, h('LINK-D'), JSON.stringify([d]), 15]);
}, 'final');
const [{ id: lid }] = await call(api, 'create_link_code', [A1, pid, h('LINK1234'), JSON.stringify([cid1, cid2]), 15]);
ok('konsultan membuat kode tautan (hash tersimpan)', typeof lid === 'string');
ok('yang tersimpan hash, bukan kode asli', await n1(`select count(*) from account_link_codes where code_hash = 'LINK1234'`) === 0);

for (let i = 1; i <= 5; i++) {
  r = (await call(api, 'redeem_link_code', [B2, h('TEBAK' + i)]))[0];
  ok(`tebakan salah ke-${i}: invalid`, r.status === 'invalid');
}
r = (await call(api, 'redeem_link_code', [B2, h('LINK1234')]))[0];
ok('setelah 5 gagal: akun terkunci walau kode benar', r.status === 'locked');
ok('pasien B tidak jadi pemilik rekam', (await q(root, 'select account_id from patients where id = ?', [pid]))[0].account_id === null);

await throws('akun konsultan tak bisa menebus kode tautan', () => call(api, 'redeem_link_code', [A1, h('LINK1234')]), 'hanya akun pasien');
r = (await call(api, 'redeem_link_code', [B1, h('LINK1234')]))[0];
ok('pasien A: kode benar diterima, 2 laporan dirilis', r.status === 'ok' && r.patient_id === pid && Number(r.released_count) === 2);
r = (await call(api, 'redeem_link_code', [B1, h('LINK1234')]))[0];
ok('kode tautan sekali pakai: kedua kali invalid', r.status === 'invalid');

let rep = await call(api, 'list_patient_reports', [B1]);
ok('riwayat pasien A berisi 2 laporan final', rep.length === 2);
let x = rep.find((v) => v.consultation_id === cid1);
ok('laporan 1 (flag false): saran terlihat', Buffer.compare(x.consultant_advice_enc, b('saran konsultan')) === 0);
ok('laporan 1 (flag false): ruqyah disembunyikan', x.ruqyah_final_condition === null && x.ruqyah_assessment_notes_enc === null);
ok('laporan 1 (flag false): catatan klinis disembunyikan', x.clinical_notes_enc === null);
x = rep.find((v) => v.consultation_id === cid2);
ok('laporan 2 (flag true): ruqyah terlihat', x.ruqyah_final_condition === 'B' && Buffer.compare(x.ruqyah_assessment_notes_enc, b('RUQYAH-ke-2')) === 0);
ok('laporan 2 (flag true): catatan klinis terlihat', Buffer.compare(x.clinical_notes_enc, b('CATATAN-ke-2')) === 0);
ok('saran sistem (system_result) tidak ada di hasil pasien', rep.every((v) => !('system_result_enc' in v)));
ok('snapshot jawaban tidak ada di hasil pasien', rep.every((v) => !Object.keys(v).some((k) => k.startsWith('snapshot'))));
ok('pasien B tidak melihat riwayat pasien A', (await call(api, 'list_patient_reports', [B2])).length === 0);
ok('identitas tak dikenal: riwayat kosong', (await call(api, 'list_patient_reports', [uuid()])).length === 0);
ok('akun pasien nonaktif: riwayat kosong', await (async () => { await q(root, 'update accounts set disabled_at = utc_timestamp(3) where id = ?', [B1]); const v = (await call(api, 'list_patient_reports', [B1])).length === 0; await q(root, 'update accounts set disabled_at = null where id = ?', [B1]); return v; })());

let cOther = await makeFinalReport(A1, pid, 'ke-3', false, false);
ok('laporan baru untuk pasien bertaut dirilis otomatis', (await q(root, 'select released_to_patient_at from consultations where id = ?', [cOther]))[0].released_to_patient_at !== null);
await q(root, 'update consultations set released_to_patient_at = null where id = ?', [cOther]);
ok('laporan final belum dirilis tidak muncul di riwayat pasien', (await call(api, 'list_patient_reports', [B1])).length === 2);
await q(root, 'update consultations set released_to_patient_at = utc_timestamp(3) where id = ?', [cOther]);
ok('setelah dirilis, laporan muncul di riwayat pasien', (await call(api, 'list_patient_reports', [B1])).length === 3);

cOther = await makeFinalReport(A1, null, 'tanpa-akun', true, true);
const otherPid = (await q(root, 'select patient_id from consultations where id = ?', [cOther]))[0].patient_id;
ok('pasien tanpa akun: laporan final tidak dirilis ke siapa pun', (await q(root, 'select c.released_to_patient_at as rel, p.account_id as acc from consultations c join patients p on p.id = c.patient_id where c.id = ?', [cOther]))[0].rel === null);

const [{ id: lid2 }] = await call(api, 'create_link_code', [A1, otherPid, h('KADALUWA'), JSON.stringify([cOther]), 15]);
await q(root, `update account_link_codes set expires_at = utc_timestamp(3) - interval 1 minute where id = ?`, [lid2]);
await q(root, `update code_attempts set locked_until = utc_timestamp(3) - interval 1 minute where account_id = ?`, [B2]);
r = (await call(api, 'redeem_link_code', [B2, h('KADALUWA')]))[0];
ok('kode tautan kedaluwarsa: invalid', r.status === 'invalid');
await call(api, 'create_link_code', [A1, pid, h('LINKBARU'), JSON.stringify([cid2]), 15]);
r = (await call(api, 'redeem_link_code', [B2, h('LINKBARU')]))[0];
ok('rekam sudah milik akun lain: kode ditolak', r.status === 'invalid');
await call(api, 'create_link_code', [A1, otherPid, h('LINK-LAMA'), JSON.stringify([cOther]), 15]);
await call(api, 'create_link_code', [A1, otherPid, h('LINK-BARU'), JSON.stringify([cOther]), 15]);
ok('kode tautan lama dicabut saat kode baru dibuat', await n1(`select count(*) from account_link_codes where patient_id = ? and revoked_at is not null`, [otherPid]) >= 1);

console.log('--- 6. Peran app_api: hak akses minimal');
for (const t of ['submissions', 'access_codes', 'account_link_codes', 'account_link_code_reports', 'code_attempts', 'patients', 'consultations', 'images', 'accounts', 'audit_log'])
  await throws(`app_api tak bisa membaca ${t}`, () => q(api, `select * from ${t}`), 'denied');
await throws('app_api tak bisa menulis ke patients langsung', () => q(api, `insert into patients (display_name_enc, key_version, created_by) values (x'41', 1, ?)`, [A1]), 'denied');
await throws('app_api tak bisa menulis ke audit_log', () => q(api, `insert into audit_log (action, entity, entity_id) values ('x', 'x', ?)`, [uuid()]), 'denied');
await throws('app_api tak bisa menghapus audit_log', () => q(api, 'delete from audit_log'), 'denied');
await throws('app_api tak bisa TRUNCATE/DROP audit_log', () => q(api, 'truncate table audit_log'), 'denied');
await throws('app_api tak bisa menjalankan purge', () => call(api, 'purge_expired_submissions'), 'denied');
await throws('app_api tak bisa memanggil pencatat percobaan langsung', () => call(api, 'code_attempt_fail', [A1, 'access']), 'denied');
await throws('app_api tak bisa memanggil app_role_of langsung', () => q(api, 'select app_role_of(?)', [A1]), 'denied');
await throws('app_api tak bisa membuat prosedur/tabel', () => q(api, 'create table bocor (x int)'), 'denied');
await throws('konsultan non-admin tak bisa membaca audit_log', () => call(api, 'list_audit', [A1, 10, null]), 'hanya admin');
ok('admin melihat audit_log', (await call(api, 'list_audit', [C1, 10, null])).length > 0);
ok('list_audit membatasi jumlah baris', (await call(api, 'list_audit', [C1, 2, null])).length === 2);
await throws('app_maintenance tak bisa membaca tabel', () => q(maint, 'select * from consultations'), 'denied');
await throws('app_maintenance tak bisa memanggil prosedur aplikasi', () => call(maint, 'create_submission', [h('m'), b('x'), b('x'), b('x'), 1, 'a', 'b']), 'denied');

console.log('--- 7. Audit append-only dan tanpa ciphertext');
await throws('audit_log tak bisa di-UPDATE (admin uji sekalipun)', () => q(root, `update audit_log set reason = 'x'`), 'append-only');
await throws('audit_log tak bisa di-DELETE', () => q(root, 'delete from audit_log'), 'append-only');
ok('audit tidak menyalin kolom *_enc', await n1(`select count(*) from audit_log where cast(new_values as char) like '%!_enc%' escape '!' or cast(old_values as char) like '%!_enc%' escape '!'`) === 0);
ok('audit mencatat finalisasi dengan alasan', await n1(`select count(*) from audit_log where entity = 'consultations' and reason = 'konsultasi pertama'`) >= 1);
ok('audit mencatat penautan akun pasien', await n1(`select count(*) from audit_log where entity = 'patients' and action = 'UPDATE' and reason = 'tautan akun lewat kode konsultan'`) >= 1);
ok('audit mencatat pelaku (actor_id)', await n1(`select count(*) from audit_log where entity = 'consultations' and actor_id is not null`) > 0);
ok('audit mencatat pembuatan pasien dan laporan', await n1(`select count(*) from audit_log where entity = 'patients' and action = 'INSERT'`) >= 1 && await n1(`select count(*) from audit_log where entity = 'consultations' and action = 'INSERT'`) >= 1);

console.log('--- 8. Foto, purge, constraint');
const [{ id: sidF }] = await call(api, 'create_submission', [h('tok-foto'), b('i'), b('a'), b('t'), 1, 'HHS v1.0', '1.0.0']);
const keys = [uuid(), uuid(), uuid()];
for (let i = 0; i < 3; i++) await call(api, 'attach_submission_image', [sidF, h('tok-foto'), 1234, h('isi' + i), keys[i]]);
await throws('batas 3 foto per respons', () => call(api, 'attach_submission_image', [sidF, h('tok-foto'), 10, h('isi4'), uuid()]), 'batas 3');
await throws('foto: token salah ditolak', () => call(api, 'attach_submission_image', [sidF, h('salah'), 10, h('isi5'), uuid()]));
const [{ id: sid2 }] = await call(api, 'create_submission', [h('tok-segar'), b('i'), b('a'), b('t'), 1, 'HHS v1.0', '1.0.0']);
await throws('constraint: mime selain image/webp ditolak', () => q(root, `insert into images (submission_id, mime, bytes, sha256) values (?, 'image/png', 10, ?)`, [sidF, h('z')]), 'check');
await throws('constraint: gambar harus punya tepat satu induk', () => q(root, `insert into images (bytes, sha256) values (10, ?)`, [h('y')]), 'tepat satu induk');
await throws('constraint: gambar dengan dua induk ditolak', () => q(root, `insert into images (submission_id, consultation_id, bytes, sha256) values (?, ?, 10, ?)`, [sidF, cid1, h('w')]), 'tepat satu induk');

await call(api, 'issue_access_code', [sid2, h('tok-segar'), h('KODEPRG1')]);
await call(api, 'accept_access_code', [A1, h('KODEPRG1')]);
const [{ id: sid3 }] = await call(api, 'create_submission', [h('tok-draf-baru'), b('i'), b('a'), b('t'), 1, 'HHS v1.0', '1.0.0']);
await q(root, `update submissions set expires_at = utc_timestamp(3) - interval 1 minute where id = ?`, [sidF]);
const purged = await call(maint, 'purge_expired_submissions');
ok('purge mengembalikan 3 storage_key foto untuk dihapus dari object storage', purged.length === 3 && keys.every((k) => purged.some((p) => p.storage_key === k)));
ok('purge menghapus respons kedaluwarsa', await n1('select count(*) from submissions where id = ?', [sidF]) === 0);
ok('purge ikut menghapus metadata foto', await n1(`select count(*) from images where storage_key in (?, ?, ?)`, keys) === 0);
ok('purge tidak menghapus respons yang sudah dalam konsultasi', await n1('select count(*) from submissions where id = ?', [sid2]) === 1);
ok('purge tidak menghapus respons draf yang belum kedaluwarsa', await n1('select count(*) from submissions where id = ?', [sid3]) === 1);
ok('purge kedua kali mengembalikan daftar kosong', (await call(maint, 'purge_expired_submissions')).length === 0);

console.log('--- 9. Atomisitas dan konkurensi');
const workers = await Promise.all([0, 1, 2, 3].map(() => mysql.createConnection({ ...common, user: process.env.API_USER, password: process.env.API_PASSWORD })));
let rondeBermasalah = 0;
for (let i = 0; i < 25; i++) {
  const [{ id: sidC }] = await call(api, 'create_submission', [h('tok-konk' + i), b('i'), b('a'), b('t'), 1, 'HHS v1.0', '1.0.0']);
  await call(api, 'issue_access_code', [sidC, h('tok-konk' + i), h('KONKURN' + i)]);
  const results = await Promise.all(workers.map((w, k) => call(w, 'accept_access_code', [k % 2 === 0 ? A1 : A2, h('KONKURN' + i)])));
  if (results.filter((rs) => rs[0].status === 'ok').length !== 1) rondeBermasalah++;
}
ok('25 ronde: 4 koneksi menerima kode yang sama bersamaan, tepat satu berhasil per ronde', rondeBermasalah === 0);
await Promise.all(workers.map((w) => w.end()));
await throws('error di tengah prosedur membatalkan seluruh perubahan (rollback)', async () => {
  const [{ id: s }] = await call(api, 'create_submission', [h('tok-rb'), b('i'), b('a'), b('t'), 1, 'HHS v1.0', '1.0.0']);
  await call(api, 'issue_access_code', [s, h('tok-rb'), h('code-rb1')]);
  const [{ id: s2 }] = await call(api, 'create_submission', [h('tok-rb2'), b('i'), b('a'), b('t'), 1, 'HHS v1.0', '1.0.0']);
  await call(api, 'issue_access_code', [s2, h('tok-rb2'), h('code-rb2')]);
  // hash code-rb2 sudah dipakai respons lain: INSERT gagal SETELAH UPDATE 'revoked' atas kode code-rb1 berjalan
  await call(api, 'issue_access_code', [s, h('tok-rb'), h('code-rb2')]);
}, 'duplicate');
ok('rollback: kode lama respons pertama tetap aktif (tidak jadi dicabut)', await n1(`select count(*) from access_codes a join submissions s on s.id = a.submission_id where s.edit_token_hash = ? and a.status = 'active' and a.code_hash = ?`, [h('tok-rb'), h('code-rb1')]) === 1);
await q(api, 'select 1');
ok('koneksi tetap bersih setelah error (tidak ada transaksi menggantung)', (await q(root, `select count(*) as c from information_schema.innodb_trx`))[0].c === 0);

console.log(`== ${pass} PASS, ${fail} FAIL ==`);
await root.end(); await api.end(); await maint.end();
process.exit(fail > 0 ? 1 : 0);
