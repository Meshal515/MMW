export const DB_NAME='local-launcher-v1';
export const DB_VERSION=1;
export const TEXT_EXT=new Set(['html','htm','css','js','mjs','cjs','jsx','ts','tsx','json','md','txt','xml','svg','yml','yaml','toml','ini','scss','sass','less','vue','svelte']);
export const MIME={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',cjs:'text/javascript',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',pdf:'application/pdf'};

/* One connection for the whole page. Opening a fresh one per call leaked a
   connection on every read and blocked any future version upgrade. */
let dbPromise=null;
export function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,DB_VERSION);
    r.onupgradeneeded=()=>{const db=r.result;
      if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});
      if(!db.objectStoreNames.contains('versions')){const s=db.createObjectStore('versions',{keyPath:'id'});s.createIndex('projectId','projectId')}
      if(!db.objectStoreNames.contains('objects'))db.createObjectStore('objects',{keyPath:'hash'});
      if(!db.objectStoreNames.contains('logs')){const s=db.createObjectStore('logs',{keyPath:'id',autoIncrement:true});s.createIndex('versionId','versionId');s.createIndex('projectId','projectId')}};
    r.onsuccess=()=>{const db=r.result;db.onclose=()=>{dbPromise=null};resolve(db)};
    r.onerror=()=>{dbPromise=null;reject(r.error)};
  });
  return dbPromise;
}
function req(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
/* Resolve on transaction commit, not just on request success, so a caller that
   awaits a write knows the write is durable. */
function done(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}

export async function getAll(store,index=null,key=null){const db=await openDB();const tx=db.transaction(store);const s=index?tx.objectStore(store).index(index):tx.objectStore(store);return req(key==null?s.getAll():s.getAll(key))}
export async function getOne(store,key){const db=await openDB();return req(db.transaction(store).objectStore(store).get(key))}
export async function putOne(store,value){const db=await openDB();const tx=db.transaction(store,'readwrite');const r=req(tx.objectStore(store).put(value));await done(tx);return r}
export async function putMany(store,values){const db=await openDB();const tx=db.transaction(store,'readwrite');const s=tx.objectStore(store);for(const v of values)s.put(v);return done(tx)}
export async function logsFor(versionId){const db=await openDB();const idx=db.transaction('logs').objectStore('logs').index('versionId');const rows=await req(idx.getAll(versionId));return rows.sort((a,b)=>b.ts-a.ts).slice(0,150)}

export async function requestPersistentStorage(){try{if(navigator.storage?.persist)await navigator.storage.persist()}catch{}}
export async function storageSnapshot(){try{const e=await navigator.storage?.estimate?.();const persisted=await navigator.storage?.persisted?.();return{usage:e?.usage||0,quota:e?.quota||0,persisted:!!persisted}}catch{return{usage:0,quota:0,persisted:false}}}
export function safeThemeGet(){try{return localStorage.getItem('local-theme')}catch{return null}}
export function safeThemeSet(v){try{localStorage.setItem('local-theme',v)}catch{}}

/* Arabic wording, Gregorian calendar, Latin digits.
   Plain 'ar-SA' gave Hijri dates and Arabic-Indic numerals, so "٥ ملف" sat next
   to "631 B" in the same row and ٥ reads as a zero. One numeral system only. */
const LOCALE='ar-u-ca-gregory-nu-latn';
const NUM=new Intl.NumberFormat(LOCALE);
const DATE=new Intl.DateTimeFormat(LOCALE,{dateStyle:'medium',timeStyle:'short'});
const SHORT=new Intl.DateTimeFormat(LOCALE,{month:'short',day:'numeric'});

export function fmtBytes(n=0){if(n<1024)return`${n} B`;if(n<1024**2)return`${(n/1024).toFixed(n>10240?0:1)} KB`;if(n<1024**3)return`${(n/1024**2).toFixed(n>1024**2*10?0:1)} MB`;return`${(n/1024**3).toFixed(1)} GB`}
export function fmtNumber(n=0){return NUM.format(n)}
export function fmtDate(ts){return DATE.format(new Date(ts))}
export function fmtDateShort(ts){return SHORT.format(new Date(ts))}
export function since(ts){const d=Date.now()-ts,day=864e5;if(d<6e4)return'الآن';if(d<36e5)return`قبل ${Math.max(1,Math.floor(d/6e4))} د`;if(d<day)return`قبل ${Math.floor(d/36e5)} س`;if(d<day*7)return`قبل ${Math.floor(d/day)} ي`;return SHORT.format(new Date(ts))}
/* Arabic plurals: 1 and 2 have their own forms, 3-10 take the plural, 11+ the singular. */
export function plural(n,one,two,few,many){const a=Math.abs(n);if(a===1)return one;if(a===2)return two;if(a%100>=3&&a%100<=10)return few;return many}

export function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
/* Latin text inside an Arabic sentence must be isolated or the bidi algorithm
   reorders it: "91 KB / 851 MB" was rendering as "KB / 851 MB 91". */
export function bdi(s=''){return`<bdi>${esc(s)}</bdi>`}
export function normalizePath(p=''){return p.replace(/\\/g,'/').replace(/^\.\//,'').replace(/^\/+/, '').replace(/\/+/g,'/')}
export function ext(path=''){const b=path.toLowerCase().split('/').pop()||'';return b.includes('.')?b.split('.').pop():''}
export function mime(path,fileType=''){return fileType||MIME[ext(path)]||'application/octet-stream'}
export function uuid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`}
export async function hashBlob(blob){const h=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')}
