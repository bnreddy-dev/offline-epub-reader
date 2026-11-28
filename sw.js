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
/* v3.6.5 (U): SHELL_CACHE bumped to app-shell-v3. The cache name is also
   the per-release key for the cache-busted shell fetch (see below) — it is
   bumped every release, so one name change covers both. */
const SHELL_CACHE = 'app-shell-v3';
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
        try {
          // v3.6.5 (U): cache.add() fetches with the default cache mode, so
          // a new worker installing inside the CDN's max-age window could
          // precache the STALE shell (the v3.6.4 live test: the banner only
          // appeared on a later fresh-tab load). Fetch with no-store + the
          // release buster so the precache holds the fresh build; store
          // under the plain URL (the offline fallback matches ignoring
          // search). Best-effort: one missing file must not fail install.
          const busted = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'sw=' + encodeURIComponent(SHELL_CACHE);
          const res = await fetch(busted, { cache: 'no-store' });
          if (res && res.ok) await cache.put(u, res);
        } catch (e) { /* best-effort: one missing file must not fail install */ }
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
        // v3.6.4 (F77): `fetch(req)` inherits the request's default cache
        // mode, so the browser HTTP cache could satisfy it without any
        // network trip — "network-first" was HTTP-cache-first in practice,
        // and a stale shell was served (and re-put into the cache) for the
        // whole max-age window. `no-store` makes the network trip real.
        // v3.6.5 (U): `no-store` bypasses the BROWSER cache but NOT the
        // CDN edge — GitHub Pages answers plain URLs from its own cache
        // for max-age=600 after a deploy, so a plain navigation re-served
        // the stale build inside the window (v3.6.4 live test: two hard
        // refreshes still served 3.6.3, banner only on a later fresh tab).
        // A per-release query string is a NEW edge key, so the edge fetches
        // the fresh build from origin. The key is SHELL_CACHE, bumped
        // every release: stable within a release (the edge caches it after
        // the first fetch) and fresh on the next release. The response is
        // still stored under the ORIGINAL request (plain URL) for the
        // offline fallback. This matters most for the NEXT transition:
        // the 3.6.5 worker (with the buster) is the one controlling when
        // 3.6.6 ships, so its navigations fetch fresh immediately.
        const u = new URL(req.url);
        u.searchParams.set('sw', SHELL_CACHE);
        const res = await fetch(u.toString(), { cache: 'no-store' });
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
      // v3.6.5 (b): a no-cors cross-origin fetch returns an OPAQUE response
      // (status 0, type 'opaque') — never 200. The old `res.status === 200`
      // check could therefore NEVER pass, so the SW never cached any Google
      // TTS audio, gtts-v3 stayed empty, and the Languages panel always
      // showed Telugu/Hindi as "Not downloaded" even after they had
      // downloaded and played (and verifyLangStatus then deleted the
      // downloaded flag). The Cache API is designed to store opaque
      // responses — that is the whole point of this handler. Accept them.
      // (A 404 from Google would also be opaque, but the no-referrer
      // request is the proven F11 fix for the 404, so a cached entry here
      // is a real clip.)
      if (res && (res.status === 200 || res.type === 'opaque')) {
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
