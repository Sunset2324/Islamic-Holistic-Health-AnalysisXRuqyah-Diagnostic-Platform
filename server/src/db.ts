import pg from 'pg';

export type Db = pg.Pool;

export function createPool(databaseUrl: string): Db {
  return new pg.Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000 });
}

/** Kesalahan bisnis dari fungsi SQL (RAISE EXCEPTION) -> kode P0001. */
export function isBusinessError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P0001';
}
