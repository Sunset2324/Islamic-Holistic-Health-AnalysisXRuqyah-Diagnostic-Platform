import { describe, expect, it } from 'vitest';
import { INDICATORS } from '@/data/indicators';
import {
  HHS_CATEGORIES,
  categorize,
  computeAssessment,
  concerningTags,
  lowIndicators,
  percentFromSum,
  sanitizeTagSelections,
  type Answers,
} from '@/lib/hhs';
import { answersFromSums } from '@/lib/test-helpers';

const allScores = (score: number): Answers => Object.fromEntries(INDICATORS.map((indicator) => [indicator.id, score]));

describe('computeAssessment', () => {
  it('menghasilkan 65,0 untuk contoh hitung di HHS halaman 9', () => {
    // PL 3,67 (jumlah 11), PM 4,00 (12), PP 3,00 (9), FX 4,00 (12)
    const result = computeAssessment(answersFromSums({ hidup: 11, makan: 12, pikir: 9, faktorx: 12 }));
    expect(result.complete).toBe(true);
    expect(result.hhs100).toBe(65);
    expect(result.hhs).toBeCloseTo(3.6, 10);
    expect(result.hhs100Display).toBe(65);
    expect(result.category).toBe('Perlu perhatian');
  });

  it('menghasilkan 100, 50, dan 0 untuk semua skor 5, 3, dan 1', () => {
    expect(computeAssessment(allScores(5)).hhs100).toBe(100);
    expect(computeAssessment(allScores(3)).hhs100).toBe(50);
    expect(computeAssessment(allScores(1)).hhs100).toBe(0);
    expect(computeAssessment(allScores(5)).hhs).toBe(5);
    expect(computeAssessment(allScores(1)).hhs).toBe(1);
    expect(computeAssessment(allScores(5)).category).toBe('Kondisi kebiasaan sangat baik');
    expect(computeAssessment(allScores(1)).category).toBe('Prioritas evaluasi');
  });

  it('menerapkan bobot 30/30/30/10 pada rata-rata pilar', () => {
    // Hanya Faktor X yang 1, sisanya 5 => 100 - 10 = 90.
    expect(computeAssessment(answersFromSums({ hidup: 15, makan: 15, pikir: 15, faktorx: 3 })).hhs100).toBe(90);
    // Hanya Pola Pikir yang 1, sisanya 5 => 100 - 30 = 70.
    expect(computeAssessment(answersFromSums({ hidup: 15, makan: 15, pikir: 3, faktorx: 15 })).hhs100).toBe(70);
  });

  it('tidak menghitung total bila ada indikator kosong dan tidak menganggap kosong sebagai skor 1', () => {
    const answers = allScores(5);
    answers['FX-01'] = null;
    const result = computeAssessment(answers);
    expect(result.complete).toBe(false);
    expect(result.unanswered).toEqual(['FX-01']);
    expect(result.hhs).toBeNull();
    expect(result.hhs100).toBeNull();
    expect(result.hhs100Display).toBeNull();
    expect(result.category).toBeNull();
    // Pilar lain tetap dihitung; pilar yang kurang satu indikator tidak.
    expect(result.pillars.hidup.score100).toBe(100);
    expect(result.pillars.faktorx.score100).toBeNull();
  });

  it('menganggap indikator yang belum diisi (undefined) sebagai belum dijawab', () => {
    const result = computeAssessment({});
    expect(result.complete).toBe(false);
    expect(result.unanswered).toHaveLength(12);
  });

  it('menolak nilai di luar bilangan bulat 1-5', () => {
    for (const bad of [0, 6, 2.5, Number.NaN, -1]) {
      const answers = allScores(4);
      answers['PL-01'] = bad;
      expect(computeAssessment(answers).complete).toBe(false);
    }
  });

  it('memberi pilar skor 0-100 dari jumlah tiga indikator', () => {
    expect(percentFromSum(3)).toBe(0);
    expect(percentFromSum(9)).toBe(50);
    expect(percentFromSum(15)).toBe(100);
    expect(percentFromSum(7)).toBeCloseTo(33.3333, 3);
  });

  it('kategori dari nilai dibulatkan sama dengan dari nilai mentah untuk seluruh 28.561 kombinasi jumlah pilar', () => {
    const range = Array.from({ length: 13 }, (_, index) => index + 3);
    let checked = 0;
    for (const hidup of range) {
      for (const makan of range) {
        for (const pikir of range) {
          for (const faktorx of range) {
            const result = computeAssessment(answersFromSums({ hidup, makan, pikir, faktorx }));
            const raw = result.hhs100 as number;
            const rawLabel = HHS_CATEGORIES.find((rule) => raw >= rule.minDisplayScore)!.label;
            expect(result.category, `${hidup}/${makan}/${pikir}/${faktorx}`).toBe(rawLabel);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(28561);
  });
});

describe('categorize', () => {
  it.each([
    [100, 'Kondisi kebiasaan sangat baik'],
    [85, 'Kondisi kebiasaan sangat baik'],
    [84, 'Kondisi kebiasaan baik'],
    [70, 'Kondisi kebiasaan baik'],
    [69, 'Perlu perhatian'],
    [55, 'Perlu perhatian'],
    [54, 'Perlu evaluasi lebih lanjut'],
    [40, 'Perlu evaluasi lebih lanjut'],
    [39, 'Prioritas evaluasi'],
    [0, 'Prioritas evaluasi'],
  ])('skor tampilan %i => %s', (score, label) => {
    expect(categorize(score)).toBe(label);
  });
});

describe('lowIndicators', () => {
  it('mengembalikan indikator berskor 1-2 dan mengabaikan yang kosong', () => {
    const answers = allScores(5);
    answers['PL-01'] = 1;
    answers['PP-03'] = 2;
    answers['FX-02'] = null;
    expect(lowIndicators(answers).map((item) => item.indicator.id)).toEqual(['PL-01', 'PP-03']);
  });
});

describe('sanitizeTagSelections', () => {
  const answers: Answers = { ...allScores(5), 'PL-01': 2, 'PP-01': 1, 'PM-01': 3 };

  it('hanya menyimpan tag untuk indikator berskor 1-2', () => {
    const clean = sanitizeTagSelections(answers, {
      'PL-01': { tagIds: ['NIGHTMARE'], otherNote: '' },
      'PM-01': { tagIds: ['FORGET_DRINKING'], otherNote: '' },
      'PL-02': { tagIds: ['LOW_MOVEMENT'], otherNote: '' },
    });
    expect(Object.keys(clean)).toEqual(['PL-01']);
  });

  it('membuang ID tag yang tidak dikenal dan duplikat', () => {
    const clean = sanitizeTagSelections(answers, {
      'PL-01': { tagIds: ['NIGHTMARE', 'NIGHTMARE', 'BUKAN_TAG', 'LOW_MOVEMENT'], otherNote: '' },
    });
    expect(clean['PL-01']?.tagIds).toEqual(['NIGHTMARE']);
  });

  it('memotong keterangan OTHER maksimal 250 karakter dan membuangnya bila OTHER tidak dipilih', () => {
    const long = 'x'.repeat(400);
    const withOther = sanitizeTagSelections(answers, { 'PL-01': { tagIds: ['SLEEP_OTHER'], otherNote: `  ${long}  ` } });
    expect(withOther['PL-01']?.otherNote).toHaveLength(250);
    const withoutOther = sanitizeTagSelections(answers, { 'PL-01': { tagIds: ['NIGHTMARE'], otherNote: 'catatan' } });
    expect(withoutOther['PL-01']?.otherNote).toBe('');
  });

  it('membuang indikator tanpa tag yang valid', () => {
    const clean = sanitizeTagSelections(answers, { 'PL-01': { tagIds: ['BUKAN_TAG'], otherNote: '' } });
    expect(clean).toEqual({});
  });
});

describe('concerningTags', () => {
  it('mendeteksi HOPELESSNESS dan UNSAFE_ENVIRONMENT hanya bila tag masih berlaku', () => {
    const answers: Answers = { ...allScores(5), 'PP-01': 1, 'FX-02': 2 };
    const found = concerningTags(answers, {
      'PP-01': { tagIds: ['HOPELESSNESS', 'LOW_INTEREST'], otherNote: '' },
      'FX-02': { tagIds: ['UNSAFE_ENVIRONMENT'], otherNote: '' },
    });
    expect(found.map((item) => item.tagId).sort()).toEqual(['HOPELESSNESS', 'UNSAFE_ENVIRONMENT']);

    // Skor naik ke 4 => tag tidak lagi ditampilkan sehingga tidak dihitung.
    const raised = concerningTags({ ...answers, 'PP-01': 4 }, { 'PP-01': { tagIds: ['HOPELESSNESS'], otherNote: '' } });
    expect(raised).toEqual([]);
  });
});