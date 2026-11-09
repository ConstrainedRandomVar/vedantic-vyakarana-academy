// vv-landing.js — the ग्रन्थाः pages' search landing (split out of sync.js 2026-10-13 so pages WITHOUT sync.js — the
// Vicārasāgara view — get it too). Loaded by sync.js (like peek.js) and by vv-insearch.js where sync.js is absent.
// window.__vvLand(term, {side, vk, id, reveal, scrollTo}) — the in-text search; ?hl=&side=&vk=&vw=#v-<ref> — search-tool links.
// ---- Search deep-link highlighter (?hl=<term>) — powers the search tool's "svādhyāya ↗" links.
// Finds the matched phrase in the target verse (from #v-<ref>) and highlights it, so the user lands ON
// the searched word, not just the verse. The search surface is the सन्धि (joined) form, so we reveal the
// सन्धि layer and match tolerantly (ignoring ZWNJ + whitespace) within a text node. Separate from the
// sync feature above; inert unless ?hl= is present. (2026-09-15) ----
// Also exposed as window.__vvLand(term, {side, vk, id}) for the in-text search (vv-insearch.js, 2026-10-13): the SAME
// landing code for a ?hl= deep link and an in-page hit; a new call clears the previous marks.
(function () {
  var term; try { term = new URLSearchParams(location.search).get('hl'); } catch (e) { term = null; }
  // the search engine's snippet mark can run over quotes/brackets/daṇḍas («तत्त्वमसि’ (»), which the page may render
  // differently — match on the letters: trim any leading/trailing non-letter run
  function trimTerm(t) { return String(t || '').replace(/^[^\u0900-\u0963\u0966-\u097F]+|[^\u0900-\u0963\u0966-\u097F]+$/g, ''); }
  term = term ? trimTerm(term) : '';
  // Canonicalize so a search term matches its sandhi/compound-joined surface: an independent vowel that
  // got absorbed after a consonant becomes a mātrā (आत्मा searched, but स्वात्मा shown → the आ is written ा).
  // Also drop ZWNJ + whitespace. This is the SAME lenient equivalence the search matcher uses.
  var VMAP = { 'आ': 'ा', 'इ': 'ि', 'ई': 'ी', 'उ': 'ु', 'ऊ': 'ू', 'ऋ': 'ृ', 'ॠ': 'ॄ', 'ऌ': 'ॢ', 'ए': 'े', 'ऐ': 'ै', 'ओ': 'ो', 'औ': 'ौ' };
  var COMBINING = /[ािीुूृॄॢेैोौंँः्]/;   // if a match starts on one of these, extend back to its base consonant
  function canon(c) { return VMAP[c] || c; }
  // AID: our reading-aid connectors (gloss "=", purport "→", unit "|") are never part of the text — skipped like whitespace on both sides,
  // else any phrase spanning one never matched (Ch 7.4.2 «…सङ्क्लृप्त्यै = सङ्कल्पनिमित्तम्», Harsha 2026-10-23)
  var AID = { '=': 1, '→': 1, '|': 1 };
  function nrmOf(raw) { var map = [], s = ''; for (var i = 0; i < raw.length; i++) { var c = raw[i]; if (c === '‌' || c === '‍' || AID[c] || /\s/.test(c)) continue; map.push(i); s += canon(c); } return { s: s, map: map }; }
  var nterm = '', rawTerm = '', fold = false;   // fold: relaxedIn's spelling-tolerant pass (nasal+्→ं, avagraha dropped)
  function foldStr(x) { return x.replace(/ऽ/g, '').replace(/[ङञणनम]्/g, 'ं'); }
  // ?hb=&ha= (search.html / vv-insearch.js via SVLinks.hlCtx): the letters just before/after the hit in the search snippet.
  // With them the page marks THE occurrence the reader clicked, not the first one in the verse (#9e — 2026-11-10: ‘shve.’ on
  // Māṇḍūkya 1.3 marked श्वेत… while the hit was विश्वेन…). Compared on letters only (no spaces/punctuation/avagraha),
  // independent vowels → mātrā, like the term. Without them: the first occurrence, as before.
  var ctxB = '', ctxA = '', CTX_MIN = 4;
  var LET = /[\u0900-\u0963\u0966-\u097F]/;
  function isLet(c) { return LET.test(c) && c !== 'ऽ'; }
  function ctxNorm(x) { var o = ''; x = String(x || ''); for (var i = 0; i < x.length; i++) if (isLet(x[i])) o += canon(x[i]); return o; }
  function setCtx(b, a) { ctxB = ctxNorm(b); ctxA = ctxNorm(a); }
  function hasCtx() { return !!(ctxB || ctxA); }
  function highlightIn(root) { return landIn([root]); }
  // Match over the concatenated VISIBLE text of root and mark each piece. In the bhāṣya every word is its own
  // span (+ a hidden पद copy .bhsp), so a per-text-node match never found a multi-word phrase ("आत्मैवेदमग्र
  // आसीत्", BS 3.3.16) and could land on the invisible पद copy instead (2026-10-10).
  function scan(root) {
    var vis = new Map();
    function shown(el) {
      if (!el || el === root.parentNode) return true;
      if (vis.has(el)) return vis.get(el);
      var v = getComputedStyle(el).display !== 'none' && shown(el.parentElement);
      vis.set(el, v); return v;
    }
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), node, s = '', map = [];   // map[k] = [node, offset]
    while ((node = w.nextNode())) {
      var raw = node.nodeValue; if (!raw || !raw.trim() || !shown(node.parentElement) || node.parentElement.closest('#vvs')) continue;   // never the in-text search panel's own snippets
      for (var i = 0; i < raw.length; i++) { var c = raw[i]; if (c === '\u200c' || c === '\u200d' || AID[c] || /\s/.test(c)) continue;
        if (fold) { if (c === 'ऽ') continue; if ('ङञणनम'.indexOf(c) >= 0 && raw[i + 1] === '्') { map.push([node, i, i + 2]); s += 'ं'; i++; continue; } }
        map.push([node, i, i + 1]); s += canon(c); }
    }
    return { s: s, map: map };
  }
  // one occurrence's agreement with the snippet context: common suffix (before) + common prefix (after), letters only
  function ctxScore(sc, pos) {
    var s = sc.s, b = '', a = '', i, nb = 0, na = 0;
    for (i = pos - 1; i >= 0 && b.length < ctxB.length; i--) if (isLet(s[i])) b = s[i] + b;
    for (i = pos + nterm.length; i < s.length && a.length < ctxA.length; i++) if (isLet(s[i])) a += s[i];
    while (nb < b.length && nb < ctxB.length && b[b.length - 1 - nb] === ctxB[ctxB.length - 1 - nb]) nb++;
    while (na < a.length && na < ctxA.length && a[na] === ctxA[na]) na++;
    return { score: nb + na, full: nb === ctxB.length && na === ctxA.length };
  }
  // every occurrence of the term in these roots, in reading order
  function occsIn(roots) {
    var out = [];
    for (var r = 0; r < roots.length; r++) { if (!roots[r]) continue; var sc = scan(roots[r]), pos = -1;
      while ((pos = sc.s.indexOf(nterm, pos + 1)) >= 0) { var q = hasCtx() ? ctxScore(sc, pos) : { score: 0, full: false }; out.push({ sc: sc, pos: pos, score: q.score, full: q.full }); } }
    return out;
  }
  // strict: only an occurrence whose context agrees in full. lenient: the single best (≥ CTX_MIN letters, no tie), or the
  // only occurrence there is. Several and none clearly right → null (no mark beats a wrong occurrence, #9e).
  function pick(occs, strict) {
    var i; for (i = 0; i < occs.length; i++) if (occs[i].full) return occs[i];
    if (strict || !occs.length) return null;
    if (occs.length === 1) return occs[0];
    var best = null, tie = false;
    for (i = 0; i < occs.length; i++) { if (!best || occs[i].score > best.score) { best = occs[i]; tie = false; } else if (occs[i].score === best.score) tie = true; }
    return best && !tie && best.score >= CTX_MIN ? best : null;
  }
  // mark one occurrence in these roots: no context → the first (the old behaviour); context → pick()
  function landIn(roots, strict) {
    if (!hasCtx()) { for (var r = 0; r < roots.length; r++) { if (!roots[r]) continue; var sc = scan(roots[r]), p = sc.s.indexOf(nterm); if (p >= 0) return markAt(sc, p); } return null; }
    var o = pick(occsIn(roots), strict); return o ? markAt(o.sc, o.pos) : null;
  }
  function markAt(sc, pos) {
    var map = sc.map;
    var first = map[pos];
    if (first[1] > 0 && COMBINING.test(first[0].nodeValue[first[1]])) first = [first[0], first[1] - 1];
    // one [node, start, end] segment per text node touched, wrapped back-to-front so offsets stay valid
    var segs = [], k;
    for (k = pos; k < pos + nterm.length; k++) {
      var nd = map[k][0], off = map[k][1], en = map[k][2], sg = segs[segs.length - 1];
      if (sg && sg[0] === nd) sg[2] = en; else segs.push([nd, off, en]);
    }
    segs[0][1] = first[1];
    var mark = null;
    for (k = segs.length - 1; k >= 0; k--) {
      try {
        var r = document.createRange(); r.setStart(segs[k][0], segs[k][1]); r.setEnd(segs[k][0], segs[k][2]);
        var m = document.createElement('mark'); m.className = 'svhl'; r.surroundContents(m); mark = m;
      } catch (e) {}
    }
    return mark;
  }
  function forwardFrom(el, strict) {
    if (!el || !el.id || el.id.indexOf('v-') !== 0) return null;
    var all = document.querySelectorAll('[id^="v-"]'), seen = false, left = strict ? 6 : 1e9;   // strict (context) pass: a span block's next few verses only
    for (var i = 0; i < all.length && left > 0; i++) {
      if (all[i] === el) { seen = true; continue; }
      if (seen && !el.contains(all[i])) { left--; var m = landIn([all[i]], strict); if (m) return m; }
    }
    return null;
  }
  // ?hv=1 — a CITATION link (cite_links hlHref): the quoted words belong to THIS verse only. If they aren't there verbatim,
  // retry the sandhi-edge forms a quotation loses inside a verse — the initial अ absorbed/elided (‘अन्या…’ in …मन्या… /
  // …तेऽन्या…) and a final visarga/anusvāra/halant (…वाचः → वाचो) — still inside the verse; never onward, never page-wide.
  function relaxedIn(root) {
    // tried in order, first hit wins: the whole quote, then its first 3 words (a long quote often varies later on); each
    // verbatim, then spelling-folded (म्/ं, avagraha); each with the edge forms — initial अ absorbed/elided, final
    // visarga/anusvāra/halant, final mātrā (‘…आत्मा’ quoted, …आत्मेति in the verse). Measured over the 2093 citation links
    // (2026-10-20): 58.5% found verbatim → 76.3% with these, the rest just scroll to the verse as before.
    var orig = nterm, m = null, tried = {}, words = rawTerm.split(/\s+/).filter(Boolean);
    var bases = [rawTerm]; if (words.length > 3) bases.push(words.slice(0, 3).join(' '));
    var edges = function (t) { var a = t.charAt(0) === 'अ' ? t.slice(1) : t, z = function (x) { return x.replace(/[ःं्]$/, ''); },
      zm = function (x) { return x.replace(/[ािीुूृेैोौःं्]+$/, ''); }; return [t, a, z(t), z(a), zm(t), zm(a)]; };
    outer: for (var bi = 0; bi < bases.length; bi++) for (var f = 0; f < 2; f++) {
      var base = nrmOf(bases[bi]).s; if (f) base = foldStr(base);
      var vs = edges(base);
      for (var vi = 0; vi < vs.length; vi++) { var v = vs[vi], key = f + '|' + v;
        if (v.length < 3 || tried[key] || (!f && v === orig)) continue; tried[key] = 1;
        nterm = v; fold = !!f; m = highlightIn(root); if (m) break outer; } }
    nterm = orig; fold = false; return m;
  }
  function clearMarks() {
    document.querySelectorAll('mark.svhl').forEach(function (m) { var p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
  }
  // opts: {side, vk, id} — id = the verse element id to search first (else the URL hash); scrollTo(el) overrides scrolling
  function land(t, opts) {
    opts = opts || {}; rawTerm = trimTerm(t); nterm = nrmOf(rawTerm).s; if (!nterm) return;
    setCtx(opts.hb, opts.ha);
    clearMarks(); run(opts);
  }
  window.__vvLand = land;
  function run(opts) {
    opts = opts || {};
    var scrollEl = opts.scrollTo || function (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} };
    // Reveal the सन्धि (joined) layer — that's the surface the search matches against. Two view
    // conventions exist: VC bhāṣya uses mode-*, the unified upaniṣad/Gita views use metmode-*. Force
    // BOTH to sandhi (harmless where absent) — else a पद-mode reader lands on a mark inside a
    // display:none .vjoin and sees nothing (the 2026-09-16 mandukya ?hl= miss).
    try {
      document.body.classList.remove('mode-pada'); document.body.classList.add('mode-sandhi');
      document.body.classList.remove('metmode-pada'); document.body.classList.add('metmode-sandhi');
    } catch (e) {}
    if (!document.getElementById('svhl-style')) {
      var st = document.createElement('style'); st.id = 'svhl-style';
      st.textContent = '.svhl{background:#fde68a;color:inherit;border-radius:2px;padding:0 1px;box-shadow:0 0 0 2px #fde68a}@media(prefers-color-scheme:dark){:root:not([data-theme=light]) .svhl{background:#8a7414;color:#fff;box-shadow:0 0 0 2px #8a7414}}:root[data-theme=dark] .svhl{background:#8a7414;color:#fff;box-shadow:0 0 0 2px #8a7414}';
      document.head.appendChild(st);
    }
    var scope = null, h = opts.id || (location.hash || '').replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) {}   // #v-3.2%20·%20kārikā
    if (h) { try { scope = document.getElementById(h); } catch (e) {} }
    // a chapter-level block (#v-intro + vn=<first verse>): the intro section first, then that verse — never page-wide, never onward
    var vnId = 'vn' in opts ? opts.vn : (new URLSearchParams(location.search).get('vn') || '');
    var vn = vnId ? document.getElementById(vnId.indexOf('v-') === 0 ? vnId : 'v-' + vnId) : null;
    var chapLevel = !!vnId;
    if (!scope && vn) { scope = vn; vn = null; }
    // a hit in a commentary while the reader is in mūla-only mode: show the commentary first (unified views: body.moola-only
    // + button[data-v=both]; VC/PD/AB/SD/US: body.view-mula + .viewbar button[data-view=both]) — else it's display:none and
    // the match is skipped. ?vw=1 (search-tool link) or opts.reveal (in-text search) when the hit is not mūla.
    var reveal = 'reveal' in opts ? opts.reveal : new URLSearchParams(location.search).get('vw') === '1';
    if (reveal) {
      var b1 = document.body.classList.contains('moola-only') && document.querySelector('button[data-v="both"]');
      var b2 = document.body.classList.contains('view-mula') && document.querySelector('.viewbar button[data-view="both"]');
      try { if (b1) b1.click(); if (b2) b2.click(); } catch (e) {}
    }
    // Commentary-lane hits (2026-10-06 — VNM on BS, Śāstraprakāśikā on the Bṛhad vārttika): ?side=<lane> switches the
    // unified view to that commentary, INLINE (the copy that is visible on every screen width), and searches only inside
    // it; ?vk=<note id> first opens that vārttika verse's ṭīkā fold-out (its text is cloned in on open). Both opt-in.
    var qs = new URLSearchParams(location.search), side = 'side' in opts ? opts.side : qs.get('side'), vk = 'vk' in opts ? opts.vk : qs.get('vk');
    if (side && window.__vvView && window.__vvView.apply) {
      var cur = window.__vvView.get && window.__vvView.get();
      if (!cur || cur.side !== side || cur.place !== 'inter') try { window.__vvView.apply(side, 'inter'); } catch (e) {}
      // a LAZY lane (Gītā verse commentaries, 2026-10-21) is not in the page until loaded → load it, then land (re-enter once)
      if (window.__vvLane && document.querySelector('.lzl[data-lz^="' + side + ':"]') && !opts.__laneWaited) {
        var o2 = {}; for (var k in opts) o2[k] = opts[k]; o2.__laneWaited = true;
        window.__vvLane(side).then(function () { run(o2); });
        return;
      }
      var root = scope || document.body, lanes = root.querySelectorAll('.tk-inline[data-side="' + side + '"]');
      var laneRoots = function () {
        var out = [];
        for (var i = 0; i < lanes.length; i++) {
          var sc = lanes[i];
          if (vk) { var d = lanes[i].querySelector('details.vk-tk[data-tk="' + vk + '"]'); if (!d) continue; sc = d; }
          out.push(sc);
        }
        return out;
      };
      // context known: an exact-context occurrence in the lanes, then anywhere in the verse, before any lenient pick
      var tryLanes = function (strict) { return landIn(laneRoots(), strict); };
      if (vk) { var ds = root.querySelectorAll('.tk-inline[data-side="' + side + '"] details.vk-tk[data-tk="' + vk + '"]');
        for (var j = 0; j < ds.length; j++) ds[j].open = true; }   // fires 'toggle' → the fold-out clones its text in
      setTimeout(function () {
        // the hit's verse is known → search ONLY there (CLAUDE.md #9e: no mark beats a wrong occurrence); else the page
        var hit2 = hasCtx()
          ? (tryLanes(true) || landIn([scope || document.body], true) || tryLanes(false) || landIn([scope || document.body], false))
          : (tryLanes() || (scope ? highlightIn(scope) : highlightIn(document.body)));
        if (!hit2 && vn) { root = vn; lanes = vn.querySelectorAll('.tk-inline[data-side="' + side + '"]');
          hit2 = hasCtx() ? (tryLanes(true) || landIn([vn], true) || tryLanes(false) || landIn([vn], false)) : (tryLanes() || highlightIn(vn)); }
        if (hit2) { for (var dd = hit2.closest && hit2.closest('details'); dd; dd = dd.parentElement && dd.parentElement.closest('details')) dd.open = true;   // a hit in a collapsed fold-out (Pūrṇānandī) — open it first
          setTimeout(function () { scrollEl(hit2); }, 60); }
        else if (scope) setTimeout(function () { scrollEl(scope); }, 60);
      }, vk ? 120 : 0);
      return;
    }
    // not in the anchored verse → try the verses AFTER it before the whole page: a search block spanning
    // verses (BG bhāṣya [45,47] anchors to #v-6.45) has its phrase in a later verse of the range, and a
    // whole-page search would stop at the chapter's FIRST occurrence, possibly an earlier verse (2026-10-10).
    // verse known → that verse, then the verses AFTER it (a span block), never the whole page (#9e); no verse → the page
    var verseOnly = 'hv' in opts ? opts.hv : qs.get('hv') === '1';
    var hit;
    if (!hasCtx()) hit = scope ? (highlightIn(scope) || (verseOnly ? relaxedIn(scope) : ((vn && highlightIn(vn)) || (chapLevel ? null : forwardFrom(scope))))) : highlightIn(document.body);
    // context known: an exact-context occurrence in the verse (then vn, then the verses after it, for a span block) before
    // settling for a lenient pick in the verse itself
    else if (!scope) hit = landIn([document.body], false);
    else hit = landIn([scope], true) || (vn && landIn([vn], true)) || (!verseOnly && !chapLevel && forwardFrom(scope, true)) ||
      landIn([scope], false) || (vn && landIn([vn], false)) || (verseOnly ? relaxedIn(scope) : null);
    if (hit) setTimeout(function () { scrollEl(hit); }, 60);
    else if (scope) setTimeout(function () { scrollEl(scope); }, 60);
  }
  if (term) {
    rawTerm = term; nterm = nrmOf(term).s;
    try { var cq0 = new URLSearchParams(location.search); setCtx(cq0.get('hb'), cq0.get('ha')); } catch (e) {}
    if (nterm) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(run, 150); }); else setTimeout(run, 150); }
  }
})();
