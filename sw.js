/* ============================================
   VextoERP - Service Worker
   Cachea el "app shell" para que la app cargue
   offline / instalada. Los datos (Firebase) nunca
   se cachean aquí: siempre van directo a la red.
   ============================================ */

const CACHE_VERSION = 'vextoerp-shell-v2';

const APP_SHELL = [
  './',
  'index.html',
  'facturacion.html',
  'historial.html',
  'inventario.html',
  'clientes.html',
  'css/styles.css',
  'js/firebase-config.js',
  'js/data.js',
  'js/auth.js',
  'js/facturacion.js',
  'js/historial.js',
  'js/inventario.js',
  'js/clientes.js',
  'vextologo1.png',
  'vextologo2.png',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo interceptamos peticiones GET a nuestro propio origen (el "app shell").
  // Firebase/Firestore y cualquier CDN externo siempre van directo a la red.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  // Red primero: así siempre se sirve el código más reciente cuando hay
  // conexión. La caché queda solo como respaldo para cuando no hay red.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
