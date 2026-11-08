-- Uji alur skema. Jalankan di database KOSONG setelah 0001_init.sql:
--   psql -v ON_ERROR_STOP=1 -d <db_uji> -f db/tests/flow.sql
-- Setiap kasus mencetak PASS/FAIL. Skrip gagal (exit != 0) bila ada FAIL.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create schema t;
grant usage on schema t to app_api, app_maintenance;

create function t.b(s text) returns bytea language sql immutable as $$ select convert_to(s, 'UTF8') $$;
create function t.h(s text) returns text language sql immutable as $$ select encode(sha256(convert_to(s, 'UTF8')), 'hex') $$;
create function t.bump(k text) returns void language plpgsql as $$
begin perform set_config(k, (coalesce(nullif(current_setting(k, true), ''), '0')::int + 1)::text, false); end $$;
create function t.ok(n text, c boolean) returns void language plpgsql as $$
begin
  if c is true then perform t.bump('t.pass'); raise notice 'PASS  %', n;
  else perform t.bump('t.fail'); raise notice 'FAIL  %', n; end if;
end $$;
-- Kasus lolos bila perintah melempar error (opsional: pesan cocok dengan pola).
create function t.throws(n text, q text, pat text default null) returns void language plpgsql as $$
begin
  execute q;
  perform t.ok(n || ' (seharusnya error)', false);
exception when others then
  perform t.ok(n, pat is null or sqlerrm ilike ('%' || pat || '%'));
end $$;
create function t.summary() returns void language plpgsql as $$
begin
  raise notice '== % PASS, % FAIL ==', coalesce(nullif(current_setting('t.pass', true), ''), '0'), coalesce(nullif(current_setting('t.fail', true), ''), '0');
  if coalesce(nullif(current_setting('t.fail', true), ''), '0')::int > 0 then raise exception 'ada kasus FAIL'; end if;
end $$;

-- Alur lengkap sebagai konsultan (dijalankan sebagai superuser; identitas lewat app.account_id).
create function t.make_final_report(p_consultant uuid, p_patient uuid, p_tag text, p_share_ruqyah boolean, p_share_notes boolean)
returns uuid language plpgsql as $$
declare sid uuid; cid uuid;
begin
  perform set_config('app.account_id', p_consultant::text, false);
  sid := create_submission(t.h('tok-' || p_tag), t.b('intake'), t.b('answers'), t.b('tags'), 1::smallint, 'HHS v1.0', '1.0.0');
  perform issue_access_code(sid, t.h('tok-' || p_tag), t.h('code-' || p_tag));
  perform * from accept_access_code(t.h('code-' || p_tag));
  cid := open_consultation(sid, p_patient, case when p_patient is null then t.b('Nama ' || p_tag) end, 1::smallint);
  update consultations
     set ruqyah_final_condition = 'B', ruqyah_assessment_notes_enc = t.b('RUQYAH-' || p_tag),
         consultant_advice_enc = t.b('SARAN-' || p_tag), clinical_notes_enc = t.b('CATATAN-' || p_tag),
         system_result_enc = t.b('SISTEM-' || p_tag),
         share_ruqyah_with_patient = p_share_ruqyah, share_clinical_notes_with_patient = p_share_notes
   where id = cid;
  perform finalize_consultation(cid, 'uji');
  return cid;
end $$;

-- Fixture akun
insert into accounts (id, email, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'konsultan.a@contoh.test', 'consultant'),
  ('00000000-0000-0000-0000-0000000000a2', 'konsultan.b@contoh.test', 'consultant'),
  ('00000000-0000-0000-0000-0000000000b1', 'pasien.a@contoh.test', 'patient'),
  ('00000000-0000-0000-0000-0000000000b2', 'pasien.b@contoh.test', 'patient'),
  ('00000000-0000-0000-0000-0000000000c1', 'admin@contoh.test', 'admin');

