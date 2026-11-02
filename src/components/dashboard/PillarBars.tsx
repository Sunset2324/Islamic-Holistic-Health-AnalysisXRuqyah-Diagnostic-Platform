import { Activity, Brain, Sparkles, Utensils, type LucideIcon } from 'lucide-react';
import { PILLARS, type PillarId } from '@/data/pillars';
import { DROP_THRESHOLD, type PillarScores } from '@/lib/scoring';

interface PillarBarsProps {
  pillarScores: PillarScores;
  imbalance: boolean;
  gap: number;
}

const PILLAR_ICONS: Record<PillarId, LucideIcon> = {
  makan: Utensils,
  hidup: Activity,
  pikir: Brain,
  spiritual: Sparkles,
};

export default function PillarBars({ pillarScores, imbalance, gap }: PillarBarsProps) {
  return (
    <div className="space-y-6">
      {PILLARS.map((pillar) => {
        const score = pillarScores[pillar.id];
        const Icon = PILLAR_ICONS[pillar.id];
        const weak = score < DROP_THRESHOLD;
        return (
          <div key={pillar.id} className="space-y-2">
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
                <span className="w-12 text-right text-base font-bold tabular-nums text-stone-900">{score}%</span>
              </div>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-stone-200">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-out ${weak ? 'bg-amber-500' : 'bg-teal-600'}`}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        );
      })}

      {imbalance && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm leading-[1.5] text-amber-900 ring-1 ring-amber-200">
          Ada selisih {gap} poin antara pilar tertinggi dan terendah. Ketidakseimbangan yang cukup besar ini layak
          mendapat perhatian lebih dalam beberapa minggu ke depan.
        </p>
      )}
    </div>
  );
}
