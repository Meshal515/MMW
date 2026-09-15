import { dossariImage } from '../ui-dossari-only.js';
import { SURAHS, normalizeVariant } from './core.js';

/*
  The public catalogue is intentionally tiny: Yasser Al-Dosari only.
  1) Ramadan 1425 AH recordings from the dedicated archive collection.
  2) The standard murattal mushaf.
  No other reciter is fetched or exposed by this module.
*/

const RECITER = { id: 92, name: 'ياسر الدوسري' };
const CATALOG_WORKER = 'https://tilawat-catalog.ngm-309.workers.dev';
const ARCHIVE_1425_ID = 'yasser_aldosary_alro7_net';
const ARCHIVE_1425_PAGE = 'https://mazameer.com/vb/threads/186322/';
const ARCHIVE_1425_DOWNLOAD = `https://archive.org/download/${ARCHIVE_1425_ID}/`;
const MURATTAL_SERVER = 'https://server11.mp3quran.net/yasser/';
const ALL_SURAHS = Array.from({length:114},(_,i)=>i+1);
let cache = null;

function listString(ids){ return ids.map(Number).filter(n=>n>=1&&n<=114).sort((a,b)=>a-b).join(','); }
function filenameOf(file){
  if(file?.name) return String(file.name);
  try { return decodeURIComponent(new URL(file?.url||'').pathname.split('/').pop()||''); }
  catch { return ''; }
}
function audioMapFromFiles(files=[]){
  const map={};
  for(const file of files){
    const name=filenameOf(file);
    const m=name.match(/^0*(\d{1,3})\.mp3$/i);
    if(!m) continue;
    const id=Number(m[1]); if(id<1||id>114) continue;
    map[id]=file.url || `${ARCHIVE_1425_DOWNLOAD}${String(id).padStart(3,'0')}.mp3`;
  }
  return map;
}

async function fetch1425Map(){
  let files=[];
  try{
    const r=await fetch(`${CATALOG_WORKER}/api/archive?id=${encodeURIComponent(ARCHIVE_1425_ID)}`,{headers:{accept:'application/json'}});
    if(r.ok){ const d=await r.json(); if(d?.ok&&Array.isArray(d.files)) files=d.files; }
  }catch{}

  // Internet Archive metadata is a fallback only; it is still the same 1425 source.
  if(!files.length){
    try{
      const r=await fetch(`https://archive.org/metadata/${ARCHIVE_1425_ID}`,{headers:{accept:'application/json'}});
      if(r.ok){
        const d=await r.json();
        files=(d?.files||[]).map(f=>({
          name:f.name,
          url:`${ARCHIVE_1425_DOWNLOAD}${encodeURIComponent(f.name||'')}`,
          bitrate:Number(String(f.bitrate||'').replace(/\D/g,''))||0,
          duration:Math.round(Number(f.length)||0)||0,
          fileSize:Number(f.size)||0
        }));
      }
    }catch{}
  }

  const map=audioMapFromFiles(files);
  // Two files are explicitly documented in the 1425 archive thread; keep them as a tiny safe fallback.
  if(!Object.keys(map).length){
    map[42]=`${ARCHIVE_1425_DOWNLOAD}042.mp3`;
    map[43]=`${ARCHIVE_1425_DOWNLOAD}043.mp3`;
  }
  return map;
}

function murattalMoshaf(){
  return {
    // v2's catalogue click path serializes IDs and parses them as numbers.
    // Keep the two collection IDs numeric so tapping a surah always resolves.
    id:1,
    name:'المصحف المرتل',
    server:MURATTAL_SERVER,
    surah_total:114,
    surah_list:listString(ALL_SURAHS),
    source:'mp3quran'
  };
}
function archive1425Moshaf(map){
  const ids=Object.keys(map).map(Number).filter(n=>n>=1&&n<=114).sort((a,b)=>a-b);
  return {
    id:1425,
    name:'رمضان 1425هـ',
    server:'',
    surah_total:ids.length,
    surah_list:listString(ids),
    audio_map:map,
    source:'archive1425',
    source_page:ARCHIVE_1425_PAGE
  };
}

export async function fetchReciters({force=false}={}){
  if(cache&&!force) return cache;
  const map=await fetch1425Map();
  cache=[{
    ...RECITER,
    moshaf:[archive1425Moshaf(map),murattalMoshaf()]
  }];
  return cache;
}

export function surahUrl(moshaf,surahId){
  const id=Number(surahId);
  if(moshaf?.audio_map?.[id]) return moshaf.audio_map[id];
  const base=String(moshaf?.server||'').replace(/\/?$/,'/');
  return base ? base+String(id).padStart(3,'0')+'.mp3' : '';
}
export function hasSurah(moshaf,id){
  return String(moshaf?.surah_list||'').split(',').map(Number).includes(Number(id));
}

export function catalogRecitation(reciter,moshaf,surahId){
  const idNum=Number(surahId);
  const surah=SURAHS[idNum-1]||`سورة ${surahId}`;
  const audio=surahUrl(moshaf,idNum);
  const is1425=moshaf?.source==='archive1425' || Number(moshaf?.id)===1425;
  const id=`${is1425?'d1425':'dm'}-${idNum}`;
  const cover=dossariImage(`${id}|${surah}`);
  const sourceUrl=is1425?(moshaf.source_page||audio):audio;
  return {
    id,
    title:`سورة ${surah}`,
    reciter:'ياسر الدوسري',
    surah,
    year:is1425?'1425':'',
    collection:is1425?'تراويح رمضان 1425هـ':'المصحف المرتل',
    mosque:'', occasion:is1425?'رمضان 1425هـ':'', recordingDate:'',
    tags:is1425?['ياسر الدوسري','1425','تراويح','نوادر']:['ياسر الدوسري','المصحف المرتل'],
    playlists:[], rare:is1425, favorite:false, preferredVariantId:'',
    cover, sourceThumbnail:cover, gallery:[], addedAt:0, lastPlayedAt:0, lastPosition:0, playCount:0,
    catalogOnly:true,
    catalogRef:{reciterId:Number(reciter.id),moshafId:Number(moshaf.id),surahId:idNum},
    variants:[normalizeVariant({
      id:`${id}-audio`,
      provider:is1425?'archive':'mp3quran',
      sourceUrl,
      audioUrl:audio,
      title:`ياسر الدوسري — ${surah}${is1425?' — 1425هـ':''}`,
      qualityLabel:is1425?'رمضان 1425هـ':'المصحف المرتل',
      downloadable:true,
      rare:is1425,
      provenance:{
        discoveredFrom:is1425?'أرشيف ياسر الدوسري 1425':'MP3Quran',
        originalSource:sourceUrl,
        verified:true,
        confidence:1
      }
    })]
  };
}

export function reciterMoshafs(reciter){ return Array.isArray(reciter?.moshaf)?reciter.moshaf:[]; }
export function reciterSurahs(reciter,moshaf){
  return String(moshaf?.surah_list||'').split(',').map(Number).filter(n=>n>=1&&n<=114).map(id=>({id,name:SURAHS[id-1]}));
}
