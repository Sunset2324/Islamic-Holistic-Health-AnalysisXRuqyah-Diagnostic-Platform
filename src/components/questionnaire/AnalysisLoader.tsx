import { useEffect, useState } from 'react';

interface AnalysisLoaderProps {
  onDone: () => void;
}

const BEAD_COUNT = 33;
const TICK_MS = 85;
const DONE_MS = 3200;

export default function AnalysisLoader({ onDone }: AnalysisLoaderProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => setCount((current) => Math.min(current + 1, BEAD_COUNT)), TICK_MS);
    const finish = setTimeout(onDone, DONE_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(finish);
    };
  }, [onDone]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-6 text-center">
      <div className="relative h-56 w-56">
        {Array.from({ length: BEAD_COUNT }, (_, index) => {
          const angle = (index / BEAD_COUNT) * 2 * Math.PI - Math.PI / 2;
          const x = 50 + 42 * Math.cos(angle);
          const y = 50 + 42 * Math.sin(angle);
          const lit = index < count;
          return (
            <span
              key={index}
              className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300 ${
                lit ? 'scale-125 bg-teal-600' : 'bg-stone-300'
              }`}
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          );
        })}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tabular-nums text-stone-900">{count}</span>
          <span className="text-xs font-medium text-stone-500">dari {BEAD_COUNT}</span>
        </div>
      </div>
      <h1 className="mt-10 text-2xl font-bold leading-[1.2] text-stone-900">Menyusun analisis Anda</h1>
      <p className="mt-3 max-w-sm text-sm leading-[1.5] text-stone-600">
        Sambil menunggu, ingatlah bahwa setiap langkah perbaikan kecil tetap berharga di sisi Allah.
      </p>
    </div>
  );
}
