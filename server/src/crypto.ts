import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Enkripsi data sensitif di level aplikasi (AES-256-GCM). Database tidak pernah memegang kunci.
 * Format blob: [iv 12 byte][tag 16 byte][ciphertext]. `context` ikut diautentikasi (AAD) sehingga
 * blob dari kolom/konteks lain tidak bisa ditukar-pasang.
 */
export interface KeyRing {
  currentVersion: number;
  keys: ReadonlyMap<number, Buffer>;
}

const IV_LEN = 12;
const TAG_LEN = 16;

export function parseKeyRing(env: Record<string, string | undefined>): KeyRing {
  const keys = new Map<number, Buffer>();
  for (const [name, value] of Object.entries(env)) {
    const match = /^DATA_KEY_V(\d{1,4})$/.exec(name);
    if (!match || !value) continue;
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32) throw new Error(`${name} harus 32 byte (base64).`);
    keys.set(Number(match[1]), key);
  }
  const currentVersion = Number(env.DATA_KEY_CURRENT);
  if (!Number.isInteger(currentVersion) || !keys.has(currentVersion)) {
    throw new Error('DATA_KEY_CURRENT harus menunjuk ke salah satu DATA_KEY_V<n> yang ada.');
  }
  return { currentVersion, keys };
}

export function encrypt(ring: KeyRing, context: string, plaintext: Buffer): { blob: Buffer; keyVersion: number } {
  const key = ring.keys.get(ring.currentVersion) as Buffer;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { blob: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]), keyVersion: ring.currentVersion };
}

export function decrypt(ring: KeyRing, context: string, keyVersion: number, blob: Buffer): Buffer {
  const key = ring.keys.get(keyVersion);
  if (!key) throw new Error(`Kunci versi ${keyVersion} tidak tersedia.`);
  if (blob.length < IV_LEN + TAG_LEN) throw new Error('Blob terenkripsi tidak valid.');
  const decipher = createDecipheriv('aes-256-gcm', key, blob.subarray(0, IV_LEN));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(blob.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return Buffer.concat([decipher.update(blob.subarray(IV_LEN + TAG_LEN)), decipher.final()]);
}

/** HMAC-SHA256 hex. `label` memisahkan jenis nilai (token vs kode) agar hash tidak bisa dipakai silang. */
export function hmacHex(pepper: Buffer, label: string, value: string): string {
  return createHmac('sha256', pepper).update(`${label}:${value}`, 'utf8').digest('hex');
}

/** Token edit pasien: 32 byte acak (43 karakter base64url). Ditampilkan sekali, hanya hash-nya disimpan. */
export function newEditToken(): string {
  return randomBytes(32).toString('base64url');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 simbol, tanpa I/O/0/1 -> tanpa bias modulo dari byte

export function newAccessCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % 32]).join('');
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
