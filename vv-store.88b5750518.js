// vv-store.js — the ONE personal-data store shared by every site on constrainedrandomvar.github.io (the academy
// स्वाध्याय-दीपिका, its public twin, साहित्य-व्याकरणम्, and the prasthanatrayi-search page). localStorage is per-ORIGIN,
// so all of them read and write the same keys: a passage bookmarked from search shows up in the academy's library.
// Everything stays in the reader's browser; nothing is sent anywhere. Export/Import (and share links) are the backup.
//
// Rules that keep sister sites from tripping over each other (Harsha 2026-10-11):
//   • every key is namespaced `vvd1:` and every record carries `site` + an ABSOLUTE `url`;
//   • a page does in-page work (markers, scroll targets) only for records whose `site` is its own — sister-site
//     records are listed as plain cards (title · excerpt · note · link), never parsed;
//   • unknown fields / unknown record kinds are preserved untouched (forward compatibility), never dropped.
//
// API: window.VVStore — bookmarks · collections · notes · history · prefs · folds · exportAll/importAll · share.
(function (root) {
  'use strict';
  var NS = 'vvd1:';
  var K = { bm: NS + 'bookmarks', col: NS + 'collections', notes: NS + 'notes', hist: NS + 'searchHistory', prefs: NS + 'prefs', site: NS + 'lastSite' };
  var HIST_MAX = 30;

  // ---- site identity (first path segment on github.io; anything else = local dev) ----
  var SITES = { 'vedantic-vyakarana-academy': 'academy', 'svadhyaya-dipika': 'public', 'sahitya-vyakaranam': 'sahitya', 'prasthanatrayi-search': 'search' };
  var SITE_NAMES = { academy: 'स्वाध्याय-दीपिका', public: 'स्वाध्याय-दीपिका (public)', sahitya: 'साहित्य-व्याकरणम्', search: 'अन्वेषण · search', local: 'local' };
  function siteOf(href) {
    try {
      var u = new URL(href, root.location && root.location.href);
      var seg = u.pathname.split('/')[1] || '';
      return SITES[seg] || 'local';
    } catch (e) { return 'local'; }
  }
  var SITE = root.location ? siteOf(root.location.href) : 'local';
  function siteBase() {   // e.g. https://constrainedrandomvar.github.io/vedantic-vyakarana-academy/
    if (!root.location) return '';
    var p = root.location.pathname, seg = p.split('/')[1] || '';
    return root.location.origin + (SITES[seg] ? '/' + seg + '/' : p.replace(/[^/]*$/, ''));
  }

  // ---- raw JSON storage (never throws: private mode / quota just degrade to in-memory) ----
  var mem = {};
  function load(key, dflt) {
    try { var s = root.localStorage.getItem(key); if (s) return JSON.parse(s); } catch (e) { if (mem[key]) return JSON.parse(mem[key]); }
    return dflt;
  }
  function save(key, val) {
    var s = JSON.stringify(val);
    try { root.localStorage.setItem(key, s); } catch (e) { mem[key] = s; }
    fire(key);
  }
  var subs = [];
  function fire(key) { for (var i = 0; i < subs.length; i++) try { subs[i](key); } catch (e) {} }
  if (root.addEventListener) root.addEventListener('storage', function (e) { if (e.key && e.key.indexOf(NS) === 0) fire(e.key); });
  function onChange(cb) { subs.push(cb); return function () { subs = subs.filter(function (f) { return f !== cb; }); }; }

  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function now() { return new Date().toISOString(); }
  function absUrl(u) { try { return new URL(u, root.location && root.location.href).href; } catch (e) { return u; } }
  function db(key) { var d = load(key, null); if (!d || typeof d !== 'object') d = { v: 1, items: {} }; if (!d.items) d.items = {}; return d; }

  // ---- bookmarks: { id, site, url, title, ref, excerpt, note, src:'reading'|'search', query, created, updated } ----
  var bookmarks = {
    list: function () { var d = db(K.bm), a = []; for (var k in d.items) a.push(d.items[k]); return a.sort(function (x, y) { return (y.created || '').localeCompare(x.created || ''); }); },
    get: function (id) { return db(K.bm).items[id] || null; },
    find: function (url, excerpt) {   // same place + same excerpt = same bookmark (re-☆ doesn't duplicate)
      url = absUrl(url); var d = db(K.bm);
      for (var k in d.items) { var b = d.items[k]; if (b.url === url && (b.excerpt || '') === (excerpt || '')) return b; }
      return null;
    },
    add: function (b) {
      var ex = bookmarks.find(b.url, b.excerpt); if (ex) return ex.id;
      var d = db(K.bm), id = uid('b'), url = absUrl(b.url);
      d.items[id] = Object.assign({}, b, { id: id, url: url, site: b.site || siteOf(url), created: now(), updated: now() });
      save(K.bm, d); return id;
    },
    update: function (id, patch) { var d = db(K.bm); if (!d.items[id]) return; Object.assign(d.items[id], patch, { updated: now() }); save(K.bm, d); },
    remove: function (id) {
      var d = db(K.bm); delete d.items[id]; save(K.bm, d);
      var c = db(K.col), touched = false;
      for (var k in c.items) { var it = c.items[k].items || []; var j = it.indexOf(id); if (j >= 0) { it.splice(j, 1); touched = true; } }
      if (touched) save(K.col, c);
    },
  };

  // ---- collections: { id, name, items:[bookmarkId…] (ordered), created, updated } — a bookmark may sit in several ----
  var collections = {
    list: function () { var d = db(K.col), a = []; for (var k in d.items) a.push(d.items[k]); return a.sort(function (x, y) { return (x.name || '').localeCompare(y.name || ''); }); },
    get: function (id) { return db(K.col).items[id] || null; },
    byName: function (name) { var d = db(K.col); for (var k in d.items) if (d.items[k].name === name) return d.items[k]; return null; },
    create: function (name) { var ex = collections.byName(name); if (ex) return ex.id; var d = db(K.col), id = uid('c'); d.items[id] = { id: id, name: name, items: [], created: now(), updated: now() }; save(K.col, d); return id; },
    rename: function (id, name) { var d = db(K.col); if (!d.items[id]) return; d.items[id].name = name; d.items[id].updated = now(); save(K.col, d); },
    remove: function (id) { var d = db(K.col); delete d.items[id]; save(K.col, d); },   // bookmarks themselves stay
    addItem: function (id, bid) { var d = db(K.col), c = d.items[id]; if (!c) return; c.items = c.items || []; if (c.items.indexOf(bid) < 0) { c.items.push(bid); c.updated = now(); save(K.col, d); } },
    removeItem: function (id, bid) { var d = db(K.col), c = d.items[id]; if (!c) return; var j = (c.items || []).indexOf(bid); if (j >= 0) { c.items.splice(j, 1); c.updated = now(); save(K.col, d); } },
    move: function (id, bid, to) { var d = db(K.col), c = d.items[id]; if (!c) return; var j = c.items.indexOf(bid); if (j < 0) return; c.items.splice(j, 1); c.items.splice(Math.max(0, Math.min(to, c.items.length)), 0, bid); c.updated = now(); save(K.col, d); },
    of: function (bid) { return collections.list().filter(function (c) { return (c.items || []).indexOf(bid) >= 0; }); },
    unsorted: function () { var inAny = {}; collections.list().forEach(function (c) { (c.items || []).forEach(function (b) { inAny[b] = 1; }); }); return bookmarks.list().filter(function (b) { return !inAny[b.id]; }); },
  };

  // ---- study notes, one per verse: key = site|page|ref ; { key, site, url, page, ref, title, text, updated } ----
  function noteKey(page, ref) { return SITE + '|' + page + '|' + ref; }
  var notes = {
    key: noteKey,
    get: function (key) { return db(K.notes).items[key] || null; },
    set: function (key, rec) {
      var d = db(K.notes);
      if (!rec.text || !String(rec.text).trim()) { if (d.items[key]) { delete d.items[key]; save(K.notes, d); } return; }
      d.items[key] = Object.assign({}, d.items[key] || {}, rec, { key: key, site: rec.site || SITE, url: absUrl(rec.url), updated: now() });
      save(K.notes, d);
    },
    remove: function (key) { var d = db(K.notes); delete d.items[key]; save(K.notes, d); },
    list: function () { var d = db(K.notes), a = []; for (var k in d.items) a.push(d.items[k]); return a.sort(function (x, y) { return (y.updated || '').localeCompare(x.updated || ''); }); },
    onPage: function (page) { return notes.list().filter(function (n) { return n.site === SITE && n.page === page; }); },
  };

  // ---- search history (newest first, max 30, deduped by query+filters) : { q, filters, label, ts } ----
  var history = {
    list: function () { var h = load(K.hist, []); return Array.isArray(h) ? h : []; },
    push: function (e) {
      if (!e || !String(e.q || '').trim()) return;
      var sig = JSON.stringify([e.q, e.filters || null]);
      var h = history.list().filter(function (x) { return JSON.stringify([x.q, x.filters || null]) !== sig; });
      h.unshift(Object.assign({}, e, { ts: now() }));
      save(K.hist, h.slice(0, HIST_MAX));
    },
    remove: function (i) { var h = history.list(); h.splice(i, 1); save(K.hist, h); },
    clear: function () { save(K.hist, []); },
  };

  // ---- prefs (small key→value bag shared across sites, e.g. fold defaults) ----
  var prefs = {
    get: function (k, dflt) { var p = load(K.prefs, {}); return (p && k in p) ? p[k] : dflt; },
    set: function (k, v) { var p = load(K.prefs, {}) || {}; p[k] = v; save(K.prefs, p); },
  };

  // ---- FOLD REGISTRY: every commentary layer collapsed by default (CLAUDE.md fold rule). Each gets a ⚙ Collapsed/
  // Expanded default + a per-page control. Page furniture (About / legend / contents) is deliberately NOT here.
  // A NEW collapsed-by-default text layer must be added here or assert_reading_conventions fails. ----
  var FOLDS = [
    { key: 'brha-shastraprakashika', label: 'शास्त्रप्रकाशिका', sub: 'वार्तिक-टीका · Bṛhad', selector: 'details.vk-tk:not(.vs-tk):not(.vs-fold)' },
    { key: 'brha-laghusangraha', label: 'लघुसङ्ग्रहा टीका', sub: 'वार्तिकसार-टीका · Bṛhad', selector: 'details.vs-tk' },
    { key: 'brha-vartikasara', label: 'वार्तिकसारः', sub: 'block (with its ṭīkā) · Bṛhad', selector: 'details.vs-fold' },
  ];
  var folds = {
    list: function () { return FOLDS.slice(); },
    get: function (key) { return prefs.get('fold:' + key, 'collapsed'); },   // 'collapsed' | 'expanded'
    set: function (key, v) { prefs.set('fold:' + key, v === 'expanded' ? 'expanded' : 'collapsed'); },
  };

  // remember which reading site the reader last used, so the shared search page links results back to THAT site
  function rememberSite() { if (SITE !== 'search' && SITE !== 'local') { try { root.localStorage.setItem(K.site, JSON.stringify({ site: SITE, base: siteBase() })); } catch (e) {} } }
  function lastSite() { return load(K.site, null); }

  // ---- export / import (backup + device transfer). Import MERGES: same id → newer `updated` wins; nothing deleted ----
  function exportAll() {
    return { kind: 'vvd-export', v: 1, exported: now(), bookmarks: db(K.bm), collections: db(K.col), notes: db(K.notes), searchHistory: history.list() };
  }
  function importAll(o) {
    if (!o || o.kind !== 'vvd-export') throw new Error('not a स्वाध्याय-दीपिका export file');
    var n = 0;
    [['bookmarks', K.bm], ['collections', K.col], ['notes', K.notes]].forEach(function (p) {
      var src = (o[p[0]] || {}).items || {}, d = db(p[1]);
      for (var k in src) { var a = d.items[k], b = src[k]; if (!a || (b.updated || '') > (a.updated || '')) { d.items[k] = b; n++; } }
      save(p[1], d);
    });
    (o.searchHistory || []).slice().reverse().forEach(function (e) { history.push(e); });
    return n;
  }

  // ---- share links: a collection → a self-contained snapshot in the URL fragment (deflate + base64url; no server) ----
  function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function pipe(bytes, Stream, mode) { return new Response(new Blob([bytes]).stream().pipeThrough(new Stream(mode))).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function snapshot(id) {
    var c = collections.get(id); if (!c) return null;
    return { kind: 'vvd-collection', v: 1, name: c.name, items: (c.items || []).map(bookmarks.get).filter(Boolean).map(function (b) {
      return { url: b.url, site: b.site, title: b.title, ref: b.ref, excerpt: b.excerpt, note: b.note, src: b.src, query: b.query };
    }) };
  }
  function encodeShare(id) {
    var snap = snapshot(id); if (!snap) return Promise.reject(new Error('no such collection'));
    var bytes = new TextEncoder().encode(JSON.stringify(snap));
    if (typeof CompressionStream === 'undefined') return Promise.resolve('j' + b64u(bytes));
    return pipe(bytes, CompressionStream, 'deflate-raw').then(function (z) { return 'z' + b64u(z); });
  }
  function decodeShare(code) {
    var kind = code.charAt(0), bytes = unb64u(code.slice(1));
    var p = kind === 'z' ? pipe(bytes, DecompressionStream, 'deflate-raw') : Promise.resolve(bytes);
    return p.then(function (b) { var o = JSON.parse(new TextDecoder().decode(b)); if (!o || o.kind !== 'vvd-collection') throw new Error('not a shared collection'); return o; });
  }
  // save a shared snapshot: mode 'new' (always a fresh collection; name gets a suffix if taken) | 'merge' (into same-named)
  function importShared(snap, mode) {
    var name = snap.name || 'shared';
    var id;
    if (mode === 'merge' && collections.byName(name)) id = collections.byName(name).id;
    else { var nm = name, i = 2; while (collections.byName(nm)) nm = name + ' (' + (i++) + ')'; id = collections.create(nm); }
    (snap.items || []).forEach(function (it) { var bid = bookmarks.add(it); if (it.note && !bookmarks.get(bid).note) bookmarks.update(bid, { note: it.note }); collections.addItem(id, bid); });
    return id;
  }

  root.VVStore = {
    NS: NS, SITE: SITE, SITE_NAMES: SITE_NAMES, siteOf: siteOf, siteBase: siteBase, rememberSite: rememberSite, lastSite: lastSite,
    bookmarks: bookmarks, collections: collections, notes: notes, history: history, prefs: prefs, folds: folds,
    exportAll: exportAll, importAll: importAll, encodeShare: encodeShare, decodeShare: decodeShare, importShared: importShared, snapshot: snapshot,
    onChange: onChange,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VVStore;
})(typeof window !== 'undefined' ? window : globalThis);
