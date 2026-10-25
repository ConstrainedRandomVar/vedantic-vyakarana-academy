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

  // a separately loaded commentary (lane-<page>-<side>.json) that could not be fetched — offline, it was left out when the text
  // was saved (☰ → Saved for offline lets the reader add it). Listening from the start: the page may ask for its lane while parsing.
  var laneNote = null;
  document.addEventListener('vv:lanefail', function (e) {
    var btn = document.querySelector('#sideseg button[data-side="' + e.detail + '"]');
    var name = btn ? btn.textContent.trim() : 'This commentary';
    if (laneNote) laneNote.remove();
    laneNote = document.createElement('div');
    laneNote.setAttribute('role', 'status');
    laneNote.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2050;max-width:min(520px,92vw);background:#292524;color:#fafaf9;'
      + 'border-radius:10px;padding:10px 14px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)';
    laneNote.innerHTML = '<span style="font-family:\'Noto Serif Devanagari\',serif">' + name.replace(/[&<>]/g, '') + '</span> '
      + (navigator.onLine ? 'could not be loaded — check your connection and choose it again.'
        : 'was not saved for offline reading. Connect to the internet to read it, or add it with ☰ → Saved for offline.');
    document.body.appendChild(laneNote);
    var n = laneNote; setTimeout(function () { if (n.isConnected) n.remove(); }, 8000);
    n.addEventListener('click', function () { n.remove(); });
  });

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
    + '.vv-credit{max-width:860px;margin:28px auto 18px;padding:10px 16px 0;border-top:1px solid var(--line,#e5ded0);font:12px/1.5 system-ui,-apple-system,sans-serif;color:var(--muted,#7a6a55);text-align:center}.vv-credit a{color:inherit;text-decoration:underline}'
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
    // passage highlights: ONE fixed style — a lime wash + ✎ mark. Lime (≈80–100°) is a FREE palette region (CLAUDE.md 9c audit
    // 2026-10-21): clear of the search-landing yellow (48°), role/brand ambers (17–45°), सिद्धान्तः green (142°), every blue/violet/pink.
    + ':root{--hl-wash:#ecfccb;--hl-mark:#4d7c0f}html[data-theme=dark]{--hl-wash:rgba(163,230,53,.2);--hl-mark:#a3e635}'
    + '@media(prefers-color-scheme:dark){html:not([data-theme=light]){--hl-wash:rgba(163,230,53,.2);--hl-mark:#a3e635}}'
    + 'mark.vvh{background:var(--hl-wash);color:inherit;border-radius:2px;padding:0;box-shadow:inset 0 -1px 0 var(--hl-mark)}'
    + '.vvh-pin{cursor:pointer}.vvh-pin::before{content:"✎";font:700 10px/1 system-ui,sans-serif;color:#fff;background:var(--hl-mark);border-radius:3px;padding:1px 3px;margin-right:2px;vertical-align:super}'
    + 'html[data-theme=dark] .vvh-pin::before{color:#1a2e05}'
    + '.vvr-sel{display:flex;gap:6px}.vvr-sel button{font:13px system-ui,sans-serif;background:var(--brand,#d97706);color:#fff;border:0;border-radius:8px;padding:4px 9px;cursor:pointer}'
    + '.vvr-sel button.hl{background:var(--hl-mark)}html[data-theme=dark] .vvr-sel button.hl{color:#1a2e05}'
    + '.vvr-pop .vvh-q{font-family:"Noto Serif Devanagari",serif;font-size:14px;background:var(--hl-wash);border-radius:6px;padding:4px 7px;margin:0 0 6px;max-height:5.5em;overflow:auto}'
    + '.vvr-pop textarea{width:100%;box-sizing:border-box;min-height:60px;font:14px/1.45 system-ui,sans-serif;border:1px solid var(--line,var(--rule,#ccc));border-radius:6px;padding:5px;background:transparent;color:inherit}'
    + '.vvh-chips{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}.vvh-chip{font:12px system-ui,sans-serif;border:1px solid var(--hl-mark);border-radius:10px;padding:1px 7px;background:transparent;color:inherit;cursor:pointer}'
    + '.vvh-chip.on{background:var(--hl-wash)}.vvh-chip.sug{opacity:.75;border-style:dashed}'
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
  // The selection menu (🖍 highlight · ☆ bookmark) NEVER pops up on its own after a mouse selection (Harsha 2026-10-21, option A):
  // an instructor selecting text while screen-sharing must not see it. It opens on a RIGHT-CLICK of the selection, or when
  // Cmd/Ctrl/Alt is held as the selection ends. Touch: a long-press selection shows it (no Zoom/hover concern there).
  function selInfo() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var txt = sel.toString().replace(/\s+/g, ' ').trim();
    if (txt.length < 2 || txt.length > 2000) return null;
    var range = sel.getRangeAt(0), host = range.commonAncestorContainer;
    host = host.nodeType === 3 ? host.parentNode : host;
    if (!host || host.closest('.vvr-drawer,.vvr-pop,input,textarea,select,#reading-nav,#tip,.gtip')) return null;
    return { range: range, txt: txt };
  }
  function showSelMenu(info, at) {   // at = {x, y} page coords, else under the selection
    hideSel();
    var range = info.range, txt = info.txt, r = range.getBoundingClientRect(); if (!at && (!r || (!r.width && !r.height))) return;
    selBtn = el('div', { class: 'vvr-sel', role: 'toolbar' }, '<button type="button" class="hl" title="Highlight this passage — then add a note or tags">🖍 highlight</button><button type="button" class="bm" title="Bookmark this passage">☆ bookmark</button>');
    selBtn.style.top = (at ? at.y + 4 : window.scrollY + r.bottom + 6) + 'px';
    selBtn.style.left = Math.max(window.scrollX + 8, Math.min(at ? at.x : window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - 230)) + 'px';
    selBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    selBtn.querySelector('.hl').addEventListener('click', function () {
      var res = createHighlight(range), at2 = selBtn; selBtn = null;
      if (res.err) { at2.innerHTML = '<button type="button" disabled>' + esc(res.err) + '</button>'; setTimeout(function () { at2.remove(); }, 2200); return; }
      try { window.getSelection().removeAllRanges(); } catch (x) {}
      var pin = document.querySelector('.vvh-pin[data-hid="' + res.id + '"]'); editHighlight(res.id, pin || at2); at2.remove();
      hintUsed();
    });
    selBtn.querySelector('.bm').addEventListener('click', function () {
      var ref = refOfNode(range.startContainer);
      var hl = txt.split(' ').slice(0, 8).join(' ');
      var bid = S.bookmarks.add({ url: PAGE + '?hl=' + encodeURIComponent(hl) + (ref ? '#v-' + ref : ''), title: textName() + (ref ? ' ' + ref : ''), ref: ref, excerpt: txt.slice(0, 400), src: 'reading' });
      var at2 = selBtn; selBtn = null; collectPopover(bid, at2, true); at2.remove(); refreshStar();
    });
    document.body.appendChild(selBtn);
  }
  function onSelectionEnd(e) {
    var mouse = e && e.type === 'mouseup';
    if (mouse && e.button === 2) return;                                         // right-click: the contextmenu handler decides
    if (mouse && !(e.metaKey || e.ctrlKey || e.altKey)) { if (selBtn && !(e.target.closest && e.target.closest('.vvr-sel'))) hideSel(); return; }
    setTimeout(function () { var info = selInfo(); if (info) showSelMenu(info); else hideSel(); }, 0);
  }
  function onContextMenu(e) {   // right-click ON the selected text → our menu instead of the browser's; anywhere else → the browser's
    var info = selInfo(); if (!info) return;
    var t = e.target; if (!(t && (info.range.intersectsNode(t) || (t.nodeType === 1 && t.contains(info.range.commonAncestorContainer))))) return;
    e.preventDefault(); showSelMenu(info, { x: e.pageX, y: e.pageY });
  }

  // ---- 🖍 PASSAGE HIGHLIGHTS (Harsha 2026-10-21): a marked portion of text + optional note + tags, in ONE fixed style.
  // Anchor = verse (#v-<ref>) + the exact ORIGINAL text (Devanāgarī via translit.js VVTranslit.orig, whatever script is showing)
  // snapped to whole text nodes + a little context either side. Painting wraps those same nodes in <mark class="vvh"> (the nodes
  // themselves move, so translit and the gloss cards keep working). Not found (text changed in a rebuild) → never painted on a
  // guess: the record is marked unplaced and the library lists it (the CLAUDE.md 9e spirit). Data: VVStore.highlights. ----
  function origText(n) { return (window.VVTranslit && VVTranslit.orig) ? VVTranslit.orig(n) : n.nodeValue; }
  function canon(x) { return String(x || '').replace(/[\s‌‍]+/g, ''); }
  var HL_SKIP = '#tip,.gtip,.vvr-pop,.vvr-drawer,.vvr-sel,.vvr-hint,#vvs,.vvh-pin,script,style,.legend';
  function verseOf(node) { var e = node && (node.nodeType === 3 ? node.parentElement : node); return e && e.closest ? e.closest('[id^="v-"]') : null; }
  function textNodes(root) {   // visible text nodes in document order (whitespace-only ones included — they keep the wash continuous)
    var vis = new Map();
    function shown(e) { if (!e || e === root.parentNode) return true; if (vis.has(e)) return vis.get(e); var v = getComputedStyle(e).display !== 'none' && shown(e.parentElement); vis.set(e, v); return v; }
    // a bhāṣya word carries a joined copy (.bhsj) and a split पद copy (.bhsp), one of them hidden by the view: ALWAYS anchor on the
    // joined copy (whichever view is showing), so a highlight made in पद view still paints in सन्धि view and vice versa
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, out = [];
    while ((n = w.nextNode())) {
      var p = n.parentElement; if (!p || p.closest(HL_SKIP) || p.closest('.bhsp')) continue;
      var j = p.closest('.bhsj');
      if (!shown(j ? (j.parentElement || p) : p)) continue;
      out.push(n);
    }
    return out;
  }
  function hitsRange(range, n) { var j = n.parentElement && n.parentElement.closest('.bhsj'); return range.intersectsNode(j ? (j.parentElement || n) : n); }
  function createHighlight(range) {
    var v = verseOf(range.startContainer);
    if (!v) return { err: 'highlights work inside a verse' };
    if (verseOf(range.endContainer) !== v) return { err: 'a highlight stays within one verse' };
    var all = textNodes(v), i = -1, j = -1;
    for (var k = 0; k < all.length; k++) if (hitsRange(range, all[k]) && canon(all[k].nodeValue)) { if (i < 0) i = k; j = k; }
    if (i < 0) return { err: 'nothing to highlight here' };
    var seg = all.slice(i, j + 1), quote = canon(seg.map(origText).join(''));
    if (quote.length < 2) return { err: 'select a little more text' };
    var pre = canon(all.slice(Math.max(0, i - 12), i).map(origText).join('')).slice(-40), post = canon(all.slice(j + 1, j + 13).map(origText).join('')).slice(0, 40);
    var ref = v.id.slice(2);
    var id = S.highlights.add({ url: PAGE, page: PAGE, ref: ref, title: textName() + ' ' + ref, quote: quote, prefix: pre, suffix: post,
      text: seg.map(origText).join('').replace(/\s+/g, ' ').trim().slice(0, 400), placed: true });
    paintOne(S.highlights.get(id));
    return { id: id };
  }
  function paintOne(h) {
    var v = document.getElementById('v-' + h.ref); if (!v) return false;
    var all = textNodes(v), T = all.map(function (n) { return canon(origText(n)); }), best = null;
    for (var i = 0; i < all.length; i++) {
      if (!T[i] || h.quote.indexOf(T[i]) !== 0) continue;
      var acc = '', j = i;
      for (; j < all.length && acc.length < h.quote.length; j++) { acc += T[j]; if (h.quote.indexOf(acc) !== 0) break; }
      if (acc !== h.quote) continue;
      // score = how much of the stored context still matches on each side (several occurrences in a verse → the right one)
      var before = T.slice(Math.max(0, i - 12), i).join(''), after = T.slice(j, j + 12).join(''), sc = 0;
      for (var a = 1; a <= Math.min(before.length, (h.prefix || '').length); a++) { if (before.slice(-a) === h.prefix.slice(-a)) sc = a; else break; }
      for (var b = 1; b <= Math.min(after.length, (h.suffix || '').length); b++) { if (after.slice(0, b) === h.suffix.slice(0, b)) sc++; else break; }
      if (!best || sc > best.sc) best = { i: i, j: j - 1, sc: sc };
    }
    if (!best) return false;
    var first = null;
    for (var k = best.i; k <= best.j; k++) {
      var n = all[k], m = document.createElement('mark'); m.className = 'vvh'; m.setAttribute('data-hid', h.id);
      n.parentNode.insertBefore(m, n); m.appendChild(n); if (!first) first = m;
      var jj = m.parentElement && m.parentElement.closest('.bhsj'), sp = jj && jj.nextElementSibling;   // wash the पद copy too
      if (sp && sp.classList.contains('bhsp') && !sp.querySelector('mark.vvh')) { var m2 = document.createElement('mark'); m2.className = 'vvh'; m2.setAttribute('data-hid', h.id); while (sp.firstChild) m2.appendChild(sp.firstChild); sp.appendChild(m2); }
    }
    var pin = el('span', { class: 'vvh-pin', 'data-hid': h.id, role: 'button', tabindex: '0', title: (h.note ? h.note + '\n' : '') + ((h.tags || []).length ? '#' + h.tags.join(' #') + '\n' : '') + 'highlight — click to add a note / tags' });
    var at = (first.parentElement && first.parentElement.closest('.bhsj')) ? first.parentElement.closest('.bhsj').parentElement : first;   // outside both copies → visible in either view
    at.parentNode.insertBefore(pin, at);
    return true;
  }
  function unpaintAll() {
    [].forEach.call(document.querySelectorAll('.vvh-pin'), function (p) { p.remove(); });
    [].forEach.call(document.querySelectorAll('mark.vvh'), function (m) { var p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); });
  }
  var paintRetry = null;
  function paintAll() {
    unpaintAll();
    var miss = [];
    S.highlights.onPage(PAGE).forEach(function (h) { if (paintOne(h)) S.highlights.setPlaced(h.id, true); else miss.push(h.id); });
    // commentary lanes can fill in after load → retry before calling a highlight "unplaced"; while a lazy lane is still out of
    // the page (.lzl placeholder — the reader is on another commentary, or it hasn't arrived) a miss is NOT final: paintLate()
    // runs again when a lane arrives (vv:lane). Since 2026-10-25 the ṭīkā itself is a lazy lane.
    clearTimeout(paintRetry);
    if (miss.length) paintRetry = setTimeout(paintLate, 2500);
  }
  function paintLate() {
    S.highlights.onPage(PAGE).forEach(function (h) {
      if (document.querySelector('.vvh-pin[data-hid="' + h.id + '"]')) return;
      var ok = paintOne(h);
      if (ok || !document.querySelector('.lzl')) S.highlights.setPlaced(h.id, ok);
    });
  }
  document.addEventListener('vv:lane', function () { paintLate(); });
  function editHighlight(id, anchor) {
    var h = S.highlights.get(id); if (!h) return;
    var tagsNow = function () { return (S.highlights.get(id) || {}).tags || []; };
    var chips = function () {
      var mine = tagsNow(), sug = S.highlights.tags().map(function (t) { return t.tag; }).filter(function (t) { return mine.indexOf(t) < 0; }).slice(0, 10);
      return mine.map(function (t) { return '<button class="vvh-chip on" data-t="' + esc(t) + '" title="remove this tag">#' + esc(t) + ' ×</button>'; }).join('')
        + sug.map(function (t) { return '<button class="vvh-chip sug" data-add="' + esc(t) + '" title="add this tag">+ ' + esc(t) + '</button>'; }).join('');
    };
    openPop(anchor, '<h4>🖍 Highlight · ' + esc(h.title || h.ref) + '</h4><div class="vvh-q">' + esc(h.text || '') + '</div>'
      + '<textarea placeholder="Note (optional) — saved as you type"></textarea>'
      + '<div class="row"><input type="text" placeholder="add a tag, then Enter (e.g. for class)"></div><div class="vvh-chips"></div>'
      + '<div class="row" style="justify-content:space-between"><button class="vvr-mini" data-act="del">remove highlight</button><a href="library.html#highlights">All highlights →</a><button class="vvr-mini" data-act="ok">Done</button></div>', function (p) {
      var ta = p.querySelector('textarea'), inp = p.querySelector('input'), box = p.querySelector('.vvh-chips'), t = null;
      ta.value = h.note || ''; box.innerHTML = chips();
      ta.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { S.highlights.update(id, { note: ta.value.trim() }); }, 350); });
      inp.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return; e.preventDefault();
        var v = inp.value.trim().replace(/^#/, ''); if (!v) return;
        var cur = tagsNow(); if (cur.indexOf(v) < 0) S.highlights.update(id, { tags: cur.concat([v]) }); inp.value = ''; box.innerHTML = chips();
      });
      box.addEventListener('click', function (e) {
        var d = e.target.getAttribute('data-t'), a = e.target.getAttribute('data-add');
        if (d != null) S.highlights.update(id, { tags: tagsNow().filter(function (x) { return x !== d; }) });
        if (a != null) S.highlights.update(id, { tags: tagsNow().concat([a]) });
        box.innerHTML = chips();
      });
      p.addEventListener('click', function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'del') { S.highlights.remove(id); closePop(); }
        else if (act === 'ok') { clearTimeout(t); S.highlights.update(id, { note: ta.value.trim() }); closePop(); }
      });
    });
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
  document.addEventListener('vv:lane', function () { applyFoldDefaults(); });   // folds that arrive with a lazy lane (Pūrṇānandī in the Ratnaprabhā lane)
  function foldPopover(anchor) {
    var fs = presentFolds();
    openPop(anchor, '<h4>Commentary fold-outs on this page</h4>' + fs.map(function (f) {
      return '<div class="fold"><span>' + esc(f.label) + '<small>' + esc(f.sub || '') + '</small></span><button class="vvr-mini" data-k="' + esc(f.key) + '" data-o="1">▾ expand all</button><button class="vvr-mini" data-k="' + esc(f.key) + '" data-o="0">▸ collapse all</button></div>';
    }).join('') + '<div style="font-size:12px;color:var(--muted,#6b6455);margin-top:6px">This page only. The default for every page is set in ☰ → ⚙ Settings.</div>', function (p) {
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
    hintEl = el('div', { class: 'vvr-hint' }, (touch ? 'Tap a word to see its grammar · long-press to select and 🖍 highlight' : 'Hold <b>Cmd/Ctrl</b> (or <b>Alt</b>) over a word to see its grammar · select words and <b>right-click</b> to 🖍 highlight')
      + ' · <a href="#" class="vvr-hint-set">☰ ⚙ Settings for reading options</a> <button class="vvr-hint-x" type="button" aria-label="Dismiss">✕</button>');
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
      if (!note) { note = el('a', { class: 'vvr-lnote', href: '#', title: 'Commentary markers are off by default — turn this one on in ☰ → ⚙ Settings' }, '⚙ to show');
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
    // ☰ menu (Harsha 2026-10-23): ⚙ Settings · ★ library · ⤓ save this text offline · help · sources — vv-settings.js VVSettings.menu
    var gearBtn = el('button', { class: 'vvr-btn vvr-gear', type: 'button', title: 'Menu — settings, library, save offline, help', 'aria-label': 'Menu', 'aria-haspopup': 'true' }, '☰');
    gearBtn.addEventListener('click', function () { withSettings(function () { VVSettings.menu(gearBtn); }); });
    tools.appendChild(gearBtn);
    // टीका ⇕ (before ☰) — on load if the page has fold-outs, and again when a lazy lane brings some (Pūrṇānandī arrives with the
    // Ratnaprabhā lane: the BS pages had no button at all — Harsha 2026-10-26)
    var foldBtn = null;
    function ensureFoldBtn() {
      if (foldBtn || !presentFolds().length) return;
      foldBtn = el('button', { class: 'vvr-btn', type: 'button', title: 'Expand / collapse the commentary fold-outs on this page' }, 'टीका ⇕');
      foldBtn.style.fontSize = '13px';
      foldBtn.addEventListener('click', function () { foldPopover(foldBtn); });
      tools.insertBefore(foldBtn, gearBtn);
    }
    ensureFoldBtn();
    document.addEventListener('vv:lane', ensureFoldBtn);
    if (bar) bar.appendChild(tools); else { var fl = el('div', { class: 'vvr-float' }); fl.appendChild(tools); document.body.appendChild(fl); }
    brandLogo();
    if (savedScale() !== 1) textScale(savedScale());
    showHint();
    legendNotes();
    // copyright / provenance line at the foot of every reading page (Harsha 2026-10-21, after Tamal Maharaj's disclaimer) —
    // not on the sister site, whose texts are not Sringeri's. Same wording as the homepage (app.js).
    if (S.SITE !== 'sahitya' && !document.querySelector('.vv-credit')) {
      var cr = el('footer', { class: 'vv-credit' }); cr.innerHTML = 'Texts © their respective owners — principally Sri Sharada Peetham, Sringeri — see <a href="about.html">Sources</a>. Translations and grammatical apparatus are new (partly machine-made).';
      document.body.appendChild(cr); }
    // in-text search (🔍 next to ☆ 📝, 2026-10-13) — vv-insearch.js shows itself only on texts the search site indexes
    var isrc = document.createElement('script'); isrc.src = 'vv-insearch.js'; isrc.async = true; document.head.appendChild(isrc);
    // offline reading (vv-offline.js): register the service worker from reading pages too, and bring saved texts up to date
    var osrc = document.createElement('script'); osrc.src = 'vv-offline.js'; osrc.async = true;
    osrc.onload = function () { if (!window.VVOffline) return; VVOffline.register(); setTimeout(function () { VVOffline.refresh(); }, 4000); };
    document.head.appendChild(osrc);
    applyFoldDefaults();
    rememberPanels();
    paintMarkers();
    refreshStar();
    var t = null;
    window.addEventListener('scroll', function () { clearTimeout(t); t = setTimeout(refreshStar, 150); }, { passive: true });
    document.addEventListener('mouseup', onSelectionEnd);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('touchend', onSelectionEnd);
    document.addEventListener('selectionchange', function () { var s = window.getSelection(); if (selBtn && (!s || s.isCollapsed)) hideSel(); });
    paintAll();
    document.addEventListener('click', function (e) { var p = e.target.closest && e.target.closest('.vvh-pin'); if (p) { e.preventDefault(); e.stopPropagation(); editHighlight(p.getAttribute('data-hid'), p); } }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('vvh-pin')) editHighlight(e.target.getAttribute('data-hid'), e.target); });
    var hlT = null;
    S.onChange(function (key) {
      if (key === S.NS + 'highlights') { clearTimeout(hlT); hlT = setTimeout(paintAll, 60); }   // another tab, a sync, an edit
      if (key === S.NS + 'notes') { paintMarkers(); renderOthers(); }
      if (key === S.NS + 'bookmarks') refreshStar();
    });
  });
})();

