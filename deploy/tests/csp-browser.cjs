// Memuat aplikasi lewat nginx uji dan memastikan CSP tidak memblokir apa pun pada alur pasien (landing -> hasil).
// Pemakaian: NODE_PATH=$(npm root -g) node deploy/tests/csp-browser.cjs https://127.0.0.1:8443/
const { chromium } = require('playwright');
const URL = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } })).newPage();
  const problems = [];
  const hosts = new Set();
  page.on('console', (m) => { if (/content security policy|refused to/i.test(m.text())) problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('request', (r) => hosts.add(new globalThis.URL(r.url()).host));
  await page.goto(URL);
  await page.getByRole('button', { name: /Mulai Analisis/ }).click();
  await page.locator('input[type=number]').fill('30');
  await page.locator('textarea').first().fill('Uji CSP.');
  await page.getByRole('button', { name: /Lanjut ke Pertanyaan/ }).click();
  for (let i = 0; i < 12; i++) {
    await page.getByRole('radio').nth(2).click();
    await page.getByRole('button', { name: i === 11 ? /Lihat hasil sementara/ : /^Lanjut$/ }).click();
  }
  await page.getByText('Hasil sementara', { exact: true }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const fontOk = await page.evaluate(() => document.fonts.check('700 16px "Plus Jakarta Sans"'));
  const animated = await page.evaluate(() => [...document.querySelectorAll('[style]')].length);
  console.log('Host yang dihubungi:', [...hosts]);
  console.log('Font lokal termuat:', fontOk, '| elemen dengan style inline:', animated);
  console.log('Pelanggaran CSP / error halaman:', problems.length ? problems : 'tidak ada');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
