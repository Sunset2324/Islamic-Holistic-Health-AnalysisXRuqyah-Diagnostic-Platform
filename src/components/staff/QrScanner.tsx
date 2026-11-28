import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { parseScannedCode } from '@/lib/consultCode';

interface QrScannerProps {
  onResult: (code: string) => void;
  onClose: () => void;
}

const SCAN_INTERVAL_MS = 250;
const MAX_SCAN_WIDTH = 640;

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser, atau ketik kodenya.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Kamera tidak ditemukan di perangkat ini. Ketik kodenya.';
  if (name === 'NotReadableError') return 'Kamera sedang dipakai aplikasi lain. Tutup aplikasi itu lalu coba lagi.';
  return 'Kamera tidak dapat dibuka. Ketik kodenya.';
}

/**
 * Pemindai QR kode konsultasi (blueprint bagian 11, usulan 6). Gambar kamera diproses di perangkat ini saja,
 * tidak direkam dan tidak dikirim ke mana pun. Kamera dimatikan begitu kode terbaca atau pemindai ditutup.
 */
export default function QrScanner({ onResult, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);
  const [hint, setHint] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const stop = () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('Pemindai butuh koneksi aman (HTTPS) dan browser yang mendukung kamera. Ketik kodenya.');
        setStarting(false);
        return;
      }
      try {
        const [{ default: jsQR }, media] = await Promise.all([
          import('jsqr'),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }),
        ]);
        stream = media;
        if (stopped) return stop();
        const video = videoRef.current;
        if (!video || !ctx) return stop();
        video.srcObject = media;
        await video.play();
        setStarting(false);

        const scan = () => {
          if (stopped) return;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (w > 0 && h > 0) {
            const scale = Math.min(1, MAX_SCAN_WIDTH / w);
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
            if (found) {
              const code = parseScannedCode(found.data);
              if (code) {
                stop();
                onResult(code);
                return;
              }
              setHint('QR terbaca, tetapi bukan kode konsultasi My Herbalis.');
            }
          }
          timer = window.setTimeout(scan, SCAN_INTERVAL_MS);
        };
        scan();
      } catch (err) {
        stop();
        setError(cameraErrorMessage(err));
        setStarting(false);
      }
    })();

    return stop;
  }, [onResult]);

  return (
    <div className="space-y-2 rounded-xl bg-stone-950/90 p-3 text-white" role="dialog" aria-label="Pindai kode QR pasien">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">Arahkan kamera ke QR di layar pasien</p>
        <button type="button" onClick={onClose} className="rounded-md p-1 hover:bg-white/10" aria-label="Tutup pemindai">
          <X className="h-4 w-4" />
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-xs leading-[1.5] text-rose-200">{error}</p>
      ) : (
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} muted playsInline className="aspect-square w-full object-cover" />
          {starting && (
            <span className="absolute inset-0 flex items-center justify-center gap-2 text-xs">
              <Loader2 className="h-4 w-4 animate-spin" /> Membuka kamera…
            </span>
          )}
        </div>
      )}
      {hint && !error && <p className="text-xs text-amber-200">{hint}</p>}
    </div>
  );
}
