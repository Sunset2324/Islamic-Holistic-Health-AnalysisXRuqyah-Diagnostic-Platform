import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CODE_PATTERN,
  codeQrDataUrl,
  normalizeWhatsAppNumber,
  parseScannedCode,
  readReminder,
  whatsAppLink,
  whatsAppMessage,
  writeReminder,
} from '@/lib/consultCode';

const CODE = 'ABCD2345';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // server/src/crypto.ts

afterEach(() => vi.unstubAllGlobals());

describe('pola kode sama dengan server', () => {
  it('menerima semua 32 simbol server dan menolak I, O, 0, 1, panjang salah', () => {
    for (const ch of ALPHABET) expect(CODE_PATTERN.test(ch.repeat(8)), ch).toBe(true);
    for (const bad of ['ABCDI234', 'ABCDO234', 'ABCD0234', 'ABCD1234', 'ABCD234', 'ABCD23456', 'abcd2345']) {
      expect(CODE_PATTERN.test(bad), bad).toBe(false);
    }
  });
});

describe('nomor WhatsApp klinik', () => {
  it.each([
    ['6281234567890', '6281234567890'],
    ['+62 812-3456-7890', '6281234567890'],
    ['0812 3456 7890', '6281234567890'],
    ['(0812) 3456.7890', '6281234567890'],
  ])('%s -> %s', (raw, expected) => expect(normalizeWhatsAppNumber(raw)).toBe(expected));

  it.each([undefined, '', 'abc', '62', '+0812345', '62812345678901234', 'https://wa.me/628123'])('tidak sah -> null: %j', (raw) => {
    expect(normalizeWhatsAppNumber(raw)).toBeNull();
  });
});

describe('tautan WhatsApp', () => {
  it('ke nomor klinik, berisi kode saja (tanpa data lain), ter-encode', () => {
    const link = whatsAppLink('6281234567890', CODE);
    expect(link).toBe(`https://wa.me/6281234567890?text=${encodeURIComponent(whatsAppMessage(CODE))}`);
    const text = new URL(link as string).searchParams.get('text') as string;
    expect(text).toContain(CODE);
    expect(text).toBe(whatsAppMessage(CODE));
  });
  it('tanpa nomor atau dengan kode tidak sah -> null (tombol disembunyikan)', () => {
    expect(whatsAppLink(null, CODE)).toBeNull();
    expect(whatsAppLink('6281234567890', 'ABC')).toBeNull();
    expect(whatsAppLink('6281234567890', 'ABCD2345&text=lain')).toBeNull();
  });
});

describe('hasil pindaian QR', () => {
  it('kode sah dirapikan', () => {
    expect(parseScannedCode(' abcd-2345 ')).toBe(CODE);
    expect(parseScannedCode('ABCD 2345')).toBe(CODE);
  });
  it.each(['https://contoh.com', 'ABCD1234', '', 'ABCD23456', 'Kode: ABCD2345'])('bukan kode -> null: %j', (text) => {
    expect(parseScannedCode(text)).toBeNull();
  });
});

describe('QR berisi kode saja dan terbaca kembali', () => {
  it('QR dari qrcode terbaca jsQR sebagai kode yang sama', () => {
    // Gambar QR dirender manual (modul hitam/putih) supaya tidak butuh browser.
    const qr = QRCode.create(CODE, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const scale = 6;
    const margin = 4;
    const size = (n + margin * 2) * scale;
    const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        if (!qr.modules.get(y, x)) continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const i = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
          }
        }
      }
    }
    const found = jsQR(rgba, size, size);
    expect(found?.data).toBe(CODE);
    expect(parseScannedCode(found?.data ?? '')).toBe(CODE);
  });

  it('data URL SVG hanya memuat gambar, dan menolak kode tidak sah', async () => {
    const url = await codeQrDataUrl(CODE);
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1));
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/<script|onload|href=/i);
    await expect(codeQrDataUrl('bukan kode')).rejects.toThrow();
  });
});

describe('pita pengingat tersimpan per data', () => {
  function stubStorage(failing = false) {
    const data: Record<string, string> = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => {
          if (failing) throw new Error('SecurityError');
          return data[k] ?? null;
        },
        setItem: (k: string, v: string) => {
          if (failing) throw new Error('SecurityError');
          data[k] = v;
        },
      },
    });
    return data;
  }

  it('awal open; setelah sent/skipped tetap tertutup untuk data itu saja', () => {
    stubStorage();
    expect(readReminder('a')).toBe('open');
    writeReminder('a', 'sent');
    writeReminder('b', 'skipped');
    expect(readReminder('a')).toBe('sent');
    expect(readReminder('b')).toBe('skipped');
    expect(readReminder('c')).toBe('open');
  });

  it('penyimpanan diblokir: tidak melempar galat, pita tetap tampil', () => {
    stubStorage(true);
    expect(() => writeReminder('a', 'sent')).not.toThrow();
    expect(readReminder('a')).toBe('open');
  });
});
