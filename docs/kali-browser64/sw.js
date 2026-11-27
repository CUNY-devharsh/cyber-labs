/* Kali in this tab, 64-bit: service worker.

   The emulator runs on several threads that share memory. Browsers allow that
   only on a page that is "cross-origin isolated", which a server asks for with
   two response headers. GitHub Pages cannot send custom headers, so this
   worker adds them to every file this page loads. It changes nothing else and
   stores nothing. */
"use strict";

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (event) { event.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", function (event) {
  var request = event.request;
  /* A browser quirk: these requests fail inside a service worker. */
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  event.respondWith(fetch(request).then(function (response) {
    if (response.status === 0) return response;
    var headers = new Headers(response.headers);
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: headers });
  }));
});
