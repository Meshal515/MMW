/* Local artwork policy for Tilawat.
   No image search. No Wikipedia/Wikimedia. No remote artwork lookup.
   Yasser Al-Dosari uses only the five owner-supplied local photos.
   Any other manually-added reciter falls back to the local Quran image. */

export const DOSSARI_IMAGES = [
  './assets/covers/dossari-1.jpg',
  './assets/covers/dossari-2.jpg',
  './assets/covers/dossari-3.jpg',
  './assets/covers/dossari-4.jpg',
  './assets/covers/dossari-5.jpg'
];

export const QURAN_FALLBACK = './assets/covers/default.jpg';

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

export function dossariImage(seed='yasser'){
  return DOSSARI_IMAGES[stableHash(seed)%DOSSARI_IMAGES.length];
}

export function imageFor({reciter='',surah='',seed='',manual=''}={}){
  const src=String(manual||'');
  const local=src && !/^https?:\/\//i.test(src) && !src.startsWith('data:image/svg') && !src.includes('default.jpg');
  if(local) return src;
  if(isDossari(reciter)) return dossariImage(`${reciter}|${surah}|${seed}`);
  return QURAN_FALLBACK;
}
