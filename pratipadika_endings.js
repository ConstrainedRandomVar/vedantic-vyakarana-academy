/*!
 * pratipadika_endings — generates phonologically-plausible FAKE prātipadika endings for a real
 * stem, for use as MCQ distractors in the reading-walk app's 'stem' quiz sub-question
 * (searchtool/khan/app/app.js's buildStemOptions).
 *
 * Zero dependencies. Loadable as a classic <script src> AND via Node `require` (UMD-lite, same
 * pattern as ../../lib/sanskrit-search.js).
 *
 * Motivation: the old distractor pool drew random OTHER stems from the same chapter, ranked by
 * shared string prefix — for विमत्सर (BhG 4.22) that surfaced वikarman/विषम/विशेषण, unrelated words
 * that are trivially eliminable by meaning and test nothing about *why* विमत्सर is अकारान्त. Testing
 * ending-CLASS recognition needs same-base alternatives: विमत्सृ (ऋकारान्त), विमत्सरन् (नकारान्त),
 * विमत्सरि (इकारान्त), etc. — real declension-class shapes, not real dictionary words.
 *
 * 9 classes supported (confirmed against Harsha's worked example for विमत्सर + generalized to
 * आत्मन्→आतृ for the ऋ case): अ, आ, इ, ई, उ, ऊ, ऋ, न्, स्.
 */
(function (global, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  global.PratipadikaEndings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var HALANT = '्';
  var MATRA_CLASS = { 'ा': 'आ', 'ि': 'इ', 'ी': 'ई', 'ु': 'उ', 'ू': 'ऊ', 'ृ': 'ऋ' };
  var CLASSES = ['अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'न्', 'स्'];

  // Determines which of the 9 classes a citation-form stem ends in, or null if its ending isn't
  // one of them (e.g. a त्/द्/ष्-final participle) — callers should fall back to a different
  // distractor strategy entirely for null, rather than guess.
  function detectEndingClass(stem) {
    if (!stem) return null;
    var last = stem[stem.length - 1];
    if (last === HALANT) {
      var cons = stem[stem.length - 2];
      if (cons === 'न') return 'न्';
      if (cons === 'स') return 'स्';
      return null; // unsupported consonant-final ending
    }
    if (MATRA_CLASS[last]) return MATRA_CLASS[last];
    return 'अ'; // bare consonant, implicit अ
  }

  // Strips the stem's own trailing class-marker down to a bare, implicit-अ consonant — ready to
  // have any OTHER class's ending attached. Strips 1 char for a mātrā ending, 2 (consonant+halant)
  // for न्/स्, 0 for अ (already bare).
  function bareSkeleton(stem, cls) {
    if (cls === 'अ') return stem;
    if (cls === 'न्' || cls === 'स्') return stem.slice(0, -2);
    return stem.slice(0, -1); // mātrā ending (आ/इ/ई/उ/ऊ/ऋ)
  }

  // Appends one class's ending to a bare skeleton. ऋ is special-cased: real ऋ-कारान्त words
  // (कर्तृ, दातृ, आतृ-shaped) replace the base's FINAL consonant+vowel with [previous-consonant]+ऋ,
  // rather than simply appending ऋ after the base is left otherwise intact — confirmed via
  // विमत्सर→विमत्सृ (स्+ऋ, dropping र entirely, not र्+ऋ) and generalized to आत्मन्→आतृ (drop मन्,
  // drop म, restore त्'s implicit अ, then attach ऋ). Returns null if the skeleton is too short to
  // drop a character from, OR if the newly-exposed consonant already carries its OWN vowel mātrā
  // (e.g. गुरु's bare skeleton "गुर" exposes "गु" once र is dropped — ग already has उ, a real
  // syllable of the base, not a bare halant-suppressed consonant waiting for a vowel; overlaying ऋ
  // there would stack two vowel marks on one consonant, e.g. the malformed "गुृ". Found by actually
  // running this against गुरु/मुनि/राजन् — विमत्सर/आत्मन् alone didn't exercise this path since both
  // happen to expose a genuinely bare consonant or halant cluster, not a vowel-bearing one).
  function buildEndingVariant(bareSkel, cls) {
    if (cls === 'अ') return bareSkel;
    if (cls === 'आ') return bareSkel + 'ा';
    if (cls === 'इ') return bareSkel + 'ि';
    if (cls === 'ई') return bareSkel + 'ी';
    if (cls === 'उ') return bareSkel + 'ु';
    if (cls === 'ऊ') return bareSkel + 'ू';
    if (cls === 'न्') return bareSkel + 'न' + HALANT;
    if (cls === 'स्') return bareSkel + 'स' + HALANT;
    if (cls === 'ऋ') {
      if (bareSkel.length < 2) return null;
      var inner = bareSkel.slice(0, -1); // drop the bare last consonant entirely
      var innerLast = inner[inner.length - 1];
      if (innerLast === HALANT) inner = inner.slice(0, -1); // restore exposed cons.'s implicit अ
      else if (MATRA_CLASS[innerLast]) return null; // exposed consonant already has its own vowel
      if (!inner) return null;
      return inner + 'ृ';
    }
    return null;
  }

  // Given a correct citation-form stem, builds up to `count` distinct fake same-base distractors
  // covering OTHER classes. Returns null (caller should fall back to a different distractor method
  // entirely) if the stem's own ending isn't one of the 9 supported classes.
  function buildStemDistractors(correctStem, count) {
    count = count || 3;
    var ownCls = detectEndingClass(correctStem);
    if (!ownCls) return null;
    var skel = bareSkeleton(correctStem, ownCls);
    var variants = [];
    for (var i = 0; i < CLASSES.length; i++) {
      var cls = CLASSES[i];
      if (cls === ownCls) continue;
      var v = buildEndingVariant(skel, cls);
      if (v && v !== correctStem && variants.indexOf(v) === -1) variants.push(v);
    }
    return variants;
  }

  return { detectEndingClass: detectEndingClass, bareSkeleton: bareSkeleton, buildEndingVariant: buildEndingVariant, buildStemDistractors: buildStemDistractors, CLASSES: CLASSES };
});
