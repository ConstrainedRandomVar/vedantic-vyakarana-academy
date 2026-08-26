'use strict';
// Vyākaraṇa shared-reading ("follow the instructor") — the ONE shared, SW-precached browser asset
// referenced by every reading page (like translit.js), NOT inlined ×184. It injects its own CSS + DOM
// (a "Share reading" starter button, and — only in a session — the floating session bar) and runs the
// sync logic. Config comes from `window.VVSYNC = { slug?, relay? }` set just before this script.
//
// DESIGN — broadcast SEMANTIC positions, never pixels/text: the presenter emits {page, ref, k} where
// ref = a #v-<ref> verse anchor, k = a word span's data-k ("<slug>:<ref>:<idx>"), page = the reading
// file. Followers scrollIntoView('#v-'+ref) + highlight [data-k=k], and auto-navigate when `page`
// differs (so switching texts/chapters carries them along). Script-/font-/viewport-independent, so it
// composes with the translit.js script picker — each browser renders the same position in its own script.
//
// TRANSPORT is pluggable: default BroadcastChannel (same-browser cross-tab, zero backend); ?relay=wss://…
// (or the baked default host) for cross-device via the WebSocket broadcast relay (corpus/sync-relay/).
// The page is INERT unless the URL has ?session= : no bar, only the (dismissible) "Share reading" starter.

