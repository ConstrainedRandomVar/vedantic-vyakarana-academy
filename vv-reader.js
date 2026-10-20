// vv-reader.js — personal reading tools on every reading page (Harsha 2026-10-11, feedback #6 #7 #9):
//   ☆  bookmark the verse you are at (pinned bar) · ☆ bookmark a selected passage (floating button on selection)
//   📝 study-notes drawer, one note per verse, auto-saved; verses with a note get a 📝 marker
//   ⇕  fold-out controls for collapsed-by-default commentary layers (defaults come from the dashboard ⚙)
//   legend / contents panels remember whether the reader left them open
// Data lives in VVStore (vv-store.js, loaded just before this file); the library page (library.html) lists it all.
// Purely additive: it never edits the text, never re-orders anything, and does nothing if VVStore is missing.
(function () {
  'use strict';
  var S = window.VVStore;
  if (!S || window.__vvReader) return;
  window.__vvReader = true;

  // ---- commentary markers (⚙ Settings · "Commentary markers"): HIDDEN by default since 2026-10-21 (Harsha, feedback #5) —
  // '1' = shown; a reader's explicit earlier choice ('0'/'1') is kept. Applied at once — before the page settles — as an <html>
  // class; the legend keeps its swatches (with a "⚙ to show" note while off). vv-settings.js re-runs it live (__vvApplyPills).
  function applyPills() {
    var P = { vv_pill_praman: ['praman', '.prb'], vv_pill_abhyu: ['abhyu', '.dm-conc::after'], vv_pill_maha: ['maha', '.maha-mark'] }, css = '';
    var old = document.getElementById('vvr-pills'); if (old) old.remove();
    for (var k in P) {
      var on = false; try { on = localStorage.getItem(k) === '1'; } catch (e) {}
      document.documentElement.classList.toggle('vv-nopill-' + P[k][0], !on);
      if (on) continue;
      var sel = P[k][1].split('::'), base = sel[0] + ':not(.legend *)' + (sel[1] ? '::' + sel[1] : '');
      css += 'html.vv-nopill-' + P[k][0] + ' ' + base + '{' + (sel[1] ? 'content:none!important' : 'display:none!important') + '}';
    }
    if (css) { var st = document.createElement('style'); st.id = 'vvr-pills'; st.textContent = css; (document.head || document.documentElement).appendChild(st); }
    if (window.__vvLegendNotes) window.__vvLegendNotes();
  }
  applyPills();
  window.__vvApplyPills = applyPills;

  // ---- reading text size (⚙ Settings · "Text size", Harsha 2026-10-21 #3) — scales ALL page text, not the layout: every px
  // font-size in the page's styles (and inline style attributes) becomes calc(Npx * var(--vvfs)), and rem/em follow the root.
  // NOT CSS zoom: zoom also scales the coordinates the word cards / laser / bookmark button are placed with (measured
  // 2026-10-21: a card landed ~95px off at zoom 1.2); font scaling keeps every position measurement live and correct.
  var fsReady = false, fsBase = 0;
  function scaleDecl(st) { if (st && st.fontSize && /^[\d.]+px$/.test(st.fontSize)) st.fontSize = 'calc(' + st.fontSize + ' * var(--vvfs, 1))'; }
  function scaleRules(list) { [].forEach.call(list || [], function (r) { if (r.style) scaleDecl(r.style); if (r.cssRules) scaleRules(r.cssRules); }); }
  function textScale(s) {
    s = +s || 1; var root = document.documentElement;
    if (s !== 1 && !fsReady) {
      fsReady = true; fsBase = parseFloat(getComputedStyle(root).fontSize) || 16;
      [].forEach.call(document.styleSheets, function (sh) { try { scaleRules(sh.cssRules); } catch (e) {} });   // cross-origin sheets: skipped
      [].forEach.call(document.querySelectorAll('[style*="font-size"]'), function (e) { scaleDecl(e.style); });
      new MutationObserver(function (ms) { ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) {   // styles added later (cards, panels)
        if (n.tagName === 'STYLE' && n.sheet) { try { scaleRules(n.sheet.cssRules); } catch (e) {} } }); }); }).observe(document.head, { childList: true });
    }
    root.style.setProperty('--vvfs', s);
    if (fsReady) root.style.fontSize = s === 1 ? '' : (fsBase * s) + 'px';
  }
  window.__vvTextScale = textScale;
  function savedScale() { var v = 1; try { v = parseFloat(localStorage.getItem('vv_text_size')) || 1; } catch (e) {} return v; }

  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function el(tag, attrs, html) { var e = document.createElement(tag); for (var k in (attrs || {})) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }

  var PAGE = (location.pathname.split('/').pop() || 'index.html');
  function textName() {
    var h = document.querySelector('h1');
    var t = (h && h.textContent.trim()) || document.title;
    return t.split(/\s[—–|·]\s/)[0].replace(/\s+/g, ' ').trim().slice(0, 60);   // "केनोपनिषद् · खण्डः 1 — …" → "केनोपनिषद्"
  }

  // ---- where am I? the last visible verse anchor (#v-<ref>) whose top is above the bottom of the sticky bar ----
  function anchors() {
    return [].slice.call(document.querySelectorAll('[id^="v-"]')).filter(function (a) { return a.offsetParent !== null; });
  }
  function barBottom() { var b = document.getElementById('reading-nav'); if (!b) return 0; var r = b.getBoundingClientRect(); return Math.max(0, r.bottom); }
  function currentRef() {
    var y = barBottom() + 12, list = anchors(), pick = null;
    for (var i = 0; i < list.length; i++) { if (list[i].getBoundingClientRect().top <= y) pick = list[i]; else break; }
    pick = pick || list[0];
    return pick ? pick.id.slice(2) : '';
  }
  function anchorOf(ref) { var a = document.getElementById('v-' + ref); return a; }
  function refOfNode(node) {   // the verse a DOM node belongs to: nearest #v- ancestor, else the last #v- before it
    var n = node && node.nodeType === 3 ? node.parentNode : node;
    var a = n && n.closest ? n.closest('[id^="v-"]') : null;
    if (a) return a.id.slice(2);
    var list = anchors(), pick = null;
    for (var i = 0; i < list.length; i++) { if (list[i].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) pick = list[i]; else break; }
    return pick ? pick.id.slice(2) : currentRef();
  }
  function verseExcerpt(ref) {   // first ~200 chars of the verse's own text (the ref label itself stripped)
    var a = anchorOf(ref); if (!a) return '';
    var m = a.querySelector('.vjoin, .moola, .vpada, .sent, .mula');   // the verse/sentence text itself, in page order of preference
    if (m) return (m.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    var c = a.cloneNode(true);
    [].forEach.call(c.querySelectorAll('.rf, .refbadge, .zlabel, .mantra-hd, .vvr-nb, script, style, details, .trans-layer, .bhashya-layer, button'), function (x) { x.remove(); });
    return (c.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  function verseUrl(ref) { return PAGE + (ref ? '#v-' + ref : ''); }

  // ---- styles (page tokens with fallbacks: academy pages use --card/--line, VS uses --bg/--rule) ----
  var CSS = ''
    + '.vvr-tools{display:inline-flex;gap:4px;align-items:center;margin-left:auto}'
    + '#reading-nav .rn-picker+.vvr-tools{margin-left:6px}'
    + '.vvr-btn{font:inherit;font-size:15px;line-height:1;border:1px solid var(--line,var(--rule,#ddd));background:var(--card,var(--bg,#fff));color:var(--ink,#222);border-radius:8px;padding:4px 7px;cursor:pointer}'
    + '.vvr-btn:hover{border-color:var(--brand,#d97706)}.vvr-btn.on{color:var(--brand,#d97706)}'
    + '.vvr-float{position:fixed;right:14px;bottom:14px;z-index:900;display:flex;gap:6px;background:var(--card,var(--bg,#fff));border:1px solid var(--line,var(--rule,#ddd));border-radius:12px;padding:6px;box-shadow:0 2px 10px rgba(0,0,0,.12)}'
    + '.vvr-pop{position:absolute;z-index:1001;min-width:230px;max-width:min(340px,92vw);background:var(--card,var(--bg,#fff));color:var(--ink,#222);border:1px solid var(--line,var(--rule,#ddd));border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:10px 12px;font:14px/1.45 system-ui,sans-serif}'
    + '.vvr-pop h4{margin:0 0 6px;font-size:13px;color:var(--muted,#6b6455);font-weight:600}'
    + '.vvr-pop label{display:flex;gap:6px;align-items:center;margin:3px 0;cursor:pointer}'
    + '.vvr-pop .row{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center}'
    + '.vvr-pop input[type=text]{flex:1;min-width:120px;font:inherit;padding:4px 6px;border:1px solid var(--line,var(--rule,#ccc));border-radius:6px;background:transparent;color:inherit}'
    + '.vvr-pop a,.vvr-drawer a{color:var(--brand,#b45309)}'
    + '.vvr-pop .fold{display:grid;grid-template-columns:1fr auto auto;gap:4px 6px;align-items:center;margin:4px 0}'
    + '.vvr-pop .fold small{display:block;color:var(--muted,#6b6455);font-size:11.5px}'
    + '.vvr-mini{font:12.5px system-ui,sans-serif;border:1px solid var(--line,var(--rule,#ccc));background:transparent;color:inherit;border-radius:6px;padding:3px 7px;cursor:pointer}'
    + '.vvr-mini:hover{border-color:var(--brand,#d97706)}'
    + '.vvr-sel{position:absolute;z-index:1000;font:13px system-ui,sans-serif;background:var(--brand,#d97706);color:#fff;border:0;border-radius:8px;padding:4px 9px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.25)}'
    + '.vvr-drawer{position:fixed;top:0;right:0;height:100%;width:min(420px,94vw);z-index:1002;background:var(--card,var(--bg,#fff));color:var(--ink,#222);border-left:1px solid var(--line,var(--rule,#ddd));box-shadow:-6px 0 24px rgba(0,0,0,.15);display:flex;flex-direction:column;font:14px/1.5 system-ui,sans-serif;transform:translateX(105%);transition:transform .18s ease}'
    + '.vvr-drawer.open{transform:none}'
    + '.vvr-drawer header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--line,var(--rule,#ddd))}'
    + '.vvr-drawer header h3{margin:0;font-size:16px;flex:1;color:var(--brand,#b45309)}'
    + '.vvr-drawer .ref{padding:8px 14px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap}'
    + '.vvr-drawer .ref b{font-family:"Noto Serif Devanagari",serif;font-size:15px}'
    + '.vvr-drawer textarea{margin:8px 14px;flex:1;min-height:180px;resize:none;font:15px/1.55 "Noto Serif Devanagari",system-ui,serif;padding:10px;border:1px solid var(--line,var(--rule,#ccc));border-radius:8px;background:var(--bg,#fffdf8);color:inherit}'
    + '.vvr-drawer .saved{padding:0 14px;color:var(--muted,#6b6455);font-size:12px;min-height:16px}'
    + '.vvr-drawer .others{padding:6px 14px;max-height:30vh;overflow:auto;border-top:1px solid var(--line,var(--rule,#ddd))}'
    + '.vvr-drawer .others h4{margin:4px 0;font-size:13px;color:var(--muted,#6b6455)}'
    + '.vvr-drawer .others a{display:block;text-decoration:none;padding:3px 0;color:inherit}'
    + '.vvr-drawer .others a b{color:var(--brand,#b45309);margin-right:6px}'
    + '.vvr-drawer footer{padding:10px 14px;border-top:1px solid var(--line,var(--rule,#ddd));font-size:12px;color:var(--muted,#6b6455)}'
    + '.vvr-nb{float:right;font-size:13px;line-height:1;border:0;background:transparent;cursor:pointer;padding:2px 4px;opacity:.85}'
    + '[data-vv-brand]{display:inline-flex;align-items:center;gap:5px}.vv-logo{height:1.3em;width:auto;flex:none}'
    + '[data-vv-brand]:hover .rn-bf,[data-vv-brand]:hover .rn-bs,a[data-vv-brand]:hover{text-decoration:underline;text-underline-offset:3px}'
    + '.vvr-hint{font:13px/1.45 system-ui,sans-serif;color:var(--muted,#6b6455);margin:-4px 0 12px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}'
    + '.vvr-hint a{color:var(--brand,#b45309)}.vvr-hint-x{border:0;background:transparent;color:inherit;cursor:pointer;font-size:12px;padding:0 4px;margin-left:2px}'
    + '.vvr-lnote{margin-left:6px;font:11px system-ui,sans-serif;color:var(--brand,#b45309);text-decoration:none;border:1px solid var(--line,#ddd);border-radius:6px;padding:0 5px}'
    + '@media print{.vvr-tools,.vvr-float,.vvr-drawer,.vvr-nb,.vvr-sel,.vvr-pop,.vvr-hint,.vvr-lnote{display:none!important}}';

  var popEl = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; } }
  function openPop(anchor, html, onMount) {
    closePop();
    popEl = el('div', { class: 'vvr-pop', role: 'dialog' }, html);
    document.body.appendChild(popEl);
    var r = anchor.getBoundingClientRect(), w = popEl.offsetWidth;
    popEl.style.top = (window.scrollY + r.bottom + 6) + 'px';
    popEl.style.left = Math.max(8, Math.min(window.scrollX + r.right - w, window.scrollX + document.documentElement.clientWidth - w - 8)) + 'px';
    if (onMount) onMount(popEl);
    return popEl;
  }
  document.addEventListener('mousedown', function (e) { if (popEl && !popEl.contains(e.target) && !(e.target.closest && e.target.closest('.vvr-btn,.vvr-sel'))) closePop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closePop(); closeDrawer(); } });

  // ---- bookmark + "add to collection…" popover (shared by the bar ☆ and the selection ☆) ----
  function collectPopover(bid, anchor, isNew) {
    var b = S.bookmarks.get(bid); if (!b) return;
    var cols = S.collections.list(), inC = {};
    S.collections.of(bid).forEach(function (c) { inC[c.id] = 1; });
    var html = '<h4>' + (isNew ? '☆ Bookmarked' : '★ Already bookmarked') + ' · ' + esc(b.title || '') + '</h4>'
      + (b.excerpt ? '<div style="font-family:\'Noto Serif Devanagari\',serif;font-size:13px;color:var(--muted,#6b6455);max-height:4.5em;overflow:hidden">' + esc(b.excerpt) + '</div>' : '')
      + '<h4 style="margin-top:8px">add to collection…</h4>'
      + (cols.length ? cols.map(function (c) { return '<label><input type="checkbox" data-c="' + esc(c.id) + '"' + (inC[c.id] ? ' checked' : '') + '> ' + esc(c.name) + '</label>'; }).join('') : '<div style="color:var(--muted,#6b6455);font-size:12.5px">no collections yet</div>')
      + '<div class="row"><input type="text" placeholder="new collection…" maxlength="80"><button class="vvr-mini" data-act="new">＋</button></div>'
      + '<div class="row"><input type="text" data-note placeholder="note (optional)" maxlength="300" value="' + esc(b.note || '') + '"></div>'
      + '<div class="row" style="justify-content:space-between"><button class="vvr-mini" data-act="rm">remove bookmark</button><a href="library.html#bookmarks">★ library</a><button class="vvr-mini" data-act="ok">done</button></div>';
    openPop(anchor, html, function (p) {
      p.addEventListener('change', function (e) {
        var c = e.target.getAttribute && e.target.getAttribute('data-c'); if (!c) return;
        if (e.target.checked) S.collections.addItem(c, bid); else S.collections.removeItem(c, bid);
      });
      var nm = p.querySelector('input[type=text]:not([data-note])'), note = p.querySelector('input[data-note]');
      function addNew() { var v = nm.value.trim(); if (!v) return; var cid = S.collections.create(v); S.collections.addItem(cid, bid); collectPopover(bid, anchor, isNew); }
      nm.addEventListener('keydown', function (e) { if (e.key === 'Enter') addNew(); });
      note.addEventListener('change', function () { S.bookmarks.update(bid, { note: note.value.trim() }); });
      p.addEventListener('click', function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'new') addNew();
        else if (act === 'rm') { S.bookmarks.remove(bid); closePop(); refreshStar(); }
        else if (act === 'ok') { S.bookmarks.update(bid, { note: note.value.trim() }); closePop(); }
      });
      if (!cols.length) nm.focus();
    });
  }

  var starBtn = null;
  function verseBookmark(ref) { return { url: verseUrl(ref), title: textName() + (ref ? ' ' + ref : ''), ref: ref, excerpt: verseExcerpt(ref), src: 'reading' }; }
  function refreshStar() {
    if (!starBtn) return;
    var ref = currentRef(), b = verseBookmark(ref), hit = S.bookmarks.find(b.url, b.excerpt);
    starBtn.textContent = hit ? '★' : '☆'; starBtn.classList.toggle('on', !!hit);
    starBtn.title = (hit ? 'Bookmarked: ' : 'Bookmark ') + (b.title || 'this verse');
  }
  function onStar() {
    var ref = currentRef(), b = verseBookmark(ref), hit = S.bookmarks.find(b.url, b.excerpt);
    var bid = hit ? hit.id : S.bookmarks.add(b);
    refreshStar(); collectPopover(bid, starBtn, !hit);
  }

  // ---- selection ☆ : bookmark exactly the passage the reader selected (links back via ?hl= highlighter in sync.js) ----
  var selBtn = null;
  function hideSel() { if (selBtn) { selBtn.remove(); selBtn = null; } }
  // Quiet mode (⚙, localStorage vv_quiet_hover — shared with peek.js's word cards): no selection prompt while screen-sharing,
  // unless Cmd/Ctrl/Alt is held as the selection ends. Mouse selections only — phones and tablets are unaffected (as peek.js).
  function quietSel(e) {
    var on = true; try { on = localStorage.getItem('vv_quiet_hover') !== '0'; } catch (x) {}   // quiet by default (2026-10-21)
    return on && e && e.type === 'mouseup' && !(e.metaKey || e.ctrlKey || e.altKey);
  }
  function onSelectionEnd(e) {
    if (quietSel(e)) { hideSel(); return; }
    setTimeout(function () {
      var sel = window.getSelection(); hideSel();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      var txt = sel.toString().replace(/\s+/g, ' ').trim();
      if (txt.length < 3 || txt.length > 2000) return;
      var range = sel.getRangeAt(0), host = range.commonAncestorContainer;
      host = host.nodeType === 3 ? host.parentNode : host;
      if (!host || host.closest('.vvr-drawer,.vvr-pop,input,textarea,select,#reading-nav,#tip,.gtip')) return;
      var r = range.getBoundingClientRect(); if (!r || (!r.width && !r.height)) return;
      selBtn = el('button', { class: 'vvr-sel', type: 'button', title: 'Bookmark this passage' }, '☆ bookmark passage');
      selBtn.style.top = (window.scrollY + r.bottom + 6) + 'px';
      selBtn.style.left = (window.scrollX + Math.max(8, Math.min(r.left, document.documentElement.clientWidth - 170))) + 'px';
      selBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      selBtn.addEventListener('click', function () {
        var ref = refOfNode(range.startContainer);
        var hl = txt.split(' ').slice(0, 8).join(' ');
        var bid = S.bookmarks.add({ url: PAGE + '?hl=' + encodeURIComponent(hl) + (ref ? '#v-' + ref : ''), title: textName() + (ref ? ' ' + ref : ''), ref: ref, excerpt: txt.slice(0, 400), src: 'reading' });
        var at = selBtn; selBtn = null; collectPopover(bid, at, true); at.remove(); refreshStar();
      });
      document.body.appendChild(selBtn);
    }, 0);
  }

  // ---- 📝 study-notes drawer ----
  var drawer = null, curNoteRef = null, saveT = null;
  function noteKey(ref) { return S.notes.key(PAGE, ref || ''); }
  function buildDrawer() {
    drawer = el('aside', { class: 'vvr-drawer', 'aria-label': 'Study notes' },
      '<header><h3>📝 Study notes</h3><button class="vvr-mini" data-act="close" title="Close (Esc)">✕</button></header>'
      + '<div class="ref"><b data-ref></b><button class="vvr-mini" data-act="here" title="Attach the note to the verse you are reading now">↻ verse I\'m at</button></div>'
      + '<textarea placeholder="Your note on this verse — saved automatically in this browser."></textarea>'
      + '<div class="saved"></div><div class="others"></div>'
      + '<footer>Saved automatically in this browser only (not on any server). Clearing browser data deletes notes — use <a href="library.html#backup">Export</a> to keep a copy. <a href="library.html#notes">All my notes →</a></footer>');
    document.body.appendChild(drawer);
    var ta = drawer.querySelector('textarea');
    ta.addEventListener('input', function () { clearTimeout(saveT); drawer.querySelector('.saved').textContent = '…'; saveT = setTimeout(saveNote, 400); });
    drawer.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'close') closeDrawer();
      else if (act === 'here') { saveNote(); bindNote(currentRef()); }
      var j = e.target.closest && e.target.closest('a[data-ref]');
      if (j) { e.preventDefault(); saveNote(); var r = j.getAttribute('data-ref'), a = anchorOf(r); if (a) a.scrollIntoView({ behavior: 'smooth', block: 'start' }); bindNote(r); }
    });
  }
  function saveNote() {
    if (!drawer || curNoteRef == null) return;
    var ta = drawer.querySelector('textarea');
    S.notes.set(noteKey(curNoteRef), { page: PAGE, ref: curNoteRef, url: verseUrl(curNoteRef), title: textName() + (curNoteRef ? ' ' + curNoteRef : ''), text: ta.value });
    drawer.querySelector('.saved').textContent = ta.value.trim() ? 'saved ✓' : '';
  }
  function bindNote(ref) {
    curNoteRef = ref || '';
    var n = S.notes.get(noteKey(curNoteRef));
    drawer.querySelector('[data-ref]').textContent = textName() + (curNoteRef ? ' · ' + curNoteRef : '');
    drawer.querySelector('textarea').value = n ? n.text : '';
    drawer.querySelector('.saved').textContent = n ? 'saved ✓' : '';
    renderOthers();
  }
  function renderOthers() {
    if (!drawer) return;
    var list = S.notes.onPage(PAGE).filter(function (n) { return n.ref !== curNoteRef; });
    drawer.querySelector('.others').innerHTML = list.length ? '<h4>Other notes on this page</h4>' + list.map(function (n) {
      return '<a href="#v-' + esc(n.ref) + '" data-ref="' + esc(n.ref) + '"><b>' + esc(n.ref) + '</b>' + esc(String(n.text).slice(0, 90)) + '</a>';
    }).join('') : '';
  }
  function openDrawer(ref) {
    if (!drawer) buildDrawer();
    bindNote(ref != null ? ref : currentRef());
    drawer.classList.add('open');
    setTimeout(function () { drawer.querySelector('textarea').focus(); }, 60);
  }
  function closeDrawer() { if (drawer && drawer.classList.contains('open')) { saveNote(); drawer.classList.remove('open'); } }

  function paintMarkers() {
    [].forEach.call(document.querySelectorAll('.vvr-nb'), function (x) { x.remove(); });
    S.notes.onPage(PAGE).forEach(function (n) {
      var a = anchorOf(n.ref); if (!a) return;
      var m = el('button', { class: 'vvr-nb', type: 'button', title: 'My note: ' + String(n.text).slice(0, 120) }, '📝');
      m.addEventListener('click', function (e) { e.stopPropagation(); openDrawer(n.ref); });
      a.insertBefore(m, a.firstChild);
    });
  }

  // ---- fold-out controls (registry in VVStore.folds; ⚙ default per type; per-page buttons don't change the default) ----
  function presentFolds() { return S.folds.list().filter(function (f) { return document.querySelector(f.selector); }); }
  function setFold(f, open) { [].forEach.call(document.querySelectorAll(f.selector), function (d) { d.open = open; }); }
  function applyFoldDefaults() { presentFolds().forEach(function (f) { if (S.folds.get(f.key) === 'expanded') setFold(f, true); }); }
  function foldPopover(anchor) {
    var fs = presentFolds();
    openPop(anchor, '<h4>Commentary fold-outs on this page</h4>' + fs.map(function (f) {
      return '<div class="fold"><span>' + esc(f.label) + '<small>' + esc(f.sub || '') + '</small></span><button class="vvr-mini" data-k="' + esc(f.key) + '" data-o="1">▾ expand all</button><button class="vvr-mini" data-k="' + esc(f.key) + '" data-o="0">▸ collapse all</button></div>';
    }).join('') + '<div style="font-size:12px;color:var(--muted,#6b6455);margin-top:6px">This page only. The default for every page is set in the dashboard ⚙ Settings.</div>', function (p) {
      p.addEventListener('click', function (e) {
        var k = e.target.getAttribute && e.target.getAttribute('data-k'); if (!k) return;
        var f = fs.filter(function (x) { return x.key === k; })[0]; if (f) setFold(f, e.target.getAttribute('data-o') === '1');
      });
    });
  }

  // ---- brand diya (Harsha 2026-10-21 #1/#13): the logo sits INSIDE the brand link, right of the text, so text + logo are one
  // home target. Added here at ready — AFTER nav.js has moved the brand into the bar (it rebuilds the link's innerHTML) —
  // and never on the sister site's own brand. Hover cue (underline) instead of a separate 🏠 (CLAUDE.md 9a). ----
  function brandLogo() {
    [].forEach.call(document.querySelectorAll('[data-vv-brand]'), function (b) {
      if (b.querySelector('.vv-logo') || /साहित्य|सा·व्या/.test(b.textContent)) return;
      b.appendChild(el('img', { class: 'vv-logo', src: 'diya-40.png', alt: '', width: '21', height: '20', 'aria-hidden': 'true' }));
    });
  }

  // ---- ⚙ Settings + 📖 dictionary (Harsha 2026-10-21 #6/#10): the SAME panel as the homepage ⚙, from vv-settings.js (loaded on first use) ----
  function withSettings(cb) {
    if (window.VVSettings) return cb();
    var sc = document.createElement('script'); sc.src = 'vv-settings.js'; sc.onload = cb; document.head.appendChild(sc);
  }
  // ---- first-time hint (Harsha 2026-10-21 #4): one muted line under the title. Gone for good once the reader clicks ✕, uses
  // the feature (peeks with Cmd/Ctrl/Alt, taps a word, opens ⚙) or has seen it on 5 reading pages. Never shown while
  // word cards are set to always show (quiet off). Per browser (VVStore prefs). ----
  var hintEl = null;
  function hintUsed() { try { S.prefs.set('hint:grammar-done', true); } catch (e) {} if (hintEl) { hintEl.remove(); hintEl = null; } }
  window.__vvHintUsed = hintUsed;
  function showHint() {
    var quiet = true; try { quiet = localStorage.getItem('vv_quiet_hover') !== '0'; } catch (e) {}
    var touch = window.matchMedia && !matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (S.prefs.get('hint:grammar-done', false) || (!quiet && !touch)) return;
    var n = +S.prefs.get('hint:grammar-n', 0) || 0;
    if (n >= 5) { hintUsed(); return; }
    var h1 = document.querySelector('h1'); if (!h1) return;
    S.prefs.set('hint:grammar-n', n + 1);
    hintEl = el('div', { class: 'vvr-hint' }, (touch ? 'Tap a word to see its grammar' : 'Hold <b>Cmd/Ctrl</b> (or <b>Alt</b>) over a word to see its grammar')
      + ' · <a href="#" class="vvr-hint-set">⚙ for reading options</a> <button class="vvr-hint-x" type="button" aria-label="Dismiss">✕</button>');
    var after = (h1.nextElementSibling && /\bsub\b/.test(h1.nextElementSibling.className)) ? h1.nextElementSibling : h1;
    after.parentNode.insertBefore(hintEl, after.nextSibling);
    hintEl.querySelector('.vvr-hint-x').addEventListener('click', hintUsed);
    hintEl.querySelector('.vvr-hint-set').addEventListener('click', function (e) { e.preventDefault(); withSettings(function () { VVSettings.open(); }); });
    var peek = function (e) { if (hintEl && (e.metaKey || e.ctrlKey || e.altKey) && e.target.closest && e.target.closest('.w')) hintUsed(); };
    document.addEventListener('mouseover', peek); document.addEventListener('mousemove', peek, { passive: true });   // a peek = a modifier held over a word
    document.addEventListener('click', function (e) { if (hintEl && e.target.closest && e.target.closest('.w')) hintUsed(); });
  }
  // legend: a "⚙ to show" note on each commentary-marker entry while that marker is off (the swatch itself stays visible)
  function legendNotes() {
    var L = document.querySelector('details.legend'); if (!L) return;
    var M = [['vv_pill_praman', '.prb'], ['vv_pill_abhyu', 'sup'], ['vv_pill_maha', '.maha-mark']];
    M.forEach(function (m) {
      var it = [].filter.call(L.querySelectorAll('.item'), function (x) { var q = x.querySelector(m[1]); return q && (m[0] !== 'vv_pill_abhyu' || /अभ्यु/.test(q.textContent)); })[0];
      if (!it) return;
      var on = false; try { on = localStorage.getItem(m[0]) === '1'; } catch (e) {}
      var note = it.querySelector('.vvr-lnote');
      if (on) { if (note) note.remove(); return; }
      if (!note) { note = el('a', { class: 'vvr-lnote', href: '#', title: 'Commentary markers are off by default — turn this one on in ⚙ Settings' }, '⚙ to show');
        note.addEventListener('click', function (e) { e.preventDefault(); withSettings(function () { VVSettings.open(); }); }); it.appendChild(note); }
    });
  }
  window.__vvLegendNotes = legendNotes;

  // ---- page furniture: legend / contents remember their last open state (no setting — Harsha 2026-10-11) ----
  function rememberPanels() {
    [].forEach.call(document.querySelectorAll('details.legend, details.toc'), function (d) {
      var k = 'panel:' + (d.classList.contains('toc') ? 'toc' : 'legend');
      var v = S.prefs.get(k, null); if (v != null) d.open = !!v;
      d.addEventListener('toggle', function () { S.prefs.set(k, d.open); });
    });
  }

  ready(function () {
    S.rememberSite();
    document.head.appendChild(el('style', { id: 'vvr-style' }, CSS));
    var bar = document.getElementById('reading-nav');
    var tools = el('span', { class: 'vvr-tools' });
    starBtn = el('button', { class: 'vvr-btn', type: 'button', 'aria-label': 'Bookmark this verse' }, '☆');
    starBtn.addEventListener('click', onStar);
    var noteBtn = el('button', { class: 'vvr-btn', type: 'button', title: 'Study notes for the verse you are at', 'aria-label': 'Study notes' }, '📝');
    noteBtn.addEventListener('click', function () { if (drawer && drawer.classList.contains('open')) closeDrawer(); else openDrawer(); });
    tools.appendChild(starBtn); tools.appendChild(noteBtn);
    // 📖 Sanskrit dictionary (sanskritkosha.com, new tab) — a selected word pre-fills the box (Harsha 2026-10-21 #10)
    var dictSel = '';
    var dictBtn = el('button', { class: 'vvr-btn vvr-dict', type: 'button', title: 'Look up a word in the Sanskrit dictionary (sanskritkosha.com)', 'aria-label': 'Dictionary' }, '📖');
    dictBtn.addEventListener('mousedown', function () { var x = window.getSelection(); dictSel = x ? x.toString() : ''; });
    dictBtn.addEventListener('click', function () { var pre = (dictSel.match(/[\u0900-\u097F]+/) || [''])[0]; withSettings(function () { VVSettings.dict(dictBtn, pre); }); });
    tools.appendChild(dictBtn);
    if (presentFolds().length) {
      var fb = el('button', { class: 'vvr-btn', type: 'button', title: 'Expand / collapse the commentary fold-outs on this page' }, 'टीका ⇕');
      fb.style.fontSize = '13px';
      fb.addEventListener('click', function () { foldPopover(fb); });
      tools.appendChild(fb);
    }
    var gearBtn = el('button', { class: 'vvr-btn vvr-gear', type: 'button', title: 'Settings — text size, script, word grammar, commentary markers…', 'aria-label': 'Settings' }, '⚙');
    gearBtn.addEventListener('click', function () { withSettings(function () { VVSettings.open(); }); });
    tools.appendChild(gearBtn);
    if (bar) bar.appendChild(tools); else { var fl = el('div', { class: 'vvr-float' }); fl.appendChild(tools); document.body.appendChild(fl); }
    brandLogo();
    if (savedScale() !== 1) textScale(savedScale());
    showHint();
    legendNotes();
    // in-text search (🔍 next to ☆ 📝, 2026-10-13) — vv-insearch.js shows itself only on texts the search site indexes
    var isrc = document.createElement('script'); isrc.src = 'vv-insearch.js'; isrc.async = true; document.head.appendChild(isrc);
    applyFoldDefaults();
    rememberPanels();
    paintMarkers();
    refreshStar();
    var t = null;
    window.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(refreshStar, 150); }, { passive: true });
    document.addEventListener('mouseup', onSelectionEnd);
    document.addEventListener('touchend', onSelectionEnd);
    document.addEventListener('selectionchange', function () { var s = window.getSelection(); if (selBtn && (!s || s.isCollapsed)) hideSel(); });
    S.onChange(function (key) {
      if (key === S.NS + 'notes') { paintMarkers(); renderOthers(); }
      if (key === S.NS + 'bookmarks') refreshStar();
    });
  });
})();
