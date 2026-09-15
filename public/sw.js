/* Service worker: приложение открывается без сети, данные всегда берутся свежими.
   Меняешь файлы в public/ — подними версию, старый кэш удалится сам. */

const VERSION = 'toobarter-v11';   // поднимай при каждом изменении файлов в public/
const SHELL = VERSION + '-shell';
const MEDIA = VERSION + '-media';

const SHELL_FILES = [
  '/',
  '/css/app.css',
  '/js/i18n.js',
  '/js/catalog.js',
  '/js/api.js',
  '/js/ui.js',
  '/js/match.js',
  '/js/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Данные — только из сети: устаревшие объявления и сообщения хуже, чем их отсутствие
  if (url.pathname.startsWith('/api/')) return;

  // Фотографии объявлений — сначала кэш, он не меняется
  if (url.pathname.startsWith('/uploads/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(MEDIA).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // Переходы по страницам: сеть, а если её нет — сохранённая оболочка
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/').then((hit) => hit || offlinePage()))
    );
    return;
  }

  // Остальная статика: отдаём из кэша сразу, в фоне обновляем
  e.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});

function offlinePage() {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <style>body{margin:0;height:100vh;display:grid;place-items:center;background:#0e1420;color:#fff;
     font-family:system-ui,sans-serif;text-align:center;padding:24px}p{color:#9aa4b2}</style>
     <div><h1 style="font-size:44px;margin:0">⇄</h1><h2>Offline</h2>
     <p>Нет соединения · Կապ չկա · No connection</p></div>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/* ---------------- push-уведомления ---------------- */

self.addEventListener('push', (e) => {
  let data = { title: 'TooBarter', body: '', url: '/' };
  try { data = Object.assign(data, e.data ? e.data.json() : {}); } catch { /* пустой payload */ }
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'toobarter',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // если приложение уже открыто — просто переходим на нужный экран
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
