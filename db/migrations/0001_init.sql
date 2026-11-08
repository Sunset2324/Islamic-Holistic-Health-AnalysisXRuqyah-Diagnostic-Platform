-- MyHerbalis / Holistik Islami - skema PostgreSQL biasa (tanpa Supabase). DRAF untuk review.
-- Akses dijaga API backend (Node.js). DB menjadi lapis kedua: peran berhak-minimal, RLS, constraint, audit.
-- Tidak ada kunci/rahasia di file ini. Jalankan sebagai pemilik skema (peran non-superuser `app_owner` di produksi).
--
-- Konvensi penting
--  * Kolom *_enc = ciphertext (bytea) yang dienkripsi OLEH APLIKASI (mis. AES-256-GCM) dengan kunci di secret manager.
--    DB tidak pernah memegang kunci dan tidak bisa membaca isinya. `key_version` mencatat versi kunci baris tersebut.
--  * Token/kode (edit token, kode akses, kode tautan) TIDAK dikirim ke DB dalam bentuk asli: backend mengirim
--    HMAC-SHA256 hex (64 karakter) dengan "pepper" rahasia yang tidak ada di DB. Panjang minimal token (32 karakter)
--    dipaksa di backend sebelum di-hash.
--  * Backend mengatur identitas per transaksi:  select set_config('app.account_id', '<uuid>', true);
--    Fungsi dan kebijakan RLS memakai nilai itu. Backend WAJIB menyetelnya dari sesi terautentikasi, bukan dari input klien.
--  * Fungsi SECURITY DEFINER berjalan sebagai pemilik (melewati RLS) dan melakukan pemeriksaan sendiri.
--  * Kredensial/sesi (password hash, session, 2FA) dikelola library autentikasi (Better Auth) pada tabel miliknya
--    sendiri; sengaja TIDAK ada kolom password di skema ini. `accounts` hanya identitas dan peran.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Peran DB
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_api') then create role app_api nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'app_maintenance') then create role app_maintenance nologin; end if;
end $$;
-- Produksi: buat peran LOGIN terpisah (kata sandi dari secret manager) lalu `grant app_api to <login_role>`.

-- ---------------------------------------------------------------------------
-- Tipe
-- ---------------------------------------------------------------------------
create type account_role as enum ('patient', 'consultant', 'admin');
create type submission_status as enum ('draft', 'in_consultation');
create type access_code_status as enum ('active', 'accepted', 'expired', 'revoked');
create type consultation_status as enum ('draft', 'final');
create type ruqyah_condition as enum ('A', 'B', 'C', 'D');

