var CACHE = 'cetak-struk-v10';
var CACHE_RUNTIME = 'cetak-struk-runtime-v10';

var PRECACHE = [
  './',
  'index.html',
  'css/style.css',
  'js/escpos.js',
  'js/store.js',
  'js/printer.js',
  'js/ocr.js',
  'js/app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'ble-test.html',
  'vendor/tesseract/tesseract.min.js',
  'vendor/tesseract/worker.min.js',
  'vendor/tesseract/tesseract-core-simd-lstm.wasm.js',
  'vendor/tesseract/tesseract-core-simd-lstm.wasm',
  'vendor/tesseract/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/tesseract-core-lstm.wasm',
  'vendor/tesseract/eng.traineddata.gz'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(
        PRECACHE.map(function (url) {
          return cache.add(url).catch(function () {});
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE && key !== CACHE_RUNTIME) return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_RUNTIME).then(function (c) { c.put(event.request, copy); });
        return res;
      }).catch(function () {
        return caches.match('index.html');
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (res) {
        if (res.ok) {
          var copy = res.clone();
          caches.open(CACHE_RUNTIME).then(function (c) { c.put(event.request, copy); });
        }
        return res;
      });
    })
  );
});
