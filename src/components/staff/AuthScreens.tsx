import { useState, type FormEvent } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { staffApi, staffErrorMessage, type StaffAccount } from '@/lib/staffApi';
import { Field, GlassCard, Notice } from './ui';

export function LoginScreen({ onDone }: { onDone: (account: StaffAccount) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onDone((await staffApi.login(email, password)).account);
    } catch (err) {
      setError(staffErrorMessage(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-10">
      <GlassCard>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <h1 className="text-xl font-bold text-stone-900">Masuk staf</h1>
            <p className="mt-1 text-sm text-stone-600">Khusus konsultan dan admin MyHerbalis.</p>
          </div>
          <Field label="Email">
            <input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="input-glass" />
          </Field>
          <Field label="Kata sandi">
            <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-glass" />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" disabled={busy} className="btn-glossy w-full">
            <LogIn className="h-4 w-4" /> {busy ? 'Memeriksa…' : 'Masuk'}
          </button>
          <p className="text-xs text-stone-500">Belum punya akun? Akun dibuat oleh admin; Anda akan menerima tautan undangan.</p>
        </form>
      </GlassCard>
    </div>
  );
}

const MIN_PASSWORD = 12;

export function SetPasswordScreen({ token, onDone, onCancel }: { token: string; onDone: (account: StaffAccount) => void; onCancel: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD || password !== confirm) return;
    setBusy(true);
    setError('');
    try {
      onDone((await staffApi.setPassword(token, password)).account);
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm pt-10">
      <GlassCard>
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-stone-900">Buat kata sandi</h1>
              <p className="text-sm text-stone-600">Tautan ini hanya bisa dipakai sekali.</p>
            </div>
          </div>
          <Field label="Kata sandi baru" hint={`Minimal ${MIN_PASSWORD} karakter. Kalimat panjang lebih kuat dan mudah diingat.`}>
            <input type="password" required autoComplete="new-password" maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className="input-glass" />
          </Field>
          <Field label="Ulangi kata sandi">
            <input type="password" required autoComplete="new-password" maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="input-glass" />
          </Field>
          {tooShort && <Notice tone="info">Kata sandi masih kurang dari {MIN_PASSWORD} karakter.</Notice>}
          {mismatch && <Notice tone="error">Kedua kata sandi belum sama.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" disabled={busy || password.length < MIN_PASSWORD || password !== confirm} className="btn-glossy w-full">
            {busy ? 'Menyimpan…' : 'Simpan dan masuk'}
          </button>
          <button type="button" onClick={onCancel} className="btn-glass w-full">
            Ke halaman masuk
          </button>
        </form>
      </GlassCard>
    </div>
  );
}
