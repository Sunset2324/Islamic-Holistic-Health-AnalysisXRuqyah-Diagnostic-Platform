import type { Answers, TagSelections } from '@/lib/Hhs';
import type { PatientIntake } from '@/types/intake';

/**
 * Klien API staf (konsultan & admin). Sesi memakai cookie HttpOnly yang dipasang server; JavaScript tidak
 * pernah melihat tokennya. Kontrak mengikuti server/src/routes/staff.ts.
 */

export type Role = 'consultant' | 'admin';
export interface StaffAccount {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
}
export interface ConsultationSummary {
  id: string;
  /** null = data tidak bisa didekripsi di server (mis. kunci enkripsi lama tidak tersedia). */
  patientName: string | null;
  status: 'draft' | 'final';
  consultant: { id: string; email: string; displayName: string | null };
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
}
export type RuqyahCondition = 'A' | 'B' | 'C' | 'D';
export interface Report {
  ruqyahFinalCondition: RuqyahCondition | null;
  ruqyahNotes: string;
  advice: string;
  clinicalNotes: string;
  shareRuqyah: boolean;
  shareClinicalNotes: boolean;
}
export interface ConsultationDetail extends Omit<ConsultationSummary, 'patientName'> {
  patientName: string;
  readOnly: boolean;
  intake: PatientIntake;
  answers: Answers;
  tagSelections: TagSelections;
  questionnaireVersion: string;
  algorithmVersion: string;
  report: Report;
}
export interface AccountRow extends StaffAccount {
  createdAt: string;
  disabledAt: string | null;
  hasPassword: boolean;
}
export interface AuditEntry {
  id: number;
  at: string;
  action: string;
  entity: string;
  entityId: string;
  detail: unknown;
  actor: { email: string; role: string } | null;
}

export class StaffApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'StaffApiError';
  }
}

/**
 * Bagian rahasia alamat halaman staf (/staf-<gate>). Server hanya menjawab API staf bila header ini benar;
 * tanpa itu /api/auth|staff|admin dijawab 404.
 */
let staffGate = '';
export function staffGateFromPath(pathname: string): string {
  return /^\/staf-([0-9a-f]{16})\/?$/.exec(pathname)?.[1] ?? '';
}
export function setStaffGate(gate: string): void {
  staffGate = gate;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'x-staff-gate': staffGate, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new StaffApiError(0, 'network');
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new StaffApiError(res.status, json.error ?? 'server');
  return json as T;
}

export const staffApi = {
  me: () => call<{ account: StaffAccount }>('GET', '/auth/me'),
  login: (email: string, password: string) => call<{ account: StaffAccount }>('POST', '/auth/login', { email, password }),
  logout: () => call<void>('POST', '/auth/logout', {}),
  setPassword: (token: string, password: string) => call<{ account: StaffAccount }>('POST', '/auth/set-password', { token, password }),

  acceptCode: (code: string) => call<{ consultationId: string }>('POST', '/staff/access-code', { code }),
  consultations: () => call<{ consultations: ConsultationSummary[] }>('GET', '/staff/consultations'),
  consultation: (id: string) => call<ConsultationDetail>('GET', `/staff/consultations/${id}`),
  saveReport: (id: string, report: Report) => call<void>('PUT', `/staff/consultations/${id}`, report),
  finalize: (id: string) => call<void>('POST', `/staff/consultations/${id}/finalize`, {}),

  accounts: () => call<{ accounts: AccountRow[] }>('GET', '/admin/accounts'),
  createConsultant: (email: string, displayName: string) => call<{ id: string; invitePath: string }>('POST', '/admin/accounts', { email, displayName }),
  reinvite: (id: string) => call<{ invitePath: string }>('POST', `/admin/accounts/${id}/invite`, {}),
  setDisabled: (id: string, disabled: boolean) => call<void>('POST', `/admin/accounts/${id}/${disabled ? 'disable' : 'enable'}`, {}),
  audit: () => call<{ entries: AuditEntry[] }>('GET', '/admin/audit'),
};

/** Pesan bahasa Indonesia untuk kode kesalahan server. */
export function staffErrorMessage(err: unknown): string {
  const code = err instanceof StaffApiError ? err.code : 'server';
  const status = err instanceof StaffApiError ? err.status : 0;
  const map: Record<string, string> = {
    network: 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.',
    invalid_credentials: 'Email atau kata sandi salah.',
    locked: 'Terlalu banyak percobaan gagal. Tunggu 15 menit lalu coba lagi.',
    invalid_invite: 'Tautan undangan tidak berlaku (sudah dipakai, kedaluwarsa, atau akun dinonaktifkan). Minta tautan baru ke admin.',
    invalid_code: 'Kode tidak valid, sudah dipakai, atau sudah berakhir.',
    incomplete: 'Lengkapi penilaian ruqyah, catatannya, dan saran sebelum memfinalkan.',
    email_taken: 'Email ini sudah terdaftar.',
    cannot_change_self: 'Anda tidak bisa menonaktifkan akun sendiri.',
    unauthenticated: 'Sesi berakhir. Silakan masuk lagi.',
    forbidden: 'Anda tidak punya akses untuk tindakan ini.',
    not_found: 'Data tidak ditemukan atau sudah final.',
    invalid_request: 'Isian tidak valid. Periksa kembali.',
  };
  if (status === 429 && code !== 'locked') return 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.';
  return map[code] ?? 'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.';
}
