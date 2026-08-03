// Minimal cache-first service worker — makes the quiz fully usable offline after first load.
// Bump CACHE_NAME whenever a shipped file changes so clients pick up the new version.
const CACHE_NAME = 'sandhi-quiz-v22';
const ASSETS = ['./', './index.html', './app.js', './pratipadika_endings.js', './quiz-items.js', './manifest.json', './walk-manifest.js', './walk-data-Gita-4.js'];

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
