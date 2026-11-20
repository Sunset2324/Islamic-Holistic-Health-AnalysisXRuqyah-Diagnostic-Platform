import { EMERGENCY_NUMBER } from '@/config';
import { RUQYAH_CONDITIONS, type RuqyahConditionId } from '@/data/conditions';
import type { Report } from '@/lib/staffApi';
import type { PatientIntake } from '@/types/intake';

/**
 * Laporan untuk pasien = HANYA isi laporan konsultasi: saran konsultan, penilaian ruqyah (bila dicentang),
 * catatan klinis (bila dicentang). Satu sumber untuk pratinjau, PDF, dan teks WhatsApp.
 * Tidak memuat alamat/tautan halaman staf, ajuan sistem, maupun hasil hitungan.
 */
export interface PatientReportSection {
  title: string;
  /** Baris pertama bercetak tebal (mis. nama kondisi ruqyah). */
  lead?: string;
  body: string;
}

export interface PatientReportData {
  patientName: string;
  age: number;
  consultantName: string;
  dateLabel: string;
  sections: PatientReportSection[];
  disclaimer: string;
}

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' });

export function buildPatientReport(intake: PatientIntake, report: Report, consultantName: string, date: Date): PatientReportData {
  const sections: PatientReportSection[] = [{ title: 'Saran dari konsultan', body: report.advice.trim() }];
  const condition = report.ruqyahFinalCondition as RuqyahConditionId | null;
  if (report.shareRuqyah && condition) {
    sections.push({ title: 'Penilaian ruqyah', lead: RUQYAH_CONDITIONS[condition].name, body: report.ruqyahNotes.trim() });
  }
  if (report.shareClinicalNotes && report.clinicalNotes.trim()) {
    sections.push({ title: 'Catatan klinis', body: report.clinicalNotes.trim() });
  }
  return {
    patientName: intake.name.trim() || 'Pasien',
    age: intake.age,
    consultantName,
    dateLabel: dateFormat.format(date),
    sections,
    disclaimer: `Laporan ini adalah panduan refleksi, bukan diagnosis medis, psikologis, maupun spiritual. Konsumsi herbal atau obat wajib didiskusikan dengan dokter. Dalam keadaan darurat hubungi ${EMERGENCY_NUMBER} atau datang ke fasilitas kesehatan terdekat.`,
  };
}

/** Teks siap tempel ke WhatsApp (*tebal*, _miring_). */
export function reportToWhatsApp(data: PatientReportData): string {
  const lines = [
    '*Laporan Konsultasi My Herbalis*',
    `Pasien: ${data.patientName} (${data.age} tahun)`,
    `Tanggal: ${data.dateLabel}`,
    `Konsultan: ${data.consultantName}`,
  ];
  for (const section of data.sections) {
    lines.push('', `*${section.title}*`);
    if (section.lead) lines.push(section.lead);
    if (section.body) lines.push(section.body);
  }
  lines.push('', `_${data.disclaimer}_`);
  return lines.join('\n');
}

/** Nama file aman: "Laporan My Herbalis - Nama.pdf". */
export function reportFileName(data: PatientReportData): string {
  const name = data.patientName.replace(/[\\/:*?"<>|]/g, '').replace(/\p{Cc}/gu, '').trim().slice(0, 60) || 'Pasien';
  return `Laporan My Herbalis - ${name}.pdf`;
}
