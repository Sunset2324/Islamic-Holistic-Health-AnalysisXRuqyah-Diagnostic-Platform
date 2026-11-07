-- MyHerbalis / Holistik Islami - skema Fase 2 (draf untuk review).
-- Jalankan di Supabase SQL Editor atau lewat `supabase db push`. File ini tidak berisi kunci/rahasia.
--
-- ASUMSI yang perlu dikonfirmasi (lihat supabase/README.md):
--   1. Kedaluwarsa 7 hari dihitung dari saat respons dibuat dan TIDAK diperpanjang oleh pengeditan.
--   2. Respons terkunci (tidak bisa diubah pasien) begitu konsultan menerima kode.
--   3. Laporan konsultasi bersifat append-only: laporan baru menandai yang lama "tidak terkini", bukan menimpa.
--   4. Pasien tidak punya akses baca ke laporan konsultasi sama sekali.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipe
-- ---------------------------------------------------------------------------
create type public.submission_status as enum ('draft', 'in_consultation');
create type public.access_code_status as enum ('active', 'accepted', 'expired', 'revoked');
create type public.consultation_status as enum ('draft', 'final');
create type public.ruqyah_condition as enum ('A', 'B', 'C', 'D');
create type public.staff_role as enum ('consultant', 'admin');

-- ---------------------------------------------------------------------------
-- Staf (konsultan/admin) - terhubung ke Supabase Auth
-- ---------------------------------------------------------------------------
create table public.staff_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  role public.staff_role not null default 'consultant',
  created_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_profiles where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Respons pra-konsultasi (sementara, privat). Pasien tamu tanpa akun:
-- akses lewat token rahasia yang disimpan di perangkat pasien; DB hanya menyimpan hash-nya.
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  edit_token_hash text not null,
  status public.submission_status not null default 'draft',
  -- Isian pasien (PatientIntake): name, age, mainComplaint, complaintDuration, complaintFrequency, complaintImpact, medicalHistory
  intake jsonb not null default '{}'::jsonb,
  -- { "PL-01": 4, "PL-02": null, ... } ; null = tidak ingin menjawab
  answers jsonb not null default '{}'::jsonb,
  -- { "PL-01": { "tags": ["TAG_ID"], "otherNote": "..." }, ... }
  tag_selections jsonb not null default '{}'::jsonb,
  questionnaire_version text not null,
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Otomatis dihapus setelah lewat; null bila sudah dalam konsultasi (data dipertahankan sampai laporan final).
  expires_at timestamptz default (now() + interval '7 days'),
  check (jsonb_typeof(intake) = 'object' and jsonb_typeof(answers) = 'object' and jsonb_typeof(tag_selections) = 'object'),
  check (pg_column_size(intake) < 20000 and pg_column_size(answers) < 20000 and pg_column_size(tag_selections) < 40000),
  check ((status = 'draft' and expires_at is not null) or status = 'in_consultation')
);
create index submissions_expires_idx on public.submissions (expires_at) where status = 'draft';

-- ---------------------------------------------------------------------------
-- Kode akses (Digital Handshake). Berakhir saat konsultan menerima kode.
-- ---------------------------------------------------------------------------
create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  status public.access_code_status not null default 'active',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references public.staff_profiles (id),
  accepted_at timestamptz
);
-- Satu kode aktif per respons.
create unique index access_codes_one_active on public.access_codes (submission_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Pasien yang sudah berkonsultasi (permanen)
-- ---------------------------------------------------------------------------
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 1 and 120),
  age smallint check (age between 0 and 120),
  created_by uuid not null references public.staff_profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Laporan konsultasi (permanen, append-only per pasien)
-- ---------------------------------------------------------------------------
create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id),
  consultant_id uuid not null references public.staff_profiles (id),
  status public.consultation_status not null default 'draft',
  is_current boolean not null default false,
  supersedes_id uuid references public.consultations (id),
  source_submission_id uuid references public.submissions (id) on delete set null,
  -- Salinan data pasien saat konsultasi dimulai (submission asli boleh dihapus).
  snapshot_intake jsonb not null,
  snapshot_answers jsonb not null,
  snapshot_tag_selections jsonb not null,
  questionnaire_version text not null,
  algorithm_version text not null,
  -- Hasil hitung sistem (HHS, skor pilar, ajuan A-D) pada saat itu.
  system_result jsonb,
  -- Penilaian ruqyah oleh konsultan: wajib sebelum laporan final.
  ruqyah_final_condition public.ruqyah_condition,
  ruqyah_assessment_notes text,
  clinical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint final_requires_ruqyah check (
    status = 'draft'
    or (ruqyah_final_condition is not null and char_length(btrim(coalesce(ruqyah_assessment_notes, ''))) > 0 and finalized_at is not null)
  ),
  constraint current_requires_final check (not is_current or status = 'final')
);
-- Paling banyak satu laporan terkini per pasien.
create unique index consultations_one_current on public.consultations (patient_id) where is_current;
create index consultations_patient_idx on public.consultations (patient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Jejak audit (HHS hal. 10: sebelum/sesudah, pelaku, waktu, alasan). Hanya untuk data konsultasi.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid not null,
  reason text,
  before jsonb,
  after jsonb
);

