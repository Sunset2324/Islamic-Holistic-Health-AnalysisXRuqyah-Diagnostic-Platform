import { z } from 'zod';

/**
 * Bentuk data isian pasien. Cerminan src/types/intake.ts, src/data/indicators.ts, dan src/config.ts di frontend.
 * Server tidak mempercayai klien: semua dibatasi di sini. Bila batas di frontend berubah, ubah juga di sini.
 */
export const INDICATOR_IDS = [
  'PL-01', 'PL-02', 'PL-03', 'PM-01', 'PM-02', 'PM-03', 'PP-01', 'PP-02', 'PP-03', 'FX-01', 'FX-02', 'FX-03',
] as const;

const text = (max: number) => z.string().max(max);

export const intakeSchema = z.strictObject({
  name: text(60),
  age: z.number().int().min(0).max(120),
  mainComplaint: text(1000),
  complaintDuration: text(200),
  complaintFrequency: text(200),
  complaintImpact: text(200),
  medicalHistory: text(500),
});

const score = z.union([z.number().int().min(1).max(5), z.null()]);
export const answersSchema = z.strictObject(
  Object.fromEntries(INDICATOR_IDS.map((id) => [id, score.optional()])) as Record<(typeof INDICATOR_IDS)[number], z.ZodOptional<typeof score>>,
);

const tagId = z.string().regex(/^[A-Z][A-Z0-9_]{0,39}$/);
const tagSelection = z.strictObject({ tagIds: z.array(tagId).max(12), otherNote: text(250) });
export const tagSelectionsSchema = z.strictObject(
  Object.fromEntries(INDICATOR_IDS.map((id) => [id, tagSelection.optional()])) as Record<(typeof INDICATOR_IDS)[number], z.ZodOptional<typeof tagSelection>>,
);

const version = z.string().regex(/^[A-Za-z0-9 ._-]{1,40}$/);

export const submissionBodySchema = z.strictObject({
  intake: intakeSchema,
  answers: answersSchema,
  tagSelections: tagSelectionsSchema,
  questionnaireVersion: version,
  algorithmVersion: version,
});
export type SubmissionBody = z.infer<typeof submissionBodySchema>;

export const idParamSchema = z.strictObject({ id: z.uuid() });

/** Token edit: 32-128 karakter base64url. Diperiksa bentuknya sebelum di-hash. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
