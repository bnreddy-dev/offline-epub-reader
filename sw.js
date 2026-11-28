/* Offline EPUB Reader — service worker (v3)
   Defensive cache for Google Translate TTS audio ONLY.
   Google sends no CORS headers and Cache-Control: no-cache, so a page fetch()
   cannot read the audio bytes and the browser HTTP cache will not keep them.
   This worker intercepts /translate_tts requests and caches the audio as
   opaque responses in the Cache API, so repeat listens can play offline.
   Everything else passes through to the network untouched. If the worker is
   not active, the app plays the audio directly — the worker is a bonus, not
   a dependency. Any failure here falls through to the network. */
/* v3.1: cache name bumped so the new worker activates cleanly and the old
   build's cached audio does not linger. */
const CACHE = 'gtts-v2';
const MAX_ENTRIES = 120; // Chrome counts ~7MB quota per opaque response; stay small
const TTS_HOSTS = ['translate.google.com', 'translate.googleapis.com'];

self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

function isTtsRequest(req) {
  try {
    const u = new URL(req.url);
    return TTS_HOSTS.indexOf(u.hostname) >= 0 && u.pathname === '/translate_tts';
  } catch (e) {
    return false;
  }
}

async function trimCache() {
  try {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    // oldest first (Cache API keys are insertion-ordered); drop the excess
    for (let i = 0; i < keys.length - MAX_ENTRIES; i++) {
      await cache.delete(keys[i]);
    }
  } catch (e) { /* best-effort only */ }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || !isTtsRequest(req)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      // Strip Range: a fresh, full response is what we want to cache.
      const clean = new Request(req.url, { method: 'GET', headers: new Headers(), credentials: 'omit' });
      const res = await fetch(clean);
      if (res && res.status === 200) {
        cache.put(req, res.clone()).then(trimCache).catch(() => {});
      }
      return res;
    } catch (e) {
      return fetch(req); // fall through to the network / browser
    }
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'clear-tts') {
    event.waitUntil(caches.delete(CACHE));
  }
});
