import type { jsPDF as JsPdf } from 'jspdf';
import { reportFileName, type PatientReportData } from '@/lib/patientReport';

/**
 * PDF laporan pasien dibuat langsung di browser (bukan lewat dialog cetak), sehingga tidak ada header/footer
 * browser yang memuat alamat halaman staf. Target: 1 halaman A4; huruf mengecil otomatis bila isi panjang,
 * dan baru pindah halaman bila tetap tidak muat.
 */

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MINT = [34, 136, 106] as const;
const INK = [41, 37, 36] as const;
const MUTED = [120, 113, 108] as const;
const PT_TO_MM = 0.3528;
const LINE_FACTOR = 1.45;

/** Font bawaan PDF (Helvetica) hanya mendukung huruf Latin. Teks Arab diberi penanda; versi WA tetap utuh. */
const ARABIC_RUN = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]+(?:\s+[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]+)*/g;
export const hasArabic = (text: string) => new RegExp(ARABIC_RUN.source).test(text);

function toPdfText(text: string): string {
  return text
    .replace(ARABIC_RUN, '[teks Arab]')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25cf]/g, '-')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\n -~\u00a0-\u00ff]/g, '');
}

async function loadLogo(): Promise<string | null> {
  try {
    const blob = await (await fetch('/icon-192.png')).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Menulis isi laporan; mengembalikan jumlah halaman. Bila dryRun, tidak menggambar apa pun. */
function render(doc: JsPdf, data: PatientReportData, size: number, logo: string | null, allowBreak: boolean, dryRun: boolean): number | null {
  const line = (pt: number) => pt * PT_TO_MM * LINE_FACTOR;
  const footerSize = Math.max(7, size - 2.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(footerSize);
  const disclaimer = doc.splitTextToSize(toPdfText(data.disclaimer), CONTENT_W) as string[];
  const footerTop = PAGE_H - MARGIN - disclaimer.length * line(footerSize) - 3;
  let pages = 1;
  let y = MARGIN;

  // Kepala laporan
  if (!dryRun) {
    if (logo) doc.addImage(logo, 'PNG', MARGIN, y, 13, 13);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('My Herbalis', MARGIN + 16, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text('Laporan Konsultasi Kesehatan Holistik', MARGIN + 16, y + 11);
    doc.text(toPdfText(data.dateLabel), PAGE_W - MARGIN, y + 6, { align: 'right' });
    doc.text(toPdfText(`Konsultan: ${data.consultantName}`), PAGE_W - MARGIN, y + 11, { align: 'right' });
    doc.setDrawColor(...MINT);
    doc.setLineWidth(0.6);
    doc.line(MARGIN, y + 16, PAGE_W - MARGIN, y + 16);
  }
  y += 24;

  // Data pasien
  if (!dryRun) {
    doc.setFontSize(size);
    doc.setTextColor(...MUTED);
    doc.text('Pasien', MARGIN, y);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.text(toPdfText(`${data.patientName}, ${data.age} tahun`), MARGIN + 22, y);
  }
  y += line(size) + 4;

  const ensure = (needed: number): boolean => {
    if (y + needed <= footerTop) return true;
    if (!allowBreak) return false;
    if (!dryRun) {
      doc.addPage();
    }
    pages += 1;
    y = MARGIN;
    return true;
  };

  for (const section of data.sections) {
    const headSize = size - 1;
    if (!ensure(line(headSize) + line(size) + 2)) return null;
    if (!dryRun) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(headSize);
      doc.setTextColor(...MINT);
      doc.text(section.title.toUpperCase(), MARGIN, y);
    }
    y += line(headSize) + 1;

    const blocks: { text: string; bold: boolean }[] = [];
    if (section.lead) blocks.push({ text: section.lead, bold: true });
    blocks.push({ text: section.body || '(belum diisi)', bold: false });
    for (const block of blocks) {
      doc.setFont('helvetica', block.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(toPdfText(block.text), CONTENT_W) as string[];
      for (const text of lines) {
        if (!ensure(line(size))) return null;
        if (!dryRun) {
          doc.setFont('helvetica', block.bold ? 'bold' : 'normal');
          doc.setFontSize(size);
          doc.setTextColor(...INK);
          doc.text(text, MARGIN, y);
        }
        y += line(size);
      }
    }
    y += 5;
  }

  if (!dryRun) {
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(214, 211, 209);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, footerTop, PAGE_W - MARGIN, footerTop);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(footerSize);
      doc.setTextColor(...MUTED);
      doc.text(disclaimer, MARGIN, footerTop + 4.5);
      if (total > 1) doc.text(`Halaman ${page} dari ${total}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
    }
  }
  return pages;
}

export async function downloadReportPdf(data: PatientReportData): Promise<void> {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), loadLogo()]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `Laporan My Herbalis - ${toPdfText(data.patientName)}`, author: 'My Herbalis', creator: 'My Herbalis' });

  // Ukuran huruf terbesar yang masih muat 1 halaman; bila tidak ada, 9 pt dengan pindah halaman.
  const sizes = [11, 10.5, 10, 9.5, 9, 8.5];
  const fit = sizes.find((size) => render(doc, data, size, logo, false, true) !== null);
  render(doc, data, fit ?? 9, logo, fit === undefined, false);
  doc.save(reportFileName(data));
}
