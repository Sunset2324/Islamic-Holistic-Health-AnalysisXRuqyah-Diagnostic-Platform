import { describe, expect, it } from 'vitest';
import { buildPatientReport, reportFileName, reportToWhatsApp } from '@/lib/patientReport';
import type { Report } from '@/lib/staffApi';
import type { PatientIntake } from '@/types/intake';

const intake: PatientIntake = {
  name: 'Fulanah',
  age: 31,
  mainComplaint: 'Sulit tidur',
  complaintDuration: '',
  complaintFrequency: '',
  complaintImpact: '',
  medicalHistory: 'Maag',
};
const report = (patch: Partial<Report> = {}): Report => ({
  ruqyahFinalCondition: 'B',
  ruqyahNotes: 'Observasi lanjutan.',
  advice: '1. Tidur sebelum 22.00\n2. Dzikir pagi petang',
  clinicalNotes: 'Catatan internal',
  shareRuqyah: false,
  shareClinicalNotes: false,
  ...patch,
} as Report);
const date = new Date('2026-11-20T08:00:00+07:00');

describe('laporan untuk pasien', () => {
  it('hanya berisi saran konsultan bila ruqyah & catatan klinis tidak dicentang', () => {
    const data = buildPatientReport(intake, report(), 'Ustadzah Aminah', date);
    expect(data.sections.map((s) => s.title)).toEqual(['Saran dari konsultan']);
    const wa = reportToWhatsApp(data);
    expect(wa).not.toContain('Catatan internal');
    expect(wa).not.toContain('Observasi lanjutan');
    expect(wa).not.toContain('Maag');
    expect(wa).not.toMatch(/staf-|https?:/);
  });

  it('menyertakan penilaian ruqyah dan catatan klinis bila dicentang', () => {
    const data = buildPatientReport(intake, report({ shareRuqyah: true, shareClinicalNotes: true }), 'Ustadzah Aminah', date);
    expect(data.sections.map((s) => s.title)).toEqual(['Saran dari konsultan', 'Penilaian ruqyah', 'Catatan klinis']);
    expect(data.sections[1].lead).toBeTruthy();
  });

  it('format WhatsApp memakai *tebal* untuk judul', () => {
    const wa = reportToWhatsApp(buildPatientReport(intake, report(), 'Ustadzah Aminah', date));
    expect(wa.startsWith('*Laporan Konsultasi My Herbalis*\nPasien: Fulanah (31 tahun)')).toBe(true);
    expect(wa).toContain('\n\n*Saran dari konsultan*\n1. Tidur sebelum 22.00\n2. Dzikir pagi petang');
  });

  it('nama file PDF aman', () => {
    const data = buildPatientReport({ ...intake, name: 'a/b:c*?' }, report(), 'X', date);
    expect(reportFileName(data)).toBe('Laporan My Herbalis - abc.pdf');
    expect(reportFileName(buildPatientReport({ ...intake, name: '  ' }, report(), 'X', date))).toBe('Laporan My Herbalis - Pasien.pdf');
  });
});
