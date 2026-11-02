import { PILLARS, type PillarId, type PillarMeta } from '@/data/pillars';
import { QUESTIONS } from '@/data/questions';
import type { RuqyahConditionId } from '@/data/conditions';

export type Answers = Record<number, number>;
export type PillarScores = Record<PillarId, number>;

export interface ScreeningResult {
  holisticScore: number;
  holisticCategory: string;
  pillarScores: PillarScores;
  gap: number;
  imbalance: boolean;
  alarmActive: boolean;
  criticalSpiritual: boolean;
  droppedPillars: PillarMeta[];
  condition: RuqyahConditionId | null;
}

export const DROP_THRESHOLD = 40;
const GAP_THRESHOLD = 50;
const CRITICAL_SPIRITUAL_THRESHOLD = 30;
const MAX_ANSWER = 4;

const CONDITION_PILLAR_PAIRS: Record<Exclude<RuqyahConditionId, 'D'>, [PillarId, PillarId]> = {
  A: ['pikir', 'spiritual'],
  B: ['pikir', 'hidup'],
  C: ['makan', 'hidup'],
};

export function scorePillars(answers: Answers): PillarScores {
  const totals: Record<PillarId, { sum: number; count: number }> = {
    makan: { sum: 0, count: 0 },
    hidup: { sum: 0, count: 0 },
    pikir: { sum: 0, count: 0 },
    spiritual: { sum: 0, count: 0 },
  };

  for (const question of QUESTIONS) {
    totals[question.pillar].sum += answers[question.id];
    totals[question.pillar].count += 1;
  }

  return {
    makan: toPercent(totals.makan),
    hidup: toPercent(totals.hidup),
    pikir: toPercent(totals.pikir),
    spiritual: toPercent(totals.spiritual),
  };
}

function toPercent({ sum, count }: { sum: number; count: number }): number {
  return Math.round((sum / (count * MAX_ANSWER)) * 100);
}

export function computeHolisticScore(pillarScores: PillarScores): number {
  const weighted = PILLARS.reduce((total, pillar) => total + pillarScores[pillar.id] * pillar.weight, 0);
  return Math.round(weighted / 100);
}

export function categorizeHolisticScore(score: number): string {
  if (score >= 85) return 'Sangat Baik';
  if (score >= 75) return 'Baik';
  if (score >= 60) return 'Cukup Baik';
  if (score >= 40) return 'Perlu Perhatian';
  return 'Prioritas Evaluasi';
}

function selectCondition(
  pillarScores: PillarScores,
  droppedCount: number,
  criticalSpiritual: boolean
): RuqyahConditionId | null {
  if (droppedCount === 0) return null;
  if (criticalSpiritual || droppedCount === PILLARS.length) return 'D';

  const ranked = (Object.keys(CONDITION_PILLAR_PAIRS) as Exclude<RuqyahConditionId, 'D'>[])
    .map((id) => {
      const [first, second] = CONDITION_PILLAR_PAIRS[id];
      return { id, average: (pillarScores[first] + pillarScores[second]) / 2 };
    })
    .sort((a, b) => a.average - b.average);

  return ranked[0].id;
}

export function evaluateScreening(answers: Answers): ScreeningResult {
  const pillarScores = scorePillars(answers);
  const holisticScore = computeHolisticScore(pillarScores);

  const scores = PILLARS.map((pillar) => pillarScores[pillar.id]);
  const gap = Math.max(...scores) - Math.min(...scores);

  const droppedPillars = PILLARS.filter((pillar) => pillarScores[pillar.id] < DROP_THRESHOLD);
  const criticalSpiritual = pillarScores.spiritual < CRITICAL_SPIRITUAL_THRESHOLD;

  return {
    holisticScore,
    holisticCategory: categorizeHolisticScore(holisticScore),
    pillarScores,
    gap,
    imbalance: gap > GAP_THRESHOLD,
    alarmActive: droppedPillars.length > 0,
    criticalSpiritual,
    droppedPillars,
    condition: selectCondition(pillarScores, droppedPillars.length, criticalSpiritual),
  };
}
