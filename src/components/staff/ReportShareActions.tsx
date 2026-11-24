import { useState } from 'react';
import { Check, Copy, Download, MessageCircle } from 'lucide-react';
import { reportToWhatsApp, type PatientReportData } from '@/lib/patientReport';
import { downloadReportPdf, hasArabic } from '@/lib/reportPdf';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Cadangan untuk browser yang menolak Clipboard API.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'fixed -left-[9999px] top-0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/** Kirim laporan ke pasien: unduh PDF, salin teks WhatsApp, atau buka WhatsApp untuk memilih kontak pasien. */
export default function ReportShareActions({ data }: { data: PatientReportData }) {
  const [state, setState] = useState<'idle' | 'pdf' | 'copied' | 'error'>('idle');
  const waText = reportToWhatsApp(data);
  const arabic = data.sections.some((section) => hasArabic(`${section.lead ?? ''} ${section.body}`));

  async function onPdf() {
    setState('pdf');
    try {
      await downloadReportPdf(data);
      setState('idle');
    } catch {
      setState('error');
    }
  }

  async function onCopy() {
    setState((await copyText(waText)) ? 'copied' : 'error');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onPdf} disabled={state === 'pdf'} className="btn-glass">
          <Download className="h-4 w-4" /> {state === 'pdf' ? 'Menyiapkan…' : 'Download PDF'}
        </button>
        <button type="button" onClick={onCopy} className="btn-glass">
          {state === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {state === 'copied' ? 'Tersalin' : 'Salin untuk WA'}
        </button>
        <a href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener noreferrer" className="btn-glass">
          <MessageCircle className="h-4 w-4" /> Kirim ke WhatsApp
        </a>
      </div>
      {state === 'error' && <p className="text-xs text-rose-700">Gagal. Coba lagi, atau salin teksnya secara manual dari pratinjau.</p>}
      {arabic && (
        <p className="text-xs text-stone-600">
          Ada teks Arab di laporan. PDF hanya mendukung huruf Latin, jadi teks Arab ditandai &quot;[teks Arab]&quot;. Versi
          WhatsApp tetap utuh.
        </p>
      )}
    </div>
  );
}
