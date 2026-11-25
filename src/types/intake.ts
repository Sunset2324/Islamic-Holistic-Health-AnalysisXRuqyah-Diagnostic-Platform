/** Jenis kelamin pasien. Wajib dipilih tepat satu di form pertama. */
export const GENDERS = ['laki-laki', 'perempuan'] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS: Record<Gender, string> = { 'laki-laki': 'Laki-laki', perempuan: 'Perempuan' };

export const isGender = (value: unknown): value is Gender => typeof value === 'string' && (GENDERS as readonly string[]).includes(value);

export interface PatientIntake {
  /** Nama panggilan, wajib diisi. */
  name: string;
  /** Wajib. Data lama (sebelum field ini ada) bisa tidak memilikinya; tampilan harus tetap aman. */
  gender: Gender;
  age: number;
  /** Keluhan utama (opsional, maksimal 1.000 karakter). Tidak masuk perhitungan HHS. */
  mainComplaint: string;
  complaintDuration: string;
  complaintFrequency: string;
  complaintImpact: string;
  /** Riwayat medis, opsional ("jika mau"). Tidak diberi skor. */
  medicalHistory: string;
}
