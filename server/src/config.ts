import { z } from 'zod';
import { parseKeyRing, type KeyRing } from './crypto.js';

export interface AppConfig {
  databaseUrl: string;
  pepper: Buffer;
  keyRing: KeyRing;
  port: number;
  trustProxy: boolean;
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HMAC_PEPPER: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
});

/** Semua rahasia dibaca dari environment (atau secret manager yang mengisinya). Tidak pernah dari repo. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const pepper = Buffer.from(parsed.HMAC_PEPPER, 'base64');
  if (pepper.length < 32) throw new Error('HMAC_PEPPER minimal 32 byte (base64).');
  return {
    databaseUrl: parsed.DATABASE_URL,
    pepper,
    keyRing: parseKeyRing(env),
    port: parsed.PORT,
    trustProxy: parsed.TRUST_PROXY === 'true',
  };
}