\echo '--- 1. Pasien tamu: token, edit, kode akses'
do $$
declare sid uuid; n int; r record; tok text := t.h('token-pasien-1');
begin
  perform set_config('app.account_id', '', false);
  set local role app_api;
  sid := create_submission(tok, t.b('intake-v1'), t.b('answers-v1'), t.b('tags-v1'), 1::smallint, 'HHS v1.0', '1.0.0');
  perform set_config('t.sid', sid::text, false);
  perform t.ok('create_submission mengembalikan id', sid is not null);
  select count(*) into n from get_submission(sid, t.h('token-salah'));
  perform t.ok('token salah: get_submission kosong', n = 0);
  select count(*) into n from get_submission(sid, tok);
  perform t.ok('token benar: get_submission ada', n = 1);
  perform t.throws('token salah: update ditolak', format('select update_submission(%L, %L, %L, %L, %L, 1::smallint)', sid, t.h('token-salah'), t.b('x'), t.b('x'), t.b('x')), 'tidak ditemukan');
  perform update_submission(sid, tok, t.b('intake-v2'), t.b('answers-v2'), t.b('tags-v2'), 1::smallint);
  select * into r from get_submission(sid, tok);
  perform t.ok('pasien dapat mengubah respons (draft)', r.answers_enc = t.b('answers-v2'));
  perform t.throws('token salah: delete ditolak', format('select delete_submission(%L, %L)', sid, t.h('token-salah')));
  perform t.throws('token salah: issue_access_code ditolak', format('select issue_access_code(%L, %L, %L)', sid, t.h('token-salah'), t.h('kode-x')));
  perform issue_access_code(sid, tok, t.h('KODE0001'));
  perform issue_access_code(sid, tok, t.h('KODE0002'));
  reset role;
  select count(*) into n from access_codes where submission_id = sid and status = 'revoked';
  perform t.ok('menerbitkan ulang kode mencabut kode lama', n = 1);
  select count(*) into n from access_codes where submission_id = sid and status = 'active';
  perform t.ok('hanya satu kode aktif per respons', n = 1);
  select count(*) into n from submissions where id = sid and expires_at > now() + interval '6 days 23 hours' and expires_at <= now() + interval '7 days';
  perform t.ok('kedaluwarsa 7 hari dari dibuat', n = 1);
  perform t.throws('hash token berformat salah ditolak (check)', $q$select create_submission('pendek', 'x'::bytea, 'x'::bytea, 'x'::bytea, 1::smallint, 'a', 'b')$q$, 'check');
end $$;

\echo '--- 2. Konsultan menerima kode, respons terkunci'
do $$
declare sid uuid := current_setting('t.sid')::uuid; r record; n int; cid uuid;
begin
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a1', false);
  select * into r from accept_access_code(t.h('KODE-SALAH'));
  perform t.ok('kode salah: status invalid', r.status = 'invalid');
  select * into r from accept_access_code(t.h('KODE0001'));
  perform t.ok('kode lama (dicabut): status invalid', r.status = 'invalid');
  select * into r from accept_access_code(t.h('KODE0002'));
  perform t.ok('kode benar: status ok + blob diteruskan', r.status = 'ok' and r.submission_id = sid and r.answers_enc = t.b('answers-v2'));
  select * into r from accept_access_code(t.h('KODE0002'));
  perform t.ok('kode sekali pakai: kedua kalinya invalid', r.status = 'invalid');
  perform set_config('app.account_id', '', false);
  perform t.throws('respons terkunci: pasien tak bisa mengubah', format('select update_submission(%L, %L, %L, %L, %L, 1::smallint)', sid, t.h('token-pasien-1'), t.b('x'), t.b('x'), t.b('x')));
  perform t.throws('respons terkunci: pasien tak bisa terbitkan kode', format('select issue_access_code(%L, %L, %L)', sid, t.h('token-pasien-1'), t.h('KODE0003')));
  perform t.throws('respons terkunci: pasien tak bisa menghapus', format('select delete_submission(%L, %L)', sid, t.h('token-pasien-1')));

  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a2', false);
  perform t.throws('konsultan lain tak bisa membuka konsultasi', format('select open_consultation(%L, null, %L, 1::smallint)', sid, t.b('Nama')), 'belum diterima');
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a1', false);
  perform t.throws('pasien baru wajib nama terenkripsi', format('select open_consultation(%L, null, null, 1::smallint)', sid), 'nama pasien');
  cid := open_consultation(sid, null, t.b('Budi (terenkripsi)'), 1::smallint);
  perform set_config('t.cid1', cid::text, false);
  perform t.ok('open_consultation membuat laporan draf', cid is not null);
  perform t.throws('konsultasi tak bisa dibuka dua kali', format('select open_consultation(%L, null, %L, 1::smallint)', sid, t.b('Nama')), 'sudah dibuka');
  select count(*) into n from consultations;
  perform t.ok('RLS: konsultan A melihat laporannya', n = 1);
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a2', false);
  select count(*) into n from consultations;
  perform t.ok('RLS: konsultan B tidak melihat laporan konsultan A', n = 0);
  select count(*) into n from patients;
  perform t.ok('RLS: konsultan B tidak melihat pasien konsultan A', n = 0);
  reset role;
  select count(*) into n from submissions where id = sid and status = 'in_consultation' and expires_at is null;
  perform t.ok('respons berstatus in_consultation tanpa kedaluwarsa', n = 1);
  select count(*) into n from patients where account_id is null;
  perform t.ok('pasien baru tanpa akun (tanpa riwayat)', n = 1);
