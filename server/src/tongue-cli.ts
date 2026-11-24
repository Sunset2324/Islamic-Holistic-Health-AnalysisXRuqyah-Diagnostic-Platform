import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { ImageRejectedError, sanitizeImage } from './sanitizeImage.js';
import { analyzeTongue, DEFAULT_TONGUE_MODEL, TongueAnalysisError, type MessagesClient, type TongueAnalysis } from './tongue/analyze.js';

/**
 * Uji coba analisis foto lidah dari baris perintah (tanpa database, tanpa server).
 *
 *   cd server
 *   node --env-file=.env tongue.mjs foto1.jpg foto2.png folder-foto/ --csv hasil.csv
 *
 * ANTHROPIC_API_KEY dibaca dari environment. Jangan tulis kunci di perintah, repo, atau chat.
 * Foto dibersihkan dulu dengan sanitizeImage (sama seperti di aplikasi) sebelum dikirim.
 * Gunakan hanya foto uji/contoh: belum boleh foto pasien sungguhan (blueprint bagian 1).
 */

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export interface CliArgs {
  inputs: string[];
  model: string;
  csv: string | null;
  help: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { inputs: [], model: DEFAULT_TONGUE_MODEL, csv: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--model' || a === '--csv') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${a} butuh nilai.`);
      if (a === '--model') args.model = value;
      else args.csv = value;
      i += 1;
    } else if (a.startsWith('--')) throw new Error(`Opsi tidak dikenal: ${a}`);
    else args.inputs.push(a);
  }
  return args;
}

/** File langsung dipakai; folder dibaca satu tingkat (hanya ekstensi gambar umum, isi tetap diperiksa sanitizeImage). */
export async function expandInputs(inputs: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    const info = await stat(input);
    if (info.isDirectory()) {
      const names = (await readdir(input)).filter((n) => IMAGE_EXT.has(extname(n).toLowerCase())).sort();
      files.push(...names.map((n) => join(input, n)));
    } else files.push(input);
  }
  return files;
}

export interface Row {
  file: string;
  analysis?: TongueAnalysis;
  error?: string;
}

const csvCell = (v: string | number | boolean) => {
  const s = String(v);
  // Cegah formula injection saat CSV dibuka di spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const CSV_HEADER = [
  'file', 'foto_layak', 'masalah_foto',
  'warna', 'warna_keyakinan', 'bentuk', 'bentuk_keyakinan', 'tekstur', 'tekstur_keyakinan',
  'model', 'prompt_version', 'input_tokens', 'output_tokens', 'error',
  // Kolom kosong untuk diisi konsultan, agar hasil AI bisa dibandingkan dengan penilaian manusia.
  'label_warna', 'label_bentuk', 'label_tekstur',
];

export function toCsv(rows: Row[]): string {
  const lines = [CSV_HEADER.join(',')];
  for (const { file, analysis, error } of rows) {
    const r = analysis?.result;
    const cells = r
      ? [
          file, r.foto_layak, r.masalah_foto.join(' '),
          r.warna.nilai, r.warna.keyakinan, r.bentuk.nilai, r.bentuk.keyakinan, r.tekstur.nilai, r.tekstur.keyakinan,
          analysis.model, analysis.promptVersion, analysis.usage.inputTokens, analysis.usage.outputTokens, '',
        ]
      : [file, '', '', '', '', '', '', '', '', '', '', '', '', error ?? ''];
    lines.push([...cells, '', '', ''].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

const HELP = `Uji coba analisis foto lidah.
Pemakaian: node --env-file=.env tongue.mjs [--model NAMA_MODEL] [--csv hasil.csv] FOTO... | FOLDER...
Model bawaan: ${DEFAULT_TONGUE_MODEL}. ANTHROPIC_API_KEY dibaca dari environment (jangan dibagikan ke siapa pun).`;

export async function runCli(argv: string[], env: Record<string, string | undefined>, client?: MessagesClient): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error((err as Error).message);
    console.error(HELP);
    return 2;
  }
  if (args.help || args.inputs.length === 0) {
    console.log(HELP);
    return args.help ? 0 : 2;
  }
  if (!client && !env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY belum diisi. Tambahkan ke server/.env di komputermu sendiri; jangan kirim kunci ke siapa pun.');
    return 2;
  }
  const api: MessagesClient = client ?? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const files = await expandInputs(args.inputs);
  if (files.length === 0) {
    console.error('Tidak ada foto yang ditemukan.');
    return 2;
  }

  const rows: Row[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  for (const path of files) {
    const file = basename(path);
    try {
      const clean = await sanitizeImage(await readFile(path));
      const analysis = await analyzeTongue(clean, api, args.model);
      inputTokens += analysis.usage.inputTokens;
      outputTokens += analysis.usage.outputTokens;
      const r = analysis.result;
      console.log(
        `\n${file}: ${r.foto_layak ? 'layak' : `TIDAK LAYAK (${r.masalah_foto.join(', ')})`}` +
          ` | warna=${r.warna.nilai} (${r.warna.keyakinan}) | bentuk=${r.bentuk.nilai} (${r.bentuk.keyakinan})` +
          ` | tekstur=${r.tekstur.nilai} (${r.tekstur.keyakinan})`,
      );
      console.log(JSON.stringify(r, null, 2));
      rows.push({ file, analysis });
    } catch (err) {
      // Pesan galat tidak memuat isi foto atau kunci. Galat API hanya dicatat jenis dan status HTTP-nya.
      let message: string;
      if (err instanceof ImageRejectedError || err instanceof TongueAnalysisError) message = `${err.code}: ${err.message}`;
      else if (err instanceof Anthropic.APIError) message = `api_error: HTTP ${err.status ?? '?'} ${err.name}`;
      else message = `error: ${(err as Error).name}`;
      console.error(`\n${file}: GAGAL (${message})`);
      rows.push({ file, error: message });
    }
  }

  const ok = rows.filter((r) => r.analysis).length;
  console.log(`\nSelesai: ${ok}/${rows.length} foto berhasil. Token: input ${inputTokens}, output ${outputTokens}. Model: ${args.model}.`);
  if (args.csv) {
    await writeFile(args.csv, toCsv(rows), 'utf8');
    console.log(`CSV ditulis ke ${args.csv}`);
  }
  return ok === rows.length ? 0 : 1;
}
