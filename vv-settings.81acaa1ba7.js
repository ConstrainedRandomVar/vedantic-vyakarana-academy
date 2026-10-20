// vv-settings.js — THE ONE ⚙ Settings panel (Harsha 2026-10-21, feedback #3 #4 #5 #6 #8): opened by the homepage ⚙ (app.js)
// AND by the ⚙ on every reading page (vv-reader.js loads this file on first click). Same content, wording and order in both
// places. Every setting is a plain localStorage key shared by the whole site (and its other pages/tabs):
//   vv_text_size   reading-page text scale (0.85 · 0.92 · 1 · 1.1 · 1.2; default 1) — applied by vv-reader.js (__vvTextScale)
//   vv_script      reading-page script — applied by translit.js (#scriptpick)
//   vv_quiet_hover word cards + "bookmark passage" prompt on hover: OFF by default = quiet ('0' = always show) — peek.js
//   vv_pill_*      commentary markers: HIDDEN by default ('1' = shown) — applied by vv-reader.js (__vvApplyPills)
//   fold:<key>     commentary fold-out defaults (VVStore.folds)
//   vyakarana_auto_advance  grammar practice (app.js), on by default
// A reader's explicit earlier choice ('0'/'1' already stored) is always kept; only unset keys take the defaults above.
(function () {
  'use strict';
  if (window.VVSettings) return;
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var SIZES = [['0.85', '85%'], ['0.92', '92%'], ['1', '100%'], ['1.1', '110%'], ['1.2', '120%']];
  var SCRIPTS = [['dev', 'देवनागरी'], ['iast', 'IAST'], ['kannada', 'ಕನ್ನಡ'], ['tamil', 'தமிழ்'], ['telugu', 'తెలుగు'], ['malayalam', 'മലയാളം'],
    ['bengali', 'বাংলা'], ['gujarati', 'ગુજરાતી'], ['cyrillic', 'Русский'], ['siddham', 'Siddhaṃ 梵字'], ['katakana', 'カタカナ']];
  // Commentary markers (CLAUDE.md 9j: महावाक्यम् is never translated). Each sample is drawn with the reading pages' own marker
  // look (copied below as .vvset-* so it also renders on the homepage) and appears/disappears with its switch.
  var MARKERS = [
    ['vv_pill_praman', 'Source of proof (प्रमाण)', 'tags a statement as resting on scripture (श्रुतिः), reasoning (युक्तिः) or experience (अनुभवः).',
      '<span class="vvset-prb">श्रुतिः</span>‘सदेव सोम्येदमग्र आसीत्’ इति श्रुतेः ।'],
    ['vv_pill_abhyu', 'Concession (अभ्यु॰)', 'marks where the commentator grants a point for argument’s sake before answering it.',
      'अस्तु<span class="vvset-conc">अभ्यु॰</span> नाम भेदः, तथापि …'],
    ['vv_pill_maha', 'महावाक्यम्', 'flags an identity statement such as तत्त्वमसि or अहं ब्रह्मास्मि.',
      '<span class="vvset-maha">महावाक्यम्</span>तत्त्वमसि श्वेतकेतो ।']
  ];
  function textScale() { var v = get('vv_text_size'); return SIZES.some(function (s) { return s[0] === v; }) ? v : '1'; }
  function quietOn() { return get('vv_quiet_hover') !== '0'; }
  function markerOn(k) { return get(k) === '1'; }
  function sisterSite() { try { return !!(window.VVStore && VVStore.siteOf && VVStore.siteOf(location.href) === 'sahitya'); } catch (e) { return false; } }
  function readingPage() { return !!window.__vvReader; }
  var touch = !!(window.matchMedia && !matchMedia('(hover: hover) and (pointer: fine)').matches);

  var CSS = '#vvset-ov{position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;padding:16px}'
    + '#vvset-ov.on{display:flex}'
    + '#vvset-box{background:var(--card,#fff);color:var(--ink,#2b2620);border-radius:12px;max-width:440px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:18px 20px;box-shadow:0 12px 40px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.45}'
    + '#vvset-box h2{margin:0 0 12px;font-size:18px;color:var(--brand,#b45309)}'
    + '#vvset-box .sep{font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--muted,#7a6a55);border-bottom:1px solid var(--line,#e5ded0);padding-bottom:4px;margin:6px 0 12px}'
    + '#vvset-box .sep .dv{font-family:"Noto Serif Devanagari",serif;font-size:14px}'
    + '#vvset-box .row{margin:0 0 16px}#vvset-box .lab{font-weight:600;margin-bottom:5px}'
    + '#vvset-box .hint{font-size:12px;color:var(--muted,#7a6a55);margin-top:4px}'
    + '#vvset-box select{font:inherit;color:inherit;background:var(--bg,#fff);border:1px solid var(--line,#ccc);border-radius:8px;padding:6px 9px;min-width:150px}'
    + '#vvset-box .chk{display:flex;align-items:flex-start;gap:8px;cursor:pointer}#vvset-box .chk input{margin-top:3px}'
    + '#vvset-box .sizes{display:flex;align-items:center;gap:4px;flex-wrap:wrap}'
    + '#vvset-box .sizes button{font:inherit;font-size:13px;border:1px solid var(--line,#ccc);background:var(--bg,#fff);color:inherit;border-radius:7px;padding:3px 8px;cursor:pointer}'
    + '#vvset-box .sizes button.on{border-color:var(--brand,#d97706);color:var(--brand,#b45309);font-weight:700}'
    + '#vvset-box .sizes .aa{font-family:"Noto Serif Devanagari",serif;font-weight:700;color:var(--muted,#7a6a55);padding:0 4px}'
    + '#vvset-box .prev{margin-top:6px;font-family:"Noto Serif Devanagari",serif;border:1px dashed var(--line,#ddd);border-radius:8px;padding:6px 9px}'
    + '#vvset-box .mk{margin:0 0 10px}#vvset-box .mk .sample{margin:4px 0 0 24px;font-family:"Noto Serif Devanagari",serif;font-size:15px;color:var(--ink,#333)}'
    + '#vvset-box .mk.off .sample .vvset-prb,#vvset-box .mk.off .sample .vvset-conc,#vvset-box .mk.off .sample .vvset-maha{display:none}'
    + '#vvset-box .mk .sample:before{content:"e.g. ";font-family:-apple-system,sans-serif;font-size:11px;color:var(--muted,#7a6a55)}'
    + '.vvset-prb{display:inline-block;font-size:10px;font-weight:700;line-height:1.4;padding:0 6px;border-radius:9px;margin-inline-end:4px;vertical-align:1px;border:1px solid #5c0f60;color:#5c0f60;background:rgba(173,36,178,.12)}'
    + '.vvset-maha{display:inline-block;font-size:10px;font-weight:700;line-height:1.4;padding:0 6px;border-radius:9px;margin-inline-end:5px;vertical-align:1px;border:1px solid #db2777;color:#db2777}'
    + '.vvset-conc{vertical-align:super;font-size:.56em;font-weight:700;color:var(--muted,#7a6a55);margin-inline-start:1px}'
    + '@media(prefers-color-scheme:dark){html:not([data-theme=light]) .vvset-prb{border-color:#d977de;color:#d977de}html:not([data-theme=light]) .vvset-maha{border-color:#f472b6;color:#f472b6}}'
    + 'html[data-theme=dark] .vvset-prb{border-color:#d977de;color:#d977de}html[data-theme=dark] .vvset-maha{border-color:#f472b6;color:#f472b6}'
    + '#vvset-box .done{text-align:right}#vvset-box .done button{font:inherit;border:1px solid var(--line,#ccc);background:var(--bg,#fff);color:inherit;border-radius:8px;padding:6px 14px;cursor:pointer}'
    + '@media(max-width:640px){#vvset-ov{align-items:flex-end;padding:0}#vvset-box{max-width:none;border-radius:14px 14px 0 0;max-height:85vh}}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function build() {
    var S = window.VVStore, folds = (S && S.folds) ? S.folds.list() : [];
    var h = '<h2>⚙ Settings</h2>'
      + '<div class="sep"><span class="dv">पठनम्</span> · Reading</div>'
      + '<div class="row"><div class="lab">Text size</div><div class="sizes"><span class="aa" style="font-size:12px">अ</span>'
      + SIZES.map(function (s) { return '<button type="button" data-size="' + s[0] + '">' + s[1] + '</button>'; }).join('')
      + '<span class="aa" style="font-size:18px">अ</span></div>'
      + '<div class="prev" id="vvset-prev">धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।</div>'
      + '<div class="hint">All text on the reading pages — mūla, commentaries, headings and word cards.</div></div>'
      + '<div class="row"><div class="lab">Script</div><select id="vvset-script">' + SCRIPTS.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('') + '</select>'
      + '<div class="hint">Shows the same Sanskrit in Devanāgarī, IAST or another script.</div></div>'
      + '<div class="row"><div class="lab">Word grammar on hover</div><label class="chk"><input type="checkbox" id="vvset-hover"' + (touch ? ' disabled' : '') + '> Show a word’s grammar card when the mouse rests on it, and “☆ bookmark passage” when you select text</label>'
      + '<div class="hint">' + (touch ? 'Phones and tablets: just tap a word to see its grammar.' : 'Off by default (quiet) — hold <b>Cmd/Ctrl</b> (or <b>Alt</b>) to see them anyway. The ☆ verse bookmark in the page bar always works.') + '</div></div>';
    if (!sisterSite()) h += '<div class="row"><div class="lab">Commentary markers</div><div class="hint" style="margin:0 0 8px">Small coloured tags in the bhāṣya that show how an argument works. Off by default, for a clean reading text.</div>'
      + MARKERS.map(function (m) { return '<div class="mk" data-mk="' + m[0] + '"><label class="chk"><input type="checkbox" data-pill="' + m[0] + '"> <span><b>' + m[1] + '</b> — ' + m[2] + '</span></label><div class="sample">' + m[3] + '</div></div>'; }).join('')
      + '</div>';
    if (folds.length) h += '<div class="row"><div class="lab">Commentary fold-outs</div>'
      + folds.map(function (f) { return '<label class="chk" style="justify-content:space-between;gap:10px;margin-bottom:4px"><span>' + esc(f.label) + ' <span class="hint" style="display:inline">· ' + esc(f.sub || '') + '</span></span><select data-fold="' + esc(f.key) + '"><option value="collapsed">Collapsed</option><option value="expanded">Expanded</option></select></label>'; }).join('')
      + '<div class="hint">How collapsed commentary layers open when a page loads. Each page’s <b>टीका ⇕</b> button expands or collapses them on that page only.</div></div>';
    h += '<div class="sep"><span class="dv">व्याकरणम्</span> · Grammar practice</div>'
      + '<div class="row"><label class="chk"><input type="checkbox" id="vvset-auto"> Auto-advance to the next question after answering</label></div>'
      + '<div class="done"><button type="button" id="vvset-done">Done</button></div>';
    return h;
  }
  function reflect(box) {
    var sz = textScale();
    [].forEach.call(box.querySelectorAll('[data-size]'), function (b) { b.classList.toggle('on', b.getAttribute('data-size') === sz); });
    var prev = box.querySelector('#vvset-prev'); if (prev) prev.style.fontSize = (17 * parseFloat(sz)) + 'px';
    var sc = box.querySelector('#vvset-script'); if (sc) sc.value = get('vv_script') || 'dev';
    var hv = box.querySelector('#vvset-hover'); if (hv) hv.checked = !quietOn();
    [].forEach.call(box.querySelectorAll('[data-pill]'), function (c) { c.checked = markerOn(c.getAttribute('data-pill')); c.closest('.mk').classList.toggle('off', !c.checked); });
    var S = window.VVStore; if (S && S.folds) [].forEach.call(box.querySelectorAll('select[data-fold]'), function (s) { s.value = S.folds.get(s.getAttribute('data-fold')); });
    var au = box.querySelector('#vvset-auto'); if (au) au.checked = get('vyakarana_auto_advance') !== '0';
  }
  function wire(ov, box) {
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    box.querySelector('#vvset-done').addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ov.classList.contains('on')) close(); });
    [].forEach.call(box.querySelectorAll('[data-size]'), function (b) { b.addEventListener('click', function () {
      set('vv_text_size', b.getAttribute('data-size')); if (window.__vvTextScale) window.__vvTextScale(parseFloat(b.getAttribute('data-size'))); reflect(box); }); });
    var sc = box.querySelector('#vvset-script'); sc.addEventListener('change', function () {
      set('vv_script', sc.value); var pick = document.getElementById('scriptpick');   // reading page: translit.js applies it live
      if (pick) { pick.value = sc.value; pick.dispatchEvent(new Event('change')); } });
    var hv = box.querySelector('#vvset-hover'); hv.addEventListener('change', function () {
      set('vv_quiet_hover', hv.checked ? '0' : '1'); if (window.VVPeek && VVPeek.refresh) VVPeek.refresh(); if (window.__vvHintUsed) window.__vvHintUsed(); });
    [].forEach.call(box.querySelectorAll('[data-pill]'), function (c) { c.addEventListener('change', function () {
      set(c.getAttribute('data-pill'), c.checked ? '1' : '0'); if (window.__vvApplyPills) window.__vvApplyPills(); reflect(box); }); });
    var S = window.VVStore; [].forEach.call(box.querySelectorAll('select[data-fold]'), function (s) { s.addEventListener('change', function () { if (S && S.folds) S.folds.set(s.getAttribute('data-fold'), s.value); }); });
    box.querySelector('#vvset-auto').addEventListener('change', function (e) { set('vyakarana_auto_advance', e.target.checked ? '1' : '0'); });
  }
  var ovEl = null;
  function open() {
    if (!ovEl) {
      var st = document.createElement('style'); st.id = 'vvset-style'; st.textContent = CSS; document.head.appendChild(st);
      ovEl = document.createElement('div'); ovEl.id = 'vvset-ov'; ovEl.setAttribute('role', 'dialog'); ovEl.setAttribute('aria-label', 'Settings');
      var box = document.createElement('div'); box.id = 'vvset-box'; box.innerHTML = build(); ovEl.appendChild(box); document.body.appendChild(ovEl);
      wire(ovEl, box);
    }
    reflect(ovEl.querySelector('#vvset-box'));
    ovEl.classList.add('on');
    if (window.__vvHintUsed) window.__vvHintUsed();   // opening ⚙ retires the reading-page hint (feedback #4)
  }
  function close() { if (ovEl) ovEl.classList.remove('on'); }

  // ---- 📖 Sanskrit dictionary box (Harsha 2026-10-21 #10): homepage header, reading-page bar, sister site. Devanāgarī or ITRANS
  // (converted with the search site's own toDeva); Enter opens sanskritkosha.com/?search=<word> in a NEW tab (their app reads
  // ?search= on load — Query.getQueryValue("search") → GlobalSearch.searchEverything). The tab is opened synchronously on Enter
  // (an async open would be popup-blocked); the converter is preloaded when the box opens. ----
  var KOSHA = 'https://sanskritkosha.com/?search=', SEARCH_LIB = '../prasthanatrayi-search/lib/sanskrit-search.js', libState = 0;
  function loadLib() { if (libState || (window.SanskritSearch && SanskritSearch.toDeva)) return; libState = 1;
    var sc = document.createElement('script'); sc.src = SEARCH_LIB; sc.onerror = function () { libState = 2; }; document.head.appendChild(sc); }
  function deva(q) { return (/[A-Za-z]/.test(q) && window.SanskritSearch && SanskritSearch.toDeva) ? SanskritSearch.toDeva(q) : q; }
  var DCSS = '.vvset-dict{position:fixed;z-index:2001;background:var(--card,#fff);color:var(--ink,#222);border:1px solid var(--line,#ddd);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:10px;width:min(320px,92vw);font:14px system-ui,sans-serif}'
    + '.vvset-dict form{display:flex;gap:6px}.vvset-dict input{flex:1;min-width:0;font:inherit;font-family:"Noto Serif Devanagari",system-ui,serif;padding:6px 8px;border:1px solid var(--line,#ccc);border-radius:7px;background:var(--bg,#fff);color:inherit}'
    + '.vvset-dict button{font:inherit;border:1px solid var(--brand,#d97706);background:var(--brand,#d97706);color:#fff;border-radius:7px;padding:5px 10px;cursor:pointer}'
    + '.vvset-dict small{display:block;margin-top:6px;color:var(--muted,#7a6a55);font-size:11.5px}';
  var dictEl = null;
  function closeDict() { if (dictEl) { dictEl.remove(); dictEl = null; } }
  function dict(anchor, prefill) {
    if (dictEl) { closeDict(); return; }
    if (!document.getElementById('vvset-dcss')) { var st = document.createElement('style'); st.id = 'vvset-dcss'; st.textContent = DCSS; document.head.appendChild(st); }
    loadLib();
    dictEl = document.createElement('div'); dictEl.className = 'vvset-dict'; dictEl.setAttribute('role', 'dialog');
    dictEl.innerHTML = '<form><input type="search" placeholder="Sanskrit word — देवनागरी or ITRANS" aria-label="Sanskrit word" autocomplete="off"><button type="submit">Look up ↗</button></form>'
      + '<small>Opens sanskritkosha.com (50+ dictionaries) in a new tab.</small>';
    document.body.appendChild(dictEl);
    var r = anchor.getBoundingClientRect(), w = dictEl.offsetWidth;
    dictEl.style.top = (r.bottom + 6) + 'px';
    dictEl.style.left = Math.max(8, Math.min(r.right - w, document.documentElement.clientWidth - w - 8)) + 'px';
    var inp = dictEl.querySelector('input'); inp.value = prefill || ''; inp.focus(); inp.select();
    dictEl.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault(); var q = inp.value.trim(); if (!q) return;
      var tab = window.open(KOSHA + encodeURIComponent(deva(q)), '_blank'); if (tab) try { tab.opener = null; } catch (x) {}
      closeDict();
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDict(); });
    setTimeout(function () { document.addEventListener('mousedown', function off(e) { if (!dictEl) { document.removeEventListener('mousedown', off); return; }
      if (!dictEl.contains(e.target) && e.target !== anchor) { closeDict(); document.removeEventListener('mousedown', off); } }); }, 0);
  }
  window.VVSettings = { open: open, close: close, dict: dict, textScale: textScale, quietOn: quietOn, markerOn: markerOn };
})();
