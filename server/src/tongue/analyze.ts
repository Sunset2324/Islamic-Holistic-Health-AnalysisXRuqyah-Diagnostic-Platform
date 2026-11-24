import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import type { CleanImage } from '../sanitizeImage.js';
import { sniffType } from '../sanitizeImage.js';
import { PROMPT_VERSION, SYSTEM_PROMPT, USER_INSTRUCTION } from './prompt.js';
import { tongueResultJsonSchema, tongueResultSchema, type TongueResult } from './schema.js';

/**
 * Analisis foto lidah lewat Claude API.
 *
 * - Hanya menerima gambar yang SUDAH lewat sanitizeImage (WebP baru, tanpa metadata). Foto asli tidak pernah dikirim.
 * - Tidak ada nama, kontak, atau data kuesioner yang ikut dikirim: hanya foto dan instruksi tetap.
 * - Jawaban divalidasi ulang dengan Zod; apa pun yang tidak sesuai skema ditolak, bukan "diperbaiki".
 * - Kunci API tidak pernah lewat sini: klien dibuat oleh pemanggil dari environment (ANTHROPIC_API_KEY).
 */

export const DEFAULT_TONGUE_MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 1024;

/** Bagian kecil dari klien SDK yang dipakai, supaya tes bisa memakai klien tiruan. */
export interface MessagesClient {
  messages: { create(params: MessageCreateParamsNonStreaming): Promise<Message> };
}

export type TongueErrorCode = 'not_webp' | 'refused' | 'truncated' | 'no_text' | 'invalid_json' | 'schema_mismatch';

export class TongueAnalysisError extends Error {
  constructor(
    public readonly code: TongueErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TongueAnalysisError';
  }
}

export interface TongueAnalysis {
  result: TongueResult;
  model: string;
  promptVersion: string;
  usage: { inputTokens: number; outputTokens: number };
}

export function buildTongueRequest(image: CleanImage, model: string): MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: image.data.toString('base64') } },
          { type: 'text', text: USER_INSTRUCTION },
        ],
      },
    ],
    output_config: { format: { type: 'json_schema', schema: tongueResultJsonSchema } },
  };
}

export async function analyzeTongue(
  image: CleanImage,
  client: MessagesClient,
  model: string = DEFAULT_TONGUE_MODEL,
): Promise<TongueAnalysis> {
  if (image.mime !== 'image/webp' || sniffType(image.data) !== 'webp') {
    throw new TongueAnalysisError('not_webp', 'Gambar harus hasil sanitizeImage (WebP).');
  }

  const response = await client.messages.create(buildTongueRequest(image, model));

  if (response.stop_reason === 'refusal') throw new TongueAnalysisError('refused', 'Model menolak menganalisis foto ini.');
  if (response.stop_reason === 'max_tokens') throw new TongueAnalysisError('truncated', 'Jawaban model terpotong.');

  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') throw new TongueAnalysisError('no_text', 'Jawaban model tidak berisi teks.');

  let json: unknown;
  try {
    json = JSON.parse(text.text);
  } catch {
    throw new TongueAnalysisError('invalid_json', 'Jawaban model bukan JSON yang sah.');
  }

  const parsed = tongueResultSchema.safeParse(json);
  if (!parsed.success) throw new TongueAnalysisError('schema_mismatch', 'Jawaban model tidak sesuai skema hasil.');

  return {
    result: parsed.data,
    model: response.model,
    promptVersion: PROMPT_VERSION,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
