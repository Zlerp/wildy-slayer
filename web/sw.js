// Playground service worker. One worker at the root covers every project.
// Strategy: network first for pages and scripts (so a push to main is live
// immediately), cache first for vendored libraries and assets, and the cache
// as the fallback when the device is offline. Protected and API paths are
// never touched.
const VERSION = "playground-v1";
const SKIP = ["/vault/", "/api/"];
const CACHE_FIRST = /\/(vendor|assets|icons)\//;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  const msg = e.data || {};
  if (msg.type === "precache" && Array.isArray(msg.urls)) {
    e.waitUntil(precache(msg.urls));
  }
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (SKIP.some((p) => url.pathname.startsWith(p))) return;
  if (req.headers.has("range")) return;
  e.respondWith(CACHE_FIRST.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
});

async function precache(urls) {
  const cache = await caches.open(VERSION);
  await Promise.all(urls.map(async (u) => {
    try {
      const url = new URL(u, self.location.origin);
      if (url.origin !== self.location.origin) return;
      if (SKIP.some((p) => url.pathname.startsWith(p))) return;
      if (await cache.match(url.href)) return;
      const res = await fetch(url.href, { cache: "no-cache" });
      if (res.status === 200) await cache.put(url.href, res);
    } catch (_) { /* offline or missing; ignore */ }
  }));
}

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.status === 200) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    if (req.mode === "navigate") {
      // Try the folder's index, then the playground index.
      const url = new URL(req.url);
      const folder = url.pathname.endsWith("/") ? url.pathname : url.pathname.replace(/[^/]*$/, "");
      const alt = await cache.match(new URL(folder, self.location.origin).href);
      if (alt) return alt;
      const root = await cache.match(new URL("/", self.location.origin).href);
      if (root) return root;
    }
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200) cache.put(req, res.clone());
  return res;
}
