const DB_NAME='tilawat';
const DB_VERSION=2;
let dbPromise=null;

function timed(promise,ms,label='indexeddb-timeout'){
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label)),ms)})
  ]).finally(()=>clearTimeout(timer));
}

export function openDB(){
  if(dbPromise)return dbPromise;
  const pending=new Promise((resolve,reject)=>{
    let settled=false;
    const fail=err=>{if(settled)return;settled=true;dbPromise=null;reject(err)};
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('tracks')){const s=db.createObjectStore('tracks',{keyPath:'id'});s.createIndex('addedAt','addedAt')}
      if(!db.objectStoreNames.contains('blobs'))db.createObjectStore('blobs');
      if(!db.objectStoreNames.contains('prefs'))db.createObjectStore('prefs');
    };
    req.onsuccess=()=>{
      if(settled){try{req.result.close()}catch{}return}
      settled=true;
      const db=req.result;
      db.onversionchange=()=>{db.close();dbPromise=null};
      db.onclose=()=>{dbPromise=null};
      resolve(db);
    };
    req.onerror=()=>fail(req.error||new Error('indexeddb-open-error'));
    req.onblocked=()=>fail(new Error('indexeddb-blocked'));
  });
  dbPromise=timed(pending,5000,'indexeddb-open-timeout').catch(err=>{dbPromise=null;throw err});
  return dbPromise;
}

async function tx(store,mode,fn,timeoutMs=30000){
  const db=await openDB();
  const pending=new Promise((resolve,reject)=>{
    let t,req,settled=false;
    const finish=(ok,value)=>{if(settled)return;settled=true;ok?resolve(value):reject(value)};
    try{t=db.transaction(store,mode);req=fn(t.objectStore(store))}catch(err){finish(false,err);return}
    if(req)req.onerror=()=>finish(false,req.error||new Error('indexeddb-request-error'));
    t.oncomplete=()=>finish(true,req?req.result:undefined);
    t.onerror=()=>finish(false,t.error||new Error('indexeddb-transaction-error'));
    t.onabort=()=>finish(false,t.error||new Error('indexeddb-abort'));
  });
  return timed(pending,timeoutMs,`indexeddb-${store}-timeout`);
}

export const allTracks=()=>tx('tracks','readonly',s=>s.getAll(),6000);
export const putTrack=track=>tx('tracks','readwrite',s=>s.put(track),12000);
export const getTrack=id=>tx('tracks','readonly',s=>s.get(id),6000);
export const deleteTrack=id=>tx('tracks','readwrite',s=>s.delete(id),12000);
export const putBlob=(k,b)=>tx('blobs','readwrite',s=>s.put(b,k),120000);
export const getBlob=k=>tx('blobs','readonly',s=>s.get(k),15000);
export const deleteBlob=k=>tx('blobs','readwrite',s=>s.delete(k),30000);
export const blobKeys=()=>tx('blobs','readonly',s=>s.getAllKeys(),10000);
export const getPref=k=>tx('prefs','readonly',s=>s.get(k),5000);
export const setPref=(k,v)=>tx('prefs','readwrite',s=>s.put(v,k),10000);

export async function blobsSize(){
  const db=await openDB();
  const pending=new Promise((resolve,reject)=>{
    let total=0,settled=false;
    const t=db.transaction('blobs','readonly');
    const cur=t.objectStore('blobs').openCursor();
    cur.onsuccess=()=>{const c=cur.result;if(!c)return;if(c.value&&typeof c.value.size==='number')total+=c.value.size;c.continue()};
    cur.onerror=()=>{if(!settled){settled=true;reject(cur.error||new Error('indexeddb-cursor-error'))}};
    t.oncomplete=()=>{if(!settled){settled=true;resolve(total)}};
    t.onerror=()=>{if(!settled){settled=true;reject(t.error||new Error('indexeddb-transaction-error'))}};
    t.onabort=()=>{if(!settled){settled=true;reject(t.error||new Error('indexeddb-abort'))}};
  });
  return timed(pending,30000,'indexeddb-size-timeout');
}
export function newId(){return't'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
