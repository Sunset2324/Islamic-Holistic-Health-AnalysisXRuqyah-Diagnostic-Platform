import { createHash } from 'node:crypto';
import sharp from 'sharp';

/**
 * Pembersih gambar unggahan (mis. foto lidah).
 *
 * Prinsip: nama file, ekstensi, dan Content-Type dari klien TIDAK dipercaya dan tidak dipakai.
 * Yang diperiksa hanya isi (byte) file. Gambar selalu didekode lalu DIGAMBAR ULANG menjadi WebP baru,
 * sehingga apa pun yang menempel di file asli (HTML/skrip di akhir file, chunk teks PNG, EXIF, GPS,
 * profil warna, XMP, bagian polyglot) tidak ikut terbawa ke hasil.
 */

export type RejectCode =
  | 'empty'
  | 'too_large'
  | 'unsupported_type'
  | 'animated'
  | 'too_many_pixels'
  | 'corrupt'
  | 'output_check_failed';

export class ImageRejectedError extends Error {
  constructor(
    public readonly code: RejectCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImageRejectedError';
  }
}

export interface SanitizeOptions {
  /** Batas ukuran file mentah. */
  maxBytes: number;
  /** Batas jumlah piksel sebelum dekode (menahan "decompression bomb"). */
  maxInputPixels: number;
  /** Sisi terpanjang hasil. */
  maxOutputDimension: number;
  webpQuality: number;
}

export const DEFAULT_OPTIONS: SanitizeOptions = {
  maxBytes: 8 * 1024 * 1024,
  maxInputPixels: 40_000_000,
  maxOutputDimension: 2048,
  webpQuality: 85,
};

export interface CleanImage {
  data: Buffer;
  mime: 'image/webp';
  width: number;
  height: number;
  bytes: number;
  sha256: string;
}

type Sniffed = 'jpeg' | 'png' | 'webp';

/** Menentukan jenis dari byte awal saja. */
export function sniffType(buf: Buffer): Sniffed | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export async function sanitizeImage(input: Buffer, options: Partial<SanitizeOptions> = {}): Promise<CleanImage> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (input.length === 0) throw new ImageRejectedError('empty', 'File kosong.');
  if (input.length > opts.maxBytes) throw new ImageRejectedError('too_large', 'File terlalu besar.');

  // 1. Hanya JPEG/PNG/WebP berdasarkan isi. SVG, GIF, HTML, PDF, dll. langsung ditolak.
  const sniffed = sniffType(input);
  if (!sniffed) throw new ImageRejectedError('unsupported_type', 'Jenis file tidak didukung.');

  let output: { data: Buffer; info: sharp.OutputInfo };
  try {
    const base = sharp(input, { limitInputPixels: opts.maxInputPixels, failOn: 'error', animated: true });

    // 2. Metadata dibaca dulu: format harus cocok dengan hasil sniff dan tidak boleh beranimasi.
    const meta = await base.metadata();
    if (meta.format !== sniffed) throw new ImageRejectedError('corrupt', 'Isi file tidak konsisten.');
    if ((meta.pages ?? 1) > 1) throw new ImageRejectedError('animated', 'Gambar beranimasi tidak diterima.');

    // 3. Dekode penuh lalu encode ulang. Metadata tidak disalin (tanpa withMetadata/withExif).
    output = await sharp(input, { limitInputPixels: opts.maxInputPixels, failOn: 'error' })
      .rotate() // terapkan orientasi EXIF ke piksel, lalu EXIF dibuang
      .resize({ width: opts.maxOutputDimension, height: opts.maxOutputDimension, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .webp({ quality: opts.webpQuality })
      .toBuffer({ resolveWithObject: true });
  } catch (err) {
    if (err instanceof ImageRejectedError) throw err;
    const message = err instanceof Error ? err.message : '';
    if (/pixel limit/i.test(message)) throw new ImageRejectedError('too_many_pixels', 'Dimensi gambar terlalu besar.');
    throw new ImageRejectedError('corrupt', 'File gambar rusak atau tidak dapat diproses.');
  }

  // 4. Pemeriksaan hasil: harus WebP asli dan tanpa metadata apa pun.
  const check = await sharp(output.data).metadata();
  if (sniffType(output.data) !== 'webp' || check.exif || check.xmp || check.icc || check.iptc || check.tifftagPhotoshop) {
    throw new ImageRejectedError('output_check_failed', 'Hasil pembersihan tidak lolos pemeriksaan.');
  }

  return {
    data: output.data,
    mime: 'image/webp',
    width: output.info.width,
    height: output.info.height,
    bytes: output.data.length,
    sha256: createHash('sha256').update(output.data).digest('hex'),
  };
}