create or replace function public.audit_consultations()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, reason, before, after)
  values (
    auth.uid(), tg_op, 'consultations', coalesce(new.id, old.id),
    nullif(current_setting('app.audit_reason', true), ''),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger consultations_audit
  after insert or update or delete on public.consultations
  for each row execute function public.audit_consultations();

-- Audit tidak boleh diubah/dihapus lewat jalur biasa.
create or replace function public.audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log bersifat append-only';
end $$;
create trigger audit_log_no_change
  before update or delete on public.audit_log
  for each row execute function public.audit_immutable();

-- ---------------------------------------------------------------------------
-- RLS: tabel dikunci. Pasien tamu hanya lewat fungsi RPC di bawah.
-- ---------------------------------------------------------------------------
alter table public.staff_profiles enable row level security;
alter table public.submissions enable row level security;
alter table public.access_codes enable row level security;
alter table public.patients enable row level security;
alter table public.consultations enable row level security;
alter table public.audit_log enable row level security;

revoke all on all tables in schema public from anon, authenticated;

grant select on public.staff_profiles to authenticated;
grant select, insert on public.patients to authenticated;
grant select, insert, update on public.consultations to authenticated;
grant select on public.audit_log to authenticated;

create policy staff_read_own on public.staff_profiles for select to authenticated using (id = auth.uid());
create policy staff_read_patients on public.patients for select to authenticated using (public.is_staff());
create policy staff_insert_patients on public.patients for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid());
create policy staff_read_consultations on public.consultations for select to authenticated using (public.is_staff());
create policy staff_insert_consultations on public.consultations for insert to authenticated
  with check (public.is_staff() and consultant_id = auth.uid() and status = 'draft' and not is_current);
-- Laporan final tidak boleh diubah langsung; koreksi dibuat sebagai laporan baru (supersedes_id).
create policy staff_update_draft_consultations on public.consultations for update to authenticated
  using (public.is_staff() and status = 'draft' and consultant_id = auth.uid())
  with check (public.is_staff() and status = 'draft' and consultant_id = auth.uid() and not is_current);
create policy admin_read_audit on public.audit_log for select to authenticated
  using (exists (select 1 from public.staff_profiles where id = auth.uid() and role = 'admin'));

