// Pookolam AR — story-mode bloom sequence.
// Positions are fractions of the tracked image's width/height (-0.5..0.5),
// read directly off assets/pookolam-source-v2.png (the newly shortlisted
// design, 727x736: a woman awaiting the king's return, a decorated Vallam
// (snake boat), a palm tree, and a lotus in bloom).
//
// TARGET_ASPECT must match the marker image currently set in index.html's
// imageTargetSrc. Update this and the spot fractions below if a new photo
// is compiled in later (see ar/webar_build_guide.md).

const TARGET_ASPECT = 736 / 727;
const TARGET_WIDTH = 1;
const TARGET_HEIGHT = TARGET_WIDTH * TARGET_ASPECT;

// Reports back to the dev server (same origin, see server.js's /log route)
// so device testing can be diagnosed without needing screenshots relayed
// back manually. Writes to webar/device-logs.ndjson.
function remoteLog(event, data) {
  try {
    const payload = JSON.stringify({ event, data: data || {}, url: location.href });
    fetch('/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch (e) {
    // ignore — logging must never break the app
  }
}

function videoSnapshot() {
  const v = document.querySelector('video');
  if (!v) return { videoExists: false };
  return {
    videoExists: true,
    readyState: v.readyState,
    videoWidth: v.videoWidth,
    videoHeight: v.videoHeight,
    paused: v.paused,
    ended: v.ended,
  };
}

remoteLog('script-start', {
  ua: navigator.userAgent,
  isSecureContext: window.isSecureContext,
  screen: { w: screen.width, h: screen.height },
});

window.addEventListener('error', (e) => {
  remoteLog('window-error', { message: e.message, filename: e.filename, lineno: e.lineno });
});
window.addEventListener('unhandledrejection', (e) => {
  remoteLog('unhandled-rejection', { reason: String(e.reason) });
});

const STAGGER_MS = 450;
const BEAT_ANIM_MS = 700;

function toPos(xFrac, yFrac, z) {
  return `${(xFrac * TARGET_WIDTH).toFixed(4)} ${(yFrac * TARGET_HEIGHT).toFixed(4)} ${z || 0}`;
}

// No flower icons anymore — just a caption + light burst at each story
// point, plus the tree/boat graphics. `scale` here only sizes the burst.
const STORY_BEATS = [
  { x: 0.32, y: 0.22, scale: 0.20, caption: 'The palm sways — Onam breezes in' },
  { x: -0.34, y: 0.20, scale: 0.20, caption: 'The boats race by in festival joy' },
  { x: -0.12, y: -0.06, scale: 0.18, caption: "She waits, dressed for his homecoming" },
  { x: 0.00, y: -0.30, scale: 0.22, caption: 'The lotus blooms to welcome the king' },
  { x: 0.38, y: -0.16, scale: 0.26, caption: 'Maveli returns to see his people' },
];

// The coconut tree's and king's positions are their BASE (see makeTree/
// makeKing — they sway from there, not their center), roughly where feet
// meet ground in the design. The boat bobs in place, so its spot is its
// center. Tree and king are pushed further apart on the x-axis than the
// first pass, which put them close enough to visually blend into each
// other (tree fronds reading as part of his headwear).
const TREE_SPOT = { x: 0.19, y: -0.02, scale: 0.20 };
const BOAT_SPOT = { x: -0.26, y: 0.00, scale: 0.24 };
const KING_SPOT = { x: 0.38, y: -0.32, scale: 0.28 };

const SPARKLE_COUNT = 14;

let targetEl = null;
let played = false;
let timers = [];

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

// A "HAPPY ONAM" banner arcing above the tracked design like a rainbow,
// outside the pookolam artwork itself rather than overlapping it. Appears
// once, immediately, and stays up with a slow breathing glow rather than
// fading out like the per-beat effects.
function makeTitleBanner() {
  const el = document.createElement('a-image');
  el.classList.add('bloom-layer');
  el.setAttribute('src', '#happy-onam');
  const width = 0.85;
  const height = width * (250 / 400); // happy-onam.svg viewBox is 400x250 (with headroom for the arc's peak)
  el.setAttribute('width', String(width));
  el.setAttribute('height', String(height));
  el.setAttribute('position', toPos(0, 0.5 * TARGET_HEIGHT + height / 2 + 0.04, 0.02));
  el.setAttribute('scale', '0.001 0.001 0.001');
  el.setAttribute('material', 'transparent: true; opacity: 0; shader: flat');
  el.setAttribute(
    'animation__grow',
    `property: scale; to: 1 1 1; dur: ${BEAT_ANIM_MS}; easing: easeOutElastic`
  );
  el.setAttribute(
    'animation__fade',
    `property: material.opacity; to: 1; dur: ${Math.round(BEAT_ANIM_MS * 0.6)}; easing: easeOutQuad`
  );
  el.setAttribute(
    'animation__breathe',
    `property: material.opacity; from: 1; to: 0.82; dir: alternate; loop: true; dur: 1800; delay: ${BEAT_ANIM_MS}; easing: easeInOutSine`
  );
  return el;
}

function makeBurst(spot, flowerScale) {
  const el = document.createElement('a-image');
  el.classList.add('bloom-layer');
  el.setAttribute('src', '#burst');
  el.setAttribute('position', toPos(spot.x, spot.y, -0.01));
  el.setAttribute('scale', '0.001 0.001 0.001');
  el.setAttribute('material', 'transparent: true; opacity: 0.9; shader: flat');
  const burstScale = (flowerScale || 0.3) * 2.4;
  el.setAttribute(
    'animation__scale',
    `property: scale; to: ${burstScale} ${burstScale} ${burstScale}; dur: 550; easing: easeOutQuad`
  );
  el.setAttribute('animation__fade', 'property: material.opacity; to: 0; dur: 550; easing: easeInQuad');
  return el;
}

// The palm tree sways from its base, not its center — a plain a-image
// rotates around its own middle, which looks wrong for a tree. The trunk
// uses the same base-anchored-wrapper trick as before. Each frond is its
// OWN base-anchored wrapper too (attached near the trunk's top instead of
// the ground), fanned out to a fixed angle, then swaying independently
// around that angle with its own phase/speed — so the fronds move like
// individual branches in a breeze instead of the whole tree rocking as one
// rigid unit.
// Spread across ~300° (not just a flat 170° upward fan) so several fronds
// droop below horizontal like a real palm crown, instead of reading as a
// hand-fan/sunburst shape.
const FROND_ANGLES = [-150, -100, -50, 0, 50, 100, 150];

function makeTree(spot) {
  const wrapper = document.createElement('a-entity');
  wrapper.classList.add('bloom-layer');
  wrapper.setAttribute('position', toPos(spot.x, spot.y, 0));
  wrapper.setAttribute('scale', '0.001 0.001 0.001');
  wrapper.setAttribute(
    'animation__grow',
    `property: scale; to: ${spot.scale} ${spot.scale} ${spot.scale}; dur: ${BEAT_ANIM_MS}; easing: easeOutElastic`
  );

  // These are in the SAME local units the outer wrapper's grow-in scale
  // then multiplies again — the earlier 0.5/0.42 values didn't account for
  // that second multiplication and rendered roughly 3x too big, badly
  // overshooting the design's frame.
  const trunkWidth = 0.18;
  const trunkHeight = trunkWidth * (170 / 40); // trunk.svg viewBox is 40x170
  const trunkImg = document.createElement('a-image');
  trunkImg.setAttribute('src', '#trunk');
  trunkImg.setAttribute('width', String(trunkWidth));
  trunkImg.setAttribute('height', String(trunkHeight));
  trunkImg.setAttribute('position', `0 ${trunkHeight / 2} 0`);
  trunkImg.setAttribute('material', 'transparent: true; opacity: 0; shader: flat');
  trunkImg.setAttribute(
    'animation__fade',
    `property: material.opacity; to: 1; dur: ${Math.round(BEAT_ANIM_MS * 0.6)}; easing: easeOutQuad`
  );
  wrapper.appendChild(trunkImg);

  const frondWidth = 0.17;
  const frondHeight = frondWidth * (180 / 40); // frond.svg viewBox is 40x180
  const attachY = trunkHeight * 0.95;

  FROND_ANGLES.forEach((angle, i) => {
    const frondWrapper = document.createElement('a-entity');
    frondWrapper.setAttribute('position', `0 ${attachY} ${0.001 + i * 0.0001}`);
    frondWrapper.setAttribute('rotation', `0 0 ${angle}`);
    wrapper.appendChild(frondWrapper);

    const frondImg = document.createElement('a-image');
    frondImg.setAttribute('src', '#frond');
    frondImg.setAttribute('width', String(frondWidth));
    frondImg.setAttribute('height', String(frondHeight));
    frondImg.setAttribute('position', `0 ${frondHeight / 2} 0`);
    frondImg.setAttribute('material', 'transparent: true; opacity: 0; shader: flat');
    frondImg.setAttribute(
      'animation__fade',
      `property: material.opacity; to: 1; dur: ${Math.round(BEAT_ANIM_MS * 0.6)}; delay: ${i * 40}; easing: easeOutQuad`
    );
    frondWrapper.appendChild(frondImg);

    const sway = 5 + (i % 3);
    const dur = 1700 + i * 140;
    frondWrapper.setAttribute(
      'animation__sway',
      `property: rotation; from: 0 0 ${angle - sway}; to: 0 0 ${angle + sway}; ` +
        `dir: alternate; loop: true; dur: ${dur}; delay: ${BEAT_ANIM_MS + i * 90}; easing: easeInOutSine`
    );
  });

  return wrapper;
}

// The boat bobs on the water: a gentle vertical rise/fall plus a slight
// rock, both centered (unlike the tree, a boat's pivot can stay in the middle).
function makeBoat(spot) {
  const el = document.createElement('a-image');
  el.classList.add('bloom-layer');
  el.setAttribute('src', '#boat');
  el.setAttribute('width', '1');
  el.setAttribute('height', String(120 / 220)); // boat.svg viewBox is 220x120
  el.setAttribute('position', toPos(spot.x, spot.y, 0));
  el.setAttribute('scale', '0.001 0.001 0.001');
  el.setAttribute('material', 'transparent: true; opacity: 0; shader: flat');
  el.setAttribute(
    'animation__grow',
    `property: scale; to: ${spot.scale} ${spot.scale} ${spot.scale}; dur: ${BEAT_ANIM_MS}; easing: easeOutElastic`
  );
  el.setAttribute(
    'animation__fade',
    `property: material.opacity; to: 1; dur: ${Math.round(BEAT_ANIM_MS * 0.6)}; easing: easeOutQuad`
  );
  const bobDelta = 0.02;
  el.setAttribute(
    'animation__bob',
    `property: position; from: ${toPos(spot.x, spot.y - bobDelta, 0)}; to: ${toPos(spot.x, spot.y + bobDelta, 0)}; ` +
      `dir: alternate; loop: true; dur: 1600; easing: easeInOutSine; delay: ${BEAT_ANIM_MS}`
  );
  el.setAttribute(
    'animation__rock',
    `property: rotation; to: 0 0 4; dir: alternate; loop: true; dur: 1400; easing: easeInOutSine; delay: ${BEAT_ANIM_MS}`
  );
  return el;
}

// King Mahabali (Maveli) — same base-anchored-wrapper trick as the tree, so
// he sways from his feet instead of pivoting around his belt. An original
// drawing in the same flat-SVG style as the rest of the scene, not a copy
// of any stock illustration.
function makeKing(spot) {
  const wrapper = document.createElement('a-entity');
  wrapper.classList.add('bloom-layer');
  wrapper.setAttribute('position', toPos(spot.x, spot.y, 0));
  wrapper.setAttribute('scale', '0.001 0.001 0.001');

  const kingHeight = 220 / 140; // king-mahabali.svg viewBox is 140x220
  const img = document.createElement('a-image');
  img.setAttribute('src', '#king-mahabali');
  img.setAttribute('width', '1');
  img.setAttribute('height', String(kingHeight));
  img.setAttribute('position', `0 ${kingHeight / 2} 0`);
  img.setAttribute('material', 'transparent: true; opacity: 0; shader: flat');
  wrapper.appendChild(img);

  wrapper.setAttribute(
    'animation__grow',
    `property: scale; to: ${spot.scale} ${spot.scale} ${spot.scale}; dur: ${BEAT_ANIM_MS}; easing: easeOutElastic`
  );
  img.setAttribute(
    'animation__fade',
    `property: material.opacity; to: 1; dur: ${Math.round(BEAT_ANIM_MS * 0.6)}; easing: easeOutQuad`
  );
  wrapper.setAttribute(
    'animation__wave',
    `property: rotation; to: 0 0 4; dir: alternate; loop: true; dur: 1800; easing: easeInOutSine; delay: ${BEAT_ANIM_MS}`
  );

  return wrapper;
}

// A bee that endlessly hops between waypoints (pausing briefly at each to
// "pollinate"), looping forever. Chains one A-Frame animation per hop via
// startEvents/animationcomplete, then re-triggers itself at the end.
function makeBee(waypoints, opts) {
  const { phaseMs = 0, hopDurMs = 1300, pauseMs = 550, scale = 0.055 } = opts || {};
  const el = document.createElement('a-image');
  el.classList.add('bloom-layer');
  el.setAttribute('src', '#bee');
  el.setAttribute('scale', `${scale} ${scale} ${scale}`);
  el.setAttribute('material', 'transparent: true; opacity: 0.95; shader: flat');
  el.setAttribute('position', toPos(waypoints[0].x, waypoints[0].y, 0.02));

  const n = waypoints.length;
  const restartEvent = 'bee-restart-' + Math.random().toString(36).slice(2, 8);

  for (let i = 0; i < n; i++) {
    const from = waypoints[i];
    const to = waypoints[(i + 1) % n];
    const startEvents = i === 0 ? restartEvent : `animationcomplete__hop${i - 1}`;
    el.setAttribute(
      `animation__hop${i}`,
      `property: position; from: ${toPos(from.x, from.y, 0.02)}; to: ${toPos(to.x, to.y, 0.02)}; ` +
        `dur: ${hopDurMs}; delay: ${pauseMs}; easing: easeInOutSine; startEvents: ${startEvents}`
    );
  }
  el.setAttribute(
    'animation__flutter',
    `property: scale; from: ${scale} ${scale} ${scale}; to: ${scale * 1.15} ${scale * 0.88} ${scale}; ` +
      `dir: alternate; loop: true; dur: 110; easing: linear`
  );

  el.addEventListener(`animationcomplete__hop${n - 1}`, () => {
    el.emit(restartEvent);
  });
  setTimeout(() => el.emit(restartEvent), phaseMs);

  return el;
}

function makeSparkle() {
  const x = (Math.random() - 0.5) * TARGET_WIDTH * 0.9;
  const yStart = -TARGET_HEIGHT * 0.5;
  const yEnd = TARGET_HEIGHT * 0.5;
  const dur = 3000 + Math.random() * 2000;
  const delay = Math.random() * dur;

  const el = document.createElement('a-image');
  el.classList.add('bloom-layer');
  el.setAttribute('src', '#sparkle');
  el.setAttribute('scale', '0.05 0.05 0.05');
  el.setAttribute('material', 'transparent: true; opacity: 0; shader: flat');
  el.setAttribute('position', toPos(x, yStart, 0.01));
  el.setAttribute(
    'animation__rise',
    `property: position; from: ${toPos(x, yStart, 0.01)}; to: ${toPos(x, yEnd, 0.01)}; dur: ${dur}; loop: true; delay: ${delay}; easing: linear`
  );
  el.setAttribute(
    'animation__twinkle',
    `property: material.opacity; from: 0; to: 0.9; dir: alternate; loop: true; dur: ${dur / 2}; delay: ${delay}; easing: easeInOutSine`
  );
  return el;
}

function playSequence() {
  clearTimers();
  targetEl.querySelectorAll('.bloom-layer').forEach((n) => n.remove());

  const caption = document.getElementById('caption');
  caption.classList.remove('show');

  targetEl.appendChild(makeTitleBanner());

  STORY_BEATS.forEach((spot, i) => {
    timers.push(
      setTimeout(() => {
        targetEl.appendChild(makeBurst(spot, spot.scale));
        if (i === 0) targetEl.appendChild(makeTree(TREE_SPOT));
        if (i === 1) targetEl.appendChild(makeBoat(BOAT_SPOT));
        if (i === 4) targetEl.appendChild(makeKing(KING_SPOT));
        caption.textContent = spot.caption;
        caption.classList.add('show');
      }, i * STAGGER_MS)
    );
  });

  const afterBeats = STORY_BEATS.length * STAGGER_MS;

  timers.push(
    setTimeout(() => {
      for (let i = 0; i < SPARKLE_COUNT; i++) {
        targetEl.appendChild(makeSparkle());
      }
      caption.classList.remove('show');

      const beeWaypoints = [TREE_SPOT, BOAT_SPOT, ...STORY_BEATS];
      targetEl.appendChild(makeBee(beeWaypoints, { phaseMs: 0, hopDurMs: 1200, pauseMs: 500, scale: 0.05 }));
      targetEl.appendChild(makeBee(beeWaypoints, { phaseMs: 900, hopDurMs: 1500, pauseMs: 700, scale: 0.045 }));
    }, afterBeats + STAGGER_MS)
  );
}

let errorRecoverable = false;

function showError(message, recoverable) {
  errorRecoverable = !!recoverable;
  document.getElementById('error-text').textContent = message;
  document.getElementById('error').classList.add('show');
  document.getElementById('hint').style.display = 'none';
}

function hideError() {
  errorRecoverable = false;
  document.getElementById('error').classList.remove('show');
}

// The watchdog's "camera feed never started" message fires just because no
// frame has arrived in 6s — which also happens, harmlessly, whenever the
// browser's own permission popup is still sitting there unanswered. If the
// camera actually starts working after that (e.g. someone taps Allow a
// little late), the banner shouldn't be left covering the screen forever.
// Only watchdog-triggered errors are treated as recoverable this way —
// arError (a real getUserMedia rejection) means access was actually denied,
// so there's nothing to silently recover from.
function watchForLateRecovery() {
  let ticks = 0;
  const interval = setInterval(() => {
    ticks++;
    if (!errorRecoverable || ticks > 30) {
      clearInterval(interval);
      return;
    }
    const snap = videoSnapshot();
    if (snap.videoExists && snap.readyState >= 2 && snap.videoWidth > 0) {
      remoteLog('late-recovery', {});
      hideError();
      document.getElementById('hint').style.display = '';
      clearInterval(interval);
    }
  }, 1000);
}

// No web page can open a browser's permission settings itself — every
// browser blocks that on purpose, precisely so a site can't push someone
// into changing security settings. Once camera access is denied, the exact
// manual fix differs enough by platform that a single generic instruction
// ("tap the lock icon") is wrong often enough to be useless — so pick the
// right one based on the device actually reporting the error.
function permissionFixInstructions() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  if (isIOS) {
    return (
      'On iPhone/iPad: tap the "aA" icon at the left of the address bar → Website Settings → ' +
      'Camera → Allow, then reload. If Camera isn\'t listed there, check ' +
      'Settings app → [your browser] → Camera is turned on for this device first.'
    );
  }
  return (
    'Tap the lock/info icon next to the address bar → Permissions (or "Site settings") → ' +
    'Camera → Allow, then reload.'
  );
}

