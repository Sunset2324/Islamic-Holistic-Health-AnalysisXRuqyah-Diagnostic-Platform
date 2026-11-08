import type { Answers, TagSelections } from '@/lib/Hhs';
import type { PatientIntake } from '@/types/intake';

/** Data CONTOH untuk prototipe. Bukan data pasien sungguhan. */
export interface SampleCase {
  /** Kode akses contoh (8 karakter, tanpa huruf/angka yang mudah tertukar). */
  code: string;
  hasAccount: boolean;
  intake: PatientIntake;
  answers: Answers;
  tags: TagSelections;
}

const noTags: TagSelections = {};

export const SAMPLE_CASES: SampleCase[] = [
  {
    code: 'KT7MZ4PQ',
    hasAccount: false,
    intake: {
      name: 'Contoh A',
      age: 34,
      mainComplaint: 'Sulit tidur dan sering merasa cemas sejak 3 bulan terakhir, terutama malam hari.',
      complaintDuration: '3 bulan',
      complaintFrequency: 'Hampir setiap malam',
      complaintImpact: 'Sulit fokus bekerja',
      medicalHistory: '',
    },
    answers: { 'PL-01': 2, 'PL-02': 3, 'PL-03': 2, 'PM-01': 4, 'PM-02': 4, 'PM-03': 4, 'PP-01': 1, 'PP-02': 3, 'PP-03': 2, 'FX-01': 3, 'FX-02': 4, 'FX-03': 4 },
    tags: {
      'PL-01': { tagIds: ['SLEEP_DIFFICULTY'], otherNote: '' },
      'PP-01': { tagIds: ['HOPELESSNESS'], otherNote: '' },
    },
  },
  {
    code: 'BX92HNWD',
    hasAccount: true,
    intake: {
      name: 'Contoh B',
      age: 27,
      mainComplaint: 'Sering lemas dan tidak teratur makan karena jadwal kerja bergilir.',
      complaintDuration: '6 bulan',
      complaintFrequency: 'Setiap hari kerja',
      complaintImpact: '',
      medicalHistory: 'Maag ringan.',
    },
    answers: { 'PL-01': 2, 'PL-02': 2, 'PL-03': 1, 'PM-01': 2, 'PM-02': 2, 'PM-03': 1, 'PP-01': 4, 'PP-02': 4, 'PP-03': 4, 'FX-01': 4, 'FX-02': 4, 'FX-03': 5 },
    tags: noTags,
  },
  {
    code: 'RD5GLC3V',
    hasAccount: false,
    intake: {
      name: 'Contoh C',
      age: 45,
      mainComplaint: '',
      complaintDuration: '',
      complaintFrequency: '',
      complaintImpact: '',
      medicalHistory: '',
    },
    answers: { 'PL-01': 4, 'PL-02': 4, 'PL-03': 4, 'PM-01': 4, 'PM-02': 4, 'PM-03': 4, 'PP-01': 4, 'PP-02': 4, 'PP-03': 4, 'FX-01': 4, 'FX-02': 1, 'FX-03': 1 },
    tags: { 'FX-02': { tagIds: ['UNSAFE_ENVIRONMENT'], otherNote: '' } },
  },
];
