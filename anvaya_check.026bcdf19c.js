// Anvaya order checker — shared by the अन्वय tutorial (browser: window.AnvayaCheck) and the build/gates (Node).
// A learner's anvaya is CORRECT when it is a permutation of the verse's words that satisfies every structural
// constraint of the verse (built by build_anvaya_data.js from the anvaya-v2 tree). It is NOT compared to one fixed
// order: editions and teachers legitimately differ (ANVAYA-V2-PROPOSAL "Decided" §1–7). Constraint kinds:
//   {t:'contig', w:[i…], allow:[i…]}   the words w stand together; only `allow` words may sit inside the span
//   {t:'before', a:i, b:j}             word a comes before word b
//   {t:'last', v:i, w:[i…]}            v comes after every word of w (the verb ends its clause)
//   {t:'groupBefore', a:[i…], b:[i…], embed:bool}  group a precedes group b; with embed, a may instead sit INSIDE b
//                                      before b's last word (an elliptical यथा-clause embedded before the verb — (B))
// Every constraint carries `why` (shown to the learner when violated).
(function (root) {
  'use strict';
  function check(order, data) {
    const n = data.n, pos = new Array(n).fill(-1), violations = [];
    if (order.length !== n) violations.push({ t: 'count', why: `use every word exactly once (${order.length}/${n})` });
    order.forEach((i, p) => { if (i >= 0 && i < n) { if (pos[i] >= 0) violations.push({ t: 'dup', why: 'a word is used twice', w: [i] }); pos[i] = p; } });
    if (pos.some(p => p < 0)) return { ok: false, violations: violations.length ? violations : [{ t: 'missing', why: 'some words are not placed yet' }] };
    for (const c of data.constraints || []) {
      if (c.t === 'contig') {
        const ps = c.w.map(i => pos[i]), lo = Math.min(...ps), hi = Math.max(...ps);
        const inside = new Set([...c.w, ...(c.allow || [])]);
        for (let p = lo; p <= hi; p++) if (!inside.has(order[p])) { violations.push(c); break; }
      } else if (c.t === 'before') {
        if (pos[c.a] > pos[c.b]) violations.push(c);
      } else if (c.t === 'last') {
        if (c.w.some(i => pos[i] > pos[c.v])) violations.push(c);
      } else if (c.t === 'groupBefore') {
        const a = c.a.map(i => pos[i]), b = c.b.map(i => pos[i]);
        const aBefore = Math.max(...a) < Math.min(...b);
        const aInside = c.embed && Math.min(...a) > Math.min(...b) && Math.max(...a) < Math.max(...b);
        if (!aBefore && !aInside) violations.push(c);
      }
    }
    return { ok: violations.length === 0, violations };
  }
  const api = { check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AnvayaCheck = api;
})(typeof window !== 'undefined' ? window : this);
