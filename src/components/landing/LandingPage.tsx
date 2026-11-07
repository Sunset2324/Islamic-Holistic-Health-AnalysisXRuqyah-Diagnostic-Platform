import { Activity, ArrowRight, Brain, Leaf, ShieldAlert, ShieldCheck, Sparkles, Stethoscope } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
}

const FEATURES = [
  {
    icon: Activity,
    title: 'Empat Pilar Kebiasaan',
    body: 'Pola makan, pola hidup, pola pikir, dan Faktor X dinilai dalam satu skor kesehatan holistik.',
  },
  {
    icon: Stethoscope,
    title: 'Tiga Sudut Pandang',
    body: 'Setiap temuan dijelaskan dari sisi medis, TCM, dan Thibbunnabawi agar mudah dipahami.',
  },
  {
    icon: ShieldAlert,
    title: 'Peringatan Ruqyah',
    body: 'Celah spiritual dipetakan dengan lembut sebagai bahan refleksi dan pendampingan, bukan vonis.',
  },
];

export default function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-white">
            <Leaf className="h-4 w-4" />
          </span>
          <span className="text-sm font-bold tracking-tight text-stone-900">MyHerbalis</span>
        </div>
        <span className="hidden items-center gap-1.5 text-xs font-medium text-stone-500 sm:flex">
          <ShieldCheck className="h-4 w-4 text-teal-700" />
          Data Anda dijaga kerahasiaannya
        </span>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-8 lg:grid-cols-2 lg:pt-16">
          <div className="animate-fade-up space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              <Sparkles className="h-3.5 w-3.5" />
              Analisis Kesehatan Holistik Islami
            </p>
            <h1 className="text-4xl font-bold leading-[1.2] tracking-tight text-stone-900 sm:text-5xl">
              Kenali tubuh, sehatkan pikiran, kuatkan iman.
            </h1>
            <p className="max-w-xl text-base leading-[1.5] text-stone-600">
              Jawab 12 pertanyaan singkat yang tenang dan empatik tentang 7 hari terakhir Anda. Kami membaca gaya
              hidup Anda melalui medis, TCM, dan Thibbunnabawi, lalu memberi langkah perbaikan yang bisa dijalani
              pelan-pelan.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={onStart}
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/10 transition hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
              >
                Mulai Analisis
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
              <p className="text-xs text-stone-500">
                Sekitar 3–5 menit. Pertanyaan yang tidak ingin dijawab boleh dilewati.
              </p>
            </div>
            <p className="max-w-xl text-xs leading-[1.5] text-stone-500">
              Dengan menekan &quot;Mulai Analisis&quot;, Anda menyetujui jawaban Anda digunakan untuk menyusun hasil ini
              dan dibahas bersama konsultan. Hasil ini bukan diagnosis medis.
            </p>
          </div>

          <div className="animate-fade-up relative" style={{ animationDelay: '120ms' }}>
            <div className="overflow-hidden rounded-3xl shadow-2xl shadow-stone-900/10">
              <div
                role="img"
                aria-label="Logo MyHerbalis: daun dan bulan sabit di atas latar hijau"
                className="flex aspect-[4/3] w-full items-center justify-center bg-gradient-to-br from-teal-900 via-teal-700 to-teal-500"
              >
                <img src="/favicon.svg" alt="" className="h-40 w-40 drop-shadow-xl" />
              </div>
            </div>
            <div className="absolute -bottom-5 left-6 right-6 rounded-2xl border border-stone-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:left-[-1.5rem] sm:right-auto sm:w-80">

              <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Contoh Hasil</p>
              <p className="mt-1 text-sm leading-[1.5] text-stone-700">
                Area spiritual membutuhkan lebih banyak perhatian. Ketika hati lelah, tubuh sering bereaksi.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-stone-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-16 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }, index) => (
              <article
                key={title}
                className="animate-fade-up rounded-2xl border border-stone-200 bg-stone-50 p-6 transition hover:-translate-y-1 hover:border-teal-200 hover:shadow-md"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-5 text-lg font-bold leading-[1.2] text-stone-900">{title}</h2>
                <p className="mt-2 text-sm leading-[1.5] text-stone-600">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col gap-4 rounded-2xl bg-amber-50 p-6 ring-1 ring-amber-200 sm:flex-row sm:items-start">
            <Brain className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <p className="text-sm leading-[1.5] text-amber-900">
              Hasil analisis ini adalah panduan refleksi, bukan diagnosis medis dan bukan kepastian kesembuhan.
              Skor 100% bukan jaminan sehat. Untuk keluhan fisik maupun psikis, selalu konsultasikan dengan dokter
              dan ustadz yang kompeten.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}