-- ---------------------------------------------------------------------------
-- Akun (pasien terdaftar, konsultan, admin)
-- ---------------------------------------------------------------------------
create table accounts (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  role account_role not null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Respons pra-konsultasi (sementara, privat; pasien tamu tanpa akun)
-- ---------------------------------------------------------------------------
create table submissions (
  id uuid primary key default gen_random_uuid(),
  edit_token_hash text not null check (edit_token_hash ~ '^[0-9a-f]{64}$'),
  status submission_status not null default 'draft',
  intake_enc bytea not null check (octet_length(intake_enc) between 1 and 65536),
  answers_enc bytea not null check (octet_length(answers_enc) between 1 and 65536),
  tag_selections_enc bytea not null check (octet_length(tag_selections_enc) between 1 and 131072),
  key_version smallint not null check (key_version > 0),
  questionnaire_version text not null,
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 7 hari dari dibuat; TIDAK diperpanjang oleh pengeditan. Null setelah masuk konsultasi.
  expires_at timestamptz default (now() + interval '7 days'),
  check ((status = 'draft' and expires_at is not null) or status = 'in_consultation')
);
create index submissions_expires_idx on submissions (expires_at) where status = 'draft';

-- Kode akses (Digital Handshake), 8 karakter, sekali pakai. Hanya HASH yang disimpan.
create table access_codes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  status access_code_status not null default 'active',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by uuid references accounts (id),
  accepted_at timestamptz
);
create unique index access_codes_one_active on access_codes (submission_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Pasien (rekam sisi konsultan). account_id NULL = pasien tanpa akun: tidak ada riwayat untuk pasien.
-- ---------------------------------------------------------------------------
create table patients (
  id uuid primary key default gen_random_uuid(),
  display_name_enc bytea not null check (octet_length(display_name_enc) between 1 and 4096),
  key_version smallint not null check (key_version > 0),
  account_id uuid references accounts (id),
  created_by uuid not null references accounts (id),
  created_at timestamptz not null default now()
);
create index patients_account_idx on patients (account_id) where account_id is not null;
create index patients_created_by_idx on patients (created_by);

-- ---------------------------------------------------------------------------
-- Laporan konsultasi (permanen, append-only per pasien)
-- ---------------------------------------------------------------------------
create table consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id),
  consultant_id uuid not null references accounts (id),
  status consultation_status not null default 'draft',
  is_current boolean not null default false,
  supersedes_id uuid references consultations (id),
  source_submission_id uuid references submissions (id) on delete set null,
  key_version smallint not null check (key_version > 0),
  questionnaire_version text not null,
  algorithm_version text not null,
  -- Salinan data pasien saat konsultasi dimulai
  snapshot_intake_enc bytea not null,
  snapshot_answers_enc bytea not null,
  snapshot_tags_enc bytea not null,
  -- Hasil hitung sistem (HHS, pilar, ajuan A-D). TIDAK PERNAH diteruskan ke pasien.
  system_result_enc bytea,
  -- Isian konsultan (wajib saat final)
  ruqyah_final_condition ruqyah_condition,
  ruqyah_assessment_notes_enc bytea,
  consultant_advice_enc bytea,
  clinical_notes_enc bytea,
  -- Opsional: apa yang ikut terlihat pasien. Saran konsultan selalu terlihat bila laporan dirilis.
  share_ruqyah_with_patient boolean not null default false,
  share_clinical_notes_with_patient boolean not null default false,
  released_to_patient_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint final_requires_fields check (
    status = 'draft'
    or (ruqyah_final_condition is not null
        and ruqyah_assessment_notes_enc is not null and octet_length(ruqyah_assessment_notes_enc) > 0
        and consultant_advice_enc is not null and octet_length(consultant_advice_enc) > 0
        and finalized_at is not null)
  ),
  constraint current_requires_final check (not is_current or status = 'final'),
  constraint release_requires_final check (released_to_patient_at is null or status = 'final')
);
create unique index consultations_one_current on consultations (patient_id) where is_current;
create index consultations_patient_idx on consultations (patient_id, created_at desc);
create index consultations_consultant_idx on consultations (consultant_id);

-- Metadata foto lidah (opsional). Isi file ada di object storage terenkripsi, BUKAN di DB.
-- Hanya hasil sanitizeImage (WebP bersih) yang boleh disimpan.
create table images (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references submissions (id) on delete cascade,
  consultation_id uuid references consultations (id),
  mime text not null default 'image/webp' check (mime = 'image/webp'),
  bytes integer not null check (bytes between 1 and 16777216),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  check (num_nonnulls(submission_id, consultation_id) = 1)
);
create index images_submission_idx on images (submission_id);
create index images_consultation_idx on images (consultation_id);

-- ---------------------------------------------------------------------------
-- Kode tautan akun: dibuat KONSULTAN, dimasukkan pasien yang sedang login.
-- ---------------------------------------------------------------------------
create table account_link_codes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients (id),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references accounts (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references accounts (id),
  revoked_at timestamptz,
  constraint link_code_ttl check (expires_at <= created_at + interval '24 hours')
);
-- Laporan yang dipilih konsultan untuk muncul di riwayat pasien saat kode dipakai.
create table account_link_code_reports (
  link_code_id uuid not null references account_link_codes (id) on delete cascade,
  consultation_id uuid not null references consultations (id),
  primary key (link_code_id, consultation_id)
);

