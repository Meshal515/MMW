/* App shell only. Audio files live in IndexedDB when the user explicitly
   downloads/attaches them; network audio keeps native range requests intact. */
const VERSION = 'tilawat-v7';
const SHELL = `${VERSION}-shell`;
const ART = `${VERSION}-art`;
const SCOPE = new URL('./', self.location).pathname;

const PRECACHE = [
  './','./index.html','./styles.css','./manifest.webmanifest',
  './js/app.js','./js/store.js','./js/player.js','./js/sources.js','./js/covers.js','./js/reorder.js',
  './js/arabic.js','./js/model.js','./js/quality.js','./js/cover.js','./js/variants.js','./js/motion.js','./js/catalog/resolve.js',
  './vendor/gsap.min.js','./vendor/ScrollTrigger.min.js',
  './assets/logo.svg','./assets/covers/default.jpg','./assets/covers/dossari.jpg',
  './assets/icon-192.png','./assets/icon-512.png',
  '../assets/fonts/plex-ar-arabic-400.woff2','../assets/fonts/plex-ar-arabic-600.woff2','../assets/fonts/plex-ar-arabic-700.woff2',
  '../assets/fonts/plex-ar-latin-400.woff2','../assets/fonts/plex-ar-latin-600.woff2','../assets/fonts/plex-ar-latin-700.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(PRECACHE.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('tilawat-') && n !== SHELL && n !== ART).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

const isOurs = url => url.origin === self.location.origin && (url.pathname.startsWith(SCOPE) || url.pathname.includes('/assets/fonts/'));

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // Never intercept partial media requests; browsers need Range semantics for
  // instant seeking and reliable background audio.
  if (request.headers.has('range')) return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin && url.pathname.startsWith(SCOPE)) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(SHELL);
        cache.put('./index.html', fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  if (url.hostname === 'i.ytimg.com') {
    event.respondWith((async () => {
      const cache = await caches.open(ART);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      } catch { return new Response('', { status: 504 }); }
    })());
    return;
  }

  if (!isOurs(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(request);
    const network = fetch(request).then(fresh => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
      return fresh;
    }).catch(() => null);
    return hit || (await network) || Response.error();
  })());
});
