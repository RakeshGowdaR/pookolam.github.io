const { chromium } = require('playwright');

(async () => {
  const errors = [];
  const consoleErrors = [];
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--ignore-certificate-errors'],
  });
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.goto('https://localhost:8443/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    targetEl = document.getElementById('pookolam-target');
    window.playSequence();
  });

  await page.waitForTimeout(6000);

  const status = await page.evaluate(() => {
    const layers = document.querySelectorAll('.bloom-layer');
    const bees = Array.from(layers).filter((el) => el.getAttribute('src') === '#bee');
    const bursts = Array.from(layers).filter((el) => el.getAttribute('src') === '#burst');
    const flowers = Array.from(layers).filter((el) => ['#marigold', '#jasmine', '#lotus', '#butterfly-pea'].includes(el.getAttribute('src')));
    const sparkles = Array.from(layers).filter((el) => el.getAttribute('src') === '#sparkle');
    return {
      totalLayers: layers.length,
      bees: bees.length,
      bursts: bursts.length,
      flowers: flowers.length,
      sparkles: sparkles.length,
      beePositions: bees.map((b) => b.getAttribute('position')),
    };
  });

  console.log('STATUS:', JSON.stringify(status, null, 2));
  console.log('PAGE ERRORS:', errors.length ? errors : 'none');
  console.log('CONSOLE ERRORS:', consoleErrors.length ? consoleErrors : 'none');

  await page.screenshot({ path: 'sequence-test-screenshot.png' });
  await browser.close();
  process.exit(errors.length || consoleErrors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
