/* Service worker.
 *
 * Bump VERSION on every change to this file, otherwise browsers keep
 * serving the old cache bucket and your fix never ships.
 */
const VERSION = 'v1';
const CACHE = 'dock-' + VERSION;

/* Precached so the app opens with no network at all. Keep this list short
 * and honest: anything listed here that 404s makes install() fail silently
 * and the worker never activates. */
const SHELL = [
  './',
  './index.html',
  './config.js',
  './core/app.js',
  './core/ui.js',
  './core/storage.js',
  './manifest.json'
];

/* Never cache: anything that talks to a backend. A dashboard showing
 * yesterday's numbers with no indication they are stale is worse than one
 * that fails visibly. */
const NEVER_CACHE = ['/api/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some(p => url.pathname.includes(p))) return;

  /* Navigations go to the network first so a deployed fix is picked up on
   * the next open; the cache is the offline fallback, not the default. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