const sceneEl = document.querySelector('a-scene');

if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  remoteLog('media-devices-missing', {});
  showError(
    "This browser can't access the camera here. This page needs to be opened over https:// (or localhost) — check the address bar."
  );
} else {
  remoteLog('media-devices-available', {});
}

sceneEl.addEventListener('arError', (e) => {
  const reason = e && e.detail && e.detail.error;
  remoteLog('ar-error', { reason, video: videoSnapshot() });
  showError(
    "Camera didn't start (" + (reason || 'unknown error') + "). Most likely camera permission was denied or blocked for this site.\n\n" +
    permissionFixInstructions()
  );
});

// Watchdog: if no camera frame arrives within a few seconds and MindAR hasn't
// reported an error either, something failed silently — surface it instead
// of leaving a blank screen.
setTimeout(() => remoteLog('video-check-2s', { video: videoSnapshot() }), 2000);

const cameraWatchdog = setTimeout(() => {
  const snap = videoSnapshot();
  const gotFrame = snap.videoExists && snap.readyState >= 2 && snap.videoWidth > 0;
  remoteLog('video-check-6s', { video: snap, gotFrame });
  if (!gotFrame && !document.getElementById('error').classList.contains('show')) {
    showError('Camera feed never started.\n\n' + permissionFixInstructions(), true);
    watchForLateRecovery();
  }
}, 6000);

