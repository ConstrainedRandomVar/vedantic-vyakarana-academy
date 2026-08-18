'use strict';
// Sandhi quiz app logic: per-node streak mastery (10 correct in a row), adaptive node
// selection weighted toward weak/unmastered nodes, localStorage persistence. No framework,
// no build step — matches search.html/review.html's dependency-free convention.

const LABELS = {
  SVD: 'savarṇadīrgha', GUN: 'guṇa', VRD: 'vṛddhi', YAN: 'yaṇ', AYA: 'ayādi', PVR: 'pūrvarūpa',
  SCU: 'ścutva', JSH: 'jaśtva', CAR: 'cartva', ANU: 'anusvāra', PSV: 'parasavarṇa',
  NUD: 'ṅamuṭ', HKC: 'hakāra→caturtha', LAT: 'latva',
  VSS: 'visarga → s', VSR: 'visarga → r', VSO: 'visarga → o', VSL: 'visarga-lopa', ANN: 'anunāsika',
  ABT: 'no-sandhi word boundary', MIX: 'sandhi (rule unclassified)', SAMASA: 'samāsa classification',
  DHT: 'dhātu (verb-ending/tense)', VIB: 'vibhakti (case-ending)', MNG: 'word meaning',
  MNG1: 'word meaning (vocabulary)', MNG2: 'word meaning (compound/phrase)',
  VIB1: 'vibhakti (case & number)', VIB2: 'vibhakti (stem/gender/pronoun)',
  KRT: 'kṛt-pratyaya (kṛdanta)', TAD: 'taddhita-pratyaya (secondary derivation)',
  PCH: 'padaccheda (full word-split)', KAR: 'kāraka (syntactic role)',
};
// meaning and vibhakti each split into two distinct GLOBAL-pool dashboard nodes (MNG1/MNG2,
// VIB1/VIB2) since each pair is a materially different skill — meaning: MNG1 recalls a single
// word's plain meaning (gloss is 1-2 words) vs. MNG2 parses+translates a long compound into a full
// phrase. vibhakti: VIB1 is the classic "what case/number is this word in" drill vs. VIB2 is
// word-property identification (stem/lemma, gender, pronoun-recognition). The bare VIB/MNG codes
// above are still needed too — reading-walk items (walk-data-<chapter>.js) keep their original
// unsplit code, only the corpus-wide axis pool (build_axis_items.js) is split. KIND_LABELS below
// is keyed by kind, which can't tell VIB1 from VIB2 (or MNG1 from MNG2) apart, so these codes get
// their own headline via CODE_LABEL_OVERRIDES instead (see renderNodeCard); renderCategorySection
// groups each split pair under one collapsible card with combined progress, same pattern as the
// Sandhi category.
const CODE_LABEL_OVERRIDES = {
  MNG1: 'अर्थ · Word meaning (vocabulary)', MNG2: 'अर्थ · Word meaning (compound/phrase)',
  VIB1: 'विभक्ति · Case & number', VIB2: 'विभक्ति · Stem, gender & pronoun',
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

// ---- "report wrong answer" feature: pre-filled GitHub issue, no backend. Two-tier hide (see
// isReportHidden()): an instant per-browser hide the moment a report is filed, plus a shipped
// window.FLAGGED_WRONG list (flagged-wrong.js) Harsha edits once he's reviewed the issue — only
// entries in THAT file are hidden for every user. ----
const REPORTER_KEY = 'sandhiQuizReporterName';
const REPORTER_EMAIL_KEY = 'sandhiQuizReporterEmail';
const HIDDEN_REPORTS_KEY = 'sandhiQuizHiddenReports';
function loadReporterName() { return localStorage.getItem(REPORTER_KEY) || ''; }
function saveReporterName(name) { localStorage.setItem(REPORTER_KEY, name); }
function loadReporterEmail() { return localStorage.getItem(REPORTER_EMAIL_KEY) || ''; }
function saveReporterEmail(email) { localStorage.setItem(REPORTER_EMAIL_KEY, email); }
function loadHiddenReports() {
  try {
    const saved = JSON.parse(localStorage.getItem(HIDDEN_REPORTS_KEY));
    if (Array.isArray(saved)) return new Set(saved);
  } catch (e) { /* fall through to empty set */ }
  return new Set();
}
function saveHiddenReports(set) { localStorage.setItem(HIDDEN_REPORTS_KEY, JSON.stringify([...set])); }
let hiddenReports = loadHiddenReports();
const SHIPPED_FLAGGED = new Set(window.FLAGGED_WRONG || []);
function isReportHidden(key) { return hiddenReports.has(key) || SHIPPED_FLAGGED.has(key); }
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

// ---- Dashboard grouping: every item already carries a `kind` (same taxonomy SKILL_KINDS below
// already uses for the reading-walk's per-kind toggles) — derived here, not hand-maintained, so a
// newly-added axis/code is grouped automatically instead of silently landing in the wrong bucket
// or needing a hardcoded list update. `sandhi` dwarfs every other kind (dozens of individual
// Pāṇini-sūtra codes vs. one code per axis for everything else) — kept as its own collapsible
// group in renderDashboard() rather than forcing every kind through the same accordion treatment.
const KIND_LABELS = {
  sandhi: 'सन्धि · Sandhi rules', vibhakti: 'विभक्ति · Case, gender, stem',
  dhatu: 'धातु · Verb tense/voice', samasa: 'समास · Compound classification',
  krdanta: 'कृदन्त · Participles', taddhita: 'तद्धित · Secondary derivation',
  karaka: 'कारक · Syntactic role', meaning: 'अर्थ · Word meaning',
  verbvoice: 'क्रिया · Verb & voice (overview)',
};
const CODES_BY_KIND = {};
const CODE_KIND = {};
for (const code of CODES) {
  const kind = itemsByCode[code][0].kind || 'sandhi';
  CODE_KIND[code] = kind;
  (CODES_BY_KIND[kind] = CODES_BY_KIND[kind] || []).push(code);
}

// ---- Lazy-loaded global axis pools (axis-manifest.js, e.g. meaning-1/meaning-2) — declared here
// but not fetched until their dashboard card is actually clicked (ensureAxisLoaded()), same lazy
// <script> pattern reading-walk already uses for walk-data-<chapter>.js. Added 2026-08-11: the
// eagerly-loaded quiz-items.js baseline alone had crept to ~96MB of GitHub's 100MB hard push
// limit from organic corpus growth, before any meaning content was even added — bundling every
// large axis in eagerly was no longer sustainable. These codes are listed in CODES/CODES_BY_KIND
// immediately (so their dashboard card renders and progress pre-seeds like any other node), but
// deliberately WITHOUT an itemsByCode entry until loaded — pickMixedNode/pickWeightedNode below
// filter on itemsByCode[c] being present, so Mix it up/Practice simply won't draw a lazy axis
// until its card has been opened directly at least once this session.
const AXIS_MANIFEST = window.AXIS_MANIFEST || [];
for (const ax of AXIS_MANIFEST) {
  if (itemsByCode[ax.code]) continue; // already present eagerly — don't shadow
  CODE_KIND[ax.code] = ax.kind;
  CODES.push(ax.code);
  (CODES_BY_KIND[ax.kind] = CODES_BY_KIND[ax.kind] || []).push(ax.code);
}
CODES.sort();
function ensureAxisLoaded(code) {
  if (itemsByCode[code]) return Promise.resolve();
  const entry = AXIS_MANIFEST.find(a => a.code === code);
  if (!entry) return Promise.resolve();
  if (ensureAxisLoaded._pending && ensureAxisLoaded._pending[code]) return ensureAxisLoaded._pending[code];
  ensureAxisLoaded._pending = ensureAxisLoaded._pending || {};
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = entry.file;
    s.onload = () => {
      const items = (window.AXIS_DATA && window.AXIS_DATA[code]) || [];
      itemsByCode[code] = items;
      for (const it of items) window.QUIZ_ITEMS.push(it);
      resolve();
    };
    s.onerror = () => reject(new Error('failed to load ' + entry.file));
    document.head.appendChild(s);
  });
  ensureAxisLoaded._pending[code] = p;
  return p;
}

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
  { kind: 'verbvoice', label: 'क्रिया · verb & voice overview (leads each verse)' },
  { kind: 'sandhi', label: 'सन्धि (sandhi)' },
  { kind: 'samasa', label: 'समास (samāsa)' },
  { kind: 'vibhakti', label: 'विभक्ति (case, gender, stem)' },
  { kind: 'dhatu', label: 'धातु (verb tense/voice)' },
  { kind: 'krdanta', label: 'कृदन्त (participles)' },
  { kind: 'taddhita', label: 'तद्धित (secondary derivation)' },
  { kind: 'karaka', label: 'कारक (kāraka role)' },
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
  return step.items.map((_, i) => i).filter(i => {
    const it = step.items[i];
    if (isReportHidden(reportKey(it, null))) return false;
    // 'spot' items aren't their own toggleable skill — they're the basic-tier question for
    // whichever node their subtype names (krdanta or taddhita), so they follow THAT toggle.
    return it.kind === 'spot' ? enabledSkills[it.subtype] !== false : enabledSkills[it.kind] !== false;
  });
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
// Closed value-universes for vibhakti/dhātu/kṛdanta/taddhita/kāraka/meaning distractor generation.
// Chapter-scoped while reading (computeWalkPools(), called from startReading — derives from
// what's actually in THAT chapter, so a Gita reading-walk doesn't show Brahma-sūtra vocabulary as
// a wrong answer). Falls back to (and is explicitly reset to, in startQuiz) the CORPUS-WIDE pool
// computed from window.QUIZ_ITEMS below — without this, starting a node/mixed/adaptive session
// before ever opening a reading-walk chapter would leave every one of these axes' distractor
// pools empty, since nothing had populated them yet.
function computeItemPools(allItems) {
  const vibItems = allItems.filter(it => it.kind === 'vibhakti');
  // 'prayoga'-subtype dhātu items don't carry lakara/purusha/vacana/pada at all — scope the
  // tense-axis pools to the 'tense' subtype only, or Set() would pick up stray `undefined` values.
  const dhatuTenseItems = allItems.filter(it => it.kind === 'dhatu' && it.subtype === 'tense');
  const krdantaItems = allItems.filter(it => it.kind === 'krdanta' && it.subtype === 'pratyaya');
  const taddhitaItems = allItems.filter(it => it.kind === 'taddhita' && it.subtype === 'pratyaya');
  const karakaItems = allItems.filter(it => it.kind === 'karaka' && it.subtype === 'role');
  return {
    krt: [...new Set(krdantaItems.map(it => it.pratyaya))],
    taddhita: [...new Set(taddhitaItems.map(it => it.pratyaya))],
    karaka: [...new Set(karakaItems.map(it => it.role))],
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
let walkItemPools = computeItemPools(window.QUIZ_ITEMS);

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
  if (item.kind === 'verbvoice') return buildVerbVoiceOptions(item);
  if (item.kind === 'samasa') return buildSamasaOptions(item);
  if (item.kind === 'vibhakti') return buildVibhaktiOptions(item);
  if (item.kind === 'dhatu') return buildDhatuQuestionOptions(item);
  if (item.kind === 'krdanta') return buildKrdantaQuestionOptions(item);
  if (item.kind === 'taddhita') return buildTaddhitaOptions(item);
  if (item.kind === 'karaka' && (item.subtype === 'associate' || item.subtype === 'governor' || item.subtype === 'implied')) return buildKarakaAssociateOptions(item);
  if (item.kind === 'karaka') return buildKarakaOptions(item);
  if (item.kind === 'spot') return buildSpotOptions(item);
  if (item.kind === 'meaning') return buildMeaningOptions(item);
  if (item.subtype === 'spotlopa') return buildSpotOptions(item); // same shape as spot: kRt/taddhita items
  if (item.subtype === 'lopa') return buildLopaOptions(item);
  if (item.subtype === 'fullsplit') return buildFullSplitOptions(item);
  if (item.code === 'ABT' || item.askSplit) return buildSplitOptions(item);
  return buildSandhiOptions(item, code);
}

// Samāsa classification options: correct category + 3 others drawn from the fixed category
// universe (a small, closed set — unlike sandhi's per-word junction perturbation, no need to
// generate anything, just exclude the TP-parent when the correct answer is a TP subtype).
function buildSamasaOptions(item) {
  const correct = item.category;
  let pool = SAMASA_CATEGORIES.filter(c => c !== correct);
  if (isTPSubtype(correct)) {
    pool = pool.filter(c => c !== TP_GENERAL);
  } else if (correct === TP_GENERAL) {
    pool = pool.filter(c => !isTPSubtype(c));
  } else if (pool.includes(TP_GENERAL) && pool.some(isTPSubtype)) {
    // correct is unrelated to tatpuruṣa entirely (Bahuvrīhi/Dvandva/etc.) — the two branches above
    // only guard against TP_GENERAL and a TP subtype BOTH appearing when the correct answer IS one
    // of them; with an unrelated correct answer neither branch fired, so a random draw could still
    // show "तत्पुरुष" alongside e.g. "तृतीया-तत्पुरुष" — general vs one of its OWN specific
    // children, reads as two right-ish answers (found via a real report, 2026-08-11: a Bahuvrīhi
    // question showed both). Multiple DIFFERENT subtypes together (no general) is fine — they're
    // genuinely mutually exclusive answers, not a redundant pairing — so only drop one side of the
    // general/specific divide, at random, not every subtype down to a single survivor.
    pool = Math.random() < 0.5 ? pool.filter(c => c !== TP_GENERAL) : pool.filter(c => !isTPSubtype(c));
  }
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
// Wrong-boundary candidates for ONE junction within a full multi-way split — same near-the-true-
// cut character-offset approach as splitDistractors (same validSplitOffset combining-mark guard),
// but returns raw [x, y] piece pairs instead of a formatted "X + Y" string, since the caller needs
// to splice the pair back into a longer word list, not display it alone. Kept separate from
// splitDistractors (not refactored to share) to avoid any risk of changing that function's
// existing, already-tested behavior.
function nearbyWrongPairs(after, trueBoundary, maxCount) {
  const out = [];
  const offsets = shuffle([-3, -2, -1, 1, 2, 3].map(d => trueBoundary + d));
  for (const k of offsets) {
    if (out.length >= maxCount) break;
    if (!validSplitOffset(after, k)) continue;
    out.push([after.slice(0, k), after.slice(k)]);
  }
  for (let k = 1; k < after.length && out.length < maxCount; k++) {
    if (!validSplitOffset(after, k)) continue;
    const pair = [after.slice(0, k), after.slice(k)];
    if (!out.some(([x, y]) => x === pair[0] && y === pair[1])) out.push(pair);
  }
  return out;
}
// "Find ALL the word boundaries" (padaccheda) question — the whole fused surface is the prompt,
// options are complete alternative segmentations. Correct = the real word list; each wrong answer
// perturbs exactly ONE boundary (reusing splitDistractors' near-the-true-cut approach) while
// keeping every OTHER boundary at its real, correct position — a plausible-looking wrong full
// segmentation, not scattered noise across the whole string.
function buildFullSplitOptions(item) {
  const correct = item.words.join(' + ');
  const distractors = [];
  const boundaryOrder = shuffle(item.afters.map((_, i) => i));
  for (const i of boundaryOrder) {
    if (distractors.length >= 3) break;
    const trueBoundary = commonPrefixLen(item.afters[i], item.words[i]);
    for (const [x, y] of nearbyWrongPairs(item.afters[i], trueBoundary, 3)) {
      if (distractors.length >= 3) break;
      const candWords = [...item.words.slice(0, i), x, y, ...item.words.slice(i + 2)];
      const cand = candWords.join(' + ');
      if (cand !== correct && !distractors.includes(cand)) distractors.push(cand);
    }
  }
  const shown = [correct, ...distractors];
  const options = shuffle(shown);
  return { options, correctIndex: options.indexOf(correct) };
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

// ---- kāraka (syntactic role) — externally sourced (see build_karaka_data.js), not classified
// in-house. Same shape as taddhita: 4 options drawn from the chapter's own closed 6-role universe.
// समानाधिकरणम् is the merged label for कर्तृ-/कर्मसमानाधिकरणम् when only one of the two occurs in a
// verse (see build_karaka_data.js) — but when BOTH occur, the verse keeps them distinct instead of
// folding, so the chapter-wide pool can carry all three strings at once. They must never appear
// together in one question (as correct answer + distractor either way): समानाधिकरणम् is really just
// "agrees with something, subtype unspecified" — offering it alongside the specific कर्तृ/कर्म
// subtype isn't a real wrong answer, it's an ambiguous near-duplicate of the right one. Per Harsha
// (2026-08-05).
const KARAKA_MUTUALLY_EXCLUSIVE_GROUPS = [
  ['समानाधिकरणम्', 'कर्तृसमानाधिकरणम्', 'कर्मसमानाधिकरणम्'],
];
function karakaConflictsWith(role) {
  const group = KARAKA_MUTUALLY_EXCLUSIVE_GROUPS.find(g => g.includes(role));
  return group ? new Set(group.filter(r => r !== role)) : new Set();
}
// Verb/voice "broader view" opener (Phase 2 step 4): a fixed 3-way choice — कर्तरि / कर्मणि / भावे.
// Fixed universe (not a corpus-derived pool), same spirit as the dhātu-prayoga voice question; the
// correct value is Zenodo's own voice tag baked in at build time (build_reading_walk.js's opener).
function buildVerbVoiceOptions(item) {
  const options = ['कर्तरि', 'कर्मणि', 'भावे'];
  return { options, correctIndex: options.indexOf(item.voice) };
}
// A समानाधिकरण word (कर्तृ-/कर्मसमानाधिकरणम्, or the merged समानाधिकरणम्) genuinely IS the core kāraka
// it agrees with — the corpus's "primary कर्म vs. agreeing कर्म" split is largely an annotation
// artifact, not a grammatical difference worth marking wrong (see expectedSetForStep's note, Harsha
// 2026-08-16, found live via BG 4.1: इमम् tagged कर्म, योगम् tagged कर्मसमानाधिकरणम् — same referent,
// "this yoga"). The tutorial neutralizes this by pooling both into one accepted set; read-a-verse's
// per-word role question can't pool (it quizzes each word separately), so instead a role question on
// a समानाधिकरण word ALSO accepts its base kāraka as correct — carrying the tutorial's fix across
// (Harsha, 2026-08-18). The merged समानाधिकरणम् label (emitted when only one of कर्तृ/कर्म agreement
// occurs in the verse — see build_karaka_data.js) has lost which base it was, so it accepts either.
function karakaAlsoAcceptedRoles(role) {
  if (role === 'कर्मसमानाधिकरणम्') return ['कर्म'];
  if (role === 'कर्तृसमानाधिकरणम्') return ['कर्ता'];
  if (role === 'समानाधिकरणम्') return ['कर्म', 'कर्ता'];
  return [];
}
function buildKarakaOptions(item) {
  const correct = item.role;
  const recentAnswers = recentAnswersByCode.KAR || [];
  const excluded = karakaConflictsWith(correct);
  const pool = shuffle((walkItemPools.karaka || []).filter(r => r !== correct && !excluded.has(r)));
  const distractors = [];
  for (const c of pool) { if (distractors.length >= 3) break; if (!distractors.includes(c) && !recentAnswers.includes(c)) distractors.push(c); }
  for (const c of pool) { if (distractors.length >= 3) break; if (!distractors.includes(c)) distractors.push(c); }
  const shown = [correct, ...distractors];
  recentAnswersByCode.KAR = [...shown, ...recentAnswers].slice(0, RECENT_ANSWER_WINDOW);
  const options = shuffle(shown);
  const also = new Set(karakaAlsoAcceptedRoles(correct));
  const acceptIndices = also.size ? options.map((o, i) => (also.has(o) ? i : -1)).filter(i => i >= 0) : [];
  return { options, correctIndex: options.indexOf(correct), acceptIndices };
}
// सुप्_समुच्चितम् ("which word does this go with?") — options are real words from the SAME verse,
// baked in at build time (build_karaka_data.js), same shape as buildSpotOptions: no chapter-wide
// pool, since an unrelated word from a different verse would make the question meaningless (and,
// specific to this axis, the build-time exclusion already keeps out any word from the target's own
// referential cluster — see that script's own comment for why).
function buildKarakaAssociateOptions(item) {
  const correct = item.targetWord;
  const options = shuffle([correct, ...item.distractorWords]);
  return { options, correctIndex: options.indexOf(correct) };
}

// ---- "spot the word" (basic tier for kṛdanta/taddhita — recognition, not yet naming the
// pratyaya): options are real OTHER words from the SAME sentence, baked in at build time
// (build_reading_walk.js), not drawn from a chapter-wide pool — an unrelated word from a
// different verse would make the question meaningless. Only the display order is randomized here.
function buildSpotOptions(item) {
  const correct = item.targetWord;
  const options = shuffle([correct, ...item.distractorWords]);
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

// Lazy axis codes (see AXIS_MANIFEST above) are listed in CODES from page load so their card
// renders, but have no itemsByCode entry until opened directly — excluded here so Mix it
// up/Practice never draws a code with nothing loaded to draw from yet.
function pickWeightedNode() {
  const loaded = CODES.filter(c => itemsByCode[c]);
  const unmastered = loaded.filter(c => !progress[c].mastered);
  const pool = unmastered.length ? unmastered : loaded;
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
function pickMixedNode() { const loaded = CODES.filter(c => itemsByCode[c]); return loaded[Math.floor(Math.random() * loaded.length)]; }

function pickNode(mode, code) {
  if (mode === 'adaptive') return pickWeightedNode();
  if (mode === 'mixed') return pickMixedNode();
  return code;
}

// ---- reading-walk: load, flatten, position, and step through a chosen chapter ----
// Resume position is keyed by chapterKey ALONE for the default 'both' scope (preserves every
// existing saved resume point unchanged), and by `${chapterKey}::${scope}` for the 'mula'/'bhasya'
// scopes — those walk a DIFFERENT, differently-sized steps array (see flattenWalk), so a stepIdx
// saved under one scope would silently point at an unrelated word position under another.
function readingProgressKey(chapterKey, scope) { return (!scope || scope === 'both') ? chapterKey : `${chapterKey}::${scope}`; }
function loadReadingProgress(chapterKey, scope) {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(READING_KEY)) || {}; } catch (e) {}
  return p[readingProgressKey(chapterKey, scope)] || null;
}
function saveReadingProgress(chapterKey, scope, pos) {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(READING_KEY)) || {}; } catch (e) {}
  p[readingProgressKey(chapterKey, scope)] = pos;
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
// scope: 'both' (default) | 'mula' | 'bhasya' — per Harsha's request to read mūla-only or
// bhāṣya-only, not always both interleaved per verse.
function flattenWalk(chapterKey, scope) {
  const ch = window.WALK_DATA[chapterKey];
  const sections = scope === 'mula' ? ['mula'] : scope === 'bhasya' ? ['bhasya'] : ['mula', 'bhasya'];
  const out = [];
  for (const v of ch.verses) {
    for (const section of sections) {
      for (const s of v.sections[section].steps) {
        out.push({ verseRef: v.ref, verseLabel: v.label, moola: v.moola, section, ...s });
      }
    }
  }
  return out;
}
// Closed value-universes for vibhakti/dhātu distractor generation, sourced from whatever's
// actually in THIS loaded chapter (mirrors SAMASA_CATEGORIES' "derive from shipped data" spirit).
function computeWalkPools() { walkItemPools = computeItemPools(walkSteps.flatMap(s => s.items)); }
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
  if (item.kind === 'karaka' && item.subtype === 'associate') return `kar:assoc:${item.ref}:${item.word}:${item.targetWord}`;
  if (item.kind === 'karaka' && item.subtype === 'governor') return `kar:gov:${item.ref}:${item.word}:${item.targetWord}`;
  // `wordIndex` (not just word text) disambiguates a repeated GOVERNING word (BG 4.17's triple
  // बोद्धव्यम्, each with its own elided "(तत्त्वम्)") — item.word alone is identical text for all
  // three occurrences and would otherwise collide, same collision class as the जन्म fix above.
  if (item.kind === 'karaka' && item.subtype === 'implied') return `kar:implied:${item.ref}:${item.wordIndex}:${item.role}:${item.targetWord}`;
  // `ref` (not just word+role) and occurrenceIndex both matter here: without `ref`, the same
  // word+role recurring in a LATER verse (e.g. सः as कर्ता in two different verses) would collide
  // and silently never be asked a second time; without occurrenceIndex, two occurrences of the SAME
  // word+role WITHIN one verse (e.g. BG 4.4's जन्म, कर्ता at both word 2 and word 4 — see
  // annotateKarakaOccurrences in build_reading_walk.js) would do the same. Absent for the (common)
  // non-repeating case, so `|| 1` there changes nothing about existing signatures.
  if (item.kind === 'karaka') return `kar:${item.ref}:${item.word}:${item.role}:${item.occurrenceIndex || 1}`;
  if (item.kind === 'spot') return `spot:${item.subtype}:${item.ref}:${item.targetWord}`;
  if (item.kind === 'verbvoice') return `vvc:${item.ref}:${item.verb}:${item.voice}`;
  if (item.kind === 'meaning') return `mng:${item.word}:${item.meaning}`;
  if (item.kind === 'samasa') return `sam:${item.word}:${item.category}`;
  if (item.subtype === 'spotlopa') return `spotlopa:${item.ref}:${item.targetWord}`;
  if (item.subtype === 'lopa') return `lopa:${item.code}:${item.before.join('+')}`;
  if (item.subtype === 'fullsplit') return `pch:${item.ref}:${item.surface}`;
  return `sdh:${item.code}:${item.before.join('+')}:${item.after}`;
}
// A stable key identifying THIS specific question for report/hide purposes — distinct from
// questionSignature() alone because reading-walk and global-pool items need different
// disambiguation (see PLANS.md's "report wrong answer" design): reading-walk items are keyed by
// chapter + signature (questionSignature alone can collide across different texts' same `ref`);
// global-pool items use their own `id` when present (existing field from build_items.js/
// build_samasa_items.js), falling back to code + signature for the rare item without one.
function reportKey(item, code) {
  if (session && session.mode === 'reading') return `${session.chapterKey}:${questionSignature(item)}`;
  return item.id ? item.id : `${code}:${questionSignature(item)}`;
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
        return { item, code: item.code, moola: step.moola, verseLabel: step.verseLabel };
      }
      // kāraka items are unlike every other kind here: each one names a DIFFERENT underlying
      // sub-word within a fused corpus token (e.g. "प्रोक्तवानहमव्ययम्" = प्रोक्तवान्+अहम्+अव्ययम्,
      // each with its own role) rather than another facet of the SAME word — so once the step's
      // one guaranteed (default-rotation) question is spent, remaining unasked kāraka items jump
      // the queue ahead of other kinds' facets (see the matching stepHasMoreKaraka gate in
      // advanceWalk/peekNextVerseCrossing that keeps the walk on this step until they're asked).
      const rest = eligible.filter(i => i !== step.defaultItemIndex);
      const leadFirst = rest.filter(i => LEAD_KINDS.has(step.items[i].kind));
      const others = rest.filter(i => !LEAD_KINDS.has(step.items[i].kind));
      const order = eligible.includes(step.defaultItemIndex)
        ? [step.defaultItemIndex, ...leadFirst, ...others]
        : [...leadFirst, ...others];
      const itemIdx = order.find(i => !askedSignatures.has(questionSignature(step.items[i])));
      if (itemIdx !== undefined) {
        const item = step.items[itemIdx];
        askedSignatures.add(questionSignature(item));
        return { item, code: item.code, moola: step.moola, verseLabel: step.verseLabel };
      }
    }
    // Either every eligible axis at this word position has already been asked (its exact content,
    // not just this occurrence — most common on frequent particles like च/एव/न recurring with an
    // identical gloss), or NO axis here is currently enabled at all (e.g. a pure-meaning word with
    // 'meaning' turned off). Either way, skip straight to the next word; persist immediately so a
    // reload mid-skip resumes from the position actually being shown, not the one skipped past.
    walkPos = { stepIdx: walkPos.stepIdx + 1, itemIdx: 0 };
    saveReadingProgress(session.chapterKey, session.scope, walkPos);
    step = walkSteps[walkPos.stepIdx];
  }
  return null; // chapter complete
}
// "Lead" kinds jump the per-step queue and keep the walk on a step until all of them are asked
// (even outside deep mode): kāraka items, because each names a DIFFERENT sub-word of a fused token
// (see pickNextWalkItem); and verbvoice items, because the synthetic verse-opener step (Phase 2
// step 4) can hold one per finite verb and every verse's verb(s) should be asked, not just the first.
const LEAD_KINDS = new Set(['karaka', 'verbvoice']);
// See the comment in pickNextWalkItem: a step can hold several lead-kind items and none should be
// skipped just because the step already yielded its one default-rotation question — so the step
// isn't "done", even outside deep mode, while an eligible lead-kind item here hasn't been asked yet.
function stepHasMoreLead(step) {
  return eligibleIndices(step).some(i => LEAD_KINDS.has(step.items[i].kind) && !askedSignatures.has(questionSignature(step.items[i])));
}
// True if advancing past the CURRENT (not-yet-advanced) step/item would move into a different
// verse, or run off the end of the chapter — decided BEFORE advancing so the answer-feedback
// screen can choose the right terminal panel for the question just answered.
function peekNextVerseCrossing() {
  const curStep = walkSteps[walkPos.stepIdx];
  if (!curStep) return true;
  if (session.deep && eligibleIndices(curStep).some(i => i > walkPos.itemIdx)) return false;
  if (!session.deep && stepHasMoreLead(curStep)) return false;
  const nextStep = walkSteps[walkPos.stepIdx + 1];
  return !nextStep || nextStep.verseRef !== curStep.verseRef;
}
function advanceWalk() {
  const step = walkSteps[walkPos.stepIdx];
  const nextEligible = step && session.deep ? eligibleIndices(step).find(i => i > walkPos.itemIdx) : undefined;
  if (nextEligible !== undefined) walkPos.itemIdx = nextEligible;
  else if (step && !session.deep && stepHasMoreLead(step)) { /* stay put — more lead-kind (kāraka/verbvoice) items remain at this step */ }
  else { walkPos.stepIdx++; walkPos.itemIdx = 0; }
  saveReadingProgress(session.chapterKey, session.scope, walkPos);
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
  saveReadingProgress(session.chapterKey, session.scope, walkPos);
  session.batchCount = 0;
  session.batchCorrect = 0;
  newQuestion();
}
function startReading(chapterKey, opts) {
  const entry = (window.WALK_MANIFEST || []).find(e => e.chapterKey === chapterKey);
  if (!entry) return;
  const scope = opts.scope || 'both';
  loadWalkDataScript(chapterKey, entry.file).then(() => {
    walkSteps = flattenWalk(chapterKey, scope);
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
      walkPos = loadReadingProgress(chapterKey, scope) || { stepIdx: 0, itemIdx: 0 };
    }
    if (walkPos.stepIdx >= walkSteps.length) walkPos = { stepIdx: 0, itemIdx: 0 }; // stale/out-of-range resume point (e.g. after a content rebuild)
    session = { mode: 'reading', chapterKey, scope, deep: !!opts.deep, batchCount: 0, batchCorrect: 0 };
    saveReadingProgress(chapterKey, scope, walkPos); // a verse-jump is itself a valid resume point, persist it immediately
    newQuestion();
  }).catch(err => {
    app.innerHTML = `<div class="celebrate"><h2>⚠ couldn't load this chapter</h2><p>${esc(err.message)}</p>
      <div class="next-choices"><button class="secondary" id="loadErrBackBtn">🏠 Dashboard</button></div></div>`;
    document.getElementById('loadErrBackBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
  });
}

