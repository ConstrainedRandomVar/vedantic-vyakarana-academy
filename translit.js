'use strict';
// Shared script-transliteration for the STATIC reading views (मूलम् padārtha + Śāṅkara-bhāṣya +
// unified pages). Shipped ONCE as a fixed-name asset (SW-cached), referenced by every reading page via
// <script src="translit.js">, so the footprint is ~one small file regardless of page count. Zero
// dependency: a self-contained Devanāgarī→IAST transliterator (no Sanscript/npm/CDN) — keeps the app's
// fully-offline architecture. Adds a देव | IAST toggle next to the ◐ theme button; when IAST is chosen,
// transliterates every Devanāgarī text node on the page (verse, bhāṣya, zone labels, nav options, and —
// via a MutationObserver — the hover tooltips). Choice persists in localStorage['vv_script'], shared
// with the SPA settings gear. Reading pages only, never the quiz. Adding a script later = one more map
// table below (~1 KB); the engine is shared. (Harsha, 2026-08-25.)
(function () {
  // ---- Devanāgarī → IAST ----
  var V = { 'अ':'a','आ':'ā','इ':'i','ई':'ī','उ':'u','ऊ':'ū','ऋ':'ṛ','ॠ':'ṝ','ऌ':'ḷ','ॡ':'ḹ','ए':'e','ऐ':'ai','ओ':'o','औ':'au','ऎ':'e','ऒ':'o','ऑ':'ô','ऍ':'ê','ॐ':'oṃ' };
  var M = { 'ा':'ā','ि':'i','ी':'ī','ु':'u','ू':'ū','ृ':'ṛ','ॄ':'ṝ','ॢ':'ḷ','ॣ':'ḹ','े':'e','ै':'ai','ो':'o','ौ':'au','ॆ':'e','ॊ':'o','ॉ':'ô','ॅ':'ê' };
  var C = { 'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ṅ','च':'c','छ':'ch','ज':'j','झ':'jh','ञ':'ñ','ट':'ṭ','ठ':'ṭh','ड':'ḍ','ढ':'ḍh','ण':'ṇ','त':'t','थ':'th','द':'d','ध':'dh','न':'n','प':'p','फ':'ph','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'v','श':'ś','ष':'ṣ','स':'s','ह':'h','ळ':'ḻ','क़':'q','ख़':'ḵẖ','ग़':'ġ','ज़':'z','ड़':'ṛ','ढ़':'ṛh','फ़':'f','य़':'ẏ' };
  var SGN = { 'ं':'ṃ','ः':'ḥ','ँ':'m̐','ऽ':"'" };
  var DIG = { '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9' };
  var VIR = '्';
  var DEV = /[ऀ-ॿ]/; // any Devanāgarī codepoint
  function d2i(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (C[ch] !== undefined) { o += C[ch]; var nx = s[i + 1]; if (nx === VIR) { i++; } else if (M[nx] !== undefined) { o += M[nx]; i++; } else { o += 'a'; } }
      else if (V[ch] !== undefined) { o += V[ch]; }
      else if (SGN[ch] !== undefined) { o += SGN[ch]; }
      else if (DIG[ch] !== undefined) { o += DIG[ch]; }
      else if (ch === VIR) { /* stray virāma */ }
      else { o += ch; }
    }
    return o;
  }

  // ---- reversible DOM transliteration ----
  var KEY = 'vv_script';
  var mode = (localStorage.getItem(KEY) === 'iast') ? 'iast' : 'dev';
  var orig = new WeakMap(); var seen = []; var obs = null, applying = false;
  function isText(n) { return n && n.nodeType === 3 && n.nodeValue && DEV.test(n.nodeValue); }
  function walk(root) { var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, out = []; while ((n = w.nextNode())) { if (DEV.test(n.nodeValue || '')) out.push(n); } return out; }
  function toIast(n) { if (!orig.has(n)) { orig.set(n, n.nodeValue); seen.push(n); } var t = d2i(orig.get(n)); if (n.nodeValue !== t) n.nodeValue = t; }
  function restore() { for (var i = 0; i < seen.length; i++) { var n = seen[i]; if (orig.has(n) && n.nodeValue !== orig.get(n)) n.nodeValue = orig.get(n); } }
  function applyAll() { applying = true; var ns = walk(document.body); for (var i = 0; i < ns.length; i++) toIast(ns[i]); applying = false; }
  function startObs() {
    if (obs) return;
    obs = new MutationObserver(function (muts) {
      if (mode !== 'iast' || applying) return; applying = true;
      for (var i = 0; i < muts.length; i++) { var m = muts[i];
        if (m.type === 'characterData') { if (isText(m.target)) toIast(m.target); }
        else { for (var j = 0; j < m.addedNodes.length; j++) { var a = m.addedNodes[j]; if (isText(a)) toIast(a); else if (a.nodeType === 1) { var ns = walk(a); for (var k = 0; k < ns.length; k++) toIast(ns[k]); } } }
      }
      applying = false;
    });
    obs.observe(document.body, { childList: true, characterData: true, subtree: true });
  }
  function stopObs() { if (obs) { obs.disconnect(); obs = null; } }
  function setMode(m) {
    mode = m; localStorage.setItem(KEY, m);
    if (m === 'iast') { applyAll(); startObs(); } else { stopObs(); restore(); }
    var b = document.getElementById('sp-dev'), c = document.getElementById('sp-iast');
    if (b && c) { b.className = (m === 'dev') ? 'on' : ''; c.className = (m === 'iast') ? 'on' : ''; }
  }

  // ---- picker UI (inserted before the ◐ theme button) ----
  function mount() {
    var st = document.createElement('style');
    st.textContent = '#scriptpick{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-right:8px;vertical-align:middle}#scriptpick button{border:0;background:var(--card);color:var(--muted);padding:5px 9px;cursor:pointer;font:inherit;font-size:12px;border-radius:0;float:none}#scriptpick button.on{background:var(--ink);color:var(--bg)}';
    document.head.appendChild(st);
    var pick = document.createElement('span'); pick.id = 'scriptpick';
    pick.innerHTML = '<button id="sp-dev" title="Devanāgarī">देव</button><button id="sp-iast" title="IAST (Latin)">IAST</button>';
    var tog = document.getElementById('tog');
    if (tog && tog.parentNode) tog.parentNode.insertBefore(pick, tog); else document.body.insertBefore(pick, document.body.firstChild);
    document.getElementById('sp-dev').addEventListener('click', function () { setMode('dev'); });
    document.getElementById('sp-iast').addEventListener('click', function () { setMode('iast'); });
    setTimeout(function () { setMode(mode); }, 0); // deferred so nav.js has populated its dropdowns
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
