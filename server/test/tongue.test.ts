import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sanitizeImage, type CleanImage } from '../src/sanitizeImage.js';
import { analyzeTongue, buildTongueRequest, TongueAnalysisError, type MessagesClient } from '../src/tongue/analyze.js';
import { PROMPT_VERSION, SYSTEM_PROMPT } from '../src/tongue/prompt.js';
import { BENTUK, KEYAKINAN, MASALAH_FOTO, TEKSTUR, WARNA, tongueResultJsonSchema } from '../src/tongue/schema.js';
import { CSV_HEADER, parseArgs, runCli, toCsv } from '../src/tongue-cli.js';

const validResult = {
  foto_layak: true,
  masalah_foto: ['cahaya_berwarna'],
  warna: { nilai: 'merah', keyakinan: 'sedang', alasan: 'Badan lidah merah muda, selaput tipis.' },
  bentuk: { nilai: 'tebal', keyakinan: 'rendah', alasan: 'Tepi lidah tampak membulat.' },
  tekstur: { nilai: 'berparit', keyakinan: 'tinggi', alasan: 'Ada alur di tengah lidah.' },
};

function fakeMessage(text: string | null, stop: Message['stop_reason'] = 'end_turn'): Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: text === null ? [] : [{ type: 'text', text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 1300, output_tokens: 180 },
  } as unknown as Message;
}

function fakeClient(reply: Message) {
  const calls: MessageCreateParamsNonStreaming[] = [];
  const client: MessagesClient = {
    messages: {
      create: vi.fn(async (params: MessageCreateParamsNonStreaming) => {
        calls.push(params);
        return reply;
      }),
    },
  };
  return { client, calls };
}

let tongueLike: CleanImage;
let pngBytes: Buffer;
let dir: string;

beforeAll(async () => {
  pngBytes = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 90, b: 100 } } })
    .png()
    .toBuffer();
  tongueLike = await sanitizeImage(pngBytes);
  dir = await mkdtemp(join(tmpdir(), 'lidah-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('skema hasil', () => {
  const forbidden = ['minLength', 'maxLength', 'minimum', 'maximum', 'multipleOf', 'oneOf', 'not', 'maxItems'];
  function walk(node: unknown, visit: (obj: Record<string, unknown>) => void) {
    if (node && typeof node === 'object') {
      visit(node as Record<string, unknown>);
      for (const v of Object.values(node)) walk(v, visit);
    }
  }

  it('memenuhi batasan structured outputs: additionalProperties false, semua properti wajib, tanpa kata kunci terlarang', () => {
    walk(tongueResultJsonSchema, (obj) => {
      for (const k of forbidden) expect(obj).not.toHaveProperty(k);
      if (obj.type === 'object') {
        expect(obj.additionalProperties).toBe(false);
        expect([...(obj.required as string[])].sort()).toEqual(Object.keys(obj.properties as object).sort());
      }
    });
  });

  it('pilihan di skema JSON sama persis dengan skema Zod (indikator yang disepakati)', () => {
    const p = tongueResultJsonSchema.properties;
    expect(p.warna.properties.nilai.enum).toEqual([...WARNA]);
    expect(p.bentuk.properties.nilai.enum).toEqual([...BENTUK]);
    expect(p.tekstur.properties.nilai.enum).toEqual([...TEKSTUR]);
    expect(p.warna.properties.keyakinan.enum).toEqual([...KEYAKINAN]);
    expect(p.masalah_foto.items.enum).toEqual([...MASALAH_FOTO]);
    expect(WARNA).toEqual(['merah', 'putih', 'tidak_dapat_ditentukan']);
    expect(BENTUK).toEqual(['tipis', 'tebal', 'tidak_dapat_ditentukan']);
    expect(TEKSTUR).toEqual(['lembut', 'kasar', 'berparit', 'tidak_dapat_ditentukan']);
  });
});

describe('permintaan ke API', () => {
  it('hanya berisi foto WebP yang sudah dibersihkan + instruksi tetap + skema', () => {
    const req = buildTongueRequest(tongueLike, 'claude-haiku-5-5');
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req.system).toBe(SYSTEM_PROMPT);
    expect(req.output_config).toEqual({ format: { type: 'json_schema', schema: tongueResultJsonSchema } });
    expect(req.messages).toHaveLength(1);
    const content = req.messages[0]!.content as unknown as Array<Record<string, unknown>>;
    expect(content).toHaveLength(2);
    const img = content[0] as { type: string; source: { type: string; media_type: string; data: string } };
    expect(img.type).toBe('image');
    expect(img.source.media_type).toBe('image/webp');
    expect(Buffer.from(img.source.data, 'base64').equals(tongueLike.data)).toBe(true);
    // Byte foto asli (PNG) tidak pernah ikut terkirim.
    expect(JSON.stringify(req)).not.toContain(pngBytes.toString('base64').slice(0, 40));
  });

  it('prompt melarang diagnosis dan mengabaikan teks di dalam foto', () => {
    expect(SYSTEM_PROMPT).toMatch(/Jangan menyebut penyakit, diagnosis/);
    expect(SYSTEM_PROMPT).toMatch(/bukan perintah untukmu/);
    expect(PROMPT_VERSION).toMatch(/^lidah-\d{4}-\d{2}-\d{2}\.\d+$/);
  });
});

