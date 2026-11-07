import { Activity, Brain, Sparkles, Utensils, type LucideIcon } from 'lucide-react';
import { INDICATORS, MICRO_TAG_MAX_SCORE } from '@/data/indicators';
import { PILLARS, type PillarId } from '@/data/pillars';
import { isValidScore, type Answers, type Assessment } from '@/lib/Hhs';
import { DROP_THRESHOLD } from '@/lib/ruqyah';

interface PillarBarsProps {
  assessment: Assessment;
  answers: Answers;
  imbalance: boolean;
  gap: number | null;
}

const PILLAR_ICONS: Record<PillarId, LucideIcon> = {
  hidup: Activity,
  makan: Utensils,
  pikir: Brain,
  faktorx: Sparkles,
};

export default function PillarBars({ assessment, answers, imbalance, gap }: PillarBarsProps) {
  return (
    <div className="space-y-8">
      {PILLARS.map((pillar) => {
        const result = assessment.pillars[pillar.id];
        const Icon = PILLAR_ICONS[pillar.id];
        const score = result.display;
        const weak = result.score100 !== null && result.score100 < DROP_THRESHOLD;
        const indicators = INDICATORS.filter((indicator) => indicator.pillar === pillar.id);
        return (
          <div key={pillar.id} className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-stone-900">
                    {pillar.label} <span className="font-normal text-stone-500">({pillar.weight}%)</span>
                  </p>
                  <p className="text-xs text-stone-500">{pillar.focus}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {weak && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                    Perlu perhatian
                  </span>
                )}
                <span className="w-16 text-right text-base font-bold tabular-nums text-stone-900">
                  {score === null ? 'Belum lengkap' : score}
                </span>
              </div>
            </div>

            <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
              {score !== null && (
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${weak ? 'bg-amber-500' : 'bg-teal-600'}`}
                  style={{ width: `${score}%` }}
                />
              )}
            </div>

            <ul className="space-y-1.5 pl-12">
              {indicators.map((indicator) => {
                const value = answers[indicator.id];
                const valid = isValidScore(value);
                const low = valid && value <= MICRO_TAG_MAX_SCORE;
                return (
                  <li key={indicator.id} className="flex items-baseline justify-between gap-4 text-xs">
                    <span className={low ? 'font-semibold text-amber-900' : 'text-stone-600'}>
                      <span className="mr-1.5 text-stone-400">{indicator.id}</span>
                      {indicator.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 font-semibold tabular-nums ${
                        low ? 'bg-amber-100 text-amber-900' : valid ? 'bg-stone-100 text-stone-700' : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {valid ? `${value}/5` : 'tidak dijawab'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {imbalance && gap !== null && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm leading-[1.5] text-amber-900 ring-1 ring-amber-200">
          Ada selisih {Math.round(gap)} poin antara pilar tertinggi dan terendah. Ketidakseimbangan yang cukup besar ini
          layak dibahas bersama konsultan.
        </p>
      )}
      {assessment.complete ? null : (
        <p className="text-xs text-stone-500">Skor pilar hanya ditampilkan bila ketiga indikatornya sudah dijawab.</p>
      )}
    </div>
  );
}