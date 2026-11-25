import { describe, expect, it } from 'vitest';
import { GENDERS as FRONTEND_GENDERS } from '../../src/types/intake.js';
import { GENDERS, intakeSchema, submissionBodySchema } from '../src/validation.js';
import { sampleBody } from './helpers.js';

const intake = sampleBody().intake;

describe('validasi intake: nama dan jenis kelamin wajib', () => {
  it('isian lengkap diterima; nama dirapikan', () => {
    const parsed = intakeSchema.parse({ ...intake, name: '  Fulanah  ' });
    expect(parsed.name).toBe('Fulanah');
    expect(parsed.gender).toBe('perempuan');
    expect(submissionBodySchema.safeParse(sampleBody()).success).toBe(true);
  });

  it.each(['', '   ', '\n\t'])('nama kosong/spasi ditolak: %j', (name) => {
    expect(intakeSchema.safeParse({ ...intake, name }).success).toBe(false);
  });

  it('nama lebih dari 60 karakter ditolak', () => {
    expect(intakeSchema.safeParse({ ...intake, name: 'x'.repeat(61) }).success).toBe(false);
  });

  it.each([undefined, '', 'L', 'Laki-laki', 'lainnya', 1, null])('jenis kelamin tidak sah ditolak: %j', (gender) => {
    expect(intakeSchema.safeParse({ ...intake, gender }).success).toBe(false);
  });

  it('kedua pilihan sah diterima', () => {
    for (const gender of GENDERS) expect(intakeSchema.safeParse({ ...intake, gender }).success).toBe(true);
  });

  it('daftar pilihan server sama dengan frontend', () => {
    expect([...GENDERS]).toEqual([...FRONTEND_GENDERS]);
  });
});
