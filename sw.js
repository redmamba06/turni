/* Service worker: cache offline dell'app (app shell). I dati stanno in localStorage. */
const CACHE = "turni-v9";
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/vendor/jspdf.umd.min.js',
  './js/store.js',
  './js/cloud.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Network-first per i file dell'app (così gli aggiornamenti arrivano), cache come fallback offline.
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});

/* ---------- Notifiche push ---------- */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { title: 'Turni Gelateria', body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'Turni Gelateria';
  const options = {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: data.url || './' },
    tag: data.tag || 'turno',
    requireInteraction: false,
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  let finishId = null;
  try { finishId = new URL(url, self.location.origin).searchParams.get('finish'); } catch (_) {}
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      await c.focus();
      if (finishId) c.postMessage({ type: 'finish', id: finishId });
      else if ('navigate' in c) { try { await c.navigate(url); } catch (_) {} }
      return;
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
