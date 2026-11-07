import type { PillarId } from '@/data/pillars';

// Sumber: Master Questionnaire HHS v1.0. Teks pertanyaan, deskripsi skor, dan ID tag diekstrak langsung dari PDF.
// Label Micro-Tag (bahasa Indonesia) tidak ada di PDF dan merupakan draf terjemahan yang perlu ditinjau tim.

export type IndicatorId =
  | 'PL-01'
  | 'PL-02'
  | 'PL-03'
  | 'PM-01'
  | 'PM-02'
  | 'PM-03'
  | 'PP-01'
  | 'PP-02'
  | 'PP-03'
  | 'FX-01'
  | 'FX-02'
  | 'FX-03';

export interface MicroTag {
  id: string;
  label: string;
  isOther: boolean;
}

export type ScoreDescriptions = [string, string, string, string, string];

export interface Indicator {
  id: IndicatorId;
  pillar: PillarId;
  title: string;
  question: string;
  /** Indeks 0 = skor 1, indeks 4 = skor 5. */
  scoreDescriptions: ScoreDescriptions;
  microTags: MicroTag[];
  /** Catatan asli dari dokumen HHS (untuk implementer/konsultan, bukan teks pasien). */
  note?: string;
  /** Rekomendasi khusus indikator. Belum ditulis; diisi tim sebelum rilis. */
  recommendation?: string;
}

