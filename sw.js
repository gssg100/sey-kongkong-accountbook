// sey콩콩 가계부 Service Worker (PWA 캐싱 및 오프라인 보장)
const CACHE_NAME = 'sey-kongkong-v1';
const ASSETS = [
  './',
  './Index.html',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // GET 요청 및 정적 자원 네트워크 우선, 실패시 캐시
  if (e.request.method === 'GET') {
    e.respondWith(
      fetch(e.request).catch(() => {
        return caches.match(e.request);
      })
    );
  }
});
