const STYLE_URL='./codex-ui-recovery.css';
const REDUCED=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
let gsapReady=false;
let renderTimer=0;

function ensureStyle(){
  if(q('link[data-codex-ui-recovery]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=STYLE_URL;
  link.dataset.codexUiRecovery='';
  document.head.append(link);
}

function loadScript(src,key){
  return new Promise((resolve,reject)=>{
    const existing=q(`script[data-codex-motion="${key}"]`);
    if(existing){
      if(existing.dataset.loaded==='1')resolve();
      else{existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true})}
      return;
    }
    const script=document.createElement('script');
    script.src=src;
    script.async=true;
    script.dataset.codexMotion=key;
    script.addEventListener('load',()=>{script.dataset.loaded='1';resolve()},{once:true});
    script.addEventListener('error',reject,{once:true});
    document.head.append(script);
  });
}

async function ensureGsap(){
  if(REDUCED())return false;
  try{
    if(!window.gsap)await loadScript('https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js','gsap');
    if(!window.ScrollTrigger)await loadScript('https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js','scroll-trigger');
    if(!window.Flip)await loadScript('https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/Flip.min.js','flip');
    if(window.gsap&&window.ScrollTrigger)window.gsap.registerPlugin(window.ScrollTrigger);
    if(window.gsap&&window.Flip)window.gsap.registerPlugin(window.Flip);
    gsapReady=!!window.gsap;
    return gsapReady;
  }catch(err){
    console.info('Tilawat motion enhancement unavailable; CSS fallback remains active.',err);
    return false;
  }
}

const plusSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const gripSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';

function enhanceIcons(root=document){
  const add=q('#addBtn b',root)||q('#addBtn b');
  if(add&&!add.dataset.svgUpgraded){add.innerHTML=plusSvg;add.dataset.svgUpgraded='1'}
  qa('.library-drag-handle',root).forEach(btn=>{
    if(btn.dataset.svgUpgraded)return;
    btn.innerHTML=gripSvg;
    btn.dataset.svgUpgraded='1';
  });
}

function markSurface(el){
  if(!el||el.dataset.motionSurface)return;
  el.dataset.motionSurface='1';
}

function revealSurface(el){
  if(!el||REDUCED())return;
  if(!gsapReady){el.classList.add('codex-css-enter');setTimeout(()=>el.classList.remove('codex-css-enter'),520);return}
  const target=el.matches('.dialog')?(q('.sheet',el)||el):el;
  const horizontal=el.matches('.browse');
  window.gsap.killTweensOf(target);
  window.gsap.fromTo(target,
    {autoAlpha:0,y:horizontal?0:18,x:horizontal?-14:0,scale:el.matches('.dialog') ? .985 : 1},
    {autoAlpha:1,y:0,x:0,scale:1,duration:el.matches('.player-page') ? .42 : .30,ease:'power3.out',clearProps:'opacity,visibility,transform'}
  );
  if(el.matches('.player-page'))animatePlayerHero();
}

function animatePlayerHero(){
  if(!gsapReady||REDUCED())return;
  const art=q('#playerArtWrap'),meta=q('.player-meta');
  if(art)window.gsap.fromTo(art,{autoAlpha:.35,y:24,scale:.94},{autoAlpha:1,y:0,scale:1,duration:.55,ease:'power3.out',clearProps:'opacity,visibility,transform'});
  if(meta)window.gsap.fromTo(qa(':scope > *',meta),{autoAlpha:0,y:10},{autoAlpha:1,y:0,duration:.34,stagger:.035,ease:'power2.out',clearProps:'opacity,visibility,transform',delay:.08});
  setupPlayerScrollMotion();
}

function setupPlayerScrollMotion(){
  if(!gsapReady||!window.ScrollTrigger||REDUCED())return;
  try{
    window.ScrollTrigger.getAll().filter(t=>String(t.vars?.id||'').startsWith('tilawat-recovery-')).forEach(t=>t.kill());
    const page=q('#playerPage'),art=q('#playerArtWrap'),variants=q('#variantsSection'),related=q('#relatedSection');
    if(!page||!art)return;
    if(variants)window.gsap.to(art,{opacity:.18,scale:.90,y:48,ease:'none',scrollTrigger:{id:'tilawat-recovery-art',trigger:variants,scroller:page,start:'top 94%',end:'top 38%',scrub:true}});
    if(related)window.gsap.fromTo(related,{opacity:.45,y:18},{opacity:1,y:0,ease:'none',scrollTrigger:{id:'tilawat-recovery-related',trigger:related,scroller:page,start:'top 92%',end:'top 68%',scrub:true}});
  }catch(err){console.info('Tilawat ScrollTrigger enhancement skipped.',err)}
}

