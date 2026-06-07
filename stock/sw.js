// Service Worker v4 — PWA 桌面安装版
// 缓存所有静态资源，不缓存 HTML/API
var CACHE = 'stock-v6';
var STATIC = ['./manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(STATIC); }));
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
  }));
  return self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (e.request.url.indexOf('/api/') > -1) return;
  if (e.request.mode === 'navigate') {
    return fetch(e.request);
  }
  e.respondWith(caches.match(e.request).then(function(r) { return r || fetch(e.request); }));
});
