import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ShieldAlert } from 'lucide-react';
import type { PatientIntake } from '@/types/intake';

interface PatientIntakeFormProps {
  onSubmit: (intake: PatientIntake) => void;
  onBack: () => void;
}

interface FormErrors {
  age?: string;
  consent?: string;
}

const MIN_AGE = 10;
const MAX_AGE = 120;

const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 transition focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20';

export default function PatientIntakeForm({ onSubmit, onBack }: PatientIntakeFormProps) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [mainComplaint, setMainComplaint] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [redFlag, setRedFlag] = useState(false);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedAge = Number(age);
    const nextErrors: FormErrors = {};
    if (!age || !Number.isInteger(parsedAge) || parsedAge < MIN_AGE || parsedAge > MAX_AGE) {
      nextErrors.age = `Masukkan usia antara ${MIN_AGE} dan ${MAX_AGE} tahun.`;
    }
    if (!consent) {
      nextErrors.consent = 'Mohon centang persetujuan agar kami dapat melanjutkan.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({
      name: name.trim(),
      age: parsedAge,
      mainComplaint: mainComplaint.trim(),
      medicalHistory: medicalHistory.trim(),
      redFlag,
      consent,
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
          Informasi ini membantu kami memberi hasil yang lebih relevan. Anda boleh mengisi nama panggilan saja.
        </p>

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
            <span className="text-sm font-semibold text-stone-800">Keluhan utama saat ini</span>
            <textarea
              value={mainComplaint}
              onChange={(event) => setMainComplaint(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Misalnya: sering cemas, sulit tidur, atau mudah lelah"
              className={`${inputClass} resize-none`}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-stone-800">Riwayat medis (opsional)</span>
            <textarea
              value={medicalHistory}
              onChange={(event) => setMedicalHistory(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Penyakit yang pernah atau sedang dialami, obat yang rutin dikonsumsi"
              className={`${inputClass} resize-none`}
            />
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-stone-800">
              Dalam sebulan terakhir, apakah Anda pernah pingsan, sesak napas berat, nyeri dada hebat, atau
              memiliki pikiran untuk menyakiti diri sendiri?
            </legend>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: false, label: 'Tidak' },
                { value: true, label: 'Ya' },
              ].map((option) => {
                const selected = redFlag === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setRedFlag(option.value)}
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition ${
                      selected
                        ? 'border-teal-700 bg-teal-700 text-white'
                        : 'border-stone-300 bg-white text-stone-700 hover:border-teal-400'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {redFlag && (
              <div className="animate-fade-up flex gap-3 rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
                <p className="text-sm leading-[1.5] text-rose-900">
                  Gejala tersebut memerlukan pertolongan medis segera. Hubungi <strong>119</strong> atau kunjungi
                  unit gawat darurat terdekat sebelum melanjutkan analisis ini.
                </p>
              </div>
            )}
          </fieldset>

          <div className="space-y-2">
            <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-4">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-stone-300 text-teal-700 focus:ring-teal-600"
              />
              <span className="text-sm leading-[1.5] text-stone-700">
                Saya menyetujui data yang saya isi digunakan hanya untuk menyusun analisis ini, dan saya memahami
                bahwa hasilnya bukan diagnosis medis.
              </span>
            </label>
            {errors.consent && <p className="text-xs text-rose-700">{errors.consent}</p>}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="group inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/10 transition hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
            >
              Lanjut ke Kuesioner
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
