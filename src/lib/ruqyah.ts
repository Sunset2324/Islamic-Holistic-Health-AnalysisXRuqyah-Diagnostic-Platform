import type { RuqyahConditionId } from '@/data/conditions';
import { PILLARS, type PillarId } from '@/data/pillars';
import { INDICATORS_PER_PILLAR, percentFromSum, type Assessment } from '@/lib/Hhs';

// Ambang dari blueprint v1.1 (Mesin 2), dipetakan ke skala 1-5. Belum tervalidasi secara klinis.
export const DROP_THRESHOLD = 40;
export const FAKTORX_CRITICAL_THRESHOLD = 30;
export const GAP_THRESHOLD = 50;

type PairedConditionId = Exclude<RuqyahConditionId, 'D'>;

/** Pasangan pilar yang dominan turun untuk tiap kondisi (blueprint bagian 5.1). */
export const CONDITION_PAIRS: Record<PairedConditionId, [PillarId, PillarId]> = {
  A: ['pikir', 'faktorx'],
  B: ['pikir', 'hidup'],
  C: ['makan', 'hidup'],
};

export type SuggestionStrength =
  /** Kondisi D: Faktor X < 30 atau keempat pilar < 40. */
  | 'critical'
  /** Kedua pilar pasangan kondisi turun (< 40). */
  | 'strong'
  /** Hanya sebagian pilar pasangan yang turun. */
  | 'partial';

export interface RuqyahSuggestion {
  condition: RuqyahConditionId;
  strength: SuggestionStrength;
  /** Pilar yang turun dan terkait kondisi ini. */
  contributingPillars: PillarId[];
}

export interface RuqyahAssessment {
  /** False bila 12 indikator belum lengkap; saran tidak dihitung. */
  available: boolean;
  droppedPillars: PillarId[];
  criticalFaktorX: boolean;
  /** Selisih pilar tertinggi dan terendah (0-100); null bila belum lengkap. */
  gap: number | null;
  imbalance: boolean;
  /** Urut dari paling kuat. Kondisi seri ditampilkan semuanya. */
  suggestions: RuqyahSuggestion[];
}

const EMPTY: RuqyahAssessment = {
  available: false,
  droppedPillars: [],
  criticalFaktorX: false,
  gap: null,
  imbalance: false,
  suggestions: [],
};

export function assessRuqyah(assessment: Assessment): RuqyahAssessment {
  if (!assessment.complete) return EMPTY;

  const sums = Object.fromEntries(PILLARS.map((pillar) => [pillar.id, assessment.pillars[pillar.id].sum ?? 0])) as Record<PillarId, number>;
  const droppedPillars = PILLARS.filter((pillar) => percentFromSum(sums[pillar.id]) < DROP_THRESHOLD).map((pillar) => pillar.id);
  const criticalFaktorX = percentFromSum(sums.faktorx) < FAKTORX_CRITICAL_THRESHOLD;

  // Selisih dihitung dari jumlah bilangan bulat agar selisih tepat 50 tidak terbaca > 50 akibat galat floating point.
  const sumValues = Object.values(sums);
  const gap = ((Math.max(...sumValues) - Math.min(...sumValues)) * 25) / INDICATORS_PER_PILLAR;
  const imbalance = gap > GAP_THRESHOLD;

  const base = { available: true, droppedPillars, criticalFaktorX, gap, imbalance };

  if (droppedPillars.length === 0) return { ...base, suggestions: [] };

  if (criticalFaktorX || droppedPillars.length === PILLARS.length) {
    return { ...base, suggestions: [{ condition: 'D', strength: 'critical', contributingPillars: droppedPillars }] };
  }

  const pairs = (Object.keys(CONDITION_PAIRS) as PairedConditionId[]).map((condition) => {
    const [first, second] = CONDITION_PAIRS[condition];
    return {
      condition,
      pillars: [first, second] as PillarId[],
      pairSum: sums[first] + sums[second],
      dropped: [first, second].filter((pillar) => droppedPillars.includes(pillar)),
    };
  });

  const strong = pairs.filter((pair) => pair.dropped.length === 2);
  const chosen = strong.length > 0 ? strong : pairs.filter((pair) => pair.dropped.length === 1);
  const strength: SuggestionStrength = strong.length > 0 ? 'strong' : 'partial';

  // Urut dari rata-rata pasangan terendah. Seri tidak dipotong: semua kondisi seri tetap ditampilkan.
  const suggestions = [...chosen]
    .sort((a, b) => a.pairSum - b.pairSum)
    .map((pair) => ({ condition: pair.condition, strength, contributingPillars: pair.dropped }));

  return { ...base, suggestions };
}