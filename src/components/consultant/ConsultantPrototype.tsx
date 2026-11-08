import { useMemo, useState } from 'react';
import { CheckCircle2, FileText, KeyRound, Link2, LogOut, Printer, ShieldAlert, Users } from 'lucide-react';
import PillarBars from '@/components/dashboard/PillarBars';
import RuqyahAlertCard from '@/components/dashboard/RuqyahAlertCard';
import ScoreRing from '@/components/dashboard/ScoreRing';
import { SAMPLE_CASES, type SampleCase } from '@/components/consultant/sampleCases';
import { EMERGENCY_NUMBER } from '@/config';
import { RUQYAH_CONDITIONS, type RuqyahConditionId } from '@/data/conditions';
import { INDICATORS } from '@/data/indicators';
import { computeAssessment, concerningTags, sanitizeTagSelections } from '@/lib/Hhs';
import { assessRuqyah } from '@/lib/ruqyah';

type Screen = 'login' | 'code' | 'case';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const inputClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-200';
const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' });

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export default function ConsultantPrototype() {
  const [screen, setScreen] = useState<Screen>('login');
  const [active, setActive] = useState<SampleCase | null>(null);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <div className="sticky top-0 z-20 bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-950">
        PROTOTIPE tampilan konsultan. Memakai data contoh, tidak tersambung ke server, dan tidak ada yang disimpan.
      </div>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <p className="text-sm font-bold text-stone-900">MyHerbalis · Konsultan</p>
          {screen !== 'login' && (
            <button
              type="button"
              onClick={() => {
                setActive(null);
                setScreen('login');
              }}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              <LogOut className="h-4 w-4" /> Keluar
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        {screen === 'login' && <LoginScreen onDone={() => setScreen('code')} />}
        {screen === 'code' && (
          <CodeScreen
            onAccept={(found) => {
              setActive(found);
              setScreen('case');
            }}
          />
        )}
        {screen === 'case' && active && <CaseScreen key={active.code} sample={active} onBack={() => setScreen('code')} />}
      </main>
    </div>
  );
}

function LoginScreen({ onDone }: { onDone: () => void }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onDone();
      }}
      className="mx-auto max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-6"
    >
      <h1 className="text-xl font-bold text-stone-900">Masuk konsultan</h1>
      <p className="text-xs text-stone-500">Prototipe: kolom ini tidak diperiksa. Versi sungguhan memakai akun undangan dan verifikasi dua langkah.</p>
      <label className="block space-y-1 text-sm font-medium">
        Email
        <input type="email" className={inputClass} placeholder="konsultan@contoh.id" />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        Kata sandi
        <input type="password" className={inputClass} placeholder="••••••••" />
      </label>
      <button type="submit" className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
        Masuk (contoh)
      </button>
    </form>
  );
}

