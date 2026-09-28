// Service worker: makes the app load instantly and work offline.
// - App files: served from cache, refreshed in the background (so edits show up on the next launch).
// - Firebase SDK files (versioned URLs on gstatic.com): cached forever.
// - Firestore / Auth network calls: never touched (Firestore has its own offline cache).
//
// Bump VERSION when you add or rename files so old caches get cleaned up.
const VERSION = 'v1.0.0';
const CACHE = `sweatpact-${VERSION}`;
const SDK_CACHE = 'sweatpact-firebase-sdk';

const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'js/main.js',
  'js/config.js',
  'js/firebase-config.js',
  'js/lib/dom.js',
  'js/lib/icons.js',
  'js/lib/idb.js',
  'js/core/dates.js',
  'js/core/logic.js',
  'js/core/model.js',
  'js/core/photos.js',
  'js/core/photo-cache.js',
  'js/core/platform.js',
  'js/core/store.js',
  'js/backends/firebase.js',
  'js/backends/local.js',
  'js/ui/app.js',
  'js/ui/camera.js',
  'js/ui/components.js',
  'js/ui/sheets.js',
  'js/ui/screens/welcome.js',
  'js/ui/screens/home.js',
  'js/ui/screens/history.js',
  'js/ui/screens/pact.js',
  'js/ui/screens/settings.js',
];

// On localhost prefer the network so code changes show up immediately while developing.
const DEV = ['localhost', '127.0.0.1'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sweatpact-') && k !== CACHE && k !== SDK_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function staleWhileRevalidate(request, cacheKey = request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(cacheKey, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(cacheKey, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) return cached;
  return (await network) || new Response('Offline', { status: 503, statusText: 'Offline' });
}

async function networkFirst(request, cacheKey = request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch {
    return (await cache.match(cacheKey, { ignoreSearch: true })) || new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SDK_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // All page navigations get the app shell (the app uses #hash routes).
    const key = request.mode === 'navigate' ? new URL('./', self.registration.scope).href : request;
    event.respondWith(DEV ? networkFirst(request, key) : staleWhileRevalidate(request, key));
    return;
  }

  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(cacheFirst(request));
  }
});
