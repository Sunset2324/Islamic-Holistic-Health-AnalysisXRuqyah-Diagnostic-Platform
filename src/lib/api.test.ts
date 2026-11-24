import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  ERROR_MESSAGES,
  LIMITS,
  buildPayload,
  createSubmission,
  deleteSubmission,
  getSubmission,
  issueAccessCode,
  updateSubmission,
} from '@/lib/api';
import { ALGORITHM_VERSION, QUESTIONNAIRE_VERSION } from '@/config';
import { INDICATORS } from '@/data/indicators';
import type { PatientIntake } from '@/types/intake';

const TOKEN = 'T'.repeat(43);
const ID = '11111111-2222-4333-8444-555555555555';

const patient: PatientIntake = {
  name: 'Budi',
  age: 30,
  mainComplaint: 'Sulit tidur',
  complaintDuration: '3 bulan',
  complaintFrequency: '',
  complaintImpact: '',
  medicalHistory: '',
};

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const call = (fn: ReturnType<typeof mockFetch>) => {
  const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
};

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('pemetaan status ke jenis kesalahan', () => {
  const cases: Array<[number, string]> = [
    [404, 'not_found'], [429, 'rate_limited'], [400, 'invalid'], [413, 'invalid'], [415, 'invalid'],
    [500, 'server'], [502, 'server'], [503, 'server'],
  ];
  for (const [status, kind] of cases) {
    it(`${status} -> ${kind}`, async () => {
      mockFetch(json(status));
      await expect(getSubmission(ID, TOKEN)).rejects.toMatchObject({ name: 'ApiError', kind });
    });
  }
  it('gagal jaringan -> network', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    await expect(getSubmission(ID, TOKEN)).rejects.toMatchObject({ kind: 'network' });
  });
  it('status 200 tetapi isi bukan JSON (mis. halaman galat proxy) -> server', async () => {
    mockFetch(new Response('<html>502</html>', { status: 200 }));
    await expect(getSubmission(ID, TOKEN)).rejects.toMatchObject({ kind: 'server' });
  });
  it('pesan 404 tidak membedakan token salah dari tidak ada/kedaluwarsa/terkunci', () => {
    expect(ERROR_MESSAGES.not_found.toLowerCase()).not.toContain('token');
    expect(ERROR_MESSAGES.not_found).toContain('tidak ditemukan');
    expect(ERROR_MESSAGES.not_found).toContain('berakhir');
    expect(ERROR_MESSAGES.not_found).toContain('konsultan');
  });
  it('semua pesan berbahasa Indonesia dan tidak kosong', () => {
    for (const message of Object.values(ERROR_MESSAGES)) expect(message.length).toBeGreaterThan(20);
  });
});

describe('token hanya di header, tidak di URL', () => {
  it('GET', async () => {
    const fn = mockFetch(json(200, { id: ID }));
    await getSubmission(ID, TOKEN);
    const { url, init, headers } = call(fn);
    expect(url).toBe(`/api/submissions/${ID}`);
    expect(url).not.toContain(TOKEN);
    expect(headers['x-edit-token']).toBe(TOKEN);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
    expect(init.referrerPolicy).toBe('no-referrer');
  });
  it('PUT mengirim muatan di body dan token di header', async () => {
    const fn = mockFetch(new Response(null, { status: 204 }));
    const payload = buildPayload(patient, { 'PL-01': 2 }, {});
    await updateSubmission(ID, TOKEN, payload);
    const { url, init, headers } = call(fn);
    expect(url).not.toContain(TOKEN);
    expect(headers['x-edit-token']).toBe(TOKEN);
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(init.body as string).not.toContain(TOKEN);
  });
  it('DELETE dan access-code', async () => {
    const del = mockFetch(new Response(null, { status: 204 }));
    await deleteSubmission(ID, TOKEN);
    expect(call(del).url).not.toContain(TOKEN);
    expect(call(del).init.method).toBe('DELETE');
    const code = mockFetch(json(201, { code: 'ABCD2345', expiresAt: null }));
    expect(await issueAccessCode(ID, TOKEN)).toEqual({ code: 'ABCD2345', expiresAt: null });
    expect(call(code).url).toBe(`/api/submissions/${ID}/access-code`);
    expect(call(code).headers['x-edit-token']).toBe(TOKEN);
  });
  it('POST pembuatan tidak mengirim token dan mengembalikan token baru dari server', async () => {
    const fn = mockFetch(json(201, { id: ID, editToken: TOKEN, expiresAt: '2030-01-01T00:00:00Z' }));
    const created = await createSubmission(buildPayload(patient, {}, {}));
    expect(created.editToken).toBe(TOKEN);
    expect(call(fn).headers['x-edit-token']).toBeUndefined();
    expect(call(fn).url).toBe('/api/submissions');
  });
  it('id di URL di-encode agar tidak bisa menyisipkan path', async () => {
    const fn = mockFetch(json(200, {}));
    await getSubmission('../x?y=1', TOKEN);
    expect(call(fn).url).toBe('/api/submissions/..%2Fx%3Fy%3D1');
  });
});

