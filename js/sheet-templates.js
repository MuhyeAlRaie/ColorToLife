/* ============================================================
   ColorToLife - SVG sheet template engine
   ------------------------------------------------------------
   Builds three SVG flavors from the same CTL_SHEET geometry:
     sheetSVG()          -> printable coloring page (thick outlines)
     maskSVG()           -> flat unique-color fills for detection
     previewSVG(colors)  -> recolored digital preview for the UI
   Runs in the browser (globals) and in Node (build script).
   ============================================================ */
var CTL_Templates = (function () {
  var SHEET = typeof CTL_SHEET !== 'undefined'
    ? CTL_SHEET
    : (typeof require !== 'undefined' ? require('./sheet-data.js') : null);

  /* ---------- path helpers ---------- */

  function roundedRectPath(x, y, w, h, r) {
    return (
      'M ' + (x + r) + ' ' + y +
      ' L ' + (x + w - r) + ' ' + y +
      ' Q ' + (x + w) + ' ' + y + ' ' + (x + w) + ' ' + (y + r) +
      ' L ' + (x + w) + ' ' + (y + h - r) +
      ' Q ' + (x + w) + ' ' + (y + h) + ' ' + (x + w - r) + ' ' + (y + h) +
      ' L ' + (x + r) + ' ' + (y + h) +
      ' Q ' + x + ' ' + (y + h) + ' ' + x + ' ' + (y + h - r) +
      ' L ' + x + ' ' + (y + r) +
      ' Q ' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' Z'
    );
  }

  function ellipsePath(cx, cy, rx, ry) {
    return (
      'M ' + (cx - rx) + ' ' + cy +
      ' A ' + rx + ' ' + ry + ' 0 1 0 ' + (cx + rx) + ' ' + cy +
      ' A ' + rx + ' ' + ry + ' 0 1 0 ' + (cx - rx) + ' ' + cy + ' Z'
    );
  }

  /* Curved triangle spike: base points b1/b2, tip at apex. */
  function spikePath(b1, b2, apex) {
    function ctrl(from, to) {
      var mx = from[0] + (to[0] - from[0]) * 0.55;
      var my = from[1] + (to[1] - from[1]) * 0.55;
      return [mx, my];
    }
    var c1 = ctrl(b1, apex);
    var c2 = ctrl(b2, apex);
    return (
      'M ' + b1[0] + ' ' + b1[1] +
      ' Q ' + c1[0].toFixed(1) + ' ' + c1[1].toFixed(1) + ' ' + apex[0] + ' ' + apex[1] +
      ' Q ' + c2[0].toFixed(1) + ' ' + c2[1].toFixed(1) + ' ' + b2[0] + ' ' + b2[1] + ' Z'
    );
  }

  /* Capsule (rounded bar) between two points, given full width. */
  function capsulePath(from, to, w) {
    var r = w / 2;
    var dx = to[0] - from[0];
    var dy = to[1] - from[1];
    var len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len;
    var uy = dy / len;
    var px = -uy * r;
    var py = ux * r;
    var n = 2;
    function f(v) { return Math.round(v * n) / n; }
    /* Cap arcs bulge away from the capsule interior. */
    return (
      'M ' + f(from[0] + px) + ' ' + f(from[1] + py) +
      ' A ' + r + ' ' + r + ' 0 0 1 ' + f(from[0] - px) + ' ' + f(from[1] - py) +
      ' L ' + f(to[0] - px) + ' ' + f(to[1] - py) +
      ' A ' + r + ' ' + r + ' 0 0 1 ' + f(to[0] + px) + ' ' + f(to[1] + py) + ' Z'
    );
  }

  /* ---------- shared emission ---------- */

  function zonePaths() {
    var g = SHEET.geometry;
    return {
      tail: g.tailPath,
      body: g.bodyPath,
      spikes: g.spikes.map(function (s) { return spikePath(s.b1, s.b2, s.apex); }),
      feet: g.feet.map(function (f) { return roundedRectPath(f.x, f.y, f.w, f.h, f.r); }),
      belly: ellipsePath(g.belly.cx, g.belly.cy, g.belly.rx, g.belly.ry),
      arms: g.arms.map(function (a) { return capsulePath(a.from, a.to, a.w); })
    };
  }

  function markersSVG(offset) {
    var s = SHEET.markerSize;
    var half = s / 2;
    return SHEET.markers.map(function (m) {
      return '<rect x="' + (m.x - half) + '" y="' + (m.y - half) + '" width="' + s + '" height="' + s +
        '" fill="#111111" rx="' + (offset || 0) + '"/>';
    }).join('');
  }

  /* Paint order: tail, spikes, feet (behind) -> body -> belly -> arms (front) */
  function zoneLayerSVG(fillMap, stroke) {
    var p = zonePaths();
    var attrsFor = function (fill) {
      var a = 'fill="' + fill + '"';
      if (stroke) { a += ' stroke="#000000" stroke-width="6" stroke-linejoin="round"'; }
      return a;
    };
    var out = '';
    out += '<path d="' + p.tail + '" ' + attrsFor(fillMap.body) + '/>';
    p.spikes.forEach(function (d) { out += '<path d="' + d + '" ' + attrsFor(fillMap.spikes) + '/>'; });
    p.feet.forEach(function (d) { out += '<path d="' + d + '" ' + attrsFor(fillMap.feet) + '/>'; });
    out += '<path d="' + p.body + '" ' + attrsFor(fillMap.body) + '/>';
    out += '<path d="' + p.belly + '" ' + attrsFor(fillMap.belly) + '/>';
    p.arms.forEach(function (d) { out += '<path d="' + d + '" ' + attrsFor(fillMap.arms) + '/>'; });
    return out;
  }

  function faceSVG() {
    var g = SHEET.geometry;
    var out = '';
    g.cheeks.forEach(function (c) {
      out += '<circle cx="' + c.cx + '" cy="' + c.cy + '" r="' + c.r + '" fill="' + c.fill + '"/>';
    });
    g.eyes.forEach(function (e) {
      out += '<circle cx="' + e.cx + '" cy="' + e.cy + '" r="' + e.r + '" fill="#111111"/>';
    });
    g.glints.forEach(function (gl) {
      out += '<circle cx="' + gl.cx + '" cy="' + gl.cy + '" r="' + gl.r + '" fill="#FFFFFF"/>';
    });
    g.nostrils.forEach(function (n) {
      out += '<circle cx="' + n.cx + '" cy="' + n.cy + '" r="' + n.r + '" fill="#111111"/>';
    });
    out += '<path d="' + g.smilePath + '" fill="none" stroke="#111111" stroke-width="7" stroke-linecap="round"/>';
    g.toeLines.forEach(function (t) {
      out += '<line x1="' + t.x1 + '" y1="' + t.y1 + '" x2="' + t.x2 + '" y2="' + t.y2 +
        '" stroke="#111111" stroke-width="5" stroke-linecap="round"/>';
    });
    return out;
  }

  function badgesSVG() {
    return SHEET.zones.map(function (z) {
      return (
        '<g>' +
        '<circle cx="' + z.badge.x + '" cy="' + z.badge.y + '" r="15" fill="#FFFFFF" stroke="#BDBDBD" stroke-width="3"/>' +
        '<text x="' + z.badge.x + '" y="' + (z.badge.y + 8) + '" text-anchor="middle" ' +
        'font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="bold" fill="#9E9E9E">' +
        z.num + '</text>' +
        '</g>'
      );
    }).join('');
  }

  function svgOpen(w, h) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h +
      '" viewBox="0 0 ' + w + ' ' + h + '">';
  }

  /* ---------- public builders ---------- */

  /* The printable coloring page. */
  function sheetSVG() {
    var w = SHEET.width, h = SHEET.height;
    var svg =
      svgOpen(w, h) +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#FFFFFF"/>' +
      '<text x="400" y="54" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" ' +
      'font-size="30" font-weight="bold" fill="#B9B9B9" letter-spacing="4">DINO</text>' +
      markersSVG(4) +
      zoneLayerSVG({ body: '#FFFFFF', belly: '#FFFFFF', spikes: '#FFFFFF', feet: '#FFFFFF', arms: '#FFFFFF' }, true) +
      faceSVG() +
      badgesSVG() +
      '<text x="400" y="1104" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" ' +
      'font-size="19" fill="#B9B9B9">ColorToLife &bull; ' + SHEET.character + ' &bull; ' + SHEET.id + '</text>' +
      '</svg>';
    return svg;
  }

  /* Detection mask: every zone gets one exact flat color so each
     warped pixel can be classified with a strict RGB match. */
  function maskSVG() {
    var w = SHEET.width, h = SHEET.height;
    var byKey = {};
    SHEET.zones.forEach(function (z) {
      byKey[z.key] = 'rgb(' + z.maskColor[0] + ',' + z.maskColor[1] + ',' + z.maskColor[2] + ')';
    });
    var svg =
      svgOpen(w, h) +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#FFFFFF"/>' +
      markersSVG(0) +
      zoneLayerSVG(byKey, false) +
      faceSVG() +
      '</svg>';
    return svg;
  }

  /* Recolored preview used on the review screen and in the gallery. */
  function previewSVG(colors, opts) {
    var w = SHEET.width, h = SHEET.height;
    opts = opts || {};
    var fills = {
      body: (colors && colors.body) || SHEET.defaultColors.body,
      belly: (colors && colors.belly) || SHEET.defaultColors.belly,
      spikes: (colors && colors.spikes) || SHEET.defaultColors.spikes,
      feet: (colors && colors.feet) || SHEET.defaultColors.feet,
      arms: (colors && colors.arms) || SHEET.defaultColors.arms
    };
    var svg =
      svgOpen(w, h) +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#FFFFFF"/>' +
      (opts.showMarkers ? markersSVG(4) : '') +
      zoneLayerSVG(fills, true) +
      faceSVG() +
      (opts.showBadges ? badgesSVG() : '') +
      '</svg>';
    return svg;
  }

  return {
    sheetSVG: sheetSVG,
    maskSVG: maskSVG,
    previewSVG: previewSVG,
    zonePaths: zonePaths,
    spikePath: spikePath,
    capsulePath: capsulePath,
    roundedRectPath: roundedRectPath,
    ellipsePath: ellipsePath
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = CTL_Templates; }
