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

const STORY_BEATS = [
  { asset: '#marigold', x: 0.18, y: 0.20, scale: 0.22, caption: 'The palm sways — Onam breezes in' },
  { asset: '#butterfly-pea', x: -0.22, y: 0.03, scale: 0.24, caption: 'The boats race by in festival joy' },
  { asset: '#jasmine', x: 0.00, y: 0.08, scale: 0.22, caption: "She waits, dressed for his homecoming" },
  { asset: '#lotus', x: 0.00, y: -0.23, scale: 0.28, caption: 'The lotus blooms to welcome the king' },
];

const CROWN_ACCENT = { asset: '#marigold', x: 0.12, y: 0.14, scale: 0.10 };

// The coconut tree's position is its BASE (see makeTree — it sways from
// there, not its center), roughly where the trunk meets the ground in the
// design. The boat bobs in place, so its spot is just its center.
const TREE_SPOT = { x: 0.18, y: 0.02, scale: 0.34 };
const BOAT_SPOT = { x: -0.22, y: 0.03, scale: 0.30 };

const RING_ACCENTS = (() => {
  const spots = [];
  const count = 8;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    spots.push({
      asset: i % 2 === 0 ? '#marigold' : '#jasmine',
      x: Math.cos(angle) * 0.46,
      y: Math.sin(angle) * 0.46,
      scale: 0.10,
    });
  }
  return spots;
})();

const SPARKLE_COUNT = 14;

let targetEl = null;
let played = false;
let timers = [];

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function makeFlower(spot) {
  const el = document.createElement('a-image');
  el.classList.add('bloom-layer');
  el.setAttribute('src', spot.asset);
  el.setAttribute('position', toPos(spot.x, spot.y, 0));
  el.setAttribute('scale', '0.001 0.001 0.001');
  el.setAttribute('material', 'transparent: true; opacity: 0; shader: flat');
  el.setAttribute(
    'animation__scale',
    `property: scale; to: ${spot.scale} ${spot.scale} ${spot.scale}; dur: ${BEAT_ANIM_MS}; easing: easeOutElastic`
  );
  el.setAttribute(
    'animation__fade',
    `property: material.opacity; to: 1; dur: ${Math.round(BEAT_ANIM_MS * 0.6)}; easing: easeOutQuad`
  );
  el.setAttribute(
    'animation__sway',
    `property: rotation; to: 0 0 6; dir: alternate; loop: true; dur: 1800; easing: easeInOutSine; delay: ${BEAT_ANIM_MS}`
  );
  // Gentle breathing glow once settled, so bloomed flowers feel alive rather
  // than static — starts after the bloom-in tween finishes.
  el.setAttribute(
    'animation__breathe',
    `property: material.opacity; from: 1; to: 0.8; dir: alternate; loop: true; dur: 1400; delay: ${BEAT_ANIM_MS}; easing: easeInOutSine`
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
// rotates around its own middle, which looks wrong for a tree. Instead this
// wraps the image in an entity anchored at the trunk's base, with the image
// offset upward inside it, so rotating the WRAPPER sways it from the ground.
function makeTree(spot) {
  const wrapper = document.createElement('a-entity');
  wrapper.classList.add('bloom-layer');
  wrapper.setAttribute('position', toPos(spot.x, spot.y, 0));
  wrapper.setAttribute('scale', '0.001 0.001 0.001');

  const treeHeight = 1.6; // coconut-tree.svg viewBox is 100x160
  const img = document.createElement('a-image');
  img.setAttribute('src', '#coconut-tree');
  img.setAttribute('width', '1');
  img.setAttribute('height', String(treeHeight));
  img.setAttribute('position', `0 ${treeHeight / 2} 0`);
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
    'animation__sway',
    `property: rotation; to: 0 0 6; dir: alternate; loop: true; dur: 2200; easing: easeInOutSine; delay: ${BEAT_ANIM_MS}`
  );

  return wrapper;
}

// The boat bobs on the water: a gentle vertical rise/fall plus a slight
// rock, both centered (unlike the tree, a boat's pivot can stay in the middle).
function makeBoat(spot) {
  const el = document.createElement('a-image');
  el.classList.add('bloom-layer');
  el.setAttribute('src', '#boat');
  el.setAttribute('width', '1');
  el.setAttribute('height', '0.5'); // boat.svg viewBox is 220x110
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

  STORY_BEATS.forEach((spot, i) => {
    timers.push(
      setTimeout(() => {
        targetEl.appendChild(makeBurst(spot, spot.scale));
        targetEl.appendChild(makeFlower(spot));
        if (i === 0) targetEl.appendChild(makeTree(TREE_SPOT));
        if (i === 1) targetEl.appendChild(makeBoat(BOAT_SPOT));
        caption.textContent = spot.caption;
        caption.classList.add('show');
      }, i * STAGGER_MS)
    );
  });

  const afterBeats = STORY_BEATS.length * STAGGER_MS;

  timers.push(
    setTimeout(() => {
      targetEl.appendChild(makeFlower(CROWN_ACCENT));
    }, afterBeats)
  );

  timers.push(
    setTimeout(() => {
      RING_ACCENTS.forEach((spot) => targetEl.appendChild(makeFlower(spot)));
    }, afterBeats + STAGGER_MS)
  );

  timers.push(
    setTimeout(() => {
      for (let i = 0; i < SPARKLE_COUNT; i++) {
        targetEl.appendChild(makeSparkle());
      }
      caption.classList.remove('show');

      const beeWaypoints = [...STORY_BEATS, CROWN_ACCENT];
      targetEl.appendChild(makeBee(beeWaypoints, { phaseMs: 0, hopDurMs: 1200, pauseMs: 500, scale: 0.05 }));
      targetEl.appendChild(makeBee(beeWaypoints, { phaseMs: 900, hopDurMs: 1500, pauseMs: 700, scale: 0.045 }));
    }, afterBeats + STAGGER_MS * 2)
  );
}

function showError(message) {
  document.getElementById('error-text').textContent = message;
  document.getElementById('error').classList.add('show');
  document.getElementById('hint').style.display = 'none';
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
    showError('Camera feed never started.\n\n' + permissionFixInstructions());
  }
}, 6000);

sceneEl.addEventListener('loaded', () => {
  remoteLog('scene-loaded', {});
  targetEl = document.getElementById('pookolam-target');

  targetEl.addEventListener('targetFound', () => {
    remoteLog('target-found', {});
    clearTimeout(cameraWatchdog);
    document.getElementById('hint').style.display = 'none';
    if (!played) {
      played = true;
      playSequence();
      startMusic();
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
