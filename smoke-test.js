// One-off smoke test: loads the AR page in headless Chromium with a fake
// camera feed and checks that all libraries load, AFRAME registers MindAR's
// components, and the scene initializes without console errors. This does
// NOT verify real marker detection (the fake camera feed isn't the marker
// image) — that still needs a real device test.
const { chromium } = require('playwright');

(async () => {
  const errors = [];
  const consoleMsgs = [];

  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--ignore-certificate-errors',
    ],
  });
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();

  page.on('console', (msg) => consoleMsgs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto('https://localhost:8443/', { waitUntil: 'load' });

  // Give MindAR time to init camera + start processing frames.
  await page.waitForTimeout(6000);

  const status = await page.evaluate(() => {
    const scene = document.querySelector('a-scene');
    const video = document.querySelector('video');
    const canvas = document.querySelector('canvas.a-canvas');
    const rect = (el) => el ? (({ x, y, width, height }) => ({ x, y, width, height }))(el.getBoundingClientRect()) : null;
    return {
      hasAframe: typeof window.AFRAME !== 'undefined',
      hasMindarComponent: !!(window.AFRAME && window.AFRAME.components['mindar-image']),
      hasMindarTargetComponent: !!(window.AFRAME && window.AFRAME.components['mindar-image-target']),
      sceneLoaded: !!(scene && scene.hasLoaded),
      hasVideo: !!video,
      videoRect: rect(video),
      videoReadyState: video ? video.readyState : null,
      videoPlaying: video ? !video.paused && !video.ended && video.readyState > 2 : null,
      canvasRect: rect(canvas),
      replayBtnExists: !!document.getElementById('replay-btn'),
    };
  });

  await page.screenshot({ path: 'smoke-test-screenshot.png' });

  console.log('STATUS:', JSON.stringify(status, null, 2));
  console.log('\nCONSOLE MESSAGES:');
  consoleMsgs.forEach((m) => console.log(' ', m));
  console.log('\nPAGE ERRORS:', errors.length ? errors : 'none');

  await browser.close();

  const ok = status.hasAframe && status.hasMindarComponent && status.hasMindarTargetComponent && status.sceneLoaded && errors.length === 0;
  process.exit(ok ? 0 : 1);
})();
