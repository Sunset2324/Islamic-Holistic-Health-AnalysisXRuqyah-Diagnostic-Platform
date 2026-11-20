import { Flame, Snowflake, Scale } from 'lucide-react';
import type { HeatColdBalance } from '@/lib/balance';

interface Props {
  balance: HeatColdBalance;
  /** 'patient' = bahasa lembut untuk pasien; 'staff' = catatan ringkas untuk konsultan. */
  audience: 'patient' | 'staff';
}

const PATIENT_TEXT = {
  seimbang: 'Perhatian Anda pada tubuh dan jiwa sudah seimbang. Pertahankan keseimbangan ini, sambil terus menaikkan keduanya bersama-sama.',
  panas:
    'Perhatian Anda lebih banyak tercurah pada tubuh (pola hidup dan pola makan), sementara pikiran dan sisi spiritual sedang tertinggal. Coba sisihkan waktu untuk menenangkan hati: istirahat batin, dzikir, dan bercerita kepada orang yang Anda percaya.',
  dingin:
    'Pikiran dan sisi spiritual Anda relatif terjaga, sementara tubuh (pola hidup dan pola makan) sedang tertinggal. Coba mulai dari langkah kecil: tidur lebih teratur, minum cukup, bergerak, dan makan lebih seimbang.',
} as const;

const STAFF_TEXT = {
  seimbang: 'Sisi tubuh (PL+PM) dan sisi jiwa (PP+FX) setara.',
  panas: 'Sisi jiwa (PP+FX) tertinggal dari sisi tubuh (PL+PM). Gali beban pikiran, emosi, spiritual, dan dukungan sosial.',
  dingin: 'Sisi tubuh (PL+PM) tertinggal dari sisi jiwa (PP+FX). Gali tidur, aktivitas, ritme harian, dan pola makan.',
} as const;

export default function HeatColdBalanceCard({ balance, audience }: Props) {
  const { heat, cold, heatPercent, coldPercent, tilt, label } = balance;
  const badge =
    tilt === 'seimbang'
      ? 'bg-mint-100 text-mint-800'
      : tilt === 'panas'
        ? 'bg-peach-100 text-peach-900'
        : 'bg-lavender-100 text-lavender-900';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
          <Scale className="h-4 w-4 text-mint-700" />
          Neraca Panas–Dingin
        </p>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge}`}>{label}</span>
      </div>

      <div
        className="flex h-4 overflow-hidden rounded-full bg-stone-200"
        role="img"
        aria-label={`Panas ${heatPercent} persen, dingin ${coldPercent} persen`}
      >
        <div className="h-full bg-peach-400 transition-all duration-1000 ease-out" style={{ width: `${heatPercent}%` }} />
        <div className="h-full bg-lavender-400 transition-all duration-1000 ease-out" style={{ width: `${coldPercent}%` }} />
      </div>
      <p className="-mt-2 text-center text-[11px] font-medium text-stone-500" aria-hidden="true">
        ▲ titik seimbang 50:50
      </p>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-2xl bg-peach-50 p-3 ring-1 ring-peach-200">
          <p className="flex items-center gap-1.5 font-semibold text-peach-900">
            <Flame className="h-3.5 w-3.5" /> Panas {heatPercent}%
          </p>
          <p className="mt-1 text-peach-900/80">Tubuh: Pola Hidup + Pola Makan · skor {Math.round(heat)}/100</p>
        </div>
        <div className="rounded-2xl bg-lavender-50 p-3 ring-1 ring-lavender-200">
          <p className="flex items-center gap-1.5 font-semibold text-lavender-900">
            <Snowflake className="h-3.5 w-3.5" /> Dingin {coldPercent}%
          </p>
          <p className="mt-1 text-lavender-900/80">Jiwa: Pola Pikir + Faktor X · skor {Math.round(cold)}/100</p>
        </div>
      </div>

      <p className="text-sm leading-[1.5] text-stone-700">{audience === 'patient' ? PATIENT_TEXT[tilt] : STAFF_TEXT[tilt]}</p>
      <p className="text-xs leading-[1.5] text-stone-500">
        Idealnya 50:50. Di neraca ini keempat pilar dihitung sama rata. Ini alat refleksi MyHerbalis, bukan diagnosis.
      </p>
    </div>
  );
}
