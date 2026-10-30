// Written to public/sw.js by scripts/generate-sw.mjs, with the MANIFEST of the build and the functions of routes.mjs
// in front of this code. See "PWA" in ARCHITECTURE.md.

/* global MANIFEST, findPage, fillTemplate, normalizePathname, imageHashOf, IMAGE_CACHE, CACHED_AT_HEADER */

const PRECACHE = `gym2-precache-${MANIFEST.version}`;
const LAZY_CACHE = `gym2-assets-${MANIFEST.lazy.version}`;
const NAVIGATION_TIMEOUT_MS = 3000;

const assetUrls = new Set(MANIFEST.assets);
const lazyUrls = new Set(MANIFEST.lazy.urls);

// MARK: - Install

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

async function precache() {
  const cache = await caches.open(PRECACHE);
  await Promise.all([
    ...MANIFEST.assets.map((url) => precacheAsset(cache, url)),
    ...MANIFEST.pages.map((page) => precachePage(cache, page)),
    precacheNotFound(cache),
  ]);
}

/** Files of /_next/static never change under the same URL, so they're taken from the previous version if possible */
async function precacheAsset(cache, url) {
  if (url.startsWith("/_next/static/")) {
    const previous = await caches.match(url, { ignoreVary: true });
    if (previous) return cache.put(url, previous);
  }
  const response = await fetch(url, { cache: "reload", credentials: "same-origin" });
  if (!response.ok) throw new Error(`Precaching ${url} failed: ${response.status}`);
  await cache.put(url, response);
}

async function precachePage(cache, page) {
  const response = await fetch(page.url, { cache: "reload", credentials: "same-origin" });
  if (!response.ok) {
    // A template can be refused by the page (e.g. notFound() for unknown values): that route doesn't work offline
    if (page.params.length > 0) return console.warn(`Precaching ${page.url} failed: ${response.status}`);
    throw new Error(`Precaching ${page.url} failed: ${response.status}`);
  }
  // A redirected response can't answer a navigation, a redirect to the same target can
  await cache.put(page.url, response.redirected ? Response.redirect(response.url, 307) : response);
}

async function precacheNotFound(cache) {
  try {
    const response = await fetch(MANIFEST.notFound, { cache: "reload", credentials: "same-origin" });
    if (response.status === 404) await cache.put(MANIFEST.notFound, response);
  } catch {
    // Only used for unknown pages offline
  }
}

// MARK: - Activate

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("gym2-") && name !== PRECACHE && name !== LAZY_CACHE && name !== IMAGE_CACHE)
          .map((name) => caches.delete(name)),
      );
      // Starts the network request of a navigation while the worker boots
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  // Sent by the page after it loaded: loads the large files that aren't needed to start the app
  if (event.data?.type === "CACHE_LAZY_ASSETS") event.waitUntil(cacheLazyAssets());
});

async function cacheLazyAssets() {
  const cache = await caches.open(LAZY_CACHE);
  for (const url of MANIFEST.lazy.urls) {
    if (await cache.match(url)) continue;
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (response.ok) await cache.put(url, response);
    } catch {
      return; // offline, tried again with the next page load
    }
  }
}

// MARK: - Fetch

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (imageHashOf(url.pathname)) {
    event.respondWith(cachedImage(request, url.pathname));
    return;
  }
  // The rest of the backend: never cached by the worker
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigation(event, url));
  } else if (assetUrls.has(url.pathname)) {
    // By path: Next.js adds a hash as query to the links of the icons
    event.respondWith(precached(request, url.pathname));
  } else if (lazyUrls.has(url.pathname)) {
    event.respondWith(lazyAsset(request, url.pathname));
  }
  // Everything else (React Server Components payloads, unknown files) goes to the network as usual
});

async function precached(request, pathname) {
  const cached = await caches.match(pathname, { cacheName: PRECACHE, ignoreVary: true });
  return cached ?? fetch(request);
}

async function lazyAsset(request, pathname) {
  const cache = await caches.open(LAZY_CACHE);
  const cached = await cache.match(pathname);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(pathname, response.clone());
  return response;
}

/** Cache first: an image never changes under its hash. Only successful image responses are kept. */
async function cachedImage(request, pathname) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(pathname);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && (response.headers.get("content-type") ?? "").startsWith("image/")) {
    const headers = new Headers(response.headers);
    headers.set(CACHED_AT_HEADER, String(Date.now()));
    const body = await response.clone().blob();
    await cache.put(pathname, new Response(body, { status: response.status, statusText: response.statusText, headers }));
  }
  return response;
}

async function navigation(event, url) {
  if (self.navigator.onLine !== false) {
    try {
      const response = await withTimeout(networkResponse(event), NAVIGATION_TIMEOUT_MS);
      // A server error (e.g. while deploying) is answered from the precache as well
      if (response.status < 500) return response;
    } catch {
      // Offline, server unreachable or too slow
    }
  }
  return (await precachedPage(url)) ?? fetch(event.request);
}

async function networkResponse(event) {
  if (event.preloadResponse) {
    // Settled even if the precache answers first, otherwise the browser logs a cancelled preload
    event.waitUntil(event.preloadResponse.catch(() => undefined));
    const preloaded = await event.preloadResponse;
    if (preloaded) return preloaded;
  }
  return fetch(event.request);
}

function withTimeout(promise, milliseconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** The precached HTML of the page, a template filled with the values of the URL, or the 404 page */
async function precachedPage(url) {
  const cache = await caches.open(PRECACHE);
  const found = findPage(normalizePathname(url.pathname), MANIFEST.pages);
  if (found) {
    const cached = await cache.match(found.page.url, { ignoreVary: true });
    if (cached && found.page.params.length === 0) return cached;
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.delete("content-length");
      headers.delete("etag");
      return new Response(fillTemplate(await cached.text(), found.values), { status: cached.status, headers });
    }
  }
  return cache.match(MANIFEST.notFound, { ignoreVary: true });
}
