const CACHE_NAME = 'yana-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/static/core/css/pwa.css',
  '/static/core/js/pwa.js',
  '/static/core/img/icon.png',
  '/static/core/img/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Simple cache-first strategy for static assets
  if (event.request.url.includes('/static/')) {
      event.respondWith(
        caches.match(event.request).then((response) => {
          return response || fetch(event.request);
        })
      );
  } else if (event.request.mode === 'navigate') {
      // For navigation (HTML), try network first, fall back to cache
      event.respondWith(
          fetch(event.request).catch(() => {
              return caches.match('/');
          })
      );
  } else {
      event.respondWith(fetch(event.request));
  }
});
