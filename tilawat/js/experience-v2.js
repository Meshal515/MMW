import { makeSortable } from './reorder.js';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const LAST_KEY='tilawat-last-listened-v2';
const ORDER_KEY='tilawat-library-order-v1';
let pendingAction=null;
let currentLocalKey='';
let editMode=false;
let progressTimer=0;

const esc=(v='')=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const text=n=>(n?.textContent||'').trim();
const read=(k,f=null)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const playSvg=()=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 19 12 7 19.5z"/></svg>';

function mountCss(){
  if(document.querySelector('link[data-experience-v2]'))return;
  const l=document.createElement('link');l.rel='stylesheet';l.href='./experience-v2.css';l.dataset.experienceV2='';document.head.append(l);
}

/* The previous polish loop schedules a DOM read/write every animation frame even
   while playback is idle. Stop only that named loop, leave every other animation alone. */
function stopLegacyProgressRaf(){
  const native=window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame=cb=>cb?.name==='miniProgressLoop'?0:native(cb);
}
function updateMiniProgress(){
  const seek=$('#seek'),bar=$('.mini2__progress');if(!seek||!bar)return;
  const pct=Math.max(0,Math.min(100,Number(seek.value||0)/10));
  const fill=$('i',bar);if(fill)fill.style.width=`${pct}%`;
  bar.style.setProperty('--mini-progress',`${pct}%`);bar.setAttribute('aria-valuenow',String(Math.round(pct)));
}
function startProgressSync(){
  if(progressTimer)return;updateMiniProgress();
  progressTimer=setInterval(()=>{if(!document.hidden&&!$('#miniPlayer')?.classList.contains('hidden'))updateMiniProgress()},250);
}

/* Native range input stays immediate, but expensive player.seek calls are capped.
   This is especially important for the YouTube iframe path. */
function bindSeekThrottle(){
  let last=0,timer=0,scrubbing=false;const gap=110;
  const commit=seek=>{if(!seek)return;clearTimeout(timer);const ev=new Event('input',{bubbles:true});Object.defineProperty(ev,'__tilawatCommit',{value:true});seek.dispatchEvent(ev);last=performance.now()};
  document.addEventListener('pointerdown',e=>{if(e.target?.id==='seek'){scrubbing=true;e.target.classList.add('is-scrubbing')}},true);
  document.addEventListener('input',e=>{
    if(e.target?.id!=='seek'||e.__tilawatCommit)return;
    const now=performance.now();if(now-last>=gap){last=now;return}
    e.stopImmediatePropagation();e.stopPropagation();clearTimeout(timer);timer=setTimeout(()=>commit(e.target),gap);
  },true);
  const finish=()=>{if(!scrubbing)return;scrubbing=false;const seek=$('#seek');seek?.classList.remove('is-scrubbing');commit(seek)};
  document.addEventListener('pointerup',finish,true);document.addEventListener('pointercancel',finish,true);
}

function actionOf(el){if(!el)return null;if(el.dataset.catalogPlay)return{type:'catalog',key:el.dataset.catalogPlay};if(el.dataset.play)return{type:'local',key:el.dataset.play};return null}
function deriveContinue(){
  const shelf=$$('#homeShelves .shelf').find(s=>/أكمل الاستماع/.test(text($('.shelf__head h2',s))));
  const card=shelf?.querySelector('.media-card'),a=actionOf(card);if(!card||!a)return null;
  return{...a,title:text($('h3',card))||'آخر تلاوة',sub:text($('p',card)),cover:$('img',card)?.currentSrc||$('img',card)?.src||'',progress:0};
}
function rememberMini(){
  const mini=$('#miniPlayer');if(!pendingAction||!mini||mini.classList.contains('hidden'))return;
  const data={...pendingAction,title:text($('#miniTitle'))||'آخر تلاوة',sub:text($('#miniSub')),cover:$('#miniCover')?.currentSrc||$('#miniCover')?.src||'',progress:Math.max(0,Math.min(100,Number($('#seek')?.value||0)/10)),at:Date.now()};
  write(LAST_KEY,data);renderLast(data);
}
function renderLast(forced=null){
  const quick=$('#quickGrid');if(!quick)return;quick.classList.add('experience-hide-quick');
  let slot=$('#lastListenedSlot');if(!slot){slot=document.createElement('div');slot.id='lastListenedSlot';slot.className='last-listened-slot';quick.before(slot)}
  const d=forced||read(LAST_KEY)||deriveContinue();if(!d){slot.hidden=true;slot.innerHTML='';return}slot.hidden=false;
  const attr=d.type==='catalog'?`data-catalog-play="${esc(d.key)}"`:`data-play="${esc(d.key)}"`;
  slot.innerHTML=`<button class="last-listened-card" type="button" ${attr}><span class="last-listened-art"><img src="${esc(d.cover)}" alt=""></span><span class="last-listened-copy"><small>آخر استماع</small><b>${esc(d.title)}</b><em>${esc(d.sub||'متابعة الاستماع')}</em></span><span class="last-listened-play">${playSvg()}</span><span class="last-listened-progress"><i style="width:${Number(d.progress)||0}%"></i></span></button>`;
}

