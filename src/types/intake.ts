export interface PatientIntake {
  /** Nama panggilan, opsional. */
  name: string;
  age: number;
  /** Keluhan utama (opsional, maksimal 1.000 karakter). Tidak masuk perhitungan HHS. */
  mainComplaint: string;
  complaintDuration: string;
  complaintFrequency: string;
  complaintImpact: string;
  /** Riwayat medis, opsional ("jika mau"). Tidak diberi skor. */
  medicalHistory: string;
}