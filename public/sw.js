const VERSION = "v3";
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const API_CACHE = `api-${VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icons/icon_16x16.png",
  "/icons/icon_32x32.png",
  "/icons/icon_64x64.png",
  "/icons/icon_128x128.png",
  "/icons/icon_256x256.png",
  "/icons/icon_512x512.png",
  "/tempo-detection-worker.js",
  "/tempo-worker-probe.js",
  "/metadataWorker.js",
];

const PREWARM_URLS = [
  "/metadataWorker.js",
  "/tempo-detection-worker.js",
  "/tempo-worker-probe.js",
];

// =========================================================================
// API caching configuration
// =========================================================================

const API_CACHE_RULES = [
  {
    match: (url) => url.hostname === "musicbrainz.org",
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    strategy: "stale-while-revalidate",
  },
  {
    match: (url) =>
      url.hostname === "itunes.apple.com" && url.pathname.includes("/search"),
    ttlMs: 24 * 60 * 60 * 1000, // 1 day
    strategy: "stale-while-revalidate",
  },
  {
    match: (url) =>
      url.hostname.includes("mzstatic.com") ||
      (url.hostname === "itunes.apple.com" && !url.pathname.includes("/search")),
    ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days (preview audio)
    strategy: "cache-first",
  },
];

const API_CACHE_MAX_ENTRIES = 2000;

// =========================================================================
// Enhancement run state management (in-memory, per SW lifetime)
// =========================================================================

/** @type {Map<string, {status: string, abortController: AbortController}>} */
const activeRuns = new Map();

/** @type {Map<string, AbortController>} */
const taskAbortControllers = new Map();

// =========================================================================
// Install & activate
// =========================================================================

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key !== STATIC_CACHE &&
                key !== RUNTIME_CACHE &&
                key !== API_CACHE
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => evictStaleApiCache())
      .then(() => self.clients.claim())
  );
});

// =========================================================================
// Fetch handler
// =========================================================================

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function isAssetRequest(requestUrl) {
  return (
    requestUrl.pathname.startsWith("/_next/static/") ||
    /\.(?:js|css|svg|png|jpg|jpeg|webp|gif|woff2?)$/.test(requestUrl.pathname)
  );
}

function isNextStatic(requestUrl) {
  return requestUrl.pathname.startsWith("/_next/static/");
}

function findApiCacheRule(url) {
  return API_CACHE_RULES.find((rule) => rule.match(url)) || null;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);

  // --- External API caching ---
  const apiRule = findApiCacheRule(requestUrl);
  if (apiRule) {
    if (apiRule.strategy === "cache-first") {
      event.respondWith(cacheFirstWithTtl(request, apiRule.ttlMs));
    } else {
      event.respondWith(staleWhileRevalidateWithTtl(request, apiRule.ttlMs));
    }
    return;
  }

  // --- Same-origin handling ---
  if (!isSameOrigin(requestUrl)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  if (isNextStatic(requestUrl)) {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  if (isAssetRequest(requestUrl)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          return response;
        });
      })
    );
  }
});

// =========================================================================
// Caching strategies
// =========================================================================

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    const clone = response.clone();
    caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match("/");
  }
}

async function staleWhileRevalidateWithTtl(request, ttlMs) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  const revalidate = fetch(request)
    .then((response) => {
      if (response.ok) {
        const headers = new Headers(response.headers);
        headers.set("x-sw-cache-time", String(Date.now()));
        headers.set("x-sw-cache", "revalidated");
        const copy = new Response(response.clone().body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
        cache.put(request, copy);
      }
      return response;
    })
    .catch(() => null);

  if (cached && !isExpired(cached, ttlMs)) {
    revalidate.catch(() => {});
    return addCacheHeader(cached, "hit");
  }

  const networkResponse = await revalidate;
  if (networkResponse && networkResponse.ok) {
    return addCacheHeader(networkResponse, "miss");
  }

  if (cached) return addCacheHeader(cached, "stale");

  return networkResponse || new Response("Service Unavailable", { status: 503 });
}

async function cacheFirstWithTtl(request, ttlMs) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  if (cached && !isExpired(cached, ttlMs)) {
    return addCacheHeader(cached, "hit");
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set("x-sw-cache-time", String(Date.now()));
      headers.set("x-sw-cache", "stored");
      const copy = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      cache.put(request, copy);
    }
    return addCacheHeader(response, "miss");
  } catch {
    if (cached) return addCacheHeader(cached, "stale");
    return new Response("Service Unavailable", { status: 503 });
  }
}

function isExpired(response, ttlMs) {
  const cachedAt = response.headers.get("x-sw-cache-time");
  if (!cachedAt) return true;
  return Date.now() - Number(cachedAt) > ttlMs;
}

function addCacheHeader(response, status) {
  const headers = new Headers(response.headers);
  headers.set("x-sw-cache", status);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function evictStaleApiCache() {
  try {
    const cache = await caches.open(API_CACHE);
    const keys = await cache.keys();
    const maxTtl = 30 * 24 * 60 * 60 * 1000;
    let evicted = 0;

    for (const request of keys) {
      if (evicted >= 200) break;
      const response = await cache.match(request);
      if (response && isExpired(response, maxTtl)) {
        await cache.delete(request);
        evicted++;
      }
    }

    if (keys.length > API_CACHE_MAX_ENTRIES) {
      const excess = keys.length - API_CACHE_MAX_ENTRIES;
      for (let i = 0; i < excess; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch {
    // Non-critical; ignore
  }
}

// =========================================================================
// Message handler (main thread <-> SW protocol)
// =========================================================================

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case "PREWARM_PROCESSING_ASSETS":
      handlePrewarm();
      break;

    case "START_ENHANCEMENT_TASKS":
      handleStartEnhancement(data);
      break;

    case "RESUME_ENHANCEMENT_TASKS":
      handleResumeEnhancement(data);
      break;

    case "CANCEL_ENHANCEMENT_TASKS":
      handleCancelEnhancement(data);
      break;

    case "QUERY_TASK_STATUS":
      handleQueryTaskStatus(data, event.source);
      break;
  }
});

async function handlePrewarm() {
  try {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.allSettled(
      PREWARM_URLS.map(async (url) => {
        const existing = await cache.match(url);
        if (!existing) {
          const response = await fetch(url);
          if (response.ok) await cache.put(url, response);
        }
      })
    );
  } catch {
    // Non-critical; ignore
  }
}

function handleStartEnhancement(data) {
  const { runId } = data;
  const existing = activeRuns.get(runId);
  if (existing && existing.status === "active") return;

  const abortController = new AbortController();
  activeRuns.set(runId, { status: "active", abortController });

  broadcastToClients({
    type: "ENHANCEMENT_TASKS_ACK",
    runId,
    status: "active",
    remaining: data.taskCount,
    errors: 0,
  });
}

function handleResumeEnhancement(data) {
  const { runId } = data;
  const run = activeRuns.get(runId);
  if (!run || run.status !== "paused") return;

  const abortController = new AbortController();
  activeRuns.set(runId, { status: "active", abortController });

  broadcastToClients({
    type: "ENHANCEMENT_TASKS_ACK",
    runId,
    status: "active",
    remaining: 0,
    errors: 0,
  });
}

function handleCancelEnhancement(data) {
  const { runId, reason } = data;
  const run = activeRuns.get(runId);

  if (reason === "stop") {
    if (run) {
      run.abortController.abort();
      run.status = "stopped";
    }

    for (const [taskId, controller] of taskAbortControllers.entries()) {
      if (taskId.startsWith(runId + ":")) {
        controller.abort();
        taskAbortControllers.delete(taskId);
      }
    }

    activeRuns.set(runId, {
      status: "stopped",
      abortController: new AbortController(),
    });

    unregisterSyncTag(runId);

    broadcastToClients({
      type: "ENHANCEMENT_TASKS_ACK",
      runId,
      status: "stopped",
      remaining: 0,
      errors: 0,
    });
  } else if (reason === "pause") {
    if (run) {
      run.abortController.abort();
      run.status = "paused";
    }

    activeRuns.set(runId, {
      status: "paused",
      abortController: new AbortController(),
    });

    unregisterSyncTag(runId);

    broadcastToClients({
      type: "ENHANCEMENT_TASKS_ACK",
      runId,
      status: "paused",
      remaining: 0,
      errors: 0,
    });
  }
}

function handleQueryTaskStatus(data, source) {
  const { runId } = data;
  const run = activeRuns.get(runId);

  const response = {
    type: "TASK_STATUS_RESPONSE",
    runId,
    status: run ? run.status : "idle",
    remaining: 0,
    succeeded: 0,
    errors: 0,
  };

  if (source && source.postMessage) {
    source.postMessage(response);
  } else {
    broadcastToClients(response);
  }
}

async function broadcastToClients(message) {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage(message);
  }
}

async function unregisterSyncTag(runId) {
  try {
    if (self.registration && self.registration.sync) {
      // One-off sync tags cannot be explicitly unregistered in most browsers,
      // but we track the run state so the sync handler will no-op.
    }
  } catch {
    // Ignore
  }
}

// =========================================================================
// Background sync handler
// =========================================================================

self.addEventListener("sync", (event) => {
  if (event.tag && event.tag.startsWith("enhancement-")) {
    const runId = event.tag.replace("enhancement-", "");
    event.waitUntil(handleSyncDrain(runId));
  }
});

async function handleSyncDrain(runId) {
  const run = activeRuns.get(runId);
  if (!run || run.status === "stopped" || run.status === "paused") return;

  broadcastToClients({
    type: "ENHANCEMENT_TASKS_ACK",
    runId,
    status: run.status,
    remaining: 0,
    errors: 0,
  });
}

// =========================================================================
// Utility: check if a run is canceled/paused before committing results
// =========================================================================

function isRunCanceled(runId) {
  const run = activeRuns.get(runId);
  return !run || run.status === "stopped" || run.status === "canceled";
}

function isRunPaused(runId) {
  const run = activeRuns.get(runId);
  return run && run.status === "paused";
}
