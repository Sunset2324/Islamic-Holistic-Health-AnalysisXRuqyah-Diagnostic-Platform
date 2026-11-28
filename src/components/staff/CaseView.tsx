import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, Save, ShieldAlert } from 'lucide-react';
import HeatColdBalanceCard from '@/components/dashboard/HeatColdBalanceCard';
import PillarBars from '@/components/dashboard/PillarBars';
import RuqyahAlertCard from '@/components/dashboard/RuqyahAlertCard';
import ScoreRing from '@/components/dashboard/ScoreRing';
import { RUQYAH_CONDITIONS, type RuqyahConditionId } from '@/data/conditions';
import { INDICATORS } from '@/data/indicators';
import { PILLARS } from '@/data/pillars';
import { computeHeatColdBalance } from '@/lib/balance';
import { computeAssessment, concerningTags, sanitizeTagSelections } from '@/lib/Hhs';
import { buildPatientReport } from '@/lib/patientReport';
import { GENDER_LABELS, isGender } from '@/types/intake';
import { assessRuqyah } from '@/lib/ruqyah';
import { staffApi, staffErrorMessage, type ConsultationDetail, type Report, type StaffAccount } from '@/lib/staffApi';
import PatientPhotos from './PatientPhotos';
import PatientReport from './PatientReport';
import ReportShareActions from './ReportShareActions';
import { Field, GlassCard, Notice, Spinner, StatusChip } from './ui';
import { formatDateTime } from './format';

interface Props {
  id: string;
  account: StaffAccount;
  onBack: () => void;
  onAuthError: (err: unknown) => void;
}


