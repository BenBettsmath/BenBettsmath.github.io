const CACHE_NAME = 'games-chess-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './chess.js',
  './attack.js',
  './bot.js',
  './manifest.json',
  './icon.svg',
  './puzzles/easy.json',
  './puzzles/medium.json',
  './puzzles/hard.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('games-chess-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
