/* Local artwork policy for Tilawat.
   No image search. No Wikipedia/Wikimedia. No remote artwork lookup.
   Yasser Al-Dosari uses only the five owner-supplied local photos. When the
   surah is known, his recitation gets that surah's own cover, rendered from
   those photos by tools/make-surah-covers.mjs. Any other manually-added
   reciter rotates through the three owner-supplied Quran/Kaaba fallback images. */

import { SURAHS } from './catalog/core.js';

export const DOSSARI_IMAGES = [
  './assets/covers/dossari-1.jpg',
  './assets/covers/dossari-2.jpg',
  './assets/covers/dossari-3.jpg',
  './assets/covers/dossari-4.jpg',
  './assets/covers/dossari-5.jpg'
];

export const FALLBACK_IMAGES = [
  './assets/covers/fallback-1.jpg',
  './assets/covers/fallback-2.jpg',
  './assets/covers/fallback-3.jpg'
];

export const QURAN_FALLBACK = FALLBACK_IMAGES[0];

export function normalizeName(value=''){
  return String(value).normalize('NFKD')
    .replace(/[ً-ْٰـ]/g,'')
    .replace(/[أإآٱ]/g,'ا')
    .replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/\s+/g,' ').trim().toLowerCase();
}

export function stableHash(value=''){
  let h=2166136261;
  const s=String(value);
  for(let i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h=Math.imul(h,16777619);
  }
  return h>>>0;
}

export function isDossari(name=''){
  const n=normalizeName(name);
  const ar=n.includes('ياسر') && n.includes('دوسري');
  const en=/(yasser|yaser)/i.test(n) && /(dosari|dossari|aldosari|al-dosari)/i.test(n);
  return ar || en;
}

const SURAH_KEYS=new Map(SURAHS.map((name,i)=>[normalizeName(name),i+1]));

export function surahNumber(value){
  if(value==null||value==='')return 0;
  const n=Number(value);
  if(Number.isInteger(n)&&n>=1&&n<=114)return n;
  const key=normalizeName(value).replace(/^سوره\s+/,'');
  return SURAH_KEYS.get(key)||0;
}

export function surahCover(value){
  const n=surahNumber(value);
  return n?`./assets/covers/surah/${String(n).padStart(3,'0')}.jpg`:'';
}

export function dossariImage(seed='yasser'){
  return DOSSARI_IMAGES[stableHash(seed)%DOSSARI_IMAGES.length];
}

export function fallbackImage(seed='quran'){
  return FALLBACK_IMAGES[stableHash(seed)%FALLBACK_IMAGES.length];
}

export function imageFor({reciter='',surah='',seed='',manual=''}={}){
  const src=String(manual||'');
  const local=src && !/^https?:\/\//i.test(src) && !src.startsWith('data:image/svg') && !src.includes('default.jpg');
  if(local) return src;
  if(isDossari(reciter)) return surahCover(surah) || dossariImage(`${reciter}|${surah}|${seed}`);
  return fallbackImage(`${reciter}|${surah}|${seed}`);
}
