/* Tilawat 2.0 app shell. Audio stays native/IndexedDB; Range requests are never intercepted. */
const VERSION='tilawat-v5';
const SHELL=`${VERSION}-shell`;
const ART=`${VERSION}-art`;
const SCOPE=new URL('./',self.location).pathname;
const PRECACHE=[
  './','./index.html','./v2.css','./manifest.webmanifest',
  './js/v2.js','./js/store.js','./js/catalog/core.js','./js/catalog/mp3quran.js',
  './assets/logo.svg','./assets/covers/default.jpg','./assets/covers/dossari.jpg',
  './assets/icon-192.png','./assets/icon-512.png',
  '../assets/fonts/plex-ar-arabic-400.woff2','../assets/fonts/plex-ar-arabic-600.woff2','../assets/fonts/plex-ar-arabic-700.woff2'
];
self.addEventListener('install',event=>event.waitUntil((async()=>{const c=await caches.open(SHELL);await Promise.all(PRECACHE.map(u=>c.add(u).catch(()=>{})));await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{const names=await caches.keys();await Promise.all(names.filter(n=>n.startsWith('tilawat-')&&n!==SHELL&&n!==ART).map(n=>caches.delete(n)));await self.clients.claim()})()));
const isOurs=url=>url.origin===self.location.origin&&(url.pathname.startsWith(SCOPE)||url.pathname.includes('/assets/fonts/'));
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET'||req.headers.has('range'))return;const url=new URL(req.url);
  if(req.mode==='navigate'&&url.origin===self.location.origin&&url.pathname.startsWith(SCOPE)){
    event.respondWith((async()=>{try{const fresh=await fetch(req);const c=await caches.open(SHELL);c.put('./index.html',fresh.clone()).catch(()=>{});return fresh}catch{return(await caches.match('./index.html'))||Response.error()}})());return;
  }
  if(url.hostname==='i.ytimg.com'){
    event.respondWith((async()=>{const c=await caches.open(ART);const hit=await c.match(req);if(hit)return hit;try{const fresh=await fetch(req);if(fresh?.ok)c.put(req,fresh.clone()).catch(()=>{});return fresh}catch{return new Response('',{status:504})}})());return;
  }
  if(!isOurs(url))return;
  event.respondWith((async()=>{const c=await caches.open(SHELL),hit=await c.match(req);const network=fetch(req).then(f=>{if(f?.ok)c.put(req,f.clone()).catch(()=>{});return f}).catch(()=>null);return hit||(await network)||Response.error()})());
});
