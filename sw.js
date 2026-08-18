// Minimal cache-first service worker — makes the quiz fully usable offline after first load.
// Bump CACHE_NAME whenever a shipped file changes so clients pick up the new version.
const CACHE_NAME = 'sandhi-quiz-v79';
// axis-data-*.js (vibhakti/kāraka/meaning/ABT lazy pools) are deliberately NOT precached here —
// same lazy-fetched-on-demand treatment as walk-data-<chapter>.js below; the generic fetch handler
// caches them reactively the first time a learner actually opens that node. axis-manifest.js IS
// precached — it's tiny and needed unconditionally on every load (index.html references it
// directly), same tier as walk-manifest.js. tutorial-manifest.js gets the same eager treatment;
// tutorial-data-Gita.js stays lazy/reactive like walk-data-*.js/axis-data-*.js.
const ASSETS = ['./', './index.html', './app.js', './pratipadika_endings.js', './quiz-items.js', './axis-manifest.js', './tutorial-manifest.js', './manifest.json', './walk-manifest.js', './walk-data-Gita-4.js', './flagged-wrong.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return res;
    }).catch(() => cached))
  );
});
