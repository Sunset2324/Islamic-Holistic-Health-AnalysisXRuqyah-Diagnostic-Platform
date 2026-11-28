import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, KeyRound, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { ERROR_MESSAGES } from '@/lib/api';
import { readReminder, writeReminder, type ReminderState } from '@/lib/consultCode';
import { daysLeft } from '@/lib/savedSubmission';
import type { SubmissionApi } from '@/lib/useSubmission';
import CodeReminderBar from './CodeReminderBar';
import CodeShare from './CodeShare';
import TonguePhotos from './TonguePhotos';

const CODE_BOX_ID = 'kode-konsultasi';
const CONSULT_ID = 'ajukan-konsultasi';
const HIGHLIGHT_MS = 2400;

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
  const savedId = saved?.id ?? null;
  const [reminder, setReminder] = useState<ReminderState>(() => (savedId ? readReminder(savedId) : 'open'));
  useEffect(() => {
    if (savedId) setReminder(readReminder(savedId));
  }, [savedId]);

  function closeReminder(state: Exclude<ReminderState, 'open'>) {
    if (savedId) writeReminder(savedId, state);
    setReminder(state);
  }

  const copyRef = useRef<HTMLButtonElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  const [highlight, setHighlight] = useState(false);
  const [pendingJump, setPendingJump] = useState(false);

  /** Bawa pasien langsung ke bagian kode: gulir, sorot sebentar, fokus ke tombol salin (atau buat kode). */
  const hasCode = Boolean(code);
  const jumpToCode = useCallback(() => {
    const target = document.getElementById(hasCode ? CODE_BOX_ID : CONSULT_ID) ?? document.getElementById(CONSULT_ID);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    (hasCode ? copyRef.current : createRef.current)?.focus({ preventScroll: true });
    setHighlight(true);
  }, [hasCode]);

  useEffect(() => {
    if (!highlight) return;
    const t = window.setTimeout(() => setHighlight(false), HIGHLIGHT_MS);
    return () => window.clearTimeout(t);
  }, [highlight]);

  // Kode baru tampil setelah render berikutnya; gulir setelah kotaknya benar-benar ada.
  useEffect(() => {
    if (pendingJump && hasCode) {
      setPendingJump(false);
      jumpToCode();
    }
  }, [pendingJump, hasCode, jumpToCode]);

  async function createCodeFromBar() {
    await requestCode();
    setPendingJump(true);
  }

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
      <section className="soft-card p-6 text-sm text-stone-700" role="status">
        Data Anda sudah dihapus dari server. Hasil di layar ini hanya ada di perangkat Anda dan hilang saat halaman ditutup.
      </section>
    );
  }

  const remaining = status.kind === 'saved' ? daysLeft(status.expiresAt) : null;

  return (
    <section className="space-y-4 soft-card p-6" aria-label="Penyimpanan dan pengajuan konsultasi">
      <div role="status" aria-live="polite" className="text-sm leading-[1.5]">
        {status.kind === 'saving' && (
          <p className="flex items-center gap-2 text-stone-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Menyimpan jawaban Anda…
          </p>
        )}
        {status.kind === 'saved' && (
          <p className="flex items-start gap-2 text-mint-900">
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
          <div className="space-y-2 rounded-2xl bg-peach-50 p-4 text-peach-950 ring-1 ring-peach-200">
            <p className="font-semibold">Hasil ini belum tersimpan.</p>
            <p>{ERROR_MESSAGES[status.error]}</p>
            <button type="button" onClick={onRetry} className="rounded-lg bg-peach-700 px-4 py-2 text-xs font-semibold text-white hover:bg-peach-800">
              Coba simpan lagi
            </button>
          </div>
        )}
        {status.kind === 'blocked' && (
          <div className="space-y-2 rounded-2xl bg-peach-50 p-4 text-peach-950 ring-1 ring-peach-200">
            <p className="font-semibold">Data tersimpan tidak bisa diubah lagi.</p>
            <p>{ERROR_MESSAGES.not_found} Hasil di layar ini belum tersimpan.</p>
            <button type="button" onClick={onSaveAsNew} className="rounded-lg bg-peach-700 px-4 py-2 text-xs font-semibold text-white hover:bg-peach-800">
              Simpan sebagai data baru
            </button>
          </div>
        )}
      </div>

      {status.kind === 'saved' && saved && <TonguePhotos submissionId={saved.id} editToken={saved.editToken} />}

      {status.kind === 'saved' && saved && (
        <div
          id={CONSULT_ID}
          className={`scroll-mt-24 space-y-4 rounded-3xl bg-mint-900 p-5 text-white shadow-lg ring-4 transition-shadow duration-300 sm:p-6 ${
            highlight ? 'ring-amber-400' : 'ring-transparent'
          }`}
        >
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <KeyRound className="h-5 w-5 text-amber-300" aria-hidden /> Kode konsultasi
          </h2>
          <p className="text-sm leading-[1.5] text-mint-50">
            Siap berkonsultasi? Buat kode lalu kirim atau tunjukkan ke konsultan. Kode hanya berlaku sekali dan berakhir
            bersama jawaban Anda. Membuat kode baru mencabut kode sebelumnya.
          </p>
          {code ? (
            <div id={CODE_BOX_ID} className="space-y-4 rounded-2xl bg-white p-4 text-stone-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-600">Kode konsultasi Anda</p>
              <p className="font-mono text-3xl font-bold tracking-[0.3em] text-stone-950" data-testid="access-code">
                {code.code}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  ref={copyRef}
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-base font-bold text-stone-950 shadow hover:bg-amber-300 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-mint-700"
                >
                  <Copy className="h-5 w-5" /> {copied ? 'Tersalin' : 'Salin kode'}
                </button>
                <button type="button" onClick={requestCode} disabled={codeBusy} className="text-sm font-medium text-mint-800 underline underline-offset-2 disabled:opacity-60">
                  Buat kode baru
                </button>
              </div>
              <CodeShare code={code.code} onSent={() => closeReminder('sent')} />
              <p className="text-xs text-stone-600">Catat kode ini; demi keamanan kode tidak ditampilkan lagi setelah halaman dimuat ulang.</p>
            </div>
          ) : (
            <button
              ref={createRef}
              type="button"
              onClick={requestCode}
              disabled={codeBusy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3.5 text-base font-bold text-stone-950 shadow hover:bg-amber-300 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:opacity-70 sm:w-auto"
            >
              {codeBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
              Buat kode konsultasi
            </button>
          )}
          {codeError && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {ERROR_MESSAGES[codeError]}
            </p>
          )}
        </div>
      )}

      {saved && status.kind !== 'saving' && (
        <div className="border-t border-lavender-100 pt-4">
          {confirming ? (
            <div className="space-y-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-950 ring-1 ring-rose-200" role="alertdialog" aria-label="Konfirmasi hapus data">
              <p className="font-semibold">Hapus data Anda dari server?</p>
              <p>Jawaban, keluhan, dan foto yang tersimpan akan dihapus dan tidak bisa dikembalikan. Kode konsultasi juga tidak berlaku lagi.</p>
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

      {status.kind === 'saved' && saved && reminder === 'open' && (
        <CodeReminderBar
          code={code?.code ?? null}
          busy={codeBusy}
          onCreateCode={() => void createCodeFromBar()}
          onShowCode={jumpToCode}
          onSent={() => closeReminder('sent')}
          onSkip={() => closeReminder('skipped')}
        />
      )}
    </section>
  );
}
