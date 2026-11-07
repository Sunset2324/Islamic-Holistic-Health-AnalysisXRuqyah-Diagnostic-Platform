/** Versi instrumen yang ditampilkan bersama hasil (HHS bagian 4). */
export const QUESTIONNAIRE_VERSION = 'HHS v1.0';

/** Versi aturan perhitungan (rumus HHS dan aturan A-D). Naikkan setiap kali aturan berubah. */
export const ALGORITHM_VERSION = '1.0.0';

export const ASSESSMENT_PERIOD_LABEL = '7 hari terakhir';

/** Layanan darurat medik Kemenkes. */
export const EMERGENCY_NUMBER = '119';

/**
 * Keputusan produk: hasil kondisi A-D ditampilkan ke pasien di hasil sementara.
 * Ubah ke false bila hasil A-D hanya boleh dilihat konsultan.
 */
export const SHOW_RUQYAH_TO_PATIENT = true;

/** Blueprint v1.1 menulis keluhan utama "wajib", HHS v1.0 menulis "opsional". Saat ini mengikuti HHS. */
export const COMPLAINT_REQUIRED = false;
export const COMPLAINT_MAX_LENGTH = 1000;
export const COMPLAINT_DETAIL_MAX_LENGTH = 200;