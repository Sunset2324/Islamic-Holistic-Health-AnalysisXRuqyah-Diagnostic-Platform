import { ClipboardList, Leaf, RotateCcw } from 'lucide-react';
import ConditionDetail from '@/components/dashboard/ConditionDetail';
import ConsultationAdviceCard from '@/components/dashboard/ConsultationAdviceCard';
import PillarBars from '@/components/dashboard/PillarBars';
import RuqyahAlertCard from '@/components/dashboard/RuqyahAlertCard';
import ScoreRing from '@/components/dashboard/ScoreRing';
import { ALGORITHM_VERSION, ASSESSMENT_PERIOD_LABEL, QUESTIONNAIRE_VERSION, SHOW_RUQYAH_TO_PATIENT } from '@/config';
import { RUQYAH_CONDITIONS } from '@/data/conditions';
import { INDICATORS, INDICATOR_BY_ID } from '@/data/indicators';
import { concerningTags, lowIndicators, sanitizeTagSelections, type Answers, type Assessment, type TagSelections } from '@/lib/Hhs';
import type { RuqyahAssessment } from '@/lib/ruqyah';
import type { PatientIntake } from '@/types/intake';

interface ResultDashboardProps {
  patient: PatientIntake;
  assessment: Assessment;
  ruqyah: RuqyahAssessment;
  answers: Answers;
  tagSelections: TagSelections;
  assessmentDate: Date;
  onRestart: () => void;
  /** Kembali mengisi indikator tertentu (indeks 0-11). */
  onCompleteAnswers: (indicatorIndex: number) => void;
}

const dateFormat = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' });

