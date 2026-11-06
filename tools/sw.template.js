// The service worker, filled in by tools/pwa.ts at build time. It keeps every file of the
// build, so the game plays offline, and fetches a new version in the background: it
// shows up the next time the game is opened.

const CACHE = 'the-line-__VERSION__';
const FILES = __FILES__;
/** The title font comes from here. Kept as it is used, since it can't be listed in advance. */
const FONTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('the-line-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const font = FONTS.includes(url.origin);
  if (url.origin !== location.origin && !font) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: !font }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (font) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      });
    }),
  );
});
