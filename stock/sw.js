// Service Worker v7 — 强制即时更新，零缓存
var CACHE = 'stock-v7';

self.addEventListener('install', function(e) {
  // 跳过等待，立即激活
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  // 清空所有旧缓存 + 立即接管所有页面
  e.waitUntil(Promise.all([
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    }),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', function(e) {
  // 只走网络，不缓存任何内容
  e.respondWith(fetch(e.request));
});
