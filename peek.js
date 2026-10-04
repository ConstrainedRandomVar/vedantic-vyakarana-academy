// peek.js — THE ONE controller for hiding the word-analysis cards on reading pages (#tip = mūla card,
// .gtip = commentary card) via body.vvnopeek. Cards are hidden when EITHER
//   (a) the reader turned on "Quiet hover" in the app's ⚙ Settings (localStorage vv_quiet_hover = '1') — for
//       instructors screen-sharing (Zoom etc.) who don't want cards popping up as the mouse moves; or
//   (b) a sync-scrolling presenter is presenting (sync.js → VVPeek.setPresenting(true)): hover drives the laser.
// Holding Cmd (Mac) / Ctrl (Windows) or Alt (Option) reveals the cards while held — the SAME keys in both modes
// (Harsha 2026-10-04; presenters previously had Alt only, still works). Quiet hover applies only on devices
// that can hover — phones/tablets have no modifier keys and use taps, so they are never affected.
// Loaded by: sync.js (dynamically, on every page that has it) and directly by pages without sync.js
// (Vicārasāgara, the निबन्धाः monographs). Fixed-name asset, copied + SW-listed by build_deploy.js.
(function () {
  'use strict';
  if (window.VVPeek) return;
  var KEY = 'vv_quiet_hover';
  var canHover = window.matchMedia ? matchMedia('(hover: hover) and (pointer: fine)').matches : true;
  var presenting = false, held = false;
  var st = document.createElement('style');
  st.textContent = 'body.vvnopeek #tip,body.vvnopeek .gtip{display:none !important}';
  (document.head || document.documentElement).appendChild(st);
  function quiet() { try { return canHover && localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function apply() {
    if (!document.body) return;
    document.body.classList.toggle('vvnopeek', (presenting || quiet()) && !held);
  }
  function isMod(k) { return k === 'Meta' || k === 'Control' || k === 'Alt'; }
  window.addEventListener('keydown', function (e) { if (isMod(e.key)) { held = true; apply(); } });
  window.addEventListener('keyup', function (e) {
    if (isMod(e.key)) { held = e.metaKey || e.ctrlKey || e.altKey; apply(); }
  });
  // a keyup can be missed (e.g. Cmd-Tab away): every mouse move re-reads the real modifier state
  window.addEventListener('mousemove', function (e) {
    var h = e.metaKey || e.ctrlKey || e.altKey;
    if (h !== held) { held = h; apply(); }
  }, { passive: true });
  window.addEventListener('blur', function () { held = false; apply(); });
  // toggled in the app's ⚙ Settings in another tab → open reading tabs follow
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(); });
  window.VVPeek = {
    setPresenting: function (on) { presenting = !!on; apply(); },
    isQuiet: quiet,
    refresh: apply
  };
  if (document.body) apply(); else document.addEventListener('DOMContentLoaded', apply);
})();
