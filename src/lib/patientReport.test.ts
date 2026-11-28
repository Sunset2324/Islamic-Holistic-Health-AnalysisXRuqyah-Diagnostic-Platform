import { describe, expect, it } from 'vitest';
import { buildPatientReport, reportFileName, reportToWhatsApp } from '@/lib/patientReport';
import type { Report } from '@/lib/staffApi';
import type { PatientIntake } from '@/types/intake';

const intake: PatientIntake = {
  name: 'Fulanah',
  gender: 'perempuan',
  age: 31,
  mainComplaint: 'Sulit tidur',
  complaintDuration: '',
  complaintFrequency: '',
  complaintImpact: '',
  medicalHistory: 'Maag',
};
const report = (patch: Partial<Report> = {}): Report => ({
  ruqyahConditions: ['B', 'C'],
  pillars: ['PP', 'FX'],
  ruqyahNotes: 'Observasi lanjutan.',
  advice: '1. Tidur sebelum 22.00\n2. Dzikir pagi petang',
  clinicalNotes: 'Catatan internal',
  psychologicalNotes: 'Cemas berulang',
  physicalNotes: 'Sering lelah',
  shareRuqyah: false,
  sharePillars: false,
  shareClinicalNotes: false,
  sharePsychological: false,
  sharePhysical: false,
  ...patch,
});
const date = new Date('2026-11-20T08:00:00+07:00');

describe('laporan untuk pasien', () => {
  it('hanya berisi saran konsultan bila tidak ada yang dicentang "sertakan"', () => {
    const data = buildPatientReport(intake, report(), 'Ustadzah Aminah', date);
    expect(data.sections.map((s) => s.title)).toEqual(['Saran dari konsultan']);
    const wa = reportToWhatsApp(data);
    for (const hidden of ['Catatan internal', 'Observasi lanjutan', 'Cemas berulang', 'Sering lelah', 'Potensi', 'Pola Pikir']) {
      expect(wa).not.toContain(hidden);
    }
    expect(wa).not.toContain('Maag');
    expect(wa).not.toMatch(/staf-|https?:/);
  });

  it('semua dicentang: penilaian potensi (ruqyah + pilar), psikis, fisik, klinis', () => {
    const all = { shareRuqyah: true, sharePillars: true, sharePsychological: true, sharePhysical: true, shareClinicalNotes: true };
    const data = buildPatientReport(intake, report(all), 'Ustadzah Aminah', date);
    expect(data.sections.map((s) => s.title)).toEqual(['Saran dari konsultan', 'Penilaian potensi', 'Kondisi psikis', 'Kondisi fisik', 'Catatan klinis']);
    expect(data.sections[1]).toEqual({
      title: 'Penilaian potensi',
      lead: 'Potensi ruqyah: Potensi Hasad, Potensi Sihr · Pilar: Pola Pikir, Faktor X',
      body: 'Observasi lanjutan.',
    });
  });

  it('centang dipisah: hanya pilar -> ruqyah tidak tampil; hanya psikis -> fisik tidak tampil', () => {
    const data = buildPatientReport(intake, report({ sharePillars: true, sharePsychological: true }), 'X', date);
    expect(data.sections[1]?.lead).toBe('Pilar: Pola Pikir, Faktor X');
    const wa = reportToWhatsApp(data);
    expect(wa).not.toContain('Potensi Hasad');
    expect(wa).toContain('Cemas berulang');
    expect(wa).not.toContain('Sering lelah');
  });

  it('dicentang tetapi kosong -> bagian tidak ditampilkan', () => {
    const data = buildPatientReport(intake, report({ shareRuqyah: true, ruqyahConditions: [], sharePhysical: true, physicalNotes: '  ' }), 'X', date);
    expect(data.sections.map((s) => s.title)).toEqual(['Saran dari konsultan']);
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
