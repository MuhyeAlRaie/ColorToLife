/* ============================================================
   ColorToLife - Tiny Web Audio sound engine
   ------------------------------------------------------------
   All effects are synthesized at runtime (oscillators + gain
   envelopes). No audio files, no network. Sound is OFF until
   the user taps the speaker button (browser autoplay-safe).
   ============================================================ */
var CTLAudio = (function () {
  var ctx = null;
  var master = null;
  var enabled = false;
  var STORE_KEY = 'ctl-sound-enabled';

  function readPref() {
    try { return window.localStorage.getItem(STORE_KEY) === 'on'; }
    catch (e) { return false; }
  }
  function writePref(on) {
    try { window.localStorage.setItem(STORE_KEY, on ? 'on' : 'off'); } catch (e) { /* private mode */ }
  }

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return false; }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') { ctx.resume(); }
    return true;
  }

  /* One tone with a simple ADSR-ish envelope. */
  function tone(freq, dur, type, when, vol, slideTo) {
    if (!enabled || !ensureCtx()) { return; }
    var t0 = ctx.currentTime + (when || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) { osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur); }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.5, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /* ---------- public effects ---------- */

  function click()      { tone(620, 0.07, 'triangle', 0, 0.5, 830); }
  function pop()        { tone(360, 0.11, 'square', 0, 0.28, 180); }
  function jump()       { tone(300, 0.22, 'sine', 0, 0.6, 880); }
  function back()       { tone(520, 0.08, 'triangle', 0, 0.4, 380); }

  function success() {
    tone(523.25, 0.16, 'sine', 0.00, 0.5);   /* C5 */
    tone(659.25, 0.16, 'sine', 0.10, 0.5);   /* E5 */
    tone(783.99, 0.24, 'sine', 0.20, 0.55);  /* G5 */
    tone(1046.5, 0.30, 'triangle', 0.30, 0.4); /* C6 sparkle */
  }

  function celebrate() {
    var notes = [523.25, 523.25, 659.25, 783.99, 659.25, 783.99, 1046.5];
    var times = [0, 0.12, 0.24, 0.38, 0.52, 0.64, 0.78];
    for (var i = 0; i < notes.length; i++) {
      tone(notes[i], 0.18, 'triangle', times[i], 0.42);
    }
    tone(261.63, 0.7, 'sine', 0.0, 0.3);
    tone(392.0, 0.9, 'sine', 0.35, 0.3);
  }

  function danceBeat() {
    tone(196, 0.10, 'square', 0, 0.16);
    tone(261.63, 0.08, 'square', 0.12, 0.12);
  }

  /* ---------- toggle ---------- */

  function isEnabled() { return enabled; }

  function setEnabled(on) {
    enabled = !!on;
    writePref(enabled);
    if (enabled) { ensureCtx(); click(); }
  }

  function init() {
    enabled = readPref(); /* stays false unless user previously opted in */
    return enabled;
  }

  return {
    init: init,
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    click: click,
    pop: pop,
    jump: jump,
    back: back,
    success: success,
    celebrate: celebrate,
    danceBeat: danceBeat
  };
})();
