import { randomBytes, randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, type Db } from '../src/db.js';
import { purgeExpired } from '../src/purge.js';

const adminUrl = process.env.TEST_ADMIN_URL;
const run = adminUrl ? describe : describe.skip;

run('purge respons draf kedaluwarsa (MariaDB sungguhan)', () => {
  let db: Db;
  beforeAll(() => {
    db = createPool(adminUrl as string);
  });
  afterAll(async () => {
    await db.end();
  });

  const hex = () => randomBytes(32).toString('hex');
  async function insertSubmission(status: 'draft' | 'in_consultation', expiresSql: string): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO submissions (id, edit_token_hash, status, intake_enc, answers_enc, tag_selections_enc, key_version,
                                questionnaire_version, algorithm_version, expires_at)
       VALUES (?, ?, ?, 'x', 'x', 'x', 1, 'v', 'v', ${expiresSql})`,
      [id, hex(), status],
    );
    return id;
  }
  async function insertCode(submissionId: string, expiresSql: string): Promise<string> {
    const id = randomUUID();
    await db.query(`INSERT INTO access_codes (id, submission_id, code_hash, expires_at) VALUES (?, ?, ?, ${expiresSql})`, [id, submissionId, hex()]);
    return id;
  }
  const exists = async (table: string, id: string) =>
    ((await db.query<RowDataPacket[]>(`SELECT 1 FROM ${table} WHERE id = ?`, [id]))[0]).length === 1;
  const codeStatus = async (id: string) =>
    ((await db.query<RowDataPacket[]>('SELECT status FROM access_codes WHERE id = ?', [id]))[0])[0]?.status;

  it('hapus draf kedaluwarsa + kodenya; draf aktif dan yang sedang dikonsultasikan tidak disentuh', async () => {
    const expired = await insertSubmission('draft', 'NOW(6) - INTERVAL 1 MINUTE');
    const expiredCode = await insertCode(expired, 'NOW(6) - INTERVAL 1 MINUTE');
    const active = await insertSubmission('draft', 'NOW(6) + INTERVAL 1 DAY');
    const activeCode = await insertCode(active, 'NOW(6) + INTERVAL 1 DAY');
    const locked = await insertSubmission('in_consultation', 'NULL');
    // Kode kedaluwarsa milik respons yang masih hidup -> ditandai expired, bukan dihapus.
    const staleCode = await insertCode(locked, 'NOW(6) - INTERVAL 1 MINUTE');

    const result = await purgeExpired(db);

    expect(result.deletedSubmissions).toBeGreaterThanOrEqual(1);
    expect(result.expiredCodes).toBeGreaterThanOrEqual(1);
    expect(await exists('submissions', expired)).toBe(false);
    expect(await exists('access_codes', expiredCode)).toBe(false);
    expect(await exists('submissions', active)).toBe(true);
    expect(await codeStatus(activeCode)).toBe('active');
    expect(await exists('submissions', locked)).toBe(true);
    expect(await codeStatus(staleCode)).toBe('expired');
  });

  it('aman dijalankan berulang (idempoten)', async () => {
    await purgeExpired(db);
    const again = await purgeExpired(db);
    expect(again).toEqual({ expiredCodes: 0, deletedSubmissions: 0, imageStorageKeys: [] });
  });
});
