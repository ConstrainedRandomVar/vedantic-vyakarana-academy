/* In-text search (2026-10-13) — sandhi-tolerant search within the text being read, on every ग्रन्थाः page.
 * 🔍 (next to ☆ 📝) or "/" → a field under the reading bar; scope = THIS text (every chapter file, every layer the view
 * shows); "all texts ↗" opens the full search tool. Engine = the search site's own: lib/sanskrit-search.js over this text's
 * per-text index shards; "this text" = the hits whose ग्रन्थाः link points at this reading view (lib/sv-links.js — the SAME
 * map + ref resolution the search tool uses, so the two can never disagree). Same-chapter hit → sync.js's __vvLand in
 * place; other chapter → navigate with ?hl=&side=#v-ref (+ vvsq/vvsi to reopen this bar). Loaded by vv-reader.js.
 * Data: ../prasthanatrayi-search/{search-meta.json, lib/*, shards/*} (published by searchtool/sync_search.js).
 * Public profile: layers the profile hides (SD ṭīkā while `sad-tika` is hidden) are never searched. */
(function () {
  'use strict';
  var m = location.pathname.match(/reading-([a-z-]+?)(?:-(\d+))?\.html$/); if (!m) return;
  var OUT = m[1], HERE = location.pathname.split('/').pop();
  var SEARCH = '../prasthanatrayi-search/';

  var L = null;   // window.SVLinks (lib/sv-links.js, from the search site)
  var TEXTS = {};
  // public profile: never search a layer the profile hides (CLAUDE.md #9f)
  var HIDE = (window.VV_PROFILE && window.VV_PROFILE.hide) || [];
  function hidden(b) {
    if (HIDE.indexOf('sad-tika') >= 0 && b.t === 'saddarshanam' && b.c.section !== 'mula') return true;
    // the Gītā view shows the advaitaśārada Ānandagiri (anandagiri-gita, complete); bg-bhashya's own Ānandagiri section is an
    // older digitization of the same ṭīkā — in-text it would list every ṭīkā passage twice (the full tool keeps both)
    return b.t === 'bg-bhashya' && b.c.section === 'anandagiri';
  }
  // ---- loading ----
  var SS = null, B = null, REFIDX = null, loading = null;
  function script(src) { return new Promise(function (ok, ko) { var e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = ko; document.head.appendChild(e); }); }
  function load() {
    if (loading) return loading;
    loading = fetch(SEARCH + 'search-meta.json', {cache: 'no-cache'}).then(function (r) { if (!r.ok) throw new Error('search-meta'); return r.json(); })
      .then(function (meta) {
        var ids = L.idsFor(OUT);
        var shards = meta.shards.filter(function (s) { var id = s.f.replace(/^shards\//, '').replace(/\.[0-9a-f]{10}\.json$/, ''); return ids.indexOf(id) >= 0; });
        return Promise.all([script(SEARCH + 'lib/sanskrit-search.js'), script(SEARCH + meta.refidx)].concat(shards.map(function (s) {
          return fetch(SEARCH + s.f).then(function (r) { if (!r.ok) throw new Error(s.f); return r.json(); });
        })));
      }).then(function (res) {
        SS = window.SanskritSearch; REFIDX = (window.SVADHYAYA_REFIDX || {})[OUT] || {}; B = [];
        res.slice(2).forEach(function (d) { for (var k in d.texts) TEXTS[k] = d.texts[k];
          d.blocks.forEach(function (b) {
            if (hidden(b)) return;
            var at = L.locate(b, TEXTS, window.SVADHYAYA_REFIDX); if (!at || at.out !== OUT) return;
            b._ref = at.ref; b._file = at.file; b._exact = at.exact; b._near = at.chap ? at.near : null; b._side = at.side; b._layer = L.layerOf(b); B.push(b);
          }); });
        var fileIdx = {}; Object.keys(REFIDX).forEach(function (r, i) { if (!(REFIDX[r] in fileIdx)) fileIdx[REFIDX[r]] = i; });
        var rk = function (r) { return r.split(/[.·\s]+/).map(function (x) { return /^\d+$/.test(x) ? ('0000' + x).slice(-4) : x; }).join('.'); };
        B.forEach(function (b) { b._sort = ('000' + (fileIdx[b._file] || 0)).slice(-4) + '|' + rk(b._ref) + '|' + L.LAYER_ORDER.indexOf(b._layer); });
        return B;
      });
    return loading;
  }

  // ---- UI ----
  var CSS = '#vvs-btn{background:none;border:0;cursor:pointer;font-size:17px;padding:2px 8px;line-height:1}' +
    '#vvs{position:sticky;top:var(--vvs-top,44px);z-index:60;display:none;background:var(--bg,#fff);border-bottom:1px solid #d6d3d1;box-shadow:0 6px 18px rgba(0,0,0,.08);font:14px system-ui,sans-serif}' +
    ':root[data-theme=dark] #vvs{background:#1c1917;border-color:#44403c;color:#e7e5e4}' +
    '#vvs .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 12px;max-width:1100px;margin:0 auto}' +
    '#vvs input[type=search]{flex:1 1 260px;font:17px "Noto Serif Devanagari",serif;padding:6px 10px;border:1px solid #a8a29e;border-radius:6px;background:inherit;color:inherit}' +
    '#vvs .prev{font:13px "Noto Serif Devanagari",serif;color:#78716c;min-width:0}' +
    '#vvs .chip{border:1px solid #d6d3d1;border-radius:12px;padding:1px 9px;cursor:pointer;font:13px "Noto Serif Devanagari",serif;background:none;color:inherit}' +
    '#vvs .chip.on{background:#d97706;border-color:#d97706;color:#fff}' +
    '#vvs .scope label{margin-right:8px;cursor:pointer}#vvs a.all{color:#0e7490;text-decoration:none}' +
    ':root[data-theme=dark] #vvs a.all{color:#67d3e8}' +
    '#vvs .st{color:#78716c;font-size:13px}#vvs .nav button{font-size:13px;border:1px solid #d6d3d1;background:none;color:inherit;border-radius:5px;cursor:pointer;padding:0 7px}' +
    '#vvs .res{max-height:42vh;overflow:auto;border-top:1px solid #e7e5e4;padding:4px 12px 8px;max-width:1100px;margin:0 auto}' +
    ':root[data-theme=dark] #vvs .res{border-color:#44403c}' +
    '#vvs .h{display:flex;gap:10px;padding:5px 6px;border-radius:5px;cursor:pointer;align-items:baseline}#vvs .h:hover,#vvs .h.cur{background:rgba(217,119,6,.12)}' +
    '#vvs .h .r{font:12px system-ui;color:#78716c;white-space:nowrap;min-width:92px}#vvs .h .l{font:12px "Noto Serif Devanagari",serif;color:#a16207;white-space:nowrap;min-width:84px}' +
    '#vvs .h .s{font:15px "Noto Serif Devanagari",serif}#vvs .h mark{background:#fde68a;color:inherit;border-radius:2px}' +
    ':root[data-theme=dark] #vvs .h mark{background:#8a7414;color:#fff}#vvs .h .o{font:11px system-ui;color:#a8a29e}' +
    '@media(max-width:640px){#vvs.slim .row2{display:none}#vvs.slim .scope{display:none}}' +
    ':root[data-theme=dark] .svhl{background:#8a7414!important;color:#fff!important;box-shadow:0 0 0 2px #8a7414!important}';
  var ARRIVE = null, REVEAL = false;   // arrived from another chapter's hit #n: restore the slim bar at that position
  var box, inp, prev, st, res, chipsEl, possibleEl, HITS = [], cur = -1, layersOn = {}, timer = null;
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in attrs || {}) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function build() {
    document.head.appendChild(el('style', {}, CSS));
    var nav = document.getElementById('reading-nav'); if (!nav) return;   // (pages without the bar — e.g. a single monograph — get no search)
    var btn = el('button', {id: 'vvs-btn', title: 'Smart sandhi-aware search — this text  ( / )', 'aria-label': 'search this text'}, '🔍');
    var tl = document.querySelector('.vvr-tools') || nav.querySelector('.rn-tools') || nav, dict = tl.querySelector('.vvr-dict');
    if (dict) tl.insertBefore(btn, dict); else tl.appendChild(btn);   // bar order: ☆ 📝 🔍 📖 टीका ⇕ ⚙ (2026-10-21)
    box = el('div', {id: 'vvs'});
    box.innerHTML = '<div class="row"><input type="search" placeholder="' + (matchMedia('(max-width:640px)').matches ? 'Sandhi-aware search · आत्मा एव' : 'Smart sandhi-aware search — e.g. आत्मा एव (finds आत्मैव)') + '" autocomplete="off">' +
      '<span class="scope"><label><input type="radio" name="vvs-sc" value="text" checked> this text</label>' +
      '<label><input type="radio" name="vvs-sc" value="all"> all texts ↗</label></span>' +
      '<span class="nav"><button data-d="-1" title="previous hit (Shift+Enter)">‹</button> <span class="pos"></span> <button data-d="1" title="next hit (Enter)">›</button> <button data-x="list" title="show / hide the hit list">≡ list</button></span>' +
      '<button class="chip" data-x="close" title="close (Esc)">✕</button></div>' +
      '<div class="row row2" style="padding-top:0"><span class="prev"></span><span class="chips"></span>' +
      '<label class="st"><input type="checkbox" class="poss" checked> possible matches</label><span class="st msg"></span></div><div class="res"></div>';
    nav.insertAdjacentElement('afterend', box);
    inp = box.querySelector('input[type=search]'); prev = box.querySelector('.prev'); st = box.querySelector('.msg'); res = box.querySelector('.res');
    chipsEl = box.querySelector('.chips'); possibleEl = box.querySelector('.poss');
    var top = nav.getBoundingClientRect().height; box.style.setProperty('--vvs-top', top + 'px');
    btn.onclick = function () { toggle(); };
    box.querySelector('[data-x=close]').onclick = function () { toggle(false); };
    box.querySelector('[data-x=list]').onclick = function () { listShown(res.style.display === 'none'); };
    inp.addEventListener('input', function () { prev.textContent = SS ? SS.toDeva(inp.value) : ''; clearTimeout(timer); timer = setTimeout(run, 250); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') toggle(false); });
    possibleEl.onchange = run;
    box.querySelectorAll('.nav button').forEach(function (b) { b.onclick = function () { step(+b.dataset.d); }; });
    box.querySelectorAll('input[name=vvs-sc]').forEach(function (r) { r.onchange = function () {
      if (r.value === 'all' && r.checked) { var su = SEARCH + (inp.value.trim() ? '?q=' + encodeURIComponent(inp.value.trim()) : ''); if (window.VVStore && VVStore.openTab) VVStore.openTab(su, VVStore.SEARCH_TAB); else window.open(su, 'vv-search'); box.querySelector('input[value=text]').checked = true; } }; });
    res.addEventListener('click', function (e) { var h = e.target.closest('.h'); if (h) go(+h.dataset.i); });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); toggle(true); }
    });
    // arriving from an in-text hit on another chapter page: reopen the panel with the same query
    var qs0 = new URLSearchParams(location.search), q0 = qs0.get('vvsq');
    if (q0) { toggle(true); inp.value = q0; ARRIVE = +qs0.get('vvsi'); }
  }
  function toggle(on) {
    var show = on == null ? box.style.display !== 'block' : on;
    box.style.display = show ? 'block' : 'none';
    if (show) { inp.focus(); inp.select(); if (!B) { st.textContent = 'loading this text’s index…'; load().then(function () { st.textContent = B.length.toLocaleString() + ' passages indexed'; if (inp.value.trim()) run();
          if (ARRIVE != null && HITS[ARRIVE]) { cur = ARRIVE; ARRIVE = null; listShown(false); box.querySelector('.pos').textContent = (cur + 1) + '/' + HITS.length; } }, function (e) { st.textContent = '⚠ search unavailable (' + e.message + ')'; }); } }
  }
  function paintChips(layers) {
    chipsEl.innerHTML = L.LAYER_ORDER.filter(function (l) { return layers[l]; }).map(function (l) {
      if (!(l in layersOn)) layersOn[l] = true;
      return '<button class="chip' + (layersOn[l] ? ' on' : '') + '" data-l="' + l + '">' + l + ' <span class="o">' + layers[l] + '</span></button>'; }).join(' ');
    chipsEl.querySelectorAll('.chip').forEach(function (c) { c.onclick = function () { layersOn[c.dataset.l] = !layersOn[c.dataset.l]; run(); }; });
  }
  function run() {
    if (!B) return; var raw = inp.value.trim(); HITS = []; cur = -1; listShown(true);
    if (!raw) { res.innerHTML = ''; st.textContent = B.length.toLocaleString() + ' passages indexed'; chipsEl.innerHTML = ''; box.querySelector('.pos').textContent = ''; return; }
    var ex = SS.expandQuery(raw, 'sandhi'), exW = possibleEl.checked ? SS.expandQuery(raw, 'sandhi', true) : null;
    if (!ex.qn) return;
    var counts = {}, precise = [], poss = [];
    B.forEach(function (b) {
      if (b._n === undefined) { b._n = SS.normalize(b.s); b._nc = b._n.replace(/ /g, ''); }   // _nc ≡ _n minus spaces (perf 2026-10-17)
      var p = SS.matches(b, ex), w = !p && exW && SS.matches(b, exW);
      if (!p && !w) return;
      counts[b._layer] = (counts[b._layer] || 0) + 1;
      if (layersOn[b._layer] === false) return;
      (p ? precise : poss).push(b);
    });
    var bySort = function (a, b) { return a._sort < b._sort ? -1 : a._sort > b._sort ? 1 : 0; };
    precise.sort(bySort); poss.sort(bySort);
    HITS = precise.map(function (b) { return {b: b, ex: ex, p: false}; }).concat(poss.map(function (b) { return {b: b, ex: exW, p: true}; }));
    paintChips(counts);
    st.textContent = precise.length + ' hit' + (precise.length === 1 ? '' : 's') + (poss.length ? ' + ' + poss.length + ' possible' : '');
    res.innerHTML = HITS.slice(0, 400).map(function (h, i) {
      var raw2 = SS.snippet(h.b, h.ex), sn = esc(raw2).split(SS.M1).join('<mark>').split(SS.M2).join('</mark>');
      var i1 = raw2.indexOf(SS.M1), i2 = raw2.indexOf(SS.M2); h.mt = (i1 >= 0 && i2 > i1) ? raw2.slice(i1 + 1, i2) : raw.trim();
      return '<div class="h" data-i="' + i + '"><span class="r">' + esc(h.b._ref) + (h.b._file === HERE ? '' : ' ↗') + '</span><span class="l">' + h.b._layer +
        (h.p ? ' <span class="o">possible</span>' : '') + '</span><span class="s">' + sn + '</span></div>'; }).join('') +
      (HITS.length > 400 ? '<div class="st">… first 400 shown</div>' : '');
    box.querySelector('.pos').textContent = HITS.length ? '0/' + HITS.length : '';
  }
  function listShown(on) { res.style.display = on ? '' : 'none'; box.classList.toggle('slim', !on); }
  // first Enter → the first hit in the chapter being read (not chapter 1); then wrap through the whole text in reading order
  function step(d) { if (!HITS.length) return;
    if (cur < 0) { var j = -1; for (var i = 0; i < HITS.length && j < 0; i++) if (HITS[i].b._file === HERE) j = i; go(j >= 0 ? j : 0); return; }
    go((cur + d + HITS.length) % HITS.length); }
  function go(i) {
    var h = HITS[i]; if (!h) return; cur = i; listShown(false);   // collapse to the slim bar so the landed passage is visible
    res.querySelectorAll('.h.cur').forEach(function (x) { x.classList.remove('cur'); });
    var row = res.querySelector('.h[data-i="' + i + '"]'); if (row) { row.classList.add('cur'); row.scrollIntoView({block: 'nearest'}); }
    box.querySelector('.pos').textContent = (i + 1) + '/' + HITS.length;
    var b = h.b, side = b._side;
    if (b._file !== HERE) {   // another chapter page: let sync.js's ?hl= highlighter land it; vvsq reopens this panel there
      location.href = b._file + '?hl=' + encodeURIComponent(h.mt) + (side ? '&side=' + side + (b.c.tk ? '&vk=' + encodeURIComponent(b.c.tk) : '') : '') +
        (b._layer !== 'मूलम्' ? '&vw=1' : '') +
        '&vvsq=' + encodeURIComponent(inp.value.trim()) + '&vvsi=' + i + (b._exact ? '#v-' + encodeURIComponent(b._ref) : b._near ? '&vn=' + encodeURIComponent(b._near) + '#v-intro' : '');
      return;
    }
    REVEAL = b._layer !== 'मूलम्';   // a commentary hit: show the commentary if the reader is in mūla-only mode
    highlightHere(h.mt, side, b.c.tk, b._exact ? 'v-' + b._ref : b._near ? 'v-intro' : null, b._near && !b._exact ? 'v-' + b._near : '');
  }
  // ---- in-place landing: sync.js's own ?hl= highlighter (window.__vvLand), scrolled to land BELOW the nav + this bar ----
  function highlightHere(term, side, vk, vid, vn) {
    if (!window.__vvLand) return;
    window.__vvLand(term, {side: side || null, vk: vk || null, id: vid || '', vn: vn || '', reveal: REVEAL, scrollTo: function (hit) {
      var y = hit.getBoundingClientRect().top + scrollY - box.getBoundingClientRect().bottom - 70; scrollTo({top: Math.max(0, y), behavior: 'smooth'}); }});
  }
  function boot() {
    if (!window.__vvLand && !document.querySelector('script[data-vvland]')) {   // pages without sync.js (Vicārasāgara)
      var vl = document.createElement('script'); vl.src = 'vv-landing.js'; vl.setAttribute('data-vvland', '1'); document.head.appendChild(vl); }
    script(SEARCH + 'lib/sv-links.js').then(function () { L = window.SVLinks; if (L && L.idsFor(OUT).length) build(); }, function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
