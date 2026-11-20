import { EMERGENCY_NUMBER, ASSESSMENT_PERIOD_LABEL } from '@/config';
import { RUQYAH_CONDITIONS, type RuqyahConditionId } from '@/data/conditions';
import { PILLARS } from '@/data/pillars';
import { BALANCE_PATIENT_TEXT, type HeatColdBalance } from '@/lib/balance';
import { lowIndicators, type Answers, type Assessment } from '@/lib/Hhs';
import type { Report } from '@/lib/staffApi';
import type { PatientIntake } from '@/types/intake';

interface Props {
  intake: PatientIntake;
  answers: Answers;
  assessment: Assessment;
  balance: HeatColdBalance | null;
  report: Report;
  consultantName: string;
  date: Date;
}

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' });

/**
 * Laporan untuk pasien: dipakai sebagai pratinjau di layar DAN sebagai isi cetak/PDF (A4).
 * Hanya berisi yang boleh dilihat pasien: data yang ia isi sendiri, hasil HHS/neraca (sama dengan hasil sementaranya),
 * saran konsultan, dan bagian ruqyah/catatan klinis hanya bila konsultan mencentang "sertakan".
 * Ajuan ruqyah dari sistem TIDAK pernah ikut.
 */
export default function PatientReport({ intake, answers, assessment, balance, report, consultantName, date }: Props) {
  const low = lowIndicators(answers);
  const condition = report.ruqyahFinalCondition as RuqyahConditionId | null;
  const complaint: [string, string][] = (
    [
      ['Keluhan utama', intake.mainComplaint],
      ['Sejak kapan', intake.complaintDuration],
      ['Seberapa sering', intake.complaintFrequency],
      ['Dampak', intake.complaintImpact],
    ] as [string, string][]
  ).filter(([, value]) => value?.trim());

  return (
    <article className="report text-[13px] leading-[1.55] text-stone-800">
      <header className="report-block flex items-start justify-between gap-4 border-b-2 border-mint-600 pb-3">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-11 w-11 rounded-xl" />
          <div>
            <p className="text-base font-bold text-stone-900">MyHerbalis</p>
            <p className="text-xs text-stone-500">Laporan Konsultasi Kesehatan Holistik</p>
          </div>
        </div>
        <div className="text-right text-xs text-stone-600">
          <p>{dateFormat.format(date)}</p>
          <p>Konsultan: {consultantName}</p>
        </div>
      </header>

      <Section title="Data pasien">
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1">
          <dt className="text-stone-500">Nama</dt>
          <dd className="font-semibold text-stone-900">{intake.name || 'Pasien'}</dd>
          <dt className="text-stone-500">Usia</dt>
          <dd>{intake.age} tahun</dd>
          {complaint.map(([label, value]) => (
            <InfoRow key={label} label={label} value={value} />
          ))}
        </dl>
      </Section>

      <Section title="Ringkasan hasil kuesioner">
        <p className="mb-2 text-xs text-stone-500">Berdasarkan kebiasaan {ASSESSMENT_PERIOD_LABEL}.</p>
        {assessment.complete && assessment.hhs100Display !== null ? (
          <p className="mb-3">
            Skor Kesehatan Holistik: <strong className="text-lg text-stone-900">{assessment.hhs100Display}/100</strong>{' '}
            <span className="rounded-full bg-mint-100 px-2 py-0.5 text-xs font-semibold text-mint-900">{assessment.category}</span>
          </p>
        ) : (
          <p className="mb-3 text-stone-600">Skor total belum dihitung karena masih ada pertanyaan yang belum dijawab.</p>
        )}
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-stone-300 text-xs text-stone-500">
              <th className="py-1 font-semibold">Pilar</th>
              <th className="py-1 font-semibold">Fokus</th>
              <th className="py-1 text-right font-semibold">Skor</th>
            </tr>
          </thead>
          <tbody>
            {PILLARS.map((pillar) => {
              const score = assessment.pillars[pillar.id].display;
              return (
                <tr key={pillar.id} className="border-b border-stone-200 align-top">
                  <td className="py-1.5 pr-3 font-semibold text-stone-900">{pillar.label}</td>
                  <td className="py-1.5 pr-3 text-xs text-stone-600">{pillar.focus}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{score === null ? '–' : `${score}/100`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {balance && (
        <Section title="Neraca Panas–Dingin">
          <p>
            <strong>Panas (tubuh) {balance.heatPercent}%</strong> · <strong>Dingin (jiwa) {balance.coldPercent}%</strong> ·{' '}
            {balance.label} <span className="text-xs text-stone-500">(idealnya 50:50)</span>
          </p>
          <div className="my-2 flex h-3 overflow-hidden rounded-full border border-stone-300">
            <div className="report-heat h-full" style={{ width: `${balance.heatPercent}%` }} />
            <div className="report-cold h-full" style={{ width: `${balance.coldPercent}%` }} />
          </div>
          <p className="text-stone-700">{BALANCE_PATIENT_TEXT[balance.tilt]}</p>
        </Section>
      )}

      {low.length > 0 && (
        <Section title="Area yang perlu perhatian">
          <ul className="space-y-2">
            {low.map(({ indicator, score }) => (
              <li key={indicator.id} className="report-block">
                <p className="font-semibold text-stone-900">
                  {indicator.title} <span className="font-normal text-stone-500">· skor {score}/5</span>
                </p>
                <p className="text-stone-600">{indicator.scoreDescriptions[score - 1]}</p>
                {indicator.recommendation && <p className="text-stone-700">{indicator.recommendation}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Saran dari konsultan">
        <p className="whitespace-pre-wrap">{report.advice.trim() || <span className="text-stone-400">(belum diisi)</span>}</p>
      </Section>

      {report.shareRuqyah && condition && (
        <Section title="Penilaian ruqyah">
          <p className="font-semibold text-stone-900">{RUQYAH_CONDITIONS[condition].name}</p>
          {report.ruqyahNotes.trim() && <p className="mt-1 whitespace-pre-wrap">{report.ruqyahNotes.trim()}</p>}
        </Section>
      )}

      {report.shareClinicalNotes && report.clinicalNotes.trim() && (
        <Section title="Catatan klinis">
          <p className="whitespace-pre-wrap">{report.clinicalNotes.trim()}</p>
        </Section>
      )}

      <footer className="report-block mt-5 border-t border-stone-300 pt-3 text-[11px] leading-[1.5] text-stone-500">
        Laporan ini adalah panduan refleksi, bukan diagnosis medis, psikologis, maupun spiritual. Konsumsi herbal atau obat
        wajib didiskusikan dengan dokter. Dalam keadaan darurat hubungi {EMERGENCY_NUMBER} atau datang ke fasilitas
        kesehatan terdekat. · myherbalis.com
      </footer>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="report-block mt-5">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-mint-800">{title}</h2>
      {children}
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-stone-500">{label}</dt>
      <dd className="whitespace-pre-wrap">{value}</dd>
    </>
  );
}
