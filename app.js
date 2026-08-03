'use strict';
// Sandhi quiz app logic: per-node streak mastery (10 correct in a row), adaptive node
// selection weighted toward weak/unmastered nodes, localStorage persistence. No framework,
// no build step — matches search.html/review.html's dependency-free convention.

const LABELS = {
  SVD: 'savarṇadīrgha', GUN: 'guṇa', VRD: 'vṛddhi', YAN: 'yaṇ', AYA: 'ayādi', PVR: 'pūrvarūpa',
  SCU: 'ścutva', JSH: 'jaśtva', CAR: 'cartva', ANU: 'anusvāra', PSV: 'parasavarṇa',
  NUD: 'ṅamuṭ', HKC: 'hakāra→caturtha', LAT: 'latva',
  VSS: 'visarga → s', VSR: 'visarga → r', VSO: 'visarga → o', VSL: 'visarga-lopa',
  ABT: 'no-sandhi word boundary', SAMASA: 'samāsa classification',
  VIB: 'vibhakti (case-ending)', DHT: 'dhātu (verb-ending/tense)', MNG: 'word meaning',
  KRT: 'kṛt-pratyaya (kṛdanta)', TAD: 'taddhita-pratyaya (secondary derivation)',
};
// Student-facing labels for samāsa categories — the internal strings (from classify_samasa.js)
// are debug-oriented, mixing English/Devanāgarī for the survey that produced them.
const SAMASA_LABELS = {
  'Dvandva': 'द्वन्द्व', 'Bahuvrīhi': 'बहुव्रीहि', 'Karmadhāraya': 'कर्मधारय', 'Dvigu': 'द्विगु',
  'Avyayībhāva': 'अव्ययीभाव', 'Nañ-tatpuruṣa': 'नञ्-तत्पुरुष',
  'Rūpaka (metaphor-compound)': 'रूपक (तत्पुरुष)',
  'TP: general (unspecified vibhakti)': 'तत्पुरुष',
  'TP: upapada': 'उपपद-तत्पुरुष', 'TP: samāhāra (dvigu-like)': 'समाहार-तत्पुरुष',
  'TP: vibhakti-marked (षष्ठी)': 'षष्ठी-तत्पुरुष', 'TP: vibhakti-marked (तृतीया)': 'तृतीया-तत्पुरुष',
  'TP: vibhakti-marked (पञ्चमी)': 'पञ्चमी-तत्पुरुष', 'TP: vibhakti-marked (सप्तमी)': 'सप्तमी-तत्पुरुष',
  'TP: vibhakti-marked (द्वितीया)': 'द्वितीया-तत्पुरुष', 'TP: vibhakti-marked (चतुर्थी)': 'चतुर्थी-तत्पुरुष',
  'N/A': 'N/A (समास नहीं)',
};
function samasaLabel(cat) { return SAMASA_LABELS[cat] || cat; }
// A samāsa item's correct answer might be a specific tatpuruṣa SUBTYPE (a vibhakti case, upapada,
// samāhāra) or nañ (also technically a TP subtype). Offering the generic parent "तत्पुरुष (सामान्य)"
// as a wrong-answer option in those cases would be misleading, not cleanly wrong — a षष्ठी-तत्पुरुष
// genuinely IS also "a tatpuruṣa." Excluded from the distractor pool in that direction.
// Symmetrically, when the correct answer IS the general तत्पुरुष (the split couldn't be narrowed
// to a specific vibhakti/upapada/नञ् subtype), a SPECIFIC subtype like षष्ठी-तत्पुरुष is equally
// misleading as a "wrong" option — it doesn't contradict "तत्पुरुष," it's just more specific than
// what's being asked. Found via real usage (Harsha): when तत्पुरुष is correct, the distractors
// should come from genuinely DIFFERENT samāsa types (बहुव्रीहि/द्वन्द्व/"not a compound"/...), not
// sibling TP subtypes.
const TP_GENERAL = 'TP: general (unspecified vibhakti)';
function isTPSubtype(cat) { return cat !== TP_GENERAL && (cat.startsWith('TP:') || cat === 'Nañ-tatpuruṣa'); }

const MASTERY_TARGET = 10;
const BATCH_SIZE = 10;
const STORAGE_KEY = 'sandhiQuizProgress';
const RECENT_WINDOW = 5;
// Single-click flow: after answering, auto-advance instead of waiting for a separate "Next
// question" click — keeps tempo up, a mishit/mistake is cheap to recover from. Correct answers
// advance fast (nothing new to read); wrong ones pause a bit longer so the highlighted correct
// answer is actually legible before it's gone. The "Next question →" button still appears as a
// manual override for anyone who wants to skip the wait.
const AUTO_ADVANCE_DELAY_CORRECT = 450;
const AUTO_ADVANCE_DELAY_WRONG = 1100;
const RECENT_ANSWER_WINDOW = 12; // ~3 questions' worth of shown strings (correct + distractors)

// ---- sound feedback (per-answer ding/buzz + a batch-of-10-complete fanfare, à la Khan Academy) ----
// Synthesized via the Web Audio API rather than shipped audio files — Khan Academy's actual sound
// assets are their own property, not something to copy, and synthesizing keeps this PWA's existing
// zero-external-asset, fully-offline architecture intact (no new files for sw.js to cache).
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(freq, startDelay, duration, type, gain) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startDelay;
  g.gain.setValueAtTime(gain || 0.2, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration);
}
// Short ascending two-note "ding" for correct, a single low buzz for wrong — mirrors the
// immediate per-question feedback Khan Academy gives, without reusing their actual sound files.
function playAnswerSound(correct) {
  try {
    if (correct) { playTone(880, 0, 0.12, 'sine', 0.2); playTone(1318.5, 0.09, 0.18, 'sine', 0.2); }
    else playTone(220, 0, 0.22, 'sawtooth', 0.12);
  } catch (e) { /* Web Audio unavailable/blocked — sound is a nice-to-have, never block the quiz on it */ }
}
// A small 4-note major-triad fanfare (C5-E5-G5-C6), distinct from the per-question ding, marking
// "you just finished a batch of 10" — scheduled via a short setTimeout so it doesn't overlap the
// answer sound that triggered it.
function playBatchCompleteSound() {
  try {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => playTone(freq, i * 0.12, 0.3, 'triangle', 0.18));
  } catch (e) { /* see playAnswerSound */ }
}

// Samāsa items carry a `category`, not a `code` — give them a single shared pseudo-code so the
// existing per-node progress/mastery/dashboard/batch machinery (all keyed by `code`) treats
// "samāsa classification" as just one more node, no special-casing needed anywhere else.
for (const it of window.QUIZ_ITEMS) if (it.kind === 'samasa') it.code = 'SAMASA';

const itemsByCode = {};
for (const it of window.QUIZ_ITEMS) (itemsByCode[it.code] = itemsByCode[it.code] || []).push(it);
const CODES = Object.keys(itemsByCode).sort();
const SAMASA_CATEGORIES = itemsByCode.SAMASA ? [...new Set(itemsByCode.SAMASA.map(i => i.category))] : [];

// ---- Reading-walk mode: sequential verse-by-verse walk through a chosen text/chapter, instead of
// random node/adaptive/mixed selection. Content is lazy-loaded (walk-data-<chapterKey>.js, only
// fetched when the user opens the picker) and lives ENTIRELY outside window.QUIZ_ITEMS/itemsByCode
// — vibhakti/dhātu/meaning items only ever exist inside a loaded walk, there is no global pool for
// them in this build (a corpus-wide pool for those axes is a bigger, separate future module).
const READING_KEY = 'sandhiQuizReadingProgress';
// Which question KINDS a reading-walk session should draw from — e.g. someone who already knows
// the vocabulary may want to drop 'meaning' (translation) entirely and focus on grammar. Persisted
// across sessions like everything else here; defaults to everything ON so existing behavior is
// unchanged until a user actively narrows it. Scoped to reading-walk only, per how it was asked
// for — Mix it up/Practice use a different code-keyed pool with no equivalent kind-level concept.
const SKILL_KINDS = [
  { kind: 'sandhi', label: 'सन्धि (sandhi)' },
  { kind: 'samasa', label: 'समास (samāsa)' },
  { kind: 'vibhakti', label: 'विभक्ति (case, gender, stem)' },
  { kind: 'dhatu', label: 'धातु (verb tense/voice)' },
  { kind: 'krdanta', label: 'कृदन्त (participles)' },
  { kind: 'taddhita', label: 'तद्धित (secondary derivation)' },
  { kind: 'meaning', label: 'अर्थ (word meaning/translation)' },
];
const SKILLS_KEY = 'sandhiQuizReadingSkills';
function loadEnabledSkills() {
  try {
    const saved = JSON.parse(localStorage.getItem(SKILLS_KEY));
    if (saved && typeof saved === 'object') return saved;
  } catch (e) { /* fall through to default */ }
  return Object.fromEntries(SKILL_KINDS.map(s => [s.kind, true]));
}
function saveEnabledSkills(skills) { localStorage.setItem(SKILLS_KEY, JSON.stringify(skills)); }
let enabledSkills = loadEnabledSkills();
// Indices into step.items whose kind is currently enabled — the shared basis for picking,
// advancing, and verse-crossing so all three agree on what "the next question" even means once
// some kinds are filtered out.
function eligibleIndices(step) {
  return step.items.map((_, i) => i).filter(i => enabledSkills[step.items[i].kind] !== false);
}
let walkSteps = []; // flattened {verseRef, verseLabel, moola, section, word, wordIndex, items, defaultItemIndex}[]
let walkPos = { stepIdx: 0, itemIdx: 0 };
// Tracks the exact CONTENT of every question already shown this reading session (in-memory only,
// same "session, not persisted" scope as recentByCode/recentAnswersByCode below) — e.g. "case and
// number for योगम्" has one fixed correct answer no matter which sentence/verse it recurs in, so
// asking it again a few batches later reads as a flat-out repeat to the learner, not a new
// teaching moment. Used to prefer an UNASKED axis/subtype at a step over the build-time default
// when one is available; if every axis at a step has already been asked, the default is shown
// anyway rather than adding step-skipping complexity for what should be a rare edge case.
let askedSignatures = new Set();
// Closed value-universes for this axis's distractor generation, recomputed whenever a chapter's
// walk data loads — same "derive from what's actually in the shipped data" spirit as
// SAMASA_CATEGORIES, just sourced from the loaded walk instead of a global pool.
let walkItemPools = {};