function ensureEdit(){
  const head=$('.library-head');if(!head||$('#libraryEditBtn'))return;
  const b=document.createElement('button');b.id='libraryEditBtn';b.type='button';b.className='library-edit-btn';b.setAttribute('aria-label','ترتيب مكتبتي');b.setAttribute('aria-pressed','false');
  b.innerHTML='<svg viewBox="0 0 24 24"><path d="m4 16.5-.5 4 4-.5L18.8 8.7l-3.5-3.5Z"/><path d="m13.9 6.6 3.5 3.5"/></svg><span>ترتيب</span>';
  $('#libraryCount')?.before(b);
  b.onclick=()=>{const all=$('#librarySegs [data-seg="all"]');if(!all?.classList.contains('on')){all?.click();setTimeout(()=>setEdit(true),50)}else setEdit(!editMode)};
}
function setEdit(on){editMode=!!on;$('#libraryView')?.classList.toggle('is-reorder-mode',editMode);const b=$('#libraryEditBtn');if(b){b.classList.toggle('on',editMode);b.setAttribute('aria-pressed',String(editMode));$('span',b).textContent=editMode?'تم':'ترتيب'}}
const rowId=e=>e?.dataset?.play||'';
function savedOrder(){const x=read(ORDER_KEY,[]);return Array.isArray(x)?x:[]}
function applyOrder(){
  const list=$('#libraryGrid'),order=savedOrder();if(!list||!order.length)return;const rank=new Map(order.map((id,i)=>[id,i])),items=$$('.library-row',list);
  const unknown=items.filter(x=>!rank.has(rowId(x))),known=items.filter(x=>rank.has(rowId(x))).sort((a,b)=>rank.get(rowId(a))-rank.get(rowId(b)));[...unknown,...known].forEach(x=>list.append(x));
}
function saveOrder(){const ids=$$('#libraryGrid .library-row').map(rowId).filter(Boolean);if(ids.length)write(ORDER_KEY,ids)}
function sortable(){
  const list=$('#libraryGrid');if(!list||list.dataset.sortableReady==='1')return;list.dataset.sortableReady='1';
  makeSortable(list,{handle:'.library-drag-handle',item:'.library-row',onDrop(from,to){
    if(!editMode)return;const items=$$('.library-row',list),moving=items[from],target=items[to];if(!moving||!target||moving===target)return;
    const flip=window.Flip?.getState?window.Flip.getState(items):null;if(to>from)target.after(moving);else target.before(moving);saveOrder();
    if(flip&&window.Flip?.from&&!matchMedia('(prefers-reduced-motion: reduce)').matches)window.Flip.from(flip,{duration:.28,ease:'power2.out',absolute:false});
  }});
}
function decorateLibrary(){
  const list=$('#libraryGrid');if(!list)return;ensureEdit();list.classList.add('library-list');
  $$('.media-card',list).forEach(row=>{row.classList.add('library-row');row.classList.toggle('is-current',!!currentLocalKey&&rowId(row)===currentLocalKey);if(row.dataset.libraryReady==='1')return;row.dataset.libraryReady='1';const play=$('.art__play',row);if(play)row.append(play);const h=document.createElement('span');h.className='library-drag-handle';h.innerHTML='<i></i><i></i><i></i>';row.append(h)});
  applyOrder();sortable();
}

function trimMobileScrollWork(){
  if(!matchMedia('(pointer:coarse)').matches)return;setTimeout(()=>{try{window.ScrollTrigger?.getAll?.().filter(t=>String(t.vars?.id||'').startsWith('tilawat-')).forEach(t=>t.kill())}catch{}},180);
}
function prewarmYoutube(){
  const run=()=>{if(window.YT?.Player||document.querySelector('script[data-tilawat-yt-prewarm]'))return;const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;s.dataset.tilawatYtPrewarm='';document.head.append(s)};
  'requestIdleCallback'in window?requestIdleCallback(run,{timeout:2500}):setTimeout(run,1400);
}

function observe(){
  if($('#homeShelves'))new MutationObserver(()=>queueMicrotask(()=>renderLast())).observe($('#homeShelves'),{childList:true});
  if($('#quickGrid'))new MutationObserver(()=>queueMicrotask(()=>renderLast())).observe($('#quickGrid'),{childList:true});
  if($('#libraryGrid'))new MutationObserver(()=>queueMicrotask(decorateLibrary)).observe($('#libraryGrid'),{childList:true});
  if($('#miniPlayIcon'))new MutationObserver(()=>{rememberMini();updateMiniProgress()}).observe($('#miniPlayIcon'),{subtree:true,childList:true,attributes:true});
}
function bind(){
  document.addEventListener('click',e=>{
    if(editMode&&e.target.closest('#libraryGrid .media-card')){e.preventDefault();e.stopImmediatePropagation();return}
    const play=e.target.closest('[data-catalog-play],[data-play]');if(play&&!play.closest('#playerPage')){pendingAction=actionOf(play);if(pendingAction?.type==='local')currentLocalKey=pendingAction.key;setTimeout(rememberMini,120);setTimeout(rememberMini,500)}
    const tab=e.target.closest('.tab');if(tab?.dataset.tab!=='library'&&tab)setEdit(false);
    if(e.target.closest('#miniOpen,.mini2__text,#miniCover'))trimMobileScrollWork();
  },true);
  $('#miniCover')?.addEventListener('click',()=>$('#miniOpen')?.click());
}
function boot(){mountCss();stopLegacyProgressRaf();startProgressSync();bindSeekThrottle();observe();bind();decorateLibrary();renderLast();prewarmYoutube()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
