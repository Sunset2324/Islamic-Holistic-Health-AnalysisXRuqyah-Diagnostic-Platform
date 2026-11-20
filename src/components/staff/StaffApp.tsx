import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, LogOut, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { setStaffGate, staffApi, StaffApiError, staffGateFromPath, type StaffAccount } from '@/lib/staffApi';
import AdminAccounts from './AdminAccounts';
import AdminAudit from './AdminAudit';
import CaseView from './CaseView';
import ConsultationsView from './ConsultationsView';
import { LoginScreen, SetPasswordScreen } from './AuthScreens';
import { Spinner } from './ui';

type Tab = 'consultations' | 'accounts' | 'audit';

// Dipasang sekali saat modul dimuat: semua panggilan API staf membawa header gerbang dari alamat halaman.
setStaffGate(staffGateFromPath(window.location.pathname));

/** Token undangan dari alamat /staf-<kode>#undangan=<token>. Token di fragmen: tidak pernah terkirim ke server/log. */
function inviteFromHash(): string | null {
  const match = /^#undangan=([A-Za-z0-9_.-]{20,512})$/.exec(window.location.hash);
  return match?.[1] ?? null;
}
function clearInviteFromUrl() {
  window.history.replaceState(null, '', window.location.pathname);
}

export default function StaffApp() {
  const [account, setAccount] = useState<StaffAccount | null>(null);
  const [checking, setChecking] = useState(true);
  const [invite, setInvite] = useState<string | null>(() => inviteFromHash());
  const [tab, setTab] = useState<Tab>('consultations');
  const [caseId, setCaseId] = useState<string | null>(null);

  useEffect(() => {
    if (invite) {
      setChecking(false);
      return;
    }
    staffApi
      .me()
      .then((r) => setAccount(r.account))
      .catch(() => setAccount(null))
      .finally(() => setChecking(false));
  }, [invite]);

  /** Sesi berakhir di tengah jalan (401) -> kembali ke layar masuk. */
  const onAuthError = useCallback((err: unknown) => {
    if (err instanceof StaffApiError && err.status === 401) setAccount(null);
  }, []);

  async function logout() {
    await staffApi.logout().catch(() => undefined);
    setAccount(null);
    setCaseId(null);
    setTab('consultations');
  }

  let body;
  if (checking) {
    body = (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  } else if (invite) {
    body = (
      <SetPasswordScreen
        token={invite}
        onDone={(acc) => {
          clearInviteFromUrl();
          setInvite(null);
          setAccount(acc);
        }}
        onCancel={() => {
          clearInviteFromUrl();
          setInvite(null);
        }}
      />
    );
  } else if (!account) {
    body = <LoginScreen onDone={setAccount} />;
  } else if (caseId) {
    body = <CaseView id={caseId} account={account} onBack={() => setCaseId(null)} onAuthError={onAuthError} />;
  } else if (tab === 'accounts' && account.role === 'admin') {
    body = <AdminAccounts account={account} onAuthError={onAuthError} />;
  } else if (tab === 'audit' && account.role === 'admin') {
    body = <AdminAudit onAuthError={onAuthError} />;
  } else {
    body = <ConsultationsView account={account} onOpen={setCaseId} onAuthError={onAuthError} />;
  }

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'consultations', label: account?.role === 'admin' ? 'Semua konsultasi' : 'Pasien saya', icon: ClipboardList },
    ...(account?.role === 'admin'
      ? [
          { id: 'accounts' as const, label: 'Akun konsultan', icon: Users },
          { id: 'audit' as const, label: 'Log audit', icon: ScrollText },
        ]
      : []),
  ];

  return (
    <div className="staff-bg">
      <header className="glass-header">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-teal-500 to-teal-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-stone-900">My Herbalis</p>
              <p className="text-xs text-stone-500">{account?.role === 'admin' ? 'Admin' : 'Konsultan'}</p>
            </div>
          </div>
          {account && (
            <nav className="flex flex-wrap items-center gap-1" aria-label="Menu staf">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={tab === id && !caseId ? 'page' : undefined}
                  onClick={() => {
                    setCaseId(null);
                    setTab(id);
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    tab === id && !caseId ? 'bg-white/90 text-teal-800 shadow-sm ring-1 ring-teal-900/10' : 'text-stone-600 hover:bg-white/60'
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
              <span className="mx-2 hidden h-6 w-px bg-stone-300/70 sm:block" />
              <span className="hidden text-xs text-stone-500 sm:inline">{account.displayName ?? account.email}</span>
              <button type="button" onClick={logout} className="btn-glass ml-1">
                <LogOut className="h-4 w-4" /> Keluar
              </button>
            </nav>
          )}
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-6xl px-6 py-8">{body}</main>
    </div>
  );
}
