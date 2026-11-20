// Titik masuk untuk hosting (Hostinger Node.js "entry file"): menjalankan src/server.ts lewat tsx tanpa langkah kompilasi,
// sama seperti deploy/systemd/myherbalis-api.service. Semua konfigurasi dibaca dari environment hosting.
import { register } from 'tsx/esm/api';

register();
await import('./src/server.ts');
