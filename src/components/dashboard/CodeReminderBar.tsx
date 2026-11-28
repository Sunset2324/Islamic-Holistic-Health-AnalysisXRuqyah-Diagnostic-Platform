import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BellRing, CheckCircle2, KeyRound, Loader2, MessageCircle, X } from 'lucide-react';
import { CLINIC_WHATSAPP, whatsAppLink } from '@/lib/consultCode';

interface CodeReminderBarProps {
  /** Kode yang sedang tampil (null = belum dibuat atau halaman dimuat ulang). */
  code: string | null;
  busy: boolean;
  onCreateCode: () => void;
  /** Gulir ke kotak kode dan fokus ke tombol salin. */
  onShowCode: () => void;
  onSent: () => void;
  onSkip: () => void;
}

/**
 * Pita pengingat di bawah layar (blueprint bagian 11, usulan 7). Tetap tampil sampai pasien menyatakan sudah
 * mengirim/menunjukkan kode atau tidak perlu konsultasi. Tidak mengirim apa pun sendiri.
 */
export default function CodeReminderBar({ code, busy, onCreateCode, onShowCode, onSent, onSkip }: CodeReminderBarProps) {
  const link = code ? whatsAppLink(CLINIC_WHATSAPP, code) : null;
  const ref = useRef<HTMLDivElement>(null);

  // Beri ruang di dasar halaman setinggi pita agar isi paling bawah tidak tertutup; dikembalikan saat pita hilang.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = document.body.style.paddingBottom;
    const apply = () => {
      document.body.style.paddingBottom = `${el.offsetHeight}px`;
    };
    apply();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      document.body.style.paddingBottom = previous;
    };
  }, []);

  // Lewat portal ke <body>: pembungkus beranimasi (transform) di dashboard membuat position:fixed tidak menempel ke layar.
  return createPortal(
    <div
      ref={ref}
      role="region"
      aria-label="Pengingat kode konsultasi"
      className="fixed inset-x-0 bottom-0 z-40 border-t-4 border-amber-400 bg-stone-950 px-4 py-3 text-white shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.45)]"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex min-w-0 flex-1 basis-60 items-start gap-2 text-sm font-semibold leading-[1.4] text-white">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden />
          {code ? 'Langkah terakhir: kirim atau tunjukkan kode Anda ke konsultan.' : 'Ingin berkonsultasi? Langkah terakhir: buat kode konsultasi.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!code && (
            <button
              type="button"
              onClick={onCreateCode}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-bold text-stone-950 hover:bg-amber-300 disabled:opacity-70"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Buat kode
            </button>
          )}
          {code && (
            <button
              type="button"
              onClick={onShowCode}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-bold text-stone-950 hover:bg-amber-300"
            >
              <KeyRound className="h-4 w-4" /> Lihat &amp; salin kode
            </button>
          )}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onSent}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1f8f4e] px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/30 hover:bg-[#18733e]"
            >
              <MessageCircle className="h-4 w-4" /> Kirim via WhatsApp
            </a>
          )}
          {code && (
            <button type="button" onClick={onSent} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-white ring-1 ring-white/50 hover:bg-white/10">
              <CheckCircle2 className="h-4 w-4" /> Sudah, tutup
            </button>
          )}
          {!code && (
            <button type="button" onClick={onSkip} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-stone-200 hover:bg-white/10">
              <X className="h-4 w-4" /> Tidak perlu konsultasi
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
