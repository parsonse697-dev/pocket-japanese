// Offline support. The page is cached as a versioned "core"; sound clips
// live in a separate cache keyed by content, so updates don't re-download them.
const CORE = "pj-core-e464e8943d";
const AI = "pj-ai-809c813810";   // AI helper files, renamed whenever one of them changes
const FILES = ["./", "index.html", "lex.js", "ai/ask.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CORE).then(c => c.addAll(FILES.map(f => new Request(f, {cache: "reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(k => (k.startsWith("pj-core-") && k !== CORE) || (k.startsWith("pj-ai-") && k !== AI)).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, {ignoreSearch: true}).then(hit => hit ||
      (req.mode === "navigate" ? caches.match("index.html") : null)).then(hit => hit ||
      fetch(req).then(res => {
        const u = req.url;
        if (res.ok && u.includes("/audio/")) {
          const copy = res.clone();
          caches.open("pj-audio-v1").then(c => c.put(req, copy));
        } else if (res.ok && u.includes("/ai/") && !u.endsWith("/ask.js")) {
          const copy = res.clone();   // AI helper files: only fetched after the user says yes
          caches.open(AI).then(c => c.put(req, copy));
        }
        return res;
      }))
  );
});
