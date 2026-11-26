/* ============================================================
   ColorToLife - App controller
   ------------------------------------------------------------
   Screen router, shared state, review screen (detected colors +
   manual color picker), world HUD, final celebration, sound toggle.
   Exposes a small window.CTLApp API (also used by e2e tests).
   ============================================================ */
var CTLApp = (function () {

  var state = {
    character: null,                 /* selected character key */
    scanResult: null,                /* last CTLDetect.analyze() result */
    colors: null,                    /* confirmed colors (css strings) */
    world: null,                     /* active world instance */
    landingScene: null
  };

  var els = {};

  function qs(id) { return document.getElementById(id); }

  /* ================= toast ================= */

  var toastTimer = null;
  function toast(msg, ms) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('show');
    }, ms || 3200);
  }

  /* ================= screen router ================= */

  var hooks = {
    scanner: { enter: function () { CTLScanner.onEnter(); }, leave: function () { CTLScanner.onLeave(); } },
    world: { enter: enterWorld, leave: leaveWorld },
    landing: { enter: null, leave: null }   /* wired up in initLanding() */
  };

  var current = 'landing';

  function showScreen(name) {
    if (name === current) { return; }
    var hook = hooks[current];
    if (hook && hook.leave) { hook.leave(); }

    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.remove('active');
    });
    var target = qs('screen-' + name);
    if (target) {
      target.classList.add('active');
      var scroller = target.querySelector('.screen-scroll');
      if (scroller) { scroller.scrollTop = 0; }
    }
    current = name;
    hook = hooks[name];
    if (hook && hook.enter) { hook.enter(); }
    updateSteps(name);
  }

  function updateSteps(name) {
    var map = { instructions: 0, scanner: 1, review: 1, world: 2, final: 2 };
    var step = map[name];
    els.steps.querySelectorAll('.step-chip').forEach(function (chip, i) {
      chip.classList.toggle('on', step !== undefined && i === step);
    });
  }

  /* ================= landing ================= */

  function initLanding() {
    var wrap = qs('landing-3d');
    if (wrap && typeof CTLWorld !== 'undefined') {
      state.landingScene = CTLWorld.createLandingScene(wrap);
    }
    function pauseLanding() { if (state.landingScene) { state.landingScene.visible = false; } }
    function resumeLanding() { if (state.landingScene) { state.landingScene.visible = true; } }
    hooks.landing.enter = resumeLanding;
    hooks.landing.leave = pauseLanding;
  }

  /* ================= characters ================= */

  function initCharacters() {
    document.querySelectorAll('[data-choose]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-choose');
        if (btn.disabled) { return; }
        CTLAudio.click();
        state.character = key;
        if (key === 'dino') {
          showScreen('instructions');
        } else {
          toast('That friend is still learning to jump. Dino is ready right now!');
        }
      });
    });
    document.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-nav');
        if (btn.disabled) { return; }
        if (btn.hasAttribute('data-sound-off')) { /* silent navigation */ }
        else { CTLAudio.click(); }
        showScreen(target);
      });
    });
  }

  /* ================= instructions ================= */

  function initInstructions() {
    CTL_SheetUI.renderSheetPreview(qs('sheet-preview'));
    qs('btn-download-sheet').addEventListener('click', function () {
      CTLAudio.click();
      CTL_SheetUI.downloadSheet();
      toast('Coloring sheet saved. Print it at 100% scale on A4!');
    });
    qs('btn-print-sheet').addEventListener('click', function () {
      CTLAudio.click();
      CTL_SheetUI.printSheet();
    });
    qs('btn-done-coloring').addEventListener('click', function () {
      CTLAudio.click();
      showScreen('scanner');
    });
    qs('btn-instructions-back').addEventListener('click', function () {
      CTLAudio.back();
      showScreen('characters');
    });
  }

  /* ================= review ================= */

  function initReview() {
    var backBtn = qs('btn-review-back');
    backBtn.addEventListener('click', function () {
      CTLAudio.back();
      showScreen('scanner');
    });

    /* swatches with manual color picker correction */
    CTL_SHEET.zones.forEach(function (z) {
      var swatch = qs('swatch-' + z.key);
      var picker = qs('picker-' + z.key);
      var label = qs('swatch-label-' + z.key);
      if (!swatch || !picker) { return; }
      swatch.addEventListener('click', function () {
        CTLAudio.click();
        picker.value = (state.colors && state.colors[z.key]) || '#ffffff';
        picker.click();
      });
      picker.addEventListener('input', function () {
        if (!state.colors) { state.colors = {}; }
        state.colors[z.key] = picker.value;
        swatch.style.background = picker.value;
        label.textContent = picker.value.toUpperCase();
        refreshReviewPreview();
      });
    });

    qs('btn-scan-again').addEventListener('click', function () {
      CTLAudio.back();
      showScreen('scanner');
    });
    qs('btn-bring-to-life').addEventListener('click', function () {
      CTLAudio.click();
      state.colors = {};
      CTL_SHEET.zones.forEach(function (z) {
        state.colors[z.key] = state.scanResult.colors[z.key].css;
      });
      showScreen('world');
    });
  }

  function refreshReviewPreview() {
    if (!state.scanResult) { return; }
    var view = {};
    CTL_SHEET.zones.forEach(function (z) {
      view[z.key] = state.colors[z.key];
    });
    CTL_SheetUI.renderColoredPreview(qs('review-dino-preview'), view, {});
  }

  /* Called by the scanner when analysis completes. */
  function showReview(result) {
    state.scanResult = result;

    /* aligned photo preview */
    var alignWrap = qs('aligned-preview');
    alignWrap.innerHTML = '';
    result.alignedCanvas.style.width = '100%';
    result.alignedCanvas.style.height = 'auto';
    result.alignedCanvas.style.display = 'block';
    result.alignedCanvas.style.borderRadius = '18px';
    alignWrap.appendChild(result.alignedCanvas);

    /* colors + swatches */
    state.colors = {};
    var uncolored = [];
    CTL_SHEET.zones.forEach(function (z) {
      var c = result.colors[z.key];
      state.colors[z.key] = c.css;
      var swatch = qs('swatch-' + z.key);
      var label = qs('swatch-label-' + z.key);
      swatch.style.background = c.css;
      label.textContent = c.css.toUpperCase();
      if (c.status === 'uncolored') { uncolored.push(z.name); }
    });

    var warn = qs('review-warning');
    if (uncolored.length) {
      warn.classList.remove('hidden');
      warn.textContent = 'We could not find color in: ' + uncolored.join(', ') +
        '. Dino will use paper white there - or tap a color circle to fix it yourself.';
    } else {
      warn.classList.add('hidden');
    }

    refreshReviewPreview();
    showScreen('review');
  }

  /* ================= world + final ================= */

  function enterWorld() {
    if (!state.colors) {
      /* direct entry without a scan - fall back to the default palette */
      state.colors = {};
      CTL_SHEET.zones.forEach(function (z) {
        state.colors[z.key] = CTL_SHEET.defaultColors[z.key];
      });
    }
    var container = qs('world-canvas');
    container.innerHTML = '';
    state.world = CTLWorld.create(container, state.colors, {
      onTouch: function () { CTLAudio.pop(); }
    });
    qs('world-colors-note').textContent = 'Body ' + state.colors.body + '  -  Belly ' +
      state.colors.belly + '  -  Spikes ' + state.colors.spikes + '  -  Feet ' +
      state.colors.feet + '  -  Arms ' + state.colors.arms;

    /* celebration overlay on entry */
    var cel = qs('celebration-card');
    cel.classList.remove('hidden');
    spawnConfetti(qs('confetti-layer'), 50);
    CTLAudio.celebrate();
    bindWorldButtons();
  }

  function leaveWorld() {
    if (state.world) {
      state.world.dispose();
      state.world = null;
    }
    qs('confetti-layer').innerHTML = '';
    qs('celebration-card').classList.add('hidden');
    qs('final-overlay').classList.add('hidden');
  }

  function bindWorldButtons() {
    var w = state.world;
    if (!w) { return; }
    qs('btn-move').onclick = function () {
      CTLAudio.click();
      w.toggleWalk();
    };
    qs('btn-dance').onclick = function () {
      CTLAudio.click();
      w.startDance();
    };
    qs('btn-jump').onclick = function () {
      w.doJump();
    };
    qs('btn-reset').onclick = function () {
      CTLAudio.back();
      w.stopToIdle();
    };
    qs('btn-world-finish').onclick = function () {
      CTLAudio.click();
      openFinal();
    };
    qs('btn-celebration-play').onclick = function () {
      CTLAudio.click();
      qs('celebration-card').classList.add('hidden');
    };
  }

  function openFinal() {
    qs('final-overlay').classList.remove('hidden');
    spawnConfetti(qs('confetti-layer'), 60);
    CTLAudio.celebrate();
  }

  function initFinal() {
    qs('btn-play-again').addEventListener('click', function () {
      CTLAudio.click();
      state.scanResult = null;
      state.colors = null;
      showScreen('characters');
    });
    qs('btn-scan-another').addEventListener('click', function () {
      CTLAudio.click();
      showScreen('scanner');
    });
    qs('btn-choose-character').addEventListener('click', function () {
      CTLAudio.click();
      showScreen('characters');
    });
    qs('btn-final-back').addEventListener('click', function () {
      CTLAudio.back();
      qs('final-overlay').classList.add('hidden');
    });
  }

  /* ================= confetti ================= */

  var CONFETTI_COLORS = ['#FF8B7E', '#FFD93D', '#A9E8C8', '#9AC8FF', '#C9B6F2', '#FFA1C4'];
  function spawnConfetti(layer, count) {
    layer.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.animationDelay = (Math.random() * 0.9) + 's';
      piece.style.animationDuration = (2.4 + Math.random() * 1.6) + 's';
      piece.style.width = (8 + Math.random() * 8) + 'px';
      piece.style.height = (10 + Math.random() * 10) + 'px';
      var shape = Math.random();
      if (shape < 0.4) { piece.style.borderRadius = '50%'; }
      else if (shape < 0.7) { piece.style.borderRadius = '2px'; }
      layer.appendChild(piece);
    }
    setTimeout(function () { layer.innerHTML = ''; }, 5000);
  }

  /* ================= sound toggle ================= */

  function initSoundToggle() {
    var btn = qs('btn-sound');
    var iconOn = qs('sound-icon-on');
    var iconOff = qs('sound-icon-off');
    var enabled = CTLAudio.init();
    function render() {
      iconOn.classList.toggle('hidden', !CTLAudio.isEnabled());
      iconOff.classList.toggle('hidden', CTLAudio.isEnabled());
      btn.setAttribute('aria-pressed', CTLAudio.isEnabled() ? 'true' : 'false');
      btn.setAttribute('aria-label', CTLAudio.isEnabled() ? 'Turn sound off' : 'Turn sound on');
    }
    render();
    btn.addEventListener('click', function () {
      CTLAudio.setEnabled(!CTLAudio.isEnabled());
      render();
    });
  }

  /* ================= boot ================= */

  function boot() {
    els = {
      toast: qs('toast'),
      steps: qs('step-indicator')
    };

    CTLScanner.bind();
    initLanding();
    initCharacters();
    initInstructions();
    initReview();
    initFinal();
    initSoundToggle();

    document.querySelectorAll('.screen').forEach(function (s) {
      if (!s.classList.contains('active')) { return; }
    });

    updateSteps('landing');
    document.body.classList.add('booted');

    /* test hooks (harmless in production, used by e2e checks) */
    window.CTLApp = {
      state: state,
      showScreen: showScreen,
      showReview: showReview,
      toast: toast
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return {
    showScreen: showScreen,
    showReview: showReview,
    toast: toast,
    state: state
  };
})();
