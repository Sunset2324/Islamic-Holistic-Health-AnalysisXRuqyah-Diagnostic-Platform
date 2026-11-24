import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, HeartHandshake } from 'lucide-react';
import { ASSESSMENT_PERIOD_LABEL } from '@/config';
import { INDICATORS, MAX_OTHER_NOTE_LENGTH, MICRO_TAG_MAX_SCORE, type IndicatorId } from '@/data/indicators';
import { PILLAR_BY_ID } from '@/data/pillars';
import type { Answers, TagSelection, TagSelections } from '@/lib/Hhs';

interface QuestionnaireScreenProps {
  answers: Answers;
  tagSelections: TagSelections;
  /** Indeks indikator pertama yang ditampilkan (0-11). */
  startIndex: number;
  /** value null = ditandai tidak dijawab. */
  onAnswer: (id: IndicatorId, value: number | null) => void;
  onTagsChange: (id: IndicatorId, selection: TagSelection) => void;
  onComplete: () => void;
  onBack: () => void;
}

const EMPTY_SELECTION: TagSelection = { tagIds: [], otherNote: '' };

// Turunan dari catatan HHS v1.0 untuk indikator tertentu.
const PATIENT_NOTES: Partial<Record<IndicatorId, string>> = {
  'FX-01': 'Pertanyaan ini bukan ukuran iman, kesalehan, atau nilai Anda di hadapan Allah. Anda boleh memilih untuk tidak menjawab.',
  'PP-01': 'Memilih jawaban yang menggambarkan kondisi sulit bukan berarti diagnosis. Jawaban ini hanya bahan diskusi dengan konsultan.',
};