const recentByCode = {}; // in-memory only — avoid immediate item repeats within a session
// Tracks every answer STRING shown recently in a node (as either the correct answer or a
// distractor), so a word the learner just saw doesn't reappear as a decoy on the very next
// question — e.g. असावादित्यः being the correct answer to one question, then showing up a
// question or two later as a wrong-answer option elsewhere (found via real usage, 2026-07-29).
const recentAnswersByCode = {};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Alternate junction outcomes, grouped by what kind of thing can fill that slot — used to build
// "wrong rule, same words" distractors. Vowel matras only ever get swapped for other vowel
// matras (never inserted where no matra existed), and consonant clusters only for other clusters
// of the same rough shape, so every candidate stays orthographically valid.
const MATRA_ALTS = {
  'ा': ['ि', 'ी', 'ु', 'ू', 'े', 'ो'], 'ि': ['ी', 'े', 'ा'], 'ी': ['ि', 'े', 'ा'],
  'ु': ['ू', 'ो', 'ा'], 'ू': ['ु', 'ो', 'ा'], 'े': ['ो', 'ै', 'ा', 'ी'],
  'ै': ['े', 'ौ'], 'ो': ['े', 'ौ', 'ा', 'ू'], 'ौ': ['ो', 'ै'],
};
const CLUSTER_ALTS = {
  'स्': ['श्', 'ष्', 'र्'], 'श्': ['स्', 'ष्'], 'ष्': ['स्', 'श्'],
  'र्': ['स्', 'ः', 'श्', 'ष्'], 'ः': ['र्', 'स्'],
  'न्न': ['म्म', 'द्ध'], 'म्म': ['न्न', 'ब्भ'],
  'द्ध': ['ग्घ', 'ड्ढ', 'ब्भ'], 'ग्घ': ['द्ध', 'ड्ढ', 'ब्भ'],
  'ड्ढ': ['द्ध', 'ग्घ', 'ब्भ'], 'ब्भ': ['द्ध', 'ग्घ', 'ड्ढ'],
  // yaṇ's semivowel+halant conjunct (े.g. हि+अस्य→ह्यस्य, "्य" is the junction) — which semivowel
  // fires depends on the preceding vowel (i/ī→्य, u/ū→्व, ṛ/ṝ→्र), so swapping one for another is
  // exactly a "wrong rule, same words" distractor. Missing case found via real usage (Harsha:
  // हि+अस्य's options included totally unrelated sibling words आद्युपेतः/विध्यादि) — this junction
  // shape fell through both ALT_MAP cases (the 2-char conjunct itself wasn't a key, and its bare
  // trailing consonant य्/व्/र् wasn't in CONSONANT_ALTS either), landing on the sibling-pool
  // fallback with nothing in common with the actual prompt.
  '्य': ['्व', '्र'], '्व': ['्य', '्र'], '्र': ['्य', '्व'],
};
// Bare consonants (no halant/matra) that can appear alone as a junction outcome — e.g. cartva's
// द्→त् before a voiceless stop leaves a lone "त" once the shared halant falls into the common
// suffix. Not claiming these are all real competing Pāṇinian outcomes — just same-shape, clearly-
// wrong swaps so the option stays visibly built from the SAME word instead of an unrelated one.
const CONSONANT_ALTS = {
  'त': ['द', 'ट', 'ड'], 'द': ['त', 'ड', 'ट'], 'ट': ['त', 'ड'], 'ड': ['द', 'ट'],
  'क': ['ग', 'च'], 'ग': ['क', 'ज'], 'च': ['ज', 'क'], 'ज': ['च', 'ग'],
  'प': ['ब', 'फ'], 'ब': ['प', 'भ'],
  'श': ['ष', 'स'], 'ष': ['श', 'स'], 'स': ['श', 'ष'],
  'ल': ['न', 'ण'], 'न': ['म', 'ण'], 'म': ['न', 'ण'], 'ण': ['न', 'म'],
};
const ALT_MAP = Object.assign({}, MATRA_ALTS, CLUSTER_ALTS, CONSONANT_ALTS);

function commonPrefixLen(x, y) {
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i;
}
function commonSuffixLen(x, y, maxLen) {
  let i = 0;
  while (i < maxLen && x[x.length - 1 - i] === y[y.length - 1 - i]) i++;
  return i;
}

// "Wrong rule, same words" distractors — swap ONLY the sandhi-junction outcome for a different
// plausible one, keeping the rest of both words untouched. Fixes a real quality bug (found via
// usage 2026-07-29): sibling-node distractors were pulling in the correct answer of a completely
// UNRELATED word pair (e.g. अभ्युपगमे+अपि's options included आस्येन्तर् — a valid answer, but to
// a different question, sharing no letters with the prompt, so it's recognizable as wrong without
// any sandhi knowledge at all). Returns [] if no safe swap applies (falls back to siblings below).
function junctionDistractors(item) {
  const correct = item.after, abut = item.before[0] + item.before[1];
  const pre = commonPrefixLen(correct, abut);
  const maxSuf = Math.max(0, Math.min(correct.length, abut.length) - pre);
  const suf = commonSuffixLen(correct, abut, maxSuf);
  const coreCorrect = correct.slice(pre, correct.length - suf);
  const head = correct.slice(0, pre), tail = suf ? correct.slice(correct.length - suf) : '';
  const out = [];

  // Case 1: the junction itself is a known matra/cluster/bare-consonant outcome — swap it
  // directly (e.g. guṇa's े/ो is exactly this — the whole junction IS a single matra).
  if (ALT_MAP[coreCorrect]) {
    for (const alt of ALT_MAP[coreCorrect]) {
      const cand = head + alt + tail;
      if (cand !== correct && cand !== abut && !out.includes(cand)) out.push(cand);
    }
  }
  // Case 2: the junction is a multi-character span ending in a known matra/consonant (e.g.
  // ṅamuṭ's ओषधि → नोषधि inserts a whole नो akṣara — core "नो" isn't itself a table key, but its
  // LAST character ो is) — swap just that trailing character, keeping the rest of the core intact.
  if (!out.length && coreCorrect.length > 1 && ALT_MAP[coreCorrect.slice(-1)]) {
    const stem = coreCorrect.slice(0, -1);
    for (const alt of ALT_MAP[coreCorrect.slice(-1)]) {
      const cand = head + stem + alt + tail;
      if (cand !== correct && cand !== abut && !out.includes(cand)) out.push(cand);
    }
  }
  // Case 3: elision/empty junction (e.g. pūrvarūpa's e/o+a → e/o) — nothing to swap AT the
  // junction, so swap the character just before it instead (the actual "rule" character).
  if (!out.length && pre > 0 && ALT_MAP[correct[pre - 1]]) {
    const base = correct.slice(0, pre - 1);
    for (const alt of ALT_MAP[correct[pre - 1]]) {
      const cand = base + alt + correct.slice(pre);
      if (cand !== correct && cand !== abut && !out.includes(cand)) out.push(cand);
    }
  }
  return out;
}

// Dispatches to the right option-builder for this item's question type: samāsa classification,
// no-sandhi word-boundary splits (ABT), or the default "produce the joined form" sandhi question.
function buildOptions(item, code) {
  if (item.kind === 'samasa') return buildSamasaOptions(item);
  if (item.kind === 'vibhakti') return buildVibhaktiOptions(item);
  if (item.kind === 'dhatu') return buildDhatuQuestionOptions(item);
  if (item.kind === 'krdanta') return buildKrdantaQuestionOptions(item);
  if (item.kind === 'taddhita') return buildTaddhitaOptions(item);
  if (item.kind === 'meaning') return buildMeaningOptions(item);
  if (item.subtype === 'lopa') return buildLopaOptions(item);
  if (item.code === 'ABT' || item.askSplit) return buildSplitOptions(item);
  return buildSandhiOptions(item, code);
}

