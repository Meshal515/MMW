const VERSION='tilawat-v32';
const SHELL=`${VERSION}-shell`;

/* Everything index.html actually loads. Keep this list in step with the <link>
   and <script> tags and with the module graph under ./js — a name that is not
   here is a file the app cannot open without a network. */
const PRECACHE=[
  './','./index.html','./manifest.webmanifest',

  './v2.css','./identity.css','./v14.css','./v15.css','./classic.css',
  './interaction-v28.css','./favorites.css','./motion-system.css','./multipart.css','./library-membership.css',

  './js/v2.js','./js/store.js','./js/multipart-state.js','./js/app-logic.js','./js/player.js',
  './js/reorder.js','./js/ui-dossari-only.js','./js/classic-ui.js','./js/interaction-v28.js',
  './js/favorites.js','./js/motion-system.js','./js/multipart-ui.js','./js/recitation-edit.js',
  './js/library-membership.js','./js/catalog/core.js','./js/catalog/mp3quran.js',

  './vendor/gsap/gsap.min.js',

  './assets/fonts/plex-ar-arabic-400.woff2','./assets/fonts/plex-ar-arabic-600.woff2','./assets/fonts/plex-ar-arabic-700.woff2',

  './assets/logo.svg','./assets/icon-192.png','./assets/icon-512.png',
  './assets/icon-maskable-192.png','./assets/icon-maskable-512.png',

  './assets/covers/default.jpg','./assets/covers/dossari.jpg',
  './assets/covers/dossari-1.jpg','./assets/covers/dossari-2.jpg','./assets/covers/dossari-3.jpg',
  './assets/covers/dossari-4.jpg','./assets/covers/dossari-5.jpg',
  './assets/covers/fallback-1.jpg','./assets/covers/fallback-2.jpg','./assets/covers/fallback-3.jpg'
];

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(SHELL);
  await Promise.all(PRECACHE.map(url=>cache.add(url).catch(()=>{})));
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(name=>name.startsWith('tilawat-')&&name!==SHELL).map(name=>caches.delete(name)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||request.headers.has('range'))return;
  const url=new URL(request.url);

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(request);
        const cache=await caches.open(SHELL);
        cache.put('./index.html',fresh.clone()).catch(()=>{});
        return fresh;
      }catch{
        return (await caches.match('./index.html'))||Response.error();
      }
    })());
    return;
  }

  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/'))return;

  event.respondWith((async()=>{
    const cache=await caches.open(SHELL);
    const fromNetwork=async()=>{
      const response=await fetch(request).catch(()=>null);
      if(response?.ok)cache.put(request,response.clone()).catch(()=>{});
      return response;
    };

    /* Code should be the deployed version; the cache is the offline answer. */
    if(/\.(?:html|css|js|json|webmanifest)$/i.test(url.pathname))
      return (await fromNetwork())||(await cache.match(request))||Response.error();

    /* Images, fonts and media do not change under the same name, so a hit is
       the answer. The previous version started the network request before it
       looked, which meant every cover and every font came down the wire again
       on every visit even though the cache already held them. */
    return (await cache.match(request))||(await fromNetwork())||Response.error();
  })());
});
