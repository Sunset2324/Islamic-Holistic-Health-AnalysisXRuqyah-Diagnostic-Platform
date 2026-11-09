import { useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { ERROR_MESSAGES } from '@/lib/api';
import { daysLeft } from '@/lib/savedSubmission';
import type { SubmissionApi } from '@/lib/useSubmission';

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' });

interface SubmissionPanelProps {
  submission: SubmissionApi;
  /** Menyimpan ulang hasil di layar sebagai data baru (setelah data lama tidak bisa diubah). */
  onSaveAsNew: () => void;
  onRetry: () => void;
  /** Dipanggil setelah data berhasil dihapus di server. */
  onDeleted: () => void;
}

export default function SubmissionPanel({ submission, onSaveAsNew, onRetry, onDeleted }: SubmissionPanelProps) {
  const { status, saved, code, codeError, codeBusy, requestCode, remove } = submission;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* penyalinan bisa diblokir browser; kodenya tetap tampil besar untuk dicatat */
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const ok = await remove();
    setDeleting(false);
    setConfirming(false);
    if (ok) onDeleted();
  }

  if (status.kind === 'deleted') {
    return (
      <section className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-700" role="status">
        Data Anda sudah dihapus dari server. Hasil di layar ini hanya ada di perangkat Anda dan hilang saat halaman ditutup.
      </section>
    );
  }

  const remaining = status.kind === 'saved' ? daysLeft(status.expiresAt) : null;

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6" aria-label="Penyimpanan dan pengajuan konsultasi">
      <div role="status" aria-live="polite" className="text-sm leading-[1.5]">
        {status.kind === 'saving' && (
          <p className="flex items-center gap-2 text-stone-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Menyimpan jawaban Anda…
          </p>
        )}
        {status.kind === 'saved' && (
          <p className="flex items-start gap-2 text-teal-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Jawaban Anda tersimpan dan privat.{' '}
              {status.expiresAt
                ? `Anda bisa mengubahnya sampai ${dateFormat.format(new Date(status.expiresAt))}${remaining !== null ? ` (sisa ${remaining} hari)` : ''}, setelah itu dihapus otomatis bila belum berkonsultasi.`
                : 'Anda bisa mengubahnya sampai batas waktu 7 hari.'}
              {!status.rememberedOnDevice && ' Perangkat ini tidak bisa mengingat data Anda, jadi Anda tidak dapat mengubahnya lagi dari sini.'}
            </span>
          </p>
        )}
        {status.kind === 'error' && (
          <div className="space-y-2 rounded-xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
            <p className="font-semibold">Hasil ini belum tersimpan.</p>
            <p>{ERROR_MESSAGES[status.error]}</p>
            <button type="button" onClick={onRetry} className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800">
              Coba simpan lagi
            </button>
          </div>
        )}
        {status.kind === 'blocked' && (
          <div className="space-y-2 rounded-xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
            <p className="font-semibold">Data tersimpan tidak bisa diubah lagi.</p>
            <p>{ERROR_MESSAGES.not_found} Hasil di layar ini belum tersimpan.</p>
            <button type="button" onClick={onSaveAsNew} className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800">
              Simpan sebagai data baru
            </button>
          </div>
        )}
      </div>

      {status.kind === 'saved' && saved && (
        <div className="space-y-3 border-t border-stone-200 pt-4">
          <p className="text-sm leading-[1.5] text-stone-700">
            Siap berkonsultasi? Buat kode lalu tunjukkan ke konsultan saat Anda datang. Kode hanya berlaku sekali dan berakhir
            bersama jawaban Anda. Membuat kode baru mencabut kode sebelumnya.
          </p>
          {code ? (
            <div className="space-y-2 rounded-xl bg-stone-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Kode konsultasi Anda</p>
              <p className="font-mono text-3xl font-bold tracking-[0.3em] text-stone-900" data-testid="access-code">
                {code.code}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={handleCopy} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold hover:bg-white">
                  <Copy className="h-3.5 w-3.5" /> {copied ? 'Tersalin' : 'Salin kode'}
                </button>
                <button type="button" onClick={requestCode} disabled={codeBusy} className="text-xs font-medium text-teal-800 underline-offset-2 hover:underline disabled:opacity-60">
                  Buat kode baru
                </button>
              </div>
              <p className="text-xs text-stone-500">Catat kode ini; demi keamanan kode tidak ditampilkan lagi setelah halaman dimuat ulang.</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={requestCode}
              disabled={codeBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            >
              {codeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Ajukan konsultasi
            </button>
          )}
          {codeError && (
            <p role="alert" className="flex items-start gap-2 text-sm text-rose-800">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {ERROR_MESSAGES[codeError]}
            </p>
          )}
        </div>
      )}

      {saved && status.kind !== 'saving' && (
        <div className="border-t border-stone-200 pt-4">
          {confirming ? (
            <div className="space-y-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-950 ring-1 ring-rose-200" role="alertdialog" aria-label="Konfirmasi hapus data">
              <p className="font-semibold">Hapus data Anda dari server?</p>
              <p>Jawaban dan keluhan yang tersimpan akan dihapus dan tidak bisa dikembalikan. Kode konsultasi juga tidak berlaku lagi.</p>
              <div className="flex gap-3">
                <button type="button" onClick={handleDelete} disabled={deleting} className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-60">
                  {deleting ? 'Menghapus…' : 'Ya, hapus data saya'}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-semibold">
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 text-xs font-medium text-stone-600 hover:text-rose-800">
              <Trash2 className="h-3.5 w-3.5" /> Hapus data saya
            </button>
          )}
        </div>
      )}
    </section>
  );
}
