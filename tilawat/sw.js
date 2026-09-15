/* Tilawat Yasser-only app shell. Audio stays native/IndexedDB; Range requests are never intercepted. */
const VERSION='tilawat-v7';
const SHELL=`${VERSION}-shell`;
const SCOPE=new URL('./',self.location).pathname;
const PRECACHE=[
  './','./index.html','./v2.css','./classic.css','./manifest.webmanifest',
  './js/v2.js','./js/store.js','./js/catalog/core.js','./js/catalog/mp3quran.js',
  './js/ui-dossari-only.js','./js/classic-ui.js',
  './assets/logo.svg','./assets/covers/default.jpg',
  './assets/covers/dossari-1.jpg','./assets/covers/dossari-2.jpg','./assets/covers/dossari-3.jpg','./assets/covers/dossari-4.jpg','./assets/covers/dossari-5.jpg',
  './assets/icon-192.png','./assets/icon-512.png',
  '../assets/fonts/plex-ar-arabic-400.woff2','../assets/fonts/plex-ar-arabic-600.woff2','../assets/fonts/plex-ar-arabic-700.woff2'
];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const c=await caches.open(SHELL);
  await Promise.all(PRECACHE.map(u=>c.add(u).catch(()=>{})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const names=await caches.keys();
  await Promise.all(names.filter(n=>n.startsWith('tilawat-')&&n!==SHELL).map(n=>caches.delete(n)));
  await self.clients.claim();
})()));
const isOurs=url=>url.origin===self.location.origin&&(url.pathname.startsWith(SCOPE)||url.pathname.includes('/assets/fonts/'));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||req.headers.has('range'))return;
  const url=new URL(req.url);

  if(req.mode==='navigate'&&url.origin===self.location.origin&&url.pathname.startsWith(SCOPE)){
    event.respondWith((async()=>{
      try{const fresh=await fetch(req);const c=await caches.open(SHELL);c.put('./index.html',fresh.clone()).catch(()=>{});return fresh}
      catch{return(await caches.match('./index.html'))||Response.error()}
    })());return;
  }

  // No remote artwork: old YouTube thumbnails resolve to the bundled Quran fallback.
  if(url.hostname==='i.ytimg.com'){
    event.respondWith((async()=>{
      const c=await caches.open(SHELL);
      return (await c.match('./assets/covers/default.jpg')) || fetch('./assets/covers/default.jpg');
    })());return;
  }

  if(!isOurs(url))return;
  event.respondWith((async()=>{
    const c=await caches.open(SHELL),hit=await c.match(req);
    const network=fetch(req).then(f=>{if(f?.ok)c.put(req,f.clone()).catch(()=>{});return f}).catch(()=>null);
    return hit||(await network)||Response.error();
  })());
});
