import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  createSubmission,
  deleteSubmission,
  getSubmission,
  issueAccessCode,
  updateSubmission,
  type ApiErrorKind,
  type IssuedCode,
  type StoredSubmission,
  type SubmissionPayload,
} from '@/lib/api';
import { clearSaved, daysLeft, loadSaved, writeSaved, type SavedSubmission } from '@/lib/savedSubmission';

export type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; expiresAt: string | null; rememberedOnDevice: boolean }
  /** Gagal menyimpan; hasil di layar tetap bisa dipakai. */
  | { kind: 'error'; error: ApiErrorKind }
  /** Data tersimpan tidak bisa diubah lagi (berakhir, dikunci konsultan, atau tidak ditemukan). */
  | { kind: 'blocked' }
  | { kind: 'deleted' };

/** Keadaan data tersimpan di perangkat ini, dipakai halaman awal. */
export type RestoreState =
  | { kind: 'checking' }
  | { kind: 'none' }
  | { kind: 'available'; daysLeft: number | null; locked: boolean }
  | { kind: 'ended' }
  | { kind: 'unreachable' };

export function useSubmission() {
  const [saved, setSaved] = useState<SavedSubmission | null>(() => loadSaved());
  const [restore, setRestore] = useState<RestoreState>(() => (loadSaved() ? { kind: 'checking' } : { kind: 'none' }));
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
  const [code, setCode] = useState<IssuedCode | null>(null);
  const [codeError, setCodeError] = useState<ApiErrorKind | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const restored = useRef<StoredSubmission | null>(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;

  // Periksa data tersimpan sekali saat aplikasi dibuka.
  useEffect(() => {
    const current = savedRef.current;
    if (!current) return;
    let cancelled = false;
    getSubmission(current.id, current.editToken)
      .then((data) => {
        if (cancelled) return;
        restored.current = data;
        setRestore({ kind: 'available', daysLeft: daysLeft(data.expiresAt), locked: data.status !== 'draft' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.kind === 'not_found') {
          clearSaved();
          setSaved(null);
          setRestore({ kind: 'ended' });
        } else {
          setRestore({ kind: 'unreachable' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remember = useCallback((next: SavedSubmission) => {
    const ok = writeSaved(next);
    setSaved(next);
    return ok;
  }, []);

  /** Mengambil data yang sudah dipulihkan (sekali pakai). */
  const takeRestored = useCallback((): StoredSubmission | null => {
    const data = restored.current;
    if (data) {
      setStatus(
        data.status === 'draft'
          ? { kind: 'saved', expiresAt: data.expiresAt, rememberedOnDevice: true }
          : { kind: 'blocked' },
      );
    }
    return data;
  }, []);

  const save = useCallback(
    async (build: () => SubmissionPayload, options: { asNew?: boolean } = {}) => {
      setStatus({ kind: 'saving' });
      try {
        const payload = build();
        const current = options.asNew ? null : savedRef.current;
        if (options.asNew) {
          clearSaved();
          setSaved(null);
          setCode(null);
        }
        if (current) {
          await updateSubmission(current.id, current.editToken, payload);
          setStatus({ kind: 'saved', expiresAt: current.expiresAt, rememberedOnDevice: true });
        } else {
          const created = await createSubmission(payload);
          const ok = remember({ id: created.id, editToken: created.editToken, expiresAt: created.expiresAt });
          setStatus({ kind: 'saved', expiresAt: created.expiresAt, rememberedOnDevice: ok });
        }
      } catch (err) {
        const kind = err instanceof ApiError ? err.kind : 'server';
        setStatus(kind === 'not_found' ? { kind: 'blocked' } : { kind: 'error', error: kind });
      }
    },
    [remember],
  );

  const requestCode = useCallback(async () => {
    const current = savedRef.current;
    if (!current) return;
    setCodeBusy(true);
    setCodeError(null);
    try {
      setCode(await issueAccessCode(current.id, current.editToken));
    } catch (err) {
      const kind = err instanceof ApiError ? err.kind : 'server';
      if (kind === 'not_found') setStatus({ kind: 'blocked' });
      else setCodeError(kind);
    } finally {
      setCodeBusy(false);
    }
  }, []);

  /** Hapus data di server atas permintaan pasien. Token lokal ikut dihapus hanya bila server sudah menjawab. */
  const remove = useCallback(async (): Promise<boolean> => {
    const current = savedRef.current;
    if (!current) return true;
    try {
      await deleteSubmission(current.id, current.editToken);
    } catch (err) {
      // 404 berarti data memang sudah tidak ada/terkunci di server; token lokal tidak berguna lagi.
      if (!(err instanceof ApiError && err.kind === 'not_found')) {
        setStatus({ kind: 'error', error: err instanceof ApiError ? err.kind : 'server' });
        return false;
      }
    }
    clearSaved();
    setSaved(null);
    setCode(null);
    setStatus({ kind: 'deleted' });
    setRestore({ kind: 'none' });
    restored.current = null;
    return true;
  }, []);

  return { saved, restore, status, code, codeError, codeBusy, save, requestCode, remove, takeRestored };
}

export type SubmissionApi = ReturnType<typeof useSubmission>;
