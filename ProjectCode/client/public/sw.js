const STATIC_CACHE = 'static-v1';
const IMAGES_CACHE = 'images-v1';
const API_CACHE = 'api-v1';
const EXPECTED_CACHES = [STATIC_CACHE, IMAGES_CACHE, API_CACHE];
const MAX_IMAGES = 200;

// Helpers

function isStaticAsset(url) {
  return url.pathname.startsWith('/static/') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com');
}

function isImage(url) {
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|ico)(\?.*)?$/i;
  return imageExtensions.test(url.pathname) ||
    url.hostname.includes('s3.amazonaws.com') ||
    url.hostname.includes('s3.us-') ||
    url.pathname.startsWith('/images/');
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
  }
}

// Install - pre-cache nothing, just activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => !EXPECTED_CACHES.includes(name))
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch - apply strategy based on request type
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Images: stale-while-revalidate
  if (isImage(url)) {
    event.respondWith(
      caches.open(IMAGES_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
              trimCache(IMAGES_CACHE, MAX_IMAGES);
            }
            return response;
          }).catch(() => cached); // Fall back to cache on network error

          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // API requests: network-first
  if (isApiRequest(url)) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) =>
        fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cache.match(event.request))
      )
    );
    return;
  }
});

// Message handler - clear caches from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    const names = event.data.cacheNames || EXPECTED_CACHES;
    event.waitUntil(
      Promise.all(names.map((name) => caches.delete(name)))
    );
  }
});
