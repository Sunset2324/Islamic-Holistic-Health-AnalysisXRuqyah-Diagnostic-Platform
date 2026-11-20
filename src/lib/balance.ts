import type { PillarId } from '@/data/pillars';
import { INDICATORS_PER_PILLAR, type Assessment } from '@/lib/Hhs';

/**
 * Neraca Panas–Dingin (model refleksi MyHerbalis, bukan rumus TCM/Thibbunnabawi klasik dan bukan diagnosis).
 *
 * - Panas = sisi tubuh: Pola Hidup (PL) + Pola Makan (PM).
 * - Dingin = sisi jiwa: Pola Pikir (PP) + Faktor X (FX).
 * - Di neraca ini keempat pilar berbobot SAMA (masing-masing 0-100). Bobot 30/30/30/10 tetap hanya untuk HHS.
 * - Kondisi ideal 50:50. Bila satu sisi lebih besar, artinya sisi lain sedang tertinggal.
 */
export const HEAT_PILLARS: PillarId[] = ['hidup', 'makan'];
export const COLD_PILLARS: PillarId[] = ['pikir', 'faktorx'];

/** Di atas batas ini (persen sisi dominan) neraca disebut "condong", di bawahnya "sedikit condong". */
export const STRONG_TILT_PERCENT = 60;

export type BalanceTilt = 'seimbang' | 'panas' | 'dingin';

export interface HeatColdBalance {
  /** Rata-rata skor 0-100 PL dan PM (presisi penuh). */
  heat: number;
  /** Rata-rata skor 0-100 PP dan FX (presisi penuh). */
  cold: number;
  /** Porsi panas dalam persen, dibulatkan; porsi dingin = 100 - heatPercent. */
  heatPercent: number;
  coldPercent: number;
  tilt: BalanceTilt;
  /** true bila sisi dominan lebih dari STRONG_TILT_PERCENT. */
  strong: boolean;
  label: string;
}

/** null bila jawaban belum lengkap (sama seperti skor HHS). */
export function computeHeatColdBalance(assessment: Assessment): HeatColdBalance | null {
  if (!assessment.complete) return null;
  // Poin bilangan bulat per pilar (jumlah - 3, rentang 0..12) agar persentase tidak terganggu galat floating point.
  const points = (ids: PillarId[]) => ids.reduce((total, id) => total + (assessment.pillars[id].sum ?? 0) - INDICATORS_PER_PILLAR, 0);
  const heatPoints = points(HEAT_PILLARS);
  const coldPoints = points(COLD_PILLARS);
  const total = heatPoints + coldPoints;
  // Semua skor 1: kedua sisi sama-sama 0, secara neraca dianggap seimbang (rendahnya skor sudah terlihat di HHS).
  const heatPercent = total === 0 ? 50 : Math.round((heatPoints * 100) / total);
  const coldPercent = 100 - heatPercent;
  const tilt: BalanceTilt = heatPercent === 50 ? 'seimbang' : heatPercent > 50 ? 'panas' : 'dingin';
  const strong = Math.max(heatPercent, coldPercent) > STRONG_TILT_PERCENT;
  const side = tilt === 'panas' ? 'panas' : 'dingin';
  const label = tilt === 'seimbang' ? 'Seimbang' : `${strong ? 'Condong' : 'Sedikit condong'} ${side}`;
  const toScore = (pointSum: number) => (pointSum * 25) / INDICATORS_PER_PILLAR / 2;
  return { heat: toScore(heatPoints), cold: toScore(coldPoints), heatPercent, coldPercent, tilt, strong, label };
}