// ---- keep the reader's verse across the मूलम् ⇄ भाष्यम् switch (Harsha 2026-10-24: "it should stay in the same verse").
// The switch hides/shows every commentary block, so the old pixel offset lands somewhere else. Before the page's own toggle
// runs (capture phase), note the verse at the top line; after it has re-laid out, put that verse back there. Going to मूलम्
// puts the verse's start at the top; coming back to भाष्यम् on the same verse returns to the exact spot in its commentary.
// Unified views (#viewseg, body.moola-only) and prakaraṇa views (.viewbar, body.view-mula; VC's edition units vb-<ref>).
(function () {
  'use strict';
  if (window.__vvKeepVerse) return; window.__vvKeepVerse = true;
  var mem = null;   // {id, off}: where the reader was in the commentary view when they left it
  function line() { var n = document.getElementById('reading-nav'), b = 0; if (n) { var r = n.getBoundingClientRect(); if (r.bottom > 0) b = r.bottom; } return b + 4; }
  function shown(el) { return el && el.offsetParent !== null && el.getBoundingClientRect().height > 0; }
  function mulaMode() { var c = document.body.classList; return c.contains('moola-only') || c.contains('view-mula'); }
  function verses() { return [].slice.call(document.querySelectorAll('section[id^="v-"],section[id^="vb-"]')); }
  function atLine() { var y = line(), all = verses();
    for (var i = 0; i < all.length; i++) { if (!shown(all[i])) continue; var r = all[i].getBoundingClientRect(); if (r.bottom > y) return { id: all[i].id, off: r.top - y }; }
    return null; }
  function find(id) {   // the same verse in the new view; VC: v-<n> ⇄ vb-<n> / vb-<n-0.5> (half-verse edition units)
    var el = document.getElementById(id); if (shown(el)) return el;
    var m = /^(v|vb)-(.+)$/.exec(id); if (!m) return null; var n = parseFloat(m[2]), c = [];
    if (m[1] === 'v') c = ['vb-' + m[2], 'vb-' + (n - 0.5)]; else c = ['v-' + Math.floor(n), 'v-' + m[2]];
    for (var i = 0; i < c.length; i++) { el = document.getElementById(c[i]); if (shown(el)) return el; }
    el = document.getElementById(id);   // hidden in this view (e.g. a commentary-only intro): the next verse that is shown
    if (el) { var all = verses(), k = all.indexOf(el); for (var j = k + 1; j < all.length; j++) if (shown(all[j])) return all[j]; }
    return null; }
  function blockAt() {   // the text block under the top line (a verse word, a ṭīkā / vārttika paragraph…), to keep it exactly in place
    var y = line() + 2, x = Math.round(document.documentElement.clientWidth / 2), e = document.elementFromPoint(x, y);
    var b = e && e.closest && e.closest('.w,p,li,.vk-v,.tk-inline,.vc-pre,.side-zone,.mula-zone,.tika');
    return b && !/^(section|body|html)$/i.test(b.tagName) ? { el: b, off: b.getBoundingClientRect().top - y + 2 } : null; }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#viewseg button,.viewbar button'); if (!b) return;
    var wasMula = mulaMode(), a = atLine(), k = blockAt(); if (!a) return;
    requestAnimationFrame(function () {
      if (mulaMode() === wasMula) return;   // the click did not change the view
      var back = wasMula && mem && mem.at === a.id, el, off;
      if (back) { el = find(mem.id); off = mem.off; }                       // back to the commentary: the exact spot the reader left
      else if (k && shown(k.el)) { el = k.el; off = k.off; }                // what the reader was looking at is in both views: keep it put
      else { el = find(a.id); off = Math.max(a.off, 0); }                   // otherwise: that verse at the top
      if (!el) return;
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - line() - off, behavior: 'instant' });
      var v = el.closest ? el.closest('section[id^="v-"],section[id^="vb-"]') : null;
      mem = wasMula ? null : { id: a.id, off: a.off, at: (v || el).id };   // leaving the commentary: remember the spot and the verse we landed on
    });
  }, true);
})();