// Samāsa classification options: correct category + 3 others drawn from the fixed category
// universe (a small, closed set — unlike sandhi's per-word junction perturbation, no need to
// generate anything, just exclude the TP-parent when the correct answer is a TP subtype).
function buildSamasaOptions(item) {
  const correct = item.category;
  let pool = SAMASA_CATEGORIES.filter(c => c !== correct);
  if (isTPSubtype(correct)) pool = pool.filter(c => c !== TP_GENERAL);
  else if (correct === TP_GENERAL) pool = pool.filter(c => !isTPSubtype(c));
  const distractors = shuffle(pool).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  return { options, correctIndex: options.indexOf(correct) };
}

// No-sandhi word-boundary (ABT) options: the correct split is the item's own known before[0]/
// before[1] (never reconstructed from `after` — the akṣara-merge that happens when a bare
// consonant absorbs a following vowel, e.g. इदम्+एकः → इदमेकः, means before[0].length doesn't
// reliably correspond to a character offset within `after`). Wrong splits cut `after` at OTHER
// offsets near the true boundary — like the sandhi quiz's "naive abut" distractor, these don't
// need to be real words, just visibly different candidate splits of the same fused string.
// Devanāgarī combining marks (vowel matras + halant + nasalization/aspiration marks) need a base
// consonant/vowel letter before them — cutting a string right before one of these leaves it
// orphaned, which renders as a broken dotted-circle glyph. Only offsets where the SECOND piece
// starts with a real, independent letter are valid split candidates.
const COMBINING_MARKS = new Set(['ा', 'ि', 'ी', 'ु', 'ू', 'ृ', 'ॄ', 'ॅ', 'ॆ', 'े', 'ै', 'ॉ', 'ॊ', 'ो', 'ौ', '्', 'ं', 'ँ', 'ः', '़']);
function validSplitOffset(s, k) { return k >= 1 && k <= s.length - 1 && !COMBINING_MARKS.has(s[k]); }

function splitDistractors(item) {
  const after = item.after;
  const correctSplit = item.before[0] + ' + ' + item.before[1];
  const trueBoundary = commonPrefixLen(after, item.before[0]);
  const out = [];
  const offsets = shuffle([-3, -2, -1, 1, 2, 3].map(d => trueBoundary + d));
  for (const k of offsets) {
    if (out.length >= 3) break;
    if (!validSplitOffset(after, k)) continue;
    const cand = after.slice(0, k) + ' + ' + after.slice(k);
    if (cand !== correctSplit && !out.includes(cand)) out.push(cand);
  }
  // fallback for very short fused strings — try every remaining valid offset
  for (let k = 1; k < after.length && out.length < 3; k++) {
    if (!validSplitOffset(after, k)) continue;
    const cand = after.slice(0, k) + ' + ' + after.slice(k);
    if (cand !== correctSplit && !out.includes(cand)) out.push(cand);
  }
  return out;
}
function buildSplitOptions(item) {
  const correct = item.before[0] + ' + ' + item.before[1];
  const distractors = splitDistractors(item);
  const options = shuffle([correct, ...distractors]);
  return { options, correctIndex: options.indexOf(correct) };
}

// Picks 3 distractors: the naive no-sandhi abut, then same-word "wrong rule" junction swaps,
// then (only if those can't fill 3) sibling answers from other items in the same node — skipping
// any string shown recently in this node (correct or distractor).
function buildSandhiOptions(item, code) {
  const pool = itemsByCode[code];
  const recentAnswers = recentAnswersByCode[code] || [];
  const correct = item.after;
  const abut = item.before[0] + item.before[1];
  const distractors = [];
  if (abut !== correct && !recentAnswers.includes(abut)) distractors.push(abut);

  for (const c of shuffle(junctionDistractors(item))) {
    if (distractors.length >= 3) break;
    if (c === correct || distractors.includes(c) || recentAnswers.includes(c)) continue;
    distractors.push(c);
  }

  if (distractors.length < 3) {
    const siblingAfters = shuffle(pool.filter(s => s.id !== item.id).map(s => s.after));
    for (const c of siblingAfters) {
      if (distractors.length >= 3) break;
      if (c === correct || distractors.includes(c) || recentAnswers.includes(c)) continue;
      distractors.push(c);
    }
    // thin node / heavy recent-exclusion fallback — allow recent-but-not-duplicate candidates
    if (distractors.length < 3 && abut !== correct && !distractors.includes(abut)) distractors.push(abut);
    for (const c of siblingAfters) {
      if (distractors.length >= 3) break;
      if (c === correct || distractors.includes(c)) continue;
      distractors.push(c);
    }
  }

  const shown = [correct, ...distractors];
  recentAnswersByCode[code] = [...shown, ...recentAnswers].slice(0, RECENT_ANSWER_WINDOW);
  const options = shuffle(shown);
  return { options, correctIndex: options.indexOf(correct) };
}