export default function ResultDashboard({
  patient,
  assessment,
  ruqyah,
  answers,
  tagSelections,
  assessmentDate,
  onRestart,
  onCompleteAnswers,
}: ResultDashboardProps) {
  const greetingName = patient.name || 'Anda';
  const tags = sanitizeTagSelections(answers, tagSelections);
  const concerning = concerningTags(answers, tags);
  const low = lowIndicators(answers);
  const primary = ruqyah.suggestions[0];
  const showDetail = SHOW_RUQYAH_TO_PATIENT && primary && primary.strength !== 'partial';
  const firstUnanswered = assessment.unanswered[0];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-white">
              <Leaf className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold tracking-tight text-stone-900">Holistik Islami</span>
          </div>
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <RotateCcw className="h-4 w-4" />
            Analisis ulang
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div className="animate-fade-up space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Hasil sementara</p>
          <h1 className="text-3xl font-bold leading-[1.2] tracking-tight text-stone-900">
            Assalamu&apos;alaikum, {greetingName}.
          </h1>
          <p className="max-w-2xl text-sm leading-[1.5] text-stone-600">
            Berikut gambaran kebiasaan Anda selama {ASSESSMENT_PERIOD_LABEL}. Gunakan sebagai bahan refleksi, lalu bahas
            bersama konsultan.
          </p>
          <p className="text-xs leading-[1.6] text-stone-500">
            Tanggal asesmen: {dateFormat.format(assessmentDate)} · Periode penilaian: {ASSESSMENT_PERIOD_LABEL} · Kuesioner:{' '}
            {QUESTIONNAIRE_VERSION} · Algoritma: v{ALGORITHM_VERSION}
          </p>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <ConsultationAdviceCard concerning={concerning} />
        </div>

        {assessment.complete && assessment.hhs100Display !== null && assessment.category !== null ? (
          <div className="animate-fade-up grid gap-6 lg:grid-cols-2" style={{ animationDelay: '100ms' }}>
            <section className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
              <ScoreRing score={assessment.hhs100Display} category={assessment.category} />
            </section>
            {SHOW_RUQYAH_TO_PATIENT && <RuqyahAlertCard ruqyah={ruqyah} answers={answers} />}
          </div>
        ) : (
          <section className="animate-fade-up rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-200" style={{ animationDelay: '100ms' }}>
            <h2 className="text-base font-bold text-amber-950">Penilaian belum lengkap</h2>
            <p className="mt-1 text-sm leading-[1.5] text-amber-900">
              Skor total belum dapat dihitung karena {assessment.unanswered.length} pertanyaan belum dijawab. Pertanyaan yang
              tidak dijawab tidak dianggap bernilai 1.
            </p>
            <ul className="mt-3 list-inside list-disc text-sm text-amber-900">
              {assessment.unanswered.map((id) => (
                <li key={id}>{INDICATOR_BY_ID[id].title}</li>
              ))}
            </ul>
            {firstUnanswered && (
              <button
                type="button"
                onClick={() => onCompleteAnswers(INDICATORS.findIndex((indicator) => indicator.id === firstUnanswered))}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800"
              >
                Lengkapi jawaban
              </button>
            )}
          </section>
        )}

        <section className="animate-fade-up rounded-3xl border border-stone-200 bg-white p-8 shadow-sm" style={{ animationDelay: '160ms' }}>
          <h2 className="text-lg font-bold text-stone-900">Empat pilar Anda</h2>
          <p className="mt-1 text-sm text-stone-600">
            Setiap pilar dinilai 0 sampai 100 dari rata-rata tiga indikatornya, lalu digabungkan dengan bobot 30-30-30-10.
          </p>
          <div className="mt-8">
            <PillarBars assessment={assessment} answers={answers} imbalance={ruqyah.imbalance} gap={ruqyah.gap} />
          </div>
        </section>

        {low.length > 0 && (
          <section className="animate-fade-up rounded-3xl border border-amber-200 bg-white p-8 shadow-sm" style={{ animationDelay: '200ms' }}>
            <h2 className="flex items-center gap-2 text-lg font-bold text-stone-900">
              <ClipboardList className="h-5 w-5 text-amber-700" />
              Indikator yang perlu perhatian
            </h2>
            <p className="mt-1 text-sm text-stone-600">Indikator berskor 1–2 tetap ditampilkan walaupun skor total baik.</p>
            <ul className="mt-6 space-y-5">
              {low.map(({ indicator, score }) => {
                const selection = tags[indicator.id];
                const labels = (selection?.tagIds ?? []).map(
                  (tagId) => indicator.microTags.find((tag) => tag.id === tagId)?.label ?? tagId
                );
                return (
                  <li key={indicator.id} className="rounded-2xl bg-stone-50 p-5">
                    <p className="text-sm font-bold text-stone-900">
                      {indicator.title} <span className="font-normal text-stone-500">· skor {score}/5</span>
                    </p>
                    <p className="mt-1 text-sm leading-[1.5] text-stone-700">{indicator.scoreDescriptions[score - 1]}</p>
                    {labels.length > 0 && (
                      <p className="mt-2 text-xs leading-[1.5] text-stone-600">Yang Anda rasakan: {labels.join('; ')}.</p>
                    )}
                    {selection?.otherNote && (
                      <p className="mt-1 text-xs leading-[1.5] text-stone-600">Catatan Anda: {selection.otherNote}</p>
                    )}
                    <p className="mt-3 text-sm leading-[1.5] text-teal-900">
                      {indicator.recommendation ?? 'Bahas area ini bersama konsultan agar langkah perbaikannya sesuai kondisi Anda.'}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {showDetail && <ConditionDetail condition={RUQYAH_CONDITIONS[primary.condition]} />}

        <aside className="rounded-2xl bg-amber-50 p-6 text-sm leading-[1.5] text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">Catatan penting</p>
          <p className="mt-2">
            Skor 100 bukan jaminan kesehatan dan hasil ini bukan diagnosis medis, psikologis, maupun spiritual. Saran
            ruqyah adalah bahan awal untuk dibahas bersama konsultan, bukan vonis. Setiap konsumsi herbal atau obat wajib
            didiskusikan dengan dokter, dan ruqyah sebaiknya dilakukan bersama ustadz atau pengruqyah yang kredibel.
          </p>
        </aside>
      </main>
    </div>
  );
}