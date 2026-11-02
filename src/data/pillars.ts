export type PillarId = 'makan' | 'hidup' | 'pikir' | 'spiritual';

export interface PillarMeta {
  id: PillarId;
  label: string;
  weight: number;
  focus: string;
}

export const PILLARS: PillarMeta[] = [
  { id: 'makan', label: 'Pola Makan', weight: 30, focus: 'Nutrisi, metabolisme, adab makan' },
  { id: 'hidup', label: 'Pola Hidup', weight: 30, focus: 'Tidur, aktivitas, kebersihan, lingkungan' },
  { id: 'pikir', label: 'Pola Pikir', weight: 30, focus: 'Stres, emosi, hubungan sosial' },
  { id: 'spiritual', label: 'Faktor X', weight: 10, focus: 'Spiritualitas, genetik, riwayat medis' },
];
