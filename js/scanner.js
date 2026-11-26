/* ============================================================
   ColorToLife - Scanner screen controller
   ------------------------------------------------------------
   - Live camera preview with an A4-shaped scanning guide
   - Capture -> frozen frame -> Confirm / Retake
   - "Finding your colors..." state while the engine works
   - Photo upload fallback when camera is unavailable/denied
   - Camera tracks are always stopped when leaving the screen
   ============================================================ */
var CTLScanner = (function () {

  var els = {};
  var frozenCanvas = null;      /* captured frame at full resolution */
  var state = 'idle';           /* idle | live | frozen | processing */

  function qs(id) { return document.getElementById(id); }

  function bind() {
    els = {
      wrap: qs('camera-wrap'),
      video: qs('camera-video'),
      guide: qs('scan-guide'),
      hint: qs('scan-hint'),
      btnCapture: qs('btn-capture'),
      btnSwitch: qs('btn-switch'),
      btnUpload: qs('btn-upload'),
      fileInput: qs('upload-input'),
      btnCancel: qs('btn-scanner-back'),
      frozen: qs('frozen-layer'),
      frozenCanvas: qs('frozen-canvas'),
      confirmWrap: qs('confirm-controls'),
      btnRetake: qs('btn-retake'),
      btnConfirm: qs('btn-confirm'),
      processing: qs('processing-layer'),
      processingText: qs('processing-text'),
      errorPanel: qs('camera-error'),
      errorText: qs('camera-error-text'),
      btnErrorUpload: qs('btn-error-upload'),
      btnErrorRetry: qs('btn-error-retry')
    };

    els.btnCapture.addEventListener('click', onCapture);
    els.btnSwitch.addEventListener('click', onSwitch);
    els.btnUpload.addEventListener('click', function () { CTLAudio.click(); els.fileInput.click(); });
    els.fileInput.addEventListener('change', onFilePicked);
    els.btnCancel.addEventListener('click', function () { CTLAudio.back(); CTLApp.showScreen('characters'); });
    els.btnRetake.addEventListener('click', onRetake);
    els.btnConfirm.addEventListener('click', onConfirm);
    els.btnErrorUpload.addEventListener('click', function () { CTLAudio.click(); els.fileInput.click(); });
    els.btnErrorRetry.addEventListener('click', onRetry);
  }

  /* ---------- screen lifecycle (called by CTLApp) ---------- */

  function onEnter() {
    state = 'idle';
    hideAll();
    els.wrap.classList.remove('hidden');
    els.fileInput.value = '';

    if (!CTLCamera.isSupported() || !CTLCamera.isSecure()) {
      showError('To use the camera, open ColorToLife over HTTPS (like GitHub Pages) or localhost. ' +
        'You can also scan a photo you took earlier.');
      return;
    }
    startCamera();
  }

  function onLeave() {
    CTLCamera.stop();
    state = 'idle';
  }

  function startCamera() {
    hideAll();
    els.wrap.classList.remove('hidden');
    els.hint.classList.remove('hidden');
    els.btnCapture.classList.remove('hidden');
    if (CTLCamera.hasMultipleCameras()) { els.btnSwitch.classList.remove('hidden'); }
    CTLScanner.setBusy(true, 'Starting camera...');
    CTLCamera.start(els.video).then(function (info) {
      CTLScanner.setBusy(false);
      state = 'live';
      if (info.deviceCount > 1) { els.btnSwitch.classList.remove('hidden'); }
    }).catch(function (err) {
      CTLScanner.setBusy(false);
      state = 'idle';
      showError(CTLCamera.friendlyError(err));
    });
  }

  function showError(msg) {
    hideAll();
    els.wrap.classList.remove('hidden');
    els.video.classList.add('hidden');
    els.guide.classList.add('hidden');
    els.errorPanel.classList.remove('hidden');
    els.errorText.textContent = msg;
  }

  function hideAll() {
    [els.frozen, els.processing, els.errorPanel, els.hint, els.confirmWrap,
      els.btnCapture, els.btnSwitch, els.btnUpload].forEach(function (e) {
      if (e) { e.classList.add('hidden'); }
    });
    els.video.classList.remove('hidden');
    els.guide.classList.remove('hidden');
  }

  /* ---------- actions ---------- */

  function onCapture() {
    if (state !== 'live') { return; }
    CTLAudio.pop();
    var frame = CTLCamera.snapshot(els.video);
    if (!frame) {
      CTLApp.toast('The camera is not ready yet. Give it a second!');
      return;
    }
    frozenCanvas = frame;

    /* draw frozen frame */
    var fc = els.frozenCanvas;
    var fctx = fc.getContext('2d');
    var scale = Math.min(fc.width / frame.width, fc.height / frame.height);
    var dw = frame.width * scale, dh = frame.height * scale;
    fctx.fillStyle = '#10101d';
    fctx.fillRect(0, 0, fc.width, fc.height);
    fctx.drawImage(frame, (fc.width - dw) / 2, (fc.height - dh) / 2, dw, dh);

    state = 'frozen';
    els.video.classList.add('hidden');
    els.guide.classList.add('hidden');
    els.hint.classList.add('hidden');
    els.btnCapture.classList.add('hidden');
    els.btnSwitch.classList.add('hidden');
    els.frozen.classList.remove('hidden');
    els.confirmWrap.classList.remove('hidden');
    els.btnUpload.classList.remove('hidden');
  }

  function onRetake() {
    CTLAudio.back();
    frozenCanvas = null;
    startCamera();
  }

  function onConfirm() {
    if (!frozenCanvas) { return; }
    CTLAudio.click();
    runAnalysis(frozenCanvas, 'camera');
  }

  function onSwitch() {
    CTLAudio.click();
    CTLScanner.setBusy(true, 'Switching camera...');
    CTLCamera.switchCamera(els.video).then(function () {
      CTLScanner.setBusy(false);
    }).catch(function (err) {
      CTLScanner.setBusy(false);
      CTLApp.toast(CTLCamera.friendlyError(err));
    });
  }

  function onFilePicked(evt) {
    var file = evt.target.files && evt.target.files[0];
    if (!file) { return; }
    if (!/^image\//.test(file.type)) {
      CTLApp.toast('That file is not a picture. Please choose a JPG or PNG photo.');
      return;
    }
    CTLAudio.click();
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        /* remember last chosen file reset */
        runAnalysis(canvas, 'upload');
      };
      img.onerror = function () {
        CTLApp.toast('That picture could not be opened. Try another one!');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function onRetry() {
    CTLAudio.click();
    startCamera();
  }

  /* ---------- analysis ---------- */

  function runAnalysis(sourceCanvas, mode) {
    state = 'processing';
    hideAll();
    els.wrap.classList.remove('hidden');
    els.video.classList.add('hidden');
    els.guide.classList.add('hidden');
    els.processing.classList.remove('hidden');

    var guideRect = null;
    if (mode === 'camera') {
      guideRect = guideRectInVideo();
    }

    CTLDetect.analyze(sourceCanvas, {
      mode: mode,
      guideRect: guideRect,
      maskSvg: CTL_Templates.maskSVG()
    }).then(function (result) {
      CTLCamera.stop();
      CTLAudio.success();
      CTLApp.showReview(result);
    }).catch(function (err) {
      console.error('analysis failed', err);
      CTLApp.toast('Something went wrong while finding your colors. Let us try again!');
      startCamera();
    });
  }

  /* Map the on-screen A4 guide rectangle into normalized video
     coordinates, accounting for object-fit: cover cropping. */
  function guideRectInVideo() {
    var vw = els.video.videoWidth, vh = els.video.videoHeight;
    var cw = els.wrap.clientWidth, ch = els.wrap.clientHeight;
    if (!vw || !vh || !cw || !ch) { return null; }
    var s = Math.max(cw / vw, ch / vh);
    var dx = (cw - vw * s) / 2;
    var dy = (ch - vh * s) / 2;
    var g = els.guide.getBoundingClientRect();
    var c = els.wrap.getBoundingClientRect();
    var gx = g.left - c.left;
    var gy = g.top - c.top;
    var out = {
      x: (gx - dx) / (vw * s),
      y: (gy - dy) / (vh * s),
      w: g.width / (vw * s),
      h: g.height / (vh * s)
    };
    /* keep within frame */
    out.x = Math.max(0, Math.min(0.95, out.x));
    out.y = Math.max(0, Math.min(0.95, out.y));
    out.w = Math.min(1 - out.x, Math.max(0.2, out.w));
    out.h = Math.min(1 - out.y, Math.max(0.2, out.h));
    return out;
  }

  /* ---------- busy overlay ---------- */

  function setBusy(busy, text) {
    if (busy) {
      els.processingText.textContent = text || 'Finding your colors...';
      els.processing.classList.remove('hidden');
    } else {
      els.processing.classList.add('hidden');
    }
  }

  return {
    bind: bind,
    onEnter: onEnter,
    onLeave: onLeave,
    setBusy: setBusy
  };
})();
