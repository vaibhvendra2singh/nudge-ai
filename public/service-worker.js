// Self-destructing Service Worker to purge PWA cache and unregister
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      return self.registration.unregister();
    }).then(() => {
      console.log('All caches cleared and Service Worker unregistered successfully.');
    })
  );
});
