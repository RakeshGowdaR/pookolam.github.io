# Pookolam AR — static web app (MindAR + A-Frame)

Real, working image-tracked AR, no app install: open this page in a phone/tablet
browser, point the camera at the pookolam, and it blooms. Built with
[MindAR](https://github.com/hiukim/mind-ar-js) (open source, MIT) + A-Frame —
no bundler, no build step, just static files.

## Run it locally

```
node server.js
```

Then open the printed `https://<your-ip>:8443` URL on the tablet (same wifi).
Camera access requires HTTPS or localhost, so this spins up a small local
server with a self-signed cert — Chrome will warn "not private" the first
time; tap **Advanced → Proceed**. That's expected and only happens once.

`index.html` currently tracks `assets/pookolam-source.png` — the "Three Steps"
**design mockup** you shared, compiled into `assets/pookolam.mind`. Point the
camera at that image (displayed on a screen, or printed) to see the bloom
sequence run. This is not a photo of the finished physical pookolam yet, so
tracking quality against the real floor design may differ — recompile once
that photo exists (see below).

MindAR's own bundled demo card is still there at
`assets/marker-example/` as an alternate known-good test target if you ever
need to sanity-check the pipeline independent of the pookolam art.

## Swapping in a real photo later

Once the physical pookolam is built and photographed:

1. Replace `assets/pookolam-source.png` with the new photo.
2. Run `node compile-marker.js` — this drives a headless browser through
   MindAR's own compiler and writes a fresh `assets/pookolam.mind`
   automatically (no need for the manual web-based compiler tool).
3. In `app.js`, update `TARGET_ASPECT` to the new photo's `height/width`
   ratio (it's `1.0` now because the mockup is square), and retune the
   `STORY_BEATS`/`CROWN_ACCENT`/`RING_ACCENTS` x/y fractions to match the new
   photo's layout.

See [`../ar/webar_build_guide.md`](../ar/webar_build_guide.md) for the full
walkthrough including photographing the physical design.

## Files

- `index.html` — page shell, loads the two libraries, defines the AR scene.
- `app.js` — the story-mode bloom logic (positions, timing, captions).
- `assets/flowers/*.svg` — hand-drawn marigold/jasmine/butterfly-pea/lotus/sparkle art.
- `assets/pookolam-source.png` / `assets/pookolam.mind` — the current tracked
  image and its compiled target.
- `libs/` — `aframe` + `mind-ar-js` (prebuilt browser bundles, vendored so the
  page also works with no internet at the venue once loaded once).
- `server.js` — local HTTPS static server for testing (not needed once hosted
  somewhere with real HTTPS). Also logs every request and client-reported
  event (camera errors, video state, target-found) to `device-logs.ndjson` —
  useful for diagnosing device-specific issues remotely.
- `compiler.html` / `compile-marker.js` — automated `.mind` compilation via a
  headless browser driving MindAR's own in-browser compiler.

## Deploying for the actual competition

A local server needs to keep running on someone's laptop during the demo,
which is fragile. Better: host the `webar/` folder as a static site somewhere
with permanent HTTPS (GitHub Pages, Netlify, Vercel, Cloudflare Pages all have
free tiers) and just open that URL on the tablet — nothing to keep running.
Creating that account/repo and deploying is a step I can't do without your
login — happy to prep the exact files/commands once you pick one.