end $$;

\echo '--- 3. Finalisasi wajib ruqyah + saran; kolom terkunci'
do $$
declare cid uuid := current_setting('t.cid1')::uuid; n int; st text;
begin
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a1', false);
  perform t.throws('finalisasi tanpa ruqyah ditolak', format('select finalize_consultation(%L)', cid), 'ruqyah');
  update consultations set ruqyah_final_condition = 'C', ruqyah_assessment_notes_enc = t.b('catatan ruqyah') where id = cid;
  perform t.throws('finalisasi tanpa saran konsultan ditolak', format('select finalize_consultation(%L)', cid), 'saran');
  perform t.throws('konsultan tak bisa mengubah status langsung', format('update consultations set status = %L where id = %L', 'final', cid), 'permission denied');
  perform t.throws('konsultan tak bisa mengubah is_current langsung', format('update consultations set is_current = true where id = %L', cid), 'permission denied');
  perform t.throws('konsultan tak bisa merilis ke pasien langsung', format('update consultations set released_to_patient_at = now() where id = %L', cid), 'permission denied');
  update consultations set consultant_advice_enc = t.b('saran konsultan'), clinical_notes_enc = t.b('catatan klinis'),
         system_result_enc = t.b('hasil sistem'), share_ruqyah_with_patient = false where id = cid;
  perform finalize_consultation(cid, 'konsultasi pertama');
  perform t.ok('finalisasi lolos bila ruqyah + saran lengkap', (select status::text from consultations where id = cid) = 'final');
  update consultations set clinical_notes_enc = t.b('ubah setelah final') where id = cid;
  get diagnostics n = row_count;
  perform t.ok('laporan final tidak bisa diubah (RLS: 0 baris)', n = 0);
  reset role;
  perform t.ok('laporan final: is_current = true', (select is_current from consultations where id = cid));
  perform t.ok('isi laporan final tidak berubah', (select clinical_notes_enc from consultations where id = cid) = t.b('catatan klinis'));
  select count(*) into n from submissions where id = current_setting('t.sid')::uuid;
  perform t.ok('respons sementara dihapus setelah final (salinan ada di laporan)', n = 0);
  perform t.throws('constraint: laporan final tanpa saran ditolak langsung di tabel',
    format('update consultations set consultant_advice_enc = null where id = %L', cid), 'final_requires_fields');
end $$;

\echo '--- 4. Laporan baru menggantikan yang lama (append-only)'
do $$
declare c1 uuid := current_setting('t.cid1')::uuid; c2 uuid; pid uuid; r record;
begin
  select patient_id into pid from consultations where id = c1;
  c2 := t.make_final_report('00000000-0000-0000-0000-0000000000a1', pid, 'ke-2', true, true);
  perform set_config('t.cid2', c2::text, false);
  select * into r from consultations where id = c1;
  perform t.ok('laporan lama tetap ada tetapi tidak terkini', r.status = 'final' and r.is_current = false);
  select * into r from consultations where id = c2;
  perform t.ok('laporan baru terkini dan menunjuk supersedes_id', r.is_current and r.supersedes_id = c1);
  perform t.ok('hanya satu laporan terkini per pasien', (select count(*) from consultations where patient_id = pid and is_current) = 1);
  perform t.throws('dua is_current untuk satu pasien ditolak (unique)', format('update consultations set is_current = true where id = %L', c1));
end $$;

\echo '--- 5. Tautan akun lewat kode dari konsultan + tampilan pasien'
do $$
declare c1 uuid := current_setting('t.cid1')::uuid; c2 uuid := current_setting('t.cid2')::uuid;
        pid uuid; other_pid uuid; c_other uuid; draft_cid uuid; r record; n int; i int; lid uuid;