// ---- vibhakti (case-ending for prātipadikas): 3 sub-question types, dispatched by item.subtype ----
function plainVibDescriptor(vibhakti, vacana, linga) {
  return linga ? `${vibhakti} · ${vacana} · ${linga}` : `${vibhakti} · ${vacana}`;
}
// When a word's g-string genuinely offers a second, separately valid reading (item.alt — see
// classify_vibhakti.js's findAltClause), show ONE combined, complete answer instead of arbitrarily
// picking a side — e.g. मेधाविनः (BhG 4.16 bhāṣya) is genuinely BOTH षष्ठी-एकवचन ("of the wise
// one") AND प्रथमा/द्वितीया-बहुवचन ("the wise poets", the reading the sentence actually uses).
function vibhaktiDescriptor(it) {
  const base = plainVibDescriptor(it.vibhakti, it.vacana, it.linga);
  if (!it.alt) return base;
  return `${base} (अथवा ${plainVibDescriptor(it.alt.vibhakti, it.alt.vacana, it.alt.linga)})`;
}
function sharedPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
// Distractors are lemmas from the same chapter's stem pool, ranked by shared PREFIX with the
// correct answer — e.g. for इदम्, prefer other short pronoun-shaped stems over something like
// ब्रह्मादि/कर्तृ that shares no letters and is trivially eliminable on sight (found via real
// usage — the original pure-random draw made this question too easy, since the odd-one-out was
// obvious from word shape alone, no stem recognition required). Falls back to whatever's left in
// the pool (still shuffled, not literally random-quality — ties broken randomly) if there aren't
// 3 genuinely similar-looking candidates. This is the FALLBACK method — see buildStemOptions for
// the preferred phonological-ending method, which this only pads out when that comes up short.
function poolStemDistractors(correct, exclude, count, recentAnswers) {
  const ranked = shuffle((walkItemPools.stem || []).filter(l => l !== correct && !exclude.includes(l)))
    .map(l => ({ l, score: sharedPrefixLen(correct, l) }))
    .sort((a, b) => b.score - a.score);
  const distractors = [];
  for (const { l } of ranked) { if (distractors.length >= count) break; if (!distractors.includes(l) && !recentAnswers.includes(l)) distractors.push(l); }
  for (const { l } of ranked) { if (distractors.length >= count) break; if (!distractors.includes(l)) distractors.push(l); }
  return distractors;
}
// Mirrors classify_vibhakti.js's SARVANAMA_LEMMAS exactly — sarvanāma-गण declension is irregular/
// suppletive (तद् is द्-कारान्त, not one of pratipadika_endings.js's 9 supported classes at all;
// none of these fit that scheme), so the honest "same-kind" distractor for a sarvanāma word is
// another sarvanāma lemma, not a phonological ending-swap.
const SARVANAMA_STEM_POOL = ['तद्', 'एतद्', 'यद्', 'इदम्', 'अदस्', 'एक', 'द्वि', 'युष्मद्', 'अस्मद्', 'भवत्', 'किम्', 'सर्व', 'अन्य'];
// Distractors are FAKE same-base stems with a different (but real) declension-class ending swapped
// in — e.g. for विमत्सर (अकारान्त), विमत्सृ (ऋकारान्त)/विमत्सरन् (नकारान्त)/विमत्सरि (इकारान्त) — so
// the question tests recognizing the stem's ending class, not vocabulary recall against unrelated
// pool words (found via real usage: वikarman/विषम/विशेषण as विमत्सर's old distractors share only a
// वि- prefix and are trivially eliminable by meaning, testing nothing about the ending itself). See
// pratipadika_endings.js for the construction rules.
// For sarvanāma words, use the closed SARVANAMA_STEM_POOL instead — NOT the generic corpus pool
// (found via real usage: सः/तद् got तद्-अकरण/तद्-कृत/तद्विपर्ययग्रहणनिवृत्त्यर्थम् as distractors,
// compounds that merely share तद् as their first MEMBER, not real alternative sarvanāma stems —
// the same "incongruous options" problem the phonological fix solved for regular nouns, just
// re-appearing here because sarvanāma words are explicitly excluded from that fix). Falls back to
// the old prefix-ranked pool only if neither method yields enough (e.g. a sarvanāma lemma not in
// SARVANAMA_STEM_POOL, or a non-sarvanāma stem whose ending isn't one of the 9 supported classes).
function buildStemOptions(item) {
  const correct = item.lemma;
  const recentAnswers = recentAnswersByCode.VIB || [];
  let distractors = [];
  if (item.isSarvanama) {
    const pool = shuffle(SARVANAMA_STEM_POOL.filter(l => l !== correct));
    const fresh = pool.filter(l => !recentAnswers.includes(l));
    const stale = pool.filter(l => recentAnswers.includes(l));
    distractors = [...fresh, ...stale].slice(0, 3);
  } else if (typeof PratipadikaEndings !== 'undefined') {
    const fake = PratipadikaEndings.buildStemDistractors(correct, 8);
    if (fake) {
      const fresh = shuffle(fake.filter(f => !recentAnswers.includes(f)));
      const stale = shuffle(fake.filter(f => recentAnswers.includes(f)));
      distractors = [...fresh, ...stale].slice(0, 3);
    }
  }
  if (distractors.length < 3) {
    distractors = distractors.concat(poolStemDistractors(correct, distractors, 3 - distractors.length, recentAnswers));
  }
  const shown = [correct, ...distractors];
  recentAnswersByCode.VIB = [...shown, ...recentAnswers].slice(0, RECENT_ANSWER_WINDOW);
  const options = shuffle(shown);
  return { options, correctIndex: options.indexOf(correct) };
}
function buildCaseNumberOptions(item) {
  const correct = vibhaktiDescriptor(item);
  // A wrong axis-swap candidate must never itself equal the alt reading (also genuinely valid, so
  // not a "wrong" option) and must never carry the CORRECT item's own alt suffix — strip `alt`
  // before descriptor-izing swapped candidates, or every fabricated wrong combo would misleadingly
  // claim the same "(अथवा ...)" alternate as the real answer.
  const altPlain = item.alt ? plainVibDescriptor(item.alt.vibhakti, item.alt.vacana, item.alt.linga) : null;
  const recentAnswers = recentAnswersByCode.VIB || [];
  const axes = ['vibhakti', 'vacana'];
  if (item.linga) axes.push('linga');
  const distractors = [];
  for (let pass = 0; pass < 2 && distractors.length < 3; pass++) {
    for (let guard = 0; distractors.length < 3 && guard < 40; guard++) {
      const axis = axes[Math.floor(Math.random() * axes.length)];
      const universe = walkItemPools[axis];
      if (!universe || universe.length < 2) continue;
      const swapped = Object.assign({}, item, { [axis]: universe[Math.floor(Math.random() * universe.length)], alt: undefined });
      const cand = vibhaktiDescriptor(swapped);
      if (cand === correct || cand === altPlain || distractors.includes(cand)) continue;
      if (pass === 0 && recentAnswers.includes(cand)) continue; // pass 1 relaxes this for thin pools
      distractors.push(cand);
    }
  }
  const shown = [correct, ...distractors];
  recentAnswersByCode.VIB = [...shown, ...recentAnswers].slice(0, RECENT_ANSWER_WINDOW);
  const options = shuffle(shown);
  return { options, correctIndex: options.indexOf(correct) };
}
// Gender (M/F/N) and सर्वनाम-गण membership are orthogonal — यः is masculine AND सर्वनाम, not one
// or the other (see classify_vibhakti.js's buildVibhaktiSubItems for the fuller reasoning). This
// question only ever asks the actual liṅग; 'gender' items are never emitted for genderless words
// (युष्मद्/अस्मद्) in the first place, so there's no "no answer" case to handle here.
const GENDER_OPTIONS = ['पुंलिङ्ग', 'स्त्रीलिङ्ग', 'नपुंसकलिङ्ग'];
function buildGenderOptions(item) {
  const correct = item.linga;
  const distractors = shuffle(GENDER_OPTIONS.filter(o => o !== correct));
  const options = shuffle([correct, ...distractors]);
  return { options, correctIndex: options.indexOf(correct) };
}
// Binary — a lemma either is or isn't in the closed सर्वनाम-गण class, so (like buildPrayogaOptions)
// this is an honest 2-option question rather than padded to 4.
function buildSarvanamaOptions(item) {
  const correct = item.isSarvanama ? 'सर्वनाम' : 'सामान्य नाम';
  const other = item.isSarvanama ? 'सामान्य नाम' : 'सर्वनाम';
  const options = shuffle([correct, other]);
  return { options, correctIndex: options.indexOf(correct) };
}
function buildVibhaktiOptions(item) {
  if (item.subtype === 'stem') return buildStemOptions(item);
  if (item.subtype === 'gender') return buildGenderOptions(item);
  if (item.subtype === 'sarvanama') return buildSarvanamaOptions(item);
  return buildCaseNumberOptions(item);
}

// ---- dhātu (verb-ending + tense) ----
function dhatuDescriptor(it) {
  return it.pada ? `${it.lakara} · ${it.purusha} · ${it.vacana} · ${it.pada}` : `${it.lakara} · ${it.purusha} · ${it.vacana}`;
}
const DHATU_AXIS_POOL_KEY = { lakara: 'lakara', purusha: 'purusha', vacana: 'dhatuVacana', pada: 'pada' };
function buildDhatuOptions(item) {
  const correct = dhatuDescriptor(item);
  const recentAnswers = recentAnswersByCode.DHT || [];
  const axes = ['lakara', 'purusha', 'vacana'];
  if (item.pada) axes.push('pada');
  const distractors = [];
  for (let pass = 0; pass < 2 && distractors.length < 3; pass++) {
    for (let guard = 0; distractors.length < 3 && guard < 40; guard++) {
      const axis = axes[Math.floor(Math.random() * axes.length)];
      const universe = walkItemPools[DHATU_AXIS_POOL_KEY[axis]];
      if (!universe || universe.length < 2) continue;
      const swapped = Object.assign({}, item, { [axis]: universe[Math.floor(Math.random() * universe.length)] });
      const cand = dhatuDescriptor(swapped);
      if (cand === correct || distractors.includes(cand)) continue;
      if (pass === 0 && recentAnswers.includes(cand)) continue;
      distractors.push(cand);
    }
  }
  const shown = [correct, ...distractors];
  recentAnswersByCode.DHT = [...shown, ...recentAnswers].slice(0, RECENT_ANSWER_WINDOW);
  const options = shuffle(shown);
  return { options, correctIndex: options.indexOf(correct) };
}
// कर्तरि (active) vs कर्मणि (passive/impersonal — भावे is folded into कर्मणि at classification
// time, see classify_dhatu.js) — a genuinely binary grammatical fact, so a 2-option question
// (rather than padding to the usual 4 with meaningless extra choices) is the honest shape here.
function buildPrayogaOptions(item) {
  const correct = item.prayoga;
  const other = correct === 'कर्मणि' ? 'कर्तरि' : 'कर्मणि';
  const options = shuffle([correct, other]);
  return { options, correctIndex: options.indexOf(correct) };
}
function buildDhatuQuestionOptions(item) {
  if (item.subtype === 'prayoga') return buildPrayogaOptions(item);
  return buildDhatuOptions(item);
}

// ---- kṛt-pratyaya (kṛdanta) identification ----
function buildKrdantaOptions(item) {
  const correct = item.pratyaya;
  const recentAnswers = recentAnswersByCode.KRT || [];
  const pool = shuffle((walkItemPools.krt || []).filter(p => p !== correct));
  const distractors = [];
  for (const c of pool) { if (distractors.length >= 3) break; if (!distractors.includes(c) && !recentAnswers.includes(c)) distractors.push(c); }
  for (const c of pool) { if (distractors.length >= 3) break; if (!distractors.includes(c)) distractors.push(c); }
  const shown = [correct, ...distractors];
  recentAnswersByCode.KRT = [...shown, ...recentAnswers].slice(0, RECENT_ANSWER_WINDOW);
  const options = shuffle(shown);
  return { options, correctIndex: options.indexOf(correct) };
}
function buildKrdantaQuestionOptions(item) {
  if (item.subtype === 'prayoga') return buildPrayogaOptions(item);
  return buildKrdantaOptions(item);
}

// ---- taddhita-pratyaya identification (secondary nominal derivation) ----
function buildTaddhitaOptions(item) {
  const correct = item.pratyaya;
  const recentAnswers = recentAnswersByCode.TAD || [];
  const pool = shuffle((walkItemPools.taddhita || []).filter(p => p !== correct));
  const distractors = [];
  for (const c of pool) { if (distractors.length >= 3) break; if (!distractors.includes(c) && !recentAnswers.includes(c)) distractors.push(c); }
  for (const c of pool) { if (distractors.length >= 3) break; if (!distractors.includes(c)) distractors.push(c); }
  const shown = [correct, ...distractors];
  recentAnswersByCode.TAD = [...shown, ...recentAnswers].slice(0, RECENT_ANSWER_WINDOW);
  const options = shuffle(shown);
  return { options, correctIndex: options.indexOf(correct) };
}

