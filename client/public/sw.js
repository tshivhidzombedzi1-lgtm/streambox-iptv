// YokoTV service worker: makes the site installable and keeps the app shell
// available on flaky connections. Live streams and the API always go to the
// network; hashed build files are cached forever since their names change.
const SHELL = "yokotv-shell-v1";
const ASSETS = "yokotv-assets-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/", "/manifest.webmanifest", "/brand/yokotv-icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Pages: network first, so people always get the latest app; cached shell if offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).then((res) => {
      if (res.ok && url.pathname === "/") { const copy = res.clone(); caches.open(SHELL).then((c) => c.put("/", copy)); }
      return res;
    }).catch(() => caches.match("/").then((r) => r || Response.error())));
    return;
  }

  // Hashed build files and brand images: cache first.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});