function pickItem(code) {
  const fullPool = itemsByCode[code];
  const unhidden = fullPool.filter(it => !isReportHidden(reportKey(it, code)));
  const pool = unhidden.length ? unhidden : fullPool; // fallback: don't let hiding empty out a node entirely
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
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Sandhi's 22 codes are cryptic 3-letter Pāṇini-sūtra abbreviations (SVD, GUN, VRD...) that
// genuinely need the short code as the headline, with the fuller name as a secondary line — with
// 22 of them, compact labels help scanning. Every OTHER kind currently has exactly one code, so
// abbreviating it buys nothing and just adds an unexplained acronym (Harsha, 2026-08-11: "don't
// abbreviate to 3 letters for anything outside sandhi... call it out as meaning, kāraka,
// kṛdanta,..."). Non-sandhi cards show KIND_LABELS' full descriptive name as the headline instead,
// dropping the secondary label line (would just repeat the same name).
// ABT ("no-sandhi word boundary") and PCH ("padaccheda", the multi-word chain-splitting node)
// aren't actual Pāṇini sandhi RULES the way SVD/GUṆ/VṚD/etc. are — they're structurally different
// question types (spot where nothing happens; find every boundary in a chain) that just happen to
// live under the sandhi kind. Harsha, 2026-08-11: give them their own full name too, same as every
// non-sandhi kind, rather than an abbreviation that implies they're one more rule among 20 others.
const SANDHI_FULL_NAME_CODES = new Set(['ABT', 'PCH']);
function renderNodeCard(c) {
  const p = progress[c];
  const pct = Math.min(100, Math.round((p.streak / MASTERY_TARGET) * 100));
  const kind = CODE_KIND[c] || 'sandhi';
  const useCodeAbbrev = kind === 'sandhi' && !SANDHI_FULL_NAME_CODES.has(c);
  const headline = useCodeAbbrev ? c : (CODE_LABEL_OVERRIDES[c] || (SANDHI_FULL_NAME_CODES.has(c) ? (LABELS[c] || c) : (KIND_LABELS[kind] || LABELS[c] || c)));
  return `<div class="card${p.mastered ? ' mastered' : ''}" data-code="${c}">
    <div class="card-top"><span class="code">${headline}</span>${p.mastered ? '<span class="badge">✓ mastered</span>' : ''}</div>
    ${useCodeAbbrev ? `<div class="label">${LABELS[c] || ''}</div>` : ''}
    <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
    <div class="stats">streak ${p.streak} · best ${p.best}</div>
  </div>`;
}
// Any kind with MORE THAN ONE code (sandhi's dozens of Pāṇini-sūtra codes, or a split axis like
// vibhakti's VIB1/VIB2, meaning's MNG1/MNG2) collapses behind a native <details>/<summary> with an
// aggregate progress bar across its codes — no JS state needed, accessible for free, and one
// consistent place to see "how am I doing on vibhakti overall" without averaging two separate
// cards yourself. A kind with just one code (kāraka, taddhita, kṛdanta, dhātu today) renders its
// single card directly — wrapping one card in its own accordion would be a click to reveal
// nothing extra, pure ceremony.
function renderCategorySection(kind, codes) {
  const mastered = codes.filter(c => progress[c].mastered).length;
  // Same fraction the "X/22 mastered" text already reports, translated into the bar's fill % —
  // consistent with every individual card's bar, which is also a single mastery-progress ratio,
  // not e.g. an average streak (would conflate "barely started" with "not started" confusingly).
  const pct = codes.length ? Math.round((mastered / codes.length) * 100) : 0;
  return `<details class="category">
      <summary>
        <div class="category-head-row"><span>${esc(KIND_LABELS[kind] || kind)}</span><span class="category-stats">${mastered}/${codes.length} mastered</span></div>
        <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
      </summary>
      <div class="grid">${codes.map(renderNodeCard).join('')}</div>
    </details>`;
}
function renderDashboard() {
  const masteredN = CODES.filter(c => progress[c].mastered).length;
  // sandhi always first (dwarfs every other kind, most-visited by far), rest alphabetical.
  const kinds = Object.keys(CODES_BY_KIND).sort((a, b) => {
    if (a === 'sandhi') return -1;
    if (b === 'sandhi') return 1;
    return (KIND_LABELS[a] || a).localeCompare(KIND_LABELS[b] || b);
  });
  const categorySections = [];
  const flatCodes = [];
  for (const kind of kinds) {
    const codes = CODES_BY_KIND[kind];
    if (codes.length > 1) categorySections.push(renderCategorySection(kind, codes));
    else flatCodes.push(...codes);
  }
  app.innerHTML = `
    <div class="dash-head">
      <div>${masteredN} / ${CODES.length} nodes mastered</div>
      <div class="dash-actions">
        <button class="primary" id="readBtn">📖 Read a verse</button>
        <button class="secondary" id="mixBtn">🔀 Mix it up</button>
        <button class="secondary" id="adaptiveBtn">Practice</button>
        <button class="secondary" id="tutorialBtn">🧩 कारक tutorial</button>
      </div>
    </div>
    ${categorySections.join('')}
    <div class="grid">
      ${flatCodes.map(renderNodeCard).join('')}
    </div>`;
  document.getElementById('adaptiveBtn').onclick = () => startQuiz('adaptive');
  document.getElementById('mixBtn').onclick = () => startQuiz('mixed');
  document.getElementById('readBtn').onclick = () => { view = { screen: 'picker' }; renderReadingPicker(); };
  document.getElementById('tutorialBtn').onclick = () => { view = { screen: 'tutorialPicker' }; renderTutorialPicker(); };
  app.querySelectorAll('.card').forEach(el => el.onclick = () => onNodeCardClick(el.dataset.code));
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
  const p = view.picker || (view.picker = { slug: null, chapterKey: null, sectionKey: null, contentScope: 'both' });
  const selectedText = texts.find(t => t.slug === p.slug) || null;
  const selectedChapter = selectedText ? selectedText.chapters.find(c => c.chapterKey === p.chapterKey) : null;
  const sections = selectedChapter ? groupVersesBySection(selectedChapter) : null;
  const selectedSection = sections ? sections.find(s => s.key === p.sectionKey) : null;
  const verseChoices = !selectedChapter ? [] : sections ? (selectedSection ? selectedSection.verses : []) : selectedChapter.verses;
  const hasProgress = selectedChapter && !!loadReadingProgress(selectedChapter.chapterKey, p.contentScope);

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
    <div class="scope-toggle">
      <div class="scope-head">Read</div>
      <label><input type="radio" name="scopeRadio" value="both" ${p.contentScope === 'both' ? 'checked' : ''}> mūlam + bhāṣyam</label>
      <label><input type="radio" name="scopeRadio" value="mula" ${p.contentScope === 'mula' ? 'checked' : ''}> mūlam only</label>
      <label><input type="radio" name="scopeRadio" value="bhasya" ${p.contentScope === 'bhasya' ? 'checked' : ''}> bhāṣyam only</label>
    </div>
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
  // Re-render on scope change (not just record it) — hasProgress and the Continue/Start over
  // label depend on which scope's OWN saved resume point exists (see readingProgressKey).
  app.querySelectorAll('input[name="scopeRadio"]').forEach(r => r.onchange = () => { p.contentScope = r.value; renderReadingPicker(); });
  app.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = () => {
      const deep = document.getElementById('deepToggle').checked;
      const scope = p.contentScope;
      const key = btn.dataset.key;
      if (btn.dataset.action === 'goto') {
        startReading(key, { deep, scope, verseRef: document.getElementById('verseSelect').value });
      } else {
        startReading(key, { deep, scope, fromBeginning: btn.dataset.action === 'start' });
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

// The question just left, snapshotted at CREATION time (see newQuestion()) so "flag previous
// question" (see PLANS.md's report-feature design, extended 2026-08-11 for the two flows Harsha
// identified: an expert spotting a broken question before even answering it, and wanting to flag
// the PREVIOUS question once the app has already moved on) always reports the right content/session
// context even if the session itself has since changed (e.g. the user picked a brand-new quiz mode
// — reportKey()/chapterKey are computed once, up front, not re-derived later from a possibly-stale
// live `session`).
let lastQuestion = null;
// Safety net (Harsha, 2026-08-11, live report of a citation-abbreviation-derived ABT item — "छा +
// उ" — rendered with only its correct answer and zero distractors): "we shouldn't have questions
// that have only one option, there is no point." A degenerate item (too little real content to
// generate any wrong answer from) should never reach the learner regardless of WHICH bug produced
// it — this is a general backstop, not a fix for any one root cause. Bounded retry count avoids an
// infinite loop in the theoretical worst case where an entire pool is degenerate; MAX_OPTION_RETRIES
// attempts is far more than any real (non-buggy) pool should ever need.
const MAX_OPTION_RETRIES = 20;
function newQuestion() {
  if (view.screen === 'quiz') {
    lastQuestion = {
      item: view.item, code: view.code, options: view.options, correctIndex: view.correctIndex, acceptIndices: view.acceptIndices,
      key: view.key, chapterKeyForReport: view.chapterKeyForReport, moola: view.moola, verseLabel: view.verseLabel,
      answered: view.answered, picked: view.picked,
    };
  }
  if (session.mode === 'reading') {
    let picked, built;
    for (let attempt = 0; attempt < MAX_OPTION_RETRIES; attempt++) {
      picked = pickNextWalkItem();
      if (!picked) { view = { screen: 'readingComplete' }; renderReadingComplete(); return; }
      built = buildOptions(picked.item, picked.code);
      if (built.options && built.options.length >= 2) break;
    }
    const { item, code, moola, verseLabel } = picked;
    const { options, correctIndex, acceptIndices = [] } = built;
    const key = reportKey(item, code), chapterKeyForReport = session.chapterKey;
    view = { screen: 'quiz', code, item, options, correctIndex, acceptIndices, answered: false, picked: -1, justMastered: false, crossingVerse: false, key, chapterKeyForReport, moola, verseLabel, hintRevealed: false };
    renderQuiz();
    return;
  }
  const c = pickNode(session.mode, session.fixedCode);
  let item, built;
  for (let attempt = 0; attempt < MAX_OPTION_RETRIES; attempt++) {
    item = pickItem(c);
    built = buildOptions(item, c);
    if (built.options && built.options.length >= 2) break;
  }
  const { options, correctIndex, acceptIndices = [] } = built;
  const key = reportKey(item, c);
  view = { screen: 'quiz', code: c, item, options, correctIndex, acceptIndices, answered: false, picked: -1, justMastered: false, key, chapterKeyForReport: null, moola: null, verseLabel: null, hintRevealed: false };
  renderQuiz();
}

function startQuiz(mode, code) {
  walkItemPools = computeItemPools(window.QUIZ_ITEMS); // reset from any leftover chapter-scoped reading pools
  session = { mode, fixedCode: code, batchCount: 0, batchCorrect: 0 };
  newQuestion();
}
// A lazy axis card (see AXIS_MANIFEST) needs its data fetched before a node session can start —
// shows a brief loading state on the clicked card only, matching this codebase's no-framework
// re-render-the-whole-screen convention elsewhere (a full dashboard re-render mid-fetch would lose
// the click target and any scroll position for no benefit here).
function onNodeCardClick(code) {
  const el = app.querySelector(`.card[data-code="${code}"]`);
  if (!itemsByCode[code] && el) el.classList.add('loading');
  ensureAxisLoaded(code).then(() => startQuiz('node', code)).catch(() => {
    if (el) { el.classList.remove('loading'); }
    alert('Could not load this content — check your connection and try again.');
  });
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
  if (item.kind === 'verbvoice') {
    // The verse-opener "broader view first" question: identify the verb's voice before diving into
    // the word-by-word questions. Naming the root orients the learner to WHICH verb governs the line.
    const rootBit = item.root ? ` (√${esc(item.root)})` : '';
    return `<div class="prompt">${esc(item.verb)}${rootBit}</div>
      <div class="prompt-hint">This is the verse's verb. Is it कर्तरि (active), कर्मणि (passive), or भावे (impersonal)? — this fixes which word will be the कर्ता/कर्म and in which case.</div>${ctxLine}${srcLine}`;
  }
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
  if (item.kind === 'karaka' && item.subtype === 'associate') {
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">This word is conjoined (सुप्_समुच्चितम्) with another word in the verse via "and" — which one?</div>${ctxLine}${srcLine}`;
  }
  if (item.kind === 'karaka' && item.subtype === 'governor') {
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">This word's kāraka role is defined relative to a verb or participle elsewhere in the verse — which one does it attach to?</div>${ctxLine}${srcLine}`;
  }
  if (item.kind === 'karaka' && item.subtype === 'implied') {
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">This word's ${esc(item.role)} is elided — implied by context, not printed anywhere in this verse. Which word (absent from the text below) supplies it?</div>${ctxLine}${srcLine}`;
  }
  if (item.kind === 'karaka') {
    const occHint = item.occurrenceTotal > 1
      ? ` (${ordinal(item.occurrenceIndex)} of ${item.occurrenceTotal} occurrences of "${esc(item.word)}" in this verse${item.line ? `, line ${item.line}` : ''})`
      : '';
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">What is this word's syntactic relation (kāraka or otherwise) to the rest of the sentence?${occHint}</div>${ctxLine}${srcLine}`;
  }
  if (item.kind === 'spot') {
    const hint = item.subtype === 'krdanta' ? 'Which word here is a kṛdanta (participle)?' : 'Which word here is taddhita-derived (secondary derivation)?';
    return `<div class="prompt spot-prompt">${esc(item.context)}</div>
      <div class="prompt-hint">${hint}</div>${srcLine}`;
  }
  if (item.kind === 'meaning') {
    return `<div class="prompt">${esc(item.word)}</div>
      <div class="prompt-hint">What does this word mean?</div>${ctxLine}${srcLine}`;
  }
  if (item.subtype === 'fullsplit') {
    return `<div class="prompt">${esc(item.surface)}</div>
      <div class="prompt-hint">Split this into all its original words.</div>${ctxLine}${srcLine}`;
  }
  if (item.subtype === 'spotlopa') {
    const hint = item.code === 'VSL' ? 'Which word here is missing its visarga (due to sandhi with the next word)?'
      : 'Which word here has silently absorbed a leading vowel from the previous word?';
    return `<div class="prompt spot-prompt">${esc(item.context)}</div>
      <div class="prompt-hint">${hint}</div>${srcLine}`;
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

// Truncate long bhāṣya context so the resulting GitHub issue URL doesn't run into browser/GitHub
// length limits (~8k chars) — the report body only needs enough context to locate the question,
// not the full clause.
function truncateForReport(s, max) { return !s ? s : s.length > max ? s.slice(0, max) + '…' : s; }
// Pulls the actual question text/prompt out of renderPrompt()'s HTML (via a detached element,
// not by re-deriving the per-kind hint strings a second time) so the report body shows exactly
// what the learner saw, and stays in sync automatically if renderPrompt's wording ever changes.
function extractPromptText(item) {
  const div = document.createElement('div');
  div.innerHTML = renderPrompt(item);
  const word = div.querySelector('.prompt');
  const hint = div.querySelector('.prompt-hint');
  return { word: word ? word.textContent.trim() : '', question: hint ? hint.textContent.trim() : '' };
}
// target: {item, code, options, correctIndex, key, chapterKeyForReport, moola, verseLabel, answered, picked}
// Pure function of `target` alone (no name/email/comments — those are separate form fields) —
// this is what PRE-FILLS the report textarea (same spirit as the GitHub issue link's own
// pre-filled body: the reporter sees exactly what's about to be sent and can edit/add to it,
// rather than it being assembled invisibly only at submit time).
// The service-worker cache actually serving THIS client — surfaced in reports so a stale cache (a
// report expecting an answer already fixed in a newer deploy) is instantly obvious (Harsha,
// 2026-08-18). Populated async on load; after activate the SW keeps exactly one 'sandhi-quiz-v*'
// cache (older ones are deleted), so this normally reads a single version.
let ACTIVE_CACHE = 'pending';
try {
  if (typeof caches !== 'undefined' && caches.keys) {
    caches.keys().then(ks => {
      const c = ks.filter(k => /sandhi-quiz/.test(k));
      ACTIVE_CACHE = c.length ? c.join(',') : 'none';
    }).catch(() => { ACTIVE_CACHE = 'unknown'; });
  } else { ACTIVE_CACHE = 'no-sw'; }
} catch (e) { ACTIVE_CACHE = 'unknown'; }

// Device/OS/browser summary for issue reports (Harsha, 2026-08-17) — this whole session turned on
// "Android phone vs desktop", and reports carried nothing to tell them apart. Parsed from
// navigator.userAgent (crude but enough to triage phone/tablet/laptop + OS + browser), plus the raw
// UA and viewport for the awkward cases. Best-effort: never throws, degrades to 'unknown'.
function deviceInfoLine() {
  try {
    const ua = (navigator && navigator.userAgent) || '';
    const os = /Android/i.test(ua) ? 'Android'
      : /iPhone|iPod/i.test(ua) ? 'iOS' : /iPad/i.test(ua) ? 'iPadOS'
      : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
      : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : 'unknown OS';
    const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone|iPod/i.test(ua) ? 'phone' : 'desktop/laptop';
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
      : /Firefox\//.test(ua) ? 'Firefox' : /Version\/.*Safari/.test(ua) ? 'Safari' : 'unknown browser';
    const vp = `${window.innerWidth || 0}×${window.innerHeight || 0}`;
    const ctrl = (navigator.serviceWorker && navigator.serviceWorker.controller) ? 'sw-controlled' : 'no-controller';
    return `device: ${device} · ${os} · ${browser} · viewport ${vp}\napp cache: ${ACTIVE_CACHE} (${ctrl})\nuser-agent: ${ua}`;
  } catch (e) { return `app cache: ${ACTIVE_CACHE}\ndevice: (unavailable)`; }
}
function buildReportDetails(target) {
  const { item, code, options, correctIndex, acceptIndices = [], key, chapterKeyForReport, moola, verseLabel, answered, picked } = target;
  const { word: promptWord, question } = extractPromptText(item);
  const wordLabel = item.word || (item.before ? item.before.join(' + ') : promptWord || key);
  const yourAnswer = answered && picked >= 0 && options[picked] !== undefined ? displayOption(item, options[picked]) : '(not answered — flagged before choosing)';
  const details = [
    `report-key: ${key}`,
    `kind: ${item.kind || 'sandhi'}${item.subtype ? ' / subtype: ' + item.subtype : ''}`,
    `code: ${code}`,
    chapterKeyForReport ? `chapterKey: ${chapterKeyForReport}` : null,
    item.ref ? `ref: ${item.ref}` : null,
    item.source ? `source: ${item.source}` : null,
    item.slug ? `slug: ${item.slug}` : null,
    verseLabel ? `verse: ${verseLabel}` : null,
    `word: ${wordLabel}`,
    '',
    `question: ${question || '(n/a)'}`,
    moola && moola !== item.context ? `mūlam: ${truncateForReport(moola, 400)}` : null,
    item.context ? `${item.source === 'mula' ? 'mūlam' : 'bhāṣyam'} line: ${truncateForReport(item.context, 400)}` : null,
    '',
    `choices shown: ${options.map((o, i) => `${i === correctIndex ? '✓ ' : acceptIndices.includes(i) ? '(✓) ' : ''}${displayOption(item, o)}`).join(' | ')}`,
    `your answer: ${yourAnswer}`,
    '',
    deviceInfoLine(),
  ].filter(x => x !== null).join('\n');
  const subject = `Wrong answer: ${code} — ${wordLabel}`;
  return { subject, details };
}
// The structured details are ALWAYS re-derived fresh from `target` here, never taken from the
// editable textarea — a reporter could otherwise tamper with report-key/ref/choices/etc. before
// submitting. `userComment` is the one genuinely free-text field (their own remarks), prepended.
function composeReportMessage(target, userComment) {
  const { details } = buildReportDetails(target);
  return userComment ? `Comments: ${userComment}\n\n${details}` : details;
}
function buildReportIssueUrl(target, name, email, message) {
  const { subject } = buildReportDetails(target);
  const fullBody = `Reported by: ${name || '(anonymous)'}${email ? ` <${email}>` : ''}\n\n${message}`;
  const url = new URL('https://github.com/ConstrainedRandomVar/vedantic-vyakarana-academy/issues/new');
  url.searchParams.set('title', subject);
  url.searchParams.set('body', fullBody);
  return url.toString();
}
// Primary, low-friction report path: a plain fetch() POST straight to Formspree, no SDK/CDN
// script (this app is offline-capable via a service worker and otherwise has zero runtime
// dependencies — pulling in @formspree/ajax would silently break offline and break that
// convention for one feature). Formspree treats `name`/`email`/`_subject` specially; everything
// else goes in `message`. Returns true/false rather than throwing — callers decide the fallback
// (the GitHub issue link) themselves.
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mnpadval';
async function submitReportToFormspree(target, name, email, message) {
  const { subject } = buildReportDetails(target);
  try {
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({ name: name || '(anonymous)', email: email || '', _subject: subject, message }),
    });
    return res.ok;
  } catch (e) { return false; } // offline, or Formspree unreachable — caller falls back to the GitHub link
}
// Which question a report targets — 'current' (the one on screen right now, answered or not: an
// expert may spot that the right answer isn't even offered before ever picking one) or 'previous'
// (the one just left, for when the app has already auto-advanced by the time someone wants to
// flag it). Both shapes match buildReportIssueUrl's expected `target`.
function reportTargetData(which) {
  if (which === 'previous') return lastQuestion;
  const { item, code, options, correctIndex, acceptIndices, key, chapterKeyForReport, moola, verseLabel, answered, picked } = view;
  return { item, code, options, correctIndex, acceptIndices, key, chapterKeyForReport, moola, verseLabel, answered, picked };
}
// Shows the located mūlam/bhāṣyam line(s) + verse ref right in the report form, so the reporter
// can confirm what they're actually flagging before submitting — not just baked invisibly into
// the eventual GitHub issue body. Node-pool (mixed/practice) items only ever carry ONE located
// line (mūlam if source==='mula', bhāṣyam if source==='bhashya' — build_items.js never pairs a
// bhāṣya item back to its own verse's mūlam text); reading-walk items can carry both (the step's
// own `moola` alongside the item's bhāṣya-clause `context`), so show whichever is available.
function renderReportBreadcrumb(target) {
  const { item, options, correctIndex, acceptIndices = [], answered, picked, verseLabel, moola } = target;
  const ref = verseLabel || item.ref || null;
  const lines = [];
  if (moola && moola !== item.context) lines.push(`<div>mūlam: ${esc(truncateForReport(moola, 200))}</div>`);
  if (item.context) lines.push(`<div>${item.source === 'mula' ? 'mūlam' : 'bhāṣyam'} line: ${esc(truncateForReport(item.context, 200))}</div>`);
  // Shown for BOTH 'current' and 'previous' targets — a reporter recalling the PREVIOUS question
  // (already scrolled past by the time they click "flag previous question") otherwise has no way
  // to see what was actually asked/offered without digging through the pre-filled textarea below;
  // this makes it visible at a glance, matching what's already going into the report (found via
  // Harsha's real usage: "the user doesn't know that the full context is being given back").
  if (options && options.length) {
    const choices = options.map((o, i) => `${i === correctIndex ? '✓ ' : acceptIndices.includes(i) ? '(✓) ' : ''}${esc(displayOption(item, o))}`).join(' | ');
    lines.push(`<div>choices: ${choices}</div>`);
    if (answered && picked >= 0 && options[picked] !== undefined) {
      lines.push(`<div>your answer: ${esc(displayOption(item, options[picked]))}</div>`);
    }
  }
  if (!ref && !lines.length) return '<div class="report-breadcrumb">(no located verse/context for this item)</div>';
  return `<div class="report-breadcrumb">${ref ? `<div class="ref">${esc(ref)}</div>` : ''}${lines.join('')}</div>`;
}
function renderReportArea() {
  if (view.reportOpen) {
    const targetLabel = view.reportOpen === 'previous' ? 'the previous question' : 'this question';
    const target = reportTargetData(view.reportOpen);
    const status = view.reportSubmitError
      ? `<div class="report-status error">Couldn't send — check your connection and try again, or use the GitHub issue link below.</div>`
      : '';
    return `<div class="report-area">
      <div class="report-target-label">Reporting ${esc(targetLabel)}: <span class="report-autosent-note">(the details below will be auto-sent with your report)</span></div>
      ${renderReportBreadcrumb(target)}
      <label>Report details (auto-sent; select-all &amp; copy to paste elsewhere)
        <textarea class="report-copy" readonly rows="10" onclick="this.select()">${esc(buildReportDetails(target).details)}</textarea>
      </label>
      <label>Your name <input type="text" id="reportName" value="${esc(loadReporterName())}" placeholder="optional"></label>
      <label>Your email <input type="email" id="reportEmail" value="${esc(loadReporterEmail())}" placeholder="optional — in case we need to follow up"></label>
      <label>Add your own comments
        <textarea id="reportReason" placeholder="optional — why do you think this is wrong?"></textarea>
      </label>
      ${status}
      <button class="secondary" id="reportSubmitBtn" ${view.reportSubmitting ? 'disabled' : ''}>${view.reportSubmitting ? 'Sending…' : 'Submit report'}</button>
      <button class="link" id="reportCancelBtn">cancel</button>
      <div class="report-fallback"><button class="link" id="reportGithubBtn">or file a GitHub issue instead ↗</button></div>
    </div>`;
  }
  const parts = [];
  parts.push(view.reportedCurrent
    ? `<span class="report-area reported">🚩 reported — hidden from your practice. Thank you!</span>`
    : `<button class="link" id="reportCurrentBtn">🚩 report this question</button>`);
  if (lastQuestion) {
    parts.push(view.reportedPrevious
      ? `<span class="report-area reported">🚩 previous question flagged. Thank you!</span>`
      : `<button class="link" id="reportPreviousBtn">🚩 flag previous question</button>`);
  }
  return parts.join(' ');
}

function renderQuiz() {
  const { code, item, options, correctIndex, acceptIndices = [], answered, picked, justMastered, crossingVerse } = view;
  const isCorrectIdx = (i) => i === correctIndex || acceptIndices.includes(i);
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
  // Mix-it-up, reading-walk, AND adaptive ("Practice") mode are all partly a "which node is this
  // even testing?" challenge — showing the code/label upfront (e.g. "GUN · guṇa") hands that away
  // before the learner has looked at the question at all. Adaptive draws a weighted-random code
  // across ALL nodes each question (pickWeightedNode) — the learner hasn't chosen a specific node
  // for THIS question any more than mixed mode has, so it gets the same treatment (Harsha,
  // 2026-08-11: caught this after shipping the mixed/reading fix). Applies uniformly to every node
  // kind, gated behind an explicit hint click. Only 'node' mode (a single fixed code deliberately
  // chosen from the dashboard) still shows it plainly, since there's nothing to hide there.
  const showNodeLabel = mode === 'node' || view.hintRevealed;
  const nodeLabelHtml = showNodeLabel
    ? `<span class="code">${code}</span> <span class="label">${LABELS[code] || ''}</span>`
    : `<button class="link" id="hintBtn">💡 hint</button>`;
  app.innerHTML = `
    <div class="quiz-head">
      <button class="link" id="backBtn">← dashboard</button>
      ${nodeLabelHtml}<span class="mode-tag">${modeTag}</span>
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
          // Highlight the canonical correct AND any accepted alternate (e.g. कर्म for a योगम् tagged
          // समानाधिकरणम्) as green; a genuinely wrong pick stays red.
          if (isCorrectIdx(i)) cls = 'correct';
          else if (i === picked) cls = 'wrong';
        }
        return `<button class="opt ${cls}" data-i="${i}" ${answered ? 'disabled' : ''}>${esc(displayOption(item, opt))}</button>`;
      }).join('')}
    </div>
    ${!answered ? `<div class="reveal-row"><button class="link" id="revealBtn">🔑 I don't know — reveal the answer</button></div>` : ''}
    <div class="feedback">${answered ? (view.revealed
        ? `🔑 revealed — the correct answer is highlighted. ${item.sutra ? '(' + esc(item.sutra) + ')' : ''}`
        : isCorrectIdx(picked)
        ? `correct! ${item.sutra ? '(' + esc(item.sutra) + ')' : ''}`
        : `not quite — correct answer highlighted. ${item.sutra ? '(' + esc(item.sutra) + ')' : ''}`) : ''}</div>
    ${renderReportArea()}
    ${bottom}`;
  document.getElementById('backBtn').onclick = () => { clearTimeout(pendingAdvanceTimer); view = { screen: 'dashboard' }; renderDashboard(); };
  const hintBtn = document.getElementById('hintBtn');
  if (hintBtn) hintBtn.onclick = () => { view = { ...view, hintRevealed: true }; renderQuiz(); };
  const reportCurrentBtn = document.getElementById('reportCurrentBtn');
  if (reportCurrentBtn) reportCurrentBtn.onclick = () => { clearTimeout(pendingAdvanceTimer); view = { ...view, reportOpen: 'current', reportSubmitError: false }; renderQuiz(); };
  const reportPreviousBtn = document.getElementById('reportPreviousBtn');
  if (reportPreviousBtn) reportPreviousBtn.onclick = () => { clearTimeout(pendingAdvanceTimer); view = { ...view, reportOpen: 'previous', reportSubmitError: false }; renderQuiz(); };
  const reportCancelBtn = document.getElementById('reportCancelBtn');
  if (reportCancelBtn) reportCancelBtn.onclick = () => { view = { ...view, reportOpen: null, reportSubmitError: false }; renderQuiz(); };
  const reportSubmitBtn = document.getElementById('reportSubmitBtn');
  if (reportSubmitBtn) reportSubmitBtn.onclick = async () => {
    const name = document.getElementById('reportName').value.trim();
    const email = document.getElementById('reportEmail').value.trim();
    const userComment = document.getElementById('reportReason').value.trim();
    saveReporterName(name);
    saveReporterEmail(email);
    const wasCurrentUnanswered = view.reportOpen === 'current' && !answered;
    const target = reportTargetData(view.reportOpen);
    const message = composeReportMessage(target, userComment);
    view = { ...view, reportSubmitting: true, reportSubmitError: false };
    renderQuiz();
    const ok = await submitReportToFormspree(target, name, email, message);
    if (!ok) { view = { ...view, reportSubmitting: false, reportSubmitError: true }; renderQuiz(); return; }
    hiddenReports.add(target.key);
    saveHiddenReports(hiddenReports);
    if (wasCurrentUnanswered) { nextQuestion(); return; } // don't make them answer a question they just flagged as broken
    const flag = view.reportOpen === 'previous' ? 'reportedPrevious' : 'reportedCurrent';
    view = { ...view, reportOpen: null, reportSubmitting: false, [flag]: true };
    renderQuiz();
  };
  const reportGithubBtn = document.getElementById('reportGithubBtn');
  if (reportGithubBtn) reportGithubBtn.onclick = () => {
    const name = document.getElementById('reportName').value.trim();
    const email = document.getElementById('reportEmail').value.trim();
    const userComment = document.getElementById('reportReason').value.trim();
    saveReporterName(name);
    saveReporterEmail(email);
    const target = reportTargetData(view.reportOpen);
    const message = composeReportMessage(target, userComment);
    window.open(buildReportIssueUrl(target, name, email, message), '_blank', 'noopener');
    // Not marked reported/hidden here — opening the pre-filled page doesn't guarantee the visitor
    // actually has a GitHub account and completes the submission on that tab.
  };
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
    // Don't auto-advance out from under someone mid-report — they cancel or submit to move on. Also
    // don't auto-advance when the answer was REVEALED (Harsha, 2026-08-17): they chose not to guess
    // precisely so they could read the answer, so let them move on with an explicit Next click.
    if (!view.reportOpen && !view.revealed) {
      pendingAdvanceTimer = setTimeout(() => goToNextQuestion(mode), isCorrectIdx(picked) ? AUTO_ADVANCE_DELAY_CORRECT : AUTO_ADVANCE_DELAY_WRONG);
    }
  } else {
    const revealBtn = document.getElementById('revealBtn');
    if (revealBtn) revealBtn.onclick = () => {
      // Reveal the answer without guessing (all MCQ modes: reading / node / mixed / adaptive). Counts
      // as a miss for mastery (streak resets — honest: they didn't know it), advances the batch
      // counter, but never auto-advances (handled above) so they can read the answer at their pace.
      playAnswerSound(false);
      recordAnswer(code, false);
      session.batchCount++;
      if (session.batchCount === BATCH_SIZE) setTimeout(playBatchCompleteSound, 400);
      const crossing = mode === 'reading' ? peekNextVerseCrossing() : false;
      view = { ...view, answered: true, picked: -1, revealed: true, justMastered: false, crossingVerse: crossing };
      renderQuiz();
    };
    app.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
      const i = +btn.dataset.i;
      const correct = isCorrectIdx(i);
      playAnswerSound(correct);
      const { justMastered } = recordAnswer(code, correct);
      // A 'spot' item built from a real kṛdanta+taddhita co-occurrence (creditBoth) tests telling
      // BOTH categories apart, not just one — so it credits both nodes' streaks, not only the one
      // named in its own `code`. (No second celebration screen if the other node also masters on
      // this exact answer — that's an acceptable, deliberately unhandled rare coincidence, not a bug.)
      if (item.kind === 'spot' && item.creditBoth) recordAnswer(code === 'KRT' ? 'TAD' : 'KRT', correct);
      session.batchCount++;
      if (correct) session.batchCorrect++;
      if (session.batchCount === BATCH_SIZE) setTimeout(playBatchCompleteSound, 400);
      const crossing = mode === 'reading' ? peekNextVerseCrossing() : false;
      view = { ...view, answered: true, picked: i, justMastered, crossingVerse: crossing };
      renderQuiz();
    });
  }
}

// ==== Guided kāraka tutorial (Gita mūla, one verse at a time) ====
// Per-verse dependency-cluster walkthrough built from the UoHyd e-reader's own kāraka analysis
// (searchtool/khan/build_karaka_tutorial.js), NOT the random-draw KAR node above — this teaches
// the analysis PROCEDURE (find the verb, its voice, its कर्ता/कर्म, agreement, coordination,
// modifiers, everything else) one verse at a time, click-based rather than multiple-choice, since
// the answer is always a word already sitting in the sentence. See
// /Users/hlakshmi/.claude/plans/woolly-orbiting-codd.md for the full design.
const TUTORIAL_KEY = 'sandhiQuizTutorialProgress'; // { lastRef }
const TUTORIAL_PROGRESS_KEY = 'sandhiQuizTutorialCompleted'; // { [ref]: {completedAt, correctSteps, totalSteps} }

function loadTutorialProgress() {
  try { return JSON.parse(localStorage.getItem(TUTORIAL_KEY)) || {}; } catch (e) { return {}; }
}
function saveTutorialProgress(p) { localStorage.setItem(TUTORIAL_KEY, JSON.stringify(p)); }
function loadTutorialCompletion() {
  try { return JSON.parse(localStorage.getItem(TUTORIAL_PROGRESS_KEY)) || {}; } catch (e) { return {}; }
}
function saveTutorialCompletionEntry(ref, correctSteps, totalSteps) {
  const c = loadTutorialCompletion();
  c[ref] = { completedAt: Date.now(), correctSteps, totalSteps };
  localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(c));
}

// Lazy-loaded exactly like ensureAxisLoaded above — TUTORIAL_DATA lives in its own global
// namespace entirely, never merged into window.QUIZ_ITEMS/itemsByCode (this is a parallel mode,
// not one more quiz axis).
function ensureTutorialDataLoaded() {
  if (window.TUTORIAL_DATA) return Promise.resolve();
  const entry = (window.TUTORIAL_MANIFEST || [])[0];
  if (!entry) return Promise.reject(new Error('no tutorial data available'));
  if (ensureTutorialDataLoaded._pending) return ensureTutorialDataLoaded._pending;
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = entry.file;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load ' + entry.file));
    document.head.appendChild(s);
  });
  ensureTutorialDataLoaded._pending = p;
  return p;
}

let tutorialVerses = [];
let tutorialVerseIdx = 0;
let tutorialSentIdx = 0;   // a verse can have >1 sentence — walked in order, independently clustered
let tutorialSteps = [];    // flattened, cluster-major, for the CURRENT sentence only
let tutorialStepIdx = 0;
let tutorialScores = [];   // per-step scores this sentence, folded into per-verse completion

function currentTutorialSentence() {
  return tutorialVerses[tutorialVerseIdx].sentences[tutorialSentIdx];
}
function currentTutorialStep() { return tutorialSteps[tutorialStepIdx]; }

// Cluster-major flattening (Harsha, confirmed): finish one governing verb/participle's full
// mini-sequence (voice if finite → कर्ता → कर्म → कर्तृ/कर्म-सामानाधिकरण्य → समुच्चय → modifiers → remaining)
// before moving to the next cluster, rather than looping step-type-major across all clusters.
// कर्म always renders even when empty (Harsha's ruling — "no कर्म here" IS the teaching moment for
// intransitivity); every other step-type is skipped when its cluster has nothing to ask about.
// कर्ता-case sub-question (Harsha, 2026-08-17): before letting the learner CLICK the कर्ता, first
// ask which case it should even be in, given the voice already identified — प्रथमा for कर्तरि,
// तृतीया for कर्मणि/भावे. षष्ठी (2.3.65 कारक-षष्ठी) is only offered as a distractor when the
// governor is genuinely a कृदन्त — offering it for a plain finite verb would be a fake trap, since
// षष्ठी is never actually live there.
const VOICE_TO_KARTA_CASE = { 'कर्तरि': 'प्रथमा', 'कर्मणि': 'तृतीया', 'भावे': 'तृतीया' };
function kartaCaseOptions(c) {
  const correct = VOICE_TO_KARTA_CASE[c.voice] || 'प्रथमा';
  const options = c.karmaGovernorIsKrdanta ? ['प्रथमा', 'तृतीया', 'षष्ठी'] : ['प्रथमा', 'तृतीया'];
  return { correct, options };
}
// कर्म-case sub-question (Harsha, 2026-08-16), mirroring कर्ता-case above — कर्तरि leaves कर्म in its
// plain द्वितीया (अनुक्त); कर्मणि promotes it to प्रथमा (अभिहित). No भावे entry: भावे प्रयोग is only
// used with अकर्मक roots by definition, so there's never a real कर्म to ask about in भावे — this
// step is gated on c.karma.length (a real object exists) same as kartaCaseOptions is gated on
// c.karta.length, so भावे clusters simply never reach here. षष्ठी distractor rule is identical to
// कर्ता's (2.3.65 कर्तृकर्मणोः कृति applies to BOTH कर्ता and कर्म of a कृदन्त governor, not just कर्ता).
const VOICE_TO_KARMA_CASE = { 'कर्तरि': 'द्वितीया', 'कर्मणि': 'प्रथमा' };
function karmaCaseOptions(c) {
  const correct = VOICE_TO_KARMA_CASE[c.voice] || 'द्वितीया';
  const options = c.karmaGovernorIsKrdanta ? ['द्वितीया', 'प्रथमा', 'षष्ठी'] : ['द्वितीया', 'प्रथमा'];
  return { correct, options };
}
function buildTutorialSteps(sentence) {
  const steps = [{ type: 'verbs' }];
  sentence.clusters.forEach((c, ci) => {
    if (c.isFiniteVerb) steps.push({ type: 'voice', clusterIdx: ci });
    const canKartaCase = c.voice && c.karta.length;
    const canKarmaCase = c.voice && c.karma.length;
    let showKartaCase = canKartaCase, showKarmaCase = canKarmaCase;
    if (canKartaCase && canKarmaCase) {
      // Alternate instead of asking both every time (Harsha, 2026-08-16: "we can alternate them in
      // case it becomes repetitive"). Deterministic per-cluster, based on the governor's own word
      // position — NOT a running session counter (tried that first; it starts at 0 on every page
      // load/verse-jump, so the FIRST both-eligible cluster in any fresh session always resolved to
      // kartaCase, and jumping straight to a specific verse from the picker each time never
      // accumulated enough occurrences within one session to ever reach karmaCase — found live,
      // 2026-08-16, via Harsha's own spot-checking never once hitting it). This is reload-
      // independent and naturally varies across verses since governor positions vary.
      if (c.governorWordIndex % 2 === 0) showKarmaCase = false; else showKartaCase = false;
    }
    if (c.karta.length) {
      if (showKartaCase) steps.push({ type: 'kartaCase', clusterIdx: ci });
      steps.push({ type: 'karta', clusterIdx: ci });
    }
    if (showKarmaCase) steps.push({ type: 'karmaCase', clusterIdx: ci });
    steps.push({ type: 'karma', clusterIdx: ci });
    // Fires whenever EITHER bucket has a member — expectedSetForStep unions agreementKarta/Karma
    // with qualifierKarta/Karma (सामानाधिकरण्य is "generous and open"), so a cluster with only a
    // qualifier-type member (no corpus-tagged predicative agreement) still needs to ask this.
    if (c.agreementKarta.length || c.qualifierKarta.length) steps.push({ type: 'agreementKarta', clusterIdx: ci });
    if (c.agreementKarma.length || c.qualifierKarma.length) steps.push({ type: 'agreementKarma', clusterIdx: ci });
    if (c.qualifierKarta.length) steps.push({ type: 'qualifierKarta', clusterIdx: ci });
    if (c.qualifierKarma.length) steps.push({ type: 'qualifierKarma', clusterIdx: ci });
    // genderCheck: one MCQ per agreement/qualifier word, right after its click-question — only
    // when BOTH the word's own gender and the qualified argument's gender are extractable (skip
    // rather than fabricate when either is unknown, e.g. an अस्मद्/युष्मद् pronoun in the mix).
    for (const side of ['karta', 'karma']) {
      const qualifiedIdx = coreArgIndices(c, side)[0];
      if (qualifiedIdx == null || !sentence.wordGenders[qualifiedIdx]) continue;
      const members = side === 'karta' ? [...c.agreementKarta, ...c.qualifierKarta] : [...c.agreementKarma, ...c.qualifierKarma];
      for (const wordIndex of members) {
        if (sentence.wordGenders[wordIndex]) steps.push({ type: 'genderCheck', clusterIdx: ci, wordIndex, side });
      }
    }
    // समुच्चयKarta/Karma no longer get their OWN step (Harsha, 2026-08-17, "Option A"): coordinated
    // co-agents/objects are now selected together IN the कर्ता/कर्म step itself (which is multi-select
    // and whose accepted set already unions समुच्चयKarta/Karma via coreArgIndices) — grammatically a
    // समुच्चय is one collective कारक realized by several coordinated words, not several separate
    // कारकs, so asking "which OTHER words join X" after the learner has already picked them was a
    // redundant, artificial split. The concept is instead taught passively via tutorialSamuccayaCallout
    // shown in that step's feedback. The GENERIC `samuccaya` step (the च coordinator / non-कर्ता/कर्म
    // coordinated items) is unrelated and stays.
    if (c.samuccaya.length) steps.push({ type: 'samuccaya', clusterIdx: ci });
    if (c.modifiers.length) steps.push({ type: 'modifiers', clusterIdx: ci });
    if (c.karana.length) steps.push({ type: 'karana', clusterIdx: ci });
    if (c.sampradana.length) steps.push({ type: 'sampradana', clusterIdx: ci });
    if (c.apadana.length) steps.push({ type: 'apadana', clusterIdx: ci });
    if (c.adhikarana.length) steps.push({ type: 'adhikarana', clusterIdx: ci });
    if (c.satisaptami.length) steps.push({ type: 'satisaptami', clusterIdx: ci });
    if (c.sambodhana.length) steps.push({ type: 'sambodhana', clusterIdx: ci });
    if (c.nirdharana.length) steps.push({ type: 'nirdharana', clusterIdx: ci });
    if (c.remaining.length) steps.push({ type: 'remaining', clusterIdx: ci });
  });
  return steps;
}
// Sweep-role arrays (करण/सम्प्रदान/अपादान/अधिकरण/सतिसप्तमी/remaining) hold {wordIndex, role,
// upapada, upapadaCase} objects, same shape as `remaining` always had — not plain indices.
function expectedSetForStep(sentence, step) {
  if (step.type === 'verbs') return new Set(sentence.verbs);
  const c = sentence.clusters[step.clusterIdx];
  // करता/कर्म and their agreementKarta/Karma questions all share ONE full accepted-answer set per
  // argument (Harsha, 2026-08-16, found live via BG 4.1: इमम् is tagged कर्म; योगम् — तagged
  // कर्मसमानाधिकरणम्, target=the verb — names the EXACT SAME referent, "this yoga"; अव्ययम् —
  // विशेषणम् targeting योगम् — qualifies that same referent too). Which one the corpus calls the
  // "primary" कर्म vs. an "agreeing"/"qualifying" word is largely an artifact of annotation
  // convention (often just which word got there first), not a real grammatical difference the
  // learner should be quizzed on — marking इमम् wrong on "what agrees with कर्म" (or योगम्/अव्ययम्
  // wrong on "what is the कर्म") would be relying on that arbitrary tag choice rather than the
  // underlying grammar. करता/कर्म and agreementKarta/Karma stay separate QUESTIONS (different
  // prompts — "what/who is X" vs. "what shares case/gender/number with X") but accept the same
  // click-targets; qualifierKarta/Karma stays narrower (just the attributive विशेषणम् members) since
  // that question is specifically about the qualifier-qualified framing, not the full set.
  // समुच्चयKarta/Karma (JOINT agents/objects, e.g. BG 1.1's "मामकाः पाण्डवाः च" — "my sons AND the
  // Pāṇḍavas," both genuinely doing the action) join the full set too, by the same logic — a
  // co-equal coordinated agent is not a "describing" word like a qualifier, it's just as much the
  // कर्ता/कर्म as the corpus's "primary"-tagged one (Harsha, 2026-08-16).
  const kartaFullSet = () => new Set([...coreArgIndices(c, 'karta'), ...c.qualifierKarta]);
  const karmaFullSet = () => new Set([...coreArgIndices(c, 'karma'), ...c.qualifierKarma]);
  if (step.type === 'karta' || step.type === 'agreementKarta') return kartaFullSet();
  if (step.type === 'karma' || step.type === 'agreementKarma') return karmaFullSet();
  if (step.type === 'qualifierKarta') return new Set(c.qualifierKarta);
  if (step.type === 'qualifierKarma') return new Set(c.qualifierKarma);
  if (step.type === 'samuccayaKarta') return new Set(c.samuccayaKarta);
  if (step.type === 'samuccayaKarma') return new Set(c.samuccayaKarma);
  if (step.type === 'samuccaya') return new Set(c.samuccaya);
  if (step.type === 'modifiers') return new Set(c.modifiers);
  if (step.type === 'karana') return new Set(c.karana.map(r => r.wordIndex));
  if (step.type === 'sampradana') return new Set(c.sampradana.map(r => r.wordIndex));
  if (step.type === 'apadana') return new Set(c.apadana.map(r => r.wordIndex));
  if (step.type === 'adhikarana') return new Set(c.adhikarana.map(r => r.wordIndex));
  if (step.type === 'satisaptami') return new Set(c.satisaptami.map(r => r.wordIndex));
  if (step.type === 'sambodhana') return new Set(c.sambodhana.map(r => r.wordIndex));
  if (step.type === 'nirdharana') return new Set(c.nirdharana.map(r => r.wordIndex));
  if (step.type === 'remaining') return new Set(c.remaining.map(r => r.wordIndex));
  return new Set();
}

// Multi-clause verses (Gita 4.1: प्रोक्तवान्/प्राह/अब्रवीत् are three separate clauses strung
// together with no punctuation between them) show all of a sentence's words for every per-cluster
// step, with nothing marking which words belong to which clause — found live (Harsha, 2026-08-12)
// asking about प्राह's remaining relations while looking at all 14 words of the full verse.
// A cluster whose OWN governor shows up as a MEMBER of another cluster (e.g. 4.1's योगम् cluster —
// governor idx 2 — is itself the agreement-member of प्रोक्तवान्'s cluster) is a nested sub-phrase,
// not a sibling clause; folding it into its parent's span is what makes the three clause boxes in
// 4.1 come out clean and contiguous (0-5 / 6-9 / 10-13) instead of a spurious 4th box for योगम्.
function computeClauseGroups(sentence) {
  const clusters = sentence.clusters;
  // सम्बोधन (vocative address, e.g. परन्तप) is deliberately EXCLUDED here (Harsha, 2026-08-16,
  // found live via BG 4.2): a vocative is a discourse-level address, not clause-internal — it
  // commonly sits at the very end of a sentence regardless of which clause it's grammatically
  // tagged to. 4.2 tags परन्तप (idx 12, the sentence's last word) as सम्बोधन of विदुः (cluster 0,
  // whose own natural members only span idx 0-5) — including it in the span calculation stretched
  // cluster 0 all the way to idx 12, completely swallowing cluster 1's own span (idx 6-11, सः...
  // नष्टः) inside it, so the two clauses could never render as separate, non-overlapping boxes.
  // सम्बोधन is still fully graded via its own dedicated step (buildTutorialSteps/expectedSetForStep
  // read cluster.sambodhana directly, unaffected by this) — only the VISUAL boundary excludes it.
  const memberIndices = c => [
    ...c.karta, ...c.karma, ...c.agreementKarta, ...c.agreementKarma, ...c.qualifierKarta, ...c.qualifierKarma,
    ...c.samuccaya, ...c.samuccayaKarta, ...c.samuccayaKarma, ...c.modifiers,
    ...c.karana.map(r => r.wordIndex), ...c.sampradana.map(r => r.wordIndex),
    ...c.apadana.map(r => r.wordIndex), ...c.adhikarana.map(r => r.wordIndex),
    ...c.satisaptami.map(r => r.wordIndex), ...c.nirdharana.map(r => r.wordIndex),
    ...c.remaining.map(r => r.wordIndex),
  ];
  const byGovernor = new Map(clusters.map((c, ci) => [c.governorWordIndex, ci]));
  const nestedUnder = new Map(); // child clusterIdx -> parent clusterIdx
  clusters.forEach((c, ci) => {
    memberIndices(c).forEach(idx => {
      const childCi = byGovernor.get(idx);
      if (childCi !== undefined && childCi !== ci) nestedUnder.set(childCi, ci);
    });
  });
  function topAncestor(ci) {
    let cur = ci; const seen = new Set();
    while (nestedUnder.has(cur) && !seen.has(cur)) { seen.add(cur); cur = nestedUnder.get(cur); }
    return cur;
  }
  const groups = new Map(); // topClusterIdx -> {min, max, clusterIdxs}
  clusters.forEach((c, ci) => {
    const top = topAncestor(ci);
    const idxs = [c.governorWordIndex, ...memberIndices(c)];
    const min = Math.min(...idxs), max = Math.max(...idxs);
    if (!groups.has(top)) groups.set(top, { min, max, clusterIdxs: [] });
    const g = groups.get(top);
    g.min = Math.min(g.min, min); g.max = Math.max(g.max, max);
    g.clusterIdxs.push(ci);
  });
  return [...groups.entries()].map(([topClusterIdx, g]) => ({ ...g, topClusterIdx })).sort((a, b) => a.min - b.min);
}

// ---- explanatory prose (Harsha, 2026-08-12: conversational tone; draft mine, flagged for review
// — this is pedagogical framing, not derived from data, per the plan's open question). English
// prose throughout (Harsha, 2026-08-12), with Sanskrit kāraka/grammar terms kept in Devanāgarī
// inline — matches the rest of this app's convention (Devanāgarī verse text + English UI chrome),
// not the terminal/IAST convention from the sentence-analysis skill (this is a rendered browser
// page, not a terminal that mangles combining marks). ----
// The actual कर्ता/कर्म word(s) for this cluster (own tag + agreementKarta/Karma, but NOT
// qualifierKarta/Karma itself) — used to name them directly in the qualifierKarta/Karma question
// (Harsha, 2026-08-16: "include the कर्म/कर्ता in the question itself... so the user has context and
// can give the right answer for that specific question" — "the कर्ता of X" alone forced the learner
// to already know which word that was from an earlier step, purely from memory).
function coreArgIndices(c, side) {
  return side === 'karta'
    ? [...c.karta, ...c.agreementKarta, ...c.samuccayaKarta]
    : [...c.karma, ...c.agreementKarma, ...c.samuccayaKarma];
}
function coreArgWords(c, sentence, side) {
  return coreArgIndices(c, side).map(i => sentence.words[i]).join('/');
}
// Maps the corpus's short गender tag (पुं/स्त्री/नपुं, as extracted by build_karaka_tutorial.js's
// wordGender) to the same full-form labels the rest of this app already uses for gender MCQs
// (see GENDER_OPTIONS above, for the VIB node) — keeps the two gender-quiz UIs consistent.
const GENDER_FULL_LABEL = { 'पुं': 'पुंलिङ्ग', 'स्त्री': 'स्त्रीलिङ्ग', 'नपुं': 'नपुंसकलिङ्ग' };
// genderCheck MCQ (Harsha, 2026-08-16): a विशेषण/समानाधिकरण word must share GENDER with the word
// it qualifies/agrees with, same as case/number — but nothing tested that dimension specifically
// until now (qualifierKarta/Karma and agreementKarta/Karma only tested identifying the word, not
// confirming what gender it shares). correct = the qualified argument's own gender (sentence's own
// wordGenders, extracted from morph_in_context at build time).
function genderCheckOptions(sentence, c, side) {
  const qualifiedIdx = coreArgIndices(c, side)[0];
  const rawGender = qualifiedIdx != null ? sentence.wordGenders[qualifiedIdx] : null;
  const correct = rawGender ? GENDER_FULL_LABEL[rawGender] : null;
  return { correct, qualifiedIdx, options: GENDER_OPTIONS };
}
function tutorialStepLabel(step, sentence) {
  const c = step.clusterIdx != null ? sentence.clusters[step.clusterIdx] : null;
  const gov = c ? `<b>${esc(c.governorWord)}</b>` : '';
  switch (step.type) {
    case 'verbs': return `Which words in this sentence are verbs or participles (तिङन्त/कृत्) that make their own assertion — i.e. govern their own कर्ता/कर्म (विधेय) — rather than merely qualifying another word like an ordinary adjective (उद्देश्य, e.g. a क्त-participle used attributively)? (identify ${sentence.verbs.length} तिङन्त/कृत्)`;
    case 'voice': return `${gov} — is this कर्तरि, कर्मणि, or भावे?`;
    case 'kartaCase': return `Given that ${gov} is ${c.voice}, which vibhakti should its कर्ता be in?`;
    case 'karmaCase': return `Given that ${gov} is ${c.voice}, which vibhakti should its कर्म be in?`;
    case 'karta': return `For ${gov}, which word(s) together are the कर्ता (the doer — "who?")? Pick every word that shares the role — including any joined by च (समुच्चय). If there is none, choose "None of these" below.`;
    case 'karma': return `For ${gov}, which word(s) together are the कर्म (what the action is done to — "whom/what?")? Pick every word that shares the role — including any joined by च (समुच्चय). If there is no कर्म, choose "None of these" below.`;
    case 'agreementKarta': return `Which word agrees with (सामानाधिकरण्य — matches in gender/number/case with) the कर्ता of ${gov}?`;
    case 'agreementKarma': return `Which word agrees with (सामानाधिकरण्य — matches in gender/number/case with) the कर्म of ${gov}?`;
    case 'qualifierKarta': {
      const w = coreArgWords(c, sentence, 'karta');
      return `Which word(s) qualify (विशेषण) ${w ? `<b>${esc(w)}</b> (the कर्ता of ${gov})` : `the कर्ता of ${gov}`}?`;
    }
    case 'qualifierKarma': {
      const w = coreArgWords(c, sentence, 'karma');
      return `Which word(s) qualify (विशेषण) ${w ? `<b>${esc(w)}</b> (the कर्म of ${gov})` : `the कर्म of ${gov}`}?`;
    }
    case 'genderCheck': {
      const qWord = `<b>${esc(sentence.words[step.wordIndex])}</b>`;
      // Must reference the SAME word genderCheckOptions actually compares against
      // (coreArgIndices(...)[0]) — not the full coreArgWords() set, which can include the very
      // word being asked about itself (e.g. एकस्थम् is in its own cluster's agreementKarma).
      const qualifiedIdx = coreArgIndices(c, step.side)[0];
      const argWord = qualifiedIdx != null ? `<b>${esc(sentence.words[qualifiedIdx])}</b>` : '';
      const argLabel = step.side === 'karta' ? 'कर्ता' : 'कर्म';
      return `${qWord} must share which लिङ्ग (gender) with ${argWord} (the ${argLabel} of ${gov})?`;
    }
    case 'samuccayaKarta':
    case 'samuccayaKarma': {
      // Reference word deliberately excludes समुच्चयKarta/Karma itself (unlike coreArgIndices,
      // which now includes it for grading purposes) — otherwise a cluster with no plain कर्ता/कर्म
      // tag could self-reference the very word being asked about.
      const side = step.type === 'samuccayaKarta' ? 'karta' : 'karma';
      const primaryIdx = (side === 'karta' ? [...c.karta, ...c.agreementKarta] : [...c.karma, ...c.agreementKarma])[0];
      const argWord = primaryIdx != null ? `<b>${esc(sentence.words[primaryIdx])}</b>` : '';
      const argLabel = side === 'karta' ? 'कर्ता' : 'कर्म';
      return `Which other word(s) join ${argWord} as a joint ${argLabel} of ${gov} (समुच्चय — coordination, e.g. "X and Y")?`;
    }
    case 'samuccaya': return `More than one word together shares the role of ${gov} (समुच्चय — coordination) — which are they?`;
    case 'modifiers': return `Which words are adjectives (विशेषण) or adverbs (क्रियाविशेषण) modifying ${gov}?`;
    case 'karana': return `For ${gov}, which word is the करण — "by what means/instrument" is this action done?`;
    case 'sampradana': return `For ${gov}, which word is the सम्प्रदान — "for whom" or "for what purpose" (तादर्थ्य) is this कर्म/क्रिया being done?`;
    case 'apadana': return `For ${gov}, which word is the अपादान — "from what" or "from where" does this action originate?`;
    case 'adhikarana': return `For ${gov}, which word is the अधिकरण — "where" or "when" is this action happening?`;
    case 'satisaptami': return `For ${gov}, which word names the circumstance under which this action happens (सति-सप्तमी — a locative-absolute clause, distinct from ordinary अधिकरण)?`;
    case 'sambodhana': return `For ${gov}, which word is being directly addressed or called out to (सम्बोधन)?`;
    case 'nirdharana': return `For ${gov}, compared to/singled out from which group is this true (निर्धारण)?`;
    case 'remaining': return `Which remaining words relate to ${gov} (हेतु, षष्ठीसम्बन्ध, etc.)?`;
    default: return '';
  }
}
// Voice callout (step 2's fixed teaching text, shown after answering, regardless of correctness) —
// UoHyd p.7's rule: voice decides which kāraka is अभिहित (verbally-agreement-marked) and takes
// प्रथमा; the other stays in its "unexpressed" (अनुक्त) default case.
function tutorialVoiceCallout(voice) {
  if (voice === 'कर्तरि') return 'In कर्तरि (active), the verb agrees with the कर्ता, and the कर्ता stays in प्रथमा (nominative — अभिहित/expressed) — if there is a कर्म, it stays in द्वितीया (accusative — अनुक्त/unexpressed).';
  if (voice === 'कर्मणि') return 'In कर्मणि (passive), the verb agrees with the कर्म, and the कर्म moves to प्रथमा (अभिहित) — the कर्ता now goes to तृतीया (instrumental — अनुक्त).';
  if (voice === 'भावे') return 'In भावे (impersonal), the verb is always 3rd person singular no matter who the doer is — here neither कर्ता nor कर्म is in प्रथमा; the कर्ता (if expressed) stays in तृतीया.';
  return '';
}
// When a participle governor has no explicit तिङ् voice tag (क्तवतु/शतृ/etc. don't carry one), the
// build script derives voice from the pratyaya's own fixed sense — flag WHY here, so it doesn't
// look unmotivated to the learner.
function tutorialVoiceInferredNote(pratyaya, voice) {
  if (!pratyaya) return '';
  const p = esc(pratyaya);
  // क्त (निष्ठा) is the one affix whose voice depends on the ROOT, not the affix — so the note must
  // match which way it resolved (3.4.72 कर्तरि for अकर्मक/गत्यर्थ vs 3.4.70 कर्मणि for सकर्मक). Every
  // other kṛt affix has a fixed voice-sense.
  if (pratyaya === 'क्त') {
    return voice === 'कर्तरि'
      ? `(No separate तिङ् voice-tag — it's a क्त participle of an intransitive/motion (अकर्मक/गत्यर्थ) root, which by 3.4.72 (गत्यर्थाकर्मक…) denotes the agent: कर्तरि. The word it agrees with stays in प्रथमा.)`
      : `(No separate तिङ् voice-tag — it's a क्त participle of a transitive (सकर्मक) root, which by 3.4.70 (तयोरेव कृत्यक्तखलर्थाः) denotes the object: कर्मणि. Its agent takes तृतीया.)`;
  }
  if (pratyaya === 'क्तवतु') return `(No separate तिङ् voice-tag — क्तवतु is a past active participle: always कर्तरि, whatever the root.)`;
  if (pratyaya === 'शतृ' || pratyaya === 'शानच्') return `(No separate तिङ् voice-tag — ${p} is a present participle: कर्तरि.)`;
  // कृत्य affixes (यत्/ण्यत्/तव्य(त्)/अनीयर्/क्यप्/केलिमर्) + खल्.
  return `(No separate तिङ् voice-tag — the कृत्य affix ${p} is inherently ${esc(voice)} in sense (3.4.70, तयोरेव कृत्यक्तखलर्थाः); its agent takes तृतीया.)`;
}
// Transitivity aside — folded into step 5's (कर्म) feedback per the plan, not its own step.
function tutorialTransitivityAside(transitivity) {
  if (transitivity === 'अकर्मकः') return 'This verb is used intransitively (अकर्मक) here — that\'s why there\'s no कर्म; it\'s not a gap, just how this verb is being used.';
  if (transitivity === 'सकर्मकः') return 'This verb is transitive (सकर्मक) here — so it should have a कर्म.';
  return '';
}
// qualifierKarta/qualifierKarma teaching callout (Harsha, 2026-08-16) — "be generous and open" about
// सामानाधिकरण्य: general Pāṇinian grammar (2.1.49 विशेषणं विशेष्येण बहुलम् and the standard
// treatment of case-agreement-via-shared-reference) treats a qualifier/qualified pair as sharing
// case/gender/number for the same reason a predicate word does (both denote the same referent) —
// i.e. this step and agreementKarta/Karma are the same underlying phenomenon. NOTE: this "same
// phenomenon" framing is NOT itself asserted by the UoHyd tagging-guidelines PDF (§5.4, ex. 51-56,
// confirmed by grepping the extracted text — "सामानाधिकरण्य" only ever appears baked into the
// compound labels कर्तृ/कर्मसमानाधिकरणम्, never as a standalone umbrella term); the PDF only
// documents THAT विशेषणम् vs. कर्तृ/कर्मसमानाधिकरणम् are distinguished by उद्देश्य/विधेय function,
// not that they're grammatically the same phenomenon underneath. Keep these attributions separate
// if this callout is ever revised.
function tutorialQualifierCallout() {
  return 'This is also a form of सामानाधिकरण्य — a qualifier (विशेषण) shares the same case/gender/number as the word it qualifies, for the same reason a predicate word does (both refer to the same thing). It gets its own question here because it directly describes the word itself, rather than being predicated through the verb.';
}
// समुच्चय callout (Harsha, 2026-08-17, "Option A") — shown in the कर्ता/कर्म step's feedback whenever
// that role's members include समुच्चय-coordinated words (मामकाः + पाण्डवाः च in BG 1.1). Names what
// the learner just multi-selected and drives home the grammar established in that discussion: a
// single finite verb has ONE कर्ता/कर्म role (in कर्तरि the abhihita agent takes प्रथमा), but that
// one role can be borne by several words joined by च — they are a single collective कारक, not several
// rival कारकs, and each stands in the same vibhakti. Returns '' when there's no समुच्चय member.
function tutorialSamuccayaCallout(sentence, c, side) {
  const samu = side === 'karta' ? c.samuccayaKarta : c.samuccayaKarma;
  if (!samu || !samu.length) return '';
  const roleLabel = side === 'karta' ? 'कर्ता' : 'कर्म';
  const coreArg = side === 'karta' ? c.karta : c.karma;
  const idxs = [...coreArg, ...samu];
  const joined = idxs.map(i => `<b>${esc(sentence.words[i])}</b>`).join(' + ');
  return `${joined} are joined by च (समुच्चय) — together they form a single collective ${roleLabel}, not separate ${roleLabel}s. Coordinated words share the one ${roleLabel} role, each standing in the same vibhakti.`;
}
// Override-trigger notes (Harsha's cross-checked frameworks + this session's Anusāraka/corpus
// verification) — "why isn't this the plain default case," attached wherever cheaply detectable.
function tutorialOverrideNote(sentence, step, wordIndex) {
  const c = sentence.clusters[step.clusterIdx];
  if (step.type === 'karta' && c.notes && c.notes[wordIndex] && c.notes[wordIndex].trigger === 'krtyaKarmani') {
    return `${esc(sentence.words[wordIndex])} is in तृतीया, but not from a कर्मणि construction — ${esc(c.governorWord)} is itself a कृत्य-प्रत्यय form (${esc(c.notes[wordIndex].pratyaya)}), and the agent of such forms is always in तृतीया.`;
  }
  if (step.type === 'karma' && c.karmaGovernorIsKrdanta) {
    return `Note — ${esc(c.governorWord)} is itself a कृदन्त, so its कर्म can also appear in षष्ठी here (instead of the usual द्वितीया) — कारक-षष्ठी, 2.3.65.`;
  }
  const SWEEP_ARRAYS = ['karana', 'sampradana', 'apadana', 'adhikarana', 'satisaptami', 'sambodhana', 'nirdharana', 'remaining'];
  if (SWEEP_ARRAYS.includes(step.type)) {
    const item = c[step.type].find(r => r.wordIndex === wordIndex);
    if (item && item.upapada) return `${esc(sentence.words[wordIndex])} is in ${item.upapadaCase} here — because of ${esc(item.upapada)}, not from any general kāraka rule.`;
    if (item && item.role === 'हेतुः') return `हेतु (cause/reason) can appear in either तृतीया or पञ्चमी (2.3.23) — look at the form of ${esc(sentence.words[wordIndex])} here to tell which one it is.`;
  }
  return null;
}

// ---- report/feedback (tutorial-specific; the quiz's own report feature (buildReportDetails etc.,
// above) is shaped around item/options/correctIndex, which doesn't fit a click-based multi-select
// step or a per-cluster voice question — reuses the generic pieces (Formspree endpoint, reporter
// name/email persistence, .report-area styling) but builds its own subject/details from the
// tutorial's own state shape. No hide-from-pool behavior here (unlike the quiz): the tutorial
// always walks the same fixed verse list in order, there's no pool to filter a flagged item out of.
function buildTutorialReportDetails(target) {
  const { verse, sentence, step, selectedWords, expectedWords, voicePicked, correctVoice, pct } = target;
  const stepDesc = step.type + (step.clusterIdx != null ? ` (cluster ${step.clusterIdx}${sentence.clusters[step.clusterIdx] ? ', governor ' + sentence.clusters[step.clusterIdx].governorWord : ''})` : '');
  const details = [
    `verse: ${verse.ref}`,
    `step: ${stepDesc}`,
    `sentence: ${sentence.words.join(' ')}`,
    step.type === 'voice'
      ? `correct voice: ${correctVoice || '(unknown)'}\nyour answer: ${voicePicked || '(not answered)'}`
      : `expected words: ${expectedWords && expectedWords.length ? expectedWords.join(', ') : '(none)'}\nyour selection: ${selectedWords && selectedWords.length ? selectedWords.join(', ') : '(none)'}`,
    pct != null ? `score: ${pct}%` : null,
    '',
    deviceInfoLine(),
  ].filter(x => x !== null).join('\n');
  const subject = `Kāraka tutorial issue: ${verse.ref} — ${step.type}`;
  return { subject, details };
}
// GitHub-issue fallback (Harsha, 2026-08-16: "there doesn't appear to be a way to file a ticket
// through github directly (that we support elsewhere)") — the tutorial's report form only ever
// posted to Formspree, unlike the quiz's own report area (buildReportIssueUrl above) which also
// offers a pre-filled GitHub issue link for when Formspree is unreachable or someone just prefers
// filing directly. Same target repo/URL shape, just built from the tutorial's own target fields.
function buildTutorialReportIssueUrl(target, name, email, message) {
  const { subject } = buildTutorialReportDetails(target);
  const fullBody = `Reported by: ${name || '(anonymous)'}${email ? ` <${email}>` : ''}\n\n${message}`;
  const url = new URL('https://github.com/ConstrainedRandomVar/vedantic-vyakarana-academy/issues/new');
  url.searchParams.set('title', subject);
  url.searchParams.set('body', fullBody);
  return url.toString();
}
async function submitTutorialReport(target, name, email, userComment) {
  const { subject, details } = buildTutorialReportDetails(target);
  const message = userComment ? `Comments: ${userComment}\n\n${details}` : details;
  try {
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({ name: name || '(anonymous)', email: email || '', _subject: subject, message }),
    });
    return res.ok;
  } catch (e) { return false; }
}
function tutorialReportTarget(sentence, step, verse) {
  const expected = expectedSetForStep(sentence, step);
  const selected = view.selectedIndices || new Set();
  const c = step.clusterIdx != null ? sentence.clusters[step.clusterIdx] : null;
  return {
    verse, sentence, step,
    expectedWords: [...expected].map(i => sentence.words[i]),
    selectedWords: [...selected].map(i => sentence.words[i]),
    voicePicked: view.voicePicked,
    correctVoice: c ? c.voice : null,
    pct: view.checked ? Math.round(tutorialStepScore(selected, expected, ANY_VALID_STEP_TYPES.has(step.type)) * 100) : null,
  };
}
function renderTutorialReportArea(sentence, step, verse) {
  if (view.tutReportOpen) {
    const target = tutorialReportTarget(sentence, step, verse);
    const status = view.tutReportSubmitError
      ? `<div class="report-status error">Couldn't send — check your connection and try again.</div>` : '';
    return `<div class="report-area">
      <div class="report-target-label">Reporting this step: <span class="report-autosent-note">(the details below will be auto-sent with your report)</span></div>
      <label>Report details (auto-sent; select-all &amp; copy to paste elsewhere)
        <textarea class="report-copy" readonly rows="9" onclick="this.select()">${esc(buildTutorialReportDetails(target).details)}</textarea>
      </label>
      <label>Your name <input type="text" id="tutReportName" value="${esc(loadReporterName())}" placeholder="optional"></label>
      <label>Your email <input type="email" id="tutReportEmail" value="${esc(loadReporterEmail())}" placeholder="optional — in case we need to follow up"></label>
      <label>Add your own comments
        <textarea id="tutReportReason" placeholder="optional — what looks wrong here?"></textarea>
      </label>
      ${status}
      <button class="secondary" id="tutReportSubmitBtn" ${view.tutReportSubmitting ? 'disabled' : ''}>${view.tutReportSubmitting ? 'Sending…' : 'Submit report'}</button>
      <button class="link" id="tutReportCancelBtn">cancel</button>
      <div class="report-fallback"><button class="link" id="tutReportGithubBtn">or file a GitHub issue instead ↗</button></div>
    </div>`;
  }
  return view.tutReported
    ? `<span class="report-area reported">🚩 reported — thank you!</span>`
    : `<button class="link" id="tutReportBtn">🚩 report this step</button>`;
}
function wireTutorialReportArea(sentence, step, verse, rerender) {
  const openBtn = document.getElementById('tutReportBtn');
  if (openBtn) openBtn.onclick = () => { view = { ...view, tutReportOpen: true, tutReportSubmitError: false }; rerender(); };
  const cancelBtn = document.getElementById('tutReportCancelBtn');
  if (cancelBtn) cancelBtn.onclick = () => { view = { ...view, tutReportOpen: false, tutReportSubmitError: false }; rerender(); };
  const submitBtn = document.getElementById('tutReportSubmitBtn');
  if (submitBtn) submitBtn.onclick = async () => {
    const name = document.getElementById('tutReportName').value.trim();
    const email = document.getElementById('tutReportEmail').value.trim();
    const userComment = document.getElementById('tutReportReason').value.trim();
    saveReporterName(name);
    saveReporterEmail(email);
    const target = tutorialReportTarget(sentence, step, verse);
    view = { ...view, tutReportSubmitting: true, tutReportSubmitError: false };
    rerender();
    const ok = await submitTutorialReport(target, name, email, userComment);
    if (!ok) { view = { ...view, tutReportSubmitting: false, tutReportSubmitError: true }; rerender(); return; }
    view = { ...view, tutReportOpen: false, tutReportSubmitting: false, tutReported: true };
    rerender();
  };
  const githubBtn = document.getElementById('tutReportGithubBtn');
  if (githubBtn) githubBtn.onclick = () => {
    const name = document.getElementById('tutReportName').value.trim();
    const email = document.getElementById('tutReportEmail').value.trim();
    const userComment = document.getElementById('tutReportReason').value.trim();
    saveReporterName(name);
    saveReporterEmail(email);
    const target = tutorialReportTarget(sentence, step, verse);
    const { details } = buildTutorialReportDetails(target);
    const message = userComment ? `Comments: ${userComment}\n\n${details}` : details;
    window.open(buildTutorialReportIssueUrl(target, name, email, message), '_blank', 'noopener');
  };
}

// codes[i] is the sentence-analysis-skill grammatical code for word i — [vibhakti][vacana] for a
// declined noun/pronoun/participle (e.g. "41" = caturthī singular), [puruṣa][vacana] for a finite
// verb, "Y" for avyaya, or null/undefined when the source data didn't resolve one (left blank
// rather than guessed — see wordGramCode's header comment in build_karaka_tutorial.js).
// groups (optional): computeClauseGroups(sentence)'s output — sorted, non-overlapping [min,max]
// spans. Only meaningful (and only passed by renderTutorial) when a sentence has more than one
// top-level clause; a single-clause verse renders exactly as before. currentGroupTop marks the
// group containing the step currently being asked about, for a visually stronger boundary.
function renderClickableVerse(words, opts) {
  const selected = opts.selected, disabled = opts.disabled, expected = opts.expected, codes = opts.codes;
  const groups = opts.groups, currentGroupTop = opts.currentGroupTop;
  const wordHtml = (w, i) => {
    const cls = ['tutword'];
    if (disabled) {
      if (expected && expected.has(i) && selected.has(i)) cls.push('correct');
      else if (expected && expected.has(i)) cls.push('missed');
      else if (selected.has(i)) cls.push('wrong');
    } else if (selected.has(i)) cls.push('selected');
    const code = codes && codes[i] ? `<sub class="tutcode">${esc(codes[i])}</sub>` : '';
    return `<span class="${cls.join(' ')}" data-i="${i}">${esc(w)}${code}</span>`;
  };
  if (!groups || !groups.length) return words.map(wordHtml).join(' ');
  let html = '', gi = 0, open = null;
  for (let i = 0; i < words.length; i++) {
    if (!open && gi < groups.length && i === groups[gi].min) {
      open = groups[gi];
      html += `<span class="clause-group${open.topClusterIdx === currentGroupTop ? ' current' : ''}">`;
    }
    html += wordHtml(words[i], i);
    if (i < words.length - 1) html += ' ';
    if (open && i === open.max) { html += '</span>'; gi++; open = null; }
  }
  return html;
}

// Jaccard similarity (|selected ∩ expected| / |selected ∪ expected|), not plain recall
// (|intersection| / |expected|) — recall alone rewards over-selecting: clicking every word in the
// sentence would score 100% as long as the true answers were included among them, since it never
// counts against you for picking things you shouldn't have (found live, 2026-08-16: Harsha selected
// एकस्थम्+कृत्स्नम्+प्रविभक्तम् for a question expecting only एकस्थम्, and got "100% correct (1/1)"
// despite the extra two being marked wrong on the words themselves — a real contradiction between
// the visual feedback and the score). Jaccard only reaches 100% on an exact match.
// करता/कर्म/agreementKarta/agreementKarma are "any valid" buckets: their expected set holds
// MULTIPLE co-referential names for the SAME underlying argument (e.g. BG 4.1's इमम्+योगम् both
// name "this yoga") — finding ANY ONE of them, with no wrong picks, is a complete answer, not a
// partial one (Harsha, 2026-08-16: selecting only योगम् out of {इमम्,योगम्} should score 100%, not
// 50%). This is unlike modifiers/samuccaya/sweep buckets, where the task genuinely is to find
// EVERY member (e.g. both कृत्स्नम् AND प्रविभक्तम् in qualifierKarma) — those keep plain Jaccard.
const ANY_VALID_STEP_TYPES = new Set(['karta', 'karma', 'agreementKarta', 'agreementKarma']);
function tutorialStepScore(selected, expected, anyValid) {
  if (!expected.size && !selected.size) return 1;
  const inter = [...selected].filter(i => expected.has(i)).length;
  if (anyValid && selected.size > 0 && inter === selected.size) return 1; // non-empty, no wrong picks
  const union = new Set([...selected, ...expected]).size;
  return union ? inter / union : 0;
}
function checkTutorialStep() {
  const sentence = currentTutorialSentence();
  const step = currentTutorialStep();
  const expected = expectedSetForStep(sentence, step);
  const selected = view.selectedIndices;
  tutorialScores.push(tutorialStepScore(selected, expected, ANY_VALID_STEP_TYPES.has(step.type)));
  view = { ...view, checked: true, expected };
  renderTutorial();
}

function advanceTutorialStep() {
  tutorialStepIdx++;
  view = { screen: 'tutorial', selectedIndices: new Set(), checked: false };
  if (tutorialStepIdx >= tutorialSteps.length) {
    const verse = tutorialVerses[tutorialVerseIdx];
    if (tutorialSentIdx < verse.sentences.length - 1) {
      tutorialSentIdx++;
      tutorialSteps = buildTutorialSteps(currentTutorialSentence());
      tutorialStepIdx = 0;
      renderTutorial();
    } else {
      const avg = tutorialScores.length ? tutorialScores.reduce((a, b) => a + b, 0) / tutorialScores.length : 1;
      saveTutorialCompletionEntry(verse.ref, Math.round(avg * tutorialScores.length * 100) / 100, tutorialScores.length);
      saveTutorialProgress({ lastRef: verse.ref });
      renderTutorialVerseComplete(avg);
    }
    return;
  }
  renderTutorial();
}

function startTutorialSentence() {
  tutorialSteps = buildTutorialSteps(currentTutorialSentence());
  tutorialStepIdx = 0;
  tutorialScores = [];
  view = { screen: 'tutorial', selectedIndices: new Set(), checked: false };
  renderTutorial();
}
function startTutorialVerse(verseIdx) {
  tutorialVerseIdx = verseIdx;
  tutorialSentIdx = 0;
  saveTutorialProgress({ lastRef: tutorialVerses[verseIdx].ref });
  startTutorialSentence();
}

function renderTutorial() {
  const sentence = currentTutorialSentence();
  const verse = tutorialVerses[tutorialVerseIdx];
  const step = currentTutorialStep();
  const words = sentence.words;
  const clauseGroups = computeClauseGroups(sentence);
  const showClauseGroups = clauseGroups.length > 1;
  const currentGroup = step.clusterIdx != null ? clauseGroups.find(g => g.clusterIdxs.includes(step.clusterIdx)) : null;
  const currentGroupTop = currentGroup ? currentGroup.topClusterIdx : null;

  if (step.type === 'voice') {
    const c = sentence.clusters[step.clusterIdx];
    const answered = view.checked;
    const opts = ['कर्तरि', 'कर्मणि', 'भावे'];
    app.innerHTML = `
      <div class="tutorial-head"><button class="link" id="tutBackBtn">← Dashboard</button><span>${esc(formatVerseRef(verse.ref))}</span></div>
      <div class="question">
        <div class="tut-step-label">${tutorialStepLabel(step, sentence)}</div>
        <div class="tutorial-verse prompt">${renderClickableVerse(words, { selected: new Set([c.governorWordIndex]), disabled: true, expected: new Set([c.governorWordIndex]), codes: sentence.wordCodes, groups: showClauseGroups ? clauseGroups : null, currentGroupTop })}</div>
        <div class="options">
          ${opts.map(o => `<button class="opt ${answered ? (o === c.voice ? 'correct' : (o === view.voicePicked ? 'wrong' : '')) : ''}" data-o="${o}" ${answered ? 'disabled' : ''}>${o}</button>`).join('')}
        </div>
        ${answered ? `<div class="tut-explain">${tutorialVoiceCallout(c.voice)}</div>` : ''}
        ${answered && c.voiceInferredFrom ? `<div class="tut-explain">${tutorialVoiceInferredNote(c.voiceInferredFrom, c.voice)}</div>` : ''}
        <div class="tutorial-actions">${answered ? '<button class="primary" id="tutNextBtn">Next →</button>' : ''}</div>
        ${renderTutorialReportArea(sentence, step, verse)}
      </div>`;
    document.getElementById('tutBackBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
    if (!answered) {
      app.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
        view = { ...view, checked: true, voicePicked: btn.dataset.o };
        renderTutorial();
      });
    } else {
      document.getElementById('tutNextBtn').onclick = () => advanceTutorialStep();
    }
    wireTutorialReportArea(sentence, step, verse, renderTutorial);
    return;
  }

  if (step.type === 'kartaCase') {
    const c = sentence.clusters[step.clusterIdx];
    const { correct, options } = kartaCaseOptions(c);
    const answered = view.checked;
    app.innerHTML = `
      <div class="tutorial-head"><button class="link" id="tutBackBtn">← Dashboard</button><span>${esc(formatVerseRef(verse.ref))}</span></div>
      <div class="question">
        <div class="tut-step-label">${tutorialStepLabel(step, sentence)}</div>
        <div class="tutorial-verse prompt">${renderClickableVerse(words, { selected: new Set([c.governorWordIndex]), disabled: true, expected: new Set([c.governorWordIndex]), codes: sentence.wordCodes, groups: showClauseGroups ? clauseGroups : null, currentGroupTop })}</div>
        <div class="options">
          ${options.map(o => `<button class="opt ${answered ? (o === correct ? 'correct' : (o === view.kartaCasePicked ? 'wrong' : '')) : ''}" data-o="${o}" ${answered ? 'disabled' : ''}>${o}</button>`).join('')}
        </div>
        <div class="tutorial-actions">${answered ? '<button class="primary" id="tutNextBtn">Next →</button>' : ''}</div>
        ${renderTutorialReportArea(sentence, step, verse)}
      </div>`;
    document.getElementById('tutBackBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
    if (!answered) {
      app.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
        view = { ...view, checked: true, kartaCasePicked: btn.dataset.o };
        renderTutorial();
      });
    } else {
      document.getElementById('tutNextBtn').onclick = () => advanceTutorialStep();
    }
    wireTutorialReportArea(sentence, step, verse, renderTutorial);
    return;
  }

  if (step.type === 'karmaCase') {
    const c = sentence.clusters[step.clusterIdx];
    const { correct, options } = karmaCaseOptions(c);
    const answered = view.checked;
    app.innerHTML = `
      <div class="tutorial-head"><button class="link" id="tutBackBtn">← Dashboard</button><span>${esc(formatVerseRef(verse.ref))}</span></div>
      <div class="question">
        <div class="tut-step-label">${tutorialStepLabel(step, sentence)}</div>
        <div class="tutorial-verse prompt">${renderClickableVerse(words, { selected: new Set([c.governorWordIndex]), disabled: true, expected: new Set([c.governorWordIndex]), codes: sentence.wordCodes, groups: showClauseGroups ? clauseGroups : null, currentGroupTop })}</div>
        <div class="options">
          ${options.map(o => `<button class="opt ${answered ? (o === correct ? 'correct' : (o === view.karmaCasePicked ? 'wrong' : '')) : ''}" data-o="${o}" ${answered ? 'disabled' : ''}>${o}</button>`).join('')}
        </div>
        <div class="tutorial-actions">${answered ? '<button class="primary" id="tutNextBtn">Next →</button>' : ''}</div>
        ${renderTutorialReportArea(sentence, step, verse)}
      </div>`;
    document.getElementById('tutBackBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
    if (!answered) {
      app.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
        view = { ...view, checked: true, karmaCasePicked: btn.dataset.o };
        renderTutorial();
      });
    } else {
      document.getElementById('tutNextBtn').onclick = () => advanceTutorialStep();
    }
    wireTutorialReportArea(sentence, step, verse, renderTutorial);
    return;
  }

  if (step.type === 'genderCheck') {
    const c = sentence.clusters[step.clusterIdx];
    const { correct, qualifiedIdx, options } = genderCheckOptions(sentence, c, step.side);
    const answered = view.checked;
    const highlight = new Set([step.wordIndex, qualifiedIdx].filter(i => i != null));
    app.innerHTML = `
      <div class="tutorial-head"><button class="link" id="tutBackBtn">← Dashboard</button><span>${esc(formatVerseRef(verse.ref))}</span></div>
      <div class="question">
        <div class="tut-step-label">${tutorialStepLabel(step, sentence)}</div>
        <div class="tutorial-verse prompt">${renderClickableVerse(words, { selected: highlight, disabled: true, expected: highlight, codes: sentence.wordCodes, groups: showClauseGroups ? clauseGroups : null, currentGroupTop })}</div>
        <div class="options">
          ${options.map(o => `<button class="opt ${answered ? (o === correct ? 'correct' : (o === view.genderCheckPicked ? 'wrong' : '')) : ''}" data-o="${o}" ${answered ? 'disabled' : ''}>${o}</button>`).join('')}
        </div>
        <div class="tutorial-actions">${answered ? '<button class="primary" id="tutNextBtn">Next →</button>' : ''}</div>
        ${renderTutorialReportArea(sentence, step, verse)}
      </div>`;
    document.getElementById('tutBackBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
    if (!answered) {
      app.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
        view = { ...view, checked: true, genderCheckPicked: btn.dataset.o };
        renderTutorial();
      });
    } else {
      document.getElementById('tutNextBtn').onclick = () => advanceTutorialStep();
    }
    wireTutorialReportArea(sentence, step, verse, renderTutorial);
    return;
  }

  const expected = expectedSetForStep(sentence, step);
  const multiSelect = ['karta', 'karma', 'verbs', 'agreementKarta', 'agreementKarma', 'qualifierKarta', 'qualifierKarma', 'samuccaya', 'samuccayaKarta', 'samuccayaKarma', 'modifiers', 'karana', 'sampradana', 'apadana', 'adhikarana', 'satisaptami', 'sambodhana', 'nirdharana', 'remaining'].includes(step.type);
  const selected = view.selectedIndices;
  const checked = view.checked;
  const showNone = (step.type === 'karta' || step.type === 'karma') && !checked;
  const anyValid = ANY_VALID_STEP_TYPES.has(step.type);
  const inter = [...selected].filter(i => expected.has(i)).length;
  // A fully-valid subset (any-valid buckets only, e.g. picking just योगम् out of {इमम्,योगम्})
  // scores 100% — don't then mark the OTHER valid alternatives as "missed" (misleading next to a
  // 100% score); show only what was actually picked as correct instead.
  const fullyValidSubset = anyValid && selected.size > 0 && inter === selected.size;
  const displayExpected = checked ? (fullyValidSubset ? selected : expected) : null;
  const verseHtml = renderClickableVerse(words, { selected, disabled: checked, expected: displayExpected, codes: sentence.wordCodes, groups: showClauseGroups ? clauseGroups : null, currentGroupTop });

  let feedbackHtml = '';
  if (checked) {
    const pct = Math.round(tutorialStepScore(selected, expected, anyValid) * 100);
    feedbackHtml += `<div class="feedback">${pct}% correct${expected.size && !fullyValidSubset ? ` (${inter} / ${expected.size})` : ''}</div>`;
    if (step.type === 'karma') feedbackHtml += `<div class="tut-explain">${tutorialTransitivityAside(sentence.clusters[step.clusterIdx].transitivity)}</div>`;
    if (step.type === 'karta' || step.type === 'karma') {
      const sc = tutorialSamuccayaCallout(sentence, sentence.clusters[step.clusterIdx], step.type);
      if (sc) feedbackHtml += `<div class="tut-explain">${sc}</div>`;
    }
    if (step.type === 'qualifierKarta' || step.type === 'qualifierKarma') feedbackHtml += `<div class="tut-explain">${tutorialQualifierCallout()}</div>`;
    const noteTargets = [...expected, ...selected];
    for (const idx of new Set(noteTargets)) {
      const note = step.clusterIdx != null ? tutorialOverrideNote(sentence, step, idx) : null;
      if (note) feedbackHtml += `<div class="tut-explain">${note}</div>`;
    }
  }

  app.innerHTML = `
    <div class="tutorial-head"><button class="link" id="tutBackBtn">← Dashboard</button><span>${esc(formatVerseRef(verse.ref))}</span></div>
    <div class="question">
      <div class="tut-step-label">${tutorialStepLabel(step, sentence)}</div>
      <div class="tutorial-verse prompt">${verseHtml}</div>
      ${showNone ? `<button class="secondary" id="tutNoneBtn">None of these</button>` : ''}
      ${feedbackHtml}
      <div class="tutorial-actions">
        ${!checked ? `<button class="primary" id="tutCheckBtn" ${selected.size === 0 ? 'disabled' : ''}>Check answer</button>` : `<button class="primary" id="tutNextBtn">Next →</button>`}
      </div>
      ${renderTutorialReportArea(sentence, step, verse)}
    </div>`;
  document.getElementById('tutBackBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
  if (!checked) {
    app.querySelectorAll('.tutword').forEach(el => el.onclick = () => {
      const i = +el.dataset.i;
      if (multiSelect) { if (selected.has(i)) selected.delete(i); else selected.add(i); }
      else { selected.clear(); selected.add(i); }
      renderTutorial();
    });
    const noneBtn = document.getElementById('tutNoneBtn');
    if (noneBtn) noneBtn.onclick = () => { selected.clear(); checkTutorialStep(); };
    const checkBtn = document.getElementById('tutCheckBtn');
    if (checkBtn) checkBtn.onclick = () => checkTutorialStep();
  } else {
    document.getElementById('tutNextBtn').onclick = () => advanceTutorialStep();
  }
  wireTutorialReportArea(sentence, step, verse, renderTutorial);
}