// ---- word-meaning (fallback axis) ----
function buildMeaningOptions(item) {
  const correct = item.meaning;
  const recentAnswers = recentAnswersByCode.MNG || [];
  const pool = shuffle((walkItemPools.meaning || []).filter(m => m !== correct));
  const distractors = [];
  for (const c of pool) { if (distractors.length >= 3) break; if (!distractors.includes(c) && !recentAnswers.includes(c)) distractors.push(c); }
  for (const c of pool) { if (distractors.length >= 3) break; if (!distractors.includes(c)) distractors.push(c); }
  const shown = [correct, ...distractors];
  recentAnswersByCode.MNG = [...shown, ...recentAnswers].slice(0, RECENT_ANSWER_WINDOW);
  const options = shuffle(shown);
  return { options, correctIndex: options.indexOf(correct) };
}

// ---- sandhi lopa recognition (VSL/PVR sub-question: "what was elided here?") ----
const LOPA_DESCRIPTIONS = {
  VSL: 'the visarga (ः) — nothing replaces it',
  PVR: 'the next word’s leading अ — absorbed, nothing replaces it',
};
const LOPA_FOILS = [
  'nothing was elided — this is a plain word boundary',
  'the first word’s final vowel — replaced by a different vowel',
  'the next word’s leading consonant — replaced by a different consonant',
];
function buildLopaOptions(item) {
  const correct = LOPA_DESCRIPTIONS[item.code] || 'a sound was elided here';
  const otherCode = item.code === 'VSL' ? 'PVR' : 'VSL';
  const pool = [LOPA_DESCRIPTIONS[otherCode], ...LOPA_FOILS].filter(d => d !== correct);
  const distractors = shuffle(pool).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  return { options, correctIndex: options.indexOf(correct) };
}

function loadProgress() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { p = {}; }
  for (const code of CODES) if (!p[code]) p[code] = { streak: 0, best: 0, mastered: false };
  return p;
}
function saveProgress(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }
let progress = loadProgress();

