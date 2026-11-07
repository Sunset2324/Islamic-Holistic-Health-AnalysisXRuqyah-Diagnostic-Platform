// Membuat PNG dari public/favicon.svg dan public/og-image.png.
// Jalankan: node scripts/make-brand-assets.cjs   (butuh playwright + chromium)
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const pub = path.join(__dirname, '..', 'public');
const svg = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8');
const logoInline = svg.replace(/<title>.*?<\/title>/, '');

const ogHtml = `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;position:relative;overflow:hidden;font-family:'Plus Jakarta Sans','DejaVu Sans',sans-serif;
 background:linear-gradient(135deg,#134e4a 0%,#0f766e 55%,#14b8a6 120%);color:#fff">
  <svg style="position:absolute;right:-120px;top:-120px" width="620" height="620" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="none" stroke="#ffffff" stroke-opacity=".10" stroke-width="2"/><circle cx="50" cy="50" r="34" fill="none" stroke="#ffffff" stroke-opacity=".10" stroke-width="2"/><circle cx="50" cy="50" r="20" fill="none" stroke="#ffffff" stroke-opacity=".10" stroke-width="2"/></svg>
  <div style="position:absolute;left:80px;top:70px;display:flex;align-items:center;gap:22px">
    <div style="width:88px;height:88px">${logoInline}</div>
    <div style="font-size:44px;font-weight:700;letter-spacing:-0.5px">MyHerbalis</div>
  </div>
  <div style="position:absolute;left:80px;top:230px;width:900px;font-size:76px;line-height:1.12;font-weight:700;letter-spacing:-1.5px">
    Kenali tubuh, sehatkan pikiran, kuatkan iman.
  </div>
  <div style="position:absolute;left:80px;bottom:70px;display:flex;gap:16px;font-size:26px">
    <span style="background:rgba(255,255,255,.16);padding:12px 24px;border-radius:999px">Analisis Kesehatan Holistik Islami</span>
    <span style="background:rgba(255,255,255,.16);padding:12px 24px;border-radius:999px">12 pertanyaan · 3–5 menit</span>
  </div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(ogHtml);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(pub, 'og-image.png') });

  for (const [name, size] of [['favicon-32.png', 32], ['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    const p = await browser.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<body style="margin:0"><div style="width:${size}px;height:${size}px">${logoInline.replace('<svg ', `<svg width="${size}" height="${size}" `)}</div></body>`);
    await p.screenshot({ path: path.join(pub, name), omitBackground: true });
  }
  await browser.close();
})();
