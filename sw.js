// Bump VERSION on every release so the iPad picks up the new files.
const VERSION = 'liv-emr-v1.1.0';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/router.js', 'js/db.js', 'js/ui.js', 'js/lock.js', 'js/common.js', 'js/stock.js', 'js/treatments.js', 'js/photos.js',
  'js/pages/today.js', 'js/pages/patients.js', 'js/pages/visit.js', 'js/pages/calendar.js', 'js/pages/inventory.js', 'js/pages/settings.js', 'js/pages/report.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
