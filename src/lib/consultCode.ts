/**
 * Bantuan untuk kode konsultasi (blueprint bagian 11, usulan 4, 6, 7).
 *
 * Privasi: yang keluar dari aplikasi hanya KODE (8 karakter, sekali pakai, perlu login konsultan untuk dipakai).
 * Tidak ada nama, keluhan, atau jawaban di pesan WhatsApp maupun di QR.
 */

/** Sama dengan CODE_ALPHABET di server/src/crypto.ts (tanpa I, O, 0, 1). */
export const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

/** Nomor WhatsApp klinik dari VITE_CLINIC_WHATSAPP. Diterima: 62xxxx, +62xxxx, atau 08xxxx (diubah ke 62). */
export function normalizeWhatsAppNumber(raw: string | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1); // format internasional: tidak boleh diawali 0
  else if (digits.startsWith('0')) digits = `62${digits.slice(1)}`; // format lokal Indonesia 08xx
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export const CLINIC_WHATSAPP = normalizeWhatsAppNumber(import.meta.env.VITE_CLINIC_WHATSAPP as string | undefined);

export function whatsAppMessage(code: string): string {
  return `Assalamu'alaikum, saya ingin berkonsultasi di My Herbalis. Kode konsultasi saya: ${code}`;
}

/** Tautan wa.me ke nomor klinik berisi kode saja. null bila nomor belum diatur atau kode tidak sah. */
export function whatsAppLink(number: string | null, code: string): string | null {
  if (!number || !CODE_PATTERN.test(code)) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(whatsAppMessage(code))}`;
}

/** Hasil pindaian QR -> kode yang sah, atau null. Isi QR hanya kode; spasi/huruf kecil dirapikan. */
export function parseScannedCode(text: string): string | null {
  const code = text.trim().toUpperCase().replace(/[\s-]/g, '');
  return CODE_PATTERN.test(code) ? code : null;
}

/** QR (SVG sebagai data URL) berisi kode saja. Pustaka dimuat saat dibutuhkan agar halaman awal tetap ringan. */
export async function codeQrDataUrl(code: string): Promise<string> {
  if (!CODE_PATTERN.test(code)) throw new Error('kode tidak sah');
  const QRCode = await import('qrcode');
  const svg = await QRCode.toString(code, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#1c1917', light: '#ffffff' } });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Pita pengingat: status per data tersimpan, disimpan di perangkat (localStorage).
 * Bila penyimpanan perangkat tidak tersedia, pita tetap tampil (lebih aman daripada hilang).
 */
export type ReminderState = 'open' | 'sent' | 'skipped';
const reminderKey = (submissionId: string) => `myherbalis:pengingat-kode:${submissionId}`;

export function readReminder(submissionId: string): ReminderState {
  try {
    const value = window.localStorage.getItem(reminderKey(submissionId));
    return value === 'sent' || value === 'skipped' ? value : 'open';
  } catch {
    return 'open';
  }
}

export function writeReminder(submissionId: string, state: Exclude<ReminderState, 'open'>): void {
  try {
    window.localStorage.setItem(reminderKey(submissionId), state);
  } catch {
    /* penyimpanan perangkat diblokir: pita hanya hilang untuk sesi ini */
  }
}