// ---- ⚑ REPORT AN ISSUE WITH THIS WORD (Harsha 2026-10-25): a row at the foot of every PINNED word card — #tip (mūla) and .gtip
// (commentary), the two cards peek.js controls, on every reading page and every renderer (all mark a pinned card .pinned). Added here
// at run time so no builder changes. The report carries what the reader saw: the word (as printed, whatever script is showing), the
// card's own text (meaning, grammar, peel, any ⚑ editorial note), the verse, the layer, the word's key (data-k) and a link back.
// Sent through FormSubmit (fetch, no script from them — offline-safe); if that fails, the reader's mail app opens with the same text.
// Hidden with the other report buttons by ⚙ "report-an-issue buttons" (vv-store.js, html.vv-no-report).
(function () {
  'use strict';
  if (window.__vvWordReport) return; window.__vvWordReport = true;
  var MAIL = 'narayanamurthysharma@gmail.com';
  var ENDPOINT = 'https://formsubmit.co/ajax/' + MAIL;
  var NAME_KEY = 'sandhiQuizReporterName', EMAIL_KEY = 'sandhiQuizReporterEmail';   // the same keys as the gym's reporter (app.js)
  var KINDS = ['Meaning', 'Grammar (vibhakti, kāraka, dhātu …)', 'Samāsa vigraha', 'The text itself (a misprint, a wrong reading)', 'A link that lands in the wrong place', 'Something else'];
  var lastWord = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; localStorage.setItem(k, v); } catch (e) { return ''; } }
  function orig(n) { return (window.VVTranslit && VVTranslit.orig) ? VVTranslit.orig(n) : n.nodeValue; }
  // text of an element as printed (Devanāgarī even when another script is showing), one line per block; our own row left out
  function textOf(root) {
    var out = '';
    (function walk(e) {
      for (var c = e.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { out += orig(c); continue; }
        if (c.nodeType !== 1 || (c.classList && c.classList.contains('vvrep-row'))) continue;
        var d = getComputedStyle(c).display; if (d === 'none') continue;
        var blk = c.tagName === 'BR' || !/^inline/.test(d);   // block, flex, grid, list-item, table-row … = its own line
        if (blk) out += '\n'; else out += ' '; walk(c); if (blk) out += '\n'; else out += ' ';
      }
    })(root);
    return out.replace(/[ \t]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim();
  }
  function refOf(w) {
    var v = w && w.closest('[id^="v-"],[id^="vb-"]'); if (v) return v.id.replace(/^vb?-/, '');
    var k = w && w.getAttribute('data-k'), m = k && /^[^:]+:([^:]+):/.exec(k); return m ? m[1] : '';
  }
  function layerOf(w) {
    if (!w) return '';
    var lab = w.closest('[data-label]'); if (lab) return lab.getAttribute('data-label');
    if (w.closest('.mula-zone')) return 'मूलम्';
    if (w.closest('.bh-zone')) return 'भाष्यम्';
    var sd = w.closest('[data-side]'); if (sd && sd.tagName !== 'BUTTON') return sd.getAttribute('data-side');
    // no named layer on this page: report where the word sits (its containers' classes), never a guessed name
    var chain = [], e = w.parentElement;
    while (e && e !== document.body && chain.length < 4) { if (e.className && typeof e.className === 'string' && !/^v$/.test(e.className)) chain.unshift(e.className.split(' ')[0]); if (e.id && /^vb?-/.test(e.id)) break; e = e.parentElement; }
    return chain.length ? 'in ' + chain.join(' > ') : '';
  }
  function pageUrl() { return location.href.split('#')[0].split('?')[0]; }
  function device() {
    var u = navigator.userAgent || '';
    var os = /Android/i.test(u) ? 'Android' : /iPhone|iPod/i.test(u) ? 'iOS' : /iPad/i.test(u) ? 'iPadOS' : /Windows/i.test(u) ? 'Windows' : /Mac OS X|Macintosh/i.test(u) ? 'macOS' : /Linux/i.test(u) ? 'Linux' : 'other';
    var br = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Version\/.*Safari/.test(u) ? 'Safari' : 'other';
    return os + ' · ' + br + ' · ' + (window.innerWidth || 0) + '×' + (window.innerHeight || 0) + ((navigator.serviceWorker && navigator.serviceWorker.controller) ? ' · offline cache' : '');
  }
  function context(card) {
    var w = lastWord, word = w ? textOf(w) : '', ref = refOf(w), layer = layerOf(w);
    var title = (document.title || '').replace(/\s+/g, ' ').trim();
    return {
      word: word, ref: ref, layer: layer, title: title,
      link: pageUrl() + (word ? '?hl=' + encodeURIComponent(word) : '') + (ref ? '#v-' + ref : ''),
      key: (w && w.getAttribute('data-k')) || '',
      card: textOf(card), device: device()
    };
  }
  function details(c) {
    return ['word: ' + (c.word || '(unknown)'), 'text: ' + c.title, 'verse: ' + (c.ref || '(n/a)'), 'layer: ' + (c.layer || '(n/a)'),
      'word key: ' + (c.key || '(n/a)'), 'open: ' + c.link, '', 'what the card showed:', c.card || '(empty)', '', 'device: ' + c.device].join('\n');
  }

  var css = document.createElement('style');
  css.textContent =
    '.vvrep-row{margin-top:8px;padding-top:6px;border-top:1px solid var(--tipline,rgba(128,128,128,.35));text-align:right}' +
    '.vvrep-row button{font:12px/1.3 system-ui,sans-serif;background:none;border:0;padding:2px 0;color:inherit;opacity:.72;cursor:pointer}' +   // the card's own ink: cards invert against the page theme
    '.vvrep-row button:hover{opacity:1;text-decoration:underline}' +
    'html.vv-no-report .vvrep-row{display:none!important}' +
    '#vvrep-ov{position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}' +
    '#vvrep-box{background:var(--card,#fff);color:var(--ink,#111);border:1px solid var(--line,#ddd);border-radius:14px;max-width:460px;width:100%;max-height:92vh;overflow:auto;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.35);font:14px/1.45 system-ui,sans-serif;box-sizing:border-box}' +
    '#vvrep-box h3{margin:0 0 2px;font-size:16px}#vvrep-box .w0{font:600 18px/1.4 "Noto Serif Devanagari",serif;margin:0 0 2px}' +
    '#vvrep-box .sub{margin:0 0 10px;font-size:12px;color:var(--muted,#6b7280)}' +
    '#vvrep-box label{display:block;font-size:12px;color:var(--muted,#6b7280);margin:8px 0 3px}' +
    '#vvrep-box select,#vvrep-box textarea,#vvrep-box input{width:100%;box-sizing:border-box;font:inherit;color:var(--ink,#111);background:var(--bg,#fafafa);border:1px solid var(--line,#ddd);border-radius:8px;padding:7px 9px}' +
    '#vvrep-box textarea{min-height:84px;resize:vertical}#vvrep-box .two{display:flex;gap:8px}#vvrep-box .two>div{flex:1}' +
    '#vvrep-box details{margin-top:10px;font-size:12px;color:var(--muted,#6b7280)}#vvrep-box pre{white-space:pre-wrap;font:11px/1.5 ui-monospace,monospace;background:var(--bg,#fafafa);border:1px solid var(--line,#ddd);border-radius:8px;padding:8px;max-height:160px;overflow:auto;margin:6px 0 0}' +
    '#vvrep-box .row{display:flex;gap:10px;justify-content:flex-end;align-items:center;margin-top:12px}#vvrep-box .st{flex:1;font-size:12px;color:var(--muted,#6b7280)}' +
    '#vvrep-box button{font:inherit;font-size:13px;border-radius:8px;padding:7px 14px;cursor:pointer;border:1px solid var(--line,#ddd);background:var(--card,#fff);color:var(--ink,#111)}' +
    '#vvrep-box button.go{background:var(--ink,#111);color:var(--bg,#fff)}#vvrep-box .hp{position:absolute;left:-9999px}';
  (document.head || document.documentElement).appendChild(css);

  function openForm(card) {
    var c = context(card), old = document.getElementById('vvrep-ov'); if (old) old.remove();
    var ov = document.createElement('div'); ov.id = 'vvrep-ov';
    ov.innerHTML = '<div id="vvrep-box" role="dialog" aria-modal="true" aria-labelledby="vvrep-h"><h3 id="vvrep-h">Report an issue with this word</h3>' +
      '<p class="w0">' + esc(c.word || '') + '</p><p class="sub">' + esc([c.title, c.ref, c.layer].filter(Boolean).join(' · ')) + '</p>' +
      '<label for="vvrep-k">What is wrong?</label><select id="vvrep-k">' + KINDS.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select>' +
      '<label for="vvrep-t">Details</label><textarea id="vvrep-t" placeholder="What should it be? A source or reason helps."></textarea>' +
      '<div class="two"><div><label for="vvrep-n">Name (optional)</label><input id="vvrep-n" autocomplete="name"></div>' +
      '<div><label for="vvrep-e">Email, for a reply (optional)</label><input id="vvrep-e" type="email" autocomplete="email"></div></div>' +
      '<input class="hp" id="vvrep-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<details><summary>Sent with your report</summary><pre>' + esc(details(c)) + '</pre></details>' +
      '<div class="row"><span class="st" id="vvrep-st"></span><button type="button" id="vvrep-x">Cancel</button><button type="button" class="go" id="vvrep-go">Send</button></div></div>';
    document.body.appendChild(ov);
    var $ = function (id) { return document.getElementById(id); };
    $('vvrep-n').value = ls(NAME_KEY); $('vvrep-e').value = ls(EMAIL_KEY);
    function close() { ov.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    $('vvrep-x').addEventListener('click', close);
    $('vvrep-t').focus();
    $('vvrep-go').addEventListener('click', function () {
      var go = $('vvrep-go'), st = $('vvrep-st'), kind = $('vvrep-k').value, note = $('vvrep-t').value.trim();
      var name = $('vvrep-n').value.trim(), email = $('vvrep-e').value.trim();
      ls(NAME_KEY, name); ls(EMAIL_KEY, email);
      var subject = 'Reading report: ' + (c.word || 'word') + ' — ' + c.title + (c.ref ? ' ' + c.ref : '') + ' (' + kind.split(' (')[0] + ')';
      var message = 'Problem: ' + kind + '\n' + (note ? 'Details: ' + note + '\n' : '') + '\n' + details(c);
      if ($('vvrep-hp').value) { close(); return; }   // a bot filled the hidden field
      go.disabled = true; st.textContent = 'Sending…';
      fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: name || '(anonymous)', email: email || '', _replyto: email || undefined, _subject: subject, _template: 'box', _captcha: 'false', message: message })
      }).then(function (r) { return r.ok ? r.json() : { success: 'false' }; }).then(function (j) {
        if (String(j && j.success) !== 'true') throw new Error('not accepted');
        st.textContent = 'Sent — thank you.'; go.style.display = 'none'; $('vvrep-x').textContent = 'Close';
      }).catch(function () {
        // offline or the form service refused: hand the same report to the reader's mail app
        st.textContent = 'Could not send from here — opening your mail app instead.';
        location.href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent((name ? 'From: ' + name + (email ? ' <' + email + '>' : '') + '\n\n' : '') + message);
        go.disabled = false;
      });
    });
  }

  function decorate(card) {
    if (!card.classList.contains('pinned') || card.querySelector('.vvrep-row')) return;
    var row = document.createElement('div'); row.className = 'vvrep-row';
    row.innerHTML = '<button type="button" title="Tell us what looks wrong on this card">⚑ report an issue with this word</button>';
    row.querySelector('button').addEventListener('click', function (e) { e.stopPropagation(); openForm(card); });
    card.appendChild(row);
  }
  var watched = [];
  function watch(card) {
    if (watched.indexOf(card) >= 0) return; watched.push(card);
    new MutationObserver(function () { decorate(card); }).observe(card, { attributes: true, attributeFilter: ['class'], childList: true });
    decorate(card);
  }
  function scan() { [].forEach.call(document.querySelectorAll('#tip,.gtip'), watch); }
  // the word whose card is being pinned (cards are filled by the page's own click handler, after this capture listener)
  document.addEventListener('click', function (e) {
    var w = e.target.closest && e.target.closest('.w,.gw');
    if (w && !w.closest('#tip,.gtip,#vvrep-ov')) lastWord = w;
  }, true);
  function start() {
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true });   // .gtip is created by the page's script at load
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
