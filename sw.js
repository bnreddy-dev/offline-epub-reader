/* Offline EPUB Reader — service worker (v3)
   Defensive cache for Google Translate TTS audio ONLY.
   Google sends no CORS headers and Cache-Control: no-cache, so a page fetch()
   cannot read the audio bytes and the browser HTTP cache will not keep them.
   This worker intercepts /translate_tts requests and caches the audio as
   opaque responses in the Cache API, so repeat listens can play offline.
   Everything else passes through to the network untouched. If the worker is
   not active, the app plays the audio directly — the worker is a bonus, not
   a dependency. Any failure here falls through to the network. */
/* v3.2: cache name bumped so the new worker activates cleanly and the old
   build's cached audio does not linger. */
const CACHE = 'gtts-v3';
const MAX_ENTRIES = 120; // Chrome counts ~7MB quota per opaque response; stay small
const TTS_HOSTS = ['translate.google.com', 'translate.googleapis.com'];

self.addEventListener('install', event => {
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    // drop old TTS caches from earlier versions (never touch other caches:
    // the app's book-file Cache API fallback lives in its own cache).
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE && n.indexOf('gtts-') === 0).map(n => caches.delete(n)));
  })());
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
      // v3.2 (F23): the re-fetch MUST send no Referer — Google Translate TTS
      // returns 404 for a non-Google Referer (F11), and a fetch() rebuilt
      // inside the worker can carry the worker/page origin as Referer. The
      // audio element itself uses referrerpolicy="no-referrer"; the worker's
      // copy must match it, in no-cors mode like a media element. If this
      // fetch fails for any reason, fall through to the network below.
      const clean = new Request(req.url, { method: 'GET', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', headers: new Headers() });
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