(function () {
  var CFG = window.VVSYNC || {};
  var SLUG = String(CFG.slug || '');
  var RELAY_HOST = String(CFG.relay || 'wss://vyakarana-sync-relay.onrender.com');

  function qp(n) { try { return new URLSearchParams(location.search).get(n); } catch (e) { return null; } }
  var SESSION = qp('session');

  // ---- inject CSS once ----
  var CSS = ''
    + '#vvsync{position:fixed;left:14px;bottom:14px;z-index:85;display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;'
    + '  max-width:min(92vw,420px);font:inherit;font-size:12px;color:var(--ink);background:var(--card);'
    + '  border:1px solid var(--line);border-radius:22px;padding:7px 12px;box-shadow:0 3px 14px rgba(0,0,0,.20)}'
    + '#vvsync .vs-role{font-weight:600;white-space:nowrap}'
    + '#vvsync .vs-dot{width:8px;height:8px;border-radius:50%;background:#c33;display:inline-block;vertical-align:middle;margin-right:4px}'
    + '#vvsync .vs-dot.on{background:#2c9e4b}'
    + '#vvsync .vs-dot.local{background:#e0a020}'
    + '#vvsync .vs-sid{color:var(--muted);font-size:11px;white-space:nowrap}'
    + '#vvsync button{font:inherit;font-size:12px;color:var(--ink);background:var(--bg);border:1px solid var(--line);'
    + '  border-radius:14px;padding:4px 10px;cursor:pointer;white-space:nowrap}'
    + '#vvsync button:hover{background:var(--card)}'
    + '#vvsync button.vs-hot{background:var(--ink);color:var(--bg);border-color:var(--ink)}'
    + '#vvsync .vs-sp{flex:1 1 auto}'
    + '#vvsync .vs-x{border:none;background:none;color:var(--muted);padding:2px 4px;font-size:14px;cursor:pointer}'
    + '.syncv{scroll-margin-top:82px}'
    + '@keyframes syncflash{0%{background:rgba(120,120,180,.30)}100%{background:transparent}}'
    + '.syncv.syncv-hit{animation:syncflash 1.6s ease-out}'
    + '.w.synchi{background:rgba(230,170,32,.35);border-radius:4px;box-shadow:0 0 0 2px rgba(230,170,32,.55);'
    + '  transition:background .15s,box-shadow .15s}'
    + '@keyframes syncptpulse{0%,100%{box-shadow:0 0 0 2px rgba(220,60,60,.60)}50%{box-shadow:0 0 0 4px rgba(220,60,60,.28)}}'
    + '.w.syncpt{background:rgba(220,60,60,.16);border-radius:4px;animation:syncptpulse 1.1s ease-in-out infinite}'
    + '#vvsync .vs-tip{position:fixed;left:14px;bottom:56px;max-width:min(92vw,420px);background:var(--card);'
    + '  border:1px solid var(--line);border-radius:10px;padding:9px 12px;font-size:12px;color:var(--muted);'
    + '  box-shadow:0 6px 20px rgba(0,0,0,.25);line-height:1.45}'
    + '#vvstart{position:fixed;right:14px;bottom:56px;z-index:81;font:inherit;font-size:12px;color:var(--muted);'
    + '  background:var(--card);border:1px solid var(--line);border-radius:16px;padding:5px 11px;cursor:pointer;'
    + '  opacity:.72;transition:opacity .15s,background .15s}'
    + '#vvstart:hover{opacity:1;background:var(--bg)}'
    + '#vvstart.on{color:var(--ink);opacity:1}'
    + '#vvstart-pop{position:fixed;right:14px;bottom:94px;z-index:82;max-width:min(92vw,360px);background:var(--card);'
    + '  border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--ink);'
    + '  box-shadow:0 6px 20px rgba(0,0,0,.25);line-height:1.5;display:none}'
    + '#vvstart-pop input{width:100%;box-sizing:border-box;font:inherit;font-size:11px;padding:5px 7px;margin-top:6px;'
    + '  border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)}'
    + '#vvstart-pop .vv-row{display:flex;gap:6px;margin-top:8px}'
    + '#vvstart-pop button{font:inherit;font-size:12px;padding:4px 10px;border-radius:12px;border:1px solid var(--line);'
    + '  background:var(--bg);color:var(--ink);cursor:pointer}'
    + '#vvstart-pop button:hover{background:var(--card)}'
    + 'body.vvnopeek #tip{display:none !important}';   // presenter: hover drives the laser; hold Alt to peek
  var _st = document.createElement('style'); _st.textContent = CSS;
  (document.head || document.documentElement).appendChild(_st);

  // ---- inject DOM (session bar + starter button + popover) ----
  var _wrap = document.createElement('div');
  _wrap.innerHTML = ''
    + '<div id="vvsync" hidden>'
    + '  <span class="vs-role" id="vs-role"></span>'
    + '  <span class="vs-sid" id="vs-sid"></span>'
    + '  <span class="vs-sp"></span>'
    + '  <button id="vs-act" type="button"></button>'
    + '  <button id="vs-role-btn" type="button" title="Pause / resume broadcasting">⏸ pause</button>'
    + '  <button id="vs-stop" type="button" title="End the session for everyone">⏹ end</button>'
    + '  <button id="vs-replay" type="button" title="Load a recorded session to replay">▶ replay</button>'
    + '  <input id="vs-file" type="file" accept="application/json,.json" hidden>'
    + '  <button class="vs-x" id="vs-help" type="button" title="What is this?">ⓘ</button>'
    + '</div>'
    + '<button id="vvstart" type="button" hidden></button>'
    + '<div id="vvstart-pop"></div>';
  while (_wrap.firstChild) document.body.appendChild(_wrap.firstChild);

  // ================= "Share reading" starter (entry point) =================
  (function () {
    var btn = document.getElementById('vvstart'), pop = document.getElementById('vvstart-pop');
    if (!btn) return;
    var ROLE = qp('role'), isPresent = (ROLE === 'present' || ROLE === 'p');
    if (SESSION && !isPresent) { if (btn.parentNode) btn.parentNode.removeChild(btn); if (pop && pop.parentNode) pop.parentNode.removeChild(pop); return; } // student: no starter
    btn.hidden = false;

    function mkRoom() {
      try {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
        var a = new Uint32Array(2); crypto.getRandomValues(a); return (a[0].toString(36) + a[1].toString(36)).slice(0, 10);
      } catch (e) { return 'r' + String(Date.now() % 1e9).toString(36); }
    }
    function urlFor(room, present) {
      var u = new URL(location.href), sp = u.searchParams;
      sp.set('session', room); sp.set('relay', RELAY_HOST); if (present) sp.set('role', 'present'); else sp.delete('role');
      u.hash = ''; return u.pathname + '?' + sp.toString();
    }
    function absURL(rel) { try { return new URL(rel, location.href).href; } catch (e) { return rel; } }
    function copy(txt, okEl) { try { navigator.clipboard.writeText(txt).then(function () { if (okEl) okEl.textContent = 'copied ✓'; }, function () {}); } catch (e) {} }

    function showShare(room) {
      var s = absURL(urlFor(room, false));
      pop.innerHTML = '<b>Shared reading is live.</b><br>Send students this link — they follow along, each in their own script:'
        + '<input id="vvstart-link" readonly value="' + s.replace(/"/g, '&quot;') + '">'
        + '<div class="vv-row"><button id="vvstart-copy" type="button">📋 Copy student link</button>'
        + '<button id="vvstart-close" type="button">Close</button></div>';
      pop.style.display = 'block';
      var inp = document.getElementById('vvstart-link'); if (inp) { inp.focus(); inp.select(); }
      var cp = document.getElementById('vvstart-copy'); if (cp) cp.onclick = function () { copy(s, cp); };
      var cl = document.getElementById('vvstart-close'); if (cl) cl.onclick = function () { pop.style.display = 'none'; };
    }

    if (SESSION && isPresent) {          // already presenting → idempotent re-show, no new room
      btn.textContent = '📋 student link'; btn.className = 'on';
      btn.onclick = function () { if (pop.style.display === 'block') pop.style.display = 'none'; else showShare(SESSION); };
      setTimeout(function () { showShare(SESSION); }, 120);   // auto-open the link on first landing
    } else {                             // not in a session → mint a room + become presenter
      btn.textContent = '⇉ Share reading';
      btn.onclick = function () { location.assign(urlFor(mkRoom(), true)); };
    }
  })();

  // ================= session bar + sync (only in a session) =================
  (function () {
    var bar = document.getElementById('vvsync');
    if (!SESSION) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    if (!bar) return;
    bar.hidden = false;

    var RELAY = qp('relay') || RELAY_HOST;
    // Role is FIXED by the link: only someone who opened the presenter link can present. A follower can
    // break free / re-sync but can never present. A presenter can PAUSE (stop broadcasting) & resume.
    var CAN_PRESENT = (qp('role') === 'present' || qp('role') === 'p');
    var role = CAN_PRESENT ? 'present' : 'follow';
    var paused = false;    // presenter: temporarily hold broadcasting (followers wait)
    var stopped = false;   // presenter: session ended (followers notified + freed)
    var ended = false;     // follower: presenter ended the session
    var followers = null;  // presenter: live follower count from the relay's roster (null until known)
    var lastView = null;   // last commentary view {side,place} — presenter broadcasts, follower mirrors
    var SELF = 'c' + Math.floor((Math.random() * 1e9)) + '-' + ((window.performance && performance.now) ? Math.floor(performance.now()) : 0);
    var PAGE = (location.pathname.split('/').pop() || 'index.html');

    var navigating = false, pendingPage = null, pendingRef = null;
    function visible() { try { return document.visibilityState !== 'hidden'; } catch (e) { return true; } }
    function activeTab() { try { return visible() && document.hasFocus(); } catch (e) { return true; } }
    function gotoPage(page, ref) {
      if (navigating) return; navigating = true;
      try {
        var u = new URL(page, location.href), sp = u.searchParams;
        sp.set('session', SESSION); if (RELAY) sp.set('relay', RELAY); else sp.delete('relay'); sp.delete('role');
        u.hash = ref ? ('v-' + ref) : '';
        location.assign(u.pathname + (sp.toString() ? ('?' + sp.toString()) : '') + u.hash);
      } catch (e) { navigating = false; }
    }

    var last = { ref: null, k: null };
    var brokeFree = false;
    var recording = false, recLog = null, recT0 = 0;
    var replaying = false, replayTimers = [];

    function curVerse() {
      try {
        var els = document.querySelectorAll('[id^="v-"]'); var best = null, bestTop = -1e9;
        for (var i = 0; i < els.length; i++) { var t = els[i].getBoundingClientRect().top; if (t <= 140 && t > bestTop) { bestTop = t; best = els[i]; } }
        if (!best && els.length) best = els[0];
        return best ? best.id.replace(/^v-/, '') : null;
      } catch (e) { return null; }
    }
    function refOfK(k) { var p = String(k || '').split(':'); return p.length >= 3 ? p[1] : null; }

    // a data-k may exist in MORE than one place (a ṭīkā word is rendered both inline and in the पार्श्वे
    // column; only one is shown per reader's layout) — return the VISIBLE copy so the laser/scroll lands
    // where this reader can see it, even if the presenter is on a different placement.
    function qK(k) { var sel = '[data-k="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]';
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) if (els[i].offsetParent !== null) return els[i];
      return els[0] || null; }
    function inView(el) { try { var r = el.getBoundingClientRect(); return r.top >= 64 && r.bottom <= innerHeight - 32; } catch (e) { return true; } }
    function clearHi() { var w = document.querySelector('.w.synchi'); if (w) w.classList.remove('synchi'); }
    function clearPt() { var p = document.querySelector('.w.syncpt'); if (p) p.classList.remove('syncpt'); }
    function applyPos(ref, k) {
      last.ref = ref; if (k !== undefined) last.k = k;
      if (ref) {
        var v = document.getElementById('v-' + ref);
        if (v) {
          v.classList.add('syncv');
          if (!brokeFree) { v.scrollIntoView({ behavior: 'smooth', block: 'start' }); v.classList.remove('syncv-hit'); void v.offsetWidth; v.classList.add('syncv-hit'); }
        }
      }
      clearHi();
      if (k) { var el = qK(k); if (el) { el.classList.add('synchi'); if (!brokeFree) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } } }
      render();
    }
    function applyPoint(k) { clearPt(); if (k) { var el = qK(k); if (el) el.classList.add('syncpt'); } }
    function maybeNav(page, ref) {
      if (!page || page === PAGE) return false;
      if (brokeFree) { pendingPage = page; pendingRef = ref || null; render(); return true; }
      gotoPage(page, ref); return true;
    }

    var tx = null, status = '…';
    function send(data) { if (tx) tx.send({ room: SESSION, from: SELF, role: role, data: data }); }
    function onMsg(m) {
      if (!m || m.room !== SESSION || m.from === SELF) return;
      var d = m.data || {};
      if (d.t === 'hello') { if (role === 'present' && activeTab()) { sendView(); if (last.ref) sendPos(last.ref, last.k); } return; }
      if (d.t === 'pos') { if (role === 'follow' && !replaying) { if (ended) { ended = false; brokeFree = false; render(); } if (maybeNav(d.page, d.ref)) return; applyPos(d.ref, d.k); } return; }
      if (d.t === 'point') {
        if (role === 'follow' && !replaying) {
          var pref = d.ref || refOfK(d.k);
          if (maybeNav(d.page, pref)) return;
          // hovering into a NEW verse gently brings it into view (block:nearest = minimal move, no yank);
          // hovering within the current verse just moves the laser.
          if (pref && pref !== last.ref && !brokeFree) {
            last.ref = pref;
            var v = document.getElementById('v-' + pref);
            if (v) { v.classList.add('syncv'); v.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
          }
          applyPoint(d.k);
          // follow the laser WITHIN a verse too: if the pointed word (bhāṣya/ṭīkā, possibly in a
          // different layout than the presenter's) is off-screen, bring it into view.
          if (!brokeFree && d.k) { var pe = qK(d.k); if (pe && !inView(pe)) pe.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }
        return;
      }
      if (d.t === 'clear') { if (role === 'follow' && !replaying) { clearHi(); clearPt(); } return; }
      if (d.t === 'end') { if (role === 'follow' && !replaying) { ended = true; brokeFree = true; clearHi(); clearPt(); render(); } return; }
      if (d.t === 'roster') { followers = d.followers; if (role === 'present') render(); return; }   // relay's live follower count
      if (d.t === 'view') { if (role === 'follow' && !replaying) { lastView = { side: d.side, place: d.place }; if (!brokeFree && window.__vvView && window.__vvView.apply) window.__vvView.apply(d.side, d.place); } return; }
    }
    function makeTx() {
      if (RELAY) {
        try {
          var ws = new WebSocket(RELAY);
          ws.onopen = function () { status = 'live'; render(); send({ t: 'hello' }); };
          ws.onclose = function () { status = 'offline'; render(); if (!replaying) setTimeout(makeTx, 2500); };
          ws.onerror = function () { status = 'offline'; render(); };
          ws.onmessage = function (e) { try { onMsg(JSON.parse(e.data)); } catch (_) {} };
          tx = { kind: 'ws', send: function (o) { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (_) {} } };
        } catch (e) { status = 'offline'; render(); }
      } else if ('BroadcastChannel' in window) {
        var bc = new BroadcastChannel('vvsync:' + SESSION);
        bc.onmessage = function (e) { onMsg(e.data); };
        tx = { kind: 'local', send: function (o) { bc.postMessage(o); } };
        status = 'local'; render(); send({ t: 'hello' });
      } else { status = 'no-bc'; render(); }
    }

    function sendPos(ref, k) {
      last.ref = ref; last.k = (k !== undefined ? k : null);
      send({ t: 'pos', page: PAGE, ref: ref, k: last.k });
      if (recording) { recLog.push({ dt: Date.now() - recT0, ref: ref, k: last.k }); render(); }
    }
    // presenter → followers: mirror the commentary/placement choice (which ṭīkā/vārttika, अन्तः/पार्श्वे).
    // The chooser lives in the page's inline script, which exposes window.__vvView (get/apply); sync bridges it.
    function sendView() { if (role === 'present' && window.__vvView && window.__vvView.get) { var v = window.__vvView.get(); lastView = v; send({ t: 'view', side: v.side, place: v.place }); } }
    var lastRef = null, tick = 0;
    function onScroll() {
      if (role !== 'present' || paused || stopped || !visible()) return;
      clearTimeout(tick);
      tick = setTimeout(function () { var r = curVerse(); if (r && r !== lastRef) { lastRef = r; sendPos(r, null); } }, 220);
    }
    function onWordTap(e) {
      if (role !== 'present' || paused || stopped || !visible()) return;
      var el = e.target && e.target.closest ? e.target.closest('.w[data-k]') : null;
      if (!el) { sendClear(); return; }                             // click empty space → clear laser + highlight
      if (el.classList.contains('synchi')) { sendClear(); return; } // click the highlighted word again → toggle off
      var k = el.getAttribute('data-k'); var r = refOfK(k) || curVerse();
      clearHi(); el.classList.add('synchi');
      sendPos(r, k);
    }
    // clear the transient laser + the persistent highlight everywhere (click-empty / re-click / Esc)
    function sendClear() { clearHi(); clearPt(); lastPt = null; send({ t: 'clear' }); if (recording && recLog) { recLog.push({ dt: Date.now() - recT0, clear: true }); } }
    var lastPt = null, ptTs = 0;
    // point carries the hovered word's ref too, so followers can also move to that verse (not just laser it)
    function sendPoint(k) { send({ t: 'point', page: PAGE, k: k, ref: (k ? refOfK(k) : null) }); if (recording && recLog) { recLog.push({ dt: Date.now() - recT0, pt: (k || null) }); } }
    function onMove(e) {
      if (role !== 'present' || paused || stopped || replaying || !visible()) return;
      var now = Date.now(); if (now - ptTs < 70) return; ptTs = now;
      var el = e.target && e.target.closest ? e.target.closest('.w[data-k]') : null;
      var k = el ? el.getAttribute('data-k') : null;
      if (k === lastPt) return; lastPt = k;
      if (k) { var r = refOfK(k); if (r) lastRef = r; }   // keep presenter state at the pointed verse (late joiners land here)
      applyPoint(k); sendPoint(k);
    }
    function onLeaveDoc() { if (role === 'present' && lastPt !== null) { lastPt = null; applyPoint(null); sendPoint(null); } }

    function detach() { if (role === 'follow' && !brokeFree && !replaying) { brokeFree = true; render(); } }
    ['wheel', 'touchmove', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function (e) {
        if (ev === 'keydown' && !/Arrow|Page|Home|End| /.test(e.key || '')) return;
        detach();
      }, { passive: true });
    });
    // Esc clears laser + highlight (presenter broadcasts the clear; a follower clears its own view)
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (role === 'present') sendClear(); else { clearHi(); clearPt(); } }
    });
    // Presenter: hover drives the 🔴 laser, so suppress the page's word-analysis tooltip (#tip) while
    // presenting; hold Alt (Option) to "peek" at the analysis on demand. Followers keep the tooltip.
    function applyPeekMode() { if (role === 'present' && !paused && !stopped) document.body.classList.add('vvnopeek'); else document.body.classList.remove('vvnopeek'); }
    window.addEventListener('keydown', function (e) { if (e.key === 'Alt' && role === 'present') document.body.classList.remove('vvnopeek'); });
    window.addEventListener('keyup', function (e) { if (e.key === 'Alt' && role === 'present' && !paused) document.body.classList.add('vvnopeek'); });
    window.addEventListener('blur', function () { if (role === 'present' && !paused) document.body.classList.add('vvnopeek'); });
    applyPeekMode();

    function stopReplay() { replaying = false; replayTimers.forEach(clearTimeout); replayTimers = []; render(); }
    function runReplay(events) {
      stopReplay(); if (!events || !events.length) return;
      replaying = true; brokeFree = false;
      events.forEach(function (ev) { replayTimers.push(setTimeout(function () { if (ev.clear) { clearHi(); clearPt(); } else if (ev.pt !== undefined) applyPoint(ev.pt); else applyPos(ev.ref, ev.k); }, Math.max(0, ev.dt | 0))); });
      var end = events[events.length - 1].dt | 0;
      replayTimers.push(setTimeout(function () { replaying = false; render(); }, end + 400));
      render();
    }
    function downloadRec() {
      var blob = new Blob([JSON.stringify({ slug: SLUG, session: SESSION, events: recLog || [] }, null, 0)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'session-' + SESSION + '.json'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }

    var elRole = document.getElementById('vs-role'), elSid = document.getElementById('vs-sid'),
        elAct = document.getElementById('vs-act'), elRoleBtn = document.getElementById('vs-role-btn'),
        elStop = document.getElementById('vs-stop'),
        elReplay = document.getElementById('vs-replay'), elFile = document.getElementById('vs-file'),
        elHelp = document.getElementById('vs-help'), tip = null;
    // Only a presenter gets ⏸ pause/resume and ⏹ end; followers can't present, so hide both for them.
    if (!CAN_PRESENT) { if (elRoleBtn) elRoleBtn.style.display = 'none'; if (elStop) elStop.style.display = 'none'; }
    function dotClass() { return status === 'live' ? 'on' : status === 'local' ? 'local' : ''; }
    function render() {
      var dot = '<span class="vs-dot ' + dotClass() + '"></span>';
      if (replaying) { elRole.innerHTML = dot + '▶ replaying'; }
      else if (role === 'present') { elRole.innerHTML = dot + (stopped ? '⏹ session ended' : paused ? '⏸ paused' : '🎙 presenting') + (followers != null ? ' · 👥 ' + followers : ''); }
      else { elRole.innerHTML = dot + (ended ? '⏹ session ended' : brokeFree ? '🔓 detached' : '👀 following'); }
      elSid.textContent = SESSION + (RELAY ? ' · relay' : ' · local') + (status === 'offline' ? ' · offline' : '');
      if (replaying) { elAct.textContent = '⏹ stop'; elAct.className = ''; elAct.onclick = stopReplay; }
      else if (role === 'present') {
        elAct.textContent = recording ? ('⏹ stop · ' + ((recLog && recLog.length) || 0)) : '⏺ record';
        elAct.className = recording ? 'vs-hot' : '';
        elAct.onclick = function () {
          if (recording) { recording = false; render(); if (recLog && recLog.length) downloadRec(); }
          else { recording = true; recLog = []; recT0 = Date.now(); if (last.ref) recLog.push({ dt: 0, ref: last.ref, k: last.k }); render(); }
        };
      } else {
        elAct.textContent = brokeFree ? '🔄 re-sync' : '🔓 break free';
        elAct.className = brokeFree ? 'vs-hot' : '';
        elAct.onclick = function () { if (brokeFree) { brokeFree = false; if (lastView && window.__vvView && window.__vvView.apply) window.__vvView.apply(lastView.side, lastView.place); if (pendingPage) { gotoPage(pendingPage, pendingRef); return; } if (last.ref) applyPos(last.ref, last.k); } else { brokeFree = true; render(); } };
      }
      if (CAN_PRESENT) {
        elRoleBtn.textContent = paused ? '▶ resume' : '⏸ pause'; elRoleBtn.className = paused ? 'vs-hot' : '';
        elRoleBtn.disabled = stopped; elRoleBtn.style.opacity = stopped ? '.5' : '';
        elStop.textContent = stopped ? '⇉ present again' : '⏹ end'; elStop.className = stopped ? 'vs-hot' : '';
      }
    }
    // presenter-only: pause = stop broadcasting (read/scroll freely without dragging followers), resume = re-announce
    elRoleBtn.onclick = function () {
      if (!CAN_PRESENT || stopped) return;
      paused = !paused; brokeFree = false; applyPeekMode();
      if (paused) { sendClear(); } else { var r = curVerse(); if (r) { lastRef = r; sendPos(r, null); } }
      render();
    };
    // presenter-only: ⏹ end broadcasts session-end (followers get notified + freed); toggles back to re-present
    elStop.onclick = function () {
      if (!CAN_PRESENT) return;
      if (!stopped) { stopped = true; paused = false; applyPeekMode(); send({ t: 'end' }); clearHi(); clearPt(); }
      else { stopped = false; var r = curVerse(); if (r) { lastRef = r; sendPos(r, null); } applyPeekMode(); }
      render();
    };
    elReplay.onclick = function () { elFile.click(); };
    elFile.onchange = function () {
      var f = elFile.files && elFile.files[0]; if (!f) return;
      var fr = new FileReader(); fr.onload = function () { try { var j = JSON.parse(fr.result); runReplay(j.events || j); } catch (e) { alert('Could not read replay file.'); } }; fr.readAsText(f); elFile.value = '';
    };
    elHelp.onclick = function () {
      if (tip) { tip.remove(); tip = null; return; }
      tip = document.createElement('div'); tip.className = 'vs-tip';
      tip.innerHTML = '<b>Shared reading.</b> The presenter\'s scrolling, hover (🔴 laser) &amp; word-taps '
        + '(🟡 highlight) mirror to everyone in session <b>' + SESSION + '</b> — each in their own script. '
        + 'Clear the laser/highlight by clicking empty space, clicking the word again, or pressing <b>Esc</b>. '
        + (role === 'present' ? 'The word-analysis tooltip is hidden while presenting — hold <b>Alt</b> (Option) to peek. ' : '')
        + 'Open a second text in another tab and switch — followers move with you. '
        + (RELAY ? 'Cross-device via relay.' : 'Same-browser (open another tab in this session). Add <code>?relay=wss://…</code> for cross-device.')
        + '<br>Followers can <b>break free</b> to look around, then <b>re-sync</b>. '
        + 'Presenters can <b>record</b> a session and <b>replay</b> the JSON later — no backend needed.';
      bar.parentNode.insertBefore(tip, bar);
      setTimeout(function () { window.addEventListener('click', function h(ev) { if (tip && !tip.contains(ev.target) && ev.target !== elHelp) { tip.remove(); tip = null; window.removeEventListener('click', h); } }); }, 0);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onWordTap);
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeaveDoc);
    function announceLive() { if (role === 'present' && !paused && !stopped && !replaying && activeTab()) { sendView(); var r = curVerse(); if (r) { lastRef = r; sendPos(r, null); } } }
    window.addEventListener('focus', announceLive);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(announceLive, 60); });

    // bridge: the page's commentary chooser calls this on a user change → presenter broadcasts it
    window.__vvView = window.__vvView || {};
    window.__vvView.onChange = function (s, pl) { if (role === 'present' && !paused && !stopped) { lastView = { side: s, place: pl }; send({ t: 'view', side: s, place: pl }); } };

    makeTx();
    render();
    if (role === 'present') { setTimeout(function () { if (activeTab()) { sendView(); var r0 = curVerse(); if (r0) { lastRef = r0; sendPos(r0, null); } } }, 300); }
  })();
})();
