/* BuildX App service worker: the app opens offline, static files come from the cache,
 * pages are network-first. Supabase (another origin) is never cached. */
const VERSION = "rh-app-mv2qigdn";
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

/* Push notifications sent from the BuildX App (see supabase/functions/send-push). */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "BuildX HUE" };
  }
  const title = data.title || "BuildX HUE";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: new URL("../brand/icon-192.png", SCOPE).href,
      badge: new URL("../brand/favicon-48.png", SCOPE).href,
      lang: "ar",
      dir: "auto",
      data: { url: data.url || SCOPE },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || SCOPE;
  const target = new URL(raw, self.location.origin);
  // Only open pages on this site.
  const url = target.origin === self.location.origin ? target.href : SCOPE;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(SCOPE) && "focus" in c) {
          c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
