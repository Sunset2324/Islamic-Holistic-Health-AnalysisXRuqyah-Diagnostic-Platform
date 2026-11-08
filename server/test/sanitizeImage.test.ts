import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { ImageRejectedError, sanitizeImage, sniffType } from '../src/sanitizeImage.js';

const png = (w = 64, h = 48) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 90 } } }).png().toBuffer();
const jpeg = (w = 64, h = 48) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 120, b: 200 } } }).jpeg().toBuffer();

const HTML = Buffer.from('<html><script>alert(document.cookie)</script></html>');

async function rejects(buf: Buffer, code: string, opts = {}) {
  await expect(sanitizeImage(buf, opts)).rejects.toMatchObject({ name: 'ImageRejectedError', code });
}

describe('sanitizeImage: isi file menentukan, bukan namanya', () => {
  it('menolak file HTML yang diberi nama .png (isi HTML, nama tidak dipakai sama sekali)', async () => {
    await rejects(HTML, 'unsupported_type');
  });
  it('menolak SVG, GIF, PDF, dan ZIP', async () => {
    await rejects(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'unsupported_type');
    await rejects(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;'), 'unsupported_type');
    await rejects(Buffer.from('%PDF-1.7\n%âãÏÓ'), 'unsupported_type');
    await rejects(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]), 'unsupported_type');
  });
  it('menolak file kosong dan terlalu besar', async () => {
    await rejects(Buffer.alloc(0), 'empty');
    await rejects(await png(), 'too_large', { maxBytes: 10 });
  });
  it('menolak file yang hanya kepalanya PNG tetapi isinya rusak/HTML', async () => {
    const fake = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), HTML]);
    await rejects(fake, 'corrupt');
  });
  it('menolak file terpotong', async () => {
    const full = await png(200, 200);
    await rejects(full.subarray(0, Math.floor(full.length / 2)), 'corrupt');
  });
  it('menolak gambar beranimasi', async () => {
    const frames = await sharp(
      Buffer.concat([await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f00' } }).raw().toBuffer(),
                     await sharp({ create: { width: 8, height: 8, channels: 3, background: '#00f' } }).raw().toBuffer()]),
      { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } },
    ).webp({ loop: 0, delay: [100, 100] }).toBuffer();
    await rejects(frames, 'animated');
  });
  it('menolak gambar berpiksel terlalu banyak (decompression bomb)', async () => {
    await rejects(await png(1000, 1000), 'too_many_pixels', { maxInputPixels: 10_000 });
  });
});

describe('sanitizeImage: hasil selalu bersih', () => {
  it('PNG + HTML yang ditempel di akhir file: gambar lolos, HTML hilang dari hasil', async () => {
    const polyglot = Buffer.concat([await png(), HTML]);
    expect(sniffType(polyglot)).toBe('png');
    const out = await sanitizeImage(polyglot);
    expect(out.data.includes(Buffer.from('<html'))).toBe(false);
    expect(out.data.includes(Buffer.from('<script'))).toBe(false);
    expect(out.data.includes(Buffer.from('alert('))).toBe(false);
    expect(out.mime).toBe('image/webp');
    expect(sniffType(out.data)).toBe('webp');
  });
  it('JPEG + skrip yang ditempel di akhir file: skrip hilang', async () => {
    const out = await sanitizeImage(Buffer.concat([await jpeg(), HTML]));
    expect(out.data.includes(Buffer.from('<script'))).toBe(false);
  });
  it('teks tersembunyi di metadata (komentar/EXIF) tidak ikut ke hasil, termasuk GPS', async () => {
    const withExif = await sharp(await jpeg())
      .withExif({ IFD0: { ImageDescription: 'RAHASIA-<script>x</script>', Make: 'KameraPasien' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '6/1 12/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '106/1 49/1 0/1' } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    expect(withExif.includes(Buffer.from('KameraPasien'))).toBe(true);

    const out = await sanitizeImage(withExif);
    const meta = await sharp(out.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(out.data.includes(Buffer.from('KameraPasien'))).toBe(false);
    expect(out.data.includes(Buffer.from('RAHASIA'))).toBe(false);
  });
  it('chunk teks PNG berisi skrip tidak ikut ke hasil', async () => {
    const base = await png();
    // sisipkan chunk tEXt sebelum IEND dengan CRC valid
    const body = Buffer.concat([Buffer.from('tEXt'), Buffer.from('Comment\0<script>steal()</script>')]);
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    let crc = 0xffffffff; for (const b of body) crc = (crcTable[(crc ^ b) & 0xff] as number) ^ (crc >>> 8);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length - 4);
    const iendAt = base.length - 12;
    const tampered = Buffer.concat([base.subarray(0, iendAt), len, body, crcBuf, base.subarray(iendAt)]);
    expect(tampered.includes(Buffer.from('steal()'))).toBe(true);
    const out = await sanitizeImage(tampered);
    expect(out.data.includes(Buffer.from('steal()'))).toBe(false);
  });
  it('orientasi EXIF diterapkan ke piksel lalu dibuang', async () => {
    const rotated = await sharp(await jpeg(100, 40)).withMetadata({ orientation: 6 }).toBuffer();
    const out = await sanitizeImage(rotated);
    expect(out.width).toBe(40);
    expect(out.height).toBe(100);
    expect((await sharp(out.data).metadata()).orientation).toBeUndefined();
  });
  it('gambar besar diperkecil ke batas sisi terpanjang', async () => {
    const out = await sanitizeImage(await png(3000, 1000), { maxOutputDimension: 1024 });
    expect(Math.max(out.width, out.height)).toBe(1024);
  });
  it('PNG, JPEG, dan WebP sah menghasilkan WebP dengan sha256 stabil', async () => {
    for (const make of [png, jpeg, async () => sharp(await png()).webp().toBuffer()]) {
      const a = await sanitizeImage(await make());
      const b = await sanitizeImage(await make());
      expect(a.mime).toBe('image/webp');
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.sha256).toBe(b.sha256);
    }
  });
  it('error bertipe ImageRejectedError', async () => {
    await expect(sanitizeImage(HTML)).rejects.toBeInstanceOf(ImageRejectedError);
  });
});
