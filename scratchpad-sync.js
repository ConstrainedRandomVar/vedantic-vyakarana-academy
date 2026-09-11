'use strict';
// Shared-reading sync for the classroom SCRATCHPAD (scratchpad.html). Deliberately SEPARATE from the
// shared app/sync.js that the 184 pre-built reading pages depend on — the scratchpad's content is
// instructor-uploaded and its anchors differ (heading ids `sec-N` + word tokens `wN`, not `#v-<ref>`
// / slug data-k), so it gets its own glue rather than risking the shared asset.
//
// It reuses the SAME relay + envelope as app/sync.js ({room, from, role, data}) so the relay needs no
// change (and its follower-roster works). New message: {t:'doc', html} carries the imported, tokenized
// document to followers (and is resent on `hello` for late joiners) — the scratchpad's content is not
// pre-built, so unlike the static pages the content itself travels the wire. Positions/laser reuse
// {t:'pos'|'point'|'clear'|'end'} keyed on the scratchpad's ids.
//
// Presenter starts a session IN PLACE (history.replaceState) so a already-loaded doc is not lost to a
// navigation. Config: window.VVSYNC = { slug?, relay? }. The page is inert unless it opts in.

(function () {
  var SC = window.__scratch;
  if (!SC) return;                                   // scratchpad API not present → nothing to do
  var CFG = window.VVSYNC || {};
  var RELAY_HOST = String(CFG.relay || 'wss://vyakarana-sync-relay.onrender.com');
  function qp(n) { try { return new URLSearchParams(location.search).get(n); } catch (e) { return null; } }

  // ---- CSS (session bar + sync overlays on the paper) ----
  var CSS = ''
    + '#vvsync{position:fixed;left:14px;bottom:14px;z-index:85;display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;'
    + '  font:inherit;font-size:12px;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:22px;'
    + '  padding:7px 12px;box-shadow:0 3px 14px rgba(0,0,0,.20);max-width:min(92vw,440px)}'
    + '#vvsync .vs-dot{width:8px;height:8px;border-radius:50%;background:#c33;display:inline-block;margin-right:4px}'
    + '#vvsync .vs-dot.on{background:#2c9e4b}#vvsync .vs-dot.local{background:#e0a020}'
    + '#vvsync button{font:inherit;font-size:12px;color:var(--ink);background:var(--bg);border:1px solid var(--line);'
    + '  border-radius:14px;padding:4px 10px;cursor:pointer}#vvsync button:hover{background:var(--card)}'
    + '#vvsync button.vs-hot{background:var(--ink);color:var(--bg);border-color:var(--ink)}'
    + '#vvstart{position:fixed;right:14px;bottom:14px;z-index:81;font:inherit;font-size:12px;color:var(--ink);'
    + '  background:var(--saffron);color:#fff;border:1px solid var(--saffron);border-radius:16px;padding:6px 12px;cursor:pointer;font-weight:600}'
    + '#vvstart-pop{position:fixed;right:14px;bottom:52px;z-index:82;max-width:min(92vw,360px);background:var(--card);'
    + '  border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--ink);'
    + '  box-shadow:0 6px 20px rgba(0,0,0,.25);display:none}'
    + '#vvstart-pop input{width:100%;box-sizing:border-box;font:inherit;font-size:11px;padding:5px 7px;margin-top:6px;'
    + '  border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)}'
    + '#vvstart-pop button{font:inherit;font-size:12px;padding:4px 10px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer;margin-top:8px}'
    + '.w.synchi{background:rgba(230,170,32,.35);border-radius:4px;box-shadow:0 0 0 2px rgba(230,170,32,.55)}'
    + '@keyframes syncptp{0%,100%{box-shadow:0 0 0 2px rgba(220,60,60,.6)}50%{box-shadow:0 0 0 4px rgba(220,60,60,.28)}}'
    + '.w.syncpt{background:rgba(220,60,60,.16);border-radius:4px;animation:syncptp 1.1s ease-in-out infinite}'
    + '[id^="sec-"]{scroll-margin-top:70px}';
  var st = document.createElement('style'); st.textContent = CSS; (document.head || document.documentElement).appendChild(st);

  // ---- DOM (starter + session bar) ----
  var wrap = document.createElement('div');
  wrap.innerHTML = ''
    + '<button id="vvstart" type="button" hidden>⇉ Share reading</button>'
    + '<div id="vvstart-pop"></div>'
    + '<div id="vvsync" hidden><span class="vs-role" id="vs-role"></span>'
    + '  <span class="vs-sid" id="vs-sid" style="color:var(--muted);font-size:11px"></span>'
    + '  <span style="flex:1"></span>'
    + '  <button id="vs-link" type="button" title="Copy the student link">📋 link</button>'
    + '  <button id="vs-act" type="button"></button>'
    + '  <button id="vs-end" type="button" title="End for everyone">⏹ end</button></div>';
  function mount() { while (wrap.firstChild) document.body.appendChild(wrap.firstChild); init(); }
  // NOTE: the mount trigger is at the BOTTOM of this IIFE — so all state vars below are assigned first.

  // ================= state =================
  var SESSION = qp('session');
  var CAN_PRESENT = (qp('role') === 'present' || qp('role') === 'p');
  // relay default = the baked Render host; ?relay=local (or empty) → BroadcastChannel (same-browser, zero backend)
  var RELAY = qp('relay'); if (RELAY === null) RELAY = RELAY_HOST; if (RELAY === '' || RELAY === 'local') RELAY = null;
  var role = CAN_PRESENT ? 'present' : 'follow';
  var SELF = 'c' + Math.floor(Math.random() * 1e9) + '-' + Date.now();
  var tx = null, status = '…';
  var lastDoc = null, lastRef = null, lastK = null;
  var brokeFree = false, ended = false, stopped = false, followers = null;
  var pendingDoc = null;

  function mkRoom() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 8); } catch (e) {}
    return 'r' + Date.now().toString(36);
  }
  function absURL(rel) { try { return new URL(rel, location.href).href; } catch (e) { return rel; } }
  function shareURL(room, present) {
    var u = new URL(location.href), sp = u.searchParams;
    sp.set('session', room); sp.set('relay', RELAY_HOST); if (present) sp.set('role', 'present'); else sp.delete('role');
    u.hash = ''; return u.pathname + '?' + sp.toString();
  }

  // ================= sync helpers =================
  function send(data) { if (tx) tx.send({ room: SESSION, from: SELF, role: role, data: data }); }
  function headingAtTop() {
    var els = document.querySelectorAll('[id^="sec-"]'), best = null, bt = -1e9;
    for (var i = 0; i < els.length; i++) { var t = els[i].getBoundingClientRect().top; if (t <= 140 && t > bt) { bt = t; best = els[i]; } }
    if (!best && els.length) best = els[0];
    return best ? best.id : null;
  }
  function qK(k) { try { return document.querySelector('[data-k="' + (window.CSS && CSS.escape ? window.CSS.escape(k) : k) + '"]'); } catch (e) { return null; } }
  function clearHi() { var w = document.querySelector('.w.synchi'); if (w) w.classList.remove('synchi'); }
  function clearPt() { var p = document.querySelector('.w.syncpt'); if (p) p.classList.remove('syncpt'); }

  function applyDocMsg(html) {
    if (!html) return;
    if (brokeFree) { pendingDoc = html; render(); return; }
    SC.applyDoc(html); lastDoc = html;
    if (lastRef) setTimeout(function () { applyPos(lastRef, lastK); }, 30);
  }
  function applyPos(ref, k) {
    lastRef = ref; if (k !== undefined) lastK = k;
    if (ref && !brokeFree) { var el = document.getElementById(ref); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    clearHi(); if (k) { var w = qK(k); if (w) { w.classList.add('synchi'); if (!brokeFree) w.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
    render();
  }
  function applyPoint(k) { clearPt(); if (k) { var el = qK(k); if (el) el.classList.add('syncpt'); } }

  function onMsg(m) {
    if (!m || m.room !== SESSION || m.from === SELF) return;
    var d = m.data || {};
    if (d.t === 'hello') { if (role === 'present') { if (lastDoc) send({ t: 'doc', html: lastDoc }); if (lastRef) send({ t: 'pos', ref: lastRef, k: lastK }); } return; }
    if (role !== 'follow') { if (d.t === 'roster') { followers = d.followers; render(); } return; }
    if (d.t === 'doc') { if (ended) { ended = false; brokeFree = false; } applyDocMsg(d.html); return; }
    if (d.t === 'pos') { applyPos(d.ref, d.k); return; }
    if (d.t === 'point') { if (!brokeFree) applyPoint(d.k); return; }
    if (d.t === 'clear') { clearHi(); clearPt(); return; }
    if (d.t === 'end') { ended = true; brokeFree = true; clearHi(); clearPt(); render(); return; }
    if (d.t === 'roster') { followers = d.followers; render(); return; }
  }

  function makeTx(onopen) {
    if (RELAY) {
      try {
        var ws = new WebSocket(RELAY);
        ws.onopen = function () { status = 'live'; render(); send({ t: 'hello' }); if (onopen) onopen(); };
        ws.onclose = function () { status = 'offline'; render(); setTimeout(function () { makeTx(); }, 2500); };
        ws.onerror = function () { status = 'offline'; render(); };
        ws.onmessage = function (e) { try { onMsg(JSON.parse(e.data)); } catch (_) {} };
        tx = { send: function (o) { try { if (ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (_) {} } };
      } catch (e) { status = 'offline'; render(); }
    } else if ('BroadcastChannel' in window) {
      var bc = new BroadcastChannel('vvsync:' + SESSION);
      bc.onmessage = function (e) { onMsg(e.data); };
      tx = { send: function (o) { bc.postMessage(o); } };
      status = 'local'; render(); send({ t: 'hello' }); if (onopen) onopen();
    } else { status = 'no-bc'; render(); }
  }

  // ================= presenter emitters =================
  var scrollT = 0, ptTs = 0, lastPt = null;
  function onScroll() {
    if (role !== 'present' || stopped) return;
    clearTimeout(scrollT);
    scrollT = setTimeout(function () { var r = headingAtTop(); if (r && r !== lastRef) { lastRef = r; send({ t: 'pos', ref: r, k: null }); } }, 220);
  }
  function onMove(e) {
    if (role !== 'present' || stopped) return;
    var now = Date.now(); if (now - ptTs < 70) return; ptTs = now;
    var el = e.target && e.target.closest ? e.target.closest('.w[data-k]') : null;
    var k = el ? el.getAttribute('data-k') : null;
    if (k === lastPt) return; lastPt = k;
    applyPoint(k); send({ t: 'point', k: k });
  }
  function onClick(e) {
    if (role !== 'present' || stopped) return;
    var el = e.target && e.target.closest ? e.target.closest('.w[data-k]') : null;
    if (!el) { clearHi(); clearPt(); send({ t: 'clear' }); return; }
    if (el.classList.contains('synchi')) { clearHi(); clearPt(); send({ t: 'clear' }); return; }
    var k = el.getAttribute('data-k'); clearHi(); el.classList.add('synchi');
    lastK = k; send({ t: 'pos', ref: lastRef || headingAtTop(), k: k });
  }

  // ================= UI =================
  var elRole, elSid, elAct, elEnd, elLink, bar, startBtn, pop;
  function render() {
    if (!elRole) return;
    var dot = '<span class="vs-dot ' + (status === 'live' ? 'on' : status === 'local' ? 'local' : '') + '"></span>';
    if (role === 'present') elRole.innerHTML = dot + (stopped ? '⏹ ended' : '🎙 presenting') + (followers != null ? ' · 👥 ' + followers : '');
    else elRole.innerHTML = dot + (ended ? '⏹ session ended' : status === 'offline' ? '⚠ reconnecting…' : brokeFree ? '🔓 detached' : '👀 following');
    elSid.textContent = SESSION + (RELAY ? ' · relay' : ' · local');
    if (role === 'present') { elLink.style.display = ''; elAct.style.display = 'none'; elEnd.style.display = ''; elEnd.textContent = stopped ? '⇉ present again' : '⏹ end'; }
    else { elLink.style.display = 'none'; elEnd.style.display = 'none'; elAct.style.display = ''; elAct.textContent = brokeFree ? '🔄 re-sync' : '🔓 break free'; elAct.className = brokeFree ? 'vs-hot' : ''; }
  }

  function startPresenting() {
    SESSION = mkRoom(); role = 'present'; CAN_PRESENT = true;
    try { history.replaceState(null, '', shareURL(SESSION, true)); } catch (e) {}   // shareable URL, no reload
    if (startBtn) startBtn.hidden = true;
    bar.hidden = false; render();
    makeTx(function () { if (lastDoc) send({ t: 'doc', html: lastDoc }); });
    showShare(SESSION);
  }
  function showShare(room) {
    var s = absURL(shareURL(room, false));
    pop.innerHTML = '<b>Shared reading is live.</b><br>Send students this link:'
      + '<input id="vvss-link" readonly value="' + s.replace(/"/g, '&quot;') + '">'
      + '<div><button id="vvss-copy" type="button">📋 Copy student link</button> <button id="vvss-x" type="button">Close</button></div>';
    pop.style.display = 'block';
    var inp = document.getElementById('vvss-link'); if (inp) { inp.focus(); inp.select(); }
    document.getElementById('vvss-copy').onclick = function () { try { navigator.clipboard.writeText(s); this.textContent = 'copied ✓'; } catch (e) {} };
    document.getElementById('vvss-x').onclick = function () { pop.style.display = 'none'; };
  }

  // ================= init =================
  function init() {
    bar = document.getElementById('vvsync'); startBtn = document.getElementById('vvstart'); pop = document.getElementById('vvstart-pop');
    elRole = document.getElementById('vs-role'); elSid = document.getElementById('vs-sid');
    elAct = document.getElementById('vs-act'); elEnd = document.getElementById('vs-end'); elLink = document.getElementById('vs-link');
    // 📋 student link — works whether presenting via the ⇉ button (random room) or a static key URL
    elLink.onclick = function () { if (role !== 'present') return; if (pop.style.display === 'block') pop.style.display = 'none'; else showShare(SESSION); };

    // presenter emitters (harmless for followers — gated on role inside)
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('click', onClick);
    // Esc clears
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (role === 'present' && !stopped) { clearHi(); clearPt(); send({ t: 'clear' }); } else { clearHi(); clearPt(); } } });
    // follower break-free / re-sync
    ['wheel', 'touchmove'].forEach(function (ev) { window.addEventListener(ev, function () { if (role === 'follow' && !brokeFree) { brokeFree = true; render(); } }, { passive: true }); });

    // presenter: broadcast a freshly-loaded doc + ToC clicks
    SC.onDocLoaded = function (html) { lastDoc = html; if (role === 'present' && !stopped) { send({ t: 'doc', html: html }); var r = headingAtTop(); if (r) { lastRef = r; send({ t: 'pos', ref: r, k: null }); } } };
    SC.onNav = function (ref) { if (role === 'present' && !stopped) { lastRef = ref; send({ t: 'pos', ref: ref, k: null }); } };

    elAct.onclick = function () {   // follower break-free / re-sync
      if (role !== 'follow') return;
      if (brokeFree) { brokeFree = false; if (pendingDoc) { SC.applyDoc(pendingDoc); lastDoc = pendingDoc; pendingDoc = null; } if (lastRef) applyPos(lastRef, lastK); }
      else brokeFree = true;
      render();
    };
    elEnd.onclick = function () {   // presenter end / present-again
      if (role !== 'present') return;
      if (!stopped) { stopped = true; send({ t: 'end' }); clearHi(); clearPt(); }
      else { stopped = false; if (lastDoc) send({ t: 'doc', html: lastDoc }); var r = headingAtTop(); if (r) { lastRef = r; send({ t: 'pos', ref: r, k: null }); } }
      render();
    };

    if (SESSION) {                                 // opened with a session in the URL
      bar.hidden = false; render();
      if (role === 'follow') { document.body.classList.add('vv-follower'); SC.hideLoadControls(); SC.setWaiting('Waiting for the presenter to share a document…'); }
      makeTx(function () { if (role === 'present' && lastDoc) send({ t: 'doc', html: lastDoc }); });
      // static-key presenter (opened a ?session=…&role=present URL directly): auto-show the student link once
      if (role === 'present') setTimeout(function () { showShare(SESSION); }, 500);
    } else {                                        // no session → offer the starter
      startBtn.hidden = false;
      startBtn.onclick = startPresenting;
    }
  }

  // hook ToC clicks (buildToc calls SC.onNav — set above)

  // trigger mount now that every state var + function above is defined
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
