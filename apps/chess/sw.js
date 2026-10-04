// Chess moved to apps/games/chess. This replaces the old offline worker:
// it clears the old cache, unregisters itself, and reloads open pages so
// they pick up the redirect.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => /^chess-v\d+$/.test(k)).map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
