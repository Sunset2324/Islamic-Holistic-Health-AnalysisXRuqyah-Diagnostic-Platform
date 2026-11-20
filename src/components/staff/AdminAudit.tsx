import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { staffApi, staffErrorMessage, type AuditEntry } from '@/lib/staffApi';
import { GlassCard, Notice, Spinner } from './ui';
import { formatDateTime } from './format';

const ACTION_LABEL: Record<string, string> = {
  login: 'Masuk',
  set_password: 'Membuat/mengganti kata sandi',
  accept_code: 'Menerima kode pasien',
  view: 'Membuka laporan',
  view_image: 'Membuka foto lidah',
  list: 'Melihat daftar konsultasi',
  update: 'Menyimpan draf laporan',
  finalize: 'Memfinalkan laporan',
  create: 'Membuat akun',
  invite: 'Menerbitkan undangan/reset',
  disable: 'Menonaktifkan akun',
  enable: 'Mengaktifkan akun',
  cli_admin_invite: 'Undangan admin (server)',
};

/** Log audit: hanya metadata (siapa, apa, kapan). Isi data pasien tidak pernah dicatat. */
export default function AdminAudit({ onAuthError }: { onAuthError: (err: unknown) => void }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    staffApi
      .audit()
      .then((r) => setEntries(r.entries))
      .catch((err) => {
        onAuthError(err);
        setError(staffErrorMessage(err));
      });
  }, [onAuthError]);
  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Log audit</h1>
        <p className="mt-1 text-sm text-stone-600">300 aktivitas terakhir. Hanya siapa, apa, dan kapan; isi data pasien tidak pernah dicatat.</p>
      </div>
      <GlassCard
        title="Aktivitas"
        actions={
          <button type="button" onClick={load} className="btn-glass" aria-label="Muat ulang">
            <RefreshCw className="h-4 w-4" />
          </button>
        }
      >
        {error && <Notice tone="error">{error}</Notice>}
        {!entries && !error && <Spinner />}
        {entries && entries.length === 0 && <p className="py-8 text-center text-sm text-stone-500">Belum ada aktivitas.</p>}
        {entries && entries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="pb-2 pr-3 font-semibold">Waktu</th>
                  <th className="pb-2 pr-3 font-semibold">Pelaku</th>
                  <th className="pb-2 pr-3 font-semibold">Aktivitas</th>
                  <th className="pb-2 font-semibold">Objek</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/70">
                {entries.map((e) => (
                  <tr key={e.id} className={e.actor?.role === 'admin' && (e.action === 'view' || e.action === 'list') ? 'bg-amber-50/60' : ''}>
                    <td className="whitespace-nowrap py-2.5 pr-3 tabular-nums text-stone-600">{formatDateTime(e.at)}</td>
                    <td className="py-2.5 pr-3 text-stone-800">
                      {e.actor ? (
                        <>
                          {e.actor.email} <span className="text-xs text-stone-500">({e.actor.role === 'admin' ? 'admin' : 'konsultan'})</span>
                        </>
                      ) : (
                        <span className="text-stone-500">sistem</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-stone-900">{ACTION_LABEL[e.action] ?? e.action}</td>
                    <td className="py-2.5 font-mono text-xs text-stone-500">
                      {e.entity}/{e.entityId.slice(0, 8)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
