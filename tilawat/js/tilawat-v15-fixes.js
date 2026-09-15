const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const LAST_KEY='tilawat-last-listened-v15';
let pendingAction=null;
let saveTimer=0;
let lastUserSeekValue='';

const esc=(v='')=>String(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const text=n=>(n?.textContent||'').trim();
const read=()=>{try{return JSON.parse(localStorage.getItem(LAST_KEY)||'null')}catch{return null}};
const write=v=>{try{localStorage.setItem(LAST_KEY,JSON.stringify(v))}catch{}};
const playSvg=()=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 19 12 7 19.5z"/></svg>';

function actionOf(el){
  if(!el)return null;
  if(el.dataset.catalogPlay)return{type:'catalog',key:el.dataset.catalogPlay};
  if(el.dataset.play)return{type:'local',key:el.dataset.play};
  return null;
}

function renderStoredLast(){
  const data=read();if(!data)return;
  const hero=$('#homeView .hero');if(!hero)return;
  $('#quickGrid')?.replaceChildren();
  let card=$('#lastListenedCard');
  if(!card){card=document.createElement('button');card.type='button';card.id='lastListenedCard';card.className='last-listened-card';$('.hero__heading',hero)?.insertAdjacentElement('afterend',card)}
  card.removeAttribute('data-play');card.removeAttribute('data-catalog-play');
  if(data.type==='catalog')card.dataset.catalogPlay=data.key;else card.dataset.play=data.key;
  card.innerHTML=`<span class="last-listened-card__art"><img src="${esc(data.cover||'')}" alt=""></span><span class="last-listened-card__text"><span class="last-listened-card__label">آخر سورة سمعتها</span><b>${esc(data.title||'آخر تلاوة')}</b><small>${esc(data.sub||'تابع من حيث توقفت')}</small></span><span class="last-listened-card__play" aria-hidden="true">${playSvg()}</span>`;
}

function saveFromMini(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    const mini=$('#miniPlayer');if(!pendingAction||!mini||mini.classList.contains('hidden'))return;
    const title=text($('#miniTitle')),sub=text($('#miniSub')),cover=$('#miniCover')?.currentSrc||$('#miniCover')?.src||'';
    if(!title)return;
    write({...pendingAction,title,sub,cover,at:Date.now()});
    renderStoredLast();
  },80);
}

function persistCurrentActionFromClick(e){
  const target=e.target.closest('[data-catalog-play],[data-play]');
  if(!target||target.closest('#playerPage'))return;
  pendingAction=actionOf(target);
  saveFromMini();
  setTimeout(saveFromMini,260);
  setTimeout(saveFromMini,700);
}

function keepLastCardFresh(){
  const shelves=$('#homeShelves');
  if(shelves)new MutationObserver(()=>queueMicrotask(renderStoredLast)).observe(shelves,{subtree:true,childList:true});
  const title=$('#miniTitle');if(title)new MutationObserver(saveFromMini).observe(title,{subtree:true,childList:true,characterData:true});
  const sub=$('#miniSub');if(sub)new MutationObserver(saveFromMini).observe(sub,{subtree:true,childList:true,characterData:true});
  const cover=$('#miniCover');if(cover)new MutationObserver(saveFromMini).observe(cover,{attributes:true,attributeFilter:['src']});
}

/* v14 already throttles actual seek calls. Keep the user's last finger position
   authoritative until pointerup so a playback tick cannot snap the thumb backward. */
function protectSeekRelease(){
  document.addEventListener('input',e=>{
    if(e.target?.id!=='seek'||e.__tilawatSeekCommit)return;
    lastUserSeekValue=e.target.value;
  },true);
  document.addEventListener('pointerdown',e=>{
    if(e.target?.id==='seek')lastUserSeekValue=e.target.value;
  },true);
  document.addEventListener('pointerup',e=>{
    if(e.target?.id==='seek'&&lastUserSeekValue!=='')e.target.value=lastUserSeekValue;
  },true);
}

function trimTouchPlayerWork(){
  if(!matchMedia('(pointer:coarse)').matches)return;
  const kill=()=>setTimeout(()=>{try{window.ScrollTrigger?.getAll?.().filter(t=>String(t.vars?.id||'').startsWith('tilawat-')).forEach(t=>t.kill())}catch{}},180);
  document.addEventListener('click',e=>{if(e.target.closest('#miniOpen,.mini2__text,#miniCover,[data-catalog-play],[data-play]'))kill()},true);
}

function prewarmYoutube(){
  const run=()=>{
    if(window.YT?.Player||document.querySelector('script[data-tilawat-yt-prewarm]'))return;
    const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;s.dataset.tilawatYtPrewarm='';document.head.append(s);
  };
  if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:2200});else setTimeout(run,1200);
}

function boot(){
  renderStoredLast();
  keepLastCardFresh();
  protectSeekRelease();
  trimTouchPlayerWork();
  prewarmYoutube();
  document.addEventListener('click',persistCurrentActionFromClick,true);
  addEventListener('pagehide',saveFromMini);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
