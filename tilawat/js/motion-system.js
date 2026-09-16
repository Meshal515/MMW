const STYLE_URL='./motion-system.css';
const REDUCED=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const depthControllers=new WeakMap();
let pointerDepthBound=false;
let playerClosing=false;
let browseClosing=false;

function ensureStyle(){
  if(q('link[data-tilawat-motion]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';link.href=STYLE_URL;link.dataset.tilawatMotion='';
  document.head.append(link);
}

function gsap(){return window.gsap||null}
function registerMotionPlugins(){
  const g=gsap();if(!g)return false;
  try{if(window.ScrollTrigger)g.registerPlugin(window.ScrollTrigger);if(window.Flip)g.registerPlugin(window.Flip)}catch{}
  return true;
}

const plusSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const gripSvg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
const back10Svg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7H5V3M5.5 7A8 8 0 1 1 4 14"/><text x="12" y="15" text-anchor="middle">10</text></svg>';
const forward10Svg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7h4V3m-.5 4A8 8 0 1 0 20 14"/><text x="12" y="15" text-anchor="middle">10</text></svg>';

function enhanceIcons(root=document){
  const add=q('#addBtn b',root)||q('#addBtn b');
  if(add&&!add.dataset.svgUpgraded){add.innerHTML=plusSvg;add.dataset.svgUpgraded='1'}
  qa('.library-drag-handle',root).forEach(button=>{if(button.dataset.svgUpgraded)return;button.innerHTML=gripSvg;button.dataset.svgUpgraded='1'});
  const back=q('#back10',root)||q('#back10');if(back&&!back.dataset.timeIconFixed){back.innerHTML=back10Svg;back.dataset.timeIconFixed='1'}
  const forward=q('#forward10',root)||q('#forward10');if(forward&&!forward.dataset.timeIconFixed){forward.innerHTML=forward10Svg;forward.dataset.timeIconFixed='1'}
}

function arrangeTransport(){
  const transport=q('.transport'),play=q('#mainPlay'),back=q('#back10'),forward=q('#forward10'),prev=q('#prev'),next=q('#next');
  if(!transport||!play||!back||!forward||!prev||!next)return;
  transport.classList.add('transport--temporal');
  transport.append(prev,back,play,forward,next);
  back.classList.add('transport-seek','transport-seek--back');
  forward.classList.add('transport-seek','transport-seek--forward');
  back.setAttribute('aria-label','رجوع 10 ثوانٍ');
  forward.setAttribute('aria-label','تقديم 10 ثوانٍ');
  back.title='رجوع 10 ثوانٍ';forward.title='تقديم 10 ثوانٍ';
}

function depthController(card){
  const g=gsap();if(!g)return null;
  let controller=depthControllers.get(card);if(controller)return controller;
  g.set(card,{transformPerspective:700,transformOrigin:'center'});
  controller={
    rotateX:g.quickTo(card,'rotateX',{duration:.28,ease:'power2.out'}),
    rotateY:g.quickTo(card,'rotateY',{duration:.28,ease:'power2.out'}),
    y:g.quickTo(card,'y',{duration:.28,ease:'power2.out'})
  };
  depthControllers.set(card,controller);return controller;
}
function resetDepth(card){const c=depthControllers.get(card);if(c){c.rotateX(0);c.rotateY(0);c.y(0)}}
function addPointerDepth(){
  if(pointerDepthBound||!gsap()||!matchMedia('(hover:hover) and (pointer:fine)').matches||REDUCED())return;
  pointerDepthBound=true;
  document.addEventListener('pointermove',event=>{
    const card=event.target.closest?.('.media-card .art,.last-listened-card');if(!card)return;
    const r=card.getBoundingClientRect();if(!r.width||!r.height)return;
    const x=(event.clientX-r.left)/r.width-.5,y=(event.clientY-r.top)/r.height-.5,c=depthController(card);if(!c)return;
    c.rotateX(-y*2.4);c.rotateY(x*2.8);c.y(-2);
  },{passive:true});
  document.addEventListener('pointerout',event=>{
    const card=event.target.closest?.('.media-card .art,.last-listened-card');if(!card)return;
    const next=event.relatedTarget;if(next instanceof Node&&card.contains(next))return;resetDepth(card);
  },{passive:true});
}

/* Primary views never animate opacity. We enforce that at author-important level
   because legacy animation layers can otherwise temporarily win the cascade and
   wash the whole page out during navigation. Motion stays positional only. */
function animateView(view){
  if(!view)return;
  view.style.setProperty('opacity','1','important');
  if(REDUCED())return;
  const g=gsap();if(!g){view.classList.remove('motion-view-enter');void view.offsetWidth;view.classList.add('motion-view-enter');return}
  const head=q('h1,.page-title,.hero__heading',view),content=qa('.shelf,.search-results,.library-head,.favorite-hub,.seg,.library-grid',view).filter(el=>getComputedStyle(el).display!=='none').slice(0,5);
  g.killTweensOf([view,head,...content]);
  g.fromTo(view,{y:4},{y:0,duration:.28,ease:'power3.out',clearProps:'transform'});
  if(head)g.fromTo(head,{y:8},{y:0,duration:.4,ease:'power3.out',clearProps:'transform'});
  if(content.length)g.fromTo(content,{y:8},{y:0,duration:.42,ease:'power3.out',stagger:.028,clearProps:'transform'},.025);
}

function seekFeedback(button,seconds){
  if(!button)return;
  const direction=seconds<0?-1:1,g=gsap();
  if(!REDUCED()){
    if(g){g.killTweensOf(button);g.fromTo(button,{scale:.86,rotate:direction*10},{scale:1,rotate:0,duration:.48,ease:'back.out(2.4)',clearProps:'transform'})}
    else button.animate?.([{transform:`scale(.88) rotate(${direction*9}deg)`},{transform:'none'}],{duration:460,easing:'cubic-bezier(.16,1,.3,1)'})
  }
  const transport=button.closest('.transport');if(!transport)return;
  const badge=document.createElement('span');badge.className='seek-feedback';badge.textContent=seconds<0?'−10 ث':'+10 ث';badge.dir='ltr';transport.append(badge);
  const br=button.getBoundingClientRect(),tr=transport.getBoundingClientRect();badge.style.left=`${br.left-tr.left+br.width/2}px`;
  if(REDUCED()){badge.remove();return}
  if(g)g.fromTo(badge,{xPercent:-50,y:3,scale:.88,opacity:0},{y:-20,scale:1,opacity:1,duration:.22,ease:'power2.out',onComplete:()=>g.to(badge,{y:-34,opacity:0,duration:.34,delay:.12,ease:'power2.in',onComplete:()=>badge.remove()})});
  else{badge.animate?.([{transform:'translate(-50%,3px)',opacity:0},{transform:'translate(-50%,-18px)',opacity:1},{transform:'translate(-50%,-32px)',opacity:0}],{duration:620,easing:'ease-out'}).finished.finally(()=>badge.remove())}
}

function favoriteBurst(target,active){
  if(!target||REDUCED())return;
  const g=gsap();
  const icon=q('svg',target)||target;
  if(g){g.killTweensOf(icon);g.fromTo(icon,{scale:.72,rotate:-7},{scale:1,rotate:0,duration:.5,ease:active?'elastic.out(1,.38)':'back.out(2)',clearProps:'transform'})}
  else icon.animate?.([{transform:'scale(.72)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:480,easing:'cubic-bezier(.16,1,.3,1)'});
  if(!active)return;
  const r=icon.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  for(let i=0;i<6;i++){
    const dot=document.createElement('i');dot.className='tilawat-fav-burst';dot.style.left=`${cx-4}px`;dot.style.top=`${cy-4}px`;document.body.append(dot);
    const angle=(-Math.PI*.9)+(Math.PI*1.8)*(i/5),distance=18+(i%2)*8,dx=Math.cos(angle)*distance,dy=Math.sin(angle)*distance;
    if(g)g.fromTo(dot,{x:0,y:0,scale:.55,opacity:.95},{x:dx,y:dy,scale:0,opacity:0,duration:.52,ease:'power2.out',delay:i*.015,onComplete:()=>dot.remove()});
    else dot.animate?.([{transform:'translate(0,0) scale(.55)',opacity:.9},{transform:`translate(${dx}px,${dy}px) scale(0)`,opacity:0}],{duration:520,easing:'ease-out'}).finished.finally(()=>dot.remove());
  }
}

function closePlayerAnimated(event){
  if(REDUCED()||playerClosing)return;
  const button=event.target.closest?.('#playerClose');if(!button)return;
  const page=q('#playerPage');if(!page||page.classList.contains('hidden'))return;
  event.preventDefault();event.stopImmediatePropagation();playerClosing=true;
  const finish=()=>{page.classList.add('hidden');document.body.style.overflow='';page.style.removeProperty('transform');page.style.removeProperty('opacity');playerClosing=false;q('#miniOpen')?.focus()};
  const g=gsap();
  if(g){g.killTweensOf(page);g.to(page,{y:24,scale:.995,opacity:0,duration:.26,ease:'power3.inOut',onComplete:finish})}
  else{const anim=page.animate?.([{transform:'none',opacity:1},{transform:'translateY(24px) scale(.995)',opacity:0}],{duration:260,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});anim?.finished.then(finish).catch(finish)||finish()}
}

function closeBrowseAnimated(event){
  if(REDUCED()||browseClosing)return;
  const button=event.target.closest?.('#browseClose');if(!button)return;
  const page=q('#browsePage');if(!page||page.classList.contains('hidden'))return;
  event.preventDefault();event.stopImmediatePropagation();browseClosing=true;
  const finish=()=>{page.classList.add('hidden');page.style.removeProperty('transform');page.style.removeProperty('opacity');browseClosing=false};
  const g=gsap();if(g)g.to(page,{x:-14,opacity:0,duration:.22,ease:'power2.in',onComplete:finish});else finish();
}

function openDialogMotion(){
  if(REDUCED())return;
  requestAnimationFrame(()=>{
    const dialog=qa('.dialog:not(.hidden)').at(-1);if(!dialog)return;
    const sheet=q('.sheet',dialog);if(!sheet)return;
    const g=gsap();
    if(g)g.fromTo(sheet,{y:24,scale:.988,opacity:.96},{y:0,scale:1,opacity:1,duration:.4,ease:'power4.out',clearProps:'transform,opacity'});
    else sheet.animate?.([{transform:'translateY(22px) scale(.988)',opacity:.96},{transform:'none',opacity:1}],{duration:400,easing:'cubic-bezier(.16,1,.3,1)'});
  });
}

function boot(){
  ensureStyle();
  document.documentElement.dataset.motionUi='loading';
  enhanceIcons();
  arrangeTransport();
  const ready=registerMotionPlugins();
  document.documentElement.dataset.motionUi=ready?'gsap':'css';
  if(ready)addPointerDepth();

  addEventListener('tilawat:library-decorated',()=>enhanceIcons(q('#libraryGrid')||document));
  addEventListener('tilawat:favorite-feedback',event=>favoriteBurst(event.detail?.target,event.detail?.active));

  q('.tabbar')?.addEventListener('click',event=>{
    const tab=event.target.closest('[data-tab]');if(!tab)return;
    requestAnimationFrame(()=>animateView(q(`#${tab.dataset.tab}View`)));
  });
  q('#brand')?.addEventListener('click',()=>requestAnimationFrame(()=>animateView(q('#homeView'))));

  q('#back10')?.addEventListener('click',()=>seekFeedback(q('#back10'),-10));
  q('#forward10')?.addEventListener('click',()=>seekFeedback(q('#forward10'),10));

  document.addEventListener('click',closePlayerAnimated,true);
  document.addEventListener('click',closeBrowseAnimated,true);

  q('#addBtn')?.addEventListener('click',openDialogMotion);
  q('#addVariantBtn')?.addEventListener('click',openDialogMotion);
  addEventListener('tilawat:edit-form-opened',openDialogMotion);

  requestAnimationFrame(()=>animateView(q('#homeView')));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