function renderTutorialVerseComplete(avgScore) {
  view = { screen: 'tutorialComplete' };
  const verse = tutorialVerses[tutorialVerseIdx];
  app.innerHTML = `
    <div class="celebrate">
      <h2>✓ ${esc(formatVerseRef(verse.ref))} complete</h2>
      <p>${Math.round(avgScore * 100)}% average accuracy across this verse's steps</p>
      <div class="next-choices">
        <button class="primary" id="tutNextVerseBtn">Next verse →</button>
        <button class="secondary" id="tutPickBtn">Pick another verse</button>
        <button class="secondary" id="tutDashBtn">Dashboard</button>
      </div>
    </div>`;
  document.getElementById('tutNextVerseBtn').onclick = () => {
    const nextIdx = tutorialVerseIdx + 1 < tutorialVerses.length ? tutorialVerseIdx + 1 : 0;
    startTutorialVerse(nextIdx);
  };
  document.getElementById('tutPickBtn').onclick = () => renderTutorialPicker();
  document.getElementById('tutDashBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
}

// The source data's own chpatno/slokano fields are zero-padded ("01.001") so plain string sort/
// grouping (see groupTutorialVersesByChapter below) gives correct chapter order — but BG never
// exceeds 18 chapters or 78 verses, so that padding is only useful internally. Strip it for
// anything actually shown to the learner (Harsha, 2026-08-16: "do we need 3 digits for verses").
function formatVerseRef(ref) { return ref.split('.').map(p => String(+p)).join('.'); }

// Groups the flat tutorialVerses array by chapter (the part of `ref` before the '.', e.g. "01.001"
// -> chapter "01"), preserving each verse's original index into tutorialVerses so startTutorialVerse
// (which takes that index) still works after filtering.
function groupTutorialVersesByChapter(verses) {
  const chapters = new Map();
  verses.forEach((v, idx) => {
    const chapterKey = v.ref.split('.')[0];
    if (!chapters.has(chapterKey)) chapters.set(chapterKey, []);
    chapters.get(chapterKey).push({ idx, ref: v.ref });
  });
  return [...chapters.entries()]
    .map(([chapterKey, verseList]) => ({ chapterKey, verses: verseList }))
    .sort((a, b) => a.chapterKey.localeCompare(b.chapterKey));
}

function renderTutorialPicker() {
  app.innerHTML = `<div class="picker-head"><h2>🧩 कारक tutorial</h2><button class="link" id="tutPickerBackBtn">← Dashboard</button></div><p>Loading…</p>`;
  document.getElementById('tutPickerBackBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
  ensureTutorialDataLoaded().then(() => {
    tutorialVerses = window.TUTORIAL_DATA.Gita.verses;
    const completion = loadTutorialCompletion();
    const completedN = Object.keys(completion).filter(ref => tutorialVerses.some(v => v.ref === ref)).length;
    const saved = loadTutorialProgress();
    const resumeIdx = saved.lastRef ? tutorialVerses.findIndex(v => v.ref === saved.lastRef) : -1;
    const chapters = groupTutorialVersesByChapter(tutorialVerses);
    // BG-only for now, so no "Text" level (see renderReadingPicker's 3-level version) — just
    // Chapter -> Verse, mirroring the same drillable-filter pattern used there (Harsha, 2026-08-15:
    // "the chapter and verse can be made filters" rather than one long flat dropdown).
    const p = view.picker || (view.picker = { chapterKey: null });
    const selectedChapter = chapters.find(c => c.chapterKey === p.chapterKey) || null;
    app.innerHTML = `
      <div class="picker-head">
        <h2>🧩 कारक tutorial — Bhagavad Gītā</h2>
        <button class="link" id="tutPickerBackBtn">← Dashboard</button>
      </div>
      <p>${completedN} / ${tutorialVerses.length} verses completed</p>
      <div class="reading-actions">
        ${resumeIdx >= 0 ? `<button class="primary" id="tutResumeBtn">Continue (${esc(formatVerseRef(saved.lastRef))})</button>` : ''}
        <button class="secondary" id="tutStartBtn">Start from beginning</button>
      </div>
      <div class="picker-level">
        <label>Chapter</label>
        <select id="tutChapterSelect">
          <option value="">Choose a chapter…</option>
          ${chapters.map(c => `<option value="${esc(c.chapterKey)}"${c.chapterKey === p.chapterKey ? ' selected' : ''}>Chapter ${esc(formatVerseRef(c.chapterKey))}</option>`).join('')}
        </select>
      </div>
      ${selectedChapter ? `<div class="picker-level verse-jump">
        <select id="tutVerseSelect">${selectedChapter.verses.map(v => `<option value="${v.idx}">${esc(formatVerseRef(v.ref))}</option>`).join('')}</select>
        <button class="secondary" id="tutJumpBtn">Go</button>
      </div>` : ''}`;
    document.getElementById('tutPickerBackBtn').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
    if (resumeIdx >= 0) document.getElementById('tutResumeBtn').onclick = () => startTutorialVerse(resumeIdx);
    document.getElementById('tutStartBtn').onclick = () => startTutorialVerse(0);
    document.getElementById('tutChapterSelect').onchange = e => { p.chapterKey = e.target.value || null; renderTutorialPicker(); };
    const jumpBtn = document.getElementById('tutJumpBtn');
    if (jumpBtn) jumpBtn.onclick = () => startTutorialVerse(+document.getElementById('tutVerseSelect').value);
  }).catch(() => {
    app.innerHTML = `<p>Couldn't load tutorial data. <button class="link" id="tutPickerBackBtn2">← Dashboard</button></p>`;
    document.getElementById('tutPickerBackBtn2').onclick = () => { view = { screen: 'dashboard' }; renderDashboard(); };
  });
}

renderDashboard();
