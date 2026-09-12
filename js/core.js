export const DB_NAME='local-launcher-v1';
export const DB_VERSION=1;
export const TEXT_EXT=new Set(['html','htm','css','js','mjs','cjs','jsx','ts','tsx','json','md','txt','xml','svg','yml','yaml','toml','ini','scss','sass','less','vue','svelte']);
export const MIME={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',cjs:'text/javascript',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp4:'video/mp4',webm:'video/webm',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',pdf:'application/pdf'};

export function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'id'});if(!db.objectStoreNames.contains('versions')){const s=db.createObjectStore('versions',{keyPath:'id'});s.createIndex('projectId','projectId')}if(!db.objectStoreNames.contains('objects'))db.createObjectStore('objects',{keyPath:'hash'});if(!db.objectStoreNames.contains('logs')){const s=db.createObjectStore('logs',{keyPath:'id',autoIncrement:true});s.createIndex('versionId','versionId');s.createIndex('projectId','projectId')}};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function req(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function getAll(store,index=null,key=null){const db=await openDB();const tx=db.transaction(store);const s=index?tx.objectStore(store).index(index):tx.objectStore(store);return req(key==null?s.getAll():s.getAll(key))}
export async function getOne(store,key){const db=await openDB();return req(db.transaction(store).objectStore(store).get(key))}
export async function putOne(store,value){const db=await openDB();return req(db.transaction(store,'readwrite').objectStore(store).put(value))}
export async function logsFor(versionId){const db=await openDB();const idx=db.transaction('logs').objectStore('logs').index('versionId');const rows=await req(idx.getAll(versionId));return rows.sort((a,b)=>b.ts-a.ts).slice(0,150)}

export async function requestPersistentStorage(){try{if(navigator.storage?.persist)await navigator.storage.persist()}catch{}}
export async function storageSnapshot(){try{const e=await navigator.storage?.estimate?.();const persisted=await navigator.storage?.persisted?.();return{usage:e?.usage||0,quota:e?.quota||0,persisted:!!persisted}}catch{return{usage:0,quota:0,persisted:false}}}
export function safeThemeGet(){try{return localStorage.getItem('local-theme')}catch{return null}}
export function safeThemeSet(v){try{localStorage.setItem('local-theme',v)}catch{}}

export function fmtBytes(n=0){if(n<1024)return`${n} B`;if(n<1024**2)return`${(n/1024).toFixed(n>10240?0:1)} KB`;if(n<1024**3)return`${(n/1024**2).toFixed(n>1024**2*10?0:1)} MB`;return`${(n/1024**3).toFixed(1)} GB`}
export function fmtNumber(n=0){return new Intl.NumberFormat('ar-SA').format(n)}
export function fmtDate(ts){return new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short'}).format(new Date(ts))}
export function since(ts){const d=Date.now()-ts,day=864e5;if(d<6e4)return'الآن';if(d<36e5)return`قبل ${Math.max(1,Math.floor(d/6e4))} د`;if(d<day)return`قبل ${Math.floor(d/36e5)} س`;if(d<day*7)return`قبل ${Math.floor(d/day)} ي`;return new Intl.DateTimeFormat('ar-SA',{month:'short',day:'numeric'}).format(new Date(ts))}
export function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
export function normalizePath(p=''){return p.replace(/\\/g,'/').replace(/^\.\//,'').replace(/^\/+/, '').replace(/\/+/g,'/')}
export function ext(path=''){const b=path.toLowerCase().split('/').pop()||'';return b.includes('.')?b.split('.').pop():''}
export function mime(path,fileType=''){return fileType||MIME[ext(path)]||'application/octet-stream'}
export function uuid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`}
export async function hashBlob(blob){const h=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return[...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('')}
