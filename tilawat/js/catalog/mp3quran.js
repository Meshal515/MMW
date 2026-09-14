import { SURAHS, normalizeVariant, makeCover } from './core.js';

const API='https://www.mp3quran.net/api/v3/reciters?language=ar';
let cache=null;
export async function fetchReciters({force=false}={}){
  if(cache&&!force) return cache;
  const r=await fetch(API,{headers:{accept:'application/json'}});
  if(!r.ok) throw new Error('mp3quran-'+r.status);
  const d=await r.json();
  cache=Array.isArray(d.reciters)?d.reciters:[];
  return cache;
}
export function surahUrl(moshaf,surahId){
  const base=String(moshaf.server||'').replace(/\/?$/,'/');
  return base+String(surahId).padStart(3,'0')+'.mp3';
}
export function hasSurah(moshaf,id){
  return String(moshaf.surah_list||'').split(',').map(Number).includes(Number(id));
}
export function catalogRecitation(reciter,moshaf,surahId){
  const surah=SURAHS[Number(surahId)-1]||`سورة ${surahId}`;
  const audio=surahUrl(moshaf,surahId);
  const id=`mq-${reciter.id}-${moshaf.id}-${surahId}`;
  return {
    id,title:`سورة ${surah}`,reciter:reciter.name||'',surah,year:'',collection:moshaf.name||'المصحف المرتل',mosque:'',occasion:'',recordingDate:'',
    tags:['مصحف','MP3Quran'],playlists:[],rare:false,favorite:false,preferredVariantId:'',
    cover:makeCover({surah,surahNumber:Number(surahId),reciter:reciter.name}),sourceThumbnail:'',gallery:[],addedAt:0,lastPlayedAt:0,lastPosition:0,playCount:0,
    catalogOnly:true,
    variants:[normalizeVariant({id:`mqv-${reciter.id}-${moshaf.id}-${surahId}`,provider:'mp3quran',sourceUrl:audio,audioUrl:audio,title:`${reciter.name} — ${surah}`,qualityLabel:moshaf.name||'MP3Quran',downloadable:true,provenance:{discoveredFrom:'MP3Quran API',originalSource:audio,verified:true,confidence:1}})]
  };
}
export function reciterMoshafs(reciter){return Array.isArray(reciter?.moshaf)?reciter.moshaf:[];}
export function reciterSurahs(reciter,moshaf){
  return String(moshaf?.surah_list||'').split(',').map(Number).filter(n=>n>=1&&n<=114).map(id=>({id,name:SURAHS[id-1]}));
}
