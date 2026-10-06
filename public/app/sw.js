/* BuildX App service worker: the app opens offline, static files come from the cache,
 * pages are network-first. Supabase (another origin) is never cached. */
const VERSION = "rh-app-__BUILD_ID__";
const SCOPE = self.registration.scope;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}zxing_reader.wasm`]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rh-app-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(SCOPE, copy));
          }
          return res;
        })
        .catch(() => caches.match(SCOPE)),
    );
    return;
  }

  if (/\/_next\/static\/|\.(wasm|woff2|png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
