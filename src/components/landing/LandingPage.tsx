import type { ReactNode } from 'react';
import { Activity, ArrowRight, HeartHandshake, Leaf, Lock, MessageCircleHeart, ShieldCheck, Sparkles, Stethoscope, SunMedium } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
  /** Informasi data tersimpan di perangkat (opsional). */
  banner?: ReactNode;
}

const FEATURES = [
  {
    icon: Activity,
    title: 'Empat Pilar Kebiasaan',
    body: 'Pola makan, pola hidup, pola pikir, dan Faktor X dinilai dalam satu skor kesehatan holistik.',
    tone: 'bg-mint-100 text-mint-800',
  },
  {
    icon: Stethoscope,
    title: 'Tiga Sudut Pandang',
    body: 'Setiap temuan dijelaskan dari sisi medis, TCM, dan Thibbunnabawi agar mudah dipahami.',
    tone: 'bg-peach-100 text-peach-800',
  },
  {
    icon: SunMedium,
    title: 'Pendampingan Ruqyah',
    body: 'Celah spiritual dipetakan dengan lembut sebagai bahan refleksi dan pendampingan, bukan vonis.',
    tone: 'bg-lavender-100 text-lavender-800',
  },
];

/** Ajakan jujur tanpa menakut-nakuti: alasan kenapa aman untuk bercerita apa adanya. */
const SAFE_POINTS = [
  { icon: HeartHandshake, title: 'Tidak ada jawaban salah', body: 'Kami tidak menilai iman atau pribadi Anda. Jawaban jujur hanya membantu kami membantu Anda.' },
  { icon: Lock, title: 'Rahasia terjaga', body: 'Isian dienkripsi dan hanya dibuka konsultan yang Anda beri kode. Bisa Anda hapus kapan saja.' },
  { icon: MessageCircleHeart, title: 'Boleh dilewati', body: 'Pertanyaan yang belum nyaman dijawab boleh dilewati. Ceritakan sebanyak yang Anda mau.' },
];

export default function LandingPage({ onStart, banner }: LandingPageProps) {
  return (
    <div className="patient-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-mint-500 text-white shadow-[0_6px_16px_-6px_rgba(34,136,106,0.7)]">
            <Leaf className="h-5 w-5" />
          </span>
          <span className="text-base font-bold tracking-tight text-stone-900">MyHerbalis</span>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-medium text-lavender-800 ring-1 ring-lavender-200 sm:flex">
          <ShieldCheck className="h-4 w-4" />
          Data Anda dijaga kerahasiaannya
        </span>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-6 lg:grid-cols-2 lg:pt-14">
          <div className="animate-fade-up space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full bg-peach-100 px-3 py-1 text-xs font-semibold text-peach-800">
              <Sparkles className="h-3.5 w-3.5" />
              Analisis Kesehatan Holistik Islami
            </p>
            <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-stone-900 sm:text-5xl">
              Kenali tubuh, sehatkan pikiran, <span className="text-mint-700">kuatkan iman.</span>
            </h1>
            <p className="max-w-xl text-base leading-[1.6] text-stone-600">
              Jawab 12 pertanyaan singkat tentang 7 hari terakhir Anda, dengan santai dan tanpa dihakimi. Kami membaca
              gaya hidup Anda melalui medis, TCM, dan Thibbunnabawi, lalu memberi langkah perbaikan yang bisa dijalani
              pelan-pelan.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" onClick={onStart} className="group btn-mint px-7 py-3.5">
                Mulai Analisis
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
              <p className="text-xs text-stone-500">Sekitar 3–5 menit. Pertanyaan yang tidak ingin dijawab boleh dilewati.</p>
            </div>
            {banner}
            <p className="max-w-xl text-xs leading-[1.5] text-stone-500">
              Dengan menekan &quot;Mulai Analisis&quot;, Anda menyetujui jawaban Anda digunakan untuk menyusun hasil ini
              dan dibahas bersama konsultan. Hasil ini bukan diagnosis medis.
            </p>
          </div>

          <div className="animate-fade-up relative mx-auto w-full max-w-md lg:max-w-none" style={{ animationDelay: '120ms' }}>
            <div
              role="img"
              aria-label="Logo MyHerbalis: daun dan bulan sabit"
              className="flex aspect-[4/3] w-full items-center justify-center rounded-[2.5rem] bg-gradient-to-br from-mint-200 via-lavender-100 to-peach-200 shadow-[0_30px_60px_-30px_rgba(100,67,185,0.45)] ring-8 ring-white/70"
            >
              <span className="flex h-44 w-44 items-center justify-center rounded-full bg-white/70 shadow-inner">
                <img src="/favicon.svg" alt="" className="h-28 w-28 drop-shadow-lg" />
              </span>
            </div>
            <div className="soft-card absolute -bottom-6 left-4 right-4 p-4 sm:left-[-1.5rem] sm:right-auto sm:w-80">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-lavender-700">
                <HeartHandshake className="h-3.5 w-3.5" /> Contoh hasil
              </p>
              <p className="mt-1 text-sm leading-[1.5] text-stone-700">
                Area spiritual membutuhkan lebih banyak perhatian. Ketika hati lelah, tubuh sering bereaksi.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-6">
          <div className="soft-card bg-gradient-to-br from-lavender-50 via-white to-mint-50 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-lavender-950 sm:text-2xl">Ruang aman untuk jujur</h2>
            <p className="mt-1 text-sm text-stone-600">Semakin apa adanya cerita Anda, semakin tepat pendampingan yang bisa kami berikan.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {SAFE_POINTS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-lavender-100">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-lavender-100 text-lavender-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-stone-900">{title}</h3>
                    <p className="mt-1 text-sm leading-[1.5] text-stone-600">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-6 py-12 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body, tone }, index) => (
            <article
              key={title}
              className="soft-card animate-fade-up p-6 transition hover:-translate-y-1"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone}`}>
                <Icon className="h-6 w-6" />
              </span>
              <h2 className="mt-5 text-lg font-bold leading-[1.2] text-stone-900">{title}</h2>
              <p className="mt-2 text-sm leading-[1.5] text-stone-600">{body}</p>
            </article>
          ))}
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-14">
          <div className="flex flex-col gap-4 rounded-3xl bg-peach-50 p-6 ring-1 ring-peach-200 sm:flex-row sm:items-start">
            <SunMedium className="mt-0.5 h-5 w-5 shrink-0 text-peach-700" />
            <p className="text-sm leading-[1.5] text-peach-900">
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
