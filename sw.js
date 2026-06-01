// 自毁 Service Worker — 清除所有缓存后自杀
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(names.map(function(n) { return caches.delete(n); }));
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    self.clients.claim().then(function() {
      return self.registration.unregister();
    })
  );
});