begin
  select patient_id into pid from consultations where id = c1;

  -- sebelum ditautkan, pasien terdaftar tidak melihat apa pun
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000b1', false);
  select count(*) into n from patient_visible_reports;
  perform t.ok('akun pasien belum tertaut: riwayat kosong', n = 0);
  select count(*) into n from consultations;
  perform t.ok('akun pasien tidak bisa membaca tabel consultations (RLS)', n = 0);
  perform t.throws('akun pasien tak bisa memakai fungsi konsultan', format('select create_link_code(%L, %L, %L::uuid[])', pid, t.h('X'), array[c1]::text), 'hanya konsultan');
  reset role;

  -- konsultan membuat kode tautan
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a2', false);
  perform t.throws('konsultan lain tak bisa membuat kode untuk pasien ini', format('select create_link_code(%L, %L, %L::uuid[])', pid, t.h('LINK-B'), array[c1]::text), 'pasien tidak ditemukan');
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a1', false);
  perform t.throws('umur kode > 24 jam ditolak', format('select create_link_code(%L, %L, %L::uuid[], interval %L)', pid, t.h('LINK-X'), array[c1]::text, '25 hours'), 'umur kode');
  perform t.throws('kode tautan tanpa laporan ditolak', format('select create_link_code(%L, %L, %L::uuid[])', pid, t.h('LINK-Y'), '{}'), 'laporan');
  lid := create_link_code(pid, t.h('LINK1234'), array[c1, c2]);
  perform t.ok('konsultan membuat kode tautan (hash tersimpan)', lid is not null);
  reset role;
  perform t.ok('yang tersimpan hash, bukan kode asli', (select count(*) from account_link_codes where code_hash = 'LINK1234') = 0);

  -- pasien B salah menebak sampai terkunci
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000b2', false);
  for i in 1..5 loop
    select * into r from redeem_link_code(t.h('TEBAK' || i));
    perform t.ok('tebakan salah ke-' || i || ': invalid', r.status = 'invalid');
  end loop;
  select * into r from redeem_link_code(t.h('LINK1234'));
  perform t.ok('setelah 5 gagal: akun terkunci walau kode benar', r.status = 'locked');
  reset role;
  perform t.ok('pasien B tidak jadi pemilik rekam', (select account_id from patients where id = pid) is null);

  -- pasien A memasukkan kode yang benar
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000b1', false);
  select * into r from redeem_link_code(t.h('LINK1234'));
  perform t.ok('pasien A: kode benar diterima, 2 laporan dirilis', r.status = 'ok' and r.patient_id = pid and r.released_count = 2);
  select * into r from redeem_link_code(t.h('LINK1234'));
  perform t.ok('kode tautan sekali pakai: kedua kali invalid', r.status = 'invalid');

  -- isi tampilan pasien
  select count(*) into n from patient_visible_reports;
  perform t.ok('riwayat pasien A berisi 2 laporan final', n = 2);
  select * into r from patient_visible_reports where consultation_id = c1;
  perform t.ok('laporan 1 (flag false): saran terlihat', r.consultant_advice_enc = t.b('saran konsultan'));
  perform t.ok('laporan 1 (flag false): ruqyah disembunyikan', r.ruqyah_final_condition is null and r.ruqyah_assessment_notes_enc is null);
  perform t.ok('laporan 1 (flag false): catatan klinis disembunyikan', r.clinical_notes_enc is null);
  select * into r from patient_visible_reports where consultation_id = c2;
  perform t.ok('laporan 2 (flag true): ruqyah terlihat', r.ruqyah_final_condition = 'B' and r.ruqyah_assessment_notes_enc = t.b('RUQYAH-ke-2'));
  perform t.ok('laporan 2 (flag true): catatan klinis terlihat', r.clinical_notes_enc = t.b('CATATAN-ke-2'));
  perform t.throws('saran sistem (system_result) tidak ada di tampilan pasien', 'select system_result_enc from patient_visible_reports', 'does not exist');
  perform t.throws('snapshot jawaban tidak ada di tampilan pasien', 'select snapshot_answers_enc from patient_visible_reports', 'does not exist');

  -- pasien lain tidak melihat milik A
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000b2', false);
  select count(*) into n from patient_visible_reports;
  perform t.ok('pasien B tidak melihat riwayat pasien A', n = 0);
  perform set_config('app.account_id', '', false);
  select count(*) into n from patient_visible_reports;
  perform t.ok('tanpa identitas: tampilan kosong', n = 0);
  reset role;

  -- laporan berikutnya untuk pasien yang sudah tertaut dirilis otomatis
  c_other := t.make_final_report('00000000-0000-0000-0000-0000000000a1', pid, 'ke-3', false, false);
  perform t.ok('laporan baru untuk pasien bertaut dirilis otomatis', (select released_to_patient_at is not null from consultations where id = c_other));

  -- laporan final yang belum dirilis tidak muncul di riwayat, walau rekamnya sudah tertaut
  perform set_config('app.account_id', '', false);
  update consultations set released_to_patient_at = null where id = c_other;
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000b1', false);
  select count(*) into n from patient_visible_reports;
  perform t.ok('laporan final belum dirilis tidak muncul di riwayat pasien', n = 2);
  reset role;
  update consultations set released_to_patient_at = now() where id = c_other;
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000b1', false);
  select count(*) into n from patient_visible_reports;
  perform t.ok('setelah dirilis, laporan muncul di riwayat pasien', n = 3);
  reset role;

  -- pasien tanpa akun: tidak pernah muncul di riwayat siapa pun
  c_other := t.make_final_report('00000000-0000-0000-0000-0000000000a1', null, 'tanpa-akun', true, true);
  select patient_id into other_pid from consultations where id = c_other;
  perform t.ok('pasien tanpa akun: laporan final tidak dirilis ke siapa pun', (select released_to_patient_at is null and p.account_id is null from consultations c join patients p on p.id = c.patient_id where c.id = c_other));

  -- kode tautan kedaluwarsa
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a1', false);
  lid := create_link_code(other_pid, t.h('KADALUWA'), array[c_other]);
  reset role;
  update account_link_codes set expires_at = now() - interval '1 minute' where id = lid;
  update code_attempts set locked_until = now() - interval '1 minute' where account_id = '00000000-0000-0000-0000-0000000000b2';
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000b2', false);
  select * into r from redeem_link_code(t.h('KADALUWA'));
  perform t.ok('kode tautan kedaluwarsa: invalid', r.status = 'invalid');
  reset role;

  -- kode tautan dicabut saat konsultan membuat yang baru; pasien lain tidak bisa mengambil rekam yang sudah tertaut
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a1', false);
  lid := create_link_code(pid, t.h('LINKBARU'), array[c2]);
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000b2', false);
  select * into r from redeem_link_code(t.h('LINKBARU'));
  perform t.ok('rekam sudah milik akun lain: kode ditolak', r.status = 'invalid');
  reset role;
