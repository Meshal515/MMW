/* Dossari-only visual layer.
   No image search, no Wikimedia/Wikipedia, no remote artwork lookup.
   Yasser Al-Dosari uses only the five local images supplied by the owner.
   Any manually-added non-Dosari reciter falls back to the local Quran cover. */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const DOSSARI_IMAGES = [
  './assets/covers/dossari-1.jpg',
  './assets/covers/dossari-2.jpg',
  './assets/covers/dossari-3.jpg',
  './assets/covers/dossari-4.jpg',
  './assets/covers/dossari-5.jpg'
];
const QURAN_FALLBACK = './assets/covers/default.jpg';

function norm(v=''){
  return String(v).normalize('NFKD')
    .replace(/[ً-ْٰـ]/g,'')
    .replace(/[أإآٱ]/g,'ا')
    .replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/\s+/g,' ').trim().toLowerCase();
}
function hash(str=''){
  let h=2166136261;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
function isDossari(name=''){
  const n=norm(name);
  const ar=n.includes('ياسر') && n.includes('دوسري');
  const en=/(yasser|yaser)/i.test(n) && /(dosari|dossari|aldosari|al-dosari)/i.test(n);
  return ar || en;
}
function isGenerated(src=''){
  return !src || src.startsWith('data:image/svg') || src.includes('generated') || src.includes('monogram');
}

export function dossariImage(seed='yasser'){
  return DOSSARI_IMAGES[hash(String(seed)) % DOSSARI_IMAGES.length];
}
export function imageFor({reciter='',surah='',seed='',manual=''}={}){
  if(manual && !isGenerated(manual) && !manual.includes('default.jpg')) return manual;
  if(isDossari(reciter) || (!reciter && surah)) return dossariImage(`${reciter}|${surah}|${seed}`);
  return QURAN_FALLBACK;
}

function ensureCss(){
  if(document.querySelector('link[data-tilawat-restoration]')) return;
  const link=document.createElement('link');
  link.rel='stylesheet'; link.href='./restoration.css'; link.dataset.tilawatRestoration='';
  document.head.append(link);
}
function escapeAttr(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function reciterFromText(text=''){ return String(text).split('·')[0].trim(); }
function surahFromCard(card){
  const h=card.querySelector('h3,b')?.textContent||'';
  return h.replace(/^سورة\s+/,'').split('—')[0].trim();
}

function decorateReciterCard(card){
  const name=card.querySelector('h3')?.textContent?.trim();
  const art=card.querySelector('.reciter-art');
  if(!name||!art) return;
  const src=imageFor({reciter:name,seed:`reciter|${name}`});
  const sig=`${name}|${src}`; if(art.dataset.localVisual===sig) return;
  art.dataset.localVisual=sig; art.classList.add('has-image');
  art.innerHTML=`<img src="${escapeAttr(src)}" alt="" loading="lazy">`;
}
function decorateMediaCard(card){
  const img=card.querySelector('.art img'); if(!img) return;
  const reciter=reciterFromText(card.querySelector('p')?.textContent||'');
  const surah=surahFromCard(card);
  const current=img.getAttribute('src')||'';
  const src=imageFor({reciter,surah,seed:card.dataset.play||`${reciter}|${surah}`,manual:current});
  if(img.dataset.localVisual===src) return;
  img.dataset.localVisual=src; img.src=src;
}
function decorateSurahButton(btn){
  const name=btn.querySelector('b')?.textContent?.trim(); if(!name) return;
  const src=dossariImage(`surah|${name}`);
  let thumb=btn.querySelector('.entity-thumb');
  if(!thumb){ thumb=document.createElement('span'); thumb.className='entity-thumb'; btn.prepend(thumb); }
  thumb.style.backgroundImage=`url("${src.replace(/"/g,'%22')}")`;
}
function decorateBrowse(){
  const mono=$('#browseMono'), title=$('#browseTitle'); if(!mono||!title||!title.textContent.trim()) return;
  const kicker=$('#browseKicker')?.textContent||'';
  const isSurah=/سورة/.test(title.textContent) || /سورة/.test(kicker);
  const reciter=isSurah?'ياسر الدوسري':title.textContent.trim();
  const surah=isSurah?title.textContent.replace(/^سورة\s+/,'').trim():'';
  const src=imageFor({reciter,surah,seed:`browse|${title.textContent}`});
  const sig=`${title.textContent}|${src}`; if(mono.dataset.localVisual===sig) return;
  mono.dataset.localVisual=sig; mono.classList.add('has-image');
  mono.innerHTML=`<img src="${escapeAttr(src)}" alt="">`;
}
function decoratePlayer(){
  const sub=$('#playerSub')?.textContent || $('#miniSub')?.textContent || '';
  const reciter=reciterFromText(sub);
  if(!reciter) return;
  const title=$('#playerTitle')?.textContent || $('#miniTitle')?.textContent || '';
  const src=imageFor({reciter,surah:title.replace(/^سورة\s+/,'').trim(),seed:`player|${reciter}|${title}`});
  for(const img of [$('#playerCover'),$('#miniCover')]) if(img && img.dataset.localVisual!==src){ img.dataset.localVisual=src; img.src=src; }
}
function decorateAll(){
  $$('.reciter-card').forEach(decorateReciterCard);
  $$('.media-card').forEach(decorateMediaCard);
  $$('.entity-btn[data-surah]').forEach(decorateSurahButton);
  decorateBrowse(); decoratePlayer();
}

function boot(){
  ensureCss(); decorateAll();
  const obs=new MutationObserver(()=>decorateAll());
  obs.observe(document.body,{childList:true,subtree:true,characterData:true});
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();

export { DOSSARI_IMAGES, QURAN_FALLBACK, isDossari, decorateAll };
