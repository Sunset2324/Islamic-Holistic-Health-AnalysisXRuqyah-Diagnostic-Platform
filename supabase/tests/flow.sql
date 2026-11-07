-- Uji alur manual. Jalankan setelah 0001_init.sql di database KOSONG (bukan produksi).
\set ON_ERROR_STOP off
\set tok '\'0123456789abcdef0123456789abcdef\''
\set bad '\'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\''

insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
insert into public.staff_profiles (id, display_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'Konsultan A', 'consultant'),
  ('22222222-2222-2222-2222-222222222222', 'Admin', 'admin');

\echo '== 1. anon: akses tabel langsung harus ditolak'
set role anon;
select count(*) from public.submissions;
\echo '== 2. anon: buat respons, token pendek ditolak'
select public.create_submission('pendek', '{}', '{}', '{}', 'HHS v1.0', '1.0.0');
select public.create_submission(:tok, '{"name":"Budi","age":30}', '{"PL-01":2}', '{}', 'HHS v1.0', '1.0.0') as sid \gset
\echo '== 3. token salah tidak bisa baca (harus kosong) / benar bisa'
select public.get_submission(:'sid', :bad) is null as salah_kosong;
select public.get_submission(:'sid', :tok) ->> 'status' as status_benar;
\echo '== 4. edit oleh pasien'
select public.update_submission(:'sid', :tok, null, '{"PL-01":4}', null);
select public.update_submission(:'sid', :bad, null, '{"PL-01":5}', null);
select public.get_submission(:'sid', :tok) -> 'answers' as answers_setelah_edit;
\echo '== 5. kode akses (8 karakter), terbitkan ulang mencabut yang lama'
select public.issue_access_code(:'sid', :tok) as kode1 \gset
select public.issue_access_code(:'sid', :tok) as kode2 \gset
reset role;
select code, status from public.access_codes order by created_at;

\echo '== 6. konsultan: kode lama ditolak, kode baru diterima'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.accept_access_code(:'kode1');
select public.accept_access_code(lower(:'kode2')) as cid \gset
\echo '== 7. pasien tidak bisa lagi mengubah (terkunci)'
set role anon; reset request.jwt.claim.sub;
select public.update_submission(:'sid', :tok, null, '{"PL-01":1}', null);
select public.issue_access_code(:'sid', :tok);

\echo '== 8. konsultan: finalisasi tanpa ruqyah ditolak, dengan ruqyah diterima'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select public.finalize_consultation(:'cid');
update public.consultations set ruqyah_final_condition = 'B', ruqyah_assessment_notes = 'catatan' where id = :'cid';
select public.finalize_consultation(:'cid', 'konsultasi pertama');
\echo '== 9. laporan final tidak bisa diubah langsung'
update public.consultations set clinical_notes = 'ubah' where id = :'cid';
select status, is_current, finalized_at is not null as ada_waktu from public.consultations;
\echo '== 10. konsultan non-admin tidak bisa baca audit; admin bisa'
select count(*) from public.audit_log;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as audit_admin from public.audit_log;
\echo '== 11. audit append-only'
delete from public.audit_log;
reset role;
\echo '== 12. submission sementara terhapus setelah final'
select count(*) as submissions_tersisa from public.submissions;

\echo '== 13. purge: respons kedaluwarsa dihapus'
set role anon;
select public.create_submission('abcdefghijklmnopqrstuvwxyz123456', '{}', '{}', '{}', 'HHS v1.0', '1.0.0') as s2 \gset
reset role;
update public.submissions set expires_at = now() - interval '1 minute' where id = :'s2';
select public.purge_expired_submissions() as dihapus;
set role anon;
select public.purge_expired_submissions();
reset role;