function pickWeightedNode() {
  const unmastered = CODES.filter(c => !progress[c].mastered);
  const pool = unmastered.length ? unmastered : CODES;
  if (unmastered.length) {
    const weights = pool.map(c => MASTERY_TARGET + 1 - Math.min(progress[c].streak, MASTERY_TARGET));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// 'mixed' = plain uniform shuffle across every node, ignoring mastery — for variety/review,
// distinct from 'adaptive' which deliberately steers toward weak/unmastered nodes.
function pickMixedNode() { return CODES[Math.floor(Math.random() * CODES.length)]; }

function pickNode(mode, code) {
  if (mode === 'adaptive') return pickWeightedNode();
  if (mode === 'mixed') return pickMixedNode();
  return code;
}

// ---- reading-walk: load, flatten, position, and step through a chosen chapter ----
function loadReadingProgress(chapterKey) {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(READING_KEY)) || {}; } catch (e) {}
  return p[chapterKey] || null;
}
function saveReadingProgress(chapterKey, pos) {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(READING_KEY)) || {}; } catch (e) {}
  p[chapterKey] = pos;
  localStorage.setItem(READING_KEY, JSON.stringify(p));
}
function loadWalkDataScript(chapterKey, file) {
  return new Promise((resolve, reject) => {
    if (window.WALK_DATA && window.WALK_DATA[chapterKey]) return resolve();
    const s = document.createElement('script');
    s.src = file;
    s.onload = resolve;
    s.onerror = () => reject(new Error('failed to load ' + file));
    document.head.appendChild(s);
  });
}
function flattenWalk(chapterKey) {
  const ch = window.WALK_DATA[chapterKey];
  const out = [];
  for (const v of ch.verses) {
    for (const section of ['mula', 'bhasya']) {
      for (const s of v.sections[section].steps) {
        out.push({ verseRef: v.ref, verseLabel: v.label, moola: v.moola, section, ...s });
      }
    }
  }
  return out;
}
// Closed value-universes for vibhakti/dhātu distractor generation, sourced from whatever's
// actually in THIS loaded chapter (mirrors SAMASA_CATEGORIES' "derive from shipped data" spirit).
function computeWalkPools() {
  const allItems = walkSteps.flatMap(s => s.items);
  const vibItems = allItems.filter(it => it.kind === 'vibhakti');
  // 'prayoga'-subtype dhātu items don't carry lakara/purusha/vacana/pada at all — scope the
  // tense-axis pools to the 'tense' subtype only, or Set() would pick up stray `undefined` values.
  const dhatuTenseItems = allItems.filter(it => it.kind === 'dhatu' && it.subtype === 'tense');
  const krdantaItems = allItems.filter(it => it.kind === 'krdanta' && it.subtype === 'pratyaya');
  const taddhitaItems = allItems.filter(it => it.kind === 'taddhita' && it.subtype === 'pratyaya');
  walkItemPools = {
    krt: [...new Set(krdantaItems.map(it => it.pratyaya))],
    taddhita: [...new Set(taddhitaItems.map(it => it.pratyaya))],
    stem: [...new Set(vibItems.filter(it => it.subtype === 'stem').map(it => it.lemma))],
    meaning: [...new Set(allItems.filter(it => it.kind === 'meaning').map(it => it.meaning))],
    vibhakti: [...new Set(vibItems.filter(it => it.subtype === 'caseNumber').map(it => it.vibhakti))],
    vacana: [...new Set(vibItems.filter(it => it.subtype === 'caseNumber').map(it => it.vacana))],
    linga: [...new Set(vibItems.filter(it => it.linga).map(it => it.linga))],
    lakara: [...new Set(dhatuTenseItems.map(it => it.lakara))],
    purusha: [...new Set(dhatuTenseItems.map(it => it.purusha))],
    dhatuVacana: [...new Set(dhatuTenseItems.map(it => it.vacana))],
    pada: [...new Set(dhatuTenseItems.filter(it => it.pada).map(it => it.pada))],
  };
}
// A stable key for "the exact question this item asks" — same word + same axis/subtype + same
// correct answer content, regardless of which sentence/verse the occurrence came from.
function questionSignature(item) {
  if (item.kind === 'vibhakti') {
    if (item.subtype === 'stem') return `vib:stem:${item.word}:${item.lemma}`;
    if (item.subtype === 'gender') return `vib:gender:${item.word}:${item.linga}`;
    if (item.subtype === 'sarvanama') return `vib:sarvanama:${item.word}:${item.isSarvanama}`;
    return `vib:case:${item.word}:${vibhaktiDescriptor(item)}`;
  }
  if (item.kind === 'dhatu') {
    if (item.subtype === 'prayoga') return `dht:prayoga:${item.word}:${item.prayoga}`;
    return `dht:${item.word}:${dhatuDescriptor(item)}`;
  }
  if (item.kind === 'krdanta') {
    if (item.subtype === 'prayoga') return `krt:prayoga:${item.word}:${item.prayoga}`;
    return `krt:${item.word}:${item.pratyaya}`;
  }
  if (item.kind === 'taddhita') return `tad:${item.word}:${item.pratyaya}`;
  if (item.kind === 'meaning') return `mng:${item.word}:${item.meaning}`;
  if (item.kind === 'samasa') return `sam:${item.word}:${item.category}`;
  if (item.subtype === 'lopa') return `lopa:${item.code}:${item.before.join('+')}`;
  return `sdh:${item.code}:${item.before.join('+')}:${item.after}`;
}
function pickNextWalkItem() {
  let step = walkSteps[walkPos.stepIdx];
  while (step) {
    const eligible = eligibleIndices(step); // respects enabledSkills — see its own comment
    if (eligible.length) {
      if (session.deep) {
        const idx = eligible.find(i => i >= walkPos.itemIdx);
        const realIdx = idx !== undefined ? idx : eligible[0];
        walkPos.itemIdx = realIdx; // normalize past any disabled-kind items sitting before it
        const item = step.items[realIdx];
        askedSignatures.add(questionSignature(item));
        return { item, code: item.code };
      }
      const order = eligible.includes(step.defaultItemIndex)
        ? [step.defaultItemIndex, ...eligible.filter(i => i !== step.defaultItemIndex)]
        : eligible;
      const itemIdx = order.find(i => !askedSignatures.has(questionSignature(step.items[i])));
      if (itemIdx !== undefined) {
        const item = step.items[itemIdx];
        askedSignatures.add(questionSignature(item));
        return { item, code: item.code };
      }
    }
    // Either every eligible axis at this word position has already been asked (its exact content,
    // not just this occurrence — most common on frequent particles like च/एव/न recurring with an
    // identical gloss), or NO axis here is currently enabled at all (e.g. a pure-meaning word with
    // 'meaning' turned off). Either way, skip straight to the next word; persist immediately so a
    // reload mid-skip resumes from the position actually being shown, not the one skipped past.
    walkPos = { stepIdx: walkPos.stepIdx + 1, itemIdx: 0 };
    saveReadingProgress(session.chapterKey, walkPos);
    step = walkSteps[walkPos.stepIdx];
  }
  return null; // chapter complete
}
// True if advancing past the CURRENT (not-yet-advanced) step/item would move into a different
// verse, or run off the end of the chapter — decided BEFORE advancing so the answer-feedback
// screen can choose the right terminal panel for the question just answered.
function peekNextVerseCrossing() {
  const curStep = walkSteps[walkPos.stepIdx];
  if (!curStep) return true;
  if (session.deep && eligibleIndices(curStep).some(i => i > walkPos.itemIdx)) return false;
  const nextStep = walkSteps[walkPos.stepIdx + 1];
  return !nextStep || nextStep.verseRef !== curStep.verseRef;
}
function advanceWalk() {
  const step = walkSteps[walkPos.stepIdx];
  const nextEligible = step && session.deep ? eligibleIndices(step).find(i => i > walkPos.itemIdx) : undefined;
  if (nextEligible !== undefined) walkPos.itemIdx = nextEligible;
  else { walkPos.stepIdx++; walkPos.itemIdx = 0; }
  saveReadingProgress(session.chapterKey, walkPos);
}
function continueReadingBatch() {
  advanceWalk();
  session.batchCount = 0;
  session.batchCorrect = 0;
  newQuestion();
}
function continueReadingFromCelebration() {
  advanceWalk();
  newQuestion();
}
function repeatCurrentVerse() {
  const curStep = walkSteps[walkPos.stepIdx];
  const verseRef = curStep ? curStep.verseRef : (walkSteps[walkSteps.length - 1] || {}).verseRef;
  const firstIdx = walkSteps.findIndex(s => s.verseRef === verseRef);
  walkPos = { stepIdx: firstIdx >= 0 ? firstIdx : 0, itemIdx: 0 };
  saveReadingProgress(session.chapterKey, walkPos);
  session.batchCount = 0;
  session.batchCorrect = 0;
  newQuestion();
}
function startReading(chapterKey, opts) {
  const entry = (window.WALK_MANIFEST || []).find(e => e.chapterKey === chapterKey);
  if (!entry) return;
  loadWalkDataScript(chapterKey, entry.file).then(() => {
    walkSteps = flattenWalk(chapterKey);
    computeWalkPools();
    if (opts.verseRef) {
      const idx = walkSteps.findIndex(s => s.verseRef === opts.verseRef);
      walkPos = { stepIdx: idx >= 0 ? idx : 0, itemIdx: 0 };
      askedSignatures = new Set(); // deliberate restart at a chosen point — repeats are fine again
    } else if (opts.fromBeginning) {
      walkPos = { stepIdx: 0, itemIdx: 0 };
      askedSignatures = new Set();
    } else {
      // plain "continue" — same logical session as before, so keep askedSignatures as-is (it only
      // resets on an actual page reload, since it's in-memory-only, same scope as recentByCode)
      walkPos = loadReadingProgress(chapterKey) || { stepIdx: 0, itemIdx: 0 };
    }
    if (walkPos.stepIdx >= walkSteps.length) walkPos = { stepIdx: 0, itemIdx: 0 }; // stale/out-of-range resume point (e.g. after a content rebuild)
    session = { mode: 'reading', chapterKey, deep: !!opts.deep, batchCount: 0, batchCorrect: 0 };
    saveReadingProgress(chapterKey, walkPos); // a verse-jump is itself a valid resume point, persist it immediately
    newQuestion();
  }).catch(err => {
    app.innerHTML = `<div class="celebrate"><h2>⚠ couldn't load this chapter</h2><p>${esc(err.message)}</p>
      <div class="next-choices"><button class="secondary" id="loadErrBackBtn">🏠 Dashboard</button></div></div>`;
    document.getElementById('loadErrBackBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
  });
}

function pickItem(code) {
  const pool = itemsByCode[code];
  const recent = recentByCode[code] || [];
  let candidates = pool.filter(it => !recent.includes(it.id));
  if (!candidates.length) candidates = pool;
  const it = candidates[Math.floor(Math.random() * candidates.length)];
  recentByCode[code] = [it.id, ...recent].slice(0, RECENT_WINDOW);
  return it;
}

// Lazy-seed: VIB/DHT/MNG (and any future dynamically-introduced code) only exist inside a
// lazy-loaded walk, never in the eagerly-loaded CODES list loadProgress() pre-seeds from — so
// both recordAnswer() AND renderQuiz() (which reads progress[code].streak for the header, even
// before any answer has been recorded for a brand-new code) need this, not just one of them.
function ensureProgress(code) {
  if (!progress[code]) progress[code] = { streak: 0, best: 0, mastered: false };
  return progress[code];
}

function recordAnswer(code, correct) {
  const p = ensureProgress(code);
  const wasMastered = p.mastered;
  p.streak = correct ? p.streak + 1 : 0;
  p.best = Math.max(p.best, p.streak);
  if (p.streak >= MASTERY_TARGET) p.mastered = true;
  saveProgress(progress);
  return { justMastered: !wasMastered && p.mastered };
}

// ---- rendering ----

const app = document.getElementById('app');
// `session` tracks the current practice run (mode + a 10-question batch counter); `view` tracks
// just the CURRENT question's render state. Split so "another batch" / mode switches reset the
// counters cleanly without disturbing per-node mastery, which lives in `progress` regardless.
let session = null; // {mode:'node'|'adaptive'|'mixed', fixedCode, batchCount, batchCorrect}
let view = { screen: 'dashboard' };

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function renderDashboard() {
  const masteredN = CODES.filter(c => progress[c].mastered).length;
  app.innerHTML = `
    <div class="dash-head">
      <div>${masteredN} / ${CODES.length} nodes mastered</div>
      <div class="dash-actions">
        <button class="primary" id="readBtn">📖 Read a verse</button>
        <button class="secondary" id="mixBtn">🔀 Mix it up</button>
        <button class="secondary" id="adaptiveBtn">Practice</button>
      </div>
    </div>
    <div class="grid">
      ${CODES.map(c => {
        const p = progress[c];
        const pct = Math.min(100, Math.round((p.streak / MASTERY_TARGET) * 100));
        return `<div class="card${p.mastered ? ' mastered' : ''}" data-code="${c}">
          <div class="card-top"><span class="code">${c}</span>${p.mastered ? '<span class="badge">✓ mastered</span>' : ''}</div>
          <div class="label">${LABELS[c] || ''}</div>
          <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
          <div class="stats">streak ${p.streak} · best ${p.best}</div>
        </div>`;
      }).join('')}
    </div>`;
  document.getElementById('adaptiveBtn').onclick = () => startQuiz('adaptive');
  document.getElementById('mixBtn').onclick = () => startQuiz('mixed');
  document.getElementById('readBtn').onclick = () => { view = { screen: 'picker' }; renderReadingPicker(); };
  app.querySelectorAll('.card').forEach(el => el.onclick = () => startQuiz('node', el.dataset.code));
}

// Groups WALK_MANIFEST entries (one per chapter) by their text `slug` — `title` is the text-level
// part of the build-time-authored label ("भगवद्गीता (Bhagavad Gītā) · अध्याय 4" -> the part before
// " · "), so the picker never needs its own hardcoded text-name table.
function groupManifestByText(manifest) {
  const bySlug = new Map();
  for (const e of manifest) {
    if (!bySlug.has(e.slug)) bySlug.set(e.slug, { slug: e.slug, title: e.label.split(' · ')[0], chapters: [] });
    bySlug.get(e.slug).chapters.push(e);
  }
  for (const t of bySlug.values()) t.chapters.sort((a, b) => a.chapter - b.chapter);
  return [...bySlug.values()];
}
// A chapter's verse list carries an extra sub-level (e.g. Kaṭha's adhyāya.vallī.mantra, refs like
// "1.2.3") when every ref has 3+ dot-segments — group by the 2nd segment in that case so the picker
// can offer it as its own step. Flat chapters (Gītā's "4.1", 2 segments) return null: no sub-level,
// go straight from chapter to verse.
function groupVersesBySection(chapterEntry) {
  const verses = chapterEntry.verses || [];
  if (!verses.length || !verses.every(v => v.ref.split('.').length >= 3)) return null;
  const bySection = new Map();
  for (const v of verses) {
    const key = v.ref.split('.')[1];
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key).push(v);
  }
  return [...bySection.entries()].map(([key, vs]) => ({ key, verses: vs }));
}
function renderReadingPicker() {
  const manifest = window.WALK_MANIFEST || [];
  const texts = groupManifestByText(manifest);
  const p = view.picker || (view.picker = { slug: null, chapterKey: null, sectionKey: null });
  const selectedText = texts.find(t => t.slug === p.slug) || null;
  const selectedChapter = selectedText ? selectedText.chapters.find(c => c.chapterKey === p.chapterKey) : null;
  const sections = selectedChapter ? groupVersesBySection(selectedChapter) : null;
  const selectedSection = sections ? sections.find(s => s.key === p.sectionKey) : null;
  const verseChoices = !selectedChapter ? [] : sections ? (selectedSection ? selectedSection.verses : []) : selectedChapter.verses;
  const hasProgress = selectedChapter && !!loadReadingProgress(selectedChapter.chapterKey);

  app.innerHTML = `
    <div class="picker-head">
      <h2>📖 Choose a verse to read</h2>
      <button class="link" id="pickerBackBtn">← dashboard</button>
    </div>
    ${!texts.length ? '<div class="stats">No chapters built yet.</div>' : `
    <div class="picker-level">
      <label>Text</label>
      <select id="textSelect">
        <option value="">Choose a text…</option>
        ${texts.map(t => `<option value="${esc(t.slug)}"${t.slug === p.slug ? ' selected' : ''}>${esc(t.title)}</option>`).join('')}
      </select>
    </div>
    ${selectedText ? `<div class="picker-level">
      <label>Chapter</label>
      <select id="chapterSelect">
        <option value="">Choose a chapter…</option>
        ${selectedText.chapters.map(c => `<option value="${esc(c.chapterKey)}"${c.chapterKey === p.chapterKey ? ' selected' : ''}>${esc(c.label.split(' · ')[1] || c.label)}</option>`).join('')}
      </select>
    </div>` : ''}
    ${selectedChapter ? `<div class="reading-actions">
      ${hasProgress ? `<button class="primary" data-action="continue" data-key="${selectedChapter.chapterKey}">Continue</button>` : ''}
      <button class="${hasProgress ? 'secondary' : 'primary'}" data-action="start" data-key="${selectedChapter.chapterKey}">${hasProgress ? 'Start over' : 'Start'}</button>
    </div>` : ''}
    ${selectedChapter && sections ? `<div class="picker-level">
      <label>Section</label>
      <select id="sectionSelect">
        <option value="">Choose a section…</option>
        ${sections.map(s => `<option value="${esc(s.key)}"${s.key === p.sectionKey ? ' selected' : ''}>${esc(s.key)}</option>`).join('')}
      </select>
    </div>` : ''}
    ${selectedChapter && (!sections || selectedSection) ? `<div class="picker-level verse-jump">
      <select id="verseSelect">${verseChoices.map(v => `<option value="${esc(v.ref)}">${esc(v.label)}</option>`).join('')}</select>
      <button class="secondary" data-action="goto" data-key="${selectedChapter.chapterKey}">▶ Go to verse</button>
    </div>` : ''}`}
    <div class="deep-toggle"><label><input type="checkbox" id="deepToggle"> Go deep — ask every applicable question per word, not just one</label></div>
    <div class="skills-toggle">
      <div class="skills-head">Which skills do you want to be quizzed on?</div>
      ${SKILL_KINDS.map(s => `<label><input type="checkbox" class="skill-cb" data-kind="${s.kind}" ${enabledSkills[s.kind] !== false ? 'checked' : ''}> ${esc(s.label)}</label>`).join('')}
    </div>`;
  document.getElementById('pickerBackBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
  const textSelect = document.getElementById('textSelect');
  if (textSelect) textSelect.onchange = e => { p.slug = e.target.value || null; p.chapterKey = null; p.sectionKey = null; renderReadingPicker(); };
  const chapterSelect = document.getElementById('chapterSelect');
  if (chapterSelect) chapterSelect.onchange = e => { p.chapterKey = e.target.value || null; p.sectionKey = null; renderReadingPicker(); };
  const sectionSelect = document.getElementById('sectionSelect');
  if (sectionSelect) sectionSelect.onchange = e => { p.sectionKey = e.target.value || null; renderReadingPicker(); };
  app.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      const deep = document.getElementById('deepToggle').checked;
      const key = btn.dataset.key;
      if (btn.dataset.action === 'goto') {
        startReading(key, { deep, verseRef: document.getElementById('verseSelect').value });
      } else {
        startReading(key, { deep, fromBeginning: btn.dataset.action === 'start' });
      }
    };
  });
  // At least one skill must stay enabled, or a reading session would have nothing to ask —
  // revert the checkbox rather than let the picker save an all-off state (undoes the click itself,
  // not a confirm dialog — cheap correction fits the "keep tempo up" spirit of this session's
  // other change).
  app.querySelectorAll('.skill-cb').forEach(cb => cb.onchange = () => {
    const wouldBeAllOff = SKILL_KINDS.every(s => (s.kind === cb.dataset.kind ? cb.checked : enabledSkills[s.kind] !== false) === false);
    if (wouldBeAllOff) { cb.checked = true; return; }
    enabledSkills[cb.dataset.kind] = cb.checked;
    saveEnabledSkills(enabledSkills);
  });
}

