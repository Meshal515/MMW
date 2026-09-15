const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const DOSSARI_COVERS = [
  './assets/covers/dossari-1.jpg',
  './assets/covers/dossari-2.jpg',
  './assets/covers/dossari-3.jpg',
  './assets/covers/dossari-4.jpg'
];

let currentCatalogKey = '';
let currentLocalKey = '';
let openTimer = 0;

function playSvg(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 19 12 7 19.5z"/></svg>';
}
function equalizer(){
  return '<span class="surah-card__eq" aria-hidden="true"><i></i><i></i><i></i></span>';
}
function safeText(node){ return (node?.textContent || '').trim(); }

function isDossariBrowse(){
  const title=safeText($('#browseTitle'));
  const kicker=safeText($('#browseKicker'));
  return kicker==='صفحة القارئ' && /ياسر\s+الدوسري/.test(title);
}

function decorateDossariGrid(){
  if(!isDossariBrowse()) return;
  const list=$('#moshafBody .surah-list');
  if(!list) return;
  list.classList.add('reciter-surah-grid');

  $$('.surah-row', list).forEach((row,index)=>{
    const key=row.dataset.catalogPlay || '';
    if(row.dataset.identityReady==='1'){
      row.classList.toggle('is-current',!!key && key===currentCatalogKey);
      return;
    }

    const num=safeText($('.num',row)) || String(index+1).padStart(3,'0');
    const title=safeText($('b',row)) || 'سورة';
    const meta=[...row.querySelectorAll('span')].map(safeText).filter(Boolean).find(x=>x!==num) || 'المصحف';
    const n=Number(num) || index+1;
    const cover=DOSSARI_COVERS[(n-1)%DOSSARI_COVERS.length];

    row.dataset.identityReady='1';
    row.className='surah-row reciter-surah-card';
    row.setAttribute('aria-label',`تشغيل ${title} — ${meta}`);
    row.style.animationDelay=`${Math.min(index,11)*24}ms`;
    row.innerHTML=`
      <span class="surah-card__art"><img src="${cover}" alt="" loading="lazy"></span>
      <span class="surah-card__number">${num}</span>
      <span class="surah-card__meta"><b>${title}</b><small>${meta}</small></span>
      <span class="surah-card__play" aria-hidden="true">${playSvg()}${equalizer()}</span>`;
    row.classList.toggle('is-current',!!key && key===currentCatalogKey);
  });
}

function addActiveCardMotion(card){
  $$('.is-current').forEach(el=>{ if(el!==card) el.classList.remove('is-current'); });
  if(!card) return;
  card.classList.add('is-current');
  card.animate?.([
    {transform:'scale(1)'},
    {transform:'scale(.975)'},
    {transform:'scale(1)'}
  ],{duration:240,easing:'cubic-bezier(.2,.8,.2,1)'});
}

function markCurrentFromClick(target){
  const catalog=target.closest('[data-catalog-play]');
  const local=target.closest('[data-play]');
  if(catalog){
    currentCatalogKey=catalog.dataset.catalogPlay || '';
    currentLocalKey='';
    addActiveCardMotion(catalog);
  }else if(local){
    currentLocalKey=local.dataset.play || '';
    currentCatalogKey='';
    addActiveCardMotion(local);
  }
  requestAnimationFrame(syncPlayingState);
}

function animateOpen(el, cls='tilawat-enter'){
  if(!el || el.classList.contains('hidden')) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(()=>el.classList.remove(cls),560);
}

function waitAndOpenPlayer(){
  clearTimeout(openTimer);
  const started=performance.now();
  const tick=()=>{
    const mini=$('#miniPlayer');
    const page=$('#playerPage');
    if(mini && !mini.classList.contains('hidden')){
      if(page?.classList.contains('hidden')){
        $('#miniOpen')?.click();
        requestAnimationFrame(()=>animateOpen(page));
      }
      return;
    }
    if(performance.now()-started<2600) openTimer=setTimeout(tick,45);
  };
  openTimer=setTimeout(tick,90);
}

function syncPlayingState(){
  const icon=$('#miniPlayIcon');
  const playing=!!icon && icon.innerHTML.includes('M7 5h4');
  document.documentElement.classList.toggle('is-audio-playing',playing);

  const current=$('.media-card.is-current .art__play');
  if(current){
    if(!current.querySelector('.tilawat-card-eq')){
      current.insertAdjacentHTML('beforeend','<span class="tilawat-card-eq" aria-hidden="true"><i></i><i></i><i></i></span>');
    }
    current.classList.toggle('is-live',playing);
  }
}

