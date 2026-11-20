import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ChevronRight, KeyRound, RefreshCw, Search } from 'lucide-react';
import { staffApi, staffErrorMessage, type ConsultationSummary, type StaffAccount } from '@/lib/staffApi';
import { GlassCard, Notice, Spinner, StatTile, StatusChip } from './ui';
import { formatDateTime } from './format';

interface Props {
  account: StaffAccount;
  onOpen: (id: string) => void;
  onAuthError: (err: unknown) => void;
}

export default function ConsultationsView({ account, onOpen, onAuthError }: Props) {
  const [items, setItems] = useState<ConsultationSummary[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const isAdmin = account.role === 'admin';

  const load = useCallback(() => {
    setError('');
    staffApi
      .consultations()
      .then((r) => setItems(r.consultations))
      .catch((err) => {
        onAuthError(err);
        setError(staffErrorMessage(err));
      });
  }, [onAuthError]);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!items || !q) return items ?? [];
    return items.filter((c) => (c.patientName ?? '').toLowerCase().includes(q) || (c.consultant.displayName ?? c.consultant.email).toLowerCase().includes(q));
  }, [items, query]);

  const drafts = items?.filter((c) => c.status === 'draft').length ?? 0;
  const finals = items?.filter((c) => c.status === 'final').length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">{isAdmin ? 'Semua konsultasi' : `Assalamu'alaikum, ${account.displayName ?? 'Konsultan'}`}</h1>
        <p className="mt-1 text-sm text-stone-600">
          {isAdmin ? 'Mode admin: baca saja. Setiap laporan yang Anda buka tercatat di log audit.' : 'Terima pasien dengan kode 8 karakter yang mereka tunjukkan.'}
        </p>
      </div>

      <div className={`grid gap-4 ${isAdmin ? 'sm:grid-cols-3' : 'lg:grid-cols-[1fr_1fr_1fr_1.6fr] sm:grid-cols-3'}`}>
        <StatTile label="Total" value={items?.length ?? '–'} />
        <StatTile label="Draf" value={items ? drafts : '–'} tone="amber" />
        <StatTile label="Final" value={items ? finals : '–'} tone="emerald" />
        {!isAdmin && <AcceptCode onAccepted={onOpen} onAuthError={onAuthError} />}
      </div>

      <GlassCard
        title={isAdmin ? 'Daftar konsultasi' : 'Pasien saya'}
        actions={
          <div className="flex items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama…" aria-label="Cari" className="input-glass w-48 py-2 pl-9" />
            </label>
            <button type="button" onClick={load} className="btn-glass" aria-label="Muat ulang">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        }
      >
        {error && <Notice tone="error">{error}</Notice>}
        {!items && !error && <Spinner />}
        {items && filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-stone-500">{items.length === 0 ? 'Belum ada konsultasi.' : 'Tidak ada yang cocok dengan pencarian.'}</p>
        )}
        {filtered.length > 0 && (
          <ul className="divide-y divide-stone-200/70">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c.id)}
                  className="flex w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition hover:bg-white/70"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-teal-100 to-teal-200 text-sm font-bold text-teal-800 ring-1 ring-white">
                    {((c.patientName ?? '').trim()[0] ?? '?').toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-stone-900">
                      {c.patientName === null ? <span className="text-rose-700">Data tidak bisa dibuka (kunci enkripsi)</span> : c.patientName || 'Tanpa nama'}
                    </span>
                    <span className="block truncate text-xs text-stone-500">
                      {isAdmin && <>{c.consultant.displayName ?? c.consultant.email} · </>}
                      Diperbarui {formatDateTime(c.updatedAt)}
                    </span>
                  </span>
                  <StatusChip status={c.status} />
                  <ChevronRight className="h-4 w-4 text-stone-400" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}

const CODE_LEN = 8;

function AcceptCode({ onAccepted, onAuthError }: { onAccepted: (id: string) => void; onAuthError: (err: unknown) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (code.length !== CODE_LEN) return;
    setBusy(true);
    setError('');
    try {
      onAccepted((await staffApi.acceptCode(code)).consultationId);
    } catch (err) {
      onAuthError(err);
      setError(staffErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass space-y-2 p-5 sm:col-span-3 lg:col-span-1">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
        <KeyRound className="h-4 w-4 text-teal-700" /> Terima pasien
      </p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN));
            setError('');
          }}
          placeholder="XXXXXXXX"
          aria-label="Kode akses pasien"
          autoComplete="off"
          className="input-glass text-center font-mono text-lg tracking-[0.3em]"
        />
        <button type="submit" disabled={busy || code.length !== CODE_LEN} className="btn-glossy shrink-0">
          {busy ? '…' : 'Terima'}
        </button>
      </div>
      {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}
      <p className="text-xs text-stone-500">Setelah diterima, jawaban pasien terkunci dan kode berakhir.</p>
    </form>
  );
}
