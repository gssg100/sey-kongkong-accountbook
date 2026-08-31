const CACHE_NAME = 'sey-budget-shell-v5-20260831';
const APP_SHELL = ['/app.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
const NAVIGATION_ENTRY = '/app.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    const networkResponse = fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(NAVIGATION_ENTRY, response.clone()));
      return response;
    });
    event.waitUntil(networkResponse.then(() => undefined).catch(() => undefined));
    event.respondWith(caches.match(NAVIGATION_ENTRY).then((cached) => cached || networkResponse));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    })),
  );
});
