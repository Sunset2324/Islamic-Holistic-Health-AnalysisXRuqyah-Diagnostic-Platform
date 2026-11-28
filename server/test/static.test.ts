import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { staffBasePath } from '../src/auth.js';
import type { Db } from '../src/db.js';
import { testConfig } from './helpers.js';

describe('frontend disajikan dari proses API (hosting tanpa nginx)', () => {
  let dir: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  const cfg = testConfig();
  const INDEX = '<!doctype html><title>MyHerbalis-index</title>';

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'dist-'));
    mkdirSync(path.join(dir, 'assets'));
    writeFileSync(path.join(dir, 'index.html'), INDEX);
    writeFileSync(path.join(dir, 'assets', 'index-abc.js'), 'console.log(1)');
    writeFileSync(path.join(dir, 'favicon.svg'), '<svg/>');
    writeFileSync(path.join(dir, '.env'), 'RAHASIA=1');
    writeFileSync(path.join(dir, 'catatan.md'), 'rahasia');
    // Berkas di luar dist yang tidak boleh terjangkau.
    writeFileSync(path.join(path.dirname(dir), 'luar-dist.txt'), 'RAHASIA-LUAR');
    app = await buildApp({ config: cfg, db: {} as Db, logger: false, staticDir: dir });
  });
  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(path.join(path.dirname(dir), 'luar-dist.txt'), { force: true });
  });

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('halaman utama dan rute SPA -> index.html dengan header keamanan frontend', async () => {
    for (const url of ['/', '/hasil', '/konsultan/abc?x=1']) {
      const res = await get(url);
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(INDEX);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['content-security-policy']).toContain("script-src 'self'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['permissions-policy']).toContain('camera=()');
    }
  });

  it('aset ber-hash di-cache lama; berkas lain no-cache', async () => {
    const js = await get('/assets/index-abc.js');
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toContain('text/javascript');
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const icon = await get('/favicon.svg');
    expect(icon.headers['content-type']).toBe('image/svg+xml');
    expect(icon.headers['cache-control']).toBe('no-cache');
  });

  it('berkas tersembunyi, jenis tak dikenal, dan path traversal tidak pernah dilayani', async () => {
    for (const url of ['/.env', '/catatan.md', '/assets/tidak-ada.js', '/../luar-dist.txt', '/%2e%2e/luar-dist.txt', '/assets/..%2f..%2fluar-dist.txt']) {
      const res = await get(url);
      expect(res.body.includes('RAHASIA'), url).toBe(false);
      expect(res.body.includes('rahasia'), url).toBe(false);
    }
    expect((await get('/.env')).statusCode).toBe(404);
    expect((await get('/assets/tidak-ada.js')).statusCode).toBe(404);
  });

  it('/api yang tidak dikenal tetap JSON 404, bukan halaman aplikasi', async () => {
    const res = await get('/api/tidak-ada');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('header API ketat tidak bocor ke frontend, dan sebaliknya', async () => {
    const api = await app.inject({ method: 'GET', url: '/api/submissions/bukan-uuid' });
    expect(api.headers['content-security-policy']).toContain("default-src 'none'");
    expect(api.headers['cache-control']).toBe('no-store');
    const page = await get('/');
    expect(page.headers['content-security-policy']).not.toContain("default-src 'none'");
  });

  it('halaman staf hanya di alamat rahasia: noindex + no-store; tebakan lain 404', async () => {
    const real = staffBasePath(cfg.pepper);
    expect(real).toMatch(/^\/staf-[0-9a-f]{16}$/);
    // Pepper lain -> alamat lain (tidak bisa ditebak dari repo).
    expect(staffBasePath(testConfig().pepper)).not.toBe(real);
    for (const url of [real, `${real}/`]) {
      const res = await get(url);
      expect(res.statusCode, url).toBe(200);
      expect(res.body).toBe(INDEX);
      expect(res.headers['x-robots-tag']).toContain('noindex');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      // Kamera hanya untuk pemindai QR di halaman staf, terbatas asal yang sama; mikrofon dll. tetap mati.
      expect(res.headers['permissions-policy']).toBe('camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
    }
    // Halaman pasien dan tebakan alamat staf tetap tanpa kamera.
    for (const url of ['/', '/hasil', '/staf-0000000000000000']) {
      expect((await get(url)).headers['permissions-policy'], url).toContain('camera=()');
    }
    for (const url of ['/staf-0000000000000000', `${real}x`, `${real}/lain`, '/staf-', '/admin', '/#/konsultan']) {
      const res = await get(url);
      if (url.startsWith('/staf-')) expect(res.statusCode, url).toBe(404);
      else expect(res.headers['x-robots-tag'], url).toBeUndefined();
    }
  });

  it('metode selain GET/HEAD ke halaman ditolak', async () => {
    const res = await app.inject({ method: 'POST', url: '/', payload: {} });
    expect(res.statusCode).toBe(404);
  });
});
