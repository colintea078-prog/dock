/* Service worker.
 *
 * Bump VERSION on every change to this file, otherwise browsers keep
 * serving the old cache bucket and your fix never ships.
 */
const VERSION = 'v2';
const CACHE = 'dock-' + VERSION;

/* Precached so the app opens with no network at all. Keep this list short
 * and honest: anything listed here that 404s makes install() fail, so we
 * add entries individually and tolerate misses. */
const SHELL = [
  './',
  './index.html',
  './config.js',
  './core/app.js',
  './core/ui.js',
  './core/storage.js',
  './manifest.json'
];

/* Never cached: anything that talks to a backend. A dashboard showing
 * yesterday's numbers with no sign they are stale is worse than one that
 * visibly fails. */
const NEVER_CACHE = ['/api/'];

/* Cache-first is only safe for files whose contents never change under a
 * given URL. Ours are icons. Application code is deliberately NOT in here:
 * the filenames carry no hash, so a cache-first rule would keep serving
 * last week's app.js against this week's index.html and the two would
 * disagree in ways that look like ghosts. */
const IMMUTABLE = /\/icons\/|\.(png|jpg|jpeg|webp|svg|woff2?)$/i;

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

function networkFirst(req) {
  return fetch(req)
    .then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    })
    .catch(() => caches.match(req).then(r => r || caches.match('./index.html')));
}

function cacheFirst(req) {
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some(p => url.pathname.includes(p))) return;

  e.respondWith(IMMUTABLE.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});