-- ---------------------------------------------------------------------------
-- RPC pasien tamu (anon). Semua memeriksa token; tidak ada akses tabel langsung.
-- ---------------------------------------------------------------------------
create or replace function public.token_hash(p_token text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

create or replace function public.create_submission(
  p_edit_token text, p_intake jsonb, p_answers jsonb, p_tag_selections jsonb,
  p_questionnaire_version text, p_algorithm_version text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if p_edit_token is null or char_length(p_edit_token) < 32 then
    raise exception 'edit token terlalu pendek (minimal 32 karakter)';
  end if;
  insert into public.submissions (edit_token_hash, intake, answers, tag_selections, questionnaire_version, algorithm_version)
  values (public.token_hash(p_edit_token), coalesce(p_intake, '{}'), coalesce(p_answers, '{}'),
          coalesce(p_tag_selections, '{}'), p_questionnaire_version, p_algorithm_version)
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.get_submission(p_id uuid, p_edit_token text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', s.id, 'status', s.status, 'intake', s.intake, 'answers', s.answers,
    'tagSelections', s.tag_selections, 'questionnaireVersion', s.questionnaire_version,
    'algorithmVersion', s.algorithm_version, 'createdAt', s.created_at,
    'updatedAt', s.updated_at, 'expiresAt', s.expires_at)
  from public.submissions s
  where s.id = p_id and s.edit_token_hash = public.token_hash(p_edit_token)
    and (s.expires_at is null or s.expires_at > now());
$$;

create or replace function public.update_submission(
  p_id uuid, p_edit_token text, p_intake jsonb, p_answers jsonb, p_tag_selections jsonb
) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.submissions
     set intake = coalesce(p_intake, intake),
         answers = coalesce(p_answers, answers),
         tag_selections = coalesce(p_tag_selections, tag_selections),
         updated_at = now()
   where id = p_id and edit_token_hash = public.token_hash(p_edit_token)
     and status = 'draft' and expires_at > now();
  if not found then
    raise exception 'respons tidak ditemukan, sudah kedaluwarsa, atau sudah terkunci';
  end if;
end $$;

create or replace function public.delete_submission(p_id uuid, p_edit_token text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.submissions
   where id = p_id and edit_token_hash = public.token_hash(p_edit_token) and status = 'draft';
  if not found then
    raise exception 'respons tidak ditemukan atau sudah terkunci';
  end if;
end $$;

-- Membuat kode akses 8 karakter (tanpa huruf/angka yang mudah tertukar). Kode lama dicabut.
create or replace function public.issue_access_code(p_id uuid, p_edit_token text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  sub public.submissions;
  new_code text;
  bytes bytea;
  attempt int := 0;
begin
  select * into sub from public.submissions
   where id = p_id and edit_token_hash = public.token_hash(p_edit_token)
     and status = 'draft' and expires_at > now();
  if not found then
    raise exception 'respons tidak ditemukan, sudah kedaluwarsa, atau sudah terkunci';
  end if;

  update public.access_codes set status = 'revoked' where submission_id = p_id and status = 'active';

  loop
    attempt := attempt + 1;
    bytes := extensions.gen_random_bytes(8);
    new_code := '';
    for i in 0..7 loop
      new_code := new_code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
    end loop;
    begin
      insert into public.access_codes (submission_id, code, expires_at) values (p_id, new_code, sub.expires_at);
      return new_code;
    exception when unique_violation then
      if attempt >= 5 then raise; end if;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RPC konsultan (authenticated)
-- ---------------------------------------------------------------------------
-- Konsultan menerima kode: kode berakhir, respons terkunci, pasien + laporan draf dibuat.
create or replace function public.accept_access_code(p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  ac public.access_codes;
  sub public.submissions;
  pid uuid;
  cid uuid;
begin
  if not public.is_staff() then raise exception 'hanya staf'; end if;

  select * into ac from public.access_codes
   where code = upper(btrim(p_code)) and status = 'active' and expires_at > now() for update;
  if not found then raise exception 'kode tidak valid atau sudah berakhir'; end if;

  select * into sub from public.submissions where id = ac.submission_id and status = 'draft' for update;
  if not found then raise exception 'respons tidak tersedia'; end if;

  update public.access_codes set status = 'accepted', accepted_by = auth.uid(), accepted_at = now() where id = ac.id;
  update public.submissions set status = 'in_consultation', expires_at = null, updated_at = now() where id = sub.id;

  insert into public.patients (display_name, age, created_by)
  values (
    coalesce(nullif(btrim(sub.intake ->> 'name'), ''), 'Tanpa nama'),
    case when (sub.intake ->> 'age') ~ '^\d{1,3}$' then (sub.intake ->> 'age')::smallint end,
    auth.uid()
  ) returning id into pid;

  insert into public.consultations (patient_id, consultant_id, source_submission_id, snapshot_intake, snapshot_answers,
                                    snapshot_tag_selections, questionnaire_version, algorithm_version)
  values (pid, auth.uid(), sub.id, sub.intake, sub.answers, sub.tag_selections, sub.questionnaire_version, sub.algorithm_version)
  returning id into cid;

  return cid;
end $$;

-- Finalisasi: wajib penilaian ruqyah (dijaga juga oleh constraint). Laporan lama pasien menjadi tidak terkini.
create or replace function public.finalize_consultation(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare c public.consultations; prev_id uuid;
begin
  if not public.is_staff() then raise exception 'hanya staf'; end if;
  select * into c from public.consultations where id = p_id and consultant_id = auth.uid() and status = 'draft' for update;
  if not found then raise exception 'laporan tidak ditemukan atau sudah final'; end if;
  if c.ruqyah_final_condition is null or char_length(btrim(coalesce(c.ruqyah_assessment_notes, ''))) = 0 then
    raise exception 'penilaian ruqyah wajib diisi sebelum laporan difinalkan';
  end if;

  perform set_config('app.audit_reason', coalesce(p_reason, 'finalisasi laporan'), true);
  select id into prev_id from public.consultations where patient_id = c.patient_id and is_current and id <> c.id;
  update public.consultations set is_current = false where id = prev_id;
  update public.consultations
     set status = 'final', is_current = true, finalized_at = now(), updated_at = now(), supersedes_id = prev_id
   where id = c.id;

  -- Data sementara tidak lagi diperlukan; salinan ada di laporan.
  delete from public.submissions where id = c.source_submission_id and status = 'in_consultation';
end $$;

-- ---------------------------------------------------------------------------
-- Penghapusan otomatis respons yang tidak jadi berkonsultasi (blueprint hal. 7).
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_submissions()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.access_codes set status = 'expired' where status = 'active' and expires_at <= now();
  delete from public.submissions where status = 'draft' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Jadwalkan harian setelah mengaktifkan ekstensi pg_cron (Database > Extensions):
--   select cron.schedule('purge-expired-submissions', '15 3 * * *', 'select public.purge_expired_submissions()');

-- ---------------------------------------------------------------------------
-- Hak eksekusi (cabut default PUBLIC/anon lebih dulu, lalu beri hak yang dibutuhkan saja)
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.create_submission(text, jsonb, jsonb, jsonb, text, text) to anon, authenticated;
grant execute on function public.get_submission(uuid, text) to anon, authenticated;
grant execute on function public.update_submission(uuid, text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.delete_submission(uuid, text) to anon, authenticated;
grant execute on function public.issue_access_code(uuid, text) to anon, authenticated;
grant execute on function public.accept_access_code(text) to authenticated;
grant execute on function public.finalize_consultation(uuid, text) to authenticated;
grant execute on function public.is_staff() to authenticated;
-- purge_expired_submissions: sengaja tanpa grant (hanya pg_cron/service role).
