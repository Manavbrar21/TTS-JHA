/* Service worker: makes the app open with no internet, and
   (on Android) sends waiting forms in the background as soon
   as the phone gets signal — even if the app is closed. */
importScripts("config.js", "sync.js");

var CACHE = "tts-jha-v1";   /* bump this when you change any app file */
var ASSETS = [
  "./", "index.html", "app.js", "sync.js", "config.js", "manifest.webmanifest",
  "logo.png", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Serve from the phone first (instant + offline), refresh the copy in the background. */
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  var key = req.mode === "navigate" ? "index.html" : req;
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(key, { ignoreSearch: true }).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.ok) c.put(key, res.clone());
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      });
    })
  );
});

self.addEventListener("sync", function (e) {
  if (e.tag === "jha-outbox") e.waitUntil(JHASync.run({ throwOnFail: true }).then(notifyClients));
});
self.addEventListener("periodicsync", function (e) {
  if (e.tag === "jha-outbox") e.waitUntil(JHASync.run().then(notifyClients));
});
function notifyClients() {
  return self.clients.matchAll().then(function (cs) { cs.forEach(function (c) { c.postMessage({ type: "synced" }); }); });
}