function renderReadingComplete() {
  app.innerHTML = `
    <div class="celebrate">
      <h2>📖 Chapter complete!</h2>
      <p>You've walked every question in this chapter.</p>
      <div class="next-choices">
        <button class="primary" id="rcPickAgainBtn">📖 Pick again</button>
        <button class="secondary" id="rcDashBtn">🏠 Dashboard</button>
      </div>
    </div>`;
  document.getElementById('rcPickAgainBtn').onclick = () => { view = { screen: 'picker' }; renderReadingPicker(); };
  document.getElementById('rcDashBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
}

function newQuestion() {
  if (session.mode === 'reading') {
    const picked = pickNextWalkItem();
    if (!picked) { view = { screen: 'readingComplete' }; renderReadingComplete(); return; }
    const { item, code } = picked;
    const { options, correctIndex } = buildOptions(item, code);
    view = { screen: 'quiz', code, item, options, correctIndex, answered: false, picked: -1, justMastered: false, crossingVerse: false };
    renderQuiz();
    return;
  }
  const c = pickNode(session.mode, session.fixedCode);
  const item = pickItem(c);
  const { options, correctIndex } = buildOptions(item, c);
  view = { screen: 'quiz', code: c, item, options, correctIndex, answered: false, picked: -1, justMastered: false };
  renderQuiz();
}

function startQuiz(mode, code) {
  session = { mode, fixedCode: code, batchCount: 0, batchCorrect: 0 };
  newQuestion();
}
function nextQuestion() { newQuestion(); }
// Timer handle for the single-click auto-advance (see AUTO_ADVANCE_DELAY_* above) — cleared
// whenever the user navigates away mid-countdown (e.g. "← dashboard") so a stale advance can't
// fire into whatever screen they've moved to since.
let pendingAdvanceTimer = null;
function goToNextQuestion(mode) {
  clearTimeout(pendingAdvanceTimer);
  if (mode === 'reading') advanceWalk();
  nextQuestion();
}

const CELEBRATE_EMOJI = ['⭐', '✨', '🎉', '🎆', '🌟', '💫'];
const FIREWORK_EMOJI = ['🎆', '🎇', '💥', '✨', '⭐'];
const STAR_SHOWER_EMOJI = ['⭐', '✨', '🌟', '💫'];
// Batch-of-10-complete effect: a few staggered radial "firework" bursts (reuses the existing
// .burst/burst-fly radial mechanic, just from several origin points instead of renderCelebration's
// single center-top one) layered under a wider "star shower" of stars drifting down the whole card
// (.star-fall/star-fall-drift) — deliberately a different look from renderCelebration's single burst,
// so mastering a node and finishing a batch don't feel like the same animation.
function renderFireworksStarShower() {
  const origins = [{ left: 22, top: 18 }, { left: 50, top: 8 }, { left: 78, top: 20 }];
  const fireworks = origins.map((o, gi) => Array.from({ length: 8 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 90;
    const dx = Math.round(Math.cos(angle) * dist);
    const dy = Math.round(Math.sin(angle) * dist);
    const delay = (gi * 0.25 + Math.random() * 0.15).toFixed(2);
    const emoji = FIREWORK_EMOJI[Math.floor(Math.random() * FIREWORK_EMOJI.length)];
    return `<span class="burst" style="left:${o.left}%;top:${o.top}px;--dx:${dx}px;--dy:${dy}px;animation-delay:${delay}s">${emoji}</span>`;
  }).join('')).join('');
  const stars = Array.from({ length: 18 }, () => {
    const left = Math.round(Math.random() * 100);
    const drift = Math.round((Math.random() - 0.5) * 60);
    const delay = (Math.random() * 0.7).toFixed(2);
    const duration = (1.4 + Math.random() * 0.9).toFixed(2);
    const emoji = STAR_SHOWER_EMOJI[Math.floor(Math.random() * STAR_SHOWER_EMOJI.length)];
    return `<span class="star-fall" style="left:${left}%;--drift:${drift}px;animation-delay:${delay}s;animation-duration:${duration}s">${emoji}</span>`;
  }).join('');
  return fireworks + stars;
}
function renderCelebration(code) {
  const particles = Array.from({ length: 24 }, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 150;
    const dx = Math.round(Math.cos(angle) * dist);
    const dy = Math.round(Math.sin(angle) * dist);
    const delay = (Math.random() * 0.2).toFixed(2);
    const emoji = CELEBRATE_EMOJI[Math.floor(Math.random() * CELEBRATE_EMOJI.length)];
    return `<span class="burst" style="--dx:${dx}px;--dy:${dy}px;animation-delay:${delay}s">${emoji}</span>`;
  }).join('');
  const readingBtn = session && session.mode === 'reading'
    ? '<button class="secondary" id="continueReadingBtn2">📖 Continue reading</button>' : '';
  return `
    <div class="celebrate">
      ${particles}
      <h2>🎉 ${code} mastered!</h2>
      <p>10 correct in a row. What next?</p>
      <div class="next-choices">
        <button class="primary" id="mixBtn2">🔀 Mix it up</button>
        <button class="secondary" id="sameBtn2">🔁 Practice ${code} again</button>
        <button class="secondary" id="dashBtn2">🏠 Dashboard</button>
        ${readingBtn}
      </div>
    </div>`;
}

