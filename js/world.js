/* ============================================================
   ColorToLife - 3D World (Three.js)
   ------------------------------------------------------------
   - Procedural meadow: grass, sky, clouds, trees, flowers, rocks
   - The child's dino: idle / walk / dance / jump + click reaction
   - Drag to rotate, wheel/pinch to zoom (custom orbit)
   - Everything disposed when leaving the screen
   - createLandingScene(): the small hero preview on the landing
     page (dino + clouds, slow turntable)
   ============================================================ */
var CTLWorld = (function () {

  var PALETTE = {
    sky: 0xbfe9ff,
    grass: 0xa2d98c,
    grassDark: 0x8cc97a,
    trunk: 0xa9785a,
    leaf: 0x7fc98d,
    leafDark: 0x6ab97c,
    cloud: 0xffffff,
    rock: 0xb9c2cf,
    flowerStem: 0x7bbd6d
  };
  var FLOWER_COLORS = [0xff8b7e, 0xffd93d, 0xc9b6f2, 0x9ac8ff, 0xffa1c4];

  /* ================= shared helpers ================= */

  function softLight(scene) {
    var hemi = new THREE.HemisphereLight(0xffffff, 0xcfe8c8, 0.55);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xfff3d6, 0.6);
    sun.position.set(6, 11, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0xdfeeff, 0.12);
    fill.position.set(-6, 6, -4);
    scene.add(fill);
    return sun;
  }

  function makeCloud(x, y, z, scale) {
    var cloud = new THREE.Group();
    var mat = new THREE.MeshToonMaterial({ color: PALETTE.cloud });
    var defs = [
      [0, 0, 0, 1.0], [0.9, 0.15, 0.1, 0.72], [-0.85, 0.12, -0.05, 0.7],
      [0.25, 0.42, -0.1, 0.62]
    ];
    defs.forEach(function (d) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.62 * d[3], 16, 12), mat);
      m.position.set(d[0], d[1], d[2]);
      cloud.add(m);
    });
    cloud.position.set(x, y, z);
    cloud.scale.setScalar(scale || 1);
    return cloud;
  }

  function makeTree(scale) {
    var tree = new THREE.Group();
    var trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 1.2, 10),
      new THREE.MeshToonMaterial({ color: PALETTE.trunk })
    );
    trunk.position.y = 0.6;
    trunk.castShadow = true;
    tree.add(trunk);
    var leafMat = new THREE.MeshToonMaterial({ color: PALETTE.leaf });
    var leafMat2 = new THREE.MeshToonMaterial({ color: PALETTE.leafDark });
    var blobs = [
      [0, 1.55, 0, 0.62], [0.42, 1.32, 0.12, 0.45], [-0.4, 1.35, -0.1, 0.42],
      [0.1, 1.85, -0.08, 0.4]
    ];
    blobs.forEach(function (b, i) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(b[3], 18, 14), i % 2 ? leafMat2 : leafMat);
      m.position.set(b[0], b[1], b[2]);
      m.castShadow = true;
      tree.add(m);
    });
    tree.scale.setScalar(scale || 1);
    return tree;
  }

  function makeFlower(color) {
    var flower = new THREE.Group();
    var stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.34, 8),
      new THREE.MeshToonMaterial({ color: PALETTE.flowerStem })
    );
    stem.position.y = 0.17;
    flower.add(stem);
    var center = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 10),
      new THREE.MeshToonMaterial({ color: 0xffe066 })
    );
    center.position.y = 0.38;
    flower.add(center);
    var petalMat = new THREE.MeshToonMaterial({ color: color });
    for (var i = 0; i < 5; i++) {
      var ang = (i / 5) * Math.PI * 2;
      var petal = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), petalMat);
      petal.position.set(Math.cos(ang) * 0.13, 0.38, Math.sin(ang) * 0.13);
      petal.scale.set(1, 0.5, 1);
      flower.add(petal);
    }
    return flower;
  }

  function makeRock(scale) {
    var rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshToonMaterial({ color: PALETTE.rock })
    );
    rock.scale.set(scale, scale * 0.55, scale);
    rock.castShadow = true;
    rock.receiveShadow = true;
    return rock;
  }

  /* ================= world scene ================= */

  /*
   * create(container, colors, opts)
   *  colors: detected colors {body,belly,spikes,feet,arms}
   *  opts: { onTouch: fn, onCelebrateEnd: fn }
   * Returns { dispose, celebrate, setColors }.
   */
  function create(container, colors, opts) {
    opts = opts || {};
    var THREE_OK = typeof THREE !== 'undefined';
    if (!THREE_OK) { throw new Error('Three.js failed to load'); }

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(PALETTE.sky);
    scene.fog = new THREE.Fog(PALETTE.sky, 30, 85);

    var camera = new THREE.PerspectiveCamera(45, 800 / 600, 0.1, 200);
    var TARGET = new THREE.Vector3(0, 1.6, 0);

    /* orbit state */
    var orbit = { theta: 0.0, phi: 1.18, radius: 8.6, minR: 4.5, maxR: 17 };
    function updateCamera() {
      orbit.phi = Math.max(0.35, Math.min(1.42, orbit.phi));
      orbit.radius = Math.max(orbit.minR, Math.min(orbit.maxR, orbit.radius));
      camera.position.set(
        TARGET.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
        TARGET.y + orbit.radius * Math.cos(orbit.phi),
        TARGET.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
      );
      camera.lookAt(TARGET);
    }
    updateCamera();

    softLight(scene);

    /* ---------- environment ---------- */
    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshToonMaterial({ color: PALETTE.grass })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    /* soft grass patches */
    var patchMat = new THREE.MeshToonMaterial({ color: PALETTE.grassDark });
    for (var i = 0; i < 14; i++) {
      var ang = Math.random() * Math.PI * 2;
      var rad = 3 + Math.random() * 18;
      var patch = new THREE.Mesh(new THREE.CircleGeometry(0.6 + Math.random() * 1.3, 16), patchMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(Math.cos(ang) * rad, 0.012, Math.sin(ang) * rad);
      scene.add(patch);
    }

    /* trees ring (away from the dino path) */
    var treeDefs = [
      [-7, -6, 1.15], [7.5, -5.5, 0.95], [-8.5, 3.5, 1.0], [8.2, 4.5, 1.1],
      [-4.5, -9.5, 1.2], [5, -9, 0.9], [-10, -1, 0.85], [10.5, -0.5, 1.0]
    ];
    treeDefs.forEach(function (t) {
      var tree = makeTree(t[2]);
      tree.position.set(t[0], 0, t[1]);
      tree.rotation.y = Math.random() * Math.PI * 2;
      scene.add(tree);
    });

    /* flowers */
    for (var f = 0; f < 10; f++) {
      var fAng = (f / 10) * Math.PI * 2 + Math.random() * 0.5;
      var fRad = 5.5 + Math.random() * 9;
      var flower = makeFlower(FLOWER_COLORS[f % FLOWER_COLORS.length]);
      flower.position.set(Math.cos(fAng) * fRad, 0, Math.sin(fAng) * fRad);
      flower.rotation.z = (Math.random() - 0.5) * 0.12;
      scene.add(flower);
    }

    /* rocks */
    var rockDefs = [[-5.5, 6.5, 0.9], [6.2, 7, 0.7], [-7, -3.5, 0.8], [4.5, -6.5, 0.65], [0.5, 8.5, 0.75]];
    rockDefs.forEach(function (r) {
      var rock = makeRock(r[2]);
      rock.position.set(r[0], 0.12, r[1]);
      rock.rotation.y = Math.random() * Math.PI;
      scene.add(rock);
    });

    /* clouds (drift slowly) */
    var clouds = [];
    var cloudDefs = [
      [-6, 7.5, -12, 1.6], [7, 9, -10, 1.3], [0, 10.5, -16, 2.0],
      [-10, 8.5, -6, 1.1], [10, 7.5, -4, 1.0]
    ];
    cloudDefs.forEach(function (c) {
      var cloud = makeCloud(c[0], c[1], c[2], c[3]);
      scene.add(cloud);
      clouds.push({ obj: cloud, speed: 0.12 + Math.random() * 0.12 });
    });

    /* a few butterflies-ish petals floating (small white sparkles) */
    var sparkles = [];
    var sparkleMat = new THREE.MeshBasicMaterial({ color: 0xfff6b0 });
    for (var s = 0; s < 6; s++) {
      var sp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), sparkleMat);
      var sAng = Math.random() * Math.PI * 2;
      sp.position.set(Math.cos(sAng) * (2.5 + Math.random() * 3), 1 + Math.random() * 2.2, Math.sin(sAng) * (2.5 + Math.random() * 3));
      scene.add(sp);
      sparkles.push({ obj: sp, phase: Math.random() * Math.PI * 2, base: sp.position.clone() });
    }

    /* ---------- dino ---------- */
    var dino = CTLCharacter.buildDino(THREE, colors);
    var root = new THREE.Group();
    root.add(dino.group);
    scene.add(root);

    /* ---------- animation state machine ---------- */
    var mode = 'idle';           /* idle | walk | dance */
    var jumpState = null;        /* {v, y} while jumping */
    var reactTimer = 0;          /* click reaction overlay */
    var walkAng = 0;
    var walkRadius = 3.4;
    var danceT = 0;

    function startWalk() { mode = 'walk'; }
    function toggleWalk() {
      if (mode === 'walk') { stopToIdle(); } else { startWalk(); }
    }
    function stopToIdle() {
      mode = 'idle';
      root.position.set(0, 0, 0);
      root.rotation.y = 0;
      dino.group.rotation.set(0, 0, 0);
      dino.group.position.set(0, 0, 0);
      walkAng = 0;
    }
    function startDance() { mode = mode === 'dance' ? 'idle' : 'dance'; danceT = 0; }
    function doJump() {
      if (jumpState) { return; }
      jumpState = { v: 6.4, y: 0 };
      CTLAudio.jump();
    }

    /* ---------- interaction: drag orbit, zoom, tap ---------- */
    var el = renderer.domElement;
    var dragging = false;
    var lastX = 0, lastY = 0;
    var pinchDist = 0;

    function onPointerDown(e) {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e) {
      if (!dragging) { return; }
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      orbit.theta -= dx * 0.0055;
      orbit.phi -= dy * 0.0045;
      updateCamera();
    }
    function onPointerUp(e) {
      if (dragging && Math.abs(e.clientX - lastX) < 6 && Math.abs(e.clientY - lastY) < 6) {
        tryRaycast(e);
      }
      dragging = false;
    }
    function onWheel(e) {
      e.preventDefault();
      orbit.radius += e.deltaY * 0.01;
      updateCamera();
    }
    function onTouchStart(e) {
      if (e.touches.length === 2) {
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }
    function onTouchMove(e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (pinchDist > 0) {
          orbit.radius *= pinchDist / d;
          updateCamera();
        }
        pinchDist = d;
      }
    }

    var raycaster = null;
    function tryRaycast(e) {
      var rect = el.getBoundingClientRect();
      var px = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      var py = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (!raycaster) { raycaster = new THREE.Raycaster(); }
      raycaster.setFromCamera({ x: px, y: py }, camera);
      var hits = raycaster.intersectObject(dino.group, true);
      if (hits.length) {
        reactTimer = 1.1;
        doJump();
        if (opts.onTouch) { opts.onTouch(); }
      }
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', function () { dragging = false; });
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });

    /* ---------- resize ---------- */
    function onResize() {
      var w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) { return; }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    /* ---------- main loop ---------- */
    var clock = new THREE.Clock();
    var rafId = 0;
    var beatTimer = 0;

    function animate() {
      rafId = requestAnimationFrame(animate);
      var dt = Math.min(clock.getDelta(), 0.05);
      var t = clock.elapsedTime;

      /* camera gently follows the dino when it roams */
      var followX = root.position.x * 0.55;
      var followZ = root.position.z * 0.55;
      TARGET.x += (followX - TARGET.x) * Math.min(1, dt * 3);
      TARGET.z += (followZ - TARGET.z) * Math.min(1, dt * 3);
      TARGET.y = 1.6;
      updateCamera();

      /* clouds drift + wrap */
      clouds.forEach(function (c) {
        c.obj.position.x += c.speed * dt;
        if (c.obj.position.x > 26) { c.obj.position.x = -26; }
      });
      sparkles.forEach(function (sp) {
        sp.obj.position.y = sp.base.y + Math.sin(t * 2 + sp.phase) * 0.35;
        sp.obj.material.opacity = 0.8;
      });

      /* dino idle micro-animation always runs */
      dino.tick(dt, t);

      /* jump physics */
      if (jumpState) {
        jumpState.y += jumpState.v * dt;
        jumpState.v -= 18 * dt;
        if (jumpState.y <= 0) {
          jumpState.y = 0;
          jumpState = null;
          CTLAudio.pop();
        }
      }

      if (mode === 'walk') {
        walkAng += dt * 0.85;
        var px = Math.cos(walkAng) * walkRadius;
        var pz = Math.sin(walkAng) * walkRadius;
        root.position.set(px, jumpState ? jumpState.y : Math.abs(Math.sin(walkAng * 6)) * 0.06, pz);
        /* face walking direction */
        root.rotation.y = -walkAng;
        /* leg swing */
        dino.parts.feet[0].rotation.x = Math.sin(walkAng * 6) * 0.5;
        dino.parts.feet[1].rotation.x = -Math.sin(walkAng * 6) * 0.5;
        dino.group.rotation.z = Math.sin(walkAng * 6) * 0.04;
        beatTimer -= dt;
        if (beatTimer <= 0) { beatTimer = 0.62; }
      } else if (mode === 'dance') {
        danceT += dt;
        root.position.y = jumpState ? jumpState.y : Math.abs(Math.sin(danceT * 6.4)) * 0.22;
        root.rotation.y = Math.sin(danceT * 3.2) * 0.55;
        dino.group.rotation.z = Math.sin(danceT * 6.4) * 0.09;
        dino.parts.arms[0].rotation.z = 0.7 + Math.sin(danceT * 6.4) * 0.6;
        dino.parts.arms[1].rotation.z = -0.7 - Math.sin(danceT * 6.4) * 0.6;
        dino.parts.headGroup.rotation.z = Math.sin(danceT * 3.2) * 0.18;
        beatTimer -= dt;
        if (beatTimer <= 0) { CTLAudio.danceBeat(); beatTimer = 0.46; }
      } else {
        /* idle: gentle weight shift */
        root.position.x = Math.sin(t * 0.9) * 0.05;
        root.position.z = Math.cos(t * 0.7) * 0.04;
        root.position.y = jumpState ? jumpState.y : 0;
        dino.group.rotation.z = 0;
        dino.parts.feet.forEach(function (ft) { ft.rotation.x = 0; });
        dino.parts.arms.forEach(function (a, ix) {
          a.rotation.z = (ix === 0 ? 1 : -1) * (0.08 + Math.sin(t * 2.1) * 0.06);
        });
        dino.parts.headGroup.rotation.z = 0;
      }

      /* click reaction: happy spin overlay */
      if (reactTimer > 0) {
        reactTimer -= dt;
        dino.group.rotation.y = Math.sin((1.1 - reactTimer) / 1.1 * Math.PI * 2) * 0.9;
        dino.parts.arms.forEach(function (a, ix) {
          a.rotation.z = (ix === 0 ? 1 : -1) * (0.9 + Math.sin(t * 14) * 0.3);
        });
      } else if (mode === 'idle') {
        dino.group.rotation.y *= 0.85;
        /* head look-around */
        dino.parts.headGroup.rotation.y = Math.sin(t * 0.5) * 0.18;
        dino.parts.headGroup.rotation.x = Math.sin(t * 0.83) * 0.07;
      }

      renderer.render(scene, camera);
    }
    animate();

    /* ---------- dispose ---------- */
    function dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      scene.traverse(function (obj) {
        if (obj.geometry) { obj.geometry.dispose(); }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(function (m) { m.dispose(); });
          } else {
            obj.material.dispose();
          }
        }
      });
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    }

    /* ---------- public API ---------- */
    return {
      dispose: dispose,
      celebrate: function () { reactTimer = 1.1; doJump(); },
      startWalk: startWalk,
      toggleWalk: toggleWalk,
      stopToIdle: stopToIdle,
      startDance: startDance,
      doJump: doJump,
      setColors: dino.setColors,
      isWalking: function () { return mode === 'walk'; }
    };
  }

  /* ================= landing hero scene ================= */

  function createLandingScene(container) {
    if (typeof THREE === 'undefined') { return null; }
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 480, container.clientHeight || 420);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.style.touchAction = 'pan-y';
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, 480 / 420, 0.1, 100);
    camera.position.set(0, 2.4, 7.2);
    camera.lookAt(0, 1.7, 0);

    var hemi = new THREE.HemisphereLight(0xffffff, 0xd8ead0, 0.62);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xfff3d6, 0.72);
    sun.position.set(5, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    scene.add(sun);

    var stage = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.8, 0.3, 40),
      new THREE.MeshToonMaterial({ color: 0xa2d98c })
    );
    stage.position.y = -0.16;
    stage.receiveShadow = true;
    scene.add(stage);

    var clouds = [];
    [[-3.2, 4.6, -3, 1.1], [3.4, 5.2, -3.6, 0.9], [0.2, 5.8, -4.5, 1.3]].forEach(function (c) {
      var cloud = makeCloud(c[0], c[1], c[2], c[3]);
      scene.add(cloud);
      clouds.push({ obj: cloud, speed: 0.22 });
    });

    var dino = CTLCharacter.buildDino(THREE, CTL_SHEET.defaultColors);
    dino.group.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
    scene.add(dino.group);

    var clock = new THREE.Clock();
    var rafId = 0;
    var visible = true;

    function animate() {
      rafId = requestAnimationFrame(animate);
      if (!visible) { return; }
      var dt = Math.min(clock.getDelta(), 0.05);
      var t = clock.elapsedTime;
      dino.tick(dt, t);
      dino.group.rotation.y = Math.sin(t * 0.35) * 0.5;   /* gentle turntable */
      dino.group.position.y = Math.sin(t * 1.1) * 0.06;
      clouds.forEach(function (c) {
        c.obj.position.x += c.speed * dt;
        if (c.obj.position.x > 8) { c.obj.position.x = -8; }
      });
      renderer.render(scene, camera);
    }
    animate();

    function onResize() {
      var w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) { return; }
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    return {
      dispose: function () {
        visible = false;
        cancelAnimationFrame(rafId);
        window.removeEventListener('resize', onResize);
        scene.traverse(function (obj) {
          if (obj.geometry) { obj.geometry.dispose(); }
          if (obj.material) { obj.material.dispose(); }
        });
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  }

  return { create: create, createLandingScene: createLandingScene };
})();
