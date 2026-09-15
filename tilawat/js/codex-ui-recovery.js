const STYLE_URL='./codex-ui-recovery.css';
const REDUCED=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
let gsapReady=false;
let pointerDepthBound=false;

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
    console.info('Tilawat motion enhancement unavailable; stable UI remains active.',err);
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

/*
  Important: rendered content is intentionally NOT animated from a MutationObserver.
  v2 replaces several lists with innerHTML as catalog/library state changes. Animating
  those mutations after they are already visible makes the UI look like it entered,
  then redrew itself a fraction of a second later. Keep mutation work limited to icon
  normalization, which happens in the same microtask before the browser paints.
*/
function watchIcons(){
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      if(mutation.type!=='childList'||!mutation.addedNodes.length)continue;
      for(const node of mutation.addedNodes){
        if(node instanceof HTMLElement)enhanceIcons(node);
      }
    }
  });
  observer.observe(document.body,{subtree:true,childList:true});
}

function addPointerDepth(){
  if(pointerDepthBound||!gsapReady||!matchMedia('(hover:hover) and (pointer:fine)').matches||REDUCED())return;
  pointerDepthBound=true;
  document.addEventListener('pointermove',event=>{
    const card=event.target.closest('.media-card .art,.last-listened-card');
    if(!card)return;
    const r=card.getBoundingClientRect(),x=(event.clientX-r.left)/r.width-.5,y=(event.clientY-r.top)/r.height-.5;
    window.gsap.to(card,{rotateX:-y*2.4,rotateY:x*2.8,y:-2,duration:.35,ease:'power2.out',transformPerspective:700,transformOrigin:'center'});
  },{passive:true});
  document.addEventListener('pointerout',event=>{
    const card=event.target.closest?.('.media-card .art,.last-listened-card');
    if(card)window.gsap.to(card,{rotateX:0,rotateY:0,y:0,duration:.42,ease:'power3.out'});
  },{passive:true});
}

function boot(){
  ensureStyle();
  document.documentElement.dataset.codexUi='loading';
  enhanceIcons();
  qa('.view,.player-page,.browse,.dialog,#classicSettings').forEach(markSurface);
  watchIcons();

  // Load motion libraries without replaying the already-painted interface.
  // This prevents the visible second pass that previously happened after CDN load.
  ensureGsap().then(ok=>{
    document.documentElement.dataset.codexUi=ok?'gsap':'css';
    if(ok)addPointerDepth();
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();