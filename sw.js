const DB_NAME = 'local-launcher-v1';
const DB_VERSION = 1;
const SHELL = 'local-shell-v2';
const SHELL_FILES = ['./','./index.html','./styles.css','./styles/base.css','./styles/components.css','./styles/timeline.css','./app.js','./js/core.js','./js/importer.js','./js/timeline.js','./js/main.js','./runner.html','./manifest.webmanifest','./assets/logo.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).catch(() => null));
  self.skipWaiting();
});
self.addEventListener('activate', event => event.waitUntil((async()=>{
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('local-shell-') && k !== SHELL).map(k => caches.delete(k)));
  await self.clients.claim();
})()));

function openDB(){
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=()=>{
      const db=r.result;
      if(!db.objectStoreNames.contains('projects')) db.createObjectStore('projects',{keyPath:'id'});
      if(!db.objectStoreNames.contains('versions')) { const s=db.createObjectStore('versions',{keyPath:'id'}); s.createIndex('projectId','projectId'); }
      if(!db.objectStoreNames.contains('objects')) db.createObjectStore('objects',{keyPath:'hash'});
      if(!db.objectStoreNames.contains('logs')) { const s=db.createObjectStore('logs',{keyPath:'id',autoIncrement:true}); s.createIndex('versionId','versionId'); s.createIndex('projectId','projectId'); }
    };
    r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
  });
}
const get=(db,store,key)=>new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const add=(db,store,val)=>new Promise((resolve,reject)=>{const r=db.transaction(store,'readwrite').objectStore(store).add(val);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});

function extType(path=''){
  const ext=(path.toLowerCase().split('.').pop()||'').split(/[?#]/)[0];
  return ({html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',cjs:'text/javascript; charset=utf-8',jsx:'text/javascript; charset=utf-8',ts:'text/plain; charset=utf-8',tsx:'text/plain; charset=utf-8',json:'application/json; charset=utf-8',map:'application/json; charset=utf-8',txt:'text/plain; charset=utf-8',xml:'application/xml; charset=utf-8',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',pdf:'application/pdf'})[ext]||'application/octet-stream';
}
function telemetry(projectId,versionId){
  const esc=s=>JSON.stringify(s);
  return `<script>(()=>{const P=${esc(projectId)},V=${esc(versionId)};const send=(level,args)=>{try{fetch('/__local_api/log',{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({projectId:P,versionId:V,level,args:args.map(v=>{try{return typeof v==='string'?v:JSON.stringify(v)}catch{return String(v)}}).slice(0,8),ts:Date.now()}),keepalive:true})}catch{}};['log','warn','error'].forEach(k=>{const o=console[k];console[k]=function(...a){send(k,a);return o.apply(console,a)}});addEventListener('error',e=>send('error',[e.message,(e.filename||'')+':'+(e.lineno||0)]));addEventListener('unhandledrejection',e=>send('error',['Unhandled promise rejection',String(e.reason)]));send('log',['[Local] started']);})();</script>`;
}

async function getVirtualResponse(projectId,versionId,path,request){
  const db=await openDB();
  const version=await get(db,'versions',versionId);
  if(!version || version.projectId!==projectId) return null;
  path=(path||'').replace(/^\/+/, '');
  if(!path) path=version.entry;
  let item=version.manifest.find(x=>x.path===path);
  if(!item && request?.headers?.get('accept')?.includes('text/html')) item=version.manifest.find(x=>x.path===version.entry);
  if(!item) return null;
  const obj=await get(db,'objects',item.hash);
  if(!obj) return new Response('Missing object',{status:404});
  const type=item.type||extType(item.path);
  if(type.startsWith('text/html')) {
    let html=await obj.blob.text();
    const inject=telemetry(projectId,versionId);
    html=html.includes('</body>')?html.replace(/<\/body\s*>/i,inject+'</body>'):html+inject;
    return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }
  return new Response(obj.blob,{headers:{'Content-Type':type,'Cache-Control':'no-store'}});
}

async function serveVirtual(req,url){
  const parts=url.pathname.split('/').filter(Boolean);
  const projectId=decodeURIComponent(parts[1]||'');
  const versionId=decodeURIComponent(parts[2]||'');
  const path=parts.slice(3).map(decodeURIComponent).join('/');
  return (await getVirtualResponse(projectId,versionId,path,req)) || new Response('Not found',{status:404});
}

function referrerVirtualContext(req){
  try{
    if(!req.referrer) return null;
    const r=new URL(req.referrer);
    if(r.origin!==self.location.origin || !r.pathname.startsWith('/__local__/')) return null;
    const parts=r.pathname.split('/').filter(Boolean);
    return {projectId:decodeURIComponent(parts[1]||''),versionId:decodeURIComponent(parts[2]||'')};
  }catch{return null;}
}

async function saveLog(req){
  try{
    const raw=await req.text();
    const data=JSON.parse(raw);
    if(!data || !data.projectId || !data.versionId) throw new Error('bad log');
    const db=await openDB(); await add(db,'logs',data); return new Response('',{status:204});
  }catch{return new Response('',{status:400});}
}

self.addEventListener('fetch', event=>{
  const url=new URL(event.request.url);
  if(url.origin===location.origin && url.pathname.startsWith('/__local__/')) {
    event.respondWith(serveVirtual(event.request,url)); return;
  }
  if(url.origin===location.origin && url.pathname==='/__local_api/log' && event.request.method==='POST') {
    event.respondWith(saveLog(event.request)); return;
  }
  if(event.request.method==='GET' && url.origin===location.origin) {
    const ctx=referrerVirtualContext(event.request);
    if(ctx && !url.pathname.startsWith('/__local_api/')) {
      event.respondWith((async()=>{
        const local=await getVirtualResponse(ctx.projectId,ctx.versionId,decodeURIComponent(url.pathname.replace(/^\//,'')),event.request);
        if(local) return local;
        try{return await fetch(event.request);}catch{return new Response('Not found',{status:404});}
      })());
      return;
    }
    event.respondWith((async()=>{
      try{return await fetch(event.request);}catch{
        const cached=await caches.match(event.request);
        return cached || caches.match('./index.html');
      }
    })());
  }
});
