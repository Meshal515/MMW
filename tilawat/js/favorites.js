import { allTracks, getTrack, putTrack } from './store.js';

const STYLE_URL='./favorites.css';
const HEART='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 20.5-7-6.6a4.3 4.3 0 0 1 6-6.1l1 .9 1-.9a4.3 4.3 0 0 1 6 6.1Z"/></svg>';
let refreshQueued=false;
let refreshRunning=false;
let toastTimer=0;

function ensureStyle(){
  if(document.querySelector('link[data-tilawat-favorites]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=STYLE_URL;
  link.dataset.tilawatFavorites='';
  document.head.append(link);
}

function notify(text){
  const toast=document.getElementById('toast');
  if(!toast)return;
  toast.textContent=text;
  toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('on'),2300);
}

function ensureHub(){
  const segs=document.getElementById('librarySegs');
  if(!segs)return null;
  let hub=document.getElementById('favoriteHub');
  if(!hub){
    hub=document.createElement('button');
    hub.id='favoriteHub';
    hub.type='button';
    hub.className='favorite-hub';
    hub.innerHTML=`<span class="favorite-hub__icon">${HEART}</span><span class="favorite-hub__text"><b>المفضلة</b><small>تلاواتك الأقرب — ترجع لها بضغطة</small></span><span class="favorite-hub__count" id="favoriteHubCount">0</span><span class="favorite-hub__arrow" aria-hidden="true">‹</span>`;
    hub.addEventListener('click',()=>{
      const target=segs.querySelector('[data-seg="favorite"]');
      target?.click();
      requestAnimationFrame(()=>document.getElementById('libraryGrid')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
    });
    segs.before(hub);
  }
  return hub;
}

function ensureFavoriteSegment(){
  const button=document.querySelector('#librarySegs [data-seg="favorite"]');
  if(!button||button.dataset.favoriteEnhanced)return;
  button.dataset.favoriteEnhanced='1';
  button.innerHTML=`<span class="favorite-seg__heart">${HEART}</span><span>المفضلة</span>`;
}

function relayFavoriteToMini(source){
  const mini=document.getElementById('miniFav');
  if(!mini)return false;
  mini._tilawatFavoriteFeedbackTarget=source||mini;
  mini.click();
  return true;
}

function ensurePlayerFavorite(){
  const more=document.getElementById('playerMore');
  if(!more)return null;
  let button=document.getElementById('playerFav');
  if(!button){
    button=document.createElement('button');
    button.id='playerFav';
    button.className='round player-favorite';
    button.type='button';
    button.setAttribute('aria-label','إضافة للمفضلة');
    button.setAttribute('aria-pressed','false');
    button.innerHTML=HEART;
    more.insertAdjacentElement('beforebegin',button);
    button.addEventListener('click',event=>{
      event.preventDefault();
      relayFavoriteToMini(button);
      setTimeout(syncCurrentFavorite,40);
    });
  }
  return button;
}

function setFavoriteVisual(button,active){
  if(!button)return;
  button.classList.toggle('is-favorite',active);
  button.setAttribute('aria-pressed',String(active));
  button.setAttribute('aria-label',active?'إزالة من المفضلة':'إضافة للمفضلة');
  button.title=active?'إزالة من المفضلة':'إضافة للمفضلة';
}
function syncCurrentFavorite(){
  const source=document.getElementById('miniFav');
  const target=document.getElementById('playerFav');
  if(!source||!target)return;
  const active=source.getAttribute('aria-pressed')==='true'||source.classList.contains('is-favorite');
  setFavoriteVisual(target,active);
}

function decorateRows(records){
  const grid=document.getElementById('libraryGrid');
  if(!grid)return;
  for(const row of grid.querySelectorAll('.library-row[data-play]')){
    const id=row.dataset.play;
    const rec=records.get(id);
    const art=row.querySelector('.art');
    if(!art||!rec)continue;
    let button=art.querySelector('.library-favorite');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='library-favorite';
      button.dataset.favoriteTrack=id;
      button.innerHTML=`<span>${HEART}</span>`;
      art.append(button);
    }
    const active=!!rec.favorite;
    row.classList.toggle('is-favorite',active);
    setFavoriteVisual(button,active);
  }
}

function syncEmptyState(){
  const empty=document.getElementById('libraryEmpty');
  const favoriteSelected=document.querySelector('#librarySegs [data-seg="favorite"]')?.classList.contains('on');
  if(!empty)return;
  const heading=empty.querySelector('h2');
  const text=empty.querySelector('p');
  if(favoriteSelected){
    if(heading)heading.textContent='لا توجد مفضلة بعد';
    if(text)text.textContent='اضغط القلب على أي تلاوة تحبها، وستجدها هنا مباشرة.';
  }else{
    if(heading)heading.textContent='مكتبتك جاهزة';
    if(text)text.textContent='شغّل أي سورة من الكتالوج، أو احفظ التسجيل عندك، أو أضف تسجيلًا من رابط أو ملف.';
  }
}

async function refresh(){
  if(refreshRunning){refreshQueued=true;return}
  refreshRunning=true;
  try{
    ensureHub();
    ensureFavoriteSegment();
    ensurePlayerFavorite();
    const tracks=await allTracks().catch(()=>[]);
    const records=new Map(tracks.map(track=>[track.id,track]));
    const count=tracks.filter(track=>track.favorite).length;
    const countEl=document.getElementById('favoriteHubCount');
    if(countEl)countEl.textContent=String(count);
    const hub=document.getElementById('favoriteHub');
    const selected=document.querySelector('#librarySegs [data-seg="favorite"]')?.classList.contains('on');
    if(hub){
      hub.classList.toggle('is-active',!!selected);
      hub.setAttribute('aria-label',count?`المفضلة، ${count} تلاوة`:'المفضلة، لا توجد تلاوات بعد');
    }
    decorateRows(records);
    syncCurrentFavorite();
    syncEmptyState();
    dispatchEvent(new CustomEvent('tilawat:library-decorated'));
  }finally{
    refreshRunning=false;
    if(refreshQueued){refreshQueued=false;queueRefresh()}
  }
}

function queueRefresh(){
  if(refreshQueued)return;
  refreshQueued=true;
  requestAnimationFrame(()=>{
    refreshQueued=false;
    refresh();
  });
}

async function toggleRowFavorite(button){
  const id=button.dataset.favoriteTrack;
  if(!id)return;
  const row=button.closest('.library-row');
  if(row?.classList.contains('is-current')&&document.getElementById('miniFav')){
    relayFavoriteToMini(button);
    setTimeout(queueRefresh,50);
    return;
  }
  const record=await getTrack(id).catch(()=>null);
  if(!record)return;
  const active=!record.favorite;
  setFavoriteVisual(button,active);
  row?.classList.toggle('is-favorite',active);
  dispatchEvent(new CustomEvent('tilawat:favorite-feedback',{detail:{target:button,active}}));
  try{
    record.favorite=active;
    await putTrack(record);
    notify(active?'أضيفت للمفضلة · تجدها دائمًا في مكتبتي':'أزيلت من المفضلة');
    dispatchEvent(new CustomEvent('tilawat-library-imported'));
  }catch(err){
    console.warn(err);
    setFavoriteVisual(button,!active);
    row?.classList.toggle('is-favorite',!active);
    notify('تعذر تحديث المفضلة.');
  }
}

function boot(){
  ensureStyle();
  ensureHub();
  ensureFavoriteSegment();
  ensurePlayerFavorite();

  const grid=document.getElementById('libraryGrid');
  const miniFav=document.getElementById('miniFav');
  const observer=new MutationObserver(queueRefresh);
  if(grid)observer.observe(grid,{childList:true});
  if(miniFav)observer.observe(miniFav,{attributes:true,attributeFilter:['class','aria-pressed']});

  grid?.addEventListener('click',event=>{
    const button=event.target.closest('.library-favorite');
    if(!button)return;
    event.preventDefault();
    event.stopPropagation();
    toggleRowFavorite(button);
  },true);

  document.addEventListener('click',event=>{
    const proxy=event.target instanceof Element?event.target.closest('#tilawatV28GlassFav'):null;
    if(proxy&&miniFav)miniFav._tilawatFavoriteFeedbackTarget=proxy;
  },true);

  miniFav?.addEventListener('click',()=>{
    /* v2 owns persistence, but waiting for IndexedDB before painting the heart
       makes the mini/full/glass players visibly lag and can make the glass card
       snap back to the old state. Paint the intended state immediately; the DB
       refresh below remains the source of truth and will reconcile if needed. */
    const feedbackTarget=miniFav._tilawatFavoriteFeedbackTarget||miniFav;
    miniFav._tilawatFavoriteFeedbackTarget=null;
    const active=miniFav.getAttribute('aria-pressed')==='true'||miniFav.classList.contains('is-favorite');
    const next=!active;
    setFavoriteVisual(miniFav,next);
    const playerFav=document.getElementById('playerFav');setFavoriteVisual(playerFav,next);
    dispatchEvent(new CustomEvent('tilawat:favorite-feedback',{detail:{target:feedbackTarget,active:next}}));
    setTimeout(()=>{syncCurrentFavorite();queueRefresh()},55);
  });

  document.getElementById('librarySegs')?.addEventListener('click',()=>setTimeout(queueRefresh,0));
  document.querySelector('.tabbar')?.addEventListener('click',event=>{if(event.target.closest('[data-tab="library"]'))setTimeout(queueRefresh,0)});
  addEventListener('tilawat-library-imported',()=>setTimeout(queueRefresh,0));
  queueRefresh();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
