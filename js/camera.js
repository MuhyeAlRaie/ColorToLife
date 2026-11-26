/* ============================================================
   ColorToLife - Camera module (WebRTC getUserMedia)
   ------------------------------------------------------------
   - Requests permission only when the scanner opens.
   - Prefers the rear camera on mobile (facingMode: environment).
   - Supports switching between available cameras.
   - Stops every track when leaving the scanner screen.
   - Never uploads anything: frames stay in local canvases.
   ============================================================ */
var CTLCamera = (function () {
  var stream = null;
  var facing = 'environment';   /* ideal initial camera */
  var videoInputs = [];
  var deviceIndex = -1;

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function isSecure() {
    return window.isSecureContext === true;
  }

  function friendlyError(err) {
    var name = err && err.name;
    if (!isSecure()) {
      return 'The camera needs a secure connection. Open this page with HTTPS (or localhost), or use the photo upload button instead.';
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Camera access was blocked. Allow the camera in your browser settings, or tap "Use a Photo Instead" to scan a picture.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera was found on this device. You can still tap "Use a Photo Instead" to scan a picture.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'The camera seems busy in another app. Close it and try again, or use a photo instead.';
    }
    return 'The camera could not start. You can use the photo upload button instead.';
  }

  async function start(videoEl) {
    if (!isSupported() || !isSecure()) {
      var e = new Error('insecure-or-unsupported');
      e.name = 'NotSupportedError';
      throw e;
    }
    stop();
    var constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 960 }
      }
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = stream;
    await new Promise(function (resolve) {
      if (videoEl.readyState >= 2) { return resolve(); }
      videoEl.onloadedmetadata = function () { resolve(); };
      setTimeout(resolve, 3000); /* safety timeout */
    });
    await videoEl.play().catch(function () { /* some browsers autoplay-resolve */ });

    /* Remember available front/back cameras for the switch button. */
    try {
      var devices = await navigator.mediaDevices.enumerateDevices();
      videoInputs = devices.filter(function (d) { return d.kind === 'videoinput'; });
    } catch (e) {
      videoInputs = [];
    }
    return { deviceCount: videoInputs.length };
  }

  /* Cycle to the next camera (toggles front/back on phones). */
  async function switchCamera(videoEl) {
    if (videoInputs.length > 1) {
      deviceIndex = (deviceIndex + 1) % videoInputs.length;
      var deviceId = videoInputs[deviceIndex].deviceId;
      stop();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 960 } }
      });
    } else {
      facing = facing === 'environment' ? 'user' : 'environment';
      stop();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } }
      });
    }
    videoEl.srcObject = stream;
    await videoEl.play().catch(function () { });
    return facing;
  }

  /* Full-resolution snapshot of the current frame. */
  function snapshot(videoEl) {
    var w = videoEl.videoWidth;
    var h = videoEl.videoHeight;
    if (!w || !h) { return null; }
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);
    return canvas;
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
  }

  function hasMultipleCameras() { return videoInputs.length > 1; }

  return {
    isSupported: isSupported,
    isSecure: isSecure,
    friendlyError: friendlyError,
    start: start,
    switchCamera: switchCamera,
    snapshot: snapshot,
    stop: stop,
    hasMultipleCameras: hasMultipleCameras
  };
})();
