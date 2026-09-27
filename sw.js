const CACHE_NAME = 'sey-budget-shell-v2.2.1';
const APP_SHELL = ['/app.html', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
const NAVIGATION_ENTRY = '/app.html';
// 네트워크가 이만큼 안 오면 캐시된 화면이라도 먼저 보여준다.
const NAV_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((clients) => {
        // 이미 열려 있는 화면은 옛 셸을 보고 있을 수 있다. 새 버전이 준비됐다고 알려준다.
        clients.forEach((client) => client.postMessage({ type: 'sw-updated', cache: CACHE_NAME }));
      }),
  );
});

/**
 * 내비게이션은 네트워크 우선이다.
 * 예전에는 캐시 우선이라, 새로 배포해도 앱을 두 번 열어야 새 버전이 나왔다.
 * (그 탓에 고쳐서 배포한 코드가 계속 옛것으로 돌아가는 일이 있었다.)
 * 오프라인이거나 느릴 때만 캐시된 화면으로 떨어진다.
 */
function navigationResponse(request) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (res) => { if (!settled && res) { settled = true; resolve(res); } };
    const fallback = () => caches.match(NAVIGATION_ENTRY).then(done);

    const timer = setTimeout(fallback, NAV_TIMEOUT_MS);

    fetch(request).then((response) => {
      clearTimeout(timer);
      if (response && response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(NAVIGATION_ENTRY, clone)).catch(() => {});
        done(response);
      } else {
        caches.match(NAVIGATION_ENTRY).then((cached) => done(cached || response));
      }
    }).catch(() => {
      clearTimeout(timer);
      caches.match(NAVIGATION_ENTRY).then((cached) => done(cached || Response.error()));
    });
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationResponse(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    })),
  );
});

/* ============ 🔔 웹 푸시 및 알림 상호작용 리스너 ============ */
self.addEventListener('push', (event) => {
  let data = { title: 'sey콩콩 가계부', body: '새로운 알림이 도착했어요.', url: '/app.html' };
  if (event.data) {
    try {
      const json = event.data.json();
      data = Object.assign(data, json);
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    data: { url: data.url || '/app.html' },
    vibrate: [100, 50, 100],
    tag: data.tag || 'sey-budget-notif'
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if (client.navigate) client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
