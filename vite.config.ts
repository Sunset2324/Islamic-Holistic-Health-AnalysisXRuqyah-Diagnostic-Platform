import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Mengganti %SITE_URL% di index.html dengan VITE_SITE_URL (alamat publik situs, tanpa garis miring di akhir).
 * Crawler WhatsApp/Facebook/X hanya menerima alamat gambar absolut, jadi isi variabel ini sebelum deploy.
 */
function siteUrl(mode: string): Plugin {
  const raw = loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL ?? '';
  const url = raw.replace(/\/+$/, '');
  return {
    name: 'site-url',
    transformIndexHtml(html) {
      if (!url && mode === 'production') {
        console.warn('[site-url] VITE_SITE_URL belum diisi: gambar pratinjau tautan tidak akan tampil di WhatsApp/Facebook/X.');
      }
      return html.replaceAll('%SITE_URL%', url);
    },
  };
}

// Alamat API untuk pengembangan/preview. Produksi: reverse proxy yang menyajikan /api dan frontend dari satu origin.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
const apiProxy = { '/api': { target: apiTarget, changeOrigin: false } };

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), siteUrl(mode)],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
}));
