import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { STAFF_PATH_PREFIX } from './auth.js';

/**
 * Menyajikan hasil build frontend (dist/) dari proses Node yang sama dengan API.
 * Dipakai di hosting tanpa nginx yang bisa diatur (Hostinger Node.js): header di sini setara dengan
 * deploy/nginx/myherbalis-headers.conf dan aturan cache di deploy/nginx/myherbalis.conf.
 *
 * Keamanan: seluruh berkas dibaca SEKALI saat start ke peta di memori. Permintaan hanya dicocokkan dengan
 * kunci peta itu, sehingga tidak ada jalur dari URL ke sistem berkas (tidak mungkin path traversal), berkas
 * tersembunyi (.xxx) tidak pernah dimuat, dan hanya jenis berkas yang dikenal yang dilayani.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export const FRONTEND_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};

interface StaticFile {
  body: Buffer;
  type: string;
}

async function loadDir(root: string, dir = root, out = new Map<string, StaticFile>()): Promise<Map<string, StaticFile>> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await loadDir(root, full, out);
    } else if (entry.isFile()) {
      const type = TYPES[path.extname(entry.name).toLowerCase()];
      if (!type) continue;
      const urlPath = '/' + path.relative(root, full).split(path.sep).join('/');
      out.set(urlPath, { body: await readFile(full), type });
    }
  }
  return out;
}

export async function registerStatic(app: FastifyInstance, distDir: string, staffPath?: string): Promise<void> {
  const files = await loadDir(distDir);
  const index = files.get('/index.html');
  if (!index) throw new Error(`index.html tidak ditemukan di ${distDir}. Jalankan build frontend dulu.`);

  const send = (reply: FastifyReply, file: StaticFile, cache: string) => {
    reply.headers(FRONTEND_SECURITY_HEADERS);
    reply.header('Cache-Control', cache);
    reply.type(file.type);
    return reply.send(file.body);
  };

  app.route({
    method: ['GET', 'HEAD'],
    url: '/*',
    handler: async (req, reply) => {
      const pathname = req.url.split('?')[0] ?? '/';
      // Alamat /api yang tidak dikenal tetap dijawab JSON, bukan halaman aplikasi.
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        return reply.code(404).header('Cache-Control', 'no-store').send({ error: 'not_found' });
      }
      // Halaman staf hanya di alamat rahasia yang benar; tebakan /staf-... lain dijawab 404 biasa.
      if (pathname.startsWith(STAFF_PATH_PREFIX)) {
        if (!staffPath || (pathname !== staffPath && pathname !== `${staffPath}/`)) {
          return reply.code(404).headers(FRONTEND_SECURITY_HEADERS).type('text/plain; charset=utf-8').send('Not found');
        }
        reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
        return send(reply, index, 'no-store');
      }
      const file = files.get(pathname);
      if (file && pathname !== '/index.html') {
        // Aset ber-hash dari Vite aman di-cache lama; berkas lain (ikon, og-image) dicek ulang.
        return send(reply, file, pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      }
      // Aset yang hilang dan berkas tersembunyi (/.env, /.git/...) -> 404 asli, bukan index.html.
      if (pathname.startsWith('/assets/') || path.extname(pathname) || pathname.split('/').some((s) => s.startsWith('.') || s.startsWith('%2e') || s.startsWith('%2E'))) {
        return reply.code(404).headers(FRONTEND_SECURITY_HEADERS).type('text/plain; charset=utf-8').send('Not found');
      }
      // Rute aplikasi (SPA).
      return send(reply, index, 'no-cache');
    },
  });
}
