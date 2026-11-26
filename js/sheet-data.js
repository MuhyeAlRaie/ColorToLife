/* ============================================================
   ColorToLife - Dino coloring sheet data (single source of truth)
   ------------------------------------------------------------
   Template coordinate system: 800 x 1131 (A4 portrait ratio).
   These values are shared by:
     - printable/dino-coloring-sheet.svg  (the printed page)
     - the detection mask (same geometry, flat zone colors)
     - the on-screen digital preview
   Keeping one source guarantees the scan maps 1:1 onto zones.
   Works in the browser (global) and in Node (module.exports).
   ============================================================ */
var CTL_SHEET = {
  id: 'CTL-DINO-01',
  character: 'Dino',
  width: 800,
  height: 1131,

  /* Four black corner markers, order: TL, TR, BL, BR.
     Their centers are the alignment anchors for perspective
     correction during scanning. */
  markers: [
    { x: 64,  y: 64 },
    { x: 736, y: 64 },
    { x: 64,  y: 1067 },
    { x: 736, y: 1067 }
  ],
  markerSize: 34,

  /* The five colorable zones (printed page order matters:
     shapes listed in "behind" paint order are drawn first so the
     body outline overlaps them cleanly). */
  zones: [
    { key: 'body',   name: 'Body',   num: 1, maskColor: [255, 0, 0],   badge: { x: 400, y: 548 } },
    { key: 'belly',  name: 'Belly',  num: 2, maskColor: [0, 255, 0],   badge: { x: 400, y: 706 } },
    { key: 'spikes', name: 'Spikes', num: 3, maskColor: [0, 0, 255],   badge: { x: 400, y: 172 } },
    { key: 'feet',   name: 'Feet',   num: 4, maskColor: [255, 255, 0], badge: { x: 332, y: 914 } },
    { key: 'arms',   name: 'Arms',   num: 5, maskColor: [255, 0, 255], badge: { x: 254, y: 640 } }
  ],

  /* Primitive geometry (converted to path strings by sheet-templates.js) */
  geometry: {
    /* Head + body as one friendly gourd-shaped silhouette */
    bodyPath:
      'M 400 198 ' +
      'C 320 198 254 256 254 334 ' +
      'C 254 394 280 440 320 468 ' +
      'C 270 506 234 578 234 660 ' +
      'C 234 782 308 874 400 874 ' +
      'C 492 874 566 782 566 660 ' +
      'C 566 578 530 506 480 468 ' +
      'C 520 440 546 394 546 334 ' +
      'C 546 256 480 198 400 198 Z',

    /* Tail peeks out from behind the body on the right */
    tailPath:
      'M 540 690 ' +
      'C 632 706 700 764 716 842 ' +
      'C 727 894 694 928 654 906 ' +
      'C 612 883 592 830 566 788 ' +
      'C 552 764 543 736 540 712 Z',

    /* Five back spikes: curved triangles poking out from the
       silhouette. b1/b2 = base points (hidden behind the body,
       must lie INSIDE the silhouette), apex = visible tip. */
    spikes: [
      { b1: [350, 222], b2: [450, 222], apex: [400, 74]  },   /* top of head */
      { b1: [282, 252], b2: [312, 338], apex: [214, 248] },   /* left head */
      { b1: [518, 252], b2: [488, 338], apex: [586, 248] },   /* right head */
      { b1: [335, 470], b2: [262, 556], apex: [185, 505] },   /* left shoulder */
      { b1: [465, 470], b2: [538, 556], apex: [615, 505] }    /* right shoulder */
    ],

    /* Feet: rounded stubs sticking out below the body */
    feet: [
      { x: 284, y: 870, w: 96, h: 94, r: 34 },
      { x: 420, y: 870, w: 96, h: 94, r: 34 }
    ],

    /* Belly: soft ellipse on the lower body */
    belly: { cx: 400, cy: 700, rx: 118, ry: 100 },

    /* Arms: little capsules in front of the body */
    arms: [
      { from: [288, 586], to: [236, 664], w: 52 },
      { from: [512, 586], to: [564, 664], w: 52 }
    ],

    /* Face decor - always black & white, never a color zone */
    eyes: [
      { cx: 338, cy: 322, r: 27 },
      { cx: 462, cy: 322, r: 27 }
    ],
    glints: [
      { cx: 329, cy: 312, r: 8 },
      { cx: 453, cy: 312, r: 8 }
    ],
    cheeks: [
      { cx: 298, cy: 374, r: 13, fill: '#E9E9E9' },
      { cx: 502, cy: 374, r: 13, fill: '#E9E9E9' }
    ],
    nostrils: [
      { cx: 384, cy: 358, r: 5 },
      { cx: 416, cy: 358, r: 5 }
    ],
    smilePath: 'M 356 386 Q 400 424 444 386',
    toeLines: [
      { x1: 316, y1: 934, x2: 316, y2: 958 },
      { x1: 348, y1: 934, x2: 348, y2: 958 },
      { x1: 452, y1: 934, x2: 452, y2: 958 },
      { x1: 484, y1: 934, x2: 484, y2: 958 }
    ]
  },

  /* Default playful palette (used for landing / gallery previews
     and as 3D fallback when a zone was left uncolored). */
  defaultColors: {
    body:   '#9BE0A6',
    belly:  '#FFF3B0',
    spikes: '#FFA69E',
    feet:   '#9AC8FF',
    arms:   '#C3AEF0'
  }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = CTL_SHEET; }