function mountMotionCss(){
  if($('#tilawatMotionStyle')) return;
  const style=document.createElement('style');
  style.id='tilawatMotionStyle';
  style.textContent=`
    .media-card.is-current .art__play{opacity:1;transform:none;background:var(--accent);color:var(--accent-ink)}
    .tilawat-card-eq{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:2px;opacity:0}
    .tilawat-card-eq i{display:block;width:2px;height:11px;border-radius:2px;background:currentColor;animation:tilawatEq .62s ease-in-out infinite alternate}
    .tilawat-card-eq i:nth-child(2){height:15px;animation-delay:-.2s}.tilawat-card-eq i:nth-child(3){height:8px;animation-delay:-.4s}
    .art__play.is-live>svg{opacity:0}.art__play.is-live .tilawat-card-eq{opacity:1}
    @keyframes tilawatEq{from{transform:scaleY(.35)}to{transform:scaleY(1)}}
    #saveRec.is-favorite{color:var(--favorite)!important;border-color:color-mix(in srgb,var(--favorite) 30%,transparent)}
    @media(prefers-reduced-motion:reduce){.tilawat-card-eq i{animation:none!important}}
  `;
  document.head.append(style);
}

function mountMiniProgress(){
  const mini=$('#miniPlayer');
  if(!mini || $('.mini2__progress',mini)) return;
  const progress=document.createElement('button');
  progress.type='button';
  progress.className='mini2__progress';
  progress.setAttribute('aria-label','موضع التشغيل');
  progress.setAttribute('aria-valuemin','0');
  progress.setAttribute('aria-valuemax','100');
  progress.innerHTML='<i></i>';
  mini.append(progress);

  const seek=$('#seek');
  const apply=e=>{
    if(!seek) return;
    const r=progress.getBoundingClientRect();
    if(!r.width) return;
    const pct=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
    seek.value=String(Math.round(pct*1000));
    seek.dispatchEvent(new Event('input',{bubbles:true}));
    updateMiniProgress();
  };
  progress.addEventListener('pointerdown',apply);
}

function updateMiniProgress(){
  const seek=$('#seek');
  const bar=$('.mini2__progress');
  if(!seek || !bar) return;
  const value=Math.max(0,Math.min(1000,Number(seek.value)||0));
  const pct=value/10;
  const fill=$('i',bar);
  if(fill) fill.style.width=`${pct}%`;
  bar.style.setProperty('--mini-progress',`${pct}%`);
  bar.setAttribute('aria-valuenow',String(Math.round(pct)));
}

function miniProgressLoop(){
  updateMiniProgress();
  requestAnimationFrame(miniProgressLoop);
}

function syncFavorite(){
  const fav=$('#miniFav');
  if(!fav) return;
  const raw=fav.getAttribute('style') || '';
  const on=/color\s*:\s*var\(--(?:accent|copper)\)/.test(raw);
  const changed=on!==fav.classList.contains('is-favorite');
  fav.classList.toggle('is-favorite',on);
  if(changed && on){
    fav.classList.remove('fav-pop');
    void fav.offsetWidth;
    fav.classList.add('fav-pop');
    setTimeout(()=>fav.classList.remove('fav-pop'),380);
  }
  const save=$('#saveRec');
  if(save) save.classList.toggle('is-favorite',/♥|محفوظة/.test(save.textContent||''));
}

function observeUi(){
  const browseBody=$('#browseBody');
  if(browseBody){
    new MutationObserver(()=>decorateDossariGrid()).observe(browseBody,{subtree:true,childList:true});
  }

  const playIcon=$('#miniPlayIcon');
  if(playIcon) new MutationObserver(syncPlayingState).observe(playIcon,{subtree:true,childList:true,attributes:true});

  const fav=$('#miniFav');
  if(fav) new MutationObserver(syncFavorite).observe(fav,{attributes:true,attributeFilter:['style']});

  const save=$('#saveRec');
  if(save) new MutationObserver(syncFavorite).observe(save,{subtree:true,childList:true,characterData:true});
}

function bindInteractions(){
  document.addEventListener('click',e=>{
    const playTarget=e.target.closest('[data-catalog-play],[data-play]');
    if(playTarget && !playTarget.closest('#playerPage')){
      markCurrentFromClick(playTarget);
      waitAndOpenPlayer();
    }

    const reciter=e.target.closest('[data-reciter]');
    if(reciter){
      requestAnimationFrame(()=>setTimeout(()=>{
        decorateDossariGrid();
        animateOpen($('#browsePage'));
      },0));
    }

    const moshaf=e.target.closest('[data-moshaf-index]');
    if(moshaf) requestAnimationFrame(()=>setTimeout(decorateDossariGrid,0));

    const tab=e.target.closest('.tab');
    if(tab){
      const icon=tab.querySelector('svg');
      icon?.animate?.([
        {transform:'translateY(0) scale(1)'},
        {transform:'translateY(-3px) scale(1.08)'},
        {transform:'translateY(0) scale(1)'}
      ],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
  },true);

  document.addEventListener('pointerdown',e=>{
    const b=e.target.closest('button');
    if(!b || b.disabled) return;
    b.dataset.pressed='1';
    const clear=()=>{delete b.dataset.pressed;removeEventListener('pointerup',clear,true);removeEventListener('pointercancel',clear,true)};
    addEventListener('pointerup',clear,true);
    addEventListener('pointercancel',clear,true);
  },true);
}

function boot(){
  mountMotionCss();
  mountMiniProgress();
  observeUi();
  bindInteractions();
  decorateDossariGrid();
  syncPlayingState();
  syncFavorite();
  miniProgressLoop();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