export const INDICATORS: Indicator[] = [
  {
    id: 'PL-01',
    pillar: 'hidup',
    title: 'Kualitas dan Kuantitas Tidur',
    question: 'Bagaimana kualitas dan kecukupan tidur Anda selama 7 hari terakhir?',
    scoreDescriptions: [
      'Tidur sangat terganggu, durasi sering jauh dari kebutuhan, dan hampir selalu tidak segar setelah bangun.',
      'Sering mengalami gangguan tidur, durasi kurang, atau merasa lelah setelah bangun.',
      'Tidur cukup pada sebagian hari, tetapi masih ada ketidakteraturan atau gangguan.',
      'Tidur relatif teratur dan cukup; umumnya merasa segar saat bangun.',
      'Tidur konsisten, memenuhi kebutuhan pribadi, dan umumnya merasa pulih setelah istirahat.',
    ],
    microTags: [
      { id: 'SLEEP_DIFFICULTY', label: 'Sulit memulai tidur', isOther: false },
      { id: 'SLEEP_AWAKENING', label: 'Sering terbangun di tengah malam', isOther: false },
      { id: 'EARLY_AWAKENING', label: 'Bangun terlalu dini dan sulit tidur lagi', isOther: false },
      { id: 'UNREFRESHED_SLEEP', label: 'Bangun tidur terasa berat atau tidak segar', isOther: false },
      { id: 'NIGHTMARE', label: 'Mimpi buruk atau merasa dikejar', isOther: false },
      { id: 'SLEEP_PARALYSIS', label: 'Terbangun dengan tubuh sulit digerakkan (tertindih)', isOther: false },
      { id: 'DAYTIME_SLEEPINESS', label: 'Sangat mengantuk di siang hari', isOther: false },
      { id: 'SLEEP_OTHER', label: 'Lainnya', isOther: true },
    ],
  },
  {
    id: 'PL-02',
    pillar: 'hidup',
    title: 'Aktivitas Fisik dan Olahraga',
    question: 'Seberapa aktif Anda melakukan aktivitas fisik selama 7 hari terakhir?',
    scoreDescriptions: [
      'Hampir tidak melakukan aktivitas fisik di luar kebutuhan dasar sehari-hari.',
      'Aktivitas fisik sangat terbatas dan sebagian besar waktu dihabiskan dengan duduk.',
      'Melakukan aktivitas fisik sesekali, tetapi belum konsisten.',
      'Rutin bergerak atau berolahraga dan cukup aktif dalam kegiatan sehari-hari.',
      'Aktivitas fisik teratur dan bervariasi, sesuai kemampuan serta kondisi tubuh.',
    ],
    microTags: [
      { id: 'LOW_MOVEMENT', label: 'Jarang bergerak', isOther: false },
      { id: 'PROLONGED_SITTING', label: 'Terlalu lama duduk', isOther: false },
      { id: 'LOW_EXERCISE', label: 'Hampir tidak berolahraga', isOther: false },
      { id: 'EXERCISE_FATIGUE', label: 'Mudah lelah saat berolahraga', isOther: false },
      { id: 'MOVEMENT_LIMITATION', label: 'Gerakan terbatas oleh kondisi tubuh', isOther: false },
      { id: 'NO_EXERCISE_ROUTINE', label: 'Belum punya rutinitas olahraga', isOther: false },
      { id: 'ACTIVITY_OTHER', label: 'Lainnya', isOther: true },
    ],
  },
  {
    id: 'PL-03',
    pillar: 'hidup',
    title: 'Keteraturan Jadwal dan Ritme Harian',
    question: 'Seberapa teratur jadwal tidur, bangun, makan, dan aktivitas harian Anda selama 7 hari terakhir?',
    scoreDescriptions: [
      'Hampir seluruh jadwal harian tidak teratur atau berubah drastis.',
      'Jadwal tidur, makan, dan aktivitas sering berubah serta sulit dipertahankan.',
      'Memiliki jadwal dasar, tetapi konsistensinya masih berubah-ubah.',
      'Sebagian besar aktivitas harian berlangsung cukup konsisten.',
      'Rutinitas harian konsisten dan tetap fleksibel mengikuti kebutuhan.',
    ],
    microTags: [
      { id: 'SLEEP_SCHEDULE_SHIFT', label: 'Jam tidur sering berubah', isOther: false },
      { id: 'WAKE_SCHEDULE_SHIFT', label: 'Jam bangun sering berubah', isOther: false },
      { id: 'MEAL_SCHEDULE_SHIFT', label: 'Jam makan sering berubah', isOther: false },
      { id: 'FREQUENT_OVERNIGHT', label: 'Sering begadang atau terjaga semalaman', isOther: false },
      { id: 'DAILY_ROUTINE_UNSTABLE', label: 'Rutinitas harian tidak stabil', isOther: false },
      { id: 'CIRCADIAN_OTHER', label: 'Lainnya', isOther: true },
    ],
  },
  {
    id: 'PM-01',
    pillar: 'makan',
    title: 'Kecukupan Hidrasi',
    question: 'Seberapa baik Anda memenuhi kebutuhan cairan selama 7 hari terakhir?',
    scoreDescriptions: [
      'Asupan cairan sangat terbatas dan sering merasa haus.',
      'Sering tidak memenuhi kebutuhan cairan dan jarang memperhatikan asupan minum.',
      'Asupan cairan cukup pada sebagian hari, tetapi belum konsisten.',
      'Umumnya memenuhi kebutuhan cairan sesuai aktivitas dan kondisi.',
      'Konsisten memenuhi kebutuhan cairan pribadi sesuai aktivitas dan kondisi.',
    ],
    microTags: [
      { id: 'FORGET_DRINKING', label: 'Sering lupa minum', isOther: false },
      { id: 'LOW_WATER_INTAKE', label: 'Asupan minum sedikit', isOther: false },
      { id: 'FREQUENT_THIRST', label: 'Sering merasa haus', isOther: false },
      { id: 'HYDRATION_INCONSISTENT', label: 'Asupan minum tidak konsisten', isOther: false },
      { id: 'HIGH_FLUID_NEED', label: 'Kebutuhan cairan tinggi (misalnya aktivitas berat atau cuaca panas)', isOther: false },
      { id: 'HYDRATION_OTHER', label: 'Lainnya', isOther: true },
    ],
    note: 'Kebutuhan cairan berbeda menurut individu, aktivitas, cuaca, dan kondisi kesehatan. Jangan menetapkan satu angka kebutuhan yang berlaku untuk semua responden.',
  },
  {
    id: 'PM-02',
    pillar: 'makan',
    title: 'Keseimbangan Nutrisi',
    question: 'Seberapa seimbang dan beragam makanan yang Anda konsumsi selama 7 hari terakhir?',
    scoreDescriptions: [
      'Pilihan makanan sangat terbatas dan sering tidak mencukupi kebutuhan nutrisi.',
      'Variasi makanan rendah; beberapa kelompok pangan penting jarang dikonsumsi.',
      'Makanan cukup beragam, tetapi komposisi dan konsistensinya belum stabil.',
      'Pilihan makanan umumnya beragam dengan komposisi yang cukup seimbang.',
      'Konsisten mengonsumsi makanan beragam dan seimbang sesuai kebutuhan.',
    ],
    microTags: [
      { id: 'LOW_VEGETABLE', label: 'Jarang makan sayur', isOther: false },
      { id: 'LOW_FRUIT', label: 'Jarang makan buah', isOther: false },
      { id: 'LOW_PROTEIN_VARIETY', label: 'Sumber protein kurang beragam', isOther: false },
      { id: 'LOW_FIBER', label: 'Asupan serat rendah', isOther: false },
      { id: 'MEAL_SKIPPING', label: 'Sering melewatkan waktu makan', isOther: false },
      { id: 'NUTRITION_IMBALANCE', label: 'Komposisi makanan tidak seimbang', isOther: false },
      { id: 'NUTRITION_OTHER', label: 'Lainnya', isOther: true },
    ],
  },
  {
    id: 'PM-03',
    pillar: 'makan',
    title: 'Kualitas dan Keamanan Bahan Pangan',
    question: 'Bagaimana Anda memilih dan memastikan kualitas serta keamanan makanan yang dikonsumsi selama 7 hari terakhir?',
    scoreDescriptions: [
      'Sering mengonsumsi makanan yang kualitas atau keamanannya diragukan.',
      'Jarang mempertimbangkan kualitas bahan, kebersihan, atau keamanan makanan.',
      'Mempertimbangkan beberapa aspek kualitas dan keamanan, tetapi belum konsisten.',
      'Umumnya memilih bahan yang baik dan memperhatikan kebersihan serta keamanan pangan.',
      'Konsisten memperhatikan kualitas bahan, variasi, kebersihan, pengolahan, dan penyimpanan makanan.',
    ],
    microTags: [
      { id: 'HIGH_ULTRA_PROCESSED', label: 'Sering makan makanan ultra-olahan', isOther: false },
      { id: 'LOW_FRESH_FOOD', label: 'Jarang makan bahan segar', isOther: false },
      { id: 'FOOD_HYGIENE', label: 'Kebersihan makanan kurang terjaga', isOther: false },
      { id: 'FOOD_STORAGE', label: 'Penyimpanan makanan kurang tepat', isOther: false },
      { id: 'FOOD_SAFETY', label: 'Khawatir dengan keamanan makanan', isOther: false },
      { id: 'FOOD_OTHER', label: 'Lainnya', isOther: true },
    ],
    note: 'Makanan olahan tidak otomatis tidak sehat. Penilaian perlu membedakan jenis pengolahan, kandungan, kebersihan, dan keamanan pangan.',
  },
  {
    id: 'PP-01',
    pillar: 'pikir',
    title: 'Kesejahteraan Psikologis dan Emosi Positif',
    question: 'Seberapa baik kondisi kesejahteraan emosional Anda selama 7 hari terakhir?',
    scoreDescriptions: [
      'Hampir setiap hari mengalami tekanan emosional berat atau kehilangan minat hingga mengganggu aktivitas.',
      'Sering mengalami suasana hati negatif dan kesulitan menikmati kegiatan.',
      'Suasana hati berubah-ubah, tetapi masih dapat menikmati beberapa kegiatan.',
      'Suasana hati umumnya cukup baik dan masih dapat menghargai hal-hal positif.',
      'Merasa cukup sejahtera secara emosional, menikmati kegiatan, dan memiliki pandangan yang realistis.',
    ],
    microTags: [
      { id: 'LOW_INTEREST', label: 'Kurang berminat pada kegiatan yang biasanya disukai', isOther: false },
      { id: 'LOW_MOTIVATION', label: 'Sulit menemukan semangat atau motivasi', isOther: false },
      { id: 'HOPELESSNESS', label: 'Merasa putus asa atau tanpa harapan', isOther: false },
      { id: 'LOW_POSITIVE_EMOTION', label: 'Jarang merasakan emosi positif', isOther: false },
      { id: 'LOW_LIFE_SATISFACTION', label: 'Kurang puas dengan kehidupan saat ini', isOther: false },
      { id: 'EMOTION_OTHER', label: 'Lainnya', isOther: true },
    ],
    note: 'Skor rendah bukan diagnosis gangguan mental. Gunakan alur bantuan/rujukan terpisah bila responden mengalami distress berat.',
  },
  {
    id: 'PP-02',
    pillar: 'pikir',
    title: 'Pengelolaan Emosi Negatif dan Konflik',
    question: 'Seberapa baik Anda mengelola emosi negatif dan menghadapi konflik selama 7 hari terakhir?',
    scoreDescriptions: [
      'Emosi negatif sulit dikendalikan dan sangat mengganggu hubungan atau aktivitas.',
      'Sering kesulitan mengelola kemarahan, kekecewaan, atau konflik.',
      'Dapat mengelola emosi dalam beberapa situasi, tetapi masih mengalami kesulitan.',
      'Umumnya mampu mengelola emosi dan konflik dengan cara yang sehat.',
      'Mampu mengenali, mengelola, dan mengekspresikan emosi secara konstruktif.',
    ],
    microTags: [
      { id: 'ANGER_FREQUENT', label: 'Sering marah', isOther: false },
      { id: 'RESENTMENT', label: 'Menyimpan dendam atau rasa kecewa', isOther: false },
      { id: 'SOCIAL_COMPARISON', label: 'Sering membandingkan diri dengan orang lain', isOther: false },
      { id: 'ENVY_DISTRESS', label: 'Merasa tidak nyaman karena rasa iri', isOther: false },
      { id: 'CONFLICT_REPEATED', label: 'Konflik yang berulang', isOther: false },
      { id: 'EMOTIONAL_CONTROL', label: 'Sulit mengendalikan emosi', isOther: false },
      { id: 'CONFLICT_OTHER', label: 'Lainnya', isOther: true },
    ],
  },
  {
    id: 'PP-03',
    pillar: 'pikir',
    title: 'Pengelolaan Kecemasan dan Pikiran Berulang',
    question: 'Seberapa baik Anda mengelola kekhawatiran, kecemasan, dan pikiran berulang selama 7 hari terakhir?',
    scoreDescriptions: [
      'Pikiran atau kecemasan sangat mengganggu aktivitas dan sulit dikendalikan.',
      'Sering sulit menghentikan kekhawatiran sehingga memengaruhi konsentrasi.',
      'Kadang mengalami kecemasan atau pikiran berulang, tetapi masih dapat mengelolanya.',
      'Umumnya mampu mengelola kekhawatiran dan mengalihkan fokus.',
      'Memiliki strategi pengelolaan stres yang efektif dan mampu menghadapi ketidakpastian.',
    ],
    microTags: [
      { id: 'OVERTHINKING', label: 'Terlalu banyak memikirkan sesuatu', isOther: false },
      { id: 'EXCESSIVE_WORRY', label: 'Khawatir berlebihan', isOther: false },
      { id: 'DIFFICULT_TO_FOCUS', label: 'Sulit berkonsentrasi', isOther: false },
      { id: 'FEAR_OF_FUTURE', label: 'Takut terhadap masa depan', isOther: false },
      { id: 'RUMINATION', label: 'Pikiran yang sama terus berulang', isOther: false },
      { id: 'DIFFICULT_TO_RELAX', label: 'Sulit merasa rileks', isOther: false },
      { id: 'ANXIETY_OTHER', label: 'Lainnya', isOther: true },
    ],
  },
  {
    id: 'FX-01',
    pillar: 'faktorx',
    title: 'Kesejahteraan Spiritual dan Makna Hidup',
    question: 'Seberapa baik Anda menjaga aktivitas spiritual, refleksi diri, dan hubungan dengan nilai-nilai yang Anda yakini selama 7 hari terakhir?',
    scoreDescriptions: [
      'Merasa kehilangan makna dan sulit menemukan ketenangan atau dukungan spiritual.',
      'Aktivitas spiritual atau refleksi jarang dilakukan dan belum dirasakan sebagai sumber dukungan.',
      'Memiliki aktivitas spiritual atau refleksi, tetapi belum konsisten.',
      'Umumnya menjaga aktivitas spiritual dan dapat menemukan makna dalam kehidupan.',
      'Memiliki praktik spiritual atau refleksi yang bermakna dan mendukung kehidupan sehari-hari.',
    ],
    microTags: [
      { id: 'LOSS_OF_MEANING', label: 'Merasa kehilangan makna', isOther: false },
      { id: 'SPIRITUAL_INCONSISTENCY', label: 'Aktivitas spiritual belum konsisten', isOther: false },
      { id: 'LACK_OF_REFLECTION', label: 'Jarang punya waktu untuk merenung', isOther: false },
      { id: 'LOW_SPIRITUAL_SUPPORT', label: 'Kurang dukungan spiritual', isOther: false },
      { id: 'SPIRITUAL_OTHER', label: 'Lainnya', isOther: true },
    ],
    note: 'Indikator ini bukan ukuran iman, kesalehan, atau nilai seseorang di hadapan Allah. Responden tidak boleh dipermalukan atau dipaksa menjawab.',
  },
  {
    id: 'FX-02',
    pillar: 'faktorx',
    title: 'Lingkungan dan Dukungan Sosial',
    question: 'Seberapa mendukung lingkungan tempat tinggal, pekerjaan atau pendidikan, serta hubungan sosial Anda selama 7 hari terakhir?',
    scoreDescriptions: [
      'Lingkungan terasa sangat tidak aman atau tidak mendukung dan hampir tidak memiliki dukungan sosial.',
      'Menghadapi banyak hambatan lingkungan dan dukungan sosial sangat terbatas.',
      'Memiliki sebagian dukungan, tetapi masih menghadapi hambatan yang berarti.',
      'Lingkungan relatif aman dan dukungan sosial cukup memadai.',
      'Lingkungan aman dan mendukung, dengan hubungan sosial yang kuat serta suportif.',
    ],
    microTags: [
      { id: 'LOW_SOCIAL_SUPPORT', label: 'Dukungan sosial kurang', isOther: false },
      { id: 'UNSAFE_ENVIRONMENT', label: 'Lingkungan terasa tidak aman', isOther: false },
      { id: 'NOISY_ENVIRONMENT', label: 'Lingkungan bising', isOther: false },
      { id: 'POOR_SANITATION', label: 'Sanitasi atau kebersihan lingkungan buruk', isOther: false },
      { id: 'SOCIAL_ISOLATION', label: 'Merasa terisolasi secara sosial', isOther: false },
      { id: 'RELATIONSHIP_STRESS', label: 'Tekanan dalam hubungan dengan orang terdekat', isOther: false },
      { id: 'ENVIRONMENT_OTHER', label: 'Lainnya', isOther: true },
    ],
  },
  {
    id: 'FX-03',
    pillar: 'faktorx',
    title: 'Akses Layanan Kesehatan dan Pencegahan',
    question: 'Seberapa mudah Anda mendapatkan informasi, bantuan, dan layanan kesehatan yang diperlukan? Nilai berdasarkan akses yang tersedia atau Anda perkirakan tersedia, meskipun tidak sedang membutuhkan layanan.',
    scoreDescriptions: [
      'Tidak memiliki akses memadai terhadap layanan atau bantuan kesehatan yang diperlukan.',
      'Menghadapi hambatan besar untuk memperoleh layanan kesehatan.',
      'Memiliki akses dasar, tetapi masih terdapat beberapa hambatan.',
      'Relatif mudah memperoleh informasi atau layanan ketika diperlukan.',
      'Memiliki akses yang memadai, mengetahui sumber bantuan kesehatan, dan dapat menggunakannya.',
    ],
    microTags: [
      { id: 'COST_BARRIER', label: 'Terkendala biaya', isOther: false },
      { id: 'DISTANCE_BARRIER', label: 'Terkendala jarak', isOther: false },
      { id: 'TRANSPORT_BARRIER', label: 'Terkendala transportasi', isOther: false },
      { id: 'SERVICE_AVAILABILITY', label: 'Layanan kesehatan sulit ditemukan atau terbatas', isOther: false },
      { id: 'HEALTH_INFORMATION', label: 'Kurang informasi kesehatan yang dapat dipercaya', isOther: false },
      { id: 'HEALTHCARE_OTHER', label: 'Lainnya', isOther: true },
    ],
  },
];

export const INDICATOR_BY_ID = Object.fromEntries(INDICATORS.map((indicator) => [indicator.id, indicator])) as Record<IndicatorId, Indicator>;

/** Micro-Tags hanya ditampilkan untuk skor 1 atau 2 (HHS bagian 2). */
export const MICRO_TAG_MAX_SCORE = 2;

/** Panjang maksimal keterangan tag OTHER (HHS menyarankan maksimal 250 karakter). */
export const MAX_OTHER_NOTE_LENGTH = 250;

/**
 * Tag yang membuat anjuran konsultasi lebih tegas di hasil sementara.
 * Usulan awal; daftar finalnya perlu ditinjau tenaga kesehatan/tim lapangan.
 */
export const CONCERNING_TAG_IDS: readonly string[] = ['HOPELESSNESS', 'UNSAFE_ENVIRONMENT'];