function animateCollection(root){
  if(!root||REDUCED())return;
  enhanceIcons(root);
  const items=qa(':scope > .shelf, :scope > .media-card, :scope > .library-row, :scope > .result-row, :scope > .reciter-surah-card',root).filter(el=>!el.dataset.motionSeen);
  if(!items.length)return;
  items.forEach(el=>el.dataset.motionSeen='1');
  if(!gsapReady){items.forEach((el,i)=>{el.style.setProperty('--codex-delay',`${Math.min(i,8)*28}ms`);el.classList.add('codex-css-item')});return}
  window.gsap.fromTo(items,{autoAlpha:0,y:14,scale:.992},{autoAlpha:1,y:0,scale:1,duration:.38,stagger:{each:.035,from:'start'},ease:'power2.out',clearProps:'opacity,visibility,transform'});
}

function scheduleRenderedMotion(){
  clearTimeout(renderTimer);
  renderTimer=setTimeout(()=>{
    ['#homeShelves','#libraryGrid','#searchResults','#browseBody','#moshafBody','#relatedShelves','#variantGrid'].forEach(sel=>animateCollection(q(sel)));
    enhanceIcons();
  },24);
}

function animateInitial(){
  if(REDUCED())return;
  const header=q('.top__inner'),hero=q('#homeView .hero');
  if(!gsapReady){header?.classList.add('codex-css-enter');hero?.classList.add('codex-css-enter');return}
  const tl=window.gsap.timeline({defaults:{ease:'power3.out'}});
  if(header)tl.fromTo(header,{autoAlpha:0,y:-10},{autoAlpha:1,y:0,duration:.34,clearProps:'opacity,visibility,transform'});
  if(hero)tl.fromTo(qa(':scope > *',hero),{autoAlpha:0,y:12},{autoAlpha:1,y:0,duration:.42,stagger:.055,clearProps:'opacity,visibility,transform'},'-=.12');
  scheduleRenderedMotion();
}

function watchUi(){
  const observer=new MutationObserver(mutations=>{
    let rendered=false;
    for(const mutation of mutations){
      if(mutation.type==='childList'&&mutation.addedNodes.length)rendered=true;
      if(mutation.type!=='attributes')continue;
      const el=mutation.target;
      if(!(el instanceof HTMLElement))continue;
      if(el.matches('.view,.player-page,.browse,.dialog')&&!el.hidden&&!el.classList.contains('hidden'))revealSurface(el);
      if(el.matches('#classicSettings')&&el.classList.contains('open'))revealSurface(el);
    }
    if(rendered)scheduleRenderedMotion();
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});
}

function addPointerDepth(){
  if(!matchMedia('(hover:hover) and (pointer:fine)').matches||REDUCED())return;
  document.addEventListener('pointermove',event=>{
    const card=event.target.closest('.media-card .art,.last-listened-card');
    if(!card||!gsapReady)return;
    const r=card.getBoundingClientRect(),x=(event.clientX-r.left)/r.width-.5,y=(event.clientY-r.top)/r.height-.5;
    window.gsap.to(card,{rotateX:-y*2.4,rotateY:x*2.8,y:-2,duration:.35,ease:'power2.out',transformPerspective:700,transformOrigin:'center'});
  },{passive:true});
  document.addEventListener('pointerout',event=>{
    const card=event.target.closest?.('.media-card .art,.last-listened-card');
    if(card&&gsapReady)window.gsap.to(card,{rotateX:0,rotateY:0,y:0,duration:.42,ease:'power3.out'});
  },{passive:true});
}

async function boot(){
  ensureStyle();
  document.documentElement.dataset.codexUi='loading';
  enhanceIcons();
  await ensureGsap();
  document.documentElement.dataset.codexUi=gsapReady?'gsap':'css';
  qa('.view,.player-page,.browse,.dialog,#classicSettings').forEach(markSurface);
  animateInitial();
  watchUi();
  addPointerDepth();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();