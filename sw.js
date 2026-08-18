// NETWORK-FIRST service worker (Harsha, 2026-08-18: "always force full reload during churn — never
// mind slowness"). When online we ALWAYS take the freshest file from the network, so a new deploy is
// never masked by a stale cache; the cache is populated reactively and used ONLY as an offline
// fallback. Combined with index.html's controllerchange auto-reload + updateViaCache:'none'
// registration, a new deploy is picked up automatically on the next load with no manual cache-clear.
// (Trade-off: every online load waits on the network — accepted for now.) Bump CACHE_NAME on deploy.
const CACHE_NAME = 'sandhi-quiz-v84';
const SHELL = ['./', './index.html'];   // minimal offline shell; everything else caches reactively

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(event.request))   // offline only
  );
});
