import { describe, expect, it } from 'vitest';
import { computeAssessment } from '@/lib/Hhs';
import { assessRuqyah, type RuqyahAssessment } from '@/lib/ruqyah';
import { answersFromSums, type PillarSums } from '@/lib/test-helpers';

const base: PillarSums = { hidup: 15, makan: 15, pikir: 15, faktorx: 15 };
const run = (overrides: Partial<PillarSums>): RuqyahAssessment =>
  assessRuqyah(computeAssessment(answersFromSums({ ...base, ...overrides })));
const conditions = (result: RuqyahAssessment) => result.suggestions.map((suggestion) => suggestion.condition);

describe('assessRuqyah: ambang dan kelengkapan', () => {
  it('tidak menghitung saran bila 12 indikator belum lengkap', () => {
    const answers = answersFromSums(base);
    answers['FX-01'] = null;
    const result = assessRuqyah(computeAssessment(answers));
    expect(result.available).toBe(false);
    expect(result.suggestions).toEqual([]);
  });

  it('tanpa pilar yang turun tidak ada saran', () => {
    const result = run({ hidup: 8, makan: 8, pikir: 8, faktorx: 8 });
    expect(result.available).toBe(true);
    expect(result.droppedPillars).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it('pilar turun bila skor < 40, yaitu jumlah tiga indikator <= 7', () => {
    expect(run({ hidup: 7 }).droppedPillars).toEqual(['hidup']);
    expect(run({ hidup: 8 }).droppedPillars).toEqual([]);
  });

  it('selisih tepat 50 tidak dianggap ketidakseimbangan, selisih lebih dari 50 ya', () => {
    // jumlah 4 vs 10 = selisih 6 => tepat 50. Floating point naif bisa membacanya > 50.
    expect(run({ hidup: 4, makan: 10, pikir: 10, faktorx: 10 }).imbalance).toBe(false);
    expect(run({ hidup: 3, makan: 9, pikir: 9, faktorx: 9 }).imbalance).toBe(false);
    expect(run({ hidup: 3, makan: 10, pikir: 10, faktorx: 10 }).imbalance).toBe(true);
    expect(run({ hidup: 3, makan: 10, pikir: 10, faktorx: 10 }).gap).toBeCloseTo(58.3333, 3);
  });
});

describe('assessRuqyah: Kondisi D', () => {
  it('Faktor X < 30 (jumlah <= 6) memicu D walau pilar lain sempurna', () => {
    const result = run({ faktorx: 6 });
    expect(result.criticalFaktorX).toBe(true);
    expect(conditions(result)).toEqual(['D']);
    expect(result.suggestions[0].strength).toBe('critical');
  });

  it('Faktor X tepat jumlah 7 (33,3) tidak memicu D', () => {
    const result = run({ faktorx: 7 });
    expect(result.criticalFaktorX).toBe(false);
    expect(conditions(result)).not.toContain('D');
  });

  it('keempat pilar < 40 memicu D', () => {
    expect(conditions(run({ hidup: 7, makan: 7, pikir: 7, faktorx: 7 }))).toEqual(['D']);
  });

  it('D diprioritaskan di atas kondisi A, B, dan C', () => {
    expect(conditions(run({ pikir: 3, faktorx: 3, hidup: 3 }))).toEqual(['D']);
  });
});

describe('assessRuqyah: Kondisi A, B, C', () => {
  it('B cocok kuat bila Pola Pikir dan Pola Hidup turun', () => {
    const result = run({ pikir: 6, hidup: 6 });
    expect(conditions(result)).toEqual(['B']);
    expect(result.suggestions[0]).toMatchObject({ strength: 'strong', contributingPillars: ['pikir', 'hidup'] });
  });

  it('C cocok kuat bila Pola Makan dan Pola Hidup turun', () => {
    expect(conditions(run({ makan: 5, hidup: 5 }))).toEqual(['C']);
  });

  it('A cocok kuat hanya bila Pola Pikir turun dan jumlah Faktor X tepat 7', () => {
    const result = run({ pikir: 6, faktorx: 7 });
    expect(conditions(result)).toEqual(['A']);
    expect(result.suggestions[0].strength).toBe('strong');
  });

  it('beberapa kondisi cocok kuat ditampilkan semuanya, urut rata-rata pasangan terendah', () => {
    // hidup 5, makan 5, pikir 7: B (pikir+hidup=12) dan C (makan+hidup=10).
    const result = run({ hidup: 5, makan: 5, pikir: 7 });
    expect(conditions(result)).toEqual(['C', 'B']);
    expect(result.suggestions.every((suggestion) => suggestion.strength === 'strong')).toBe(true);
  });

  it('bila hanya satu pilar turun, semua kondisi terkait ditampilkan sebagai parsial', () => {
    const result = run({ pikir: 5 });
    expect(conditions(result).sort()).toEqual(['A', 'B']);
    expect(result.suggestions.every((suggestion) => suggestion.strength === 'partial')).toBe(true);
    expect(run({ makan: 5 }).suggestions.map((suggestion) => suggestion.condition)).toEqual(['C']);
  });

  it('seri tidak dipotong diam-diam berdasarkan urutan', () => {
    // pikir turun; hidup dan faktorx sama-sama 15 => pasangan A dan B seri.
    const result = run({ pikir: 5, hidup: 15, faktorx: 15 });
    expect(conditions(result).sort()).toEqual(['A', 'B']);
  });
});

describe('assessRuqyah: sifat aturan di seluruh 28.561 kombinasi', () => {
  const range = Array.from({ length: 13 }, (_, index) => index + 3);
  const all: { sums: PillarSums; result: RuqyahAssessment }[] = [];
  for (const hidup of range) {
    for (const makan of range) {
      for (const pikir of range) {
        for (const faktorx of range) {
          const sums = { hidup, makan, pikir, faktorx };
          all.push({ sums, result: assessRuqyah(computeAssessment(answersFromSums(sums))) });
        }
      }
    }
  }

  it('selalu ada saran bila ada pilar turun, dan tidak ada bila tidak ada', () => {
    for (const { result } of all) {
      expect(result.suggestions.length > 0).toBe(result.droppedPillars.length > 0);
    }
  });

  it('D muncul tepat ketika Faktor X <= 6 atau keempat pilar <= 7', () => {
    for (const { sums, result } of all) {
      const expectD = sums.faktorx <= 6 || Object.values(sums).every((value) => value <= 7);
      expect(conditions(result).includes('D')).toBe(expectD);
    }
  });

  it('D selalu berdiri sendiri', () => {
    for (const { result } of all) {
      if (conditions(result).includes('D')) expect(result.suggestions).toHaveLength(1);
    }
  });

  it('A cocok kuat hanya mungkin bila jumlah Faktor X tepat 7', () => {
    for (const { sums, result } of all) {
      const strongA = result.suggestions.some((suggestion) => suggestion.condition === 'A' && suggestion.strength === 'strong');
      if (strongA) expect(sums.faktorx).toBe(7);
    }
  });
});