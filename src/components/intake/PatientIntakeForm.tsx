import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, CalendarClock } from 'lucide-react';
import { ASSESSMENT_PERIOD_LABEL, COMPLAINT_DETAIL_MAX_LENGTH, COMPLAINT_MAX_LENGTH, COMPLAINT_REQUIRED } from '@/config';
import type { PatientIntake } from '@/types/intake';

interface PatientIntakeFormProps {
  initial: PatientIntake | null;
  onSubmit: (intake: PatientIntake) => void;
  onBack: () => void;
}

interface FormErrors {
  age?: string;
  mainComplaint?: string;
}

const MIN_AGE = 10;
const MAX_AGE = 120;

const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20';

export default function PatientIntakeForm({ initial, onSubmit, onBack }: PatientIntakeFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [age, setAge] = useState(initial ? String(initial.age) : '');
  const [mainComplaint, setMainComplaint] = useState(initial?.mainComplaint ?? '');
  const [complaintDuration, setComplaintDuration] = useState(initial?.complaintDuration ?? '');
  const [complaintFrequency, setComplaintFrequency] = useState(initial?.complaintFrequency ?? '');
  const [complaintImpact, setComplaintImpact] = useState(initial?.complaintImpact ?? '');
  const [medicalHistory, setMedicalHistory] = useState(initial?.medicalHistory ?? '');
  const [errors, setErrors] = useState<FormErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedAge = Number(age);
    const nextErrors: FormErrors = {};
    if (!age || !Number.isInteger(parsedAge) || parsedAge < MIN_AGE || parsedAge > MAX_AGE) {
      nextErrors.age = `Masukkan usia antara ${MIN_AGE} dan ${MAX_AGE} tahun.`;
    }
    if (COMPLAINT_REQUIRED && mainComplaint.trim().length === 0) {
      nextErrors.mainComplaint = 'Mohon isi keluhan utama Anda.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({
      name: name.trim(),
      age: parsedAge,
      mainComplaint: mainComplaint.trim(),
      complaintDuration: complaintDuration.trim(),
      complaintFrequency: complaintFrequency.trim(),
      complaintImpact: complaintImpact.trim(),
      medicalHistory: medicalHistory.trim(),
    });
  }

  return (
    <div className="min-h-screen bg-stone-50 px-6 py-12">
      <div className="mx-auto max-w-2xl animate-fade-up">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-stone-500 transition hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </button>

        <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Langkah 1 dari 2</p>
        <h1 className="mt-2 text-3xl font-bold leading-[1.2] tracking-tight text-stone-900">Ceritakan sedikit tentang Anda</h1>
        <p className="mt-3 text-sm leading-[1.5] text-stone-600">
          Informasi ini membantu konsultan memahami kondisi Anda. Semua bagian selain usia boleh dikosongkan.
        </p>

        <div className="mt-6 flex gap-3 rounded-xl bg-teal-50 p-4 ring-1 ring-teal-200">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden />
          <p className="text-sm leading-[1.5] text-teal-900">
            <strong>Penting:</strong> pertanyaan pada langkah berikutnya menanyakan keadaan Anda selama{' '}
            <strong>{ASSESSMENT_PERIOD_LABEL}</strong>, yaitu 7 hari sebelum hari ini. Pilih jawaban yang paling mendekati
            keadaan Anda secara umum, bukan hanya satu hari yang paling baik atau paling buruk.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="mt-10 space-y-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-stone-800">Nama panggilan</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                placeholder="Opsional"
                className={inputClass}
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-semibold text-stone-800">Usia</span>
              <input
                type="number"
                inputMode="numeric"
                value={age}
                onChange={(event) => setAge(event.target.value)}
                placeholder="Contoh: 28"
                aria-invalid={Boolean(errors.age)}
                className={inputClass}
              />
              {errors.age && <span className="text-xs text-rose-700">{errors.age}</span>}
            </label>
          </div>

          <label className="block space-y-2">
            <span className="flex items-baseline justify-between gap-4">
              <span className="text-sm font-semibold text-stone-800">
                Keluhan utama {COMPLAINT_REQUIRED ? '' : '(opsional)'}
              </span>
              <span className="text-xs tabular-nums text-stone-500">
                {mainComplaint.length}/{COMPLAINT_MAX_LENGTH} karakter
              </span>
            </span>
            <textarea
              value={mainComplaint}
              onChange={(event) => setMainComplaint(event.target.value.slice(0, COMPLAINT_MAX_LENGTH))}
              maxLength={COMPLAINT_MAX_LENGTH}
              rows={5}
              aria-invalid={Boolean(errors.mainComplaint)}
              placeholder="Contoh: Dada sering sesak sejak 3 bulan lalu, terutama malam hari..."
              className={`${inputClass} resize-none`}
            />
            {errors.mainComplaint && <span className="text-xs text-rose-700">{errors.mainComplaint}</span>}
          </label>

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-stone-800">Tentang keluhan tersebut (opsional)</legend>
            <label className="block space-y-2">
              <span className="text-xs font-medium text-stone-600">Sudah berapa lama?</span>
              <input
                type="text"
                value={complaintDuration}
                onChange={(event) => setComplaintDuration(event.target.value)}
                maxLength={COMPLAINT_DETAIL_MAX_LENGTH}
                placeholder="Contoh: sekitar 3 bulan"
                className={inputClass}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-medium text-stone-600">Seberapa sering muncul?</span>
              <input
                type="text"
                value={complaintFrequency}
                onChange={(event) => setComplaintFrequency(event.target.value)}
                maxLength={COMPLAINT_DETAIL_MAX_LENGTH}
                placeholder="Contoh: hampir setiap malam"
                className={inputClass}
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-medium text-stone-600">Bagaimana dampaknya pada aktivitas sehari-hari?</span>
              <input
                type="text"
                value={complaintImpact}
                onChange={(event) => setComplaintImpact(event.target.value)}
                maxLength={COMPLAINT_DETAIL_MAX_LENGTH}
                placeholder="Contoh: sulit berkonsentrasi saat bekerja"
                className={inputClass}
              />
            </label>
          </fieldset>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-stone-800">Riwayat medis (jika mau)</span>
            <textarea
              value={medicalHistory}
              onChange={(event) => setMedicalHistory(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Penyakit yang pernah atau sedang dialami, obat yang rutin dikonsumsi"
              className={`${inputClass} resize-none`}
            />
            <span className="block text-xs text-stone-500">Riwayat medis tidak masuk ke perhitungan skor.</span>
          </label>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="group inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/10 transition hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              Lanjut ke Pertanyaan
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}