import { describe, expect, it } from 'vitest';
import { CONCERNING_TAG_IDS, INDICATORS } from '@/data/indicators';
import { PILLARS } from '@/data/pillars';

describe('data indikator HHS v1.0', () => {
  it('memiliki 12 indikator dengan ID unik', () => {
    expect(INDICATORS).toHaveLength(12);
    expect(new Set(INDICATORS.map((indicator) => indicator.id)).size).toBe(12);
  });

  it('memiliki tiga indikator pada setiap pilar', () => {
    for (const pillar of PILLARS) {
      expect(INDICATORS.filter((indicator) => indicator.pillar === pillar.id)).toHaveLength(3);
    }
  });

  it('bobot pilar berjumlah 100 dengan komposisi 30/30/30/10', () => {
    expect(PILLARS.reduce((total, pillar) => total + pillar.weight, 0)).toBe(100);
    expect(PILLARS.map((pillar) => pillar.weight)).toEqual([30, 30, 30, 10]);
  });

  it('setiap indikator punya lima deskripsi skor', () => {
    for (const indicator of INDICATORS) {
      expect(indicator.scoreDescriptions).toHaveLength(5);
      expect(indicator.scoreDescriptions.every((text) => text.trim().length > 0)).toBe(true);
    }
  });

  it('pertanyaan menyebut 7 hari terakhir, kecuali FX-03 yang menilai akses yang tersedia atau diperkirakan tersedia', () => {
    // Pengecualian ini berasal dari teks asli HHS v1.0 halaman 6 (bukan kesalahan data).
    for (const indicator of INDICATORS) {
      const mentionsPeriod = indicator.question.includes('7 hari terakhir');
      expect(mentionsPeriod, indicator.id).toBe(indicator.id !== 'FX-03');
    }
  });

  it('setiap indikator punya tag unik dan tag OTHER sebagai pilihan terakhir', () => {
    const seen = new Set<string>();
    for (const indicator of INDICATORS) {
      const ids = indicator.microTags.map((tag) => tag.id);
      expect(new Set(ids).size).toBe(ids.length);
      ids.forEach((id) => {
        expect(seen.has(id), `tag ganda: ${id}`).toBe(false);
        seen.add(id);
      });
      expect(indicator.microTags.filter((tag) => tag.isOther)).toHaveLength(1);
      expect(indicator.microTags[indicator.microTags.length - 1].isOther).toBe(true);
      expect(indicator.microTags.every((tag) => tag.label.trim().length > 0)).toBe(true);
    }
    expect(seen.size).toBe(78);
  });

  it('semua tag yang mengkhawatirkan ada di data', () => {
    const all = new Set(INDICATORS.flatMap((indicator) => indicator.microTags.map((tag) => tag.id)));
    for (const id of CONCERNING_TAG_IDS) expect(all.has(id)).toBe(true);
  });
});