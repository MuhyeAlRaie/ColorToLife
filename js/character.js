/* ============================================================
   ColorToLife - Procedural 3D Dino (Three.js)
   ------------------------------------------------------------
   Built entirely from Three.js primitives - no external assets.
   Five separate material groups map 1:1 to the paper zones:
     body (head+body+tail), belly, spikes, feet, arms.
   Eyes / smile stay black & white on purpose, just like the
   printed sheet.
   ============================================================ */
var CTLCharacter = (function () {

  var INK = 0x3a3357;        /* deep plum for eyes / smile */
  var PAPER = 0xf6f1e3;      /* uncolored paper tone */

  function toonMat(hex) {
    return new THREE.MeshToonMaterial({ color: hex });
  }

  function cssToHex(css) {
    var c = new THREE.Color(css);
    return c;
  }

  /*
   * buildDino(THREE, colors)
   * colors: { body, belly, spikes, feet, arms } css strings
   * Returns { group, parts, setColors, tick } where tick(dt, t)
   * drives idle micro-animation (breathing, blinking, wagging).
   */
  function buildDino(THREE, colors) {
    colors = colors || CTL_SHEET.defaultColors;
    var group = new THREE.Group();
    var parts = {};
    var blinkTimer = 2 + Math.random() * 3;
    var blinkPhase = 0;

    var mats = {
      body: toonMat(colors.body),
      belly: toonMat(colors.belly),
      spikes: toonMat(colors.spikes),
      feet: toonMat(colors.feet),
      arms: toonMat(colors.arms)
    };

    function cast(mesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    /* ---------- head (nods & looks around) ---------- */
    var headGroup = new THREE.Group();
    headGroup.position.set(0, 1.95, 0.15);

    var head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.88, 40, 32), mats.body));
    head.scale.set(1, 0.94, 0.9);
    head.position.set(0, 0.5, 0);
    headGroup.add(head);
    parts.headMesh = head;

    /* eyes (front of head, big and friendly) */
    var eyeGeo = new THREE.SphereGeometry(0.155, 24, 18);
    var pupilGeo = new THREE.SphereGeometry(0.082, 20, 14);
    var glintGeo = new THREE.SphereGeometry(0.032, 12, 10);
    var eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    var pupilMat = new THREE.MeshBasicMaterial({ color: INK });
    var glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    parts.eyes = [];
    [-0.30, 0.30].forEach(function (ex) {
      var eye = new THREE.Group();
      var white = new THREE.Mesh(eyeGeo, eyeWhiteMat);
      white.position.set(0, 0, 0);
      var pupil = new THREE.Mesh(pupilGeo, pupilMat);
      pupil.position.set(0, 0.005, 0.105);
      var glint = new THREE.Mesh(glintGeo, glintMat);
      glint.position.set(-0.032, 0.038, 0.16);
      eye.add(white); eye.add(pupil); eye.add(glint);
      var z = Math.sqrt(Math.pow(0.88, 2) - Math.pow(ex, 2) - Math.pow(0.57 - 0.5, 2)) - 0.02;
      eye.position.set(ex, 0.57, z);
      headGroup.add(eye);
      parts.eyes.push(eye);
    });

    /* smile */
    var smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.034, 10, 24, Math.PI),
      new THREE.MeshBasicMaterial({ color: INK })
    );
    smile.position.set(0, 0.24, 0.76);
    smile.rotation.x = -0.18;
    smile.rotation.z = Math.PI;   /* open upward = happy */
    smile.rotation.y = Math.PI;
    headGroup.add(smile);

    /* nostrils */
    var nostrilGeo = new THREE.SphereGeometry(0.035, 10, 8);
    [-0.10, 0.10].forEach(function (nx) {
      var n = new THREE.Mesh(nostrilGeo, pupilMat);
      n.position.set(nx, 0.34, 0.78);
      headGroup.add(n);
    });

    /* cheeks - soft permanent blush */
    var cheekGeo = new THREE.SphereGeometry(0.075, 14, 12);
    var cheekMat = new THREE.MeshBasicMaterial({ color: 0xffb9b3 });
    [-0.54, 0.54].forEach(function (cx) {
      var ch = new THREE.Mesh(cheekGeo, cheekMat);
      var cz = Math.sqrt(Math.pow(0.88, 2) - Math.pow(cx, 2) - Math.pow(0.24 - 0.5, 2)) - 0.03;
      ch.position.set(cx, 0.24, cz);
      ch.scale.set(1, 0.7, 0.4);
      headGroup.add(ch);
    });

    /* top head spike (nods with the head) */
    var topSpike = cast(new THREE.Mesh(spikeGeoOf(0.22, 0.36), mats.spikes));
    topSpike.position.set(0, 1.28, -0.20);
    topSpike.rotation.x = -0.3;
    headGroup.add(topSpike);

    group.add(headGroup);
    parts.headGroup = headGroup;

    function spikeGeoOf(r, h) {
      var geo = new THREE.ConeGeometry(r, h, 10);
      /* move origin to the base so spikes rotate naturally */
      geo.translate(0, h / 2, 0);
      return geo;
    }

    /* ---------- body ---------- */
    var body = cast(new THREE.Mesh(new THREE.SphereGeometry(1.02, 44, 36), mats.body));
    body.scale.set(0.98, 0.9, 0.86);
    body.position.set(0, 1.10, 0);
    group.add(body);
    parts.bodyMesh = body;

    /* belly patch (slightly protrudes at the front) */
    var belly = cast(new THREE.Mesh(new THREE.SphereGeometry(0.92, 36, 28), mats.belly));
    belly.scale.set(0.74, 0.66, 0.5);
    belly.position.set(0, 0.98, 0.52);
    group.add(belly);
    parts.bellyMesh = belly;

    /* ---------- back spikes ---------- */
    parts.spikes = [];
    var spikeDefs = [
      { p: [0, 1.98, -0.44], rx: -0.55, r: 0.18, h: 0.30 },
      { p: [0, 1.58, -0.76], rx: -0.9, r: 0.165, h: 0.27 },
      { p: [0, 1.16, -0.86], rx: -1.1, r: 0.145, h: 0.24 },
      { p: [0, 0.72, -0.82], rx: -1.3, r: 0.125, h: 0.20 }
    ];
    spikeDefs.forEach(function (s) {
      var sp = cast(new THREE.Mesh(spikeGeoOf(s.r, s.h), mats.spikes));
      sp.position.set(s.p[0], s.p[1], s.p[2]);
      sp.rotation.x = s.rx;
      group.add(sp);
      parts.spikes.push(sp);
    });

    /* ---------- tail (wags) ---------- */
    var tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0.78, -0.72);
    tailGroup.rotation.x = 0.42;
    var tailDefs = [
      { p: [0, 0.0, -0.12], r: 0.46 },
      { p: [0, 0.10, -0.52], r: 0.34 },
      { p: [0, 0.26, -0.88], r: 0.23 },
      { p: [0, 0.46, -1.16], r: 0.14 }
    ];
    tailDefs.forEach(function (t) {
      var m = cast(new THREE.Mesh(new THREE.SphereGeometry(t.r, 22, 16), mats.body));
      m.position.set(t.p[0], t.p[1], t.p[2]);
      tailGroup.add(m);
    });
    group.add(tailGroup);
    parts.tailGroup = tailGroup;

    /* ---------- feet ---------- */
    parts.feet = [];
    [-0.45, 0.45].forEach(function (fx) {
      var foot = new THREE.Group();
      foot.position.set(fx, 0.17, 0.14);
      var pad = cast(new THREE.Mesh(new THREE.SphereGeometry(0.34, 26, 20), mats.feet));
      pad.scale.set(1.15, 0.55, 1.5);
      foot.add(pad);
      /* toes */
      var toeGeo = new THREE.SphereGeometry(0.075, 10, 8);
      [-0.16, 0, 0.16].forEach(function (tx) {
        var toe = new THREE.Mesh(toeGeo, mats.feet);
        toe.position.set(tx, -0.02, 0.48);
        foot.add(toe);
      });
      group.add(foot);
      parts.feet.push(foot);
    });

    /* ---------- arms ---------- */
    parts.arms = [];
    [-1, 1].forEach(function (side) {
      var armGroup = new THREE.Group();
      armGroup.position.set(0.88 * side, 1.42, 0.30);
      var limb = cast(new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), mats.arms));
      limb.scale.set(1, 2.0, 1);
      limb.position.set(0.06 * side, -0.18, 0.05);
      limb.rotation.z = -0.55 * side;
      var hand = cast(new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), mats.arms));
      hand.position.set(0.22 * side, -0.36, 0.10);
      armGroup.add(limb);
      armGroup.add(hand);
      group.add(armGroup);
      parts.arms.push(armGroup);
    });

    /* ---------- colors API ---------- */
    function setColors(colorsNew) {
      mats.body.color = cssToHex(colorsNew.body);
      mats.belly.color = cssToHex(colorsNew.belly);
      mats.spikes.color = cssToHex(colorsNew.spikes);
      mats.feet.color = cssToHex(colorsNew.feet);
      mats.arms.color = cssToHex(colorsNew.arms);
    }

    /* ---------- idle micro-animation ---------- */
    function tick(dt, t) {
      /* breathing */
      var breath = 1 + Math.sin(t * 2.1) * 0.016;
      body.scale.set(1 * breath, 0.92 / breath, 0.88 * breath);

      /* tail wag */
      tailGroup.rotation.y = Math.sin(t * 2.6) * 0.28;

      /* blink */
      blinkTimer -= dt;
      if (blinkTimer <= 0 && blinkPhase === 0) {
        blinkPhase = 0.16;
        blinkTimer = 2.2 + Math.random() * 3.4;
      }
      if (blinkPhase > 0) {
        blinkPhase -= dt;
        var k = Math.max(0.08, Math.abs(Math.sin((0.16 - blinkPhase) / 0.16 * Math.PI)) * 1.0);
        parts.eyes.forEach(function (e) { e.scale.y = Math.max(0.08, k); });
        if (blinkPhase <= 0) {
          parts.eyes.forEach(function (e) { e.scale.y = 1; });
        }
      }
    }

    return { group: group, parts: parts, setColors: setColors, tick: tick };
  }

  return { buildDino: buildDino };
})();
