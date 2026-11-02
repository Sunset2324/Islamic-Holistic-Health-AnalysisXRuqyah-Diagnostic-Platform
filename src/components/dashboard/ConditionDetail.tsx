import { BookOpen, Check, Droplets, Landmark, Stethoscope, TriangleAlert } from 'lucide-react';
import type { RuqyahCondition } from '@/data/conditions';

interface ConditionDetailProps {
  condition: RuqyahCondition;
}

export default function ConditionDetail({ condition }: ConditionDetailProps) {
  const lenses = [
    { icon: Stethoscope, title: 'Lensa Medis', body: condition.lenses.medis },
    { icon: Droplets, title: 'Lensa TCM', body: condition.lenses.tcm },
    { icon: BookOpen, title: 'Lensa Thibbunnabawi', body: condition.lenses.thibbunnabawi },
  ];

  return (
    <section className="space-y-8 rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Kondisi {condition.id}</p>
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-2xl font-bold leading-[1.2] text-stone-900">{condition.name}</h2>
          <span className="font-serif text-lg text-stone-500" lang="ar" dir="rtl">
            {condition.arabicName}
          </span>
        </div>
        <p className="text-sm leading-[1.5] text-stone-600">{condition.traits}</p>
        <p className="text-xs font-medium text-stone-500">Pilar yang paling menurun: {condition.dominantDrop}</p>
      </header>

      {condition.urgent && (
        <div className="flex gap-3 rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
          <p className="text-sm leading-[1.5] text-rose-900">
            Kondisi ini perlu penanganan segera. Prioritaskan pemeriksaan medis, dan jangan menunda bantuan
            profesional.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {lenses.map(({ icon: Icon, title, body }) => (
          <article key={title} className="rounded-2xl bg-stone-50 p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm">
              <Icon className="h-4 w-4" />
            </span>
            <h3 className="mt-4 text-sm font-bold text-stone-900">{title}</h3>
            <p className="mt-1.5 text-sm leading-[1.5] text-stone-600">{body}</p>
          </article>
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="flex items-center gap-2 text-base font-bold text-stone-900">
          <Landmark className="h-4 w-4 text-teal-700" />
          Langkah yang bisa dijalani
        </h3>
        <ul className="space-y-3">
          {condition.recommendations.map((item) => (
            <li key={item} className="flex items-start gap-3 text-sm leading-[1.5] text-stone-700">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <Check className="h-3 w-3" />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
