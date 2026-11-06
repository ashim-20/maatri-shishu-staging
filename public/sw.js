const CACHE = "maatri-shell-5j_p90AOEaaLx91E8kh8P";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch("/offline");
      if (!response.ok) throw new Error("Offline shell could not be cached.");
      const html = await response.clone().text();
      await cache.put("/offline", response);
      const urls = [...html.matchAll(/(?:src|href)="([^" ]+)"/g)]
        .map((match) => match[1])
        .filter((url) => url.startsWith("/_next/static/"));
      await cache.addAll([
        ...new Set(["/icon.svg", "/icon-192.png", "/icon-512.png", ...urls]),
      ]);
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("maatri-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/login")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches
          .match("/offline")
          .then((response) => response || Response.error()),
      ),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg")
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(CACHE)
                .then((cache) => cache.put(event.request, copy));
            }
            return response;
          }),
      ),
    );
});
