const CACHE_NAME = 'praias-porto-explorer-cache-v1';
const CORE_ASSETS = [
  './', 'index.html', 'verify_v4.js', 'manifest.webmanifest', 'logo_site.png',
  'icons/icon-192.png', 'icons/icon-512.png',
  'data/beaches_source.json', 'data/meta.json', 'data/weather_snapshot.json',
  'data/weather_forecast_3d.json', 'data/update_history.json',
  'data/ipma/sea_day0.json', 'data/ipma/sea_day1.json', 'data/ipma/sea_day2.json',
  'data/ipma/sea_locations.json', 'data/ipma/warnings.json'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isData = url.pathname.includes('/data/');
  if (isData) {
    event.respondWith(fetch(event.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return res;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return res;
  }).catch(() => caches.match('index.html'))));
});
