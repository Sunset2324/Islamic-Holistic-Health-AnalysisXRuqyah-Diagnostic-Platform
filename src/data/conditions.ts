export type RuqyahConditionId = 'A' | 'B' | 'C' | 'D';

export interface ConditionLens {
  medis: string;
  tcm: string;
  thibbunnabawi: string;
}

export interface RuqyahCondition {
  id: RuqyahConditionId;
  name: string;
  arabicName: string;
  dominantDrop: string;
  traits: string;
  lenses: ConditionLens;
  recommendations: string[];
  urgent: boolean;
}

export const RUQYAH_CONDITIONS: Record<RuqyahConditionId, RuqyahCondition> = {
  A: {
    id: 'A',
    name: 'Potensi Ain',
    arabicName: 'العين',
    dominantDrop: 'Pola Pikir + Faktor X',
    traits: 'Mudah cemas, merasa insecure, dan merasa hidup tidak berkah.',
    lenses: {
      medis: 'Psikosomatis dan kecemasan (anxiety) yang memengaruhi tubuh.',
      tcm: 'Shen (jiwa) tidak stabil dan Qi Hati mengalami stagnasi.',
      thibbunnabawi: 'Penyakit hati akibat kurangnya dzikir.',
    },
    recommendations: [
      'Membaca dzikir pagi dan petang secara rutin.',
      'Membaca Ayat Kursi dan Al-Mu\'awwidzatain sebelum tidur.',
      'Mengucapkan "Masya Allah, Tabarakallah" ketika melihat sesuatu yang mengagumkan.',
      'Memperbanyak istighfar dan doa perlindungan.',
      'Berkonsultasi dengan psikolog bila rasa cemas terus berlanjut.',
    ],
    urgent: false,
  },
  B: {
    id: 'B',
    name: 'Potensi Hasad',
    arabicName: 'الحسد',
    dominantDrop: 'Pola Pikir + Pola Hidup',
    traits: 'Mudah dendam, sering membandingkan diri, dan hati terasa keras.',
    lenses: {
      medis: 'Kadar kortisol (hormon stres) yang tinggi dan daya tahan tubuh yang menurun.',
      tcm: 'Api Hati berlebihan.',
      thibbunnabawi: 'Hati yang keras dan kurang bersyukur.',
    },
    recommendations: [
      'Membiasakan diri mensyukuri nikmat setiap hari.',
      'Membaca Surat Al-Falaq ketika merasa tidak nyaman terhadap orang lain.',
      'Melatih diri untuk memaafkan dan melepaskan dendam.',
      'Mengurangi kebiasaan membandingkan diri di media sosial.',
      'Mencukupi istirahat dan menjaga pola hidup yang teratur.',
    ],
    urgent: false,
  },
  C: {
    id: 'C',
    name: 'Potensi Sihr',
    arabicName: 'السحر',
    dominantDrop: 'Pola Makan + Pola Hidup',
    traits: 'Mual, mimpi buruk, badan terasa berat, atau alergi yang tidak jelas penyebabnya.',
    lenses: {
      medis: 'Gangguan metabolik atau saraf yang perlu diperiksa secara medis.',
      tcm: 'Yin defisiensi dan racun yang menumpuk dalam tubuh.',
      thibbunnabawi: 'Konsumsi yang belum terjamin halal dan thayyib.',
    },
    recommendations: [
      'Memastikan kehalalan dan kebersihan makanan serta minuman yang dikonsumsi.',
      'Memeriksakan keluhan fisik yang berulang ke dokter.',
      'Membaca Ayat Kursi dan Al-Mu\'awwidzatain secara rutin.',
      'Berkonsultasi dengan ustadz atau pengruqyah terpercaya untuk ruqyah syar\'iyyah.',
      'Berkonsultasikan dengan dokter sebelum mengonsumsi herbal apa pun.',
    ],
    urgent: false,
  },
  D: {
    id: 'D',
    name: 'Potensi Mas Jin',
    arabicName: 'المس',
    dominantDrop: 'Seluruh pilar turun ekstrem',
    traits: 'Penolakan terhadap ibadah, disosiasi, dan gejala fisik yang berat.',
    lenses: {
      medis: 'Kemungkinan gangguan neurologis atau psikiatri berat yang perlu penanganan segera.',
      tcm: 'Qi dan Shen sangat lemah.',
      thibbunnabawi: 'Tsaghrah spiritual yang besar dan perlu perhatian serius.',
    },
    recommendations: [
      'Segera berkonsultasi dengan dokter atau psikiater tanpa menunda.',
      'Libatkan keluarga atau orang terdekat yang dipercaya untuk mendampingi.',
      'Ruqyah syar\'iyyah hanya dilakukan oleh ustadz atau pengruqyah yang kredibel, bersamaan dengan penanganan medis.',
      'Jika muncul pikiran untuk menyakiti diri sendiri atau orang lain, hubungi layanan darurat (119) sekarang juga.',
    ],
    urgent: true,
  },
};
