// vv-sync.js — sync of the reader's personal data (bookmarks · collections · notes · highlights) with THEIR OWN Google Drive.
// Revived 2026-11-06 (Harsha): sign in once per device → it keeps syncing, indefinitely, in both directions.
//
// • Storage: one JSON file in Drive's hidden appDataFolder (scope drive.appdata — Google-classified non-sensitive; only this app
//   can see the folder, the reader's other files are out of reach). The browser reads/writes Drive DIRECTLY; the data never
//   passes through a server of ours.
// • Staying signed in: Google gives a browser only ~1 h tokens, so sign-in uses the authorization-CODE flow; the code is traded
//   by our tiny token broker (Cloudflare Worker, corpus/sync-token-broker/) for an access token + the refresh token ENCRYPTED
//   with a key only the broker has (`vvsync:rt`, kept here). Before each expiry the page swaps `rt` for a fresh access token —
//   no pop-up, no click. The broker stores nothing and never sees the data. Re-sign-in is needed only when the reader removed
//   the app's access in Google, the grant lapsed (6 months unused), or the browser wiped site storage (Safari, 7 days unvisited).
// • Merge = VVStore.mergeData (per record newer `updated` wins; deletions travel as tombstones) — convergent, so two devices
//   writing at once still end up equal at their next sync.
// • When: 3 s after a change made in this browser; every 30 s while a page is visible (cheap version check, download only when
//   the Drive file changed); on focus / return to the tab; on load. One tab does the work at a time (Web Locks), all tabs repaint.
// Privacy: privacy.html. Loaded by vv-store.js where sync is on (or a sign-in is finishing) and by the ⚙ panel.
(function () {
  'use strict';
  if (window.VVSync) return;
  var S = window.VVStore; if (!S) return;
  var CLIENT_ID = '752580038769-nsv0hauufre79iak2ph26ekgn6idafm3.apps.googleusercontent.com';   // public by design (Harsha's GCP project)
  var BROKER = window.VV_SYNC_BROKER || 'https://vv-sync-broker.adhyayana-sahakari.workers.dev';   // corpus/sync-token-broker (Harsha's Cloudflare, 2026-11-06)
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var FILE = 'adhyayana-sahakari-sync.json';
  var DRIVE = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  var PULL_MS = window.VV_SYNC_PULL_MS || 30000, PUSH_DELAY = 3000;   // override only for the two-browser test
  // localStorage keys (shared by every site on this origin, like the data itself)
  var K = { on: 'vvsync:on', rt: 'vvsync:rt', at: 'vvsync:at', last: 'vvsync:last', who: 'vvsync:who', ver: 'vvsync:ver', fid: 'vvsync:fid',
    dirty: 'vvsync:dirty', reauth: 'vvsync:reauth', pulled: 'vvsync:pulled', auth: 'vvsync:auth', code: 'vvsync:code', nodrive: 'vvsync:nodrive' };
  var DATA_KEYS = ['bookmarks', 'collections', 'notes', 'highlights', 'tombstones'].map(function (k) { return S.NS + k; });

  function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function jget(k) { try { return JSON.parse(lget(k) || 'null'); } catch (e) { return null; } }
  function withLock(name, fn) {   // one tab at a time (Web Locks; everywhere since 2022) — else just run
    if (navigator.locks && navigator.locks.request) return navigator.locks.request('vvsync-' + name, fn);
    return Promise.resolve().then(fn);
  }
  function Reauth(msg) { var e = new Error(msg || 'sign in again to resume sync'); e.reauth = true; return e; }
  // Google's consent page can show Drive access as a checkbox; left unticked, the token can't touch Drive (reader report 2026-11-07).
  // Caught at sign-in (the granted `scope` lacks drive.appdata → sync is NOT turned on) and, as a backstop, on a Drive 403
  // "insufficient scope" (→ paused). Either way the reader is told exactly what to do, never a bare "Drive 403".
  var NO_DRIVE = 'Google Drive access was not given. Sign in again and, on Google’s page, tick the box that lets this site use its own folder in your Drive.';

  // ---- status ----
  var listeners = [], busyNow = false;
  function status() {
    var on = lget(K.on) === '1', re = lget(K.reauth) === '1';
    return { on: on, signedIn: on && !!lget(K.rt) && !re, reauth: on && (re || !lget(K.rt)), busy: busyNow, last: jget(K.last), who: lget(K.who) || '', dirty: lget(K.dirty) === '1', noDrive: lget(K.nodrive) === '1', noDriveMsg: NO_DRIVE };
  }
  function emit() { var st = status(); listeners.forEach(function (f) { try { f(st); } catch (e) {} }); }
  function setLast(ok, msg) { lset(K.last, JSON.stringify({ ts: new Date().toISOString(), ok: ok, msg: msg || '' })); emit(); }
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key.indexOf('vvsync:') !== 0) return;
    emit();
    if (e.key === K.code && e.newValue) finishPending();
    // the sign-in finished in ANOTHER tab (e.g. the pop-up fell back to loading the site): settle this tab's waiting promise too
    if (pending && e.key === K.rt && e.newValue) { clearTimeout(pending.timer); var p = pending; pending = null; p.resolve(true); }
  });

  // ---- broker ----
  function broker(path, body) {
    return fetch(BROKER + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'vvsync' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.__status = r.status; return j; }); });
  }
  function keepToken(j) {
    lset(K.at, JSON.stringify({ t: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }));
    if (j.rt) lset(K.rt, j.rt);
  }
  // a valid access token: the stored one if it has > 5 min left, else a silent refresh (one tab refreshes, the others reuse it)
  function getToken(force) {
    var at = jget(K.at);
    if (!force && at && at.exp > Date.now() + 300000) return Promise.resolve(at.t);
    return withLock('token', function () {
      var a2 = jget(K.at);
      if (a2 && a2.exp > Date.now() + 300000 && (!force || !at || a2.t !== at.t)) return a2.t;   // another tab just refreshed
      var rt = lget(K.rt); if (!rt) throw Reauth();
      return broker('/refresh', { rt: rt }).then(function (j) {
        if (j.__status === 200 && j.access_token) { keepToken(j); lset(K.reauth, null); return j.access_token; }
        if (j.__status === 401) { lset(K.at, null); lset(K.reauth, '1'); emit(); throw Reauth(); }
        throw new Error('sync service busy — will retry');
      });
    });
  }

  // ---- sign-in (from a click): Google's consent page in a pop-up (or this window on an iOS home-screen app / blocked pop-up) →
  // oauth-callback.html drops the code in localStorage → we trade it at the broker. prompt=consent + access_type=offline make
  // Google issue a refresh token EVERY time (else a second device would get none). ----
  function callbackUrl() { return (S.siteBase() || location.href.replace(/[^/]*$/, '')) + 'oauth-callback.html'; }
  var pending = null;   // {resolve, reject, timer} of an in-flight pop-up sign-in
  function signIn() {
    var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    var standalone = navigator.standalone === true;
    var url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: callbackUrl(), response_type: 'code',
      scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: state }).toString();
    lset(K.code, null);
    var w = null;
    if (!standalone) { lset(K.auth, JSON.stringify({ state: state, ret: location.href, mode: 'popup', ts: Date.now() })); w = window.open(url, 'vvsync-auth', 'width=520,height=680'); }
    if (!w) {   // whole-window round trip; vv-store loads us again on return and finishPending() completes it
      lset(K.auth, JSON.stringify({ state: state, ret: location.href, mode: 'redirect', ts: Date.now() }));
      location.href = url; return new Promise(function () {});
    }
    if (pending) pending.reject(new Error('sign-in restarted'));
    return new Promise(function (res, rej) {
      pending = { resolve: res, reject: rej, timer: setTimeout(function () { pending = null; rej(new Error('sign-in timed out')); }, 300000) };
      var poll = setInterval(function () { if (!pending) return clearInterval(poll); if (lget(K.code)) { clearInterval(poll); finishPending(); } }, 700);   // storage event backup
    });
  }
  function finishPending() {
    return withLock('auth', function () {
      var rec = jget(K.code), auth = jget(K.auth);
      if (!rec) return null;
      lset(K.code, null);   // taken — no other tab tries the same one-time code
      var done = function (err, v) { if (pending) { clearTimeout(pending.timer); var p = pending; pending = null; err ? p.reject(err) : p.resolve(v); } else if (err) setLast(false, err.message); return v; };
      if (!auth || rec.state !== auth.state || Date.now() - rec.ts > 600000) return done(new Error('sign-in expired — try again'));
      lset(K.auth, null);
      if (rec.error || !rec.code) return done(new Error(rec.error === 'access_denied' ? 'sign-in cancelled' : 'sign-in failed: ' + (rec.error || 'no code')));
      return broker('/exchange', { code: rec.code, redirect_uri: callbackUrl() }).then(function (j) {
        if (j.__status !== 200 || !j.access_token || !j.rt) throw new Error('sign-in failed (' + (j.error || j.__status) + ')');
        if (j.scope && String(j.scope).split(/\s+/).indexOf(SCOPE) < 0) { lset(K.nodrive, '1'); emit(); throw new Error(NO_DRIVE); }   // Drive box left unticked: keep nothing, stay off
        lset(K.nodrive, null);
        keepToken(j); lset(K.on, '1'); lset(K.reauth, null); lset(K.dirty, '1'); emit();
        whoAmI(); return syncNow().then(function () { return done(null, true); });
      }).catch(function (e) { return done(e); });
    });
  }

  // ---- Drive REST (appDataFolder) — every call retries once with a forced refresh on 401 ----
  function api(url, opt, retried) {
    return getToken(!!retried).then(function (t) {
      var o = Object.assign({}, opt || {}); o.headers = Object.assign({ Authorization: 'Bearer ' + t }, (opt && opt.headers) || {});
      return fetch(url, o).then(function (r) {
        if (r.status === 401 && !retried) { lset(K.at, null); return api(url, opt, true); }
        if (r.status === 401) throw Reauth();
        if (r.status === 403) return r.text().then(function (x) {
          if (/insufficient|SCOPE_INSUFFICIENT/i.test(x)) { lset(K.nodrive, '1'); lset(K.reauth, '1'); lset(K.at, null); emit(); throw Reauth(NO_DRIVE); }
          var e = new Error('Drive 403: ' + x.slice(0, 160)); e.status = 403; throw e;
        });
        if (!r.ok) return r.text().then(function (x) { var e = new Error('Drive ' + r.status + ': ' + x.slice(0, 160)); e.status = r.status; throw e; });
        return r;
      });
    });
  }
  function listFiles() {
    var q = encodeURIComponent("name='" + FILE + "' and trashed=false");
    return api(DRIVE + '?spaces=appDataFolder&orderBy=createdTime&fields=files(id,version,modifiedTime)&q=' + q).then(function (r) { return r.json(); }).then(function (j) { return j.files || []; });
  }
  function readFile(id) { return api(DRIVE + '/' + id + '?alt=media').then(function (r) { return r.json(); }).catch(function (e) { if (e.status === 404) return null; throw e; }); }
  function writeFile(id, data) {
    var body = JSON.stringify(data);
    if (id) return api(UPLOAD + '/' + id + '?uploadType=media&fields=id,version', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: body }).then(function (r) { return r.json(); });
    var b = 'vvsync' + Date.now(), meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
    var multi = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta + '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + body + '\r\n--' + b + '--';
    return api(UPLOAD + '?uploadType=multipart&fields=id,version', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: multi }).then(function (r) { return r.json(); });
  }
  function delFile(id) { return api(DRIVE + '/' + id, { method: 'DELETE' }).catch(function (e) { if (e.status !== 404) throw e; }); }
  function whoAmI() {   // best effort, for the "synced as …" line (drive.appdata may read about.user)
    return api('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)').then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.user && j.user.emailAddress) { lset(K.who, j.user.emailAddress); emit(); } }).catch(function () {});
  }

  // ---- the sync: Drive ⊕ local → both. `pullOnly` = skip the download when the Drive file is unchanged and nothing is dirty ----
  var applying = false, inflight = null;
  function norm(x) { return JSON.stringify(S.mergeData(x, {})); }
  function syncNow(pullOnly) {
    if (lget(K.on) !== '1') return Promise.resolve(false);
    if (inflight) return inflight;
    busyNow = true; emit();
    inflight = withLock('run', function () {
      lset(K.pulled, String(Date.now()));
      return listFiles().then(function (files) {
        var top = files[0];
        if (pullOnly && top && String(top.version) === lget(K.ver) && lget(K.dirty) !== '1') return 'same';
        lset(K.dirty, null);   // cleared BEFORE the snapshot: a change made while we work sets it again → next round
        return Promise.all(files.map(function (f) { return readFile(f.id); })).then(function (remotes) {
          var good = remotes.filter(function (r) { return r && r.kind === 'vvd-sync'; });
          var merged = S.mergeData(S.syncSnapshot(), null);
          good.forEach(function (r) { merged = S.mergeData(merged, r); });
          applying = true; try { S.applySnapshot(merged); } finally { applying = false; }
          var needWrite = !top || files.length > 1 || !good.length || norm(good[0]) !== norm(merged) || remotes[0] !== good[0];
          if (!needWrite) { lset(K.ver, String(top.version)); lset(K.fid, top.id); return 'pulled'; }
          merged.synced = new Date().toISOString();
          return writeFile(top && top.id, merged).then(function (res) {
            lset(K.ver, String(res.version)); lset(K.fid, res.id);
            // two devices created the file at the same moment: everything is merged into the oldest, the extras go
            return Promise.all(files.slice(1).map(function (f) { return delFile(f.id); })).then(function () { return 'pushed'; });
          });
        });
      });
    }).then(function (r) { setLast(true); if (!lget(K.who)) whoAmI(); return r; })
      .catch(function (e) {
        lset(K.dirty, '1');   // whatever failed, local edits stay queued for the next round (or the next sign-in)
        setLast(false, e.message); return false;
      })
      .then(function (r) { inflight = null; busyNow = false; emit(); return r; });
    return inflight;
  }

  // ---- turn off (THIS device only: forget the tokens; the Drive copy and other devices carry on) · delete the Drive copy ----
  function disable() {
    [K.on, K.rt, K.at, K.last, K.who, K.ver, K.fid, K.dirty, K.reauth, K.pulled, K.nodrive].forEach(function (k) { lset(k, null); });
    emit();
  }
  function deleteRemote() {
    return listFiles().then(function (fs) { return Promise.all(fs.map(function (f) { return delFile(f.id); })); })
      .then(function () { lset(K.ver, null); lset(K.fid, null); setLast(true, 'Drive copy deleted'); return true; });
  }

  // ---- schedule ----
  var pushT = null;
  S.onChange(function (key, external) {   // only edits made in THIS tab (other tabs' writes arrive as `external`; their tab syncs them)
    if (applying || external || DATA_KEYS.indexOf(key) < 0) return;
    lset(K.dirty, '1');
    if (lget(K.on) !== '1') return;
    clearTimeout(pushT); pushT = setTimeout(function () { syncNow(false); }, PUSH_DELAY);
  });
  function tick(minGap) {   // a pull, unless the page is hidden or any tab pulled within minGap
    if (lget(K.on) !== '1' || !lget(K.rt) || lget(K.reauth) === '1' || document.hidden) return;
    if (Date.now() - (+lget(K.pulled) || 0) < minGap) return;
    syncNow(true);
  }
  document.addEventListener('visibilitychange', function () { tick(5000); });
  window.addEventListener('focus', function () { tick(5000); });
  window.addEventListener('online', function () { tick(0); });
  setInterval(function () { tick(PULL_MS - 3000); }, PULL_MS);
  setTimeout(function () { if (lget(K.code)) finishPending(); else tick(3000); }, 600);

  // ---- "sync paused" nudge: once per visit, when Google needs the reader to sign in again ----
  function nudge() {
    var st = status(); if (!st.on || !st.reauth || !document.body) return;
    try { if (sessionStorage.getItem('vvsync:nudged')) return; sessionStorage.setItem('vvsync:nudged', '1'); } catch (e) {}
    var b = document.createElement('button'); b.type = 'button'; b.id = 'vvsync-nudge';
    b.textContent = st.noDrive ? '☁ Sync paused — sign in again and tick the Drive box' : '☁ Sync paused — sign in again'; b.title = (st.noDrive ? NO_DRIVE + ' ' : '') + 'Your bookmarks, highlights and notes are safe here and in your Google Drive. Sign in to resume syncing.';
    b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;padding:8px 14px;border-radius:18px;border:1px solid #d97706;background:#fff7ed;color:#9a3412;font:14px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)';
    b.onclick = function () { b.remove(); signIn().catch(function (e) { alert(e.message); }); };
    var x = setTimeout(function () { b.remove(); }, 20000); b.addEventListener('mouseenter', function () { clearTimeout(x); });
    document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(nudge, 1500); }); else setTimeout(nudge, 1500);

  function enable() { return signIn(); }
  window.VVSync = { status: status, enable: enable, signIn: signIn, syncNow: function () { return syncNow(false); }, disable: disable, deleteRemote: deleteRemote,
    onStatus: function (f) { listeners.push(f); return function () { listeners = listeners.filter(function (x) { return x !== f; }); }; },
    _test: { getToken: getToken, finishPending: finishPending, K: K } };
})();
