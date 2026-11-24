import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus, Loader2, ShieldCheck, X } from 'lucide-react';
import { deleteImage, fetchImage, IMAGE_ERROR_MESSAGES, ImageApiError, listImages, uploadImage, type ImageErrorKind } from '@/lib/api';

interface TonguePhotosProps {
  submissionId: string;
  editToken: string;
}

interface Photo {
  id: string;
  url: string | null;
}

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Foto lidah (opsional) untuk konsultan. Pemeriksaan di browser hanya untuk kenyamanan; server memeriksa isi
 * setiap file, menolak yang bukan gambar, dan menggambar ulang foto sehingga tidak ada kode tersembunyi yang ikut.
 */
export default function TonguePhotos({ submissionId, editToken }: TonguePhotosProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [max, setMax] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ImageErrorKind | null>(null);
  const urls = useRef<string[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const show = useCallback(
    async (id: string): Promise<Photo> => {
      try {
        const url = URL.createObjectURL(await fetchImage(submissionId, editToken, id));
        urls.current.push(url);
        return { id, url };
      } catch {
        return { id, url: null };
      }
    },
    [submissionId, editToken],
  );

  useEffect(() => {
    let alive = true;
    listImages(submissionId, editToken)
      .then(async (res) => {
        setMax(res.max);
        const loaded = await Promise.all(res.images.map((img) => show(img.id)));
        if (alive) setPhotos(loaded);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [submissionId, editToken, show]);

  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, Math.max(0, max - photos.length));
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError(null);
    for (const file of files) {
      // Penyaringan awal yang ramah; keputusan akhir tetap di server berdasarkan isi file.
      if (!ACCEPT.split(',').includes(file.type) && !file.type.startsWith('image/')) {
        setError('image_rejected');
        continue;
      }
      try {
        const uploaded = await uploadImage(submissionId, editToken, file);
        const photo = await show(uploaded.id);
        setPhotos((current) => [...current, photo]);
      } catch (err) {
        setError(err instanceof ImageApiError ? err.kind : 'server');
        if (err instanceof ImageApiError && err.kind === 'image_limit') break;
      }
    }
    setBusy(false);
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await deleteImage(submissionId, editToken, id);
      setPhotos((current) => current.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof ImageApiError ? err.kind : 'server');
    }
  }

  const full = photos.length >= max;

  return (
    <div className="space-y-3 border-t border-lavender-100 pt-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
          <Camera className="h-4 w-4 text-mint-700" /> Foto lidah (opsional)
        </h3>
        <p className="mt-1 text-sm leading-[1.5] text-stone-600">
          Bila berkenan, tambahkan sampai {max} foto lidah di bawah cahaya terang, tanpa filter. Foto membantu konsultan
          memahami kondisi Anda dan hanya bisa dibuka oleh konsultan yang Anda beri kode.
        </p>
      </div>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:max-w-md">
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative overflow-hidden rounded-2xl bg-lavender-50 ring-1 ring-lavender-200">
              {photo.url ? (
                <img src={photo.url} alt={`Foto lidah ${index + 1}`} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-stone-500">Foto {index + 1}</div>
              )}
              <button
                type="button"
                onClick={() => handleRemove(photo.id)}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-stone-700 shadow hover:text-peach-800"
                aria-label={`Hapus foto ${index + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <label className={`btn-soft cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {busy ? 'Memeriksa & mengunggah…' : 'Tambah foto'}
          <input ref={input} type="file" accept={ACCEPT} multiple className="sr-only" onChange={handleFiles} disabled={busy} />
        </label>
      )}

      {error && (
        <p role="alert" className="rounded-2xl bg-peach-50 p-3 text-sm leading-[1.5] text-peach-900 ring-1 ring-peach-200">
          {IMAGE_ERROR_MESSAGES[error]}
        </p>
      )}

      <p className="flex items-start gap-1.5 text-xs leading-[1.5] text-stone-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint-700" />
        Hanya foto asli (JPG, PNG, WebP) yang diterima. Setiap foto diperiksa dan dibuat ulang oleh server: lokasi/EXIF dan
        isi selain gambar dibuang, lalu disimpan terenkripsi dan ikut terhapus bersama data Anda.
      </p>
    </div>
  );
}
