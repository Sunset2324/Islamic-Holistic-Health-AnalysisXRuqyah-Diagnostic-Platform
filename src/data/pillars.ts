export type PillarId = 'hidup' | 'makan' | 'pikir' | 'faktorx';

export interface PillarMeta {
  id: PillarId;
  /** Kode di dokumen HHS: PL, PM, PP, FX. */
  code: 'PL' | 'PM' | 'PP' | 'FX';
  label: string;
  /** Bobot dalam persen. Total seluruh pilar harus 100. */
  weight: number;
  focus: string;
}

// Sumber: Master Questionnaire HHS v1.0, bagian 1 (urutan: Hidup, Makan, Pikir, Faktor X).
export const PILLARS: PillarMeta[] = [
  { id: 'hidup', code: 'PL', label: 'Pola Hidup', weight: 30, focus: 'Tidur, aktivitas fisik, keteraturan rutinitas' },
  { id: 'makan', code: 'PM', label: 'Pola Makan', weight: 30, focus: 'Hidrasi, keseimbangan nutrisi, kualitas dan keamanan pangan' },
  { id: 'pikir', code: 'PP', label: 'Pola Pikir', weight: 30, focus: 'Kesejahteraan emosi, pengelolaan emosi, kecemasan/pikiran berulang' },
  {
    id: 'faktorx',
    code: 'FX',
    label: 'Faktor X',
    weight: 10,
    focus: 'Konteks spiritual/makna, lingkungan dan dukungan sosial, akses layanan kesehatan',
  },
];

export const PILLAR_BY_ID = Object.fromEntries(PILLARS.map((pillar) => [pillar.id, pillar])) as Record<PillarId, PillarMeta>;