end $$;

\echo '--- 6. Peran app_api: hak akses minimal'
do $$
declare n int;
begin
  set local role app_api;
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a1', false);
  perform t.throws('app_api tak bisa membaca submissions', 'select * from submissions', 'permission denied');
  perform t.throws('app_api tak bisa membaca access_codes', 'select * from access_codes', 'permission denied');
  perform t.throws('app_api tak bisa membaca account_link_codes', 'select * from account_link_codes', 'permission denied');
  perform t.throws('app_api tak bisa membaca code_attempts', 'select * from code_attempts', 'permission denied');
  perform t.throws('app_api tak bisa menulis ke patients langsung', $q$insert into patients (display_name_enc, key_version, created_by) values ('x'::bytea, 1, '00000000-0000-0000-0000-0000000000a1')$q$, 'permission denied');
  perform t.throws('app_api tak bisa menulis ke audit_log', $q$insert into audit_log (action, entity, entity_id) values ('x', 'x', gen_random_uuid())$q$, 'permission denied');
  perform t.throws('app_api tak bisa menghapus audit_log', 'delete from audit_log', 'permission denied');
  perform t.throws('app_api tak bisa membaca kolom email akun lain di luar RLS (hanya diri sendiri)', 'select 1/(count(*)-1) from accounts', 'division by zero');
  perform t.throws('app_api tak bisa menjalankan purge', 'select * from purge_expired_submissions()', 'permission denied');
  perform t.throws('app_api tak bisa memanggil pencatat percobaan langsung', $q$select code_attempt_fail('access')$q$, 'permission denied');
  select count(*) into n from audit_log;
  perform t.ok('konsultan non-admin tidak melihat audit_log', n = 0);
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000c1', false);
  select count(*) into n from audit_log;
  perform t.ok('admin melihat audit_log', n > 0);
  reset role;
  set local role app_maintenance;
  perform t.throws('app_maintenance tak bisa membaca tabel', 'select * from consultations', 'permission denied');
  reset role;
