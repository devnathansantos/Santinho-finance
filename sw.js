const CACHE = "santinho-finance-v3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  ".logo.png",
  ".logo-192.png",
  ".logo-512.png",
  ".apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("santinho-finance-") && key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // O Santinho Finance trabalha somente com recursos do próprio domínio.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then(response => {
          if (!response || !response.ok) {
            return response;
          }

          const copy = response.clone();

          caches.open(CACHE).then(cache => {
            cache.put(request, copy);
          });

          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});