function CodeScreen({ onAccept }: { onAccept: (sample: SampleCase) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function submit(raw: string) {
    const found = SAMPLE_CASES.find((sample) => sample.code === raw.trim().toUpperCase());
    if (found) onAccept(found);
    else setError('Kode tidak valid atau sudah berakhir.');
  }

  return (
    <div className="mx-auto max-w-md space-y-5 rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-stone-900">Terima pasien</h1>
          <p className="text-sm text-stone-600">Masukkan kode 8 karakter dari pasien yang hadir.</p>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="space-y-3"
      >
        <input
          value={value}
          onChange={(event) => {
            setValue(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
            setError('');
          }}
          className={`${inputClass} text-center font-mono text-lg tracking-[0.3em]`}
          placeholder="XXXXXXXX"
          aria-label="Kode akses pasien"
        />
        {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
        <button type="submit" className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">
          Terima kode
        </button>
      </form>
      <div className="rounded-xl bg-stone-50 p-4 text-xs text-stone-600">
        <p className="mb-2 font-semibold text-stone-800">Kode contoh (hanya prototipe)</p>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_CASES.map((sample) => (
            <button
              key={sample.code}
              type="button"
              onClick={() => submit(sample.code)}
              className="rounded-md border border-stone-300 bg-white px-2 py-1 font-mono hover:border-teal-600"
            >
              {sample.code}
            </button>
          ))}
        </div>
        <p className="mt-2">Setelah kode diterima, kode berakhir dan jawaban pasien terkunci.</p>
      </div>
    </div>
  );
}

function CaseScreen({ sample, onBack }: { sample: SampleCase; onBack: () => void }) {
  const assessment = useMemo(() => computeAssessment(sample.answers), [sample]);
  const ruqyah = useMemo(() => assessRuqyah(assessment), [assessment]);
  const tags = useMemo(() => sanitizeTagSelections(sample.answers, sample.tags), [sample]);
  const concerning = useMemo(() => concerningTags(sample.answers, tags), [sample, tags]);

  const [condition, setCondition] = useState<RuqyahConditionId | ''>('');
  const [ruqyahNotes, setRuqyahNotes] = useState('');
  const [advice, setAdvice] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [shareRuqyah, setShareRuqyah] = useState(false);
  const [shareNotes, setShareNotes] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);

  const missing = [
    !condition && 'penilaian ruqyah (kondisi A–D)',
    !ruqyahNotes.trim() && 'catatan penilaian ruqyah',
    !advice.trim() && 'saran konsultan untuk pasien',
  ].filter(Boolean) as string[];
  const canFinalize = missing.length === 0 && !finalized;
  const intake = sample.intake;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{intake.name || 'Tanpa nama'}, {intake.age} tahun</h1>
          <p className="mt-1 inline-flex items-center gap-2 text-sm text-stone-600">
            <Users className="h-4 w-4" />
            {sample.hasAccount ? 'Pasien punya akun: laporan masuk ke riwayatnya.' : 'Pasien tanpa akun: laporan diserahkan sebagai PDF, tanpa riwayat untuk pasien.'}
          </p>
        </div>
        <button type="button" onClick={onBack} className="rounded-lg border border-stone-300 px-3 py-2 text-sm hover:bg-stone-100">
          Pasien lain
        </button>
      </div>

      {concerning.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
          <div>
            <p className="font-semibold">Tag yang dipilih pasien perlu perhatian segera</p>
            <p className="mt-1">{concerning.map((tag) => tag.label).join('; ')}. Lakukan skrining keselamatan dan red flag sebelum lanjut.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="min-w-0 space-y-6">
          <Card title="Keluhan dan data pasien">
            <dl className="space-y-2 text-sm">
              <Row label="Keluhan utama" value={intake.mainComplaint} />
              <Row label="Durasi" value={intake.complaintDuration} />
              <Row label="Frekuensi" value={intake.complaintFrequency} />
              <Row label="Dampak" value={intake.complaintImpact} />
              <Row label="Riwayat medis" value={intake.medicalHistory} />
            </dl>
          </Card>
          <Card title="Hasil HHS (hitungan sistem)">
            {assessment.complete && assessment.hhs100Display !== null && assessment.category ? (
              <ScoreRing score={assessment.hhs100Display} category={assessment.category} />
            ) : (
              <p className="text-sm text-stone-600">Jawaban belum lengkap; total tidak dihitung.</p>
            )}
            <div className="mt-6">
              <PillarBars assessment={assessment} answers={sample.answers} imbalance={ruqyah.imbalance} gap={ruqyah.gap} />
            </div>
          </Card>
          <Card title="Micro-Tag yang dipilih pasien">
            <ul className="space-y-1.5 text-sm">
              {INDICATORS.flatMap((indicator) =>
                (tags[indicator.id]?.tagIds ?? []).map((tagId) => {
                  const tag = indicator.microTags.find((candidate) => candidate.id === tagId);
                  const alert = concerning.some((item) => item.tagId === tagId);
                  return (
                    <li key={`${indicator.id}-${tagId}`} className={alert ? 'font-semibold text-rose-800' : 'text-stone-700'}>
                      <span className="mr-2 text-xs text-stone-400">{indicator.id}</span>
                      {tag?.label ?? tagId}
                    </li>
                  );
                }),
              )}
            </ul>
            {Object.keys(tags).length === 0 && <p className="text-sm text-stone-500">Tidak ada.</p>}
          </Card>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Ajuan sistem, hanya untuk konsultan (tidak tampil ke pasien)</p>
            <RuqyahAlertCard ruqyah={ruqyah} answers={sample.answers} />
          </div>
        </section>

        <section className="min-w-0 space-y-6">
          <Card title="Laporan konsultan">
            <fieldset disabled={finalized} className="space-y-4">
              <label className="block space-y-1 text-sm font-medium">
                Penilaian ruqyah <Required />
                <select value={condition} onChange={(e) => setCondition(e.target.value as RuqyahConditionId | '')} className={inputClass}>
                  <option value="">Pilih kondisi…</option>
                  {(Object.keys(RUQYAH_CONDITIONS) as RuqyahConditionId[]).map((id) => (
                    <option key={id} value={id}>{id}. {RUQYAH_CONDITIONS[id].name}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Catatan penilaian ruqyah <Required />
                <textarea value={ruqyahNotes} onChange={(e) => setRuqyahNotes(e.target.value)} rows={3} className={inputClass} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Saran konsultan untuk pasien <Required />
                <textarea value={advice} onChange={(e) => setAdvice(e.target.value)} rows={4} className={inputClass} />
              </label>
              <label className="block space-y-1 text-sm font-medium">
                Catatan klinis (internal)
                <textarea value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} rows={3} className={inputClass} />
              </label>
              <div className="space-y-2 rounded-xl bg-stone-50 p-4 text-sm">
                <p className="font-semibold text-stone-800">Yang ikut dilihat pasien (bawaan: tidak)</p>
                <label className="flex items-center gap-2"><input type="checkbox" checked={shareRuqyah} onChange={(e) => setShareRuqyah(e.target.checked)} /> Sertakan penilaian ruqyah</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={shareNotes} onChange={(e) => setShareNotes(e.target.checked)} /> Sertakan catatan klinis</label>
                <p className="text-xs text-stone-500">Hasil hitungan dan ajuan sistem tidak pernah ikut ke pasien.</p>
              </div>
            </fieldset>
            {!finalized && (
              <div className="mt-4 space-y-2">
                {missing.length > 0 && <p className="text-xs text-stone-600">Belum diisi: {missing.join(', ')}.</p>}
                <button
                  type="button"
                  disabled={!canFinalize}
                  onClick={() => setFinalized(true)}
                  className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  Finalkan laporan
                </button>
              </div>
            )}
            {finalized && (
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-teal-800">
                <CheckCircle2 className="h-4 w-4" /> Laporan final. Perubahan berikutnya dibuat sebagai laporan baru, bukan menimpa.
              </p>
            )}
          </Card>

          <Card title={finalized ? 'Laporan untuk pasien' : 'Pratinjau laporan untuk pasien'}>
            <div id="patient-report" className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 text-sm leading-[1.5]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">MyHerbalis · Laporan konsultasi</p>
                <p className="mt-1 text-base font-bold text-stone-900">{intake.name || 'Pasien'}</p>
                <p className="text-xs text-stone-500">{dateFormat.format(new Date())}</p>
              </div>
              <div>
                <p className="font-semibold text-stone-900">Saran dari konsultan</p>
                <p className="mt-1 whitespace-pre-wrap text-stone-700">{advice.trim() || <span className="text-stone-400">(belum diisi)</span>}</p>
              </div>
              {shareRuqyah && condition && (
                <div>
                  <p className="font-semibold text-stone-900">Penilaian ruqyah</p>
                  <p className="mt-1 text-stone-700">{RUQYAH_CONDITIONS[condition].name}</p>
                  <p className="whitespace-pre-wrap text-stone-700">{ruqyahNotes.trim()}</p>
                </div>
              )}
              {shareNotes && clinicalNotes.trim() && (
                <div>
                  <p className="font-semibold text-stone-900">Catatan klinis</p>
                  <p className="mt-1 whitespace-pre-wrap text-stone-700">{clinicalNotes.trim()}</p>
                </div>
              )}
              <p className="border-t border-stone-200 pt-3 text-xs text-stone-500">
                Laporan ini bukan diagnosis medis. Dalam keadaan darurat hubungi {EMERGENCY_NUMBER} atau datang ke fasilitas kesehatan terdekat.
              </p>
            </div>
            {finalized && (
              <div className="mt-4 space-y-4">
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-100">
                  <Printer className="h-4 w-4" /> Cetak / simpan sebagai PDF
                </button>
                {sample.hasAccount ? (
                  <p className="flex items-start gap-2 text-sm text-stone-700"><FileText className="mt-0.5 h-4 w-4 shrink-0" /> Laporan ini otomatis masuk ke riwayat akun pasien.</p>
                ) : (
                  <div className="space-y-2 rounded-xl bg-stone-50 p-4 text-sm">
                    <p className="text-stone-700">Pasien ini tidak punya akun. Serahkan PDF langsung; setelah itu tidak ada riwayat untuk pasien. Bila pasien kemudian mendaftar, buat kode tautan dan berikan langsung ke pasien.</p>
                    {linkCode ? (
                      <p className="flex flex-wrap items-center gap-2">
                        <Link2 className="h-4 w-4" />
                        <span className="rounded-md bg-white px-3 py-1.5 font-mono text-base font-bold tracking-[0.25em] ring-1 ring-stone-300">{linkCode}</span>
                        <span className="text-xs text-stone-500">Pasien memasukkannya di akunnya. Sekali pakai; lama berlaku belum ditetapkan.</span>
                      </p>
                    ) : (
                      <button type="button" onClick={() => setLinkCode(randomCode())} className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-800">
                        <Link2 className="h-4 w-4" /> Buat kode tautan akun
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <h2 className="mb-4 text-base font-bold text-stone-900">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <dt className="text-stone-500">{label}</dt>
      <dd className="text-stone-800">{value.trim() || <span className="text-stone-400">tidak diisi</span>}</dd>
    </div>
  );
}

function Required() {
  return <span className="text-rose-700" aria-label="wajib">*</span>;
}