function renderBatchReport() {
  const { batchCount, batchCorrect, mode, fixedCode } = session;
  const repeatLabel = mode === 'node' ? `🔁 Another batch (${fixedCode})` : mode === 'reading' ? '🔁 Continue' : '🔁 Another batch';
  return `
    <div class="celebrate">
      ${renderFireworksStarShower()}
      <h2>📊 Batch complete</h2>
      <p>${batchCorrect} / ${batchCount} correct</p>
      <div class="next-choices">
        <button class="primary" id="mixBtn3">🔀 Mix it up</button>
        <button class="secondary" id="repeatBtn3">${repeatLabel}</button>
        <button class="secondary" id="dashBtn3">🏠 Dashboard</button>
      </div>
    </div>`;
}

// Reading-mode-only terminal screen: shown whenever the NEXT step would cross into a different
// verse, regardless of whether the 10-question batch cap was also hit — a verse boundary always
// ends the current run of questions (see peekNextVerseCrossing/advanceWalk).
function renderVerseComplete() {
  const { batchCount, batchCorrect } = session;
  const curStep = walkSteps[walkPos.stepIdx];
  const verseRef = curStep ? curStep.verseRef : null;
  const chapterDone = !walkSteps[walkPos.stepIdx + 1];
  return `
    <div class="celebrate">
      <h2>📖 ${chapterDone ? 'Chapter complete!' : 'Verse ' + esc(verseRef || '') + ' complete'}</h2>
      <p>${batchCorrect} / ${batchCount} correct this verse</p>
      <div class="next-choices">
        ${chapterDone ? '' : '<button class="primary" id="nextVerseBtn">➡ Next verse</button>'}
        <button class="secondary" id="repeatVerseBtn">🔁 Try this verse again</button>
        <button class="secondary" id="pickAgainBtn">📖 Pick again</button>
      </div>
    </div>`;
}

// Three distinct question shapes share the same options/feedback/bottom layout, differing only
// in what's asked: samāsa classification (show a word, ask its type), no-sandhi word-boundary
// (show a fused string, ask where it splits), and the default sandhi question (show two words,
// ask for the joined form).
function renderPrompt(item) {
  const srcLine = `<div class="src">${item.source === 'mula' ? 'mūla' : 'bhāṣya'}${item.ref ? ' · ' + esc(item.ref) : ''}</div>`;
  const ctxLine = item.context ? `<div class="context">${esc(item.context)}</div>` : '';
  if (item.kind === 'samasa') {
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">What type of samāsa is this?</div>${ctxLine}${srcLine}`;
  }
  if (item.kind === 'vibhakti') {
    const hint = item.subtype === 'stem' ? 'What is this word’s prātipadika (stem)?'
      : item.subtype === 'gender' ? 'Is this word masculine, feminine, or neuter?'
      : item.subtype === 'sarvanama' ? 'Is this word’s prātipadika a sarvanāma (from the closed pronoun class)?'
      : 'What case and number is this?';
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">${hint}</div>${ctxLine}${srcLine}`;
  }
  if (item.kind === 'dhatu') {
    const hint = item.subtype === 'prayoga' ? 'Is this verb कर्तरि (active) or कर्मणि (passive/impersonal)?'
      : 'What tense/person/number/voice is this verb form?';
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">${hint}</div>${ctxLine}${srcLine}`;
  }
  if (item.kind === 'krdanta') {
    const hint = item.subtype === 'prayoga' ? 'Is this participle कर्तरि (active) or कर्मणि (passive/impersonal)?'
      : 'Which kṛt-pratyaya formed this word?';
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">${hint}</div>${ctxLine}${srcLine}`;
  }
  if (item.kind === 'taddhita') {
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">Which taddhita-pratyaya (secondary derivation) formed this word?</div>${ctxLine}${srcLine}`;
  }
  if (item.kind === 'meaning') {
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">What does this word mean?</div>${ctxLine}${srcLine}`;
  }
  if (item.subtype === 'lopa') {
    return `<div class="prompt">${esc(item.before[0])} <span class="plus">+</span> ${esc(item.before[1])}</div>
      <div class="prompt-hint">What was elided (lost) at this junction?</div>${ctxLine}${srcLine}`;
  }
  if (item.code === 'ABT') {
    return `<div class="prompt">${esc(item.after)}</div>
      <div class="prompt-hint">Where's the word boundary?</div>${ctxLine}${srcLine}`;
  }
  if (item.askSplit) {
    return `<div class="prompt">${esc(item.after)}</div>
      <div class="prompt-hint">What are the two original words (before sandhi)?</div>${ctxLine}${srcLine}`;
  }
  // Plain join-direction sandhi question (global mastery/mix-it-up pool, not reading-walk —
  // those set askSplit and are handled above). No context line here: the fused word appearing
  // in context would just hand the answer over.
  return `<div class="prompt">${esc(item.before[0])} <span class="plus">+</span> ${esc(item.before[1])} <span class="arrow">→</span> ?</div>
    ${srcLine}`;
}
function displayOption(item, opt) { return item.kind === 'samasa' ? samasaLabel(opt) : opt; }

function renderQuiz() {
  const { code, item, options, correctIndex, answered, picked, justMastered, crossingVerse } = view;
  const { mode, batchCount } = session;
  const p = ensureProgress(code);
  const modeTag = mode === 'mixed' ? ' · 🔀 mixed' : mode === 'adaptive' ? ' · adaptive'
    : mode === 'reading' ? ` · 📖 ${esc(item.ref || '')}` : '';
  const batchDone = answered && batchCount >= BATCH_SIZE;
  const verseComplete = answered && mode === 'reading' && crossingVerse;
  const bottom = !answered ? '' : justMastered
    ? renderCelebration(code)
    : verseComplete ? renderVerseComplete()
    : batchDone ? renderBatchReport()
    : '<button class="primary" id="nextBtn">Next question →</button>';
  app.innerHTML = `
    <div class="quiz-head">
      <button class="link" id="backBtn">← dashboard</button>
      <span class="code">${code}</span> <span class="label">${LABELS[code] || ''}${modeTag}</span>
      <span class="batch">Q${Math.min(batchCount + (answered ? 0 : 1), BATCH_SIZE)}/${BATCH_SIZE}</span>
      <span class="streak">streak ${p.streak} · best ${p.best}${p.mastered ? ' · ✓ mastered' : ''}</span>
    </div>
    <div class="question">
      ${renderPrompt(item)}
    </div>
    <div class="options">
      ${options.map((opt, i) => {
        let cls = '';
        if (answered) {
          if (i === correctIndex) cls = 'correct';
          else if (i === picked) cls = 'wrong';
        }
        return `<button class="opt ${cls}" data-i="${i}" ${answered ? 'disabled' : ''}>${esc(displayOption(item, opt))}</button>`;
      }).join('')}
    </div>
    <div class="feedback">${answered ? (picked === correctIndex
        ? `correct! ${item.sutra ? '(' + esc(item.sutra) + ')' : ''}`
        : `not quite — correct answer highlighted. ${item.sutra ? '(' + esc(item.sutra) + ')' : ''}`) : ''}</div>
    ${bottom}`;
  document.getElementById('backBtn').onclick = () => { clearTimeout(pendingAdvanceTimer); view = { screen: 'dashboard' }; renderDashboard(); };
  if (answered && justMastered) {
    document.getElementById('mixBtn2').onclick = () => startQuiz('mixed');
    document.getElementById('sameBtn2').onclick = () => startQuiz('node', code);
    document.getElementById('dashBtn2').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
    const contBtn = document.getElementById('continueReadingBtn2');
    if (contBtn) contBtn.onclick = () => continueReadingFromCelebration();
  } else if (answered && verseComplete) {
    const nextVerseBtn = document.getElementById('nextVerseBtn');
    if (nextVerseBtn) nextVerseBtn.onclick = () => continueReadingBatch();
    document.getElementById('repeatVerseBtn').onclick = () => repeatCurrentVerse();
    document.getElementById('pickAgainBtn').onclick = () => { view = { screen: 'picker' }; renderReadingPicker(); };
  } else if (answered && batchDone) {
    document.getElementById('mixBtn3').onclick = () => startQuiz('mixed');
    document.getElementById('repeatBtn3').onclick = () => {
      if (mode === 'reading') continueReadingBatch();
      else startQuiz(session.mode, session.fixedCode);
    };
    document.getElementById('dashBtn3').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
  } else if (answered) {
    document.getElementById('nextBtn').onclick = () => goToNextQuestion(mode); // manual override, skips the auto-advance wait
    pendingAdvanceTimer = setTimeout(() => goToNextQuestion(mode), picked === correctIndex ? AUTO_ADVANCE_DELAY_CORRECT : AUTO_ADVANCE_DELAY_WRONG);
  } else {
    app.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      const i = +btn.dataset.i;
      const correct = i === correctIndex;
      playAnswerSound(correct);
      const { justMastered } = recordAnswer(code, correct);
      session.batchCount++;
      if (correct) session.batchCorrect++;
      if (session.batchCount === BATCH_SIZE) setTimeout(playBatchCompleteSound, 400);
      const crossing = mode === 'reading' ? peekNextVerseCrossing() : false;
      view = { ...view, answered: true, picked: i, justMastered, crossingVerse: crossing };
      renderQuiz();
    });
  }
}

renderDashboard();
