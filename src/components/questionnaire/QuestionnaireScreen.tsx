import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { PILLARS } from '@/data/pillars';
import { ANSWER_OPTIONS, QUESTIONS, QUESTIONS_PER_PAGE } from '@/data/questions';
import type { Answers } from '@/lib/scoring';

interface QuestionnaireScreenProps {
  answers: Answers;
  onAnswer: (questionId: number, value: number) => void;
  onComplete: () => void;
  onBack: () => void;
}

const TOTAL_PAGES = Math.ceil(QUESTIONS.length / QUESTIONS_PER_PAGE);

export default function QuestionnaireScreen({ answers, onAnswer, onComplete, onBack }: QuestionnaireScreenProps) {
  const [page, setPage] = useState(0);

  const pageQuestions = QUESTIONS.slice(page * QUESTIONS_PER_PAGE, (page + 1) * QUESTIONS_PER_PAGE);
  const answeredCount = QUESTIONS.filter((question) => answers[question.id] !== undefined).length;
  const progress = Math.round((answeredCount / QUESTIONS.length) * 100);
  const pageComplete = pageQuestions.every((question) => answers[question.id] !== undefined);
  const isLastPage = page === TOTAL_PAGES - 1;
  const sectionLabel = PILLARS.find((pillar) => pillar.id === pageQuestions[0].pillar)?.label ?? '';

  function handleNext() {
    if (!pageComplete) return;
    if (isLastPage) {
      onComplete();
      return;
    }
    setPage((current) => current + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleBack() {
    if (page === 0) {
      onBack();
      return;
    }
    setPage((current) => current - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-stone-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {page === 0 ? 'Data diri' : 'Sebelumnya'}
          </button>
          <p className="text-sm font-semibold text-stone-700">
            {answeredCount} / {QUESTIONS.length} terjawab
          </p>
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-teal-600 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <div key={page} className="animate-fade-up mt-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
            {sectionLabel} · Halaman {page + 1} dari {TOTAL_PAGES}
          </p>
          <p className="mt-2 text-sm text-stone-500">Pilih jawaban yang paling sesuai dengan kondisi Anda belakangan ini.</p>

          <ol className="mt-8 space-y-8">
            {pageQuestions.map((question, index) => (
              <li key={question.id} className="space-y-4">
                <p className="text-base font-semibold leading-[1.5] text-stone-900">
                  <span className="mr-2 text-stone-400">{page * QUESTIONS_PER_PAGE + index + 1}.</span>
                  {question.text}
                </p>
                <div role="radiogroup" aria-label={question.text} className="grid grid-cols-5 gap-2">
                  {ANSWER_OPTIONS.map((option) => {
                    const selected = answers[question.id] === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onAnswer(question.id, option.value)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-center text-xs font-medium transition sm:text-sm ${
                          selected
                            ? 'border-teal-700 bg-teal-700 text-white shadow-md shadow-teal-900/10'
                            : 'border-stone-300 bg-white text-stone-700 hover:border-teal-400 hover:bg-teal-50'
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                            selected ? 'bg-white text-teal-800' : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {selected ? <Check className="h-3 w-3" /> : option.value}
                        </span>
                        <span className="leading-tight">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-12 flex items-center justify-between gap-4 border-t border-stone-200 pt-6">
          <p className="text-xs text-stone-500">
            {pageComplete ? 'Halaman ini sudah lengkap.' : 'Jawab semua pertanyaan di halaman ini untuk lanjut.'}
          </p>
          <button
            type="button"
            onClick={handleNext}
            disabled={!pageComplete}
            className="group inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-900/10 transition hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-600 disabled:shadow-none"
          >
            {isLastPage ? 'Lihat hasil' : 'Lanjut'}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
