# ColorToLife - Interactive AR Coloring Web App

**Your Coloring. Your Colors. Your World.**

ColorToLife connects traditional paper coloring with digital play: children color a
printed character sheet with real crayons, scan it with their device camera, and
watch a 3D version of that character come alive in a playful world - wearing the
*exact* colors they used.

Everything runs 100% in the browser. No backend, no accounts, no uploads, no API keys.
Fully static and ready for GitHub Pages.

---

## How it works

1. **Print & Color** - Download or print the Dino coloring sheet (standard A4,
   white background, thick black outlines, five numbered color zones: Body, Belly,
   Spikes, Feet, Arms) and four black corner markers.
2. **Scan** - Open the in-app scanner. Point the camera at the page (or upload a
   photo instead). The app locates the four corner markers, computes a homography
   to correct perspective, and warps the photo onto the known sheet template.
3. **Color Recognition** - Every pixel inside each of the five zone regions is
   classified: black outlines, white paper, shadows and gray marks are ignored.
   A per-channel **median** of the remaining genuine crayon pixels gives a robust
   color per zone (median is resistant to stray strokes, highlights and shadows).
4. **Confirm** - Detected colors are shown as swatches (with an aligned preview of
   the scan and a recolored Dino preview). Tap any swatch to correct a color
   manually with a color picker.
5. **Play** - The colors are applied to separate materials of a procedural 3D Dino
   (Three.js) standing in a meadow with grass, trees, flowers, rocks and drifting
   clouds. Dino idles, blinks, wags its tail, walks, dances, jumps, and reacts when
   tapped. Drag to rotate, wheel/pinch to zoom.

Camera images are processed locally in the browser (Canvas + ImageData) and are
**never uploaded anywhere**.

---

## Quick start (local)

Any static file server works. From this folder:

```bash
# Python
python3 -m http.server 8080

# or Node
npx serve .
```

Then open <http://localhost:8080>.

> Opening `index.html` directly from the file system (`file://`) works for browsing
> the UI, but browsers block camera access on non-HTTPS origins. Use a local server
> or deploy to GitHub Pages for the full scanner experience. The "Use a Photo
> Instead" upload path also works as a fallback.

---

## Deploy to GitHub Pages

1. Create a GitHub repository (for example `colortolife`).
2. Upload this entire folder's contents to the repository root:

   ```bash
   git init
   git add .
   git commit -m "ColorToLife"
   git branch -M main
   git remote add origin https://github.com/<your-username>/colortolife.git
   git push -u origin main
   ```

3. In the repository: **Settings -> Pages -> Build and deployment -> Source:
   "Deploy from a branch"**, choose branch `main`, folder `/ (root)`, and save.
4. After a minute, the site is live at:

   `https://<your-username>.github.io/<repo-name>/`

All asset references in the app are **relative paths**, so it works both at a
repository subpath (`/colortolife/`) and at a custom domain root.

HTTPS on GitHub Pages also satisfies the browser's secure-context requirement for
camera access (`getUserMedia`).

---

## Project structure

```
ColorToLife/
├── index.html                     # single-page app with all screens
├── README.md
├── css/
│   └── style.css                  # design system + all component styles
├── js/
│   ├── vendor/
│   │   └── three.min.js           # Three.js r128, vendored locally (no CDN needed)
│   ├── sheet-data.js              # single source of truth for sheet geometry
│   ├── sheet-templates.js         # builds printable SVG / detection mask / previews
│   ├── sheet.js                   # preview, download (SVG), print (A4 iframe)
│   ├── audio.js                   # Web Audio synthesized sound effects + toggle
│   ├── camera.js                  # getUserMedia, camera switching, friendly errors
│   ├── color-detection.js         # markers -> homography -> warp -> median colors
│   ├── scanner.js                 # scanning UI flow (capture / retake / confirm)
│   ├── character.js               # procedural 3D Dino with 5 zone materials
│   ├── world.js                   # 3D environment, animations, orbit, landing scene
│   └── app.js                     # screen router, state, review, celebration
├── printable/
│   └── dino-coloring-sheet.svg    # the printable sheet (identical to in-app output)
└── assets/
    ├── images/favicon.svg
    ├── characters/dino.svg        # gallery preview (default palette)
    ├── characters/robo.svg        # "coming soon" gallery art
    └── characters/bunny.svg       # "coming soon" gallery art
```

---

## Browser support

- Chrome / Edge / Firefox / Safari (current versions), desktop and mobile.
- Rear camera is preferred on phones; a switch button appears when multiple
  cameras exist.
- WebGL is required for the 3D world (supported essentially everywhere).
- Sound is synthesized with the Web Audio API and stays **off** until the user
  taps the speaker button in the top bar.

---

## Tips for the best scan

- Print at **100% scale** (no "fit to page") on plain white A4 paper.
- Color with reasonably bold, saturated strokes; fill the zones.
- Avoid heavy shadows and dim light when scanning; daylight works best.
- Keep the whole page inside the on-screen frame; the four black corner markers
  must be visible.
- If a zone came out white on paper, it is reported as "uncolored" - you can fix
  it with the color picker before bringing Dino to life.

---

## Privacy

- No network requests beyond loading the app itself (fonts are optional and the
  app degrades gracefully offline).
- Camera frames and uploaded photos are processed in memory and never leave the
  device. No analytics, no cookies, no storage of images.

---

## Extending

- **New characters**: add a new `sheet-data`-style geometry file (zones + markers),
  generate its SVG + mask, and register a character build function in
  `character.js`. The detection pipeline is character-agnostic: it aligns on the
  four corner markers and reads zone ids from the flat-color mask.
- **Sheet IDs**: the footer of the printable sheet carries the page identifier
  (`CTL-DINO-01`) so future character sheets can be distinguished.

## License

Released under the MIT License. Three.js is bundled under its own MIT license
(c) three.js authors.
