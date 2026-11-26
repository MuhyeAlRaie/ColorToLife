/* ============================================================
   ColorToLife - Color recognition engine (100% local, no server)
   ------------------------------------------------------------
   Pipeline:
     1. Downscale the captured photo (max 720 px wide).
     2. Locate the four black corner reference markers using
        adaptive thresholding + connected components inside small
        search windows around the expected guide positions.
     3. Solve a 4-point homography (DLT) template -> photo, which
        corrects perspective distortion of the paper.
     4. Inverse-warp the photo onto the 800x1131 template space
        (rendered at 400x566) with bilinear sampling.
     5. Classify every pixel against the flat-color zone mask
        (eroded 3 px to stay clear of black outlines).
     6. Filter out outlines (dark), paper/shadows (low
        saturation, near-white) and keep genuine crayon pixels.
     7. Compute the per-channel MEDIAN of each zone - a robust
        estimator that ignores stray strokes and highlights.
   Result: the actual colors the child used, per zone.
   ============================================================ */
var CTLDetect = (function () {

  /* ---------------- small utilities ---------------- */

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

  function rgbToCss(r, g, b) {
    var c = [Math.round(r), Math.round(g), Math.round(b)];
    return '#' + c.map(function (v) {
      var s = clamp(v, 0, 255).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  function downscaleCanvas(source, maxW) {
    var w = source.width, h = source.height;
    var scale = Math.min(1, maxW / w);
    var outW = Math.max(1, Math.round(w * scale));
    var outH = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, outW, outH);
    return canvas;
  }

  /* ---------------- homography (DLT, 4 points) ---------------- */

  /* Solve H (3x3, h33=1) mapping srcPts -> dstPts. Returns null on failure. */
  function solveHomography(srcPts, dstPts) {
    var A = [];
    for (var i = 0; i < 4; i++) {
      var s = srcPts[i], d = dstPts[i];
      A.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y, d.x]);
      A.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y, d.y]);
    }
    /* Gaussian elimination with partial pivoting on the 8x9 system */
    var n = 8;
    for (var col = 0; col < n; col++) {
      var pivot = col;
      for (var row = col + 1; row < n; row++) {
        if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) { pivot = row; }
      }
      if (Math.abs(A[pivot][col]) < 1e-10) { return null; }
      var tmp = A[col]; A[col] = A[pivot]; A[pivot] = tmp;
      for (var r2 = col + 1; r2 < n; r2++) {
        var factor = A[r2][col] / A[col][col];
        for (var c2 = col; c2 <= n; c2++) { A[r2][c2] -= factor * A[col][c2]; }
      }
    }
    var h = new Array(9);
    for (var back = n - 1; back >= 0; back--) {
      var sum = A[back][n];
      for (var c3 = back + 1; c3 < n; c3++) { sum -= A[back][c3] * h[c3]; }
      h[back] = sum / A[back][back];
      if (!isFinite(h[back])) { return null; }
    }
    h[8] = 1;
    return [
      [h[0], h[1], h[2]],
      [h[3], h[4], h[5]],
      [h[6], h[7], h[8]]
    ];
  }

  function applyH(H, x, y) {
    var d = H[2][0] * x + H[2][1] * y + H[2][2];
    return {
      x: (H[0][0] * x + H[0][1] * y + H[0][2]) / d,
      y: (H[1][0] * x + H[1][1] * y + H[1][2]) / d
    };
  }

  /* ---------------- corner marker detection ---------------- */

  /* Otsu threshold over a 256-bin luminance histogram. */
  function otsu(hist, total) {
    var sum = 0;
    for (var i = 0; i < 256; i++) { sum += i * hist[i]; }
    var sumB = 0, wB = 0, maxVar = -1, thr = 127;
    for (var t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) { continue; }
      var wF = total - wB;
      if (wF === 0) { break; }
      sumB += t * hist[t];
      var mB = sumB / wB;
      var mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) { maxVar = between; thr = t; }
    }
    return thr;
  }

  /*
   * Find one marker near `expected` inside a search window.
   * Returns {x, y, found}.
   */
  function findMarkerNear(data, imgW, imgH, expected, winR, expArea) {
    var x0 = Math.max(1, Math.floor(expected.x - winR));
    var y0 = Math.max(1, Math.floor(expected.y - winR));
    var x1 = Math.min(imgW - 2, Math.ceil(expected.x + winR));
    var y1 = Math.min(imgH - 2, Math.ceil(expected.y + winR));
    var ww = x1 - x0 + 1, wh = y1 - y0 + 1;
    if (ww < 8 || wh < 8) { return { x: expected.x, y: expected.y, found: false }; }

    /* luminance + histogram */
    var lums = new Float32Array(ww * wh);
    var hist = new Array(256).fill(0);
    for (var yy = y0; yy <= y1; yy++) {
      for (var xx = x0; xx <= x1; xx++) {
        var idx = (yy * imgW + xx) * 4;
        var l = lum(data[idx], data[idx + 1], data[idx + 2]);
        lums[(yy - y0) * ww + (xx - x0)] = l;
        hist[clamp(Math.round(l), 0, 255)]++;
      }
    }
    var total = ww * wh;
    var thr = clamp(otsu(hist, total), 55, 135);

    /* connected components over dark pixels (BFS) */
    var labels = new Int16Array(ww * wh).fill(-1);
    var comps = [];
    var queue = new Int32Array(ww * wh);
    for (var py = 0; py < wh; py++) {
      for (var px = 0; px < ww; px++) {
        var li = py * ww + px;
        if (labels[li] !== -1 || lums[li] >= thr) { continue; }
        /* new component */
        var id = comps.length;
        var qh = 0, qt = 0;
        queue[qt++] = li;
        labels[li] = id;
        var area = 0, sx = 0, sy = 0;
        var minX = px, maxX = px, minY = py, maxY = py;
        while (qh < qt) {
          var cur = queue[qh++];
          var cy = Math.floor(cur / ww);
          var cx = cur - cy * ww;
          area++; sx += cx; sy += cy;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          /* 4-neighbors */
          if (cx > 0) { var n1 = cur - 1; if (labels[n1] === -1 && lums[n1] < thr) { labels[n1] = id; queue[qt++] = n1; } }
          if (cx < ww - 1) { var n2 = cur + 1; if (labels[n2] === -1 && lums[n2] < thr) { labels[n2] = id; queue[qt++] = n2; } }
          if (cy > 0) { var n3 = cur - ww; if (labels[n3] === -1 && lums[n3] < thr) { labels[n3] = id; queue[qt++] = n3; } }
          if (cy < wh - 1) { var n4 = cur + ww; if (labels[n4] === -1 && lums[n4] < thr) { labels[n4] = id; queue[qt++] = n4; } }
        }
        comps.push({
          area: area,
          cx: x0 + sx / area,
          cy: y0 + sy / area,
          w: maxX - minX + 1,
          h: maxY - minY + 1
        });
      }
    }

    /* pick the component that looks most like the printed marker */
    var best = null, bestScore = Infinity;
    for (var ci = 0; ci < comps.length; ci++) {
      var c = comps[ci];
      if (c.area < expArea * 0.25 || c.area > expArea * 6) { continue; }
      var aspect = c.w / c.h;
      if (aspect < 0.4 || aspect > 2.5) { continue; }
      var dist = Math.hypot(c.cx - expected.x, c.cy - expected.y);
      if (dist > winR * 0.85) { continue; }
      var score = dist / winR + Math.abs(Math.log(c.area / expArea)) * 0.6;
      if (score < bestScore) { bestScore = score; best = c; }
    }

    if (best) {
      return { x: best.cx, y: best.cy, found: true };
    }
    return { x: expected.x, y: expected.y, found: false };
  }

  /*
   * Detect all four markers.
   * quadN: normalized expected page quad {x,y,w,h} in the downscaled
   *        image space; template marker fractions map into it.
   * Returns { points:[{x,y}x4], found:[bool x4], count }.
   */
  function findMarkers(imageData, imgW, imgH, quadN, templateMarkers) {
    var qx = quadN.x * imgW, qy = quadN.y * imgH;
    var qw = quadN.w * imgW, qh = quadN.h * imgH;
    var expArea = Math.pow((34 / CTL_SHEET.width) * qw, 2); /* marker ~34/800 of page width */
    var winR = Math.max(16, qw * 0.14);

    var frac = templateMarkers.map(function (m) {
      return { fx: m.x / CTL_SHEET.width, fy: m.y / CTL_SHEET.height };
    });

    var pts = [], found = [];
    for (var i = 0; i < 4; i++) {
      var ex = qx + frac[i].fx * qw;
      var ey = qy + frac[i].fy * qh;
      var res = findMarkerNear(imageData, imgW, imgH, { x: ex, y: ey }, winR, expArea);
      pts.push({ x: res.x, y: res.y });
      found.push(res.found);
    }
    var count = found.filter(Boolean).length;
    return { points: pts, found: found, count: count };
  }

  /* ---------------- zone mask ---------------- */

  var zoneMapCache = null;

  /*
   * Rasterize the flat-color mask SVG and build a Uint8 zone-id map
   * (0 = none, 1..5 = zone index+1), eroded to avoid outlines.
   */
  function buildZoneMap(maskSvgString, w, h) {
    if (zoneMapCache && zoneMapCache.w === w) { return Promise.resolve(zoneMapCache); }
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var svgUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(maskSvgString);
      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          var ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, w, h);
          var px = ctx.getImageData(0, 0, w, h).data;
          var n = w * h;
          var map = new Uint8Array(n);

          /* strict color -> zone id */
          var lut = {};
          CTL_SHEET.zones.forEach(function (z, i) {
            var c = z.maskColor;
            lut[c[0] + ',' + c[1] + ',' + c[2]] = i + 1;
          });
          for (var p = 0; p < n; p++) {
            var r = px[p * 4], g = px[p * 4 + 1], b = px[p * 4 + 2];
            var id = lut[r + ',' + g + ',' + b];
            map[p] = id || 0;
          }

          /* erode 3 px so outlines and antialiased edges are excluded */
          for (var it = 0; it < 3; it++) {
            var copy = new Uint8Array(map);
            for (var y2 = 0; y2 < h; y2++) {
              for (var x2 = 0; x2 < w; x2++) {
                var i2 = y2 * w + x2;
                var v = copy[i2];
                if (!v) { continue; }
                if (x2 === 0 || x2 === w - 1 || y2 === 0 || y2 === h - 1 ||
                    copy[i2 - 1] !== v || copy[i2 + 1] !== v ||
                    copy[i2 - w] !== v || copy[i2 + w] !== v) {
                  map[i2] = 0;
                }
              }
            }
          }

          zoneMapCache = { data: map, w: w, h: h };
          resolve(zoneMapCache);
        } catch (err) { reject(err); }
      };
      img.onerror = function () { reject(new Error('Mask render failed')); };
      img.src = svgUri;
    });
  }

  /* ---------------- zone color extraction ---------------- */

  function extractZoneColors(warpData, zw, zh, zoneMap) {
    var results = {};
    var zonePixels = {};
    var samples = {};

    CTL_SHEET.zones.forEach(function (z, i) {
      zonePixels[i + 1] = 0;
      samples[i + 1] = [];
    });

    for (var y = 0; y < zh; y++) {
      for (var x = 0; x < zw; x++) {
        var id = zoneMap.data[y * zw + x];
        if (!id) { continue; }
        zonePixels[id]++;
        var idx = (y * zw + x) * 4;
        var r = warpData[idx], g = warpData[idx + 1], b = warpData[idx + 2];
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        var L = lum(r, g, b);

        /* skip black outlines / very dark strokes */
        if (L < 85) { continue; }
        /* skip white paper and near-white antialiasing */
        if (L > 240 && mx - mn < 20) { continue; }
        /* skip grayish pixels: shadows, pencil shading, gray print */
        if (mx > 0 && (mx - mn) / mx < 0.12) { continue; }

        samples[id].push([r, g, b]);
      }
    }

    CTL_SHEET.zones.forEach(function (z, i) {
      var arr = samples[i + 1];
      var zp = zonePixels[i + 1] || 1;
      var coverage = arr.length / zp;
      var status, col;
      if (arr.length >= 25 && coverage >= 0.02) {
        var rs = arr.map(function (p) { return p[0]; }).sort(function (a, b) { return a - b; });
        var gs = arr.map(function (p) { return p[1]; }).sort(function (a, b) { return a - b; });
        var bs = arr.map(function (p) { return p[2]; }).sort(function (a, b) { return a - b; });
        var mid = arr.length >> 1;
        col = { r: rs[mid], g: gs[mid], b: bs[mid] };
        status = 'detected';
      } else {
        /* zone left uncolored on paper -> neutral paper tone,
           user can fix it with the color picker */
        col = { r: 246, g: 241, b: 227 };
        status = 'uncolored';
      }
      results[z.key] = {
        name: z.name,
        r: col.r, g: col.g, b: col.b,
        css: rgbToCss(col.r, col.g, col.b),
        count: arr.length,
        coverage: coverage,
        status: status
      };
    });

    return results;
  }

  /* ---------------- alignment preview ---------------- */

  /* Draw the warped photo with a light tint of the detected color
     over each zone - shows the child how well the scan aligned. */
  function buildAlignedPreview(warpCanvas, zoneMap, colors, outW) {
    var w = warpCanvas.width, h = warpCanvas.height;
    var scale = outW / w;
    var out = document.createElement('canvas');
    out.width = Math.round(w * scale);
    out.height = Math.round(h * scale);
    var ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(warpCanvas, 0, 0, out.width, out.height);

    /* tint overlay at pixel level */
    var base = ctx.getImageData(0, 0, out.width, out.height);
    var bd = base.data;
    var lut = {};
    CTL_SHEET.zones.forEach(function (z, i) {
      var c = colors[z.key];
      lut[i + 1] = c ? [c.r, c.g, c.b] : null;
    });
    for (var y = 0; y < out.height; y++) {
      var sy = Math.min(h - 1, Math.floor(y / scale));
      for (var x = 0; x < out.width; x++) {
        var sx = Math.min(w - 1, Math.floor(x / scale));
        var id = zoneMap.data[sy * w + sx];
        var tint = id ? lut[id] : null;
        if (!tint) { continue; }
        var di = (y * out.width + x) * 4;
        bd[di] = Math.round(bd[di] * 0.55 + tint[0] * 0.45);
        bd[di + 1] = Math.round(bd[di + 1] * 0.55 + tint[1] * 0.45);
        bd[di + 2] = Math.round(bd[di + 2] * 0.55 + tint[2] * 0.45);
      }
    }
    ctx.putImageData(base, 0, 0);
    return out;
  }

  /* ---------------- main entry ---------------- */

  /*
   * analyze(sourceCanvas, options)
   *   options.mode      : 'camera' | 'upload'
   *   options.guideRect : normalized {x,y,w,h} of the on-screen guide
   *                       (camera mode; upload uses a default inset)
   *   options.maskSvg   : mask SVG string (from CTL_Templates.maskSVG())
   * Returns a Promise resolving to:
   *   { colors, markersFound, homographyUsed, alignedCanvas, warpCanvas }
   */
  function analyze(sourceCanvas, options) {
    var opts = options || {};
    return new Promise(function (resolve, reject) {
      /* yield a frame so loading UI paints before heavy work */
      setTimeout(function () {
        try {
          /* 1. downscale */
          var small = downscaleCanvas(sourceCanvas, 720);
          var sctx = small.getContext('2d', { willReadFrequently: true });
          var sdata = sctx.getImageData(0, 0, small.width, small.height);

          /* 2. expected page quad */
          var quad = opts.guideRect || { x: 0.025, y: 0.025, w: 0.95, h: 0.95 };

          /* 3. markers + homography */
          var markers = findMarkers(sdata.data, small.width, small.height, quad, CTL_SHEET.markers);
          var H = solveHomography(CTL_SHEET.markers, markers.points);
          var usedHomography = !!H;

          /* 4. warp into template space */
          var TW = 400, TH = 566;
          var warp = document.createElement('canvas');
          warp.width = TW; warp.height = TH;
          var wctx = warp.getContext('2d', { willReadFrequently: true });
          var wimg = wctx.createImageData(TW, TH);
          var wd = wimg.data;
          var tw = CTL_SHEET.width / TW;   /* template px per output px */
          var th = CTL_SHEET.height / TH;
          if (!H) {
            /* extreme fallback: linear map (no perspective correction) */
            wctx.drawImage(small, 0, 0, TW, TH);
          } else {
            for (var y = 0; y < TH; y++) {
              for (var x = 0; x < TW; x++) {
                var p = applyH(H, x * tw, y * th);
                var di = (y * TW + x) * 4;
                if (p.x >= 0 && p.y >= 0 && p.x < small.width - 1 && p.y < small.height - 1) {
                  var x0 = Math.floor(p.x), y0 = Math.floor(p.y);
                  var fx = p.x - x0, fy = p.y - y0;
                  var i00 = (y0 * small.width + x0) * 4;
                  var i10 = i00 + 4;
                  var i01 = i00 + small.width * 4;
                  var i11 = i01 + 4;
                  for (var ch = 0; ch < 3; ch++) {
                    var v00 = sdata.data[i00 + ch], v10 = sdata.data[i10 + ch];
                    var v01 = sdata.data[i01 + ch], v11 = sdata.data[i11 + ch];
                    wd[di + ch] = Math.round(
                      v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) +
                      v01 * (1 - fx) * fy + v11 * fx * fy
                    );
                  }
                } else {
                  wd[di] = 255; wd[di + 1] = 255; wd[di + 2] = 255;
                }
                wd[di + 3] = 255;
              }
            }
            wctx.putImageData(wimg, 0, 0);
          }

          /* 5. zone mask + 6/7. robust color extraction */
          buildZoneMap(opts.maskSvg || CTL_Templates.maskSVG(), TW, TH).then(function (zoneMap) {
            var wdata = wctx.getImageData(0, 0, TW, TH);
            var colors = extractZoneColors(wdata.data, TW, TH, zoneMap);
            var aligned = buildAlignedPreview(warp, zoneMap, colors, 460);
            resolve({
              colors: colors,
              markersFound: markers.count,
              markersFoundFlags: markers.found,
              homographyUsed: usedHomography,
              warpCanvas: warp,
              alignedCanvas: aligned,
              sourceCanvas: sourceCanvas
            });
          }).catch(reject);
        } catch (err) {
          reject(err);
        }
      }, 60);
    });
  }

  return {
    analyze: analyze,
    buildZoneMap: buildZoneMap,
    solveHomography: solveHomography,
    rgbToCss: rgbToCss
  };
})();
