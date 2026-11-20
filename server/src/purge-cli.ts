import { createPool } from './db.js';
import { purgeExpired } from './purge.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('purge gagal: DATABASE_URL tidak tersedia.');
  process.exit(1);
}
const db = createPool(url);
try {
  const r = await purgeExpired(db);
  console.log(
    `purge selesai ${new Date().toISOString()}: respons draf dihapus=${r.deletedSubmissions}, kode akses kedaluwarsa=${r.expiredCodes}, foto menunggu dihapus=${r.imageStorageKeys.length}`,
  );
} catch (err) {
  // Hanya nama/kode kesalahan; pesan driver bisa memuat potongan query.
  console.error(`purge gagal: ${(err as Error).name} ${(err as { code?: string }).code ?? ''}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
