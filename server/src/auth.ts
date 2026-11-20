import { hash as argonHash, verify as argonVerify, Algorithm } from '@node-rs/argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { hmacHex, safeEqual } from './crypto.js';
import type { Db } from './db.js';

/**
 * Autentikasi staf (konsultan & admin).
 * - Password: Argon2id, parameter minimum OWASP (19 MiB, 2 iterasi, 1 paralel).
 * - Sesi & undangan: token bertanda tangan HMAC-SHA256 dengan HMAC_PEPPER (label terpisah per jenis token),
 *   jadi tidak butuh tabel sesi maupun variabel environment baru.
 * - Setiap token membawa sidik jari password_hash saat token dibuat. Ganti password => semua sesi lama dan
 *   tautan undangan lama otomatis tidak berlaku (undangan jadi sekali pakai).
 * - Setiap permintaan memuat ulang akun: akun dinonaktifkan / peran berubah => sesi langsung ditolak.
 */

export type Role = 'consultant' | 'admin';

export interface StaffAccount {
  id: string;
  email: string;
  role: Role;
  displayName: string | null;
}

interface AccountRow extends RowDataPacket {
  id: string;
  email: string;
  role: 'patient' | Role;
  display_name: string | null;
  password_hash: string | null;
  disabled_at: Date | null;
}

const ARGON = { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const SESSION_COOKIE = '__Host-mh_session';
export const SESSION_TTL_SEC = 8 * 60 * 60;
export const INVITE_TTL_SEC = 72 * 60 * 60;

export const passwordSchema = z.string().min(12).max(128);
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .pipe(z.email());

export const hashPassword = (password: string) => argonHash(password, ARGON);

// Hash tiruan agar waktu respons login untuk email tak dikenal setara dengan email yang ada.
let dummyHash: Promise<string> | null = null;
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored) {
    dummyHash ??= hashPassword('dummy-password-for-timing');
    await argonVerify(await dummyHash, password).catch(() => false);
    return false;
  }
  return argonVerify(stored, password).catch(() => false);
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

/** Sidik jari password_hash (bukan hash-nya sendiri) untuk diikat ke token. */
export function passwordFingerprint(pepper: Buffer, passwordHash: string | null): string {
  return hmacHex(pepper, 'pw-fp', passwordHash ?? 'none').slice(0, 32);
}

type TokenKind = 'session' | 'invite';
interface TokenPayload {
  sub: string;
  exp: number;
  pf: string;
}

export function signToken(pepper: Buffer, kind: TokenKind, payload: TokenPayload): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${hmacHex(pepper, `token:${kind}`, body)}`;
}

const payloadSchema = z.strictObject({ sub: z.uuid(), exp: z.number().int(), pf: z.string().regex(/^[0-9a-f]{32}$/) });

export function readToken(pepper: Buffer, kind: TokenKind, token: string): TokenPayload | null {
  if (token.length > 512) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, hmacHex(pepper, `token:${kind}`, body))) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(unb64(body)));
    if (!parsed.success || parsed.data.exp * 1000 <= Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SEC}`;
}
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function readCookie(req: FastifyRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export async function loadAccountRow(db: Db, where: 'id' | 'email', value: string): Promise<AccountRow | null> {
  const [rows] = await db.execute<AccountRow[]>(
    `SELECT id, email, role, display_name, password_hash, disabled_at FROM accounts WHERE ${where === 'id' ? 'id' : 'email'} = ?`,
    [value],
  );
  return rows[0] ?? null;
}

export function toStaff(row: AccountRow): StaffAccount | null {
  if (row.role !== 'consultant' && row.role !== 'admin') return null;
  return { id: row.id, email: row.email, role: row.role, displayName: row.display_name };
}

/** Akun staf dari cookie sesi, atau null. Diperiksa ulang ke database pada SETIAP permintaan. */
export async function sessionAccount(db: Db, pepper: Buffer, req: FastifyRequest): Promise<StaffAccount | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const payload = readToken(pepper, 'session', token);
  if (!payload) return null;
  const row = await loadAccountRow(db, 'id', payload.sub);
  if (!row || row.disabled_at || !row.password_hash) return null;
  if (!safeEqual(payload.pf, passwordFingerprint(pepper, row.password_hash))) return null;
  return toStaff(row);
}

export function issueSession(reply: FastifyReply, pepper: Buffer, row: { id: string; password_hash: string | null }): void {
  const token = signToken(pepper, 'session', {
    sub: row.id,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
    pf: passwordFingerprint(pepper, row.password_hash),
  });
  reply.header('Set-Cookie', sessionCookie(token));
}

export function inviteToken(pepper: Buffer, row: { id: string; password_hash: string | null }, ttlSec = INVITE_TTL_SEC): string {
  return signToken(pepper, 'invite', {
    sub: row.id,
    exp: Math.floor(Date.now() / 1000) + ttlSec,
    pf: passwordFingerprint(pepper, row.password_hash),
  });
}

/** Alamat (relatif) halaman undangan. Token di fragmen (#) agar tidak terkirim ke server/log/Referer. */
export const invitePath = (token: string) => `/#/konsultan/undangan/${token}`;

/**
 * Penguncian login per email (di memori proses; Hostinger menjalankan satu proses).
 * 5 kali gagal => terkunci 15 menit. Ditambah batas laju per IP di rute.
 */
export class LoginGuard {
  private readonly fails = new Map<string, { count: number; lockedUntil: number }>();
  constructor(
    private readonly maxFails = 5,
    private readonly lockMs = 15 * 60 * 1000,
  ) {}
  locked(email: string): boolean {
    const f = this.fails.get(email);
    return !!f && f.lockedUntil > Date.now();
  }
  fail(email: string): void {
    const f = this.fails.get(email) ?? { count: 0, lockedUntil: 0 };
    if (f.lockedUntil && f.lockedUntil <= Date.now()) f.count = 0;
    f.count += 1;
    if (f.count >= this.maxFails) f.lockedUntil = Date.now() + this.lockMs;
    this.fails.set(email, f);
    if (this.fails.size > 10_000) this.fails.delete(this.fails.keys().next().value as string);
  }
  reset(email: string): void {
    this.fails.delete(email);
  }
}
