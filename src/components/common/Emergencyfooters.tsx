import { Phone } from 'lucide-react';
import { EMERGENCY_NUMBER } from '@/config';

export default function EmergencyFooter() {
  return (
    <footer className="border-t border-stone-200 bg-white px-6 py-4 text-center text-xs leading-[1.5] text-stone-600">
      <Phone className="mr-1.5 inline h-3.5 w-3.5 text-teal-700" aria-hidden />
      Dalam keadaan darurat, segera hubungi{' '}
      <a href={`tel:${EMERGENCY_NUMBER}`} className="font-semibold text-teal-800 underline-offset-2 hover:underline">
        {EMERGENCY_NUMBER}
      </a>{' '}
      atau datang ke fasilitas kesehatan terdekat.
    </footer>
  );
}