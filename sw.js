/**
 * CalFair Service Worker
 * Provides offline caching, offline app shell, and tile caching.
 */

const CACHE_NAME = 'feelfare-cache-v10';
const TILE_CACHE_NAME = 'calfair-tiles-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './tariff-config.js',
  './share.js',
  './offline-route.js',
  './roads.json',
  './track.html',
  './track.js',
  './manifest.json',
  './assets/icon.svg',
  './assets/city-of-mati-logo.png',
  './assets/fonts/archivo-latin.woff2',
  './assets/fonts/archivo-latin-ext.woff2',
  './assets/fonts/public-sans-latin.woff2',
  './assets/fonts/public-sans-latin-ext.woff2',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/@phosphor-icons/web@2.1.1/src/index.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install: Cache critical static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use cache.addAll with individual catch so an unavailable external resource won't break install
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to precache asset:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: Purge obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== TILE_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Handler
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 1. Map Tiles (OpenStreetMap, etc.) - Cache then Network (Offline Map Viewing)
  if (url.hostname.includes('tile.openstreetmap') || url.hostname.includes('arcgisonline.com')) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            // Fetch updated tile in background if online
            fetch(request).then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
            }).catch(() => { /* Offline, use cached tile silently */ });
            return cachedResponse;
          }

          // Not in cache: fetch from network and cache
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Return empty 204 or transparent fallback if offline and not cached
            return new Response('', { status: 408, statusText: 'Tile Unavailable Offline' });
          });
        });
      })
    );
    return;
  }

  // 2. Dynamic APIs (OSRM routing, Photon/Nominatim search) - Network only with graceful offline catch
  if (url.hostname.includes('router.project-osrm.org') ||
      url.hostname.includes('photon.komoot.io') ||
      url.hostname.includes('nominatim.openstreetmap.org') ||
      url.hostname.endsWith('.supabase.co')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({
          error: 'offline',
          message: 'Network offline. Live routing and search require an active internet connection.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 2b. Owner tariff config - network first so edits show on the next load
  if (url.origin === self.location.origin && url.pathname.endsWith('/tariff-config.js')) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      }).catch(() => caches.match(request, { ignoreSearch: true }))
    );
    return;
  }

  // 3. Static App Shell & Fonts & Scripts (Stale-While-Revalidate / Cache-First)
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      // Fetch fresh version in background
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        // If offline and not in cache, fallback
        if (!cachedResponse && request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw err;
      });

      // Return cached version immediately if found, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
