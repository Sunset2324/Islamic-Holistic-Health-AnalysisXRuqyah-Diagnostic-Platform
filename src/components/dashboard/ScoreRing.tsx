import { useEffect, useState } from 'react';

interface ScoreRingProps {
  score: number;
  category: string;
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ScoreRing({ score, category }: ScoreRingProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const offset = mounted ? CIRCUMFERENCE * (1 - score / 100) : CIRCUMFERENCE;

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={RADIUS} fill="none" strokeWidth="10" className="stroke-stone-200" />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            className="stroke-teal-600 transition-[stroke-dashoffset] duration-1000 ease-out"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums text-stone-900">{score}%</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Skor kesehatan holistik</p>
        <p className="mt-1 text-xl font-bold leading-[1.2] text-stone-900">{category}</p>
        <p className="mt-2 text-sm leading-[1.5] text-stone-600">
          Gabungan dari empat pilar kebiasaan dengan bobot 30-30-30-10.
        </p>
      </div>
    </div>
  );
}
