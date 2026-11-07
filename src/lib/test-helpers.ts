import { INDICATORS, type IndicatorId } from '@/data/indicators';
import type { PillarId } from '@/data/pillars';
import type { Answers } from '@/lib/Hhs';

/** Membagi jumlah 3..15 menjadi tiga skor 1..5 yang valid. Hanya untuk test. */
export function splitSum(sum: number): [number, number, number] {
  if (!Number.isInteger(sum) || sum < 3 || sum > 15) throw new Error(`Jumlah tiga indikator harus 3-15, bukan ${sum}`);
  const base = Math.floor(sum / 3);
  const extra = sum - base * 3;
  return [base + (extra > 0 ? 1 : 0), base + (extra > 1 ? 1 : 0), base];
}

export type PillarSums = Record<PillarId, number>;

/** Membuat jawaban lengkap dari jumlah skor tiap pilar. Hanya untuk test. */
export function answersFromSums(sums: PillarSums): Answers {
  const answers: Answers = {};
  const pillars = Object.keys(sums) as PillarId[];
  for (const pillar of pillars) {
    const scores = splitSum(sums[pillar]);
    INDICATORS.filter((indicator) => indicator.pillar === pillar).forEach((indicator, index) => {
      answers[indicator.id as IndicatorId] = scores[index];
    });
  }
  return answers;
}