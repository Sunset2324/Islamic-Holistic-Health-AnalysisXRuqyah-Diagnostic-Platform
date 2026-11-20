import type { PatientReportData } from '@/lib/patientReport';

/** Pratinjau laporan untuk pasien (isi sama persis dengan PDF dan teks WhatsApp). */
export default function PatientReport({ data }: { data: PatientReportData }) {
  return (
    <article className="text-[13px] leading-[1.55] text-stone-800">
      <header className="flex items-start justify-between gap-4 border-b-2 border-mint-600 pb-3">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-11 w-11 rounded-xl" />
          <div>
            <p className="text-base font-bold text-stone-900">My Herbalis</p>
            <p className="text-xs text-stone-500">Laporan Konsultasi Kesehatan Holistik</p>
          </div>
        </div>
        <div className="text-right text-xs text-stone-600">
          <p>{data.dateLabel}</p>
          <p>Konsultan: {data.consultantName}</p>
        </div>
      </header>

      <p className="mt-4">
        <span className="mr-3 text-stone-500">Pasien</span>
        <strong className="text-stone-900">
          {data.patientName}, {data.age} tahun
        </strong>
      </p>

      {data.sections.map((section) => (
        <section key={section.title} className="mt-5">
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-mint-800">{section.title}</h2>
          {section.lead && <p className="font-semibold text-stone-900">{section.lead}</p>}
          <p className="whitespace-pre-wrap">{section.body || <span className="text-stone-400">(belum diisi)</span>}</p>
        </section>
      ))}

      <p className="mt-6 border-t border-stone-300 pt-3 text-[11px] leading-[1.5] text-stone-500">{data.disclaimer}</p>
    </article>
  );
}
