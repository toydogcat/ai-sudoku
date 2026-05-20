const CACHE_NAME = 'sudoku-lab-cache-v1';
const PRECACHE_ASSETS = [
  '/ai-sudoku/',
  '/ai-sudoku/index.html',
  '/ai-sudoku/manifest.json',
  '/ai-sudoku/icon.png'
];

// Installation event: Precache core shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Precaching core application shell');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activation event: Clean up old caches if CACHE_NAME changes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting obsolete cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Serve cached assets or fetch and dynamically cache new static assets
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Avoid caching vercount/analytics requests
  if (requestUrl.host.includes('vercount.one') || requestUrl.pathname.includes('/js')) {
    return; // let browser handle it natively (Network only)
  }

  // Handle local application requests
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch a fresh copy in the background and update the cache (Stale-While-Revalidate)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => { /* Ignore background update failures offline */ });

        return cachedResponse;
      }

      // If not cached, fetch from network and cache dynamically for next time (for hashed JS/CSS)
      return fetch(event.request).then((networkResponse) => {
        // Only cache valid standard successful requests
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Offline fallback for HTML requests (navigate back to index.html)
        if (event.request.mode === 'navigate') {
          return caches.match('/ai-sudoku/') || caches.match('/ai-sudoku/index.html');
        }
      });
    })
  );
});
