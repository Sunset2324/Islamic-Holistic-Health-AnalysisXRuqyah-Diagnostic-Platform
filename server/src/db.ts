import mysql from 'mysql2/promise';

/**
 * Koneksi MariaDB/MySQL (Hostinger: MariaDB 11.x, host 127.0.0.1 dari aplikasi).
 * DATABASE_URL berbentuk mysql://user:password@127.0.0.1:3306/nama_db
 *
 * Skema di Hostinger tidak memuat routine/trigger, jadi semua logika yang dulu ada di fungsi SQL
 * Postgres sekarang berada di backend (lihat routes/submissions.ts). Semua query memakai prepared
 * statement (`execute`) dengan parameter terikat; multi-statement dimatikan.
 */
export type Db = mysql.Pool;

export function createPool(databaseUrl: string): Db {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'mysql:' && url.protocol !== 'mariadb:') {
    throw new Error('DATABASE_URL harus berskema mysql:// (MariaDB/MySQL).');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('DATABASE_URL harus menyebut nama database.');

  const pool = mysql.createPool({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    charset: 'utf8mb4_unicode_ci',
    // Semua waktu dibaca/ditulis dalam UTC agar perbandingan kedaluwarsa konsisten.
    timezone: 'Z',
    dateStrings: false,
    // Pengaman tambahan: satu panggilan = satu pernyataan.
    multipleStatements: false,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 30_000,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    waitForConnections: true,
    queueLimit: 100,
  });

  // Zona waktu sesi UTC + mode SQL ketat (nilai salah ditolak, bukan dipotong diam-diam).
  pool.pool.on('connection', (conn) => {
    conn.query(
      "SET time_zone = '+00:00', SESSION sql_mode = 'STRICT_ALL_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ZERO_DATE,NO_ZERO_IN_DATE,NO_ENGINE_SUBSTITUTION'",
    );
  });

  return pool;
}

/** Dijalankan dalam satu transaksi; rollback otomatis bila ada kesalahan. */
export async function withTransaction<T>(db: Db, fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}
