import { EMERGENCY_NUMBER } from '@/config';
import { RUQYAH_CONDITIONS } from '@/data/conditions';
import { PILLARS } from '@/data/pillars';
import type { Report } from '@/lib/staffApi';
import type { PatientIntake } from '@/types/intake';

/**
 * Laporan untuk pasien = HANYA isi laporan konsultasi: saran konsultan, lalu bagian yang dicentang "sertakan":
 * penilaian potensi (ruqyah dan/atau pilar), kondisi psikis, kondisi fisik, catatan klinis.
 * Satu sumber untuk pratinjau, PDF, dan teks WhatsApp.
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

  // Penilaian potensi: hanya kelompok yang dicentang "sertakan"; catatan penilaian ikut bila ada yang tampil.
  const leads: string[] = [];
  if (report.shareRuqyah && report.ruqyahConditions.length > 0) {
    leads.push(`Potensi ruqyah: ${report.ruqyahConditions.map((c) => RUQYAH_CONDITIONS[c].name).join(', ')}`);
  }
  if (report.sharePillars && report.pillars.length > 0) {
    const labels = PILLARS.filter((p) => report.pillars.includes(p.code)).map((p) => p.label);
    leads.push(`Pilar: ${labels.join(', ')}`);
  }
  if (leads.length > 0) sections.push({ title: 'Penilaian potensi', lead: leads.join(' · '), body: report.ruqyahNotes.trim() });

  const optional: [boolean, string, string][] = [
    [report.sharePsychological, 'Kondisi psikis', report.psychologicalNotes],
    [report.sharePhysical, 'Kondisi fisik', report.physicalNotes],
    [report.shareClinicalNotes, 'Catatan klinis', report.clinicalNotes],
  ];
  for (const [share, title, text] of optional) {
    if (share && text.trim()) sections.push({ title, body: text.trim() });
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
