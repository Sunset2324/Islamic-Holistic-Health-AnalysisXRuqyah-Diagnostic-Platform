import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { staffApi } from '@/lib/staffApi';
import { GlassCard } from './ui';

interface Props {
  consultationId: string;
  images: { id: string }[];
  onAuthError: (err: unknown) => void;
}

/**
 * Foto lidah dari pasien. Diambil sebagai blob lewat API (perlu sesi + header gerbang), ditampilkan dengan
 * object URL lokal yang dilepas saat halaman ditutup. Setiap pembukaan foto tercatat di log audit server.
 */
export default function PatientPhotos({ consultationId, images, onAuthError }: Props) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let alive = true;
    const created: string[] = [];
    for (const { id } of images) {
      staffApi
        .image(consultationId, id)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          created.push(url);
          if (alive) setUrls((u) => ({ ...u, [id]: url }));
          else URL.revokeObjectURL(url);
        })
        .catch((err) => {
          onAuthError(err);
          if (alive) setUrls((u) => ({ ...u, [id]: null }));
        });
    }
    return () => {
      alive = false;
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [consultationId, images, onAuthError]);

  if (!images.length) return null;
  return (
    <GlassCard title={`Foto lidah dari pasien (${images.length})`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map(({ id }, i) => {
          const url = urls[id];
          return (
            <figure key={id} className="overflow-hidden rounded-xl border border-white/80 bg-white/70">
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" title="Buka ukuran penuh">
                  <img src={url} alt={`Foto lidah ${i + 1}`} className="aspect-square w-full object-cover" />
                </a>
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-stone-500">
                  {url === null ? <ImageOff className="h-5 w-5" aria-label="Foto tidak bisa dibuka" /> : 'Memuat…'}
                </div>
              )}
            </figure>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-stone-500">Foto sudah dibersihkan server (tanpa lokasi/EXIF). Pembukaan foto tercatat di log audit.</p>
    </GlassCard>
  );
}