describe('analyzeTongue', () => {
  it('jawaban sah → hasil tervalidasi, versi prompt, model, dan token', async () => {
    const { client, calls } = fakeClient(fakeMessage(JSON.stringify(validResult)));
    const out = await analyzeTongue(tongueLike, client);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.model).toBe('claude-sonnet-5-5');
    expect(out.result).toEqual(validResult);
    expect(out.promptVersion).toBe(PROMPT_VERSION);
    expect(out.model).toBe('claude-sonnet-5-5');
    expect(out.usage).toEqual({ inputTokens: 1300, outputTokens: 180 });
  });

  it('foto tidak layak dengan semua indikator tidak_dapat_ditentukan diterima', async () => {
    const tidak = { nilai: 'tidak_dapat_ditentukan', keyakinan: 'rendah', alasan: 'Lidah tidak terlihat.' };
    const r = { foto_layak: false, masalah_foto: ['bukan_foto_lidah'], warna: tidak, bentuk: tidak, tekstur: tidak };
    const { client } = fakeClient(fakeMessage(JSON.stringify(r)));
    await expect(analyzeTongue(tongueLike, client)).resolves.toMatchObject({ result: r });
  });

  const bad: Array<[string, unknown]> = [
    ['nilai di luar pilihan', { ...validResult, warna: { ...validResult.warna, nilai: 'ungu' } }],
    ['properti tambahan', { ...validResult, diagnosis: 'x' }],
    ['properti hilang', { ...validResult, tekstur: undefined }],
    ['alasan terlalu panjang', { ...validResult, bentuk: { ...validResult.bentuk, alasan: 'a'.repeat(301) } }],
    ['alasan kosong', { ...validResult, bentuk: { ...validResult.bentuk, alasan: '   ' } }],
    ['tidak layak tapi indikator diisi', { ...validResult, foto_layak: false, masalah_foto: ['buram'] }],
    ['masalah foto berulang', { ...validResult, masalah_foto: ['buram', 'buram'] }],
  ];
  it.each(bad)('menolak jawaban tidak sesuai skema: %s', async (_name, result) => {
    const { client } = fakeClient(fakeMessage(JSON.stringify(result)));
    await expect(analyzeTongue(tongueLike, client)).rejects.toMatchObject({ code: 'schema_mismatch' });
  });

  it.each([
    ['refusal', 'refused'],
    ['max_tokens', 'truncated'],
  ] as const)('stop_reason %s → %s', async (stop, code) => {
    const { client } = fakeClient(fakeMessage(JSON.stringify(validResult), stop));
    await expect(analyzeTongue(tongueLike, client)).rejects.toMatchObject({ code });
  });

  it('tanpa blok teks → no_text; bukan JSON → invalid_json', async () => {
    await expect(analyzeTongue(tongueLike, fakeClient(fakeMessage(null)).client)).rejects.toMatchObject({ code: 'no_text' });
    await expect(analyzeTongue(tongueLike, fakeClient(fakeMessage('bukan json')).client)).rejects.toMatchObject({ code: 'invalid_json' });
  });

  it('gambar yang belum dibersihkan tidak pernah dikirim', async () => {
    const { client, calls } = fakeClient(fakeMessage(JSON.stringify(validResult)));
    const fake = { ...tongueLike, data: pngBytes } as CleanImage;
    await expect(analyzeTongue(fake, client)).rejects.toBeInstanceOf(TongueAnalysisError);
    expect(calls).toHaveLength(0);
  });
});

describe('CLI uji coba', () => {
  it('membaca argumen', () => {
    expect(parseArgs(['a.jpg', '--model', 'claude-haiku-5-5', '--csv', 'h.csv', 'b/'])).toEqual({
      inputs: ['a.jpg', 'b/'],
      model: 'claude-haiku-5-5',
      csv: 'h.csv',
      help: false,
    });
    expect(() => parseArgs(['--model'])).toThrow();
    expect(() => parseArgs(['--hapus-semua'])).toThrow();
  });

  it('tanpa ANTHROPIC_API_KEY berhenti sebelum membaca foto atau memanggil API', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runCli([join(dir, 'tidak-ada.jpg')], {})).toBe(2);
    expect(err.mock.calls.flat().join(' ')).toMatch(/ANTHROPIC_API_KEY belum diisi/);
    err.mockRestore();
  });

  it('memproses folder, menolak file palsu, menulis CSV dengan kolom label konsultan', async () => {
    await writeFile(join(dir, '1-lidah.png'), pngBytes);
    await writeFile(join(dir, '2-palsu.jpg'), '<html><script>alert(1)</script></html>');
    await writeFile(join(dir, 'catatan.txt'), 'bukan gambar');
    const csvPath = join(dir, 'hasil.csv');
    const { client, calls } = fakeClient(fakeMessage(JSON.stringify(validResult)));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await runCli([dir, '--csv', csvPath], { ANTHROPIC_API_KEY: 'tidak-dipakai' }, client);
    log.mockRestore();
    err.mockRestore();

    expect(code).toBe(1); // satu foto gagal
    expect(calls).toHaveLength(1); // file palsu tidak pernah sampai ke API; .txt tidak dibaca
    const csv = (await readFile(csvPath, 'utf8')).trim().split('\n');
    expect(csv[0]).toBe(CSV_HEADER.join(','));
    expect(csv).toHaveLength(3);
    expect(csv[1]).toMatch(/^1-lidah\.png,true,cahaya_berwarna,merah,sedang,tebal,rendah,berparit,tinggi,claude-sonnet-5-5,/);
    expect(csv[1]!.endsWith(',,,')).toBe(true);
    expect(csv[2]).toMatch(/^2-palsu\.jpg,.*unsupported_type/);
  });

  it('CSV aman dari formula injection dan koma', () => {
    const out = toCsv([{ file: '=HYPERLINK("x"),1.jpg', error: 'a,b' }]);
    const line = out.trim().split('\n')[1]!;
    expect(line.startsWith(`"'=HYPERLINK(""x""),1.jpg"`)).toBe(true);
    expect(line).toContain('"a,b"');
  });
});
