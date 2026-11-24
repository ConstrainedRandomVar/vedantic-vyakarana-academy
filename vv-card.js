// vv-card.js — THE word gloss card shell for every reading view (CLAUDE.md #9b, 2026-11-23 stage H, Harsha's OK on PLANS
// «Pratīka buckets» batch 4 (g)). One function draws the stacked card: headword .tw · green-italic meaning .tm · labelled rows in
// ONE fixed order · the samāsa peel below the separator line. Before this file each renderer carried its own copy of the shell
// (build_unified #tip mulaHtml + its bhāṣya / ṭīkā branches, build_vc_reading_view html(d), vc_bhashya_render .gtip card,
// the PD-ṭīkā proof page's thtml, vs_build_reading tipHtml) — six copies that could drift apart.
//
// UMD: the browser gets window.VVCard (pages load <script src="vv-card.js">); Node gets module.exports (vs_build_reading.js renders
// its cards at BUILD time with the same function, so the Vicārasāgara page needs no copy of the shell either).
//
//   VVCard.html(d, o) → card HTML (string). Values are inserted as given (callers escape at build time where needed, as before).
//   d (each row only when its value is truthy, in this order):
//     w        headword                      → <div class="tw">          (always, unless o.twIf and w is empty)
//     mng      meaning (English)             → <div class="tm">
//     p        पदच्छेद (sandhi split)         → row पदच्छेद                 (o.pAlways: drawn even when empty)
//     lemLabel+lem  the धातुः row (only when lemLabel === 'धातुः')
//     dnote    why this dhātu                → row टिप्पणी
//     g        source grammar                → row व्याकरणम्              (o.gLabel: another label for this row)
//     pbh      पाठभेद / पाठदोष note          → row ⚑ पाठः
//     (o.kv)   the व्युत्पत्तिः row, already rendered by the page's kvrow() (kosha_vyutpatti.js) — inserted here
//     role, sutra   kāraka (+ its सूत्र)     → row kāraka
//     sam      samāsa category               → row samāsa
//     note     ⚑ a source note               → row ⚑                     (o.noNote: not drawn)
//     peel     [lines] samāsa peel           → <div class="peel"> lines joined by <br>
//     xq       [href, label] a cross-text link → row <a class="xqrow">
//   VVCard.row(label, value) → one labelled row (a page that inserts a row into a drawn card, e.g. the ⚑ पाठः of a mūla word).
//   The jump rows (→ मूलम् / → भाष्यम् …) are appended by each page after the card, as before.
//
// Proof that a switched family renders exactly what it rendered before: proof_vv_card.mjs (headless Chrome, every carded word of
// every page, old build vs new build, light + dark, every पद/सन्धि and view state). Gate: assert_reading_conventions.js C12.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VVCard = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function row(lb, v) { return '<div class="row"><span class="lb">' + lb + '</span> ' + v + '</div>'; }
  function html(d, o) {
    o = o || {};
    var h = (o.twIf && !d.w) ? '' : '<div class="tw">' + d.w + '</div>';
    if (d.mng) h += '<div class="tm">' + d.mng + '</div>';
    if (d.p || o.pAlways) h += row('पदच्छेद', d.p);
    if (d.lemLabel === 'धातुः' && d.lem) h += row('धातुः', d.lem);
    if (d.dnote) h += row('टिप्पणी', d.dnote);
    if (d.g) h += row(o.gLabel || 'व्याकरणम्', d.g);
    if (d.pbh) h += row('⚑ पाठः', d.pbh);
    if (o.kv) h += o.kv;
    if (d.role || d.sutra) h += row('kāraka', (d.role || '—') + (d.sutra ? ' <span class="lb">सूत्र</span> ' + d.sutra : ''));
    if (d.sam) h += row('samāsa', d.sam);
    if (d.note && !o.noNote) h += row('⚑', d.note);
    if (d.peel && d.peel.length) h += '<div class="peel">' + d.peel.join('<br>') + '</div>';
    if (d.xq) h += '<div class="row"><a class="xqrow" href="' + d.xq[0] + '">' + d.xq[1] + '</a></div>';
    return h;
  }
  return { html: html, row: row, version: 1 };
});