end $$;

\echo '--- 7. Audit append-only dan tanpa ciphertext'
do $$
begin
  perform t.throws('audit_log tak bisa di-UPDATE (superuser sekalipun)', 'update audit_log set reason = ''x''', 'append-only');
  perform t.throws('audit_log tak bisa di-DELETE', 'delete from audit_log', 'append-only');
  perform t.throws('audit_log tak bisa di-TRUNCATE', 'truncate audit_log', 'append-only');
  perform t.ok('audit tidak menyalin kolom *_enc', (select count(*) from audit_log where after::text like '%\_enc%' or before::text like '%\_enc%') = 0);
  perform t.ok('audit mencatat finalisasi dengan alasan', (select count(*) from audit_log where entity = 'consultations' and reason = 'konsultasi pertama') >= 1);
  perform t.ok('audit mencatat penautan akun pasien', (select count(*) from audit_log where entity = 'patients' and action = 'UPDATE' and reason = 'tautan akun lewat kode konsultan') = 1);
  perform t.ok('audit mencatat pelaku (actor_id)', (select count(*) from audit_log where entity = 'consultations' and actor_id is not null) > 0);
end $$;

\echo '--- 8. Foto, purge, constraint'
do $$
declare sid uuid; sid2 uuid; sid3 uuid; n int; k uuid; keys uuid[]; kp uuid;
begin
  set local role app_api;
  perform set_config('app.account_id', '', false);
  sid := create_submission(t.h('tok-foto'), t.b('i'), t.b('a'), t.b('t'), 1::smallint, 'HHS v1.0', '1.0.0');
  k := attach_submission_image(sid, t.h('tok-foto'), 1234, t.h('isi1'), gen_random_uuid());
  perform attach_submission_image(sid, t.h('tok-foto'), 1234, t.h('isi2'), gen_random_uuid());
  perform attach_submission_image(sid, t.h('tok-foto'), 1234, t.h('isi3'), gen_random_uuid());
  perform t.throws('batas 3 foto per respons', format('select attach_submission_image(%L, %L, 10, %L, gen_random_uuid())', sid, t.h('tok-foto'), t.h('isi4')), 'batas 3');
  perform t.throws('foto: token salah ditolak', format('select attach_submission_image(%L, %L, 10, %L, gen_random_uuid())', sid, t.h('salah'), t.h('isi5')));
  sid2 := create_submission(t.h('tok-segar'), t.b('i'), t.b('a'), t.b('t'), 1::smallint, 'HHS v1.0', '1.0.0');
  reset role;
  perform t.throws('constraint: mime selain image/webp ditolak', format('insert into images (submission_id, mime, bytes, sha256) values (%L, %L, 10, %L)', sid, 'image/png', t.h('z')), 'check');
  perform t.throws('constraint: gambar harus punya tepat satu induk', format('insert into images (bytes, sha256) values (10, %L)', t.h('y')), 'check');

  -- respons dalam konsultasi tidak boleh ikut terhapus oleh purge
  perform set_config('app.account_id', '00000000-0000-0000-0000-0000000000a1', false);
  perform issue_access_code(sid2, t.h('tok-segar'), t.h('KODEPRG1'));
  perform * from accept_access_code(t.h('KODEPRG1'));

  sid3 := create_submission(t.h('tok-draf-baru'), t.b('i'), t.b('a'), t.b('t'), 1::smallint, 'HHS v1.0', '1.0.0');
  update submissions set expires_at = now() - interval '1 minute' where id = sid;
  set local role app_maintenance;
  select array_agg(storage_key) into keys from purge_expired_submissions();
  reset role;
  perform t.ok('purge mengembalikan 3 storage_key foto untuk dihapus dari object storage', coalesce(array_length(keys, 1), 0) = 3);
  perform t.ok('purge menghapus respons kedaluwarsa', (select count(*) from submissions where id = sid) = 0);
  perform t.ok('purge ikut menghapus metadata foto', (select count(*) from images where storage_key = any (keys)) = 0);
  perform t.ok('purge tidak menghapus respons yang sudah dalam konsultasi', (select count(*) from submissions where id = sid2) = 1);
  perform t.ok('purge tidak menghapus respons draf yang belum kedaluwarsa', (select count(*) from submissions where id = sid3) = 1);
end $$;

select t.summary();
