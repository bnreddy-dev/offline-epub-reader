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
/* v3.6: installable PWA — cache the app shell (manifest, icons, OG banner,
   version.json, index.html) in a SEPARATE cache so the installed app opens
   offline. Network-first so a new deploy is never hidden behind a stale
   shell; the cache is only the offline fallback. The TTS cache (gtts-v3) is
   untouched — its name is never bumped here, so cached audio survives. */
const SHELL_CACHE = 'app-shell-v2';
const SHELL_URLS = ['./', 'index.html', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'og-banner.jpg', 'version.json'];
const SHELL_PATHS = ['/', '/index.html', '/manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', '/og-banner.jpg', '/version.json'];

function shellPath(req) {
  try {
    const u = new URL(req.url);
    if (u.origin !== self.location.origin) return null;
    // strip the Pages sub-path scope (e.g. /offline-epub-reader) so the
    // match works wherever the app is hosted
    const scopePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
    let p = u.pathname;
    if (scopePath && p.indexOf(scopePath) === 0) p = p.slice(scopePath.length) || '/';
    return p;
  } catch (e) { return null; }
}
function isShellRequest(req) {
  if (req.method !== 'GET') return false;
  if (req.mode === 'navigate') return true;
  const p = shellPath(req);
  return p !== null && SHELL_PATHS.indexOf(p) >= 0;
}
// v3.4 (fix A): 120 entries barely held ONE chapter (~98 sentences), so
// warming the current chapter + the next 2 (the app's prefetch) evicted the
// chapter the user was reading — every library re-open re-downloaded the
// audio from 0. A book is ~21 chapters x ~100 sentences = ~2100 entries;
// 3000 holds a whole book plus margin. Each entry is a few KB of audio
// (~15 MB total), well inside the browser's Cache API storage quota.
const MAX_ENTRIES = 3000;
const TTS_HOSTS = ['translate.google.com', 'translate.googleapis.com'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(SHELL_URLS.map(async u => {
        try { await cache.add(u); } catch (e) { /* best-effort: one missing file must not fail install */ }
      }));
    } catch (e) { /* best-effort only */ }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    // drop old TTS caches from earlier versions (never touch other caches:
    // the app's book-file Cache API fallback lives in its own cache).
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE && n.indexOf('gtts-') === 0).map(n => caches.delete(n)));
    // drop old app-shell caches from earlier versions
    await Promise.all(names.filter(n => n !== SHELL_CACHE && n.indexOf('app-shell-') === 0).map(n => caches.delete(n)));
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
  // v3.6: app shell — network-first, cache is only the offline fallback.
  if (isShellRequest(req)) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && req.cache !== 'no-store') {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch (e) {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        throw e;
      }
    })());
    return;
  }
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
