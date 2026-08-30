'use strict';
/*
 * reading-nav.js — THE ONE shared cascading verse-navigator for the whole app.
 * ============================================================================
 * A single source of truth (LEVELS + cascade logic + rendering) used by BOTH:
 *   1. the static svādhyāya reading pages (मनन bhāṣya + पदार्थ mūla) — via nav.js's buildNav,
 *      which now emits a container + calls ReadingNav.mount(...) at runtime; and
 *   2. the in-app "read-a-verse" picker (app.js renderReadingPicker).
 * Fix the chapter/verse scheme HERE and it percolates to every page — no per-surface drift/creep.
 *
 * UMD: works as a browser global (window.ReadingNav) AND a Node require() (nav.js / build tooling).
 *
 * API
 *   ReadingNav.LEVELS                       // { slug: [level-label, ...] }  (per-text native divisions)
 *   ReadingNav.levelsFor(slug, refs)        // -> [labels]; falls back by ref-depth for an unlisted text
 *   ReadingNav.comps(ref, nlev)             // -> ref split into nlev comps (extra trailing comps folded into last)
 *   ReadingNav.optionsFor(refs, nlev, L, prefix)  // -> distinct options at level L under `prefix`
 *   ReadingNav.STYLE                        // the navbar <style> text (injected once per page)
 *   ReadingNav.mount(container, opts)       // render cascading <select>s + wire cascade & selection
 *
 * mount(container, {
 *   slug,                 // text slug (LEVELS key)
 *   refs,                 // ORDERED array of every ref in the text, e.g. ["1.1.1","1.1.2", ...]
 *   curRef,               // optional: pre-select this ref
 *   mode,                 // 'jump' (reading pages) | 'callback' (picker)
 *   pageByRef, curFile,   // 'jump' mode only: {ref:file} + this page's file → same-page scroll or cross-page #v-<ref>
 *   onSelect,             // called with (ref) whenever the selection changes (both modes)
 * })  ->  { getRef(), setRef(ref), refresh() }
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;   // Node (nav.js, tooling)
  if (typeof window !== 'undefined') window.ReadingNav = mod;                   // browser global
})(this, function () {

  // Level labels per text — MUST span the full ref depth (uniform depth per text). Single source; keep this
  // the only copy. (Was duplicated in nav.js; nav.js now imports it from here.)
  const LEVELS = {
    Gita: ['अध्याय', 'श्लोक'], Isha: ['अध्याय', 'मन्त्र'], Kena: ['खण्ड', 'मन्त्र'], Kena_pada: ['खण्ड', 'मन्त्र'], Kena_vakya: ['खण्ड', 'मन्त्र'],
    Kathaka: ['अध्याय', 'वल्ली', 'मन्त्र'], Prashna: ['प्रश्न', 'मन्त्र'], Mundaka: ['मुण्डक', 'खण्ड', 'मन्त्र'],
    Mandukya: ['प्रकरण', 'मन्त्र'], Aitareya: ['अध्याय', 'खण्ड', 'मन्त्र'], Chandogya: ['अध्याय', 'खण्ड', 'मन्त्र'],
    Taitiriya: ['वल्ली', 'अनुवाक', 'मन्त्र'], Brha: ['अध्याय', 'ब्राह्मण', 'मन्त्र'], BS: ['अध्याय', 'पाद', 'सूत्र'],
    VC: ['श्लोक'], PD: ['अध्याय', 'श्लोक'], AB: ['श्लोक'], Vicharasagara: ['तरङ्ग', 'आवर्त'],
  };
  const FALLBACK = ['भाग', 'उप', 'क्रम', 'मन्त्र'];

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function levelsFor(slug, refs) {
    let lv = LEVELS[slug];
    if (!lv) { const depth = Math.max(1, ...(refs || []).map(r => String(r).split('.').length)); lv = FALLBACK.slice(Math.max(0, FALLBACK.length - depth)); }
    return lv;
  }

  // Split a ref into exactly nlev components; a ref DEEPER than nlev folds its extra trailing comps into the
  // last level (e.g. brihad "3.9.28.1" under a 3-level scheme → ["3","9","28.1"]). Mirrors nav.js's old comps().
  function comps(ref, nlev) {
    let p = String(ref).split('.');
    if (p.length > nlev) p = p.slice(0, nlev - 1).concat(p.slice(nlev - 1).join('.'));
    return p;
  }

  // Distinct options at level L, given the chosen values for levels 0..L-1 (`prefix`), in first-seen order.
  function optionsFor(refs, nlev, level, prefix) {
    const out = [], seen = {};
    for (const r of refs) {
      const p = comps(r, nlev);
      if (p.length <= level) continue;
      let ok = true;
      for (let i = 0; i < level; i++) if (p[i] !== prefix[i]) { ok = false; break; }
      if (ok && !seen[p[level]]) { seen[p[level]] = 1; out.push(p[level]); }
    }
    return out;
  }

  // Inner styling, keyed on the `.reading-nav` CLASS that mount() adds to its container — so it applies in
  // BOTH surfaces regardless of the container's id (reading pages ALSO get the sticky card bar via nav.js's
  // own #reading-nav rule; the picker gets just this inner row).
  const STYLE = `
.reading-nav{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:flex-end}
.reading-nav .navlvl{display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--muted,#667)}
.reading-nav select{font:inherit;font-size:14px;color:var(--ink,#111);background:var(--bg,#fff);border:1px solid var(--line,#ccc);border-radius:8px;padding:5px 9px;min-width:64px}
.v{scroll-margin-top:78px}
@keyframes navflash{0%{background:rgba(120,120,180,.28)}100%{background:transparent}}
.v.navhit{animation:navflash 1.6s ease-out}`;

  // Render cascading <select>s into `container` and wire them. Returns a small controller.
  function mount(container, opts) {
    opts = opts || {};
    const refs = (opts.refs || []).filter(r => r != null).map(String);
    const slug = opts.slug;
    const levels = levelsFor(slug, refs);
    const nlev = levels.length;
    if (refs.length < 2 && opts.mode !== 'callback') { container.innerHTML = ''; return { getRef: () => refs[0] || null, setRef: () => {}, refresh: () => {} }; }

    container.classList.add('reading-nav');   // so ReadingNav.STYLE applies regardless of the container's id
    container.innerHTML = levels.map((lb, i) => `<label class="navlvl"><span>${esc(lb)}</span><select data-lvl="${i}"></select></label>`).join('');
    const sels = [].slice.call(container.querySelectorAll('select'));

    function chosen(uptoLevel) { const a = []; for (let i = 0; i <= uptoLevel; i++) a.push(sels[i].value); return a; }
    function fill(sel, options, val) { sel.innerHTML = options.map(o => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join(''); }
    // (Re)build levels from `from` downward, each defaulting to its first valid option under the ones above.
    function rebuild(from) { for (let L = from; L < sels.length; L++) { const o = optionsFor(refs, nlev, L, chosen(L - 1)); fill(sels[L], o, o[0]); } }
    function currentRef() { return sels.map(s => s.value).join('.'); }
    function setRef(ref) {
      const p = comps(ref, nlev);
      rebuild(0);
      for (let L = 0; L < sels.length && L < p.length; L++) { const o = optionsFor(refs, nlev, L, p.slice(0, L)); fill(sels[L], o, p[L]); }
    }

    function jump(ref) {
      if (opts.mode !== 'jump') return;
      const file = opts.pageByRef ? opts.pageByRef[ref] : null;
      if (file == null) return;
      if (opts.curFile != null && file === opts.curFile) {
        const el = document.getElementById('v-' + ref);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.remove('navhit'); void el.offsetWidth; el.classList.add('navhit'); }
      } else location.href = file + '#v-' + ref;
    }
    function onChange() { const ref = currentRef(); if (typeof opts.onSelect === 'function') opts.onSelect(ref); jump(ref); }
    sels.forEach((s, L) => s.addEventListener('change', function () { rebuild(L + 1); onChange(); }));

    // initial selection: explicit curRef → #v-<ref> hash → (jump mode) first ref ON THIS PAGE → first ref
    // overall. The "first on this page" step matters for split texts (chandogya/brihad/gita spread across
    // files): landing on page N with no hash must show page N's first verse, not the global first (nav.js parity).
    let init = opts.curRef, fromHash = false;
    if (!init && typeof location !== 'undefined') { const h = (location.hash || '').replace(/^#v-/, ''); if (h && refs.indexOf(h) >= 0) { init = h; fromHash = true; } }
    if (!init && opts.mode === 'jump' && opts.pageByRef && opts.curFile != null) init = refs.find(r => opts.pageByRef[r] === opts.curFile) || null;
    setRef(init || refs[0]);
    // arriving via #v-<ref>: mirror nav.js's flash cue on the target verse.
    if (fromHash && opts.mode === 'jump' && typeof document !== 'undefined') { const el = document.getElementById('v-' + init); if (el) el.classList.add('navhit'); }

    return { getRef: currentRef, setRef, refresh: () => setRef(currentRef()) };
  }

  return { LEVELS, FALLBACK, levelsFor, comps, optionsFor, esc, STYLE, mount };
});