export default function CaseView({ id, account, onBack, onAuthError }: Props) {
  const [data, setData] = useState<ConsultationDetail | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<'save' | 'finalize' | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    staffApi
      .consultation(id)
      .then((d) => {
        setData(d);
        setReport(d.report);
      })
      .catch((err) => {
        onAuthError(err);
        setError(staffErrorMessage(err));
      });
  }, [id, onAuthError]);

  const answers = useMemo(() => data?.answers ?? {}, [data]);
  const assessment = useMemo(() => computeAssessment(answers), [answers]);
  const ruqyah = useMemo(() => assessRuqyah(assessment), [assessment]);
  const balance = useMemo(() => computeHeatColdBalance(assessment), [assessment]);
  const tags = useMemo(() => sanitizeTagSelections(answers, data?.tagSelections ?? {}), [answers, data]);
  const concerning = useMemo(() => concerningTags(answers, tags), [answers, tags]);

  if (error && !data) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} />
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }
  if (!data || !report) return <Spinner label="Membuka laporan…" />;

  const readOnly = data.readOnly;
  const intake = data.intake;
  const update = (patch: Partial<Report>) => {
    setReport({ ...report, ...patch });
    setDirty(true);
    setNotice('');
  };
  const missing = [
    report.ruqyahConditions.length + report.pillars.length === 0 && 'penilaian potensi (centang minimal satu)',
    !report.ruqyahNotes.trim() && 'catatan penilaian potensi',
    !report.advice.trim() && 'saran konsultan untuk pasien',
    !report.psychologicalNotes.trim() && 'kondisi psikis',
    !report.physicalNotes.trim() && 'kondisi fisik',
  ].filter(Boolean) as string[];
  const toggle = <T extends string>(list: T[], value: T, on: boolean): T[] => (on ? [...list, value] : list.filter((v) => v !== value));

  async function save(): Promise<boolean> {
    if (!report) return false;
    setBusy('save');
    setError('');
    try {
      await staffApi.saveReport(id, report);
      setDirty(false);
      setNotice('Draf tersimpan.');
      return true;
    } catch (err) {
      onAuthError(err);
      setError(staffErrorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function finalize() {
    if (missing.length) return;
    if (!window.confirm('Finalkan laporan? Setelah final, laporan tidak bisa diubah lagi.')) return;
    if (dirty && !(await save())) return;
    setBusy('finalize');
    setError('');
    try {
      await staffApi.finalize(id);
      const fresh = await staffApi.consultation(id);
      setData(fresh);
      setReport(fresh.report);
      setNotice('Laporan final.');
    } catch (err) {
      onAuthError(err);
      setError(staffErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const patientReport = buildPatientReport(
    intake,
    report,
    data.consultant.displayName ?? data.consultant.email,
    data.finalizedAt ? new Date(data.finalizedAt) : new Date(),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <BackButton onBack={onBack} />
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold text-stone-900">
            {intake.name || 'Tanpa nama'}, {isGender(intake.gender) && <>{GENDER_LABELS[intake.gender]}, </>}
            {intake.age} tahun <StatusChip status={data.status} />
          </h1>
          <p className="text-sm text-stone-600">
            Konsultan: {data.consultant.displayName ?? data.consultant.email} · Dibuka {formatDateTime(data.createdAt)}
            {data.finalizedAt && <> · Final {formatDateTime(data.finalizedAt)}</>}
          </p>
        </div>
      </div>

      {account.role === 'admin' && (
        <Notice tone="info">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Eye className="h-4 w-4" /> Mode baca saja (admin).
          </span>{' '}
          Pembukaan laporan ini tercatat di log audit.
        </Notice>
      )}

      {concerning.length > 0 && (
        <div role="alert" className="glass flex gap-3 border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-950">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
          <div>
            <p className="font-semibold">Tag yang dipilih pasien perlu perhatian segera</p>
            <p className="mt-1">{concerning.map((tag) => tag.label).join('; ')}. Lakukan skrining keselamatan dan red flag sebelum lanjut.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <GlassCard title="Keluhan dan data pasien">
            <dl className="space-y-2 text-sm">
              <Row label="Keluhan utama" value={intake.mainComplaint} />
              <Row label="Durasi" value={intake.complaintDuration} />
              <Row label="Frekuensi" value={intake.complaintFrequency} />
              <Row label="Dampak" value={intake.complaintImpact} />
              <Row label="Riwayat medis" value={intake.medicalHistory} />
            </dl>
          </GlassCard>
          <PatientPhotos consultationId={id} images={data.images ?? []} onAuthError={onAuthError} />
          <GlassCard title="Hasil HHS (hitungan sistem)">
            {assessment.complete && assessment.hhs100Display !== null && assessment.category ? (
              <ScoreRing score={assessment.hhs100Display} category={assessment.category} />
            ) : (
              <p className="text-sm text-stone-600">Jawaban belum lengkap; total tidak dihitung.</p>
            )}
            <div className="mt-6">
              <PillarBars assessment={assessment} answers={answers} imbalance={ruqyah.imbalance} gap={ruqyah.gap} />
            </div>
            {balance && (
              <div className="mt-6 border-t border-stone-200 pt-6">
                <HeatColdBalanceCard balance={balance} audience="staff" />
              </div>
            )}
          </GlassCard>
          <GlassCard title="Micro-Tag yang dipilih pasien">
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
          </GlassCard>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Ajuan sistem, hanya untuk konsultan (tidak tampil ke pasien)</p>
            <RuqyahAlertCard ruqyah={ruqyah} answers={answers} />
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <GlassCard title="Laporan konsultan">
            <fieldset disabled={readOnly || busy !== null} className="space-y-4">
              <fieldset className="space-y-3 rounded-xl border border-white/80 bg-white/50 p-4">
                <legend className="px-1 text-sm font-semibold text-stone-800">
                  Penilaian potensi <span className="text-rose-700">*</span>{' '}
                  <span className="font-normal text-stone-500">(boleh lebih dari satu, minimal satu)</span>
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Potensi ruqyah</p>
                    {(Object.keys(RUQYAH_CONDITIONS) as RuqyahConditionId[]).map((cid) => (
                      <label key={cid} className="flex items-center gap-2 text-sm text-stone-800">
                        <input
                          type="checkbox"
                          checked={report.ruqyahConditions.includes(cid)}
                          onChange={(e) => update({ ruqyahConditions: toggle(report.ruqyahConditions, cid, e.target.checked) })}
                        />
                        {cid}. {RUQYAH_CONDITIONS[cid].name}
                      </label>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Pilar</p>
                    {PILLARS.map((p) => (
                      <label key={p.code} className="flex items-center gap-2 text-sm text-stone-800">
                        <input
                          type="checkbox"
                          checked={report.pillars.includes(p.code)}
                          onChange={(e) => update({ pillars: toggle(report.pillars, p.code, e.target.checked) })}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>
              <Field label="Catatan penilaian potensi" required>
                <textarea value={report.ruqyahNotes} maxLength={4000} onChange={(e) => update({ ruqyahNotes: e.target.value })} rows={3} className="input-glass" />
              </Field>
              <Field label="Saran konsultan untuk pasien" required>
                <textarea value={report.advice} maxLength={8000} onChange={(e) => update({ advice: e.target.value })} rows={4} className="input-glass" />
              </Field>
              <Field label="Kondisi psikis" required>
                <textarea value={report.psychologicalNotes} maxLength={4000} onChange={(e) => update({ psychologicalNotes: e.target.value })} rows={3} className="input-glass" />
              </Field>
              <Field label="Kondisi fisik" required>
                <textarea value={report.physicalNotes} maxLength={4000} onChange={(e) => update({ physicalNotes: e.target.value })} rows={3} className="input-glass" />
              </Field>
              <Field label="Catatan klinis (internal)">
                <textarea value={report.clinicalNotes} maxLength={8000} onChange={(e) => update({ clinicalNotes: e.target.value })} rows={3} className="input-glass" />
              </Field>
              <div className="space-y-2 rounded-xl border border-white/80 bg-white/50 p-4 text-sm">
                <p className="font-semibold text-stone-800">Yang ikut dilihat pasien (bawaan: tidak)</p>
                {(
                  [
                    ['shareRuqyah', 'Sertakan penilaian ruqyah'],
                    ['sharePillars', 'Sertakan penilaian pilar'],
                    ['sharePsychological', 'Sertakan kondisi psikis'],
                    ['sharePhysical', 'Sertakan kondisi fisik'],
                    ['shareClinicalNotes', 'Sertakan catatan klinis'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input type="checkbox" checked={report[key]} onChange={(e) => update({ [key]: e.target.checked })} /> {label}
                  </label>
                ))}
                <p className="text-xs text-stone-500">Catatan penilaian potensi ikut tampil bila penilaian ruqyah atau pilar disertakan.</p>
                <p className="text-xs text-stone-500">Hasil hitungan dan ajuan sistem tidak pernah ikut ke pasien.</p>
              </div>
            </fieldset>

            {error && (
              <div className="mt-4">
                <Notice tone="error">{error}</Notice>
              </div>
            )}
            {notice && !error && (
              <div className="mt-4">
                <Notice tone="success">{notice}</Notice>
              </div>
            )}

            {!readOnly && (
              <div className="mt-4 space-y-3">
                {missing.length > 0 && <p className="text-xs text-stone-600">Belum diisi untuk final: {missing.join(', ')}.</p>}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={save} disabled={busy !== null || !dirty} className="btn-glass">
                    <Save className="h-4 w-4" /> {busy === 'save' ? 'Menyimpan…' : dirty ? 'Simpan draf' : 'Tersimpan'}
                  </button>
                  <button type="button" onClick={finalize} disabled={busy !== null || missing.length > 0} className="btn-glossy flex-1">
                    <CheckCircle2 className="h-4 w-4" /> {busy === 'finalize' ? 'Memfinalkan…' : 'Finalkan laporan'}
                  </button>
                </div>
              </div>
            )}
            {data.status === 'final' && (
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4" /> Laporan final dan tidak bisa diubah.
              </p>
            )}
          </GlassCard>

          <GlassCard
            title={data.status === 'final' ? 'Laporan untuk pasien' : 'Pratinjau laporan untuk pasien'}
          >
            {data.status === 'final' ? (
              <div className="mb-4">
                <ReportShareActions data={patientReport} />
              </div>
            ) : (
              <p className="mb-4 text-xs text-stone-500">Tombol Download PDF dan WhatsApp muncul setelah laporan final.</p>
            )}
            <div className="rounded-xl border border-stone-200 bg-white p-6">
              <PatientReport data={patientReport} />
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-teal-800 hover:underline">
      <ArrowLeft className="h-4 w-4" /> Kembali ke daftar
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2">
      <dt className="text-stone-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-stone-800">{value.trim() || <span className="text-stone-400">tidak diisi</span>}</dd>
    </div>
  );
}
