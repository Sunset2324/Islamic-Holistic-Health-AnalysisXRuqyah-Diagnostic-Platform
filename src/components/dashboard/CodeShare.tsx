import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { CLINIC_WHATSAPP, codeQrDataUrl, whatsAppLink } from '@/lib/consultCode';

interface CodeShareProps {
  code: string;
  /** Dipanggil saat pasien membuka WhatsApp (dianggap sudah mengirim kode). */
  onSent: () => void;
}

/** QR berisi kode saja (dipindai konsultan) + tombol kirim kode ke WhatsApp klinik bila nomornya diatur. */
export default function CodeShare({ code, onSent }: CodeShareProps) {
  const [qr, setQr] = useState<string | null>(null);
  const link = whatsAppLink(CLINIC_WHATSAPP, code);

  useEffect(() => {
    let alive = true;
    setQr(null);
    codeQrDataUrl(code)
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null)); // QR gagal dibuat: kode teks tetap tampil
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      {qr && (
        <img
          src={qr}
          alt={`Kode QR untuk kode konsultasi ${code}`}
          width={128}
          height={128}
          className="h-32 w-32 rounded-xl bg-white p-1 ring-1 ring-lavender-200"
          data-testid="access-code-qr"
        />
      )}
      <div className="w-full min-w-0 flex-1 space-y-2 text-center text-xs leading-[1.5] text-stone-600 sm:text-left">
        <p>Tunjukkan QR ini ke konsultan untuk dipindai, atau kirim kodenya lewat WhatsApp.</p>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onSent}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1f8f4e] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#18733e] sm:w-auto"
          >
            <MessageCircle className="h-4 w-4" /> Kirim kode ke WhatsApp konsultan
          </a>
        )}
        {link && <p className="text-stone-500">Yang terkirim hanya kode, tanpa nama atau keluhan Anda.</p>}
      </div>
    </div>
  );
}
