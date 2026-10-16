// Offline cache. Bump CACHE_VERSION whenever app files change so devices
// pick up the new version the next time they are online.
const CACHE_VERSION = 'sbtm-v0.1.0';

const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'icon.svg',
  'manifest.webmanifest',
  'src/main.js',
  'src/core/brackets.js',
  'src/core/exporters.js',
  'src/core/ids.js',
  'src/core/resolve.js',
  'src/core/roundrobin.js',
  'src/core/scoring.js',
  'src/core/standings.js',
  'src/core/swiss.js',
  'src/core/tournament.js',
  'src/ui/app.js',
  'src/ui/dom.js',
  'src/ui/storage.js',
  'src/ui/views/backup.js',
  'src/ui/views/games.js',
  'src/ui/views/home.js',
  'src/ui/views/phases.js',
  'src/ui/views/setup.js',
  'src/ui/views/standings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Cache first: the venue may have no network at all.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(event.request).then((response) => {
        if (response.ok && new URL(event.request.url).origin === location.origin) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }),
  );
});
