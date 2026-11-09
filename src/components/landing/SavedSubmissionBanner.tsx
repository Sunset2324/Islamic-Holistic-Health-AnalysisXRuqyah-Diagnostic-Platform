import { History, Info } from 'lucide-react';
import type { RestoreState } from '@/lib/useSubmission';

interface SavedSubmissionBannerProps {
  restore: RestoreState;
  onOpen: () => void;
}

export default function SavedSubmissionBanner({ restore, onOpen }: SavedSubmissionBannerProps) {
  if (restore.kind === 'none') return null;

  if (restore.kind === 'checking') {
    return <p className="text-xs text-stone-500" role="status">Memeriksa data tersimpan di perangkat ini…</p>;
  }
  if (restore.kind === 'ended') {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-stone-100 p-3 text-xs leading-[1.5] text-stone-700" role="status">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Data tersimpan sebelumnya sudah berakhir atau sedang dibahas konsultan, sehingga tidak dapat dibuka lagi di sini.
      </p>
    );
  }
  if (restore.kind === 'unreachable') {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-stone-100 p-3 text-xs leading-[1.5] text-stone-700" role="status">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Data tersimpan di perangkat ini belum bisa diperiksa karena server tidak terjangkau. Anda tetap bisa memulai analisis baru.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border border-teal-200 bg-teal-50 p-4" role="status">
      <p className="flex items-start gap-2 text-sm leading-[1.5] text-teal-950">
        <History className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {restore.locked
            ? 'Jawaban Anda sedang dibahas konsultan dan tidak bisa diubah lagi.'
            : `Anda punya jawaban tersimpan${restore.daysLeft !== null ? ` (sisa ${restore.daysLeft} hari untuk mengubahnya)` : ''}.`}
        </span>
      </p>
      <button type="button" onClick={onOpen} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800">
        Lihat hasil tersimpan
      </button>
    </div>
  );
}