sceneEl.addEventListener('loaded', () => {
  remoteLog('scene-loaded', {});
  targetEl = document.getElementById('pookolam-target');

  // Some phones/browsers report the AR canvas's initial size before the
  // page layout has actually settled (or cap concurrent WebGL contexts,
  // since MindAR's tracking engine and this rendering canvas are two
  // separate ones) — either can leave the 3D layer sized wrong or blank
  // while the camera feed and audio, which don't depend on it, work fine.
  // A cheap, safe nudge: force a resize shortly after load so the renderer
  // recomputes against the now-settled layout.
  setTimeout(() => window.dispatchEvent(new Event('resize')), 300);

  const canvas = sceneEl.canvas;
  if (canvas) {
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      remoteLog('webgl-context-lost', {});
      showError('The AR view stopped rendering (a browser/graphics limit was hit). Tap Reload to restart it.');
    });
  }

  targetEl.addEventListener('targetFound', () => {
    remoteLog('target-found', {});
    clearTimeout(cameraWatchdog);
    document.getElementById('hint').style.display = 'none';
    if (!played) {
      played = true;
      playSequence();
      startMusic();

      // If the bloom sequence ran but nothing actually rendered (the exact
      // "music plays, no visuals" symptom), the canvas is almost always
      // sized wrong (0 or near-0) rather than genuinely broken. Surface
      // that instead of leaving it silently blank.
      setTimeout(() => {
        const c = sceneEl.canvas;
        const rendered = c && c.width > 10 && c.height > 10;
        remoteLog('render-check', {
          canvasSize: c ? { width: c.width, height: c.height } : null,
          bloomLayerCount: targetEl.querySelectorAll('.bloom-layer').length,
        });
        if (!rendered) {
          showError('The AR view rendered at the wrong size and may be blank. Tap Reload to try again.');
        }
      }, 1500);
    }
  });

  targetEl.addEventListener('targetLost', () => remoteLog('target-lost', {}));
});

