import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, Link2, Power, UserPlus } from 'lucide-react';
import { staffApi, staffErrorMessage, type AccountRow, type StaffAccount } from '@/lib/staffApi';
import { Field, GlassCard, Notice, Spinner } from './ui';
import { formatDateTime } from './format';

interface Props {
  account: StaffAccount;
  onAuthError: (err: unknown) => void;
}

/** Alamat lengkap undangan dari alamat relatif server (token ada di fragmen #). */
const fullInviteUrl = (invitePath: string) => `${window.location.origin}${invitePath}`;

export default function AdminAccounts({ account, onAuthError }: Props) {
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState('');
  const [invite, setInvite] = useState<{ email: string; url: string } | null>(null);

  const load = useCallback(() => {
    staffApi
      .accounts()
      .then((r) => setRows(r.accounts))
      .catch((err) => {
        onAuthError(err);
        setError(staffErrorMessage(err));
      });
  }, [onAuthError]);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      load();
    } catch (err) {
      onAuthError(err);
      setError(staffErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Akun konsultan</h1>
        <p className="mt-1 text-sm text-stone-600">Buat akun lalu kirim tautan undangan langsung ke konsultan (bukan lewat grup). Tautan berlaku 72 jam dan sekali pakai.</p>
      </div>

      <NewConsultant
        onCreated={(email, invitePath) => {
          setInvite({ email, url: fullInviteUrl(invitePath) });
          load();
        }}
        onAuthError={onAuthError}
      />

      {invite && <InviteBox email={invite.email} url={invite.url} onClose={() => setInvite(null)} />}
      {error && <Notice tone="error">{error}</Notice>}

      <GlassCard title="Daftar akun">
        {!rows && !error && <Spinner />}
        {rows && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-stone-500">
                <tr>
                  <th className="pb-2 pr-3 font-semibold">Nama</th>
                  <th className="pb-2 pr-3 font-semibold">Email</th>
                  <th className="pb-2 pr-3 font-semibold">Peran</th>
                  <th className="pb-2 pr-3 font-semibold">Status</th>
                  <th className="pb-2 font-semibold">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200/70">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 pr-3 font-medium text-stone-900">{r.displayName ?? '—'}</td>
                    <td className="py-3 pr-3 text-stone-700">{r.email}</td>
                    <td className="py-3 pr-3">{r.role === 'admin' ? 'Admin' : 'Konsultan'}</td>
                    <td className="py-3 pr-3">
                      {r.disabledAt ? (
                        <span className="chip bg-stone-100 text-stone-700 ring-stone-200">Nonaktif sejak {formatDateTime(r.disabledAt)}</span>
                      ) : r.hasPassword ? (
                        <span className="chip bg-emerald-50 text-emerald-800 ring-emerald-200">Aktif</span>
                      ) : (
                        <span className="chip bg-amber-50 text-amber-900 ring-amber-200">Menunggu undangan</span>
                      )}
                    </td>
                    <td className="py-3">
                      {r.role === 'consultant' && r.id !== account.id && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-glass"
                            onClick={() =>
                              act(async () => {
                                const { invitePath } = await staffApi.reinvite(r.id);
                                setInvite({ email: r.email, url: fullInviteUrl(invitePath) });
                              })
                            }
                          >
                            <Link2 className="h-4 w-4" /> {r.hasPassword ? 'Reset sandi' : 'Undangan baru'}
                          </button>
                          {r.disabledAt ? (
                            <button type="button" className="btn-glass" onClick={() => act(() => staffApi.setDisabled(r.id, false))}>
                              <Power className="h-4 w-4" /> Aktifkan
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-danger"
                              onClick={() => window.confirm(`Nonaktifkan ${r.email}? Sesi yang sedang berjalan langsung berakhir.`) && act(() => staffApi.setDisabled(r.id, true))}
                            >
                              <Power className="h-4 w-4" /> Nonaktifkan
                            </button>
                          )}
                        </div>
                      )}
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

function NewConsultant({ onCreated, onAuthError }: { onCreated: (email: string, invitePath: string) => void; onAuthError: (err: unknown) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { invitePath } = await staffApi.createConsultant(email, name);
      onCreated(email, invitePath);
      setEmail('');
      setName('');
    } catch (err) {
      onAuthError(err);
      setError(staffErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard title="Tambah konsultan">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Nama tampilan">
          <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ustadzah Aminah" className="input-glass" />
        </Field>
        <Field label="Email">
          <input required type="email" maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@contoh.id" className="input-glass" />
        </Field>
        <button type="submit" disabled={busy} className="btn-glossy">
          <UserPlus className="h-4 w-4" /> {busy ? 'Membuat…' : 'Buat & undang'}
        </button>
      </form>
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </GlassCard>
  );
}

function InviteBox({ email, url, onClose }: { email: string; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="glass border-teal-200 bg-teal-50/70 p-5">
      <p className="text-sm font-semibold text-teal-900">Tautan undangan untuk {email}</p>
      <p className="mt-1 text-xs text-teal-900/80">Tautan ini hanya ditampilkan sekarang. Kirim langsung ke konsultan; siapa pun yang memegangnya bisa membuat kata sandi akun ini.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input readOnly value={url} onFocus={(e) => e.target.select()} className="input-glass flex-1 font-mono text-xs" aria-label="Tautan undangan" />
        <button
          type="button"
          className="btn-glossy"
          onClick={() =>
            navigator.clipboard.writeText(url).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          <Copy className="h-4 w-4" /> {copied ? 'Tersalin' : 'Salin'}
        </button>
        <button type="button" className="btn-glass" onClick={onClose}>
          Tutup
        </button>
      </div>
    </div>
  );
}