-- Pembatas tebak kode per akun (dicatat per akun karena kode salah tidak menunjuk baris mana pun).
create table code_attempts (
  account_id uuid not null references accounts (id),
  kind text not null check (kind in ('access', 'link')),
  attempts integer not null default 0,
  locked_until timestamptz,
  primary key (account_id, kind)
);

-- ---------------------------------------------------------------------------
-- Jejak audit (append-only). Kolom *_enc sengaja tidak disalin ke audit.
-- ---------------------------------------------------------------------------
create table audit_log (
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

-- ---------------------------------------------------------------------------
-- Fungsi bantu identitas
-- ---------------------------------------------------------------------------
create function app_account_id() returns uuid language sql stable as $$
  select nullif(current_setting('app.account_id', true), '')::uuid
$$;

create function app_role() returns text language sql stable security definer set search_path = public, pg_temp as $$
  select role::text from accounts where id = app_account_id() and disabled_at is null
$$;

-- Hanya untuk kenyamanan dev/tes. Di produksi backend memakai HMAC dengan pepper rahasia.
create function sha256_hex(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex')
$$;

-- ---------------------------------------------------------------------------
-- Trigger: updated_at, audit
-- ---------------------------------------------------------------------------
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger consultations_touch before update on consultations for each row execute function touch_updated_at();

create function audit_row() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o jsonb; n jsonb;
begin
  if tg_op <> 'INSERT' then
    select coalesce(jsonb_object_agg(k, v), '{}') into o from jsonb_each(to_jsonb(old)) e(k, v) where k not like '%\_enc';
  end if;
  if tg_op <> 'DELETE' then
    select coalesce(jsonb_object_agg(k, v), '{}') into n from jsonb_each(to_jsonb(new)) e(k, v) where k not like '%\_enc';
  end if;
  insert into audit_log (actor_id, action, entity, entity_id, reason, before, after)
  values (app_account_id(), tg_op, tg_table_name, coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'))::uuid,
          nullif(current_setting('app.audit_reason', true), ''), o, n);
  return coalesce(new, old);
end $$;
create trigger consultations_audit after insert or update or delete on consultations for each row execute function audit_row();
create trigger patients_audit after insert or update or delete on patients for each row execute function audit_row();

create function audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log bersifat append-only'; end $$;
create trigger audit_log_no_change before update or delete on audit_log for each row execute function audit_immutable();
create trigger audit_log_no_truncate before truncate on audit_log for each statement execute function audit_immutable();

-- ---------------------------------------------------------------------------
-- RLS (lapis kedua; lapis pertama = API backend)
-- ---------------------------------------------------------------------------
alter table accounts enable row level security;
alter table submissions enable row level security;
alter table access_codes enable row level security;
alter table patients enable row level security;
alter table consultations enable row level security;
alter table images enable row level security;
alter table account_link_codes enable row level security;
alter table account_link_code_reports enable row level security;
alter table code_attempts enable row level security;
alter table audit_log enable row level security;
-- Sengaja TIDAK FORCE: fungsi SECURITY DEFINER (pemilik) perlu melewati RLS. app_api bukan pemilik.

create policy accounts_self on accounts for select to app_api using (id = app_account_id());
create policy patients_own on patients for select to app_api
  using (app_role() = 'consultant' and created_by = app_account_id());
create policy consultations_own_select on consultations for select to app_api
  using (app_role() = 'consultant' and consultant_id = app_account_id());
create policy consultations_own_update on consultations for update to app_api
  using (app_role() = 'consultant' and consultant_id = app_account_id() and status = 'draft')
  with check (app_role() = 'consultant' and consultant_id = app_account_id() and status = 'draft'
              and not is_current and released_to_patient_at is null);
create policy images_own on images for select to app_api
  using (app_role() = 'consultant'
         and consultation_id in (select id from consultations where consultant_id = app_account_id()));
create policy audit_admin on audit_log for select to app_api using (app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Tampilan untuk pasien: hanya laporan final yang dirilis ke akun pasien itu.
-- Saran konsultan selalu ada; penilaian ruqyah/catatan klinis hanya bila flag true (selain itu NULL).
-- system_result dan snapshot jawaban tidak ada di tampilan ini.
-- ---------------------------------------------------------------------------
create view patient_visible_reports with (security_barrier = true) as
select c.id as consultation_id,
       c.patient_id,
       c.finalized_at,
       c.questionnaire_version,
       c.key_version,
       c.consultant_advice_enc,
       case when c.share_ruqyah_with_patient then c.ruqyah_final_condition end as ruqyah_final_condition,
       case when c.share_ruqyah_with_patient then c.ruqyah_assessment_notes_enc end as ruqyah_assessment_notes_enc,
       case when c.share_clinical_notes_with_patient then c.clinical_notes_enc end as clinical_notes_enc
from consultations c
join patients p on p.id = c.patient_id
where c.status = 'final'
  and c.released_to_patient_at is not null
  and p.account_id = app_account_id()
  and app_account_id() is not null;

-- ---------------------------------------------------------------------------
-- Fungsi: pasien tamu (diakses backend atas nama pasien; token = bukti)
-- ---------------------------------------------------------------------------
create function create_submission(
  p_token_hash text, p_intake_enc bytea, p_answers_enc bytea, p_tags_enc bytea, p_key_version smallint,
  p_questionnaire_version text, p_algorithm_version text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare new_id uuid;
begin
  insert into submissions (edit_token_hash, intake_enc, answers_enc, tag_selections_enc, key_version,
                           questionnaire_version, algorithm_version)
  values (p_token_hash, p_intake_enc, p_answers_enc, p_tags_enc, p_key_version, p_questionnaire_version, p_algorithm_version)
  returning id into new_id;
  return new_id;
end $$;

create function get_submission(p_id uuid, p_token_hash text)
returns table (id uuid, status submission_status, intake_enc bytea, answers_enc bytea, tag_selections_enc bytea,
               key_version smallint, questionnaire_version text, algorithm_version text,
               created_at timestamptz, updated_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.status, s.intake_enc, s.answers_enc, s.tag_selections_enc, s.key_version, s.questionnaire_version,
         s.algorithm_version, s.created_at, s.updated_at, s.expires_at
  from submissions s
  where s.id = p_id and s.edit_token_hash = p_token_hash and (s.expires_at is null or s.expires_at > now())
$$;

create function update_submission(
  p_id uuid, p_token_hash text, p_intake_enc bytea, p_answers_enc bytea, p_tags_enc bytea, p_key_version smallint
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update submissions
     set intake_enc = p_intake_enc, answers_enc = p_answers_enc, tag_selections_enc = p_tags_enc,
         key_version = p_key_version, updated_at = now()
   where id = p_id and edit_token_hash = p_token_hash and status = 'draft' and expires_at > now();
  if not found then raise exception 'respons tidak ditemukan, kedaluwarsa, atau terkunci'; end if;
end $$;

create function delete_submission(p_id uuid, p_token_hash text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from submissions where id = p_id and edit_token_hash = p_token_hash and status = 'draft';
  if not found then raise exception 'respons tidak ditemukan atau terkunci'; end if;
end $$;

-- Backend membuat kode acak 8 karakter, mengirim hash-nya. Kode lama dicabut.
create function issue_access_code(p_id uuid, p_token_hash text, p_code_hash text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare sub submissions;
begin
  select * into sub from submissions
   where id = p_id and edit_token_hash = p_token_hash and status = 'draft' and expires_at > now();
  if not found then raise exception 'respons tidak ditemukan, kedaluwarsa, atau terkunci'; end if;
  update access_codes set status = 'revoked' where submission_id = p_id and status = 'active';
  insert into access_codes (submission_id, code_hash, expires_at) values (p_id, p_code_hash, sub.expires_at);
end $$;

create function attach_submission_image(p_id uuid, p_token_hash text, p_bytes integer, p_sha256 text, p_storage_key uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare new_id uuid;
begin
  perform 1 from submissions where id = p_id and edit_token_hash = p_token_hash and status = 'draft' and expires_at > now();
  if not found then raise exception 'respons tidak ditemukan, kedaluwarsa, atau terkunci'; end if;
  if (select count(*) from images where submission_id = p_id) >= 3 then raise exception 'batas 3 foto per respons'; end if;
  insert into images (submission_id, bytes, sha256, storage_key) values (p_id, p_bytes, p_sha256, p_storage_key)
  returning id into new_id;
  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- Fungsi: konsultan
-- ---------------------------------------------------------------------------
-- Pencatat kegagalan tebak kode. Mengembalikan true bila akun sedang terkunci.
create function code_attempt_locked(p_kind text) returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce((select locked_until > now() from code_attempts where account_id = app_account_id() and kind = p_kind), false)
$$;

create function code_attempt_fail(p_kind text) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  insert into code_attempts (account_id, kind, attempts) values (app_account_id(), p_kind, 1)
  on conflict (account_id, kind) do update set attempts = code_attempts.attempts + 1;
  update code_attempts
     set locked_until = now() + interval '15 minutes', attempts = 0
   where account_id = app_account_id() and kind = p_kind and attempts >= 5;
end $$;

create function code_attempt_reset(p_kind text) returns void language sql security definer
set search_path = public, pg_temp as $$
  delete from code_attempts where account_id = app_account_id() and kind = p_kind
$$;

-- Konsultan menerima kode. Kegagalan dikembalikan sebagai status (bukan exception) agar hitungan percobaan tersimpan.
create function accept_access_code(p_code_hash text)
returns table (status text, submission_id uuid, intake_enc bytea, answers_enc bytea, tag_selections_enc bytea,
               key_version smallint, questionnaire_version text, algorithm_version text)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare ac access_codes; sub submissions;
begin
  if app_role() is distinct from 'consultant' then raise exception 'hanya konsultan'; end if;
  if code_attempt_locked('access') then
    return query select 'locked'::text, null::uuid, null::bytea, null::bytea, null::bytea, null::smallint, null::text, null::text;
    return;
  end if;

  select * into ac from access_codes where code_hash = p_code_hash and status = 'active' and expires_at > now() for update;
  if found then
    select * into sub from submissions where id = ac.submission_id and status = 'draft' for update;
  end if;
  if ac.id is null or sub.id is null then
    perform code_attempt_fail('access');
    return query select 'invalid'::text, null::uuid, null::bytea, null::bytea, null::bytea, null::smallint, null::text, null::text;
    return;
  end if;

  perform code_attempt_reset('access');
  update access_codes set status = 'accepted', accepted_by = app_account_id(), accepted_at = now() where id = ac.id;
  update submissions set status = 'in_consultation', expires_at = null, updated_at = now() where id = sub.id;
  return query select 'ok'::text, sub.id, sub.intake_enc, sub.answers_enc, sub.tag_selections_enc, sub.key_version,
                      sub.questionnaire_version, sub.algorithm_version;
end $$;

-- Langkah 2: backend sudah mendekripsi nama pasien dan mengirim ulang terenkripsi (atau memakai pasien yang ada).
create function open_consultation(p_submission_id uuid, p_patient_id uuid, p_patient_name_enc bytea, p_patient_key_version smallint)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare sub submissions; pid uuid; cid uuid;
begin
  if app_role() is distinct from 'consultant' then raise exception 'hanya konsultan'; end if;
  select * into sub from submissions where id = p_submission_id and status = 'in_consultation' for update;
  if not found then raise exception 'respons tidak tersedia'; end if;
  perform 1 from access_codes where submission_id = sub.id and status = 'accepted' and accepted_by = app_account_id();
  if not found then raise exception 'kode belum diterima oleh konsultan ini'; end if;
  perform 1 from consultations where source_submission_id = sub.id;
  if found then raise exception 'konsultasi untuk respons ini sudah dibuka'; end if;

  if p_patient_id is null then
    if p_patient_name_enc is null then raise exception 'nama pasien terenkripsi wajib untuk pasien baru'; end if;
    insert into patients (display_name_enc, key_version, created_by)
    values (p_patient_name_enc, p_patient_key_version, app_account_id()) returning id into pid;
  else
    perform 1 from patients where id = p_patient_id and created_by = app_account_id();
    if not found then raise exception 'pasien tidak ditemukan'; end if;
    pid := p_patient_id;
  end if;

  insert into consultations (patient_id, consultant_id, source_submission_id, key_version, questionnaire_version,
                             algorithm_version, snapshot_intake_enc, snapshot_answers_enc, snapshot_tags_enc)
  values (pid, app_account_id(), sub.id, sub.key_version, sub.questionnaire_version, sub.algorithm_version,
          sub.intake_enc, sub.answers_enc, sub.tag_selections_enc)
  returning id into cid;

  update images set consultation_id = cid, submission_id = null where submission_id = sub.id;
  return cid;
end $$;

-- Finalisasi. Laporan lama pasien menjadi tidak terkini. Dirilis otomatis ke riwayat bila pasien sudah punya akun.
create function finalize_consultation(p_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c consultations; p patients; prev_id uuid;
begin
  if app_role() is distinct from 'consultant' then raise exception 'hanya konsultan'; end if;
  select * into c from consultations where id = p_id and consultant_id = app_account_id() and status = 'draft' for update;
  if not found then raise exception 'laporan tidak ditemukan atau sudah final'; end if;
  if c.ruqyah_final_condition is null or c.ruqyah_assessment_notes_enc is null or octet_length(c.ruqyah_assessment_notes_enc) = 0 then
    raise exception 'penilaian ruqyah wajib diisi sebelum final';
  end if;
  if c.consultant_advice_enc is null or octet_length(c.consultant_advice_enc) = 0 then
    raise exception 'saran konsultan wajib diisi sebelum final';
  end if;
  select * into p from patients where id = c.patient_id;

  perform set_config('app.audit_reason', coalesce(p_reason, 'finalisasi laporan'), true);
  select id into prev_id from consultations where patient_id = c.patient_id and is_current and id <> c.id;
  update consultations set is_current = false where id = prev_id;
  update consultations
     set status = 'final', is_current = true, finalized_at = now(), supersedes_id = prev_id,
         released_to_patient_at = case when p.account_id is not null then now() end
   where id = c.id;
  delete from submissions where id = c.source_submission_id and status = 'in_consultation';
end $$;

-- Konsultan membuat kode tautan untuk pasiennya dan memilih laporan final yang akan masuk riwayat pasien.
create function create_link_code(p_patient_id uuid, p_code_hash text, p_consultation_ids uuid[],
                                 p_ttl interval default interval '15 minutes')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare cid uuid; lid uuid; n int;
begin
  if app_role() is distinct from 'consultant' then raise exception 'hanya konsultan'; end if;
  perform 1 from patients where id = p_patient_id and created_by = app_account_id();
  if not found then raise exception 'pasien tidak ditemukan'; end if;
  if p_ttl <= interval '0' or p_ttl > interval '24 hours' then raise exception 'umur kode harus antara 0 dan 24 jam'; end if;
  select count(*) into n from consultations
   where id = any (p_consultation_ids) and patient_id = p_patient_id and consultant_id = app_account_id() and status = 'final';
  if n <> coalesce(array_length(p_consultation_ids, 1), 0) or n = 0 then
    raise exception 'laporan harus final, milik pasien ini, dan minimal satu';
  end if;

  update account_link_codes set revoked_at = now()
   where patient_id = p_patient_id and redeemed_at is null and revoked_at is null;
  insert into account_link_codes (patient_id, code_hash, created_by, expires_at)
  values (p_patient_id, p_code_hash, app_account_id(), now() + p_ttl) returning id into lid;
  foreach cid in array p_consultation_ids loop
    insert into account_link_code_reports (link_code_id, consultation_id) values (lid, cid);
  end loop;
  return lid;
end $$;

-- Pasien yang login memasukkan kode dari konsultan.
create function redeem_link_code(p_code_hash text)
returns table (status text, patient_id uuid, released_count integer)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare lc account_link_codes; p patients; n integer;
begin
  if app_role() is distinct from 'patient' then raise exception 'hanya akun pasien'; end if;
  if code_attempt_locked('link') then
    return query select 'locked'::text, null::uuid, null::integer; return;
  end if;

  select * into lc from account_link_codes
   where code_hash = p_code_hash and redeemed_at is null and revoked_at is null and expires_at > now() for update;
  if found then
    select * into p from patients where id = lc.patient_id for update;
    if p.account_id is not null and p.account_id <> app_account_id() then lc.id := null; end if;
  end if;
  if lc.id is null then
    perform code_attempt_fail('link');
    return query select 'invalid'::text, null::uuid, null::integer; return;
  end if;

  perform code_attempt_reset('link');
  perform set_config('app.audit_reason', 'tautan akun lewat kode konsultan', true);
  update patients set account_id = app_account_id() where id = p.id;
  update consultations set released_to_patient_at = now()
   where id in (select consultation_id from account_link_code_reports where link_code_id = lc.id)
     and status = 'final' and released_to_patient_at is null;
  get diagnostics n = row_count;
  update account_link_codes set redeemed_at = now(), redeemed_by = app_account_id() where id = lc.id;
  return query select 'ok'::text, p.id, n;
end $$;

-- ---------------------------------------------------------------------------
-- Pemeliharaan: hapus respons yang tidak jadi berkonsultasi. Mengembalikan storage_key foto agar objeknya ikut dihapus.
-- ---------------------------------------------------------------------------
create function purge_expired_submissions() returns table (storage_key uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  update access_codes set status = 'expired' where status = 'active' and expires_at <= now();
  return query
    select i.storage_key from images i
     where i.submission_id in (select s.id from submissions s where s.status = 'draft' and s.expires_at <= now());
  delete from submissions where status = 'draft' and expires_at <= now();
end $$;

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public;
revoke all on all functions in schema public from public;
grant usage on schema public to app_api, app_maintenance;

grant select (id, email, role) on accounts to app_api;
grant select on patients, consultations, images, audit_log, patient_visible_reports to app_api;
-- Kolom yang boleh diubah konsultan pada laporan DRAF. status/is_current/finalized_at/released_* hanya lewat fungsi.
grant update (system_result_enc, ruqyah_final_condition, ruqyah_assessment_notes_enc, consultant_advice_enc,
              clinical_notes_enc, share_ruqyah_with_patient, share_clinical_notes_with_patient, key_version)
  on consultations to app_api;

grant execute on function app_account_id(), app_role() to app_api;
grant execute on function create_submission(text, bytea, bytea, bytea, smallint, text, text) to app_api;
grant execute on function get_submission(uuid, text) to app_api;
grant execute on function update_submission(uuid, text, bytea, bytea, bytea, smallint) to app_api;
grant execute on function delete_submission(uuid, text) to app_api;
grant execute on function issue_access_code(uuid, text, text) to app_api;
grant execute on function attach_submission_image(uuid, text, integer, text, uuid) to app_api;
grant execute on function accept_access_code(text) to app_api;
grant execute on function open_consultation(uuid, uuid, bytea, smallint) to app_api;
grant execute on function finalize_consultation(uuid, text) to app_api;
grant execute on function create_link_code(uuid, text, uuid[], interval) to app_api;
grant execute on function redeem_link_code(text) to app_api;
grant execute on function purge_expired_submissions() to app_maintenance;
-- sha256_hex, code_attempt_* dan fungsi audit sengaja tanpa grant ke app_api (dipanggil dari dalam fungsi definer).

-- Penjadwalan harian (pg_cron atau cron sistem yang menjalankan sebagai app_maintenance):
--   select * from purge_expired_submissions();   -- hapus objek foto sesuai storage_key yang dikembalikan