document.getElementById('replay-btn').addEventListener('click', () => {
  remoteLog('replay-clicked', {});
  played = true;
  playSequence();
});

document.getElementById('error-retry').addEventListener('click', () => {
  remoteLog('reload-clicked', {});
  location.reload();
});

// Background music: auto-starts the moment the bloom sequence triggers
// (called from targetFound above), falling back to "play on next tap" if
// the browser's autoplay policy blocks the automatic attempt (a page with
// zero prior user interaction can't start audio with sound). The button
// remains for manual mute/replay control either way, and fades in/out
// instead of hard cutting. Disables itself gracefully if
// assets/music.mp3 hasn't been added yet.
const musicBtn = document.getElementById('music-btn');
const musicAudio = document.getElementById('bg-music');
const MUSIC_TARGET_VOLUME = 0.7;
const MUSIC_FADE_MS = 1200;
let musicFadeTimer = null;
let musicPendingAutoplay = false;

musicAudio.addEventListener('error', () => {
  remoteLog('music-asset-missing', {});
  musicBtn.classList.add('disabled');
  musicBtn.textContent = '🔇 No track yet';
});

function fadeMusicTo(target, done) {
  clearInterval(musicFadeTimer);
  const steps = 24;
  const stepMs = MUSIC_FADE_MS / steps;
  const start = musicAudio.volume;
  let i = 0;
  musicFadeTimer = setInterval(() => {
    i++;
    musicAudio.volume = start + (target - start) * (i / steps);
    if (i >= steps) {
      clearInterval(musicFadeTimer);
      musicAudio.volume = target;
      if (done) done();
    }
  }, stepMs);
}

function startMusic() {
  if (!musicAudio.paused || musicBtn.classList.contains('disabled')) return;
  musicAudio.volume = 0;
  musicAudio.play().then(() => {
    remoteLog('music-play', {});
    musicPendingAutoplay = false;
    fadeMusicTo(MUSIC_TARGET_VOLUME);
    musicBtn.textContent = '🔊 Music';
  }).catch((err) => {
    remoteLog('music-play-blocked', { message: String(err) });
    // Autoplay was blocked (no user gesture yet) — retry on the first tap
    // anywhere on the page instead of waiting for the music button
    // specifically, so it starts as close to "automatically" as browsers
    // allow.
    musicPendingAutoplay = true;
    document.addEventListener(
      'pointerdown',
      function retryOnFirstTap() {
        document.removeEventListener('pointerdown', retryOnFirstTap);
        if (musicPendingAutoplay) startMusic();
      },
      { once: true }
    );
  });
}

function stopMusic() {
  if (musicAudio.paused) return;
  fadeMusicTo(0, () => musicAudio.pause());
  remoteLog('music-pause', {});
}

musicBtn.addEventListener('click', () => {
  if (musicAudio.paused) {
    startMusic();
  } else {
    stopMusic();
  }
});
