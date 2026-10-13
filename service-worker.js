const CACHE_NAME = 'kokab-bites-shell-v8-advanced';
const SHELL = [
  './', './index.html', './admin.html', './app-ui.css', './manifest.webmanifest',
  './favicon-32.png', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './logo-kokab-bites.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kokab-bites-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(response => { if (response.ok) { const copy=response.clone(); caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)); } return response; }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(response => { if(response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));}return response; })));
});
