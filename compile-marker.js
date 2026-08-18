// Automates MindAR's browser-based image-target compiler via a headless
// browser, so a .mind file can be generated without the manual web tool.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
  const page = await browser.newPage();

  page.on('console', (msg) => console.log('[page]', msg.text()));
  page.on('pageerror', (err) => console.error('[pageerror]', err.message));

  await page.goto('https://localhost:8443/compiler.html', { waitUntil: 'load' });

  console.log('Compiling image target (this can take a bit for a large image)...');
  const result = await page.evaluate(() => window.runCompile());

  const outPath = path.join(__dirname, 'assets', 'pookolam.mind');
  fs.writeFileSync(outPath, Buffer.from(result.base64, 'base64'));

  console.log('Wrote', outPath, '-', result.byteLength, 'bytes (source type:', result.type, ')');

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