export default function QuestionnaireScreen({
  answers,
  tagSelections,
  startIndex,
  onAnswer,
  onTagsChange,
  onComplete,
  onBack,
}: QuestionnaireScreenProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), INDICATORS.length - 1));

  const indicator = INDICATORS[index];
  const pillar = PILLAR_BY_ID[indicator.pillar];
  const answer = answers[indicator.id];
  const answeredCount = INDICATORS.filter((item) => answers[item.id] !== undefined).length;
  const progress = Math.round((answeredCount / INDICATORS.length) * 100);
  const isLast = index === INDICATORS.length - 1;
  const canContinue = answer !== undefined;
  const showTags = typeof answer === 'number' && answer <= MICRO_TAG_MAX_SCORE;
  const selection = tagSelections[indicator.id] ?? EMPTY_SELECTION;
  const otherSelected = indicator.microTags.some((tag) => tag.isOther && selection.tagIds.includes(tag.id));
  const patientNote = PATIENT_NOTES[indicator.id];

  function goTo(next: number) {
    setIndex(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleNext() {
    if (!canContinue) return;
    if (isLast) {
      onComplete();
      return;
    }
    goTo(index + 1);
  }

  function handleBack() {
    if (index === 0) {
      onBack();
      return;
    }
    goTo(index - 1);
  }

  function toggleTag(tagId: string) {
    const tagIds = selection.tagIds.includes(tagId)
      ? selection.tagIds.filter((id) => id !== tagId)
      : [...selection.tagIds, tagId];
    onTagsChange(indicator.id, { ...selection, tagIds });
  }

  return (
    <div className="patient-bg px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {index === 0 ? 'Data diri' : 'Sebelumnya'}
          </button>
          <p className="text-sm font-semibold text-stone-700">
            Pertanyaan {index + 1} dari {INDICATORS.length}
          </p>
        </div>

        <div
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-lavender-100"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Kemajuan pengisian"
        >
          <div className="h-full rounded-full bg-gradient-to-r from-mint-400 to-mint-600 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <div key={indicator.id} className="animate-fade-up mt-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-mint-700">
            {pillar.label} · {indicator.title}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Periode penilaian: {ASSESSMENT_PERIOD_LABEL} (7 hari sebelum hari ini)
          </p>
          <h1 className="mt-4 text-xl font-bold leading-[1.3] text-stone-900">{indicator.question}</h1>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lavender-50 px-3 py-1 text-xs font-medium text-lavender-800 ring-1 ring-lavender-200">
            <HeartHandshake className="h-3.5 w-3.5" aria-hidden /> Jawab apa adanya. Tidak ada jawaban yang salah.
          </p>
          {patientNote && <p className="mt-3 text-sm leading-[1.5] text-stone-600">{patientNote}</p>}

          <div role="radiogroup" aria-label={indicator.question} className="mt-6 space-y-3">
            {indicator.scoreDescriptions.map((description, position) => {
              const value = position + 1;
              const selected = answer === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onAnswer(indicator.id, value)}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left text-sm leading-[1.5] transition ${
                    selected
                      ? 'border-mint-500 bg-mint-50 text-mint-950 shadow-[0_6px_20px_-10px_rgba(34,136,106,0.6)] ring-2 ring-mint-200'
                      : 'border-lavender-100 bg-white/90 text-stone-800 hover:border-mint-300 hover:bg-mint-50/60'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      selected ? 'bg-mint-600 text-white' : 'bg-lavender-50 text-lavender-700'
                    }`}
                  >
                    {selected ? <Check className="h-3.5 w-3.5" /> : value}
                  </span>
                  <span>{description}</span>
                </button>
              );
            })}

            <button
              type="button"
              aria-pressed={answer === null}
              onClick={() => onAnswer(indicator.id, null)}
              className={`w-full rounded-2xl border border-dashed px-4 py-3 text-left text-sm transition ${
                answer === null
                  ? 'border-lavender-400 bg-lavender-100 text-lavender-950 ring-2 ring-lavender-200'
                  : 'border-lavender-300 bg-transparent text-lavender-800 hover:bg-lavender-50'
              }`}
            >
              Saya tidak ingin menjawab atau pertanyaan ini tidak relevan
            </button>
            {answer === null && (
              <p className="text-xs leading-[1.5] text-stone-500">
                Penilaian belum lengkap bila ada pertanyaan yang tidak dijawab, sehingga skor total belum dapat dihitung.
              </p>
            )}
          </div>

          {showTags && (
            <section className="animate-fade-up mt-8 soft-card p-5">
              <h2 className="text-sm font-bold text-stone-900">Apa yang paling Anda rasakan? (opsional)</h2>
              <p className="mt-1 text-xs text-stone-500">Boleh memilih lebih dari satu. Pilihan ini tidak mengubah skor.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {indicator.microTags.map((tag) => {
                  const selected = selection.tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleTag(tag.id)}
                      className={`rounded-full border px-3.5 py-2 text-xs font-medium transition ${
                        selected
                          ? 'border-lavender-400 bg-lavender-100 text-lavender-950'
                          : 'border-lavender-200 bg-white text-stone-700 hover:bg-lavender-50'
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
              {otherSelected && (
                <label className="mt-4 block space-y-2">
                  <span className="flex items-baseline justify-between gap-4">
                    <span className="text-xs font-medium text-stone-600">Keterangan tambahan (opsional)</span>
                    <span className="text-xs tabular-nums text-stone-500">
                      {selection.otherNote.length}/{MAX_OTHER_NOTE_LENGTH}
                    </span>
                  </span>
                  <textarea
                    value={selection.otherNote}
                    onChange={(event) =>
                      onTagsChange(indicator.id, { ...selection, otherNote: event.target.value.slice(0, MAX_OTHER_NOTE_LENGTH) })
                    }
                    maxLength={MAX_OTHER_NOTE_LENGTH}
                    rows={2}
                    className="input-soft resize-none"
                  />
                </label>
              )}
            </section>
          )}
        </div>

        <div className="mt-12 flex items-center justify-between gap-4 border-t border-lavender-100 pt-6">
          <p className="text-xs text-stone-500">
            {canContinue ? 'Siap lanjut.' : 'Pilih satu jawaban, atau pilih tidak ingin menjawab.'}
          </p>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canContinue}
            className="group btn-mint"
          >
            {isLast ? 'Lihat hasil sementara' : 'Lanjut'}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}