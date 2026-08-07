/* 这一页自己的 service worker。
 *
 * 改这个文件必须动 VERSION，否则浏览器认不出有新版本，
 * 会一直用旧缓存桶里的东西。
 */
const VERSION = 'orange-v1';
const CACHE = VERSION;

/* 装的时候先存下外壳。逐个 add，某一个 404 不至于让整次安装失败。 */
const SHELL = [
  './',
  './index.html',
  './config.js',
  './calendar.js',
  './dates.js',
  './ledger.js',
  './deco.js',
  './fab.js',
  './manifest.json',
  '../../core/storage.js',
  './assets/bg.webp',
  './assets/ride_sheet.webp',
  './assets/fonts/gaegu-latin.woff2'
];

/* 接口永远不缓存：里面是随时在变的个人数据，
   而且没登录的时候它返回的是跳转，缓存下来就等于把登录墙焊死了。 */
const NEVER = ['/api/', '/briefing'];

/* 只有"同一个网址内容永远不变"的东西才能缓存优先。
   代码文件名不带版本号，缓存优先会让新页面配上旧逻辑。 */
const IMMUTABLE = /\/assets\/|\.(webp|png|jpg|woff2?)$/i;

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
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function keep(req, res) {
  if (res.ok && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy));
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some(p => url.pathname.includes(p))) return;

  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => keep(req, res)))
    );
    return;
  }

  /* 其余一律网络优先，断网才回落到缓存 */
  e.respondWith(
    fetch(req)
      .then(res => keep(req, res))
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
