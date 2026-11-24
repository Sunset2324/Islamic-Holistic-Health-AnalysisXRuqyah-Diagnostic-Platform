import { z } from 'zod';

/**
 * Hasil analisis foto lidah (blueprint bagian 10).
 *
 * Indikator yang disepakati: Warna (merah, putih), Bentuk (tipis, tebal), Tekstur (lembut, kasar, berparit).
 * `tidak_dapat_ditentukan` adalah tambahan usulan untuk uji coba: dipakai bila foto tidak cukup jelas.
 *
 * Skema JSON untuk API ditulis manual (bukan z.toJSONSchema) karena API structured outputs menolak
 * minLength/maxLength/minimum/maximum. Panjang teks dibatasi di sini (Zod) saat memvalidasi jawaban.
 * Tes memastikan daftar pilihan di kedua skema selalu sama.
 */

export const WARNA = ['merah', 'putih', 'tidak_dapat_ditentukan'] as const;
export const BENTUK = ['tipis', 'tebal', 'tidak_dapat_ditentukan'] as const;
export const TEKSTUR = ['lembut', 'kasar', 'berparit', 'tidak_dapat_ditentukan'] as const;
export const KEYAKINAN = ['rendah', 'sedang', 'tinggi'] as const;
export const MASALAH_FOTO = [
  'bukan_foto_lidah',
  'lidah_tidak_terlihat_utuh',
  'buram',
  'terlalu_gelap',
  'terlalu_terang',
  'cahaya_berwarna',
  'terhalang',
] as const;

const MAX_ALASAN = 300;

const indikator = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .object({
      nilai: z.enum(values),
      keyakinan: z.enum(KEYAKINAN),
      alasan: z.string().trim().min(1).max(MAX_ALASAN),
    })
    .strict();

export const tongueResultSchema = z
  .object({
    foto_layak: z.boolean(),
    masalah_foto: z.array(z.enum(MASALAH_FOTO)).max(MASALAH_FOTO.length),
    warna: indikator(WARNA),
    bentuk: indikator(BENTUK),
    tekstur: indikator(TEKSTUR),
  })
  .strict()
  .superRefine((r, ctx) => {
    // Foto yang tidak layak tidak boleh menghasilkan nilai indikator yang terdengar pasti.
    if (!r.foto_layak) {
      for (const key of ['warna', 'bentuk', 'tekstur'] as const) {
        if (r[key].nilai !== 'tidak_dapat_ditentukan') {
          ctx.addIssue({ code: 'custom', path: [key, 'nilai'], message: 'foto tidak layak tetapi indikator diisi' });
        }
      }
      if (r.masalah_foto.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['masalah_foto'], message: 'foto tidak layak tanpa alasan' });
      }
    }
    if (new Set(r.masalah_foto).size !== r.masalah_foto.length) {
      ctx.addIssue({ code: 'custom', path: ['masalah_foto'], message: 'masalah foto berulang' });
    }
  });

export type TongueResult = z.infer<typeof tongueResultSchema>;

const indikatorJson = (values: readonly string[], deskripsi: string) => ({
  type: 'object',
  description: deskripsi,
  properties: {
    nilai: { type: 'string', enum: [...values] },
    keyakinan: { type: 'string', enum: [...KEYAKINAN] },
    alasan: { type: 'string', description: `Ciri yang terlihat di foto, maksimal ${MAX_ALASAN} karakter, bahasa Indonesia.` },
  },
  required: ['nilai', 'keyakinan', 'alasan'],
  additionalProperties: false,
});

/** Skema yang dikirim ke API (output_config.format). */
export const tongueResultJsonSchema = {
  type: 'object',
  properties: {
    foto_layak: { type: 'boolean', description: 'true bila foto cukup jelas untuk menilai ketiga indikator.' },
    masalah_foto: { type: 'array', items: { type: 'string', enum: [...MASALAH_FOTO] } },
    warna: indikatorJson(WARNA, 'Warna dominan permukaan lidah yang terlihat.'),
    bentuk: indikatorJson(BENTUK, 'Ketebalan badan lidah.'),
    tekstur: indikatorJson(TEKSTUR, 'Tekstur permukaan lidah yang paling menonjol.'),
  },
  required: ['foto_layak', 'masalah_foto', 'warna', 'bentuk', 'tekstur'],
  additionalProperties: false,
} as const;
