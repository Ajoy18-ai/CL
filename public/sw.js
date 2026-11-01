
const CACHE_NAME = 'cinelog-v4';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './pwa-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Stale-While-Revalidate Strategy
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Only handle http / https protocols (skip chrome-extension, etc.)
  if (!event.request.url.startsWith('http')) return;

  // In development / preview domains, bypass caching to prevent stale asset serving.
  // This ensures live coding updates work instantly while maintaining PWA installability.
  const isDev = self.location.hostname.includes('ais-dev') ||
                self.location.hostname.includes('ais-pre') ||
                self.location.hostname.includes('localhost') ||
                self.location.hostname.includes('127.0.0.1');

  if (isDev) return;

  const url = event.request.url;

  // Filter out Firebase, Firestore, Auth, and other dynamic external APIs from caching to prevent connection hangs and stale data
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebaseapp.com') ||
    url.includes('identitytoolkit') ||
    url.includes('securetoken') ||
    (url.includes('googleapis.com') && !url.includes('fonts.googleapis.com')) ||
    url.includes('themoviedb.org') ||
    url.includes('tmdb.org') ||
    url.includes('rapidapi.com')
  ) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Try to get from cache first
      const cachedResponse = await cache.match(event.request);

      // 2. Fetch from network regardless of cache to update it (revalidate)
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Check if response is valid before caching
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(event.request, networkResponse.clone());
          }
          // Also cache successful external CDN font hits and static scripts (e.g. Firebase SDK scripts themselves)
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (
              url.includes('esm.sh') ||
              url.includes('fonts.googleapis.com') ||
              url.includes('fonts.gstatic.com') ||
              (url.includes('gstatic.com') && url.includes('/firebasejs/'))
            )
          ) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch((err) => {
          // Network failed, nothing to do here as we return cachedResponse below if available
          console.debug('[SW] Network fetch failed', err);
        });

      // 3. Return cached response immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
