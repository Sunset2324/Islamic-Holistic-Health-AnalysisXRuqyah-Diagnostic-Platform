import { ALGORITHM_VERSION, QUESTIONNAIRE_VERSION } from '@/config';
import { INDICATORS, type IndicatorId } from '@/data/indicators';
import type { Answers, TagSelections } from '@/lib/Hhs';
import type { PatientIntake } from '@/types/intake';

/**
 * Klien API respons pasien tamu. Kontrak mengikuti server/src/validation.ts dan server/src/routes/submissions.ts.
 * Token edit hanya dikirim lewat header `x-edit-token`: tidak pernah di URL, tidak dicatat, tidak ada di analitik.
 */

export const API_BASE = '/api';

// Batas dari server (strictObject). Bila server berubah, ubah juga di sini.
export const LIMITS = {
  name: 60,
  age: { min: 0, max: 120 },
  mainComplaint: 1000,
  detail: 200,
  medicalHistory: 500,
  otherNote: 250,
  maxTagsPerIndicator: 12,
} as const;

export interface SubmissionPayload {
  intake: PatientIntake;
  answers: Partial<Record<IndicatorId, number | null>>;
  tagSelections: TagSelections;
  questionnaireVersion: string;
  algorithmVersion: string;
}

export interface StoredSubmission extends SubmissionPayload {
  id: string;
  status: 'draft' | 'in_consultation';
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export type ApiErrorKind = 'network' | 'not_found' | 'rate_limited' | 'invalid' | 'server';

/** Pesan tidak membedakan "token salah" dari "tidak ada/kedaluwarsa/terkunci" (server pun menjawab sama). */
export const ERROR_MESSAGES: Record<ApiErrorKind, string> = {
  network: 'Tidak dapat terhubung ke server. Kuesioner tetap bisa dipakai; coba simpan lagi nanti.',
  not_found: 'Data tersimpan tidak ditemukan, sudah berakhir, atau sedang dibahas konsultan, sehingga tidak bisa diubah.',
  rate_limited: 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.',
  invalid: 'Data tidak dapat disimpan karena ada isian yang tidak sesuai. Periksa kembali isian Anda.',
  server: 'Server sedang bermasalah. Coba lagi beberapa saat lagi.',
};

export class ApiError extends Error {
  constructor(public readonly kind: ApiErrorKind) {
    super(ERROR_MESSAGES[kind]);
    this.name = 'ApiError';
  }
}

function kindFromStatus(status: number): ApiErrorKind {
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 413 || status === 415 || status === 422) return 'invalid';
  return 'server';
}

async function request(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers['x-edit-token'] = options.token;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new ApiError('network');
  }
  if (!response.ok) throw new ApiError(kindFromStatus(response.status));
  return response;
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    // Mis. halaman galat HTML dari proxy yang berstatus 200.
    throw new ApiError('server');
  }
}

const clamp = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

/** Menyusun muatan sesuai skema server. Nama kosong dikirim '' (bukan undefined); jawaban `undefined` tidak dikirim. */
export function buildPayload(patient: PatientIntake, answers: Answers, tagSelections: TagSelections): SubmissionPayload {
  const age = Math.trunc(Number(patient.age));
  if (!Number.isFinite(age) || age < LIMITS.age.min || age > LIMITS.age.max) throw new ApiError('invalid');

  const cleanAnswers: SubmissionPayload['answers'] = {};
  const cleanTags: TagSelections = {};
  for (const { id } of INDICATORS) {
    const value = answers[id];
    if (value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5)) cleanAnswers[id] = value;
    const selection = tagSelections[id];
    if (selection) {
      cleanTags[id] = {
        tagIds: selection.tagIds.slice(0, LIMITS.maxTagsPerIndicator),
        otherNote: clamp(selection.otherNote ?? '', LIMITS.otherNote),
      };
    }
  }

  return {
    intake: {
      name: clamp(patient.name ?? '', LIMITS.name),
      age,
      mainComplaint: clamp(patient.mainComplaint ?? '', LIMITS.mainComplaint),
      complaintDuration: clamp(patient.complaintDuration ?? '', LIMITS.detail),
      complaintFrequency: clamp(patient.complaintFrequency ?? '', LIMITS.detail),
      complaintImpact: clamp(patient.complaintImpact ?? '', LIMITS.detail),
      medicalHistory: clamp(patient.medicalHistory ?? '', LIMITS.medicalHistory),
    },
    answers: cleanAnswers,
    tagSelections: cleanTags,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
  };
}

export interface CreatedSubmission {
  id: string;
  editToken: string;
  expiresAt: string | null;
}

export async function createSubmission(payload: SubmissionPayload): Promise<CreatedSubmission> {
  const response = await request('POST', '/submissions', { body: payload });
  return readJson<CreatedSubmission>(response);
}

export async function getSubmission(id: string, token: string): Promise<StoredSubmission> {
  const response = await request('GET', `/submissions/${encodeURIComponent(id)}`, { token });
  return readJson<StoredSubmission>(response);
}

export async function updateSubmission(id: string, token: string, payload: SubmissionPayload): Promise<void> {
  await request('PUT', `/submissions/${encodeURIComponent(id)}`, { token, body: payload });
}

export async function deleteSubmission(id: string, token: string): Promise<void> {
  await request('DELETE', `/submissions/${encodeURIComponent(id)}`, { token });
}

export interface IssuedCode {
  code: string;
  expiresAt: string | null;
}

export async function issueAccessCode(id: string, token: string): Promise<IssuedCode> {
  const response = await request('POST', `/submissions/${encodeURIComponent(id)}/access-code`, { token });
  return readJson<IssuedCode>(response);
}
