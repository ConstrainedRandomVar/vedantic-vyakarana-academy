'use strict';
// Shared script-transliteration for the STATIC reading views (मूलम् padārtha + Śāṅkara-bhāṣya +
// unified pages). Shipped ONCE as a fixed-name asset (SW-precached), referenced by every reading page,
// so footprint is ~one small file regardless of page count. Zero dependency: self-contained
// Devanāgarī → { IAST, Kannada, Tamil } transliterators (no Sanscript/npm/CDN). A dropdown next to the
// ◐ theme button switches script; when non-Devanāgarī, every Devanāgarī text node (verse, bhāṣya, zone
// labels, nav options, and — via a MutationObserver — the hover tooltips) is transliterated. Choice
// persists in localStorage['vv_script'] (shared with the SPA settings gear). Reading pages only.
//
// Adding another script later = drop in one more map table + a <option> (the engine is shared):
//   • Brahmic targets (Kannada/Tamil/Telugu/Malayalam…) are a DIRECT per-char map — same abugida
//     structure as Devanāgarī, so no inherent-'a' logic is needed.
//   • Tamil is lossy (no distinct kha/gha/ṣa…): we use the SUPERSCRIPT convention (க²/க³/க⁴) that
//     Sanskrit-in-Tamil publishing uses, + ஃ (āytam) for visarga. ऋ-vowel/anusvāra have no clean Tamil
//     form — rendered as best-effort (ரு / ம்); flagged for review.
//   • IAST is the one target that needs the abugida→Latin algorithm (inherent 'a', virāma removes it).
// (Harsha, 2026-08-25.)
(function () {
  var VIR = '्';
  var DEV = /[ऀ-ॿ]/; // any Devanāgarī codepoint

  // ---- IAST (Devanāgarī → Latin; needs inherent-'a' handling) ----
  var IV = { 'अ':'a','आ':'ā','इ':'i','ई':'ī','उ':'u','ऊ':'ū','ऋ':'ṛ','ॠ':'ṝ','ऌ':'ḷ','ॡ':'ḹ','ए':'e','ऐ':'ai','ओ':'o','औ':'au','ऎ':'e','ऒ':'o','ऑ':'ô','ऍ':'ê','ॐ':'oṃ' };
  var IM = { 'ा':'ā','ि':'i','ी':'ī','ु':'u','ू':'ū','ृ':'ṛ','ॄ':'ṝ','ॢ':'ḷ','ॣ':'ḹ','े':'e','ै':'ai','ो':'o','ौ':'au','ॆ':'e','ॊ':'o','ॉ':'ô','ॅ':'ê' };
  var IC = { 'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'ṅ','च':'c','छ':'ch','ज':'j','झ':'jh','ञ':'ñ','ट':'ṭ','ठ':'ṭh','ड':'ḍ','ढ':'ḍh','ण':'ṇ','त':'t','थ':'th','द':'d','ध':'dh','न':'n','प':'p','फ':'ph','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','व':'v','श':'ś','ष':'ṣ','स':'s','ह':'h','ळ':'ḻ','क़':'q','ख़':'ḵẖ','ग़':'ġ','ज़':'z','ड़':'ṛ','ढ़':'ṛh','फ़':'f','य़':'ẏ' };
  var IS = { 'ं':'ṃ','ः':'ḥ','ँ':'m̐','ऽ':"'" };
  var ID = { '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9' };
  function d2iast(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (IC[ch] !== undefined) { o += IC[ch]; var nx = s[i + 1]; if (nx === VIR) { i++; } else if (IM[nx] !== undefined) { o += IM[nx]; i++; } else { o += 'a'; } }
      else if (IV[ch] !== undefined) { o += IV[ch]; }
      else if (IS[ch] !== undefined) { o += IS[ch]; }
      else if (ID[ch] !== undefined) { o += ID[ch]; }
      else if (ch === VIR) { /* stray */ }
      else { o += ch; }
    }
    return o;
  }

  // ---- Kannada (direct per-char map; clean — all Sanskrit sounds present) ----
  var KAN = {
    'अ':'ಅ','आ':'ಆ','इ':'ಇ','ई':'ಈ','उ':'ಉ','ऊ':'ಊ','ऋ':'ಋ','ॠ':'ೠ','ऌ':'ಌ','ॡ':'ೡ','ए':'ಏ','ऐ':'ಐ','ओ':'ಓ','औ':'ಔ','ऎ':'ಎ','ऒ':'ಒ','ऍ':'ಎ','ऑ':'ಒ','ॐ':'ಓಂ',
    'ा':'ಾ','ि':'ಿ','ी':'ೀ','ु':'ು','ू':'ೂ','ृ':'ೃ','ॄ':'ೄ','ॢ':'ೢ','ॣ':'ೣ','े':'ೇ','ै':'ೈ','ो':'ೋ','ौ':'ೌ','ॆ':'ೆ','ॊ':'ೊ',
    'क':'ಕ','ख':'ಖ','ग':'ಗ','घ':'ಘ','ङ':'ಙ','च':'ಚ','छ':'ಛ','ज':'ಜ','झ':'ಝ','ञ':'ಞ','ट':'ಟ','ठ':'ಠ','ड':'ಡ','ढ':'ಢ','ण':'ಣ','त':'ತ','थ':'ಥ','द':'ದ','ध':'ಧ','न':'ನ','प':'ಪ','फ':'ಫ','ब':'ಬ','भ':'ಭ','म':'ಮ','य':'ಯ','र':'ರ','ल':'ಲ','व':'ವ','श':'ಶ','ष':'ಷ','स':'ಸ','ह':'ಹ','ळ':'ಳ',
    '्':'್','ं':'ಂ','ः':'ಃ','ँ':'ಁ','ऽ':'ಽ',
    '०':'೦','१':'೧','२':'೨','३':'೩','४':'೪','५':'೫','६':'೬','७':'೭','८':'೮','९':'೯'
  };

  // ---- Telugu (direct per-char map; clean — all Sanskrit sounds present) ----
  var TEL = {
    'अ':'అ','आ':'ఆ','इ':'ఇ','ई':'ఈ','उ':'ఉ','ऊ':'ఊ','ऋ':'ఋ','ॠ':'ౠ','ऌ':'ఌ','ॡ':'ౡ','ए':'ఏ','ऐ':'ఐ','ओ':'ఓ','औ':'ఔ','ऎ':'ఎ','ऒ':'ఒ','ऍ':'ఎ','ऑ':'ఒ','ॐ':'ఓం',
    'ा':'ా','ि':'ి','ी':'ీ','ु':'ు','ू':'ూ','ृ':'ృ','ॄ':'ౄ','ॢ':'ౢ','ॣ':'ౣ','े':'ే','ै':'ై','ो':'ో','ौ':'ౌ','ॆ':'ె','ॊ':'ొ',
    'क':'క','ख':'ఖ','ग':'గ','घ':'ఘ','ङ':'ఙ','च':'చ','छ':'ఛ','ज':'జ','झ':'ఝ','ञ':'ఞ','ट':'ట','ठ':'ఠ','ड':'డ','ढ':'ఢ','ण':'ణ','त':'త','थ':'థ','द':'ద','ध':'ధ','न':'న','प':'ప','फ':'ఫ','ब':'బ','भ':'భ','म':'మ','य':'య','र':'ర','ल':'ల','व':'వ','श':'శ','ष':'ష','स':'స','ह':'హ','ळ':'ళ',
    '्':'్','ं':'ం','ः':'ః','ँ':'ఁ','ऽ':'ఽ',
    '०':'౦','१':'౧','२':'౨','३':'౩','४':'౪','५':'౫','६':'౬','७':'౭','८':'౮','९':'౯'
  };

  // ---- Malayalam (direct per-char map; clean — all Sanskrit sounds present) ----
  var MAL = {
    'अ':'അ','आ':'ആ','इ':'ഇ','ई':'ഈ','उ':'ഉ','ऊ':'ഊ','ऋ':'ഋ','ॠ':'ൠ','ऌ':'ഌ','ॡ':'ൡ','ए':'ഏ','ऐ':'ഐ','ओ':'ഓ','औ':'ഔ','ऎ':'എ','ऒ':'ഒ','ऍ':'എ','ऑ':'ഒ','ॐ':'ഓം',
    'ा':'ാ','ि':'ി','ी':'ീ','ु':'ു','ू':'ൂ','ृ':'ൃ','ॄ':'ൄ','ॢ':'ൢ','ॣ':'ൣ','े':'േ','ै':'ൈ','ो':'ോ','ौ':'ൌ','ॆ':'െ','ॊ':'ൊ',
    'क':'ക','ख':'ഖ','ग':'ഗ','घ':'ഘ','ङ':'ങ','च':'ച','छ':'ഛ','ज':'ജ','झ':'ഝ','ञ':'ഞ','ट':'ട','ठ':'ഠ','ड':'ഡ','ढ':'ഢ','ण':'ണ','त':'ത','थ':'ഥ','द':'ദ','ध':'ധ','न':'ന','प':'പ','फ':'ഫ','ब':'ബ','भ':'ഭ','म':'മ','य':'യ','र':'ര','ल':'ല','व':'വ','श':'ശ','ष':'ഷ','स':'സ','ह':'ഹ','ळ':'ള',
    '्':'്','ं':'ം','ः':'ഃ','ँ':'ഁ','ऽ':'ഽ',
    '०':'൦','१':'൧','२':'൨','३':'൩','४':'൪','५':'൫','६':'൬','७':'൭','८':'൮','९':'൯'
  };

  // ---- Bengali (direct per-char map; व has no distinct letter → ব, ळ → ল) ----
  var BEN = {
    'अ':'অ','आ':'আ','इ':'ই','ई':'ঈ','उ':'উ','ऊ':'ঊ','ऋ':'ঋ','ॠ':'ৠ','ऌ':'ঌ','ॡ':'ৡ','ए':'এ','ऐ':'ঐ','ओ':'ও','औ':'ঔ','ऎ':'এ','ऒ':'ও','ऍ':'এ','ऑ':'ও','ॐ':'ওঁ',
    'ा':'া','ि':'ি','ी':'ী','ु':'ু','ू':'ূ','ृ':'ৃ','ॄ':'ৄ','ॢ':'ৢ','ॣ':'ৣ','े':'ে','ै':'ৈ','ो':'ো','ौ':'ৌ','ॆ':'ে','ॊ':'ো',
    'क':'ক','ख':'খ','ग':'গ','घ':'ঘ','ङ':'ঙ','च':'চ','छ':'ছ','ज':'জ','झ':'ঝ','ञ':'ঞ','ट':'ট','ठ':'ঠ','ड':'ড','ढ':'ঢ','ण':'ণ','त':'ত','थ':'থ','द':'দ','ध':'ধ','न':'ন','प':'প','फ':'ফ','ब':'ব','भ':'ভ','म':'ম','य':'য','र':'র','ल':'ল','व':'ব','श':'শ','ष':'ষ','स':'স','ह':'হ','ळ':'ল',
    '्':'্','ं':'ং','ः':'ঃ','ँ':'ঁ','ऽ':'ঽ',
    '०':'০','१':'১','२':'২','३':'৩','४':'৪','५':'৫','६':'৬','७':'৭','८':'৮','९':'৯'
  };

  // ---- Gujarati (direct per-char map; clean — all Sanskrit sounds present; ॐ → ૐ) ----
  var GUJ = {
    'अ':'અ','आ':'આ','इ':'ઇ','ई':'ઈ','उ':'ઉ','ऊ':'ઊ','ऋ':'ઋ','ॠ':'ૠ','ऌ':'ઌ','ॡ':'ૡ','ए':'એ','ऐ':'ઐ','ओ':'ઓ','औ':'ઔ','ऎ':'એ','ऒ':'ઓ','ऍ':'ઍ','ऑ':'ઑ','ॐ':'ૐ',
    'ा':'ા','ि':'િ','ी':'ી','ु':'ુ','ू':'ૂ','ृ':'ૃ','ॄ':'ૄ','ॢ':'ૢ','ॣ':'ૣ','े':'ે','ै':'ૈ','ो':'ો','ौ':'ૌ','ॆ':'ે','ॊ':'ો','ॅ':'ૅ','ॉ':'ૉ',
    'क':'ક','ख':'ખ','ग':'ગ','घ':'ઘ','ङ':'ઙ','च':'ચ','छ':'છ','ज':'જ','झ':'ઝ','ञ':'ઞ','ट':'ટ','ठ':'ઠ','ड':'ડ','ढ':'ઢ','ण':'ણ','त':'ત','थ':'થ','द':'દ','ध':'ધ','न':'ન','प':'પ','फ':'ફ','ब':'બ','भ':'ભ','म':'મ','य':'ય','र':'ર','ल':'લ','व':'વ','श':'શ','ष':'ષ','स':'સ','ह':'હ','ळ':'ળ',
    '्':'્','ं':'ં','ः':'ઃ','ँ':'ઁ','ऽ':'ઽ',
    '०':'૦','१':'૧','२':'૨','३':'૩','४':'૪','५':'૫','६':'૬','७':'૭','८':'૮','९':'૯'
  };

  // ---- Siddhaṃ / bonji 梵字 (the traditional script for Sanskrit in Japan; Brahmic abugida in the
  // Unicode SMP block U+11580–U+115FF, structurally like Devanāgarī → a CLEAN DIRECT per-char map,
  // faithful, all Sanskrit sounds present). Values are supplementary-plane (surrogate pairs) — fine as
  // JS strings; dmap iterates the Devanāgarī (BMP) INPUT, so surrogate output is unaffected.
  // Notes: the block has NO encoded digits and no avagraha → digits fall back to ASCII, ऽ → apostrophe;
  // vocalic-ṝ/ḷ/ḹ dependent signs are unassigned in the block so those (rare) mātrās pass through.
  // Needs the Noto Sans Siddham webfont (wired below) or it renders as boxes. ॐ = O + anusvāra. ----
  var SID = {
    'अ':'\u{11580}','आ':'\u{11581}','इ':'\u{11582}','ई':'\u{11583}','उ':'\u{11584}','ऊ':'\u{11585}','ऋ':'\u{11586}','ॠ':'\u{11587}','ऌ':'\u{11588}','ॡ':'\u{11589}','ए':'\u{1158A}','ऐ':'\u{1158B}','ओ':'\u{1158C}','औ':'\u{1158D}','ऎ':'\u{1158A}','ऒ':'\u{1158C}','ॐ':'\u{1158C}\u{115BD}',
    'ा':'\u{115B0}','ि':'\u{115B1}','ी':'\u{115B2}','ु':'\u{115B3}','ू':'\u{115B4}','ृ':'\u{115B5}','े':'\u{115B8}','ै':'\u{115B9}','ो':'\u{115BA}','ौ':'\u{115BB}','ॆ':'\u{115B8}','ॊ':'\u{115BA}',
    'क':'\u{1158E}','ख':'\u{1158F}','ग':'\u{11590}','घ':'\u{11591}','ङ':'\u{11592}','च':'\u{11593}','छ':'\u{11594}','ज':'\u{11595}','झ':'\u{11596}','ञ':'\u{11597}','ट':'\u{11598}','ठ':'\u{11599}','ड':'\u{1159A}','ढ':'\u{1159B}','ण':'\u{1159C}','त':'\u{1159D}','थ':'\u{1159E}','द':'\u{1159F}','ध':'\u{115A0}','न':'\u{115A1}','प':'\u{115A2}','फ':'\u{115A3}','ब':'\u{115A4}','भ':'\u{115A5}','म':'\u{115A6}','य':'\u{115A7}','र':'\u{115A8}','ल':'\u{115A9}','व':'\u{115AA}','श':'\u{115AB}','ष':'\u{115AC}','स':'\u{115AD}','ह':'\u{115AE}','ळ':'\u{115AF}',
    '्':'\u{115BF}','ं':'\u{115BD}','ः':'\u{115BE}','ँ':'\u{115BC}','ऽ':"'",
    '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9'
  };

  // ---- Tamil (superscript convention; the superscript must trail the whole akṣara, AFTER any
  // matra/pulli, so this needs the same consonant-cluster algorithm as IAST — not a flat map) ----
  var TV = { 'अ':'அ','आ':'ஆ','इ':'இ','ई':'ஈ','उ':'உ','ऊ':'ஊ','ऋ':'ரு','ॠ':'ரூ','ऌ':'லு','ॡ':'லூ','ए':'ஏ','ऐ':'ஐ','ओ':'ஓ','औ':'ஔ','ऎ':'எ','ऒ':'ஒ','ऍ':'எ','ऑ':'ஒ','ॐ':'ஓம்' };
  var TM = { 'ा':'ா','ि':'ி','ी':'ீ','ु':'ு','ू':'ூ','ृ':'்ரு','ॄ':'்ரூ','े':'ே','ै':'ை','ो':'ோ','ौ':'ௌ','ॆ':'ெ','ॊ':'ொ' };
  var TC = { // Devanāgarī consonant → [Tamil base, trailing superscript]
    'क':['க',''],'ख':['க','²'],'ग':['க','³'],'घ':['க','⁴'],'ङ':['ங',''],
    'च':['ச',''],'छ':['ச','²'],'ज':['ஜ',''],'झ':['ஜ','⁴'],'ञ':['ஞ',''],
    'ट':['ட',''],'ठ':['ட','²'],'ड':['ட','³'],'ढ':['ட','⁴'],'ण':['ண',''],
    'त':['த',''],'थ':['த','²'],'द':['த','³'],'ध':['த','⁴'],'न':['ந',''],
    'प':['ப',''],'फ':['ப','²'],'ब':['ப','³'],'भ':['ப','⁴'],'म':['ம',''],
    'य':['ய',''],'र':['ர',''],'ल':['ல',''],'व':['வ',''],'श':['ஶ',''],'ष':['ஷ',''],'स':['ஸ',''],'ह':['ஹ',''],'ळ':['ள','']
  };
  var TS = { 'ं':'ம்','ः':'ஃ','ँ':'ம்','ऽ':"'" };
  var TD = { '०':'௦','१':'௧','२':'௨','३':'௩','४':'௪','५':'௫','६':'௬','७':'௭','८':'௮','९':'௯' };
  function d2tamil(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = TC[ch];
      if (c) { o += c[0]; var nx = s[i + 1]; if (nx === VIR) { o += '்'; i++; } else if (TM[nx] !== undefined) { o += TM[nx]; i++; } o += c[1]; } // superscript LAST
      else if (TV[ch] !== undefined) { o += TV[ch]; }
      else if (TS[ch] !== undefined) { o += TS[ch]; }
      else if (TD[ch] !== undefined) { o += TD[ch]; }
      else if (ch === VIR) { /* stray */ }
      else { o += ch; }
    }
    return o;
  }

  // ---- Cyrillic (needs the inherent-'a' algorithm, like IAST). Scholarly Sanskrit→Cyrillic scheme
  // (one accepted convention): к кх г гх ṅ=н̇ ч чх дж джх ñ=н̃, retroflex т̣ т̣х д̣ д̣х н̣, dentals т тх д
  // дх н, п пх б бх м, й р л в, ш ш̣ с х, ळ=л̣; vowels а а̄ и ӣ у ӯ р̣ е аи о ау; anusvāra→м̣, visarga→х̣,
  // ऽ→'. Uses combining macron (U+0304) / dot-below (U+0323) / dot-above (U+0307) / tilde (U+0303). ----
  var CV = { 'अ':'а','आ':'а̄','इ':'и','ई':'ӣ','उ':'у','ऊ':'ӯ','ऋ':'р̣','ॠ':'р̣̄','ऌ':'л̣','ॡ':'л̣̄','ए':'е','ऐ':'аи','ओ':'о','औ':'ау','ऎ':'е','ऒ':'о','ऍ':'е','ऑ':'о','ॐ':'ом̣' };
  var CM = { 'ा':'а̄','ि':'и','ी':'ӣ','ु':'у','ू':'ӯ','ृ':'р̣','ॄ':'р̣̄','ॢ':'л̣','ॣ':'л̣̄','े':'е','ै':'аи','ो':'о','ौ':'ау','ॆ':'е','ॊ':'о' };
  var CC = { 'क':'к','ख':'кх','ग':'г','घ':'гх','ङ':'н̇','च':'ч','छ':'чх','ज':'дж','झ':'джх','ञ':'н̃','ट':'т̣','ठ':'т̣х','ड':'д̣','ढ':'д̣х','ण':'н̣','त':'т','थ':'тх','द':'д','ध':'дх','न':'н','प':'п','फ':'пх','ब':'б','भ':'бх','म':'м','य':'й','र':'р','ल':'л','व':'в','श':'ш','ष':'ш̣','स':'с','ह':'х','ळ':'л̣' };
  var CS = { 'ं':'м̣','ः':'х̣','ँ':'м̐','ऽ':"'" };
  function d2cyrillic(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (CC[ch] !== undefined) { o += CC[ch]; var nx = s[i + 1]; if (nx === VIR) { i++; } else if (CM[nx] !== undefined) { o += CM[nx]; i++; } else { o += 'а'; } }
      else if (CV[ch] !== undefined) { o += CV[ch]; }
      else if (CS[ch] !== undefined) { o += CS[ch]; }
      else if (ID[ch] !== undefined) { o += ID[ch]; }
      else if (ch === VIR) { /* stray */ }
      else { o += ch; }
    }
    return o;
  }

  // ---- Japanese katakana (a SYLLABARY → LOSSY phonetic APPROXIMATION, NOT faithful: no aspirate /
  // retroflex / r–l distinctions, forces a vowel onto every consonant). A pronunciation aid only; the
  // faithful Japanese option is Siddhaṃ above. Aspirates fold into their unaspirated row, retroflexes
  // into dentals; र/ल both → ラ行; anusvāra & word-final न/म → ン; visarga dropped; long vowels add ー
  // (chōonpu); a bare (virāma) consonant → its 'u'-mora unless ン-eligible; ऋ→リ approx. ----
  var KKV = { 'अ':'ア','आ':'アー','इ':'イ','ई':'イー','उ':'ウ','ऊ':'ウー','ऋ':'リ','ॠ':'リー','ऌ':'ル','ॡ':'ルー','ए':'エ','ऐ':'アイ','ओ':'オ','औ':'アウ','ऎ':'エ','ऒ':'オ','ॐ':'オーム' };
  var KROW = { // consonant → [a, i, u, e, o] katakana column
    'क':['カ','キ','ク','ケ','コ'],'ख':['カ','キ','ク','ケ','コ'],'ग':['ガ','ギ','グ','ゲ','ゴ'],'घ':['ガ','ギ','グ','ゲ','ゴ'],'ङ':['ナ','ニ','ヌ','ネ','ノ'],
    'च':['チャ','チ','チュ','チェ','チョ'],'छ':['チャ','チ','チュ','チェ','チョ'],'ज':['ジャ','ジ','ジュ','ジェ','ジョ'],'झ':['ジャ','ジ','ジュ','ジェ','ジョ'],'ञ':['ニャ','ニ','ニュ','ニェ','ニョ'],
    'ट':['タ','ティ','トゥ','テ','ト'],'ठ':['タ','ティ','トゥ','テ','ト'],'ड':['ダ','ディ','ドゥ','デ','ド'],'ढ':['ダ','ディ','ドゥ','デ','ド'],'ण':['ナ','ニ','ヌ','ネ','ノ'],
    'त':['タ','ティ','トゥ','テ','ト'],'थ':['タ','ティ','トゥ','テ','ト'],'द':['ダ','ディ','ドゥ','デ','ド'],'ध':['ダ','ディ','ドゥ','デ','ド'],'न':['ナ','ニ','ヌ','ネ','ノ'],
    'प':['パ','ピ','プ','ペ','ポ'],'फ':['パ','ピ','プ','ペ','ポ'],'ब':['バ','ビ','ブ','ベ','ボ'],'भ':['バ','ビ','ブ','ベ','ボ'],'म':['マ','ミ','ム','メ','モ'],
    'य':['ヤ','イ','ユ','イェ','ヨ'],'र':['ラ','リ','ル','レ','ロ'],'ल':['ラ','リ','ル','レ','ロ'],'व':['ヴァ','ヴィ','ヴ','ヴェ','ヴォ'],
    'श':['シャ','シ','シュ','シェ','ショ'],'ष':['シャ','シ','シュ','シェ','ショ'],'स':['サ','シ','ス','セ','ソ'],'ह':['ハ','ヒ','フ','ヘ','ホ'],'ळ':['ラ','リ','ル','レ','ロ']
  };
  // matra → { v: vowel-column index, l: adds chōonpu ー, suf: extra kana appended }
  var KKM = { 'ा':{v:0,l:1},'ि':{v:1},'ी':{v:1,l:1},'ु':{v:2},'ू':{v:2,l:1},'ृ':{v:2,suf:'リ'},'ॄ':{v:2,suf:'リ'},'े':{v:3,l:1},'ै':{v:0,suf:'イ'},'ो':{v:4,l:1},'ौ':{v:0,suf:'ウ'},'ॆ':{v:3},'ॊ':{v:4} };
  var KKS = { 'ं':'ン','ः':'','ँ':'ン','ऽ':'' };
  var KKNASAL = { 'न':1,'ण':1,'म':1,'ङ':1,'ञ':1 }; // bare (virāma) → ン rather than a 'u'-mora
  function d2katakana(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], row = KROW[ch];
      if (row) {
        var nx = s[i + 1];
        if (nx === VIR) { o += KKNASAL[ch] ? 'ン' : row[2]; i++; }
        else if (KKM[nx] !== undefined) { var sp = KKM[nx]; o += row[sp.v]; if (sp.l) o += 'ー'; if (sp.suf) o += sp.suf; i++; }
        else { o += row[0]; }
      }
      else if (KKV[ch] !== undefined) { o += KKV[ch]; }
      else if (KKS[ch] !== undefined) { o += KKS[ch]; }
      else if (ID[ch] !== undefined) { o += ID[ch]; }
      else if (ch === VIR) { /* stray */ }
      else { o += ch; }
    }
    return o;
  }

  function dmap(s, M) { var o = ''; for (var i = 0; i < s.length; i++) { var ch = s[i]; o += (M[ch] !== undefined ? M[ch] : ch); } return o; }
  var SCRIPTS = { // key → {label, fn}
    dev: { label: 'देवनागरी' },
    iast: { label: 'IAST', fn: function (s) { return d2iast(s); } },
    kannada: { label: 'ಕನ್ನಡ', fn: function (s) { return dmap(s, KAN); } },
    tamil: { label: 'தமிழ்', fn: function (s) { return d2tamil(s); } },
    telugu: { label: 'తెలుగు', fn: function (s) { return dmap(s, TEL); } },
    malayalam: { label: 'മലയാളം', fn: function (s) { return dmap(s, MAL); } },
    bengali: { label: 'বাংলা', fn: function (s) { return dmap(s, BEN); } },
    gujarati: { label: 'ગુજરાતી', fn: function (s) { return dmap(s, GUJ); } },
    cyrillic: { label: 'Русский', fn: function (s) { return d2cyrillic(s); } },
    siddham: { label: 'Siddhaṃ 梵字', fn: function (s) { return dmap(s, SID); } },
    katakana: { label: 'カタカナ', fn: function (s) { return d2katakana(s); } }
  };
  function xlit(mode, s) { var sc = SCRIPTS[mode]; return (sc && sc.fn) ? sc.fn(s) : s; }

  // ---- reversible DOM transliteration ----
  var KEY = 'vv_script';
  var mode = SCRIPTS[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : 'dev';
  var orig = new WeakMap(); var seen = []; var obs = null, applying = false;
  function isText(n) { return n && n.nodeType === 3 && n.nodeValue && DEV.test(n.nodeValue); }
  function walk(root) { var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, out = []; while ((n = w.nextNode())) { if (DEV.test(n.nodeValue || '')) out.push(n); } return out; }
  function conv(n) { if (!orig.has(n)) { orig.set(n, n.nodeValue); seen.push(n); } var t = xlit(mode, orig.get(n)); if (n.nodeValue !== t) n.nodeValue = t; }
  function restore() { for (var i = 0; i < seen.length; i++) { var n = seen[i]; if (orig.has(n) && n.nodeValue !== orig.get(n)) n.nodeValue = orig.get(n); } }
  function applyAll() { applying = true; var ns = walk(document.body); for (var i = 0; i < ns.length; i++) conv(ns[i]); applying = false; }
  function startObs() {
    if (obs) return;
    obs = new MutationObserver(function (muts) {
      if (mode === 'dev' || applying) return; applying = true;
      for (var i = 0; i < muts.length; i++) { var m = muts[i];
        if (m.type === 'characterData') { if (isText(m.target)) conv(m.target); }
        else { for (var j = 0; j < m.addedNodes.length; j++) { var a = m.addedNodes[j]; if (isText(a)) conv(a); else if (a.nodeType === 1) { var ns = walk(a); for (var k = 0; k < ns.length; k++) conv(ns[k]); } } }
      }
      applying = false;
    });
    obs.observe(document.body, { childList: true, characterData: true, subtree: true });
  }
  function stopObs() { if (obs) { obs.disconnect(); obs = null; } }
  function setMode(m) {
    if (!SCRIPTS[m]) m = 'dev';
    mode = m; localStorage.setItem(KEY, m);
    if (document.body) document.body.classList.toggle('lipi-siddham', m === 'siddham'); // Siddhaṃ webfont scope
    if (m === 'dev') { stopObs(); restore(); } else { restore(); applyAll(); startObs(); } // restore first so switching iast→kannada re-runs from the original
    var sel = document.getElementById('scriptpick'); if (sel && sel.value !== m) sel.value = m;
  }

  // ---- picker (dropdown, next to the ◐ theme button) ----
  function mount() {
    var st = document.createElement('style');
    // Siddhaṃ needs a webfont or it renders as tofu boxes. NotoSansSiddham.woff2 is a PENDING drop-in
    // (network is blocked now) — degrades gracefully (boxes) until it lands. build_deploy must copy the
    // woff2 alongside this asset AND add it to the SW precache list.
    st.textContent = '#scriptpick{font:inherit;font-size:13px;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:5px 8px;margin-right:8px;vertical-align:middle;cursor:pointer;float:none}'
      + "@font-face{font-family:'Noto Sans Siddham';src:url('NotoSansSiddham.woff2') format('woff2');font-display:swap;}"
      + 'body.lipi-siddham,body.lipi-siddham *{font-family:\'Noto Sans Siddham\',serif;}';
    document.head.appendChild(st);
    var sel = document.createElement('select'); sel.id = 'scriptpick'; sel.title = 'Script / lipi';
    var keys = ['dev', 'iast', 'kannada', 'tamil', 'telugu', 'malayalam', 'bengali', 'gujarati', 'cyrillic', 'siddham', 'katakana'];
    sel.innerHTML = keys.map(function (k) { return '<option value="' + k + '">' + SCRIPTS[k].label + '</option>'; }).join('');
    var tog = document.getElementById('tog');
    if (tog && tog.parentNode) tog.parentNode.insertBefore(sel, tog); else document.body.insertBefore(sel, document.body.firstChild);
    sel.value = mode;
    sel.addEventListener('change', function () { setMode(sel.value); });
    setTimeout(function () { setMode(mode); }, 0); // deferred so nav.js has populated its dropdowns
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
