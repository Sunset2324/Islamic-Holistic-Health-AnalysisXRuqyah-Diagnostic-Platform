import React from 'react';
import { 
  Heart, 
  Moon, 
  Brain, 
  BookOpen, 
  AlertCircle, 
  CheckCircle2,
  Sparkles,
  Tag 
} from 'lucide-react';

// Definisikan tipe ConcerningTag secara fleksibel 
// (Jika Anda sudah mendefinisikannya di src/types, Anda bisa mengimpornya dari sana)
interface ConcerningTag {
  label?: string;
  name?: string;
  text?: string;
  [key: string]: any;
}

interface ConsultationAdviceCardProps {
  lowestPillar?: 'makan' | 'hidup' | 'pikir' | 'faktorX';
  ruqyahCondition?: string; 
  primaryComplaint?: string;
  concerning?: ConcerningTag[]; // <-- TAMBAHKAN PROP INI
}

const ConsultationAdviceCard: React.FC<ConsultationAdviceCardProps> = ({ 
  lowestPillar = 'pikir', 
  ruqyahCondition = "Ketidakseimbangan Umum",
  primaryComplaint = "Keluhan umum",
  concerning = [] // <-- Berikan nilai default array kosong
}) => {
  
  const getPriorityAdvice = () => {
    switch (lowestPillar) {
      case 'makan':
        return {
          icon: <Heart className="w-5 h-5 text-amber-600" />,
          title: "Fokus Perbaikan: Pola Makan & Adab",
          description: "Tubuh Anda memberi sinyal bahwa sistem pencernaan dan metabolisme perlu diatur ulang.",
          action: "Mulai dengan adab makan: duduk, baca Basmalah, kunyah perlahan (30x), dan berhenti sebelum kenyang. Hindari makan berat 2 jam sebelum tidur."
        };
      case 'hidup':
        return {
          icon: <Moon className="w-5 h-5 text-indigo-600" />,
          title: "Fokus Perbaikan: Kualitas Istirahat",
          description: "Pola tidur yang tidak teratur menghambat proses detoksifikasi alami tubuh dan menenangkan jiwa.",
          action: "Tetapkan jam tidur yang konsisten (misal: 22.00 - 05.00). Matikan layar gadget 1 jam sebelum tidur, dan pastikan kamar gelap serta sejuk."
        };
      case 'pikir':
        return {
          icon: <Brain className="w-5 h-5 text-rose-600" />,
          title: "Fokus Perbaikan: Ketenangan Pikiran",
          description: "Beban pikiran dan overthinking sedang menguras energi emosional Anda secara signifikan.",
          action: "Luangkan 5 menit setiap malam untuk 'brain dump' (menuliskan semua yang dipikirkan) di kertas, lalu ucapkan istighfar 100x untuk melepaskan beban."
        };
      default:
        return {
          icon: <Sparkles className="w-5 h-5 text-emerald-600" />,
          title: "Fokus Perbaikan: Koneksi Spiritual",
          description: "Ada celah dalam rutinitas spiritual yang bisa diperkuat sebagai benteng pertahanan diri.",
          action: "Jadikan shalat tepat waktu sebagai jangkar harian. Tambahkan dzikir pagi dan petang sebagai 'pagar' perlindungan."
        };
    }
  };

  const priority = getPriorityAdvice();

  // Fungsi bantu untuk mengambil teks dari objek ConcerningTag
  const getTagLabel = (tag: ConcerningTag) => {
    return tag.label || tag.name || tag.text || 'Gejala Tidak Dikenal';
  };

  return (
    <div className="bg-[#FDFBF7] border border-[#E2E8F0] rounded-2xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-100 rounded-lg">
          <BookOpen className="w-6 h-6 text-emerald-700" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-800">Rekomendasi & Langkah Perbaikan</h3>
          <p className="text-sm text-slate-600 mt-1">
            Berdasarkan analisis holistik Anda, berikut adalah langkah praktis yang bisa dimulai hari ini.
          </p>
        </div>
      </div>

      {/* Concerning Tags / Micro-tags Section (BARU) */}
      {concerning.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2">
            <Tag className="w-5 h-5 text-rose-600" />
            Gejala / Catatan Khusus Terdeteksi
          </h4>
          <div className="flex flex-wrap gap-2">
            {concerning.map((tag, index) => (
              <span 
                key={index} 
                className="px-3 py-1.5 bg-rose-50 text-rose-700 text-sm font-medium rounded-full border border-rose-200 shadow-sm"
              >
                {getTagLabel(tag)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Priority Focus Area */}
      <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          {priority.icon}
          <h4 className="font-semibold text-slate-800">{priority.title}</h4>
        </div>
        <p className="text-sm text-slate-600 mb-3">{priority.description}</p>
        <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r-md">
          <p className="text-sm font-medium text-amber-900">
            💡 <span className="font-bold">Tindakan Hari Ini:</span> {priority.action}
          </p>
        </div>
      </div>

      {/* Spiritual & Ruqyah Mandiri Section */}
      <div className="space-y-3">
        <h4 className="font-semibold text-slate-800 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          Amalan & Ruqyah Mandiri
        </h4>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium text-slate-800 text-sm">Perlindungan Malam</span>
              <p className="text-sm text-slate-600">Baca Ayat Kursi dan 3 Qul (Al-Ikhlas, Al-Falaq, An-Nas) lalu tiup ke telapak tangan dan usapkan ke tubuh sebelum tidur.</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium text-slate-800 text-sm">Terapi Murottal</span>
              <p className="text-sm text-slate-600">Perdengarkan Surat Al-Baqarah di rumah minimal 3x seminggu untuk membersihkan energi negatif.</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium text-slate-800 text-sm">Ruqyah Air Minum</span>
              <p className="text-sm text-slate-600">Baca Al-Fatihah 7x ke dalam air minum, lalu minumlah dengan niat penyembuhan (syifa).</p>
            </div>
          </li>
        </ul>
      </div>

      {/* Disclaimer Etis */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold">Catatan Penting:</span> Rekomendasi ini bersifat edukatif untuk mendukung gaya hidup sehat dan spiritual. 
          Platform ini <span className="font-semibold">bukan pengganti diagnosis medis profesional</span>. 
          Jika gejala {primaryComplaint.toLowerCase()} berlanjut atau memburuk, segera konsultasikan dengan dokter atau Ustadz Ruqyah bersertifikat secara langsung.
        </p>
      </div>
    </div>
  );
};

export default ConsultationAdviceCard;