import { randomBytes } from 'node:crypto';
import type { AppConfig } from '../src/config.js';
import { parseKeyRing } from '../src/crypto.js';
import type { SubmissionBody } from '../src/validation.js';

export function testConfig(databaseUrl = 'postgres://unused'): AppConfig {
  const keyRing = parseKeyRing({
    DATA_KEY_V1: randomBytes(32).toString('base64'),
    DATA_KEY_V2: randomBytes(32).toString('base64'),
    DATA_KEY_CURRENT: '2',
  });
  return { databaseUrl, pepper: randomBytes(32), keyRing, port: 0, trustProxy: false };
}

export function sampleBody(overrides: Partial<SubmissionBody> = {}): SubmissionBody {
  return {
    intake: {
      name: 'Rahasia Nama Pasien',
      age: 34,
      mainComplaint: 'Keluhan-pribadi-unik-12345',
      complaintDuration: '3 bulan',
      complaintFrequency: 'Setiap malam',
      complaintImpact: '',
      medicalHistory: '',
    },
    answers: { 'PL-01': 2, 'PL-02': 3, 'PL-03': null, 'PP-01': 1 },
    tagSelections: { 'PP-01': { tagIds: ['HOPELESSNESS'], otherNote: '' } },
    questionnaireVersion: 'HHS v1.0',
    algorithmVersion: '1.0.0',
    ...overrides,
  };
}
