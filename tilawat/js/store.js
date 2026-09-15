const DB_NAME='tilawat';
const DB_VERSION=1;
let dbPromise=null;

export function openDB(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('tracks')){const s=db.createObjectStore('tracks',{keyPath:'id'});s.createIndex('addedAt','addedAt')}
      if(!db.objectStoreNames.contains('blobs'))db.createObjectStore('blobs');
      if(!db.objectStoreNames.contains('prefs'))db.createObjectStore('prefs');
    };
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null};resolve(db)};
    req.onerror=()=>{dbPromise=null;reject(req.error)};
    req.onblocked=()=>{dbPromise=null;reject(new Error('indexeddb-blocked'))};
  });
  return dbPromise;
}

async function tx(store,mode,fn){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    let t,req;
    try{t=db.transaction(store,mode);req=fn(t.objectStore(store))}catch(err){reject(err);return}
    t.oncomplete=()=>resolve(req?req.result:undefined);
    t.onerror=()=>reject(t.error);
    t.onabort=()=>reject(t.error||new Error('indexeddb-abort'));
  });
}

export const allTracks=()=>tx('tracks','readonly',s=>s.getAll());
export const putTrack=track=>tx('tracks','readwrite',s=>s.put(track));
export const getTrack=id=>tx('tracks','readonly',s=>s.get(id));
export const deleteTrack=id=>tx('tracks','readwrite',s=>s.delete(id));
export const putBlob=(k,b)=>tx('blobs','readwrite',s=>s.put(b,k));
export const getBlob=k=>tx('blobs','readonly',s=>s.get(k));
export const deleteBlob=k=>tx('blobs','readwrite',s=>s.delete(k));
export const blobKeys=()=>tx('blobs','readonly',s=>s.getAllKeys());
export const getPref=k=>tx('prefs','readonly',s=>s.get(k));
export const setPref=(k,v)=>tx('prefs','readwrite',s=>s.put(v,k));

export async function blobsSize(){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    let total=0;const t=db.transaction('blobs','readonly');const cur=t.objectStore('blobs').openCursor();
    cur.onsuccess=()=>{const c=cur.result;if(!c)return;if(c.value&&typeof c.value.size==='number')total+=c.value.size;c.continue()};
    t.oncomplete=()=>resolve(total);t.onerror=()=>reject(t.error);
  });
}
export function newId(){return't'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
