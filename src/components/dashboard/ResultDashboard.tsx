import { Leaf, Phone, RotateCcw, ShieldAlert } from 'lucide-react';
import ConditionDetail from '@/components/dashboard/ConditionDetail';
import PillarBars from '@/components/dashboard/PillarBars';
import RuqyahAlertCard from '@/components/dashboard/RuqyahAlertCard';
import ScoreRing from '@/components/dashboard/ScoreRing';
import { RUQYAH_CONDITIONS } from '@/data/conditions';
import type { ScreeningResult } from '@/lib/scoring';
import type { PatientIntake } from '@/types/intake';

interface ResultDashboardProps {
  patient: PatientIntake;
  result: ScreeningResult;
  onRestart: () => void;
}

export default function ResultDashboard({ patient, result, onRestart }: ResultDashboardProps) {
  const condition = result.condition ? RUQYAH_CONDITIONS[result.condition] : null;
  const greetingName = patient.name || 'Anda';

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-white">
              <Leaf className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold tracking-tight text-stone-900">Holistik Islami</span>
          </div>
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <RotateCcw className="h-4 w-4" />
            Analisis ulang
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div className="animate-fade-up space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Hasil analisis</p>
          <h1 className="text-3xl font-bold leading-[1.2] tracking-tight text-stone-900">
            Assalamu&apos;alaikum, {greetingName}.
          </h1>
          <p className="max-w-2xl text-sm leading-[1.5] text-stone-600">
            Berikut gambaran kebiasaan Anda. Gunakan sebagai bahan refleksi, lalu mulai dari satu langkah kecil.
          </p>
        </div>

        {patient.redFlag && (
          <div className="animate-fade-up flex flex-col gap-4 rounded-2xl bg-rose-50 p-6 ring-1 ring-rose-200 sm:flex-row sm:items-center">
            <ShieldAlert className="h-6 w-6 shrink-0 text-rose-700" />
            <div className="flex-1">
              <h2 className="text-base font-bold text-rose-950">Anda perlu pertolongan medis</h2>
              <p className="mt-1 text-sm leading-[1.5] text-rose-900">
                Gejala darurat yang Anda laporkan harus diperiksakan segera. Analisis ini tidak menggantikan
                pemeriksaan dokter.
              </p>
            </div>
            <a
              href="tel:119"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-800"
            >
              <Phone className="h-4 w-4" />
              Hubungi 119
            </a>
          </div>
        )}

        <div className="animate-fade-up grid gap-6 lg:grid-cols-2" style={{ animationDelay: '80ms' }}>
          <section className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
            <ScoreRing score={result.holisticScore} category={result.holisticCategory} />
          </section>
          <RuqyahAlertCard result={result} />
        </div>

        <section className="animate-fade-up rounded-3xl border border-stone-200 bg-white p-8 shadow-sm" style={{ animationDelay: '160ms' }}>
          <h2 className="text-lg font-bold text-stone-900">Empat pilar Anda</h2>
          <p className="mt-1 text-sm text-stone-600">Setiap pilar dinilai 0 sampai 100 sebelum digabungkan.</p>
          <div className="mt-8">
            <PillarBars pillarScores={result.pillarScores} imbalance={result.imbalance} gap={result.gap} />
          </div>
        </section>

        {condition && <ConditionDetail condition={condition} />}

        <aside className="rounded-2xl bg-amber-50 p-6 text-sm leading-[1.5] text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">Catatan penting</p>
          <p className="mt-2">
            Skor 100% bukan jaminan kesehatan dan hasil ini bukan diagnosis medis. Analisis spiritual adalah
            bahan refleksi, bukan vonis. Setiap konsumsi herbal atau obat wajib didiskusikan dengan dokter, dan
            ruqyah sebaiknya dilakukan bersama ustadz atau pengruqyah yang kredibel.
          </p>
        </aside>
      </main>
    </div>
  );
}
