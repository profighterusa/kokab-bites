/* KOKAB BITES service worker — offline-first app shell + menu cache */
 // Bump VERSION whenever the app shell (index.html / css) changes, or
 // returning visitors keep serving the old cached shell forever.
const VERSION = 'kokab-v3';
const SHELL = [
  './',
  './index.html',
  './index.css',
  './app-ui.css',
  './manifest.webmanifest',
  './404.html'
  /* NOTE: favicon.ico, apple-touch-icon.png, icon-192.png and icon-512.png
     are NOT listed here on purpose: they are not shipped in this repo, so
     including them made cache.addAll reject and the whole install fail.
     The favicon and touch icon are served from Supabase via index.html. */
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  // Images: never intercept. Photos are cross-origin (Supabase/Unsplash) and
  // are never cached by this worker anyway (same-origin guard below), so
  // letting the browser fetch them natively removes the worker from the
  // image path entirely.
  if (request.destination === 'image') return;

  const url = new URL(request.url);

  // API: network-first, fall back to cache (offline menu)
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else: cache-first, then network, cache new responses
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        // Only cache same-origin successful responses
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => {
        // Offline fallback for navigation
        if (request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    })
  );
});
