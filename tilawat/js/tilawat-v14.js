import { makeSortable } from './reorder.js';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const DOSSARI_COVERS = [
  './assets/covers/dossari-1.jpg',
  './assets/covers/dossari-2.jpg',
  './assets/covers/dossari-3.jpg',
  './assets/covers/dossari-4.jpg',
  './assets/covers/dossari-5.jpg'
];
const LIBRARY_ORDER_KEY='tilawat-library-order-v1';

let currentCatalogKey='';
let currentLocalKey='';
let openTimer=0;
let editMode=false;
let sortableMounted=false;
let libraryScheduled=false;
let miniProgressTimer=0;
let seekCommitTimer=0;
let lastSeekCommit=0;
let latestSeekValue='0';

function playSvg(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 19 12 7 19.5z"/></svg>'}
function pencilSvg(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>'}
function doneSvg(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>'}
function equalizer(){return '<span class="surah-card__eq" aria-hidden="true"><i></i><i></i><i></i></span>'}
function safeText(node){return (node?.textContent||'').trim()}
function reducedMotion(){return matchMedia('(prefers-reduced-motion: reduce)').matches}

function isDossariBrowse(){
  const title=safeText($('#browseTitle'));
  const kicker=safeText($('#browseKicker'));
  return kicker==='صفحة القارئ' && /ياسر\s+الدوسري/.test(title);
}

function decorateDossariGrid(){
  if(!isDossariBrowse())return;
  const list=$('#moshafBody .surah-list');
  if(!list)return;
  list.classList.add('reciter-surah-grid');
  $$('.surah-row',list).forEach((row,index)=>{
    const key=row.dataset.catalogPlay||'';
    if(row.dataset.identityReady==='1'){
      row.classList.toggle('is-current',!!key&&key===currentCatalogKey);
      return;
    }
    const num=safeText($('.num',row))||String(index+1).padStart(3,'0');
    const title=safeText($('b',row))||'سورة';
    const meta=[...row.querySelectorAll('span')].map(safeText).filter(Boolean).find(x=>x!==num)||'المصحف';
    const n=Number(num)||index+1;
    const cover=DOSSARI_COVERS[(n-1)%DOSSARI_COVERS.length];
    row.dataset.identityReady='1';
    row.className='surah-row reciter-surah-card';
    row.setAttribute('aria-label',`تشغيل ${title} — ${meta}`);
    row.style.animationDelay=`${Math.min(index,11)*24}ms`;
    row.innerHTML=`<span class="surah-card__art"><img src="${cover}" alt="" loading="lazy"></span><span class="surah-card__number">${num}</span><span class="surah-card__meta"><b>${title}</b><small>${meta}</small></span><span class="surah-card__play" aria-hidden="true">${playSvg()}${equalizer()}</span>`;
    row.classList.toggle('is-current',!!key&&key===currentCatalogKey);
  });
}

function addActiveCardMotion(card){
  $$('.is-current').forEach(el=>{if(el!==card)el.classList.remove('is-current')});
  if(!card)return;
  card.classList.add('is-current');
  if(!reducedMotion()) card.animate?.([{transform:'scale(1)'},{transform:'scale(.975)'},{transform:'scale(1)'}],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
}
function markCurrentFromClick(target){
  const catalog=target.closest('[data-catalog-play]');
  const local=target.closest('[data-play]');
  if(catalog){currentCatalogKey=catalog.dataset.catalogPlay||'';currentLocalKey='';addActiveCardMotion(catalog)}
  else if(local){currentLocalKey=local.dataset.play||'';currentCatalogKey='';addActiveCardMotion(local)}
  requestAnimationFrame(syncPlayingState);
}
function animateOpen(el,cls='tilawat-enter'){
  if(!el||el.classList.contains('hidden')||reducedMotion())return;
  el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),560);
}
function waitAndOpenPlayer(){
  clearTimeout(openTimer);
  const started=performance.now();
  const tick=()=>{
    const mini=$('#miniPlayer'),page=$('#playerPage');
    if(mini&&!mini.classList.contains('hidden')){
      if(page?.classList.contains('hidden')){$('#miniOpen')?.click();requestAnimationFrame(()=>animateOpen(page))}
      return;
    }
    if(performance.now()-started<2600)openTimer=setTimeout(tick,45);
  };
  openTimer=setTimeout(tick,90);
}
function syncPlayingState(){
  const icon=$('#miniPlayIcon');
  const playing=!!icon&&icon.innerHTML.includes('M7 5h4');
  document.documentElement.classList.toggle('is-audio-playing',playing);
  const current=$('.media-card.is-current .art__play,.media-card.is-current .library-row__play');
  if(current){
    if(!current.querySelector('.tilawat-card-eq'))current.insertAdjacentHTML('beforeend','<span class="tilawat-card-eq" aria-hidden="true"><i></i><i></i><i></i></span>');
    current.classList.toggle('is-live',playing);
  }
}
function mountMotionCss(){
  if($('#tilawatMotionStyle'))return;
  const style=document.createElement('style');style.id='tilawatMotionStyle';style.textContent=`
  .media-card.is-current .art__play,.media-card.is-current .library-row__play{opacity:1;transform:none;background:var(--accent);color:var(--accent-ink)}
  .tilawat-card-eq{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:2px;opacity:0}
  .tilawat-card-eq i{display:block;width:2px;height:11px;border-radius:2px;background:currentColor;animation:tilawatEq .62s ease-in-out infinite alternate}
  .tilawat-card-eq i:nth-child(2){height:15px;animation-delay:-.2s}.tilawat-card-eq i:nth-child(3){height:8px;animation-delay:-.4s}
  .art__play.is-live>svg,.library-row__play.is-live>svg{opacity:0}.art__play.is-live .tilawat-card-eq,.library-row__play.is-live .tilawat-card-eq{opacity:1}
  @keyframes tilawatEq{from{transform:scaleY(.35)}to{transform:scaleY(1)}}
  #saveRec.is-favorite{color:var(--favorite)!important;border-color:color-mix(in srgb,var(--favorite) 30%,transparent)}
  @media(prefers-reduced-motion:reduce){.tilawat-card-eq i{animation:none!important}}`;
  document.head.append(style);
}

function mountMiniProgress(){
  const mini=$('#miniPlayer');if(!mini||$('.mini2__progress',mini))return;
  const progress=document.createElement('button');progress.type='button';progress.className='mini2__progress';progress.setAttribute('aria-label','موضع التشغيل');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');progress.innerHTML='<i></i>';mini.append(progress);
  const seek=$('#seek');
  const apply=e=>{
    if(!seek)return;
    const r=progress.getBoundingClientRect();if(!r.width)return;
    const pct=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
    seek.value=String(Math.round(pct*1000));latestSeekValue=seek.value;updateMiniProgress();commitSeek(true);
  };
  progress.addEventListener('pointerdown',apply);
}
function updateMiniProgress(){
  const seek=$('#seek'),bar=$('.mini2__progress');if(!seek||!bar)return;
  const value=Math.max(0,Math.min(1000,Number(seek.value)||0)),pct=value/10,fill=$('i',bar);
  if(fill)fill.style.width=`${pct}%`;bar.style.setProperty('--mini-progress',`${pct}%`);bar.setAttribute('aria-valuenow',String(Math.round(pct)));
}
function restartMiniProgressTimer(){
  clearInterval(miniProgressTimer);miniProgressTimer=0;
  if(document.hidden)return;
  updateMiniProgress();
  miniProgressTimer=setInterval(()=>{const mini=$('#miniPlayer');if(mini&&!mini.classList.contains('hidden'))updateMiniProgress()},220);
}

function commitSeek(force=false){
  const seek=$('#seek');if(!seek)return;
  clearTimeout(seekCommitTimer);seekCommitTimer=0;
  const now=performance.now(),wait=Math.max(0,95-(now-lastSeekCommit));
  if(!force&&wait>0){seekCommitTimer=setTimeout(()=>commitSeek(true),wait);return}
  seek.value=latestSeekValue;
  const ev=new Event('input',{bubbles:false});ev.__tilawatSeekCommit=true;lastSeekCommit=performance.now();seek.dispatchEvent(ev);
}
function optimizeSeek(){
  const seek=$('#seek');if(!seek||seek.dataset.tilawatOptimized==='1')return;
  seek.dataset.tilawatOptimized='1';latestSeekValue=seek.value;
  seek.addEventListener('pointerdown',()=>{latestSeekValue=seek.value;document.documentElement.classList.add('is-seeking')},{passive:true});
  seek.addEventListener('pointerup',()=>{latestSeekValue=seek.value;commitSeek(true);document.documentElement.classList.remove('is-seeking')},{passive:true});
  seek.addEventListener('pointercancel',()=>{document.documentElement.classList.remove('is-seeking')},{passive:true});
  seek.addEventListener('input',e=>{
    if(e.__tilawatSeekCommit)return;
    e.stopImmediatePropagation();
    latestSeekValue=seek.value;
    updateMiniProgress();
    commitSeek(false);
  },true);
  seek.addEventListener('change',()=>{latestSeekValue=seek.value;commitSeek(true)},{passive:true});
}

function syncFavorite(){
  const fav=$('#miniFav');if(!fav)return;
  const raw=fav.getAttribute('style')||'';
  const on=/color\s*:\s*var\(--(?:accent|copper)\)/.test(raw);
  const changed=on!==fav.classList.contains('is-favorite');
  fav.classList.toggle('is-favorite',on);
  if(changed&&on&&!reducedMotion()){fav.classList.remove('fav-pop');void fav.offsetWidth;fav.classList.add('fav-pop');setTimeout(()=>fav.classList.remove('fav-pop'),380)}
  const save=$('#saveRec');
  if(save){save.classList.toggle('is-favorite',on);const desired=on?'محفوظة ♥':(/محفوظة|في مكتبتك/.test(save.textContent||'')?'في مكتبتك':'');if(desired&&save.textContent!==desired)save.textContent=desired}
}

function readLibraryOrder(){try{const value=JSON.parse(localStorage.getItem(LIBRARY_ORDER_KEY)||'[]');return Array.isArray(value)?value.filter(Boolean):[]}catch{return[]}}
function writeLibraryOrder(ids){try{localStorage.setItem(LIBRARY_ORDER_KEY,JSON.stringify(ids))}catch{}}
function rowId(row){return row?.dataset.play||''}
function applyStoredLibraryOrder(grid){
  const order=readLibraryOrder();if(!order.length)return;
  const rank=new Map(order.map((id,i)=>[id,i]));
  const rows=[...grid.children].filter(el=>el.matches?.('.media-card[data-play]'));
  const unknown=rows.filter(r=>!rank.has(rowId(r)));
  const known=rows.filter(r=>rank.has(rowId(r))).sort((a,b)=>rank.get(rowId(a))-rank.get(rowId(b)));
  const sorted=[...unknown,...known];
  if(sorted.some((r,i)=>r!==rows[i]))sorted.forEach(r=>grid.append(r));
}
function ensureLibraryHeader(){
  const head=$('.library-head');if(!head)return;
  let actions=$('.library-head__actions',head);
  if(!actions){actions=document.createElement('div');actions.className='library-head__actions';const count=$('#libraryCount');if(count)actions.append(count);head.append(actions)}
  if(!$('#libraryEditToggle')){
    const btn=document.createElement('button');btn.type='button';btn.id='libraryEditToggle';btn.className='library-edit-toggle';btn.setAttribute('aria-label','ترتيب السور');btn.setAttribute('aria-pressed','false');btn.innerHTML=pencilSvg();actions.append(btn);
    btn.addEventListener('click',()=>setLibraryEditMode(!editMode));
  }
}
function setLibraryEditMode(next){
  editMode=!!next;
  const all=$('#librarySegs [data-seg="all"]');if(editMode&&all&&!all.classList.contains('on'))all.click();
  const view=$('#libraryView'),btn=$('#libraryEditToggle');view?.classList.toggle('library-editing',editMode);
  if(btn){btn.setAttribute('aria-pressed',String(editMode));btn.setAttribute('aria-label',editMode?'إنهاء الترتيب':'ترتيب السور');btn.innerHTML=editMode?doneSvg():pencilSvg()}
  scheduleLibraryDecorate();
}
function decorateLibrary(){
  const grid=$('#libraryGrid');if(!grid)return;
  ensureLibraryHeader();grid.classList.add('library-list');applyStoredLibraryOrder(grid);
  const rows=$$('.media-card[data-play]',grid);
  rows.forEach(row=>{
    row.classList.add('library-row');
    const art=$('.art',row);let play=$('.art__play',row);
    if(play&&!play.classList.contains('library-row__play')){play.classList.add('library-row__play');row.append(play)}
    if(!$('.library-drag-handle',row)){const handle=document.createElement('span');handle.className='library-drag-handle';handle.setAttribute('aria-hidden','true');handle.textContent='≡';row.append(handle)}
    if(currentLocalKey&&row.dataset.play===currentLocalKey)row.classList.add('is-current');
    if(art)art.querySelectorAll('img').forEach(img=>img.setAttribute('draggable','false'));
  });
  if(!sortableMounted){
    sortableMounted=true;
    makeSortable(grid,{handle:'.library-drag-handle',item:'.library-row',onDrop:(from,to)=>{
      const items=$$('.library-row',grid),item=items[from];if(!item||!items[to])return;
      let flipState=null;
      try{if(window.gsap&&window.Flip){gsap.registerPlugin(Flip);flipState=Flip.getState(items)}}catch{}
      if(to>from)items[to].after(item);else items[to].before(item);
      writeLibraryOrder($$('.library-row',grid).map(rowId).filter(Boolean));
      try{if(flipState&&window.Flip&&!reducedMotion())Flip.from(flipState,{duration:.32,ease:'power2.out',absolute:true,scale:true})}catch{}
    }});
  }
  $('#libraryView')?.classList.toggle('library-editing',editMode);
}
function scheduleLibraryDecorate(){if(libraryScheduled)return;libraryScheduled=true;requestAnimationFrame(()=>{libraryScheduled=false;decorateLibrary()})}

function findLastListenedCard(){
  const shelves=$$('#homeShelves .shelf');
  const cont=shelves.find(s=>safeText($('.shelf__head h2',s))==='أكمل الاستماع');
  return cont?.querySelector('.media-card[data-play],.media-card[data-catalog-play]')||$('#libraryGrid .media-card[data-play]');
}
function renderLastListened(){
  const hero=$('#homeView .hero');if(!hero)return;
  const quick=$('#quickGrid');if(quick){quick.replaceChildren();quick.setAttribute('aria-hidden','true');quick.tabIndex=-1}
  const source=findLastListenedCard();let card=$('#lastListenedCard');
  if(!source){card?.remove();return}
  if(!card){card=document.createElement('button');card.type='button';card.id='lastListenedCard';card.className='last-listened-card';const heading=$('.hero__heading',hero);heading?.insertAdjacentElement('afterend',card)}
  card.removeAttribute('data-play');card.removeAttribute('data-catalog-play');
  if(source.dataset.play)card.dataset.play=source.dataset.play;
  if(source.dataset.catalogPlay)card.dataset.catalogPlay=source.dataset.catalogPlay;
  const img=$('img',source),title=safeText($('h3',source))||'آخر تلاوة',sub=safeText($('p',source))||'تابع من حيث توقفت';
  const clean=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  card.innerHTML=`<span class="last-listened-card__art"><img src="${img?.getAttribute('src')||''}" alt=""></span><span class="last-listened-card__text"><span class="last-listened-card__label">آخر سورة سمعتها</span><b>${clean(title)}</b><small>${clean(sub)}</small></span><span class="last-listened-card__play" aria-hidden="true">${playSvg()}</span>`;
}

function observeUi(){
  const browseBody=$('#browseBody');if(browseBody)new MutationObserver(()=>decorateDossariGrid()).observe(browseBody,{subtree:true,childList:true});
  const playIcon=$('#miniPlayIcon');if(playIcon)new MutationObserver(syncPlayingState).observe(playIcon,{subtree:true,childList:true,attributes:true});
  const fav=$('#miniFav');if(fav)new MutationObserver(syncFavorite).observe(fav,{attributes:true,attributeFilter:['style']});
  const save=$('#saveRec');if(save)new MutationObserver(syncFavorite).observe(save,{subtree:true,childList:true,characterData:true});
  const library=$('#libraryGrid');if(library)new MutationObserver(scheduleLibraryDecorate).observe(library,{childList:true});
  const shelves=$('#homeShelves');if(shelves)new MutationObserver(()=>requestAnimationFrame(renderLastListened)).observe(shelves,{subtree:true,childList:true});
}
function bindInteractions(){
  document.addEventListener('click',e=>{
    const handle=e.target.closest('.library-drag-handle');
    if(handle){e.preventDefault();e.stopImmediatePropagation();return}
    const libraryPlay=e.target.closest('#libraryGrid [data-play]');
    if(editMode&&libraryPlay){e.preventDefault();e.stopImmediatePropagation();return}
    const playTarget=e.target.closest('[data-catalog-play],[data-play]');
    if(playTarget&&!playTarget.closest('#playerPage')){markCurrentFromClick(playTarget);waitAndOpenPlayer()}
    const reciter=e.target.closest('[data-reciter]');if(reciter)requestAnimationFrame(()=>setTimeout(()=>{decorateDossariGrid();animateOpen($('#browsePage'))},0));
    const moshaf=e.target.closest('[data-moshaf-index]');if(moshaf)requestAnimationFrame(()=>setTimeout(decorateDossariGrid,0));
    const tab=e.target.closest('.tab');if(tab&&!reducedMotion()){const icon=tab.querySelector('svg');icon?.animate?.([{transform:'translateY(0) scale(1)'},{transform:'translateY(-3px) scale(1.08)'},{transform:'translateY(0) scale(1)'}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'})}
  },true);
  document.addEventListener('pointerdown',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;b.dataset.pressed='1';const clear=()=>{delete b.dataset.pressed;removeEventListener('pointerup',clear,true);removeEventListener('pointercancel',clear,true)};addEventListener('pointerup',clear,true);addEventListener('pointercancel',clear,true)},true);
}
function boot(){
  mountMotionCss();mountMiniProgress();optimizeSeek();observeUi();bindInteractions();decorateDossariGrid();decorateLibrary();renderLastListened();syncPlayingState();syncFavorite();restartMiniProgressTimer();
  document.addEventListener('visibilitychange',restartMiniProgressTimer);
  addEventListener('pagehide',()=>clearInterval(miniProgressTimer),{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
