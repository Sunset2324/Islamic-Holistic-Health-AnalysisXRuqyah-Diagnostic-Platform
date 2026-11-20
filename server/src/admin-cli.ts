import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { emailSchema, inviteToken, invitePath, loadAccountRow, staffBasePath } from './auth.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { ensureSchema } from './schema.js';

/**
 * Alat admin dari server (Hostinger: cron sekali jalan). Semua keluaran tanpa data pasien.
 *   admin.mjs create-admin <email> "<Nama>"   admin pertama / undangan ulang admin (1 jam, sekali pakai)
 *   admin.mjs path                            alamat rahasia halaman staf
 *   admin.mjs audit [jumlah]                  aktivitas terakhir (metadata saja) + daftar akun staf
 */
const USAGE = 'Pemakaian: admin.mjs create-admin <email> "<Nama>" | path | audit [jumlah]';
const [command, ...args] = process.argv.slice(2);

const config = loadConfig();

if (command === 'path') {
  console.log(`Halaman staf: ${staffBasePath(config.pepper)}`);
} else if (command === 'create-admin' || command === 'audit') {
  const db = createPool(config.databaseUrl);
  try {
    await ensureSchema(db);
    if (command === 'create-admin') await createAdmin(db, args);
    else await audit(db, args[0]);
  } finally {
    await db.end();
  }
} else {
  console.error(USAGE);
  process.exitCode = 2;
}

async function createAdmin(db: ReturnType<typeof createPool>, [rawEmail, ...nameParts]: string[]) {
  if (!rawEmail) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const email = emailSchema.parse(rawEmail);
  const displayName = nameParts.join(' ').trim().slice(0, 100) || 'Admin';
  let row = await loadAccountRow(db, 'email', email);
  if (row && row.role !== 'admin') {
    console.error('Gagal: email ini sudah dipakai akun non-admin.');
    process.exitCode = 1;
    return;
  }
  if (!row) {
    await db.execute("INSERT INTO accounts (id, email, role, display_name) VALUES (?, ?, 'admin', ?)", [randomUUID(), email, displayName]);
    row = await loadAccountRow(db, 'email', email);
  }
  await db.execute("INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES (NULL, 'cli_admin_invite', 'accounts', ?)", [row!.id]);
  console.log(`Undangan admin (berlaku 1 jam, sekali pakai): ${invitePath(config.pepper, inviteToken(config.pepper, row!, 60 * 60))}`);
}

interface AuditRow extends RowDataPacket {
  at: Date;
  action: string;
  entity: string;
  entity_id: string;
  email: string | null;
  role: string | null;
}
interface StaffRow extends RowDataPacket {
  email: string;
  role: string;
  display_name: string | null;
  has_password: number;
  disabled_at: Date | null;
}

async function audit(db: ReturnType<typeof createPool>, rawLimit?: string) {
  const limit = Math.min(Math.max(Number.parseInt(rawLimit ?? '30', 10) || 30, 1), 200);
  const [rows] = await db.query<AuditRow[]>(
    `SELECT l.at, l.action, l.entity, l.entity_id, a.email, a.role
       FROM audit_log l LEFT JOIN accounts a ON a.id = l.actor_id
      ORDER BY l.id DESC LIMIT ${limit}`,
  );
  console.log(`== ${rows.length} aktivitas terakhir (UTC) ==`);
  for (const r of rows) {
    const who = r.email ? `${r.email} (${r.role})` : 'sistem';
    console.log(`${r.at.toISOString().slice(0, 19).replace('T', ' ')}  ${r.action.padEnd(16)} ${who}  ${r.entity}/${r.entity_id.slice(0, 8)}`);
  }
  const [staff] = await db.query<StaffRow[]>(
    `SELECT email, role, display_name, password_hash IS NOT NULL AS has_password, disabled_at
       FROM accounts WHERE role IN ('admin', 'consultant') ORDER BY role, email`,
  );
  console.log(`== ${staff.length} akun staf ==`);
  for (const s of staff) {
    const status = s.disabled_at ? 'nonaktif' : s.has_password ? 'aktif' : 'menunggu undangan';
    console.log(`${s.role.padEnd(10)} ${s.email}  ${s.display_name ?? ''}  [${status}]`);
  }
}
