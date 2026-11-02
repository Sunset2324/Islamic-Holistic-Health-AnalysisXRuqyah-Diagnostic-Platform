import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { RUQYAH_CONDITIONS } from '@/data/conditions';
import type { ScreeningResult } from '@/lib/scoring';

interface RuqyahAlertCardProps {
  result: ScreeningResult;
}

export default function RuqyahAlertCard({ result }: RuqyahAlertCardProps) {
  if (!result.alarmActive || result.condition === null) {
    return (
      <div className="flex gap-4 rounded-2xl bg-teal-50 p-6 ring-1 ring-teal-200">
        <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-teal-700" />
        <div>
          <h3 className="text-base font-bold text-teal-900">Tidak ada celah spiritual yang menonjol</h3>
          <p className="mt-1 text-sm leading-[1.5] text-teal-900">
            Semua pilar berada di atas ambang perhatian. Tetap jaga dzikir dan doa harian sebagai perlindungan.
          </p>
        </div>
      </div>
    );
  }

  const droppedLabels = result.droppedPillars.map((pillar) => pillar.label).join(' dan ');
  const condition = RUQYAH_CONDITIONS[result.condition];

  return (
    <div className="flex gap-4 rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-200">
      <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
      <div className="space-y-2">
        <h3 className="text-base font-bold text-amber-950">Peringatan Ruqyah aktif</h3>
        <p className="text-sm leading-[1.5] text-amber-900">
          Terdeteksi celah di <strong>{droppedLabels}</strong>. Kecenderungan yang perlu diperhatikan:{' '}
          <strong>{condition.name}</strong>.
        </p>
        {result.criticalSpiritual && (
          <p className="flex items-start gap-2 text-sm leading-[1.5] text-amber-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            Faktor X berada di level yang sangat rendah. Dampingi diri dengan ustadz atau pengruqyah terpercaya.
          </p>
        )}
      </div>
    </div>
  );
}
