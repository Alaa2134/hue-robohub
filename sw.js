/* BuildX HUE website service worker: keeps the site's files on the device after the first visit,
 * so later visits load fast and use less data, and pages already seen still open offline.
 *  - Built files (/_next/static, hashed names) and fonts: from the cache, fetched once.
 *  - Images, the 3D guide and other public files: from the cache, refreshed in the background.
 *  - Pages and page data: from the network (always the latest), the cache only when offline.
 * Other sites (Supabase, analytics) and the BuildX App (/app/, it has its own) are never touched. */
const VERSION = "bx-site-muznjehl";
const SCOPE = new URL(self.registration.scope).pathname;
const LIMITS = { pages: 40, assets: 220 };

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("bx-site-") && !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Keep a cache from growing without end (oldest entries go first). */
async function trim(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function fromCacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") {
    await cache.put(req, res.clone());
    trim(name, LIMITS.assets);
  }
  return res;
}

async function staleWhileRevalidate(event, req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then(async (res) => {
      if (res.ok && res.type === "basic") {
        await cache.put(req, res.clone());
        trim(name, LIMITS.assets);
      }
      return res;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(fresh);
    return hit;
  }
  return fresh;
}

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") {
      await cache.put(req, res.clone());
      trim(name, LIMITS.pages);
    }
    return res;
  } catch {
    const hit = (await cache.match(req, { ignoreSearch: true })) ?? (req.mode === "navigate" ? await cache.match(SCOPE) : undefined);
    if (hit) return hit;
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith(`${SCOPE}app/`) || url.pathname.endsWith("/sw.js")) return;
  const path = url.pathname;
  if (path.includes("/_next/static/") || /\.(woff2?|ttf)$/.test(path)) {
    event.respondWith(fromCacheFirst(req, `${VERSION}-static`));
  } else if (/\.(webp|avif|png|jpe?g|gif|svg|ico|glb|mp3|wasm|webmanifest)$/.test(path)) {
    event.respondWith(staleWhileRevalidate(event, req, `${VERSION}-assets`));
  } else if (req.mode === "navigate" || /\.(html|txt|json)$/.test(path) || path.endsWith("/")) {
    event.respondWith(networkFirst(req, `${VERSION}-pages`));
  }
});