describe('buildPayload sesuai skema server', () => {
  it('nama kosong tetap string kosong dan versi diambil dari config', () => {
    const payload = buildPayload({ ...patient, name: undefined as unknown as string }, {}, {});
    expect(payload.intake.name).toBe('');
    expect(payload.questionnaireVersion).toBe(QUESTIONNAIRE_VERSION);
    expect(payload.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(Object.keys(payload.intake).sort()).toEqual(
      ['age', 'complaintDuration', 'complaintFrequency', 'complaintImpact', 'mainComplaint', 'medicalHistory', 'name'],
    );
  });
  it('jawaban: null dipertahankan, undefined tidak dikirim, nilai di luar 1-5 dibuang', () => {
    const payload = buildPayload(patient, { 'PL-01': 3, 'PL-02': null, 'PL-03': undefined, 'PM-01': 6, 'PM-02': 0, 'PM-03': 2.5 }, {});
    expect(payload.answers).toEqual({ 'PL-01': 3, 'PL-02': null });
    expect('PL-03' in payload.answers).toBe(false);
  });
  it('kunci jawaban hanya 12 indikator yang dikenal server', () => {
    const all = Object.fromEntries(INDICATORS.map((i) => [i.id, 4]));
    expect(Object.keys(buildPayload(patient, all, {}).answers).sort()).toEqual(
      ['FX-01', 'FX-02', 'FX-03', 'PL-01', 'PL-02', 'PL-03', 'PM-01', 'PM-02', 'PM-03', 'PP-01', 'PP-02', 'PP-03'],
    );
    expect(INDICATORS).toHaveLength(12);
  });
  it('batas panjang dipaksa', () => {
    const long = (n: number) => 'x'.repeat(n + 50);
    const payload = buildPayload(
      { ...patient, name: long(LIMITS.name), mainComplaint: long(LIMITS.mainComplaint), complaintDuration: long(LIMITS.detail), medicalHistory: long(LIMITS.medicalHistory) },
      {},
      { 'PP-01': { tagIds: ['A'], otherNote: long(LIMITS.otherNote) } },
    );
    expect(payload.intake.name).toHaveLength(LIMITS.name);
    expect(payload.intake.mainComplaint).toHaveLength(LIMITS.mainComplaint);
    expect(payload.intake.complaintDuration).toHaveLength(LIMITS.detail);
    expect(payload.intake.medicalHistory).toHaveLength(LIMITS.medicalHistory);
    expect(payload.tagSelections['PP-01']?.otherNote).toHaveLength(LIMITS.otherNote);
  });
  it('usia di luar 0-120 atau bukan angka ditolak sebelum dikirim', () => {
    for (const age of [-1, 121, NaN]) expect(() => buildPayload({ ...patient, age }, {}, {})).toThrow(ApiError);
  });
  it('semua id Micro-Tag cocok dengan pola yang diterima server', () => {
    for (const indicator of INDICATORS) for (const tag of indicator.microTags) expect(tag.id).toMatch(/^[A-Z][A-Z0-9_]{0,39}$/);
  });
  it('tidak ada kunci selain yang dikenal pada tagSelections', () => {
    const payload = buildPayload(patient, {}, { 'PP-01': { tagIds: ['HOPELESSNESS'], otherNote: '' } });
    expect(payload.tagSelections).toEqual({ 'PP-01': { tagIds: ['HOPELESSNESS'], otherNote: '' } });
  });
});
