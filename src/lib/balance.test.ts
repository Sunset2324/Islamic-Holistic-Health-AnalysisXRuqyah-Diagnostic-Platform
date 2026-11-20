import { describe, expect, it } from 'vitest';
import { computeHeatColdBalance } from '@/lib/balance';
import { computeAssessment } from '@/lib/Hhs';
import { answersFromSums, type PillarSums } from '@/lib/test-helpers';

const balanceOf = (sums: PillarSums) => computeHeatColdBalance(computeAssessment(answersFromSums(sums)));

describe('computeHeatColdBalance', () => {
  it('null bila jawaban belum lengkap', () => {
    expect(computeHeatColdBalance(computeAssessment({}))).toBeNull();
  });

  it('seimbang 50:50 bila panas dan dingin sama', () => {
    const result = balanceOf({ hidup: 12, makan: 9, pikir: 9, faktorx: 12 });
    expect(result).toMatchObject({ heatPercent: 50, coldPercent: 50, tilt: 'seimbang', label: 'Seimbang' });
    expect(result!.heat).toBe(result!.cold);
  });

  it('semua skor 1 dianggap seimbang (tidak membagi nol)', () => {
    expect(balanceOf({ hidup: 3, makan: 3, pikir: 3, faktorx: 3 })).toMatchObject({ heat: 0, cold: 0, heatPercent: 50, tilt: 'seimbang' });
  });

  it('Faktor X berbobot sama dengan pilar lain di neraca (bukan 10%)', () => {
    // PL 100, PM 100, PP 100, FX 0 => panas 100, dingin 50 => 67:33.
    const result = balanceOf({ hidup: 15, makan: 15, pikir: 15, faktorx: 3 });
    expect(result).toMatchObject({ heat: 100, cold: 50, heatPercent: 67, coldPercent: 33, tilt: 'panas', strong: true, label: 'Condong panas' });
  });

  it('condong dingin bila tubuh tertinggal dari jiwa', () => {
    // panas: (9-3)+(9-3)=12 poin, dingin: 12+12=24 poin => 33:67.
    expect(balanceOf({ hidup: 9, makan: 9, pikir: 15, faktorx: 15 })).toMatchObject({ heat: 50, cold: 100, heatPercent: 33, tilt: 'dingin', label: 'Condong dingin' });
  });

  it('sedikit condong bila sisi dominan tidak lebih dari 60%', () => {
    // panas (11-3)+(12-3)=17 poin, dingin (10-3)+(12-3)=16 poin => 17/33 = 51,5% => 52:48.
    expect(balanceOf({ hidup: 11, makan: 12, pikir: 10, faktorx: 12 })).toMatchObject({ heatPercent: 52, tilt: 'panas', strong: false, label: 'Sedikit condong panas' });
  });
});
