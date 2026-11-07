import {
  INDICATORS,
  INDICATOR_BY_ID,
  CONCERNING_TAG_IDS,
  MAX_OTHER_NOTE_LENGTH,
  MICRO_TAG_MAX_SCORE,
  type Indicator,
  type IndicatorId,
} from '@/data/indicators';
import { PILLARS, type PillarId } from '@/data/pillars';

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;

/** Setiap pilar punya tepat tiga indikator (HHS bagian 1). */
export const INDICATORS_PER_PILLAR = 3;

/** Jawaban per indikator. null = ditandai tidak dijawab, undefined = belum diisi. Keduanya dihitung belum dijawab. */
export type Answers = Partial<Record<IndicatorId, number | null>>;

export interface TagSelection {
  tagIds: string[];
  /** Keterangan untuk tag OTHER, maksimal 250 karakter. */
  otherNote: string;
}
export type TagSelections = Partial<Record<IndicatorId, TagSelection>>;

export interface HhsCategoryRule {
  minDisplayScore: number;
  label: string;
}

// Sumber: HHS bagian 4. Batas ini rancangan awal dan belum tervalidasi.
export const HHS_CATEGORIES: HhsCategoryRule[] = [
  { minDisplayScore: 85, label: 'Kondisi kebiasaan sangat baik' },
  { minDisplayScore: 70, label: 'Kondisi kebiasaan baik' },
  { minDisplayScore: 55, label: 'Perlu perhatian' },
  { minDisplayScore: 40, label: 'Perlu evaluasi lebih lanjut' },
  { minDisplayScore: 0, label: 'Prioritas evaluasi' },
];

export function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_SCORE && value <= MAX_SCORE;
}

/** Kategori ditentukan dari nilai yang sudah dibulatkan untuk tampilan (keputusan produk). */
export function categorize(displayScore: number): string {
  const rule = HHS_CATEGORIES.find((candidate) => displayScore >= candidate.minDisplayScore);
  return (rule ?? HHS_CATEGORIES[HHS_CATEGORIES.length - 1]).label;
}

/** Skor pilar 0-100 dari jumlah tiga indikator: ((rata-rata - 1) / 4) x 100. */
export function percentFromSum(sum: number): number {
  return ((sum - INDICATORS_PER_PILLAR) * 25) / INDICATORS_PER_PILLAR;
}

export interface PillarResult {
  id: PillarId;
  answered: number;
  complete: boolean;
  /** Jumlah skor tiga indikator; null bila pilar belum lengkap. */
  sum: number | null;
  /** Rata-rata skala 1-5; null bila belum lengkap. */
  mean: number | null;
  /** Skor 0-100 presisi penuh; null bila belum lengkap. */
  score100: number | null;
  /** Skor 0-100 dibulatkan untuk tampilan. */
  display: number | null;
}

export interface Assessment {
  complete: boolean;
  unanswered: IndicatorId[];
  pillars: Record<PillarId, PillarResult>;
  /** HHS skala 1-5; null bila belum lengkap. */
  hhs: number | null;
  /** HHS100 presisi penuh; null bila belum lengkap. */
  hhs100: number | null;
  /** HHS100 dibulatkan untuk tampilan; null bila belum lengkap. */
  hhs100Display: number | null;
  category: string | null;
}

export function computeAssessment(answers: Answers): Assessment {
  const unanswered: IndicatorId[] = [];
  const pillars = {} as Record<PillarId, PillarResult>;

  for (const pillar of PILLARS) {
    const ids = INDICATORS.filter((indicator) => indicator.pillar === pillar.id).map((indicator) => indicator.id);
    let sum = 0;
    let answered = 0;
    for (const id of ids) {
      const value = answers[id];
      if (isValidScore(value)) {
        sum += value;
        answered += 1;
      } else {
        unanswered.push(id);
      }
    }
    const complete = answered === INDICATORS_PER_PILLAR;
    const score100 = complete ? percentFromSum(sum) : null;
    pillars[pillar.id] = {
      id: pillar.id,
      answered,
      complete,
      sum: complete ? sum : null,
      mean: complete ? sum / INDICATORS_PER_PILLAR : null,
      score100,
      display: score100 === null ? null : Math.round(score100),
    };
  }

  const complete = unanswered.length === 0;
  if (!complete) {
    return { complete, unanswered, pillars, hhs: null, hhs100: null, hhs100Display: null, category: null };
  }

  // HHS100 = sum(bobot x (jumlah - 3)) / 12. Dihitung dengan bilangan bulat dulu agar
  // pembulatan di titik .5 tidak terpengaruh galat floating point.
  const weightedTotal = PILLARS.reduce((total, pillar) => total + pillar.weight * ((pillars[pillar.id].sum ?? 0) - INDICATORS_PER_PILLAR), 0);
  const hhs100 = weightedTotal / 12;
  const hhs100Display = Math.round(hhs100);

  return {
    complete,
    unanswered,
    pillars,
    hhs: hhs100 / 25 + 1,
    hhs100,
    hhs100Display,
    category: categorize(hhs100Display),
  };
}

export interface LowIndicator {
  indicator: Indicator;
  score: number;
}

/** Indikator berskor 1-2. Harus tetap terlihat meskipun skor total tinggi (HHS bagian 4). */
export function lowIndicators(answers: Answers): LowIndicator[] {
  return INDICATORS.flatMap((indicator) => {
    const score = answers[indicator.id];
    return isValidScore(score) && score <= MICRO_TAG_MAX_SCORE ? [{ indicator, score }] : [];
  });
}

/**
 * Menerapkan aturan Micro-Tags HHS: hanya untuk skor 1-2, ID tag harus dikenal,
 * keterangan OTHER maksimal 250 karakter dan hanya disimpan bila tag OTHER dipilih.
 */
export function sanitizeTagSelections(answers: Answers, selections: TagSelections): TagSelections {
  const clean: TagSelections = {};
  for (const indicator of INDICATORS) {
    const score = answers[indicator.id];
    const selection = selections[indicator.id];
    if (!selection || !isValidScore(score) || score > MICRO_TAG_MAX_SCORE) continue;

    const known = new Set(indicator.microTags.map((tag) => tag.id));
    const tagIds = [...new Set(selection.tagIds)].filter((id) => known.has(id));
    if (tagIds.length === 0) continue;

    const otherSelected = indicator.microTags.some((tag) => tag.isOther && tagIds.includes(tag.id));
    clean[indicator.id] = {
      tagIds,
      otherNote: otherSelected ? selection.otherNote.trim().slice(0, MAX_OTHER_NOTE_LENGTH) : '',
    };
  }
  return clean;
}

export interface ConcerningTag {
  indicatorId: IndicatorId;
  tagId: string;
  label: string;
}

/** Tag terpilih yang membuat anjuran konsultasi lebih tegas. */
export function concerningTags(answers: Answers, selections: TagSelections): ConcerningTag[] {
  const clean = sanitizeTagSelections(answers, selections);
  return Object.entries(clean).flatMap(([indicatorId, selection]) =>
    (selection?.tagIds ?? [])
      .filter((tagId) => CONCERNING_TAG_IDS.includes(tagId))
      .map((tagId) => ({
        indicatorId: indicatorId as IndicatorId,
        tagId,
        label: INDICATOR_BY_ID[indicatorId as IndicatorId].microTags.find((tag) => tag.id === tagId)?.label ?? tagId,
      }))
  );
}