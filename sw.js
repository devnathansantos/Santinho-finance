const CACHE = "santinho-finance-v4";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./logo.png",
  "./logo-192.png",
  "./logo-512.png",
  "./apple-touch-icon.png"
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
            .filter(key =>
              key.startsWith("santinho-finance-") &&
              key !== CACHE
            )
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(response => {
            if (
              response &&
              response.status === 200 &&
              response.type === "basic"
            ) {
              const copy = response.clone();

              caches.open(CACHE).then(cache => {
                cache.put(event.request, copy);
              });
            }

            return response;
          })
          .catch(() => {
            if (event.request.mode === "navigate") {
              return caches.match("./index.html");
            }

            return new Response("", {
              status: 503,
              statusText: "Offline"
            });
          });
      })
  );
});