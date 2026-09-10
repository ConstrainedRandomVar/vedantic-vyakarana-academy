'use strict';
// Dependency-free .docx → reading-HTML importer for the shared-reading SCRATCHPAD (classroom mode).
// An instructor authors/marks up a Word (or Google-Docs → Download → .docx) file — colour-coded
// pūrvapakṣa / siddhānta / pratīka, headings for a ToC, the Mantra/ṭīkā paragraph styles — and pushes
// it in; this turns the raw OOXML into the same paper-on-white reading surface the rest of the app uses.
//
// WHY docx-OOXML and not clipboard-HTML: Word's clipboard flattens the special underlines
// (double / thick / wavyHeavy) that ARE part of the scheme. Reading the .docx zip preserves the full
// vocabulary, INCLUDING formatting that comes from NAMED STYLES (pratikaChar etc.) rather than inline
// run props — the fidelity trap that a naïve importer silently drops.
//
// Zero dependency: unzip via the browser-native DecompressionStream('deflate-raw') + a tiny ZIP reader;
// XML via DOMParser. Exposes window.VVDocx = { importDocx(arrayBuffer) -> {html, headings, warnings} }.
// (Also CommonJS-exports the ZIP helpers so the unzip half can be unit-tested under Node ≥18.)

(function (root) {
  // ------------------------------------------------------------------ ZIP reader
  // Minimal reader: End-of-Central-Directory → central directory → per-entry local header → inflate.
  function u16(dv, o) { return dv.getUint16(o, true); }
  function u32(dv, o) { return dv.getUint32(o, true); }

  function findEOCD(dv) {
    // EOCD signature 0x06054b50, within the last 65557 bytes (max comment 65535 + 22-byte record).
    var min = Math.max(0, dv.byteLength - 65557);
    for (var i = dv.byteLength - 22; i >= min; i--) {
      if (u32(dv, i) === 0x06054b50) return i;
    }
    throw new Error('Not a .docx / zip (no EOCD found)');
  }

  function centralDirectory(buf) {
    var dv = new DataView(buf);
    var eocd = findEOCD(dv);
    var count = u16(dv, eocd + 10);
    var cdOff = u32(dv, eocd + 16);
    var entries = {}, p = cdOff;
    for (var n = 0; n < count; n++) {
      if (u32(dv, p) !== 0x02014b50) break;             // central-file-header signature
      var method = u16(dv, p + 10);
      var compSize = u32(dv, p + 20);
      var nameLen = u16(dv, p + 28);
      var extraLen = u16(dv, p + 30);
      var cmtLen = u16(dv, p + 32);
      var localOff = u32(dv, p + 42);
      var name = new TextDecoder('utf-8').decode(new Uint8Array(buf, p + 46, nameLen));
      entries[name] = { method: method, compSize: compSize, localOff: localOff };
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return { buf: buf, dv: dv, entries: entries };
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream unavailable (need a modern browser / Node ≥18)');
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // read one named entry → Uint8Array (handles STORED method 0 and DEFLATE method 8)
  async function readEntry(cd, name) {
    var e = cd.entries[name];
    if (!e) return null;
    var dv = cd.dv;
    // local header is authoritative for its own name/extra lengths (may differ from central)
    if (u32(dv, e.localOff) !== 0x04034b50) throw new Error('bad local header for ' + name);
    var nameLen = u16(dv, e.localOff + 26);
    var extraLen = u16(dv, e.localOff + 28);
    var dataStart = e.localOff + 30 + nameLen + extraLen;
    var comp = new Uint8Array(cd.buf, dataStart, e.compSize);
    if (e.method === 0) return comp.slice();             // stored
    if (e.method === 8) return inflateRaw(comp);          // deflate
    throw new Error('unsupported zip method ' + e.method + ' for ' + name);
  }

  async function unzipText(arrayBuffer, name) {
    var cd = centralDirectory(arrayBuffer);
    var bytes = await readEntry(cd, name);
    return bytes ? new TextDecoder('utf-8').decode(bytes) : null;
  }

  // ------------------------------------------------------------------ OOXML → HTML
  var WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  function W(el, tag) { return el.getElementsByTagNameNS(WNS, tag); }
  function firstW(el, tag) { var l = W(el, tag); return l.length ? l[0] : null; }
  function attr(el, name) { return el ? el.getAttributeNS(WNS, name) : null; }
  // direct children only (avoid descending into nested rPr of child runs, etc.)
  function childW(el, tag) {
    var out = [];
    for (var i = 0; i < el.childNodes.length; i++) {
      var c = el.childNodes[i];
      if (c.nodeType === 1 && c.localName === tag && c.namespaceURI === WNS) out.push(c);
    }
    return out;
  }
  function firstChildW(el, tag) { var l = childW(el, tag); return l.length ? l[0] : null; }

  var UMAP = {
    single: 'text-decoration:underline',
    double: 'text-decoration:underline;text-decoration-style:double',
    thick: 'text-decoration:underline;text-decoration-thickness:3px',
    wavy: 'text-decoration:underline;text-decoration-style:wavy',
    wavyHeavy: 'text-decoration:underline;text-decoration-style:wavy;text-decoration-thickness:2px',
    dotted: 'text-decoration:underline;text-decoration-style:dotted',
    dash: 'text-decoration:underline;text-decoration-style:dashed'
  };
  var HLMAP = {
    yellow: '#fff3a3', cyan: '#a5efef', lightGray: '#e2e2e2', green: '#b6f0b6',
    magenta: '#f4b6f4', red: '#f6b0b0', darkYellow: '#e6d16b', blue: '#bcd0ff', none: null
  };
  // paragraph style → our reading class
  var PMAP = { Mantra: 'mula', tika: 'tika', 'AG-Tika': 'tika', vyakhya: 'vyakhya', avataranika: 'avataranika' };

  // ---- SEMANTIC DECODE (Harsha's scheme, 2026-09-10) ----
  // colour = ROLE; underline = orthogonal MARKER (single = mūlam lemma [any colour], double/thick/wavy =
  // saṅgraha of the colour's role). blue+underline = citation link (exception). Near-duplicate shades are
  // normalized to one role. Verbatim styling is still emitted; this only ADDS a data-role for labelling.
  var ROLE_COLOR = {
    pp: ['FF0000', 'EE0000', 'C00000'],                     // पूर्वपक्ष
    sid: ['00B050', '92D050', '70AD47'],                    // सिद्धान्त
    eka: ['7030A0'],                                        // एकदेशी
    link: ['0000FF', '0070C0', '00B0F0', '2E74B5', '4472C4'],
    mula: ['C45911']                                        // मूलम् (default orange)
  };
  function colorFamily(hex) {
    if (!hex) return null; hex = hex.toUpperCase();
    for (var k in ROLE_COLOR) if (ROLE_COLOR[k].indexOf(hex) >= 0) return k;
    return null;
  }
  // f = resolved {color,u,...} → a data-role token (or null for plain prose)
  function roleOf(f) {
    var fam = colorFamily(f.color);
    var uu = (f.u && f.u !== 'none') ? f.u : null;
    if (fam === 'link') return 'link';
    if (uu) {
      if (uu === 'single') return 'mula';                  // single underline = mūlam lemma, any colour
      return fam && fam !== 'mula' ? 'sangraha:' + fam : 'sangraha';   // double/thick/wavy = saṅgraha of role
    }
    return fam;                                            // colour alone → its role (pp/eka/sid/mula/null)
  }
  var HL_ROLE = { yellow: 'nishkarsha', cyan: 'sangati' };  // provisional (pending Harsha's confirm)

  function esc(s) { return s.replace(/[&<>]/g, function (c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; }); }

  // read colour/underline/bold/italic/highlight out of an <w:rPr>
  function readRpr(rPr) {
    var f = {};
    if (!rPr) return f;
    var c = firstW(rPr, 'color'); var cv = c && attr(c, 'val');
    if (cv && cv.toLowerCase() !== 'auto') f.color = cv;
    var u = firstW(rPr, 'u'); if (u) f.u = attr(u, 'val') || 'single';
    if (childW(rPr, 'b').length) f.b = true;
    if (childW(rPr, 'i').length) f.i = true;
    var h = firstW(rPr, 'highlight'); if (h) f.hl = attr(h, 'val');
    return f;
  }

  // resolve a character style through its basedOn chain into {color,u,b,i,hl}
  function makeStyleResolver(stylesDoc) {
    var defs = {};
    if (stylesDoc) {
      var styles = stylesDoc.getElementsByTagNameNS(WNS, 'style');
      for (var i = 0; i < styles.length; i++) {
        var s = styles[i];
        var id = attr(s, 'styleId');
        var bo = firstChildW(s, 'basedOn');
        defs[id] = { rPr: firstChildW(s, 'rPr'), basedOn: bo ? attr(bo, 'val') : null };
      }
    }
    var cache = {};
    function resolve(id, seen) {
      if (!id || !defs[id]) return {};
      if (cache[id]) return cache[id];
      seen = seen || {};
      if (seen[id]) return {};
      seen[id] = true;
      var node = defs[id], f = {};
      if (node.basedOn) Object.assign(f, resolve(node.basedOn, seen));
      Object.assign(f, readRpr(node.rPr));
      cache[id] = f;
      return f;
    }
    return resolve;
  }

  function runText(r) {
    var out = '';
    for (var i = 0; i < r.childNodes.length; i++) {
      var c = r.childNodes[i];
      if (c.nodeType === 1 && c.namespaceURI === WNS) {
        if (c.localName === 't') out += (c.textContent || '');
        else if (c.localName === 'tab') out += ' ';
        else if (c.localName === 'br' || c.localName === 'cr') out += ' ';
      }
    }
    return out;
  }

  function runHtml(r, resolve) {
    var txt = runText(r);
    if (!txt) return '';
    var f = {}, rPr = firstChildW(r, 'rPr');
    if (rPr) {
      var rs = firstChildW(rPr, 'rStyle');
      if (rs) Object.assign(f, resolve(attr(rs, 'val')));
      Object.assign(f, readRpr(rPr));            // direct props override the style
    }
    var st = [];
    if (f.color) st.push('color:#' + f.color);
    if (f.u && f.u !== 'none') st.push(UMAP[f.u] || 'text-decoration:underline');
    if (f.b) st.push('font-weight:700');
    if (f.i) st.push('font-style:italic');
    if (f.hl && f.hl !== 'none') { var h = HLMAP[f.hl] !== undefined ? HLMAP[f.hl] : f.hl; if (h) st.push('background:' + h); }
    // additive semantic annotation (verbatim visual styling above is untouched)
    var attrs = '';
    var role = roleOf(f); if (role) attrs += ' data-role="' + role + '"';
    if (f.hl && HL_ROLE[f.hl]) attrs += ' data-hl="' + HL_ROLE[f.hl] + '"';
    var e = esc(txt);
    return (st.length || attrs) ? '<span' + (st.length ? ' style="' + st.join(';') + '"' : '') + attrs + '>' + e + '</span>' : e;
  }

  function paraPlain(p) {
    var ts = W(p, 't'), s = '';
    for (var i = 0; i < ts.length; i++) s += (ts[i].textContent || '');
    return s.trim();
  }

  function importDocxFromXml(documentXml, stylesXml) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(documentXml, 'application/xml');
    var stylesDoc = stylesXml ? parser.parseFromString(stylesXml, 'application/xml') : null;
    if (doc.getElementsByTagName('parsererror').length) throw new Error('document.xml parse error');
    var resolve = makeStyleResolver(stylesDoc);
    var body = firstW(doc, 'body');
    if (!body) throw new Error('no <w:body>');

    var parts = [], headings = [], hn = 0, warnings = [];
    var paras = childW(body, 'p');
    for (var i = 0; i < paras.length; i++) {
      var p = paras[i];
      var pPr = firstChildW(p, 'pPr'), sv = null;
      if (pPr) { var ps = firstChildW(pPr, 'pStyle'); if (ps) sv = attr(ps, 'val'); }
      var runs = childW(p, 'r');
      // also include runs nested in hyperlinks (w:hyperlink > w:r)
      var hls = childW(p, 'hyperlink');
      for (var h = 0; h < hls.length; h++) runs = runs.concat(childW(hls[h], 'r'));
      var inner = '';
      for (var j = 0; j < runs.length; j++) inner += runHtml(runs[j], resolve);
      var plain = paraPlain(p);

      if (sv === 'Heading1' || sv === 'Heading2' || sv === 'Heading3') {
        if (!plain) continue;
        var lvl = +sv.slice(-1), hid = 'sec-' + (hn++);
        headings.push({ level: lvl, id: hid, text: plain });
        parts.push('<h' + lvl + ' id="' + hid + '">' + inner + '</h' + lvl + '>');
      } else if (PMAP[sv]) {
        parts.push('<p class="' + PMAP[sv] + '">' + inner + '</p>');
      } else {
        if (!plain && !inner.trim()) continue;
        parts.push('<p class="bh">' + inner + '</p>');
      }
    }
    if (!headings.length) warnings.push('No Heading 1/2/3 paragraphs found — the Contents panel will be empty.');
    return { html: parts.join('\n'), headings: headings, warnings: warnings };
  }

  async function importDocx(arrayBuffer) {
    var cd = centralDirectory(arrayBuffer);
    var docBytes = await readEntry(cd, 'word/document.xml');
    if (!docBytes) throw new Error('word/document.xml missing — not a Word document');
    var stylesBytes = await readEntry(cd, 'word/styles.xml');
    var dec = new TextDecoder('utf-8');
    return importDocxFromXml(dec.decode(docBytes), stylesBytes ? dec.decode(stylesBytes) : null);
  }

  var API = { importDocx: importDocx, importDocxFromXml: importDocxFromXml, unzipText: unzipText, centralDirectory: centralDirectory, readEntry: readEntry };
  if (root) root.VVDocx = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : null);
