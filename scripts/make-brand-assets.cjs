// Membuat PNG dari public/favicon.svg dan public/og-image.png.
// Jalankan: node scripts/make-brand-assets.cjs   (butuh playwright + chromium)
// Atau dengan Chrome terpasang: CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node scripts/make-brand-assets.cjs
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('playwright-core'));
}
const fs = require('node:fs');
const path = require('node:path');

const pub = path.join(__dirname, '..', 'public');
const svg = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8');
const logoInline = svg.replace(/<title>.*?<\/title>/, '');

// Pratinjau tautan bergaya pastel "cerah ramah": fajar lembut, bukit hutan, logo daun + bulan sabit + matahari.
const ogHtml = `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:630px;position:relative;overflow:hidden;font-family:'Plus Jakarta Sans','Segoe UI','DejaVu Sans',sans-serif;
 background:linear-gradient(180deg,#e0d9fb 0%,#ffeadc 60%,#fff6f0 100%);color:#17483b">
  <svg style="position:absolute;inset:0" width="1200" height="630" viewBox="0 0 1200 630">
    <defs><radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff3e6"/><stop offset=".6" stop-color="#ffd4ba"/><stop offset="1" stop-color="#ffd4ba" stop-opacity="0"/></radialGradient></defs>
    <circle cx="930" cy="330" r="230" fill="url(#g)"/><circle cx="930" cy="330" r="70" fill="#fff3e6"/>
    <path d="M0 470C150 420 300 410 470 440S800 400 950 420S1140 440 1200 430V630H0Z" fill="#b9ecd5"/>
    <path d="M0 520C180 480 360 490 540 510S900 470 1200 500V630H0Z" fill="#88dbb9"/>
    <g fill="#30a882"><path d="M760 520l34 -110l34 110z"/><path d="M820 525l44 -140l44 140z"/><path d="M1060 520l34 -100l34 100z"/><path d="M1110 525l44 -130l44 130z"/></g>
    <path d="M0 630V580C200 550 400 590 600 630Z" fill="#55c49c"/>
  </svg>
  <div style="position:absolute;left:80px;top:64px;display:flex;align-items:center;gap:22px">
    <div style="width:88px;height:88px;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px -12px rgba(34,136,106,.7)">${logoInline}</div>
    <div style="font-size:44px;font-weight:700;letter-spacing:-0.5px">My Herbalis</div>
  </div>
  <div style="position:absolute;left:80px;top:205px;width:720px;font-size:70px;line-height:1.12;font-weight:700;letter-spacing:-1.5px;color:#1c1917">
    Kenali tubuh, sehatkan pikiran, <span style="color:#1d6d56">kuatkan iman.</span>
  </div>
  <div style="position:absolute;left:80px;bottom:60px;display:flex;gap:16px;font-size:26px;font-weight:600">
    <span style="background:rgba(255,255,255,.85);color:#533996;padding:12px 24px;border-radius:999px">Ruang aman untuk jujur</span>
    <span style="background:rgba(255,255,255,.85);color:#1d6d56;padding:12px 24px;border-radius:999px">12 pertanyaan · 3–5 menit</span>
  </div>
</div></body></html>`;

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
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
