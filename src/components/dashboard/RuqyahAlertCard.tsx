import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { RUQYAH_CONDITIONS } from '@/data/conditions';
import { PILLAR_BY_ID } from '@/data/pillars';
import { lowIndicators, type Answers } from '@/lib/Hhs';
import type { RuqyahAssessment, SuggestionStrength } from '@/lib/ruqyah';

interface RuqyahAlertCardProps {
  ruqyah: RuqyahAssessment;
  answers: Answers;
}

const STRENGTH_LABEL: Record<SuggestionStrength, string> = {
  critical: 'Perlu ditelaah segera',
  strong: 'Pola cocok kuat',
  partial: 'Indikasi parsial',
};

export default function RuqyahAlertCard({ ruqyah, answers }: RuqyahAlertCardProps) {
  if (!ruqyah.available) return null;

  if (ruqyah.suggestions.length === 0) {
    return (
      <div className="flex gap-4 rounded-2xl bg-teal-50 p-6 ring-1 ring-teal-200">
        <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-teal-700" />
        <div>
          <h3 className="text-base font-bold text-teal-900">Tidak ada celah yang menonjol</h3>
          <p className="mt-1 text-sm leading-[1.5] text-teal-900">
            Semua pilar berada di atas ambang perhatian. Tetap jaga dzikir dan doa harian sebagai perlindungan.
          </p>
        </div>
      </div>
    );
  }

  const low = lowIndicators(answers);

  return (
    <div className="flex gap-4 rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-200">
      <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" />
      <div className="space-y-3">
        <h3 className="text-base font-bold text-amber-950">Saran awal untuk dibahas bersama konsultan</h3>
        <p className="text-sm leading-[1.5] text-amber-900">
          Dari pola jawaban Anda, konsultan akan menelaah hal berikut. Ini bukan diagnosis dan bukan vonis; hanya bahan
          awal untuk dibahas bersama.
        </p>
        <ul className="space-y-3">
          {ruqyah.suggestions.map((suggestion) => {
            const condition = RUQYAH_CONDITIONS[suggestion.condition];
            const pillarLabels = suggestion.contributingPillars.map((id) => PILLAR_BY_ID[id].label).join(' dan ');
            const evidence = low.filter(({ indicator }) => suggestion.contributingPillars.includes(indicator.pillar));
            return (
              <li key={suggestion.condition} className="rounded-xl bg-white/70 p-4 text-sm leading-[1.5] text-amber-950">
                <p className="font-semibold">
                  {condition.name}{' '}
                  <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    {STRENGTH_LABEL[suggestion.strength]}
                  </span>
                </p>
                <p className="mt-1 text-amber-900">Pilar yang menurun: {pillarLabels}.</p>
                {evidence.length > 0 && (
                  <p className="mt-1 text-amber-900">
                    Indikator rendah:{' '}
                    {evidence
                      .map(({ indicator, score }) => `${indicator.title} (${score}/5)`)
                      .join('; ')}
                    .
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {ruqyah.criticalFaktorX && (
          <p className="text-xs leading-[1.5] text-amber-900">
            Faktor X mencakup makna spiritual, lingkungan, dan akses layanan kesehatan. Konsultan akan menelaah bagian mana
            yang paling berpengaruh.
          </p>
        )}
      </div>
    </div>
  );
}   