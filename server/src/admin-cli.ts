import { randomUUID } from 'node:crypto';
import { inviteToken, invitePath, loadAccountRow, emailSchema } from './auth.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { ensureSchema } from './schema.js';

/**
 * Membuat admin pertama (atau menerbitkan ulang tautan undangan admin yang sudah ada).
 *   node --env-file=<.env> server/admin.mjs create-admin <email> "<Nama tampilan>"
 * Mencetak alamat undangan RELATIF, berlaku 1 jam dan sekali pakai. Buka dengan domain situs di depannya.
 */
const [command, rawEmail, ...nameParts] = process.argv.slice(2);
if (command !== 'create-admin' || !rawEmail) {
  console.error('Pemakaian: admin.mjs create-admin <email> "<Nama tampilan>"');
  process.exit(2);
}
const email = emailSchema.parse(rawEmail);
const displayName = nameParts.join(' ').trim().slice(0, 100) || 'Admin';

const config = loadConfig();
const db = createPool(config.databaseUrl);
try {
  await ensureSchema(db);
  let row = await loadAccountRow(db, 'email', email);
  if (row && row.role !== 'admin') {
    console.error('Gagal: email ini sudah dipakai akun non-admin.');
    process.exitCode = 1;
  } else {
    if (!row) {
      await db.execute("INSERT INTO accounts (id, email, role, display_name) VALUES (?, ?, 'admin', ?)", [randomUUID(), email, displayName]);
      row = await loadAccountRow(db, 'email', email);
    }
    await db.execute("INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES (NULL, 'cli_admin_invite', 'accounts', ?)", [row!.id]);
    console.log(`Undangan admin (berlaku 1 jam, sekali pakai): ${invitePath(inviteToken(config.pepper, row!, 60 * 60))}`);
  }
} finally {
  await db.end();
}
