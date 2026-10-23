const DB_NAME='local-launcher-v1';
const DB_VERSION=1;
const SHELL='local-shell-v18';
const SHELL_FILES=['./','./index.html','./styles.css','./styles/base.css','./styles/components.css','./styles/timeline.css','./app.js','./js/core.js','./js/importer.js','./js/archive.js','./js/timeline.js','./js/main.js','./runner.html','./manifest.webmanifest','./assets/logo.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable-192.png','./assets/icon-maskable-512.png','./assets/fonts/plex-ar-arabic-400.woff2','./assets/fonts/plex-ar-latin-400.woff2','./assets/fonts/plex-ar-arabic-600.woff2','./assets/fonts/plex-ar-latin-600.woff2','./assets/fonts/plex-ar-arabic-700.woff2','./assets/fonts/plex-ar-latin-700.woff2'];

self.addEventListener('install',event=>{event.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_FILES)).catch(()=>null));self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('local-shell-')&&k!==SHELL).map(k=>caches.delete(k)));await self.clients.claim()})()));

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});if(!db.objectStoreNames.contains('versions')){const s=db.createObjectStore('versions',{keyPath:'id'});s.createIndex('projectId','projectId')}if(!db.objectStoreNames.contains('objects'))db.createObjectStore('objects',{keyPath:'hash'});if(!db.objectStoreNames.contains('logs')){const s=db.createObjectStore('logs',{keyPath:'id',autoIncrement:true});s.createIndex('versionId','versionId');s.createIndex('projectId','projectId')}};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
const get=(db,store,key)=>new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
const add=(db,store,val)=>new Promise((resolve,reject)=>{const r=db.transaction(store,'readwrite').objectStore(store).add(val);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
function cleanPath(v=''){const out=[];for(let part of String(v).replace(/\\/g,'/').split('/')){try{part=decodeURIComponent(part)}catch{}if(!part||part==='.')continue;if(part==='..'){out.pop();continue}out.push(part)}return out.join('/')}
function extType(path=''){const ext=(path.toLowerCase().split('.').pop()||'').split(/[?#]/)[0];return({html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',mjs:'text/javascript; charset=utf-8',cjs:'text/javascript; charset=utf-8',jsx:'text/javascript; charset=utf-8',json:'application/json; charset=utf-8',map:'application/json; charset=utf-8',txt:'text/plain; charset=utf-8',xml:'application/xml; charset=utf-8',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',pdf:'application/pdf',wasm:'application/wasm'})[ext]||'application/octet-stream'}
/* يُحقن في رأس كلّ مستندِ مشروعٍ قبل أيّ سكربتٍ له: نَسْبُ التخزين، ثمّ
   التقاطُ الكونسول. الترتيب مقصود — الأوّل يجب أن يسبق أيّ سطرٍ يكتبه المشروع. */
function runtime(projectId,versionId){const q=s=>JSON.stringify(s);return`<script data-local-runtime>(()=>{if(window.__LOCAL_RUNTIME__)return;window.__LOCAL_RUNTIME__=1;
var P=${q(projectId)},V=${q(versionId)},PFX='lp:'+P+':';

/* ── نَسْبُ التخزين ───────────────────────────────────────────────────────
   كلُّ المشاريع تعمل على أصلٍ واحد، فمخازنها كانت تختلط: أداتان تستعملان
   مفتاح "settings" تفسد إحداهما الأخرى، وحذفُ مشروعٍ لا يحرّر بياناته لأنّ
   Local لا يعرف أيّها له.

   فيُسبَق اسمُ كلِّ مخزنٍ بمعرّف المشروع. والتخزين يبقى **أصليًّا**: لا جسر،
   ولا رسائل، ولا محاكاة — فالمعاملات والمؤشّرات والفهارس كما هي بلا نقص.

   وهذا **نَسْبٌ لا عزلٌ أمنيّ**: يمنع التصادم والتسرّب بين مشاريعك، ولا يمنع
   كودًا يقصد الأذى — فذاك يحتاج أصلًا مستقلًّا، أي نطاقًا. */
try{
  var real=window.localStorage, realSession=window.sessionStorage;
  var wrap=function(store){
    var keys=function(){var out=[];for(var i=0;i<store.length;i++){var k=store.key(i);if(k&&k.indexOf(PFX)===0)out.push(k.slice(PFX.length))}return out};
    var api={
      getItem:function(k){return store.getItem(PFX+String(k))},
      setItem:function(k,v){store.setItem(PFX+String(k),String(v))},
      removeItem:function(k){store.removeItem(PFX+String(k))},
      clear:function(){var ks=keys();for(var i=0;i<ks.length;i++)store.removeItem(PFX+ks[i])},
      key:function(i){var ks=keys();return i>=0&&i<ks.length?ks[i]:null}
    };
    Object.defineProperty(api,'length',{get:function(){return keys().length},configurable:true});
    /* كثيرٌ من الأدوات تكتب store.theme='dark' لا setItem، والوسيط يجعل
       الشكلين يعملان — وهو ما يفعله localStorage الحقيقيّ. */
    if(typeof Proxy!=='function')return api;
    return new Proxy(api,{
      get:function(t,p){ if(p in t)return t[p]; if(typeof p==='string')return store.getItem(PFX+p); return undefined },
      set:function(t,p,v){ if(p in t){t[p]=v;return true} store.setItem(PFX+String(p),String(v)); return true },
      deleteProperty:function(t,p){ store.removeItem(PFX+String(p)); return true },
      has:function(t,p){ return (p in t)||store.getItem(PFX+String(p))!==null },
      ownKeys:function(){ return keys() },
      getOwnPropertyDescriptor:function(t,p){
        if(p in t)return Object.getOwnPropertyDescriptor(t,p);
        var v=store.getItem(PFX+String(p));
        return v===null?undefined:{value:v,writable:true,enumerable:true,configurable:true};
      }
    });
  };
  Object.defineProperty(window,'localStorage',{value:wrap(real),configurable:true});
  Object.defineProperty(window,'sessionStorage',{value:wrap(realSession),configurable:true});
}catch(e){}

try{
  var idb=window.indexedDB, open=idb.open.bind(idb), del=idb.deleteDatabase.bind(idb);
  var list=idb.databases?idb.databases.bind(idb):null;
  var shim=Object.create(Object.getPrototypeOf(idb));
  shim.open=function(n,v){return v===undefined?open(PFX+n):open(PFX+n,v)};
  shim.deleteDatabase=function(n){return del(PFX+n)};
  shim.cmp=idb.cmp.bind(idb);
  if(list)shim.databases=function(){return list().then(function(all){
    return all.filter(function(d){return d.name&&d.name.indexOf(PFX)===0})
              .map(function(d){return {name:d.name.slice(PFX.length),version:d.version}})})};
  Object.defineProperty(window,'indexedDB',{value:shim,configurable:true});
}catch(e){}

try{
  if(window.caches){
    var cs=window.caches, cOpen=cs.open.bind(cs), cHas=cs.has.bind(cs), cDel=cs.delete.bind(cs), cKeys=cs.keys.bind(cs), cMatch=cs.match.bind(cs);
    Object.defineProperty(window,'caches',{configurable:true,value:{
      open:function(n){return cOpen(PFX+n)},
      has:function(n){return cHas(PFX+n)},
      'delete':function(n){return cDel(PFX+n)},
      match:function(r,o){return cMatch(r,o)},
      keys:function(){return cKeys().then(function(ks){return ks.filter(function(k){return k.indexOf(PFX)===0}).map(function(k){return k.slice(PFX.length)})})}
    }});
  }
}catch(e){}

/* ── التقاط الكونسول ─────────────────────────────────────────────────── */
var BENIGN=/^(?:Uncaught )?ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i;
var gate=new Map();
var allow=function(sig){var now=Date.now(),e=gate.get(sig);if(e&&now-e.t<1000){e.n++;return -1}var n=e?e.n:0;gate.set(sig,{t:now,n:0});if(gate.size>60)gate.clear();return n};
var fmt=function(v){try{return typeof v==='string'?v:v instanceof Error?(v.stack||v.message):JSON.stringify(v)}catch(e){return String(v)}};
var send=function(level,args){try{
  var listArr=Array.prototype.slice.call(args||[]).map(fmt).slice(0,8);
  var held=allow(level+'|'+listArr.join(' ').slice(0,200));
  if(held<0)return;
  if(held>0)listArr=listArr.concat(['(كُتم '+held+' تكرارًا مطابقًا)']);
  fetch('/__local_api/log',{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({projectId:P,versionId:V,level:level,args:listArr,ts:Date.now()}),keepalive:true})
}catch(e){}};
['log','info','warn','error','debug'].forEach(function(k){var o=console[k]?console[k].bind(console):function(){};console[k]=function(){send(k,arguments);o.apply(null,arguments)}});
addEventListener('error',function(e){var m=e.message||'';
  if(BENIGN.test(m))return send('warn',[m,'— إشعار متصفّح حميد: يصحّح نفسه في الإطار التالي، ولم يُرمَ استثناء']);
  send('error',[m,(e.filename||'')+':'+(e.lineno||0)])});
addEventListener('unhandledrejection',function(e){send('error',['Unhandled promise rejection',e.reason])});
send('info',['[Local] started'])})();</script>`}

async function getVirtualResponse(projectId,versionId,path,request){const db=await openDB(),version=await get(db,'versions',versionId);if(!version||version.projectId!==projectId)return null;path=cleanPath(path||'')||version.entry;const byPath=new Map(version.manifest.map(x=>[x.path,x]));const entryDir=String(version.entry||'').includes('/')?String(version.entry).split('/').slice(0,-1).join('/'):'';const tryPaths=[path,path?path+'/index.html':'index.html',path?path+'/index.htm':''];if(entryDir){const rel=cleanPath(entryDir+'/'+path);tryPaths.push(rel,rel+'/index.html')}let item=null;for(const cand of tryPaths){if(!cand)continue;const found=byPath.get(cand);if(found){item=found;path=cand;break}}if(!item&&request?.headers?.get('accept')?.includes('text/html')){path=version.entry;item=version.manifest.find(x=>x.path===version.entry)}if(!item)return null;const obj=await get(db,'objects',item.hash);if(!obj)return new Response('Missing object',{status:404});const type=item.type||extType(item.path);if(type.startsWith('text/html')){let html=await obj.blob.text();html=html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi,'');const inject=runtime(projectId,versionId);html=/<head[\s>]/i.test(html)?html.replace(/<head([^>]*)>/i,`<head$1>${inject}`):inject+html;return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})}return new Response(obj.blob,{headers:{'Content-Type':type,'Cache-Control':'no-store'}})}

async function serveVirtual(req,url){const parts=url.pathname.split('/').filter(Boolean),projectId=decodeURIComponent(parts[1]||''),versionId=decodeURIComponent(parts[2]||''),path=parts.slice(3).map(x=>{try{return decodeURIComponent(x)}catch{return x}}).join('/');return(await getVirtualResponse(projectId,versionId,path,req))||new Response('Not found',{status:404})}
function referrerVirtualContext(req){try{if(!req.referrer)return null;const r=new URL(req.referrer);if(r.origin!==self.location.origin||!r.pathname.startsWith('/__local__/'))return null;const parts=r.pathname.split('/').filter(Boolean);return{projectId:decodeURIComponent(parts[1]||''),versionId:decodeURIComponent(parts[2]||'')}}catch{return null}}
/* 204 is a null-body status: passing it any body at all — even '' — makes the
   Response constructor throw, which is how a log that was written fine still
   answered 400. */
async function saveLog(req){try{const data=JSON.parse(await req.text());if(!data?.projectId||!data?.versionId)return new Response('',{status:400});const db=await openDB();await add(db,'logs',data);pruneLogs(db,data.versionId).catch(()=>{});return new Response(null,{status:204})}catch{return new Response('',{status:400})}}
/* Each IndexedDB transaction dies as soon as control leaves the task that
   created it, so the key lookup and the deletes need separate transactions. */
async function pruneLogs(db,versionId){const keys=await new Promise((resolve,reject)=>{const r=db.transaction('logs').objectStore('logs').index('versionId').getAllKeys(versionId);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(keys.length<=300)return;const tx=db.transaction('logs','readwrite'),store=tx.objectStore('logs');for(const k of keys.slice(0,keys.length-300))store.delete(k);await new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}

/* ── ما يصل من قائمة المشاركة ───────────────────────────────────────────────
   هدفُ مشاركةٍ بـPOST يستقبله عاملُ الخدمة لا الصفحة، فالملفّ يُودَع في مخزنٍ
   مؤقّتٍ ثمّ يُحوَّل المتصفّح إلى الصفحة لتلتقطه.

   والإيداعُ في Cache API لا في IndexedDB عمدًا: قاعدة البيانات مفتوحةٌ بالفعل
   في الصفحة بنسختها الأولى، وإضافةُ مخزنٍ تعني رفعَ رقم النسخة — وترقيةٌ
   محجوبةٌ باتّصالٍ مفتوح تعلّق كلَّ شيءٍ بلا خطأٍ ظاهر. */
const INBOX='local-inbox';
async function receiveShare(request){
  try{
    const form=await request.formData();
    const files=form.getAll('file').filter(f=>f&&typeof f.size==='number'&&f.size>0);
    if(files.length){
      const cache=await caches.open(INBOX);
      for(let i=0;i<files.length;i++){
        const f=files[i];
        /* ترويسات HTTP لاتينيّةٌ فقط، واسمُ الملفّ قد يكون عربيًّا. */
        await cache.put(`${self.location.origin}/__inbox/${Date.now()}-${i}`,
          new Response(f,{headers:{
            'Content-Type':f.type||'application/octet-stream',
            'X-Local-Name':encodeURIComponent(f.name||'shared'),
          }}));
      }
    }
  }catch(err){ /* يُحوَّل على أيّ حال، فالصفحة تخبره أنّ شيئًا لم يصل */ }
  return Response.redirect('./?share=1',303);
}

self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method==='POST'&&url.origin===location.origin&&url.pathname.endsWith('/share-target')){event.respondWith(receiveShare(event.request));return}if(url.origin===location.origin&&url.pathname.startsWith('/__local__/')){event.respondWith(serveVirtual(event.request,url));return}if(url.origin===location.origin&&url.pathname==='/__local_api/log'&&event.request.method==='POST'){event.respondWith(saveLog(event.request));return}if(event.request.method==='GET'&&url.origin===location.origin){const ctx=referrerVirtualContext(event.request);if(ctx&&!url.pathname.startsWith('/__local_api/')){event.respondWith((async()=>{const local=await getVirtualResponse(ctx.projectId,ctx.versionId,cleanPath(url.pathname),event.request);if(local)return local;try{return await fetch(event.request)}catch{return new Response('Not found',{status:404})}})());return}event.respondWith((async()=>{try{const fresh=await fetch(event.request);if(fresh.ok){const cache=await caches.open(SHELL);cache.put(event.request,fresh.clone()).catch(()=>{})}return fresh}catch{const cached=await caches.match(event.request);return cached||(event.request.mode==='navigate'?await caches.match('./index.html'):Response.error())}})())}});
