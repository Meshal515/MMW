import { Player } from './player.js';
import { getTrack, deleteTrack, deleteBlob, getPref, setPref } from './store.js';

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const PREF_ORDER='tilawat-library-order-v2';
const explicitPlaySelector='.library-row__play,.art__play,.surah-card__play,.last-listened-card__play,.row-play';
const STYLE_URL='./interaction-v28.css';
const GSAP_URL='./vendor/gsap/gsap.min.js';

const ui={
  activeTrackId:'',menuTrackId:'',menuSource:'',glassOpen:false,glassTimer:0,
  suppressClickUntil:0,noAutoplayKey:'',noAutoplayTimer:0
};
const gesture={active:false,pointerId:null,startX:0,startY:0,dx:0,dy:0,moved:false,raf:0};
let gsapPromise=null;

function ensureStyle(){
  if(document.querySelector('link[data-tilawat-v28]'))return;
  const link=document.createElement('link');link.rel='stylesheet';link.href=STYLE_URL;link.dataset.tilawatV28='1';document.head.append(link);
}
function ensureGsap(){
  if(window.gsap)return Promise.resolve(window.gsap);
  if(gsapPromise)return gsapPromise;
  gsapPromise=new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(s=>s.src?.endsWith('/vendor/gsap/gsap.min.js'));
    if(existing){
      if(window.gsap){resolve(window.gsap);return}
      existing.addEventListener('load',()=>resolve(window.gsap),{once:true});
      existing.addEventListener('error',reject,{once:true});
      return;
    }
    const s=document.createElement('script');s.src=GSAP_URL;s.async=true;s.addEventListener('load',()=>resolve(window.gsap),{once:true});s.addEventListener('error',reject,{once:true});document.head.append(s);
  }).catch(()=>null);
  return gsapPromise;
}
function notify(text){
  let el=$('#classicToast')||$('#tilawatV28Toast');
  if(!el){el=document.createElement('div');el.id='tilawatV28Toast';el.className='classic-toast';document.body.append(el)}
  el.textContent=text;el.classList.add('on');clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('on'),2400);
}
function icon(path){return`<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`}
const icons={
  edit:icon('<path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  layers:icon('<path d="m12 3 8 5-8 5-8-5 8-5Z"/><path d="m4 12 8 5 8-5M4 16l8 5 8-5"/>'),
  source:icon('<path d="M10 14 21 3M14 3h7v7"/><path d="M20 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/>'),
  trash:icon('<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>'),
  library:icon('<path d="M4 5v15M9 5v15"/><path d="m13.5 6.2 4.3-1.1 2.7 13.9-4.3 1.1z"/>'),
  playPath:'<path d="M8 5 19 12 8 19Z" fill="currentColor" stroke="none"/>',
  prev:icon('<path d="M5 5h2v14H5zM18 5.5 8.5 12 18 18.5z" fill="currentColor" stroke="none"/>'),
  next:icon('<path d="M6 5.5 15.5 12 6 18.5zM17 5h2v14h-2z" fill="currentColor" stroke="none"/>'),
  heart:icon('<path d="m12 20.5-7-6.6a4.3 4.3 0 0 1 6-6.1l1 .9 1-.9a4.3 4.3 0 0 1 6 6.1Z"/>')
};

function trackActionKey(track={}){
  if(track.catalogRef)return`catalog:${track.catalogRef.reciterId}|${track.catalogRef.moshafId}|${track.catalogRef.surahId}`;
  return track.id?`local:${track.id}`:'';
}
/* v2 remains the single playback owner. This patch only suppresses autoplay for
   card-body taps so explicit play affordances keep their distinct meaning. */
const originalLoad=Player.prototype.load;
if(!Player.prototype.__tilawatV28LoadPatched){
  Player.prototype.__tilawatV28LoadPatched=true;
  Player.prototype.load=function(track,options={}){
    const key=trackActionKey(track);
    if(ui.noAutoplayKey&&key===ui.noAutoplayKey){
      ui.noAutoplayKey='';clearTimeout(ui.noAutoplayTimer);ui.noAutoplayTimer=0;
      return originalLoad.call(this,track,{...options,autoplay:false});
    }
    return originalLoad.call(this,track,options);
  };
}
function pauseCardLoad(action){
  ui.noAutoplayKey=action.dataset.play?`local:${action.dataset.play}`:action.dataset.catalogPlay?`catalog:${action.dataset.catalogPlay}`:'';
  clearTimeout(ui.noAutoplayTimer);ui.noAutoplayTimer=setTimeout(()=>{ui.noAutoplayKey='';ui.noAutoplayTimer=0},8000);
}
function clearPausedCardLoad(){ui.noAutoplayKey='';clearTimeout(ui.noAutoplayTimer);ui.noAutoplayTimer=0}
function armPlayOnly(){
  const page=$('#playerPage');
  if(!page||!page.classList.contains('hidden'))return;
  let done=false;
  const finish=()=>{if(done)return;done=true;observer.disconnect();clearTimeout(timer);page.classList.add('hidden');document.body.style.overflow=''};
  const observer=new MutationObserver(()=>{if(!page.classList.contains('hidden'))finish()});
  observer.observe(page,{attributes:true,attributeFilter:['class']});
  const timer=setTimeout(()=>{done=true;observer.disconnect()},1800);
}

function currentPersistedId(){return $('#libraryGrid .library-row.is-current[data-play]')?.dataset.play||ui.activeTrackId||''}
function isMiniControl(target){return target instanceof Element&&!!target.closest('#miniPlay,#miniFav,#miniSeek')}
function markGestureClick(){ui.suppressClickUntil=performance.now()+460}
function clearMiniVisual(){
  const mini=$('#miniPlayer');if(!mini)return;
  window.gsap?.killTweensOf(mini);mini.style.removeProperty('transform');mini.style.removeProperty('opacity');mini.style.removeProperty('transition');
  $('#tilawatV28Hint')?.classList.remove('on');
}
function stopPlayback(){collapseGlass(true);clearMiniVisual();dispatchEvent(new CustomEvent('tilawat:stop-playback',{detail:{reason:'swipe-down'}}))}
function resetMiniVisual(){
  const mini=$('#miniPlayer');if(!mini)return;
  const gsap=window.gsap;
  if(gsap){gsap.killTweensOf(mini);gsap.to(mini,{x:0,y:0,opacity:1,duration:.2,ease:'power3.out',clearProps:'transform,opacity'})}
  else{mini.style.transition='transform .18s ease,opacity .18s ease';mini.style.transform='';mini.style.opacity='';setTimeout(()=>mini.style.removeProperty('transition'),200)}
  $('#tilawatV28Hint')?.classList.remove('on');
}
function stepVisibleLibrary(direction){
  const rows=$$('#libraryGrid .library-row').filter(row=>!row.hidden),current=rows.findIndex(row=>row.classList.contains('is-current'));
  if(rows.length>1&&current>=0){const index=(current+(direction>0?1:-1)+rows.length)%rows.length;rows[index].querySelector('.library-row__play')?.click();return true}
  const button=$(direction>0?'#next':'#prev');if(!button)return false;button.click();return true;
}

function ensureGlass(){
  if($('#tilawatV28Glass'))return;
  document.body.insertAdjacentHTML('beforeend',`<section class="tilawat-v28-glass" id="tilawatV28Glass" aria-hidden="true"><div class="tilawat-v28-glass-backdrop" id="tilawatV28GlassBackdrop"></div><div class="tilawat-v28-glass-card" id="tilawatV28GlassCard"><div class="tilawat-v28-grab"></div><div class="tilawat-v28-hero"><img id="tilawatV28GlassCover" alt=""><div><b id="tilawatV28GlassTitle"></b><span id="tilawatV28GlassSub"></span></div></div><div class="tilawat-v28-progress"><i id="tilawatV28GlassProgress"></i></div><div class="tilawat-v28-times"><span id="tilawatV28GlassCur">0:00</span><span id="tilawatV28GlassDur">0:00</span></div><div class="tilawat-v28-controls"><button id="tilawatV28GlassPrev" type="button" aria-label="السابق">${icons.prev}</button><button class="main" id="tilawatV28GlassPlay" type="button" aria-label="تشغيل"><svg id="tilawatV28GlassPlayIcon" viewBox="0 0 24 24" aria-hidden="true">${icons.playPath}</svg><span class="tilawat-v28-glass-eq" aria-hidden="true"><i></i><i></i><i></i></span></button><button id="tilawatV28GlassNext" type="button" aria-label="التالي">${icons.next}</button></div><div class="tilawat-v28-quick"><button id="tilawatV28GlassFav" type="button" aria-pressed="false" aria-label="إضافة للمفضلة">${icons.heart}<span>المفضلة</span></button><button id="tilawatV28GlassFull" type="button">${icons.layers}<span>فتح المشغل</span></button></div></div></section><div class="tilawat-v28-hint" id="tilawatV28Hint">اسحب أكثر لإيقاف التلاوة</div>`);
  $('#tilawatV28GlassBackdrop').addEventListener('click',()=>collapseGlass());
  $('#tilawatV28GlassPrev').addEventListener('click',()=>$('#prev')?.click());
  $('#tilawatV28GlassNext').addEventListener('click',()=>$('#next')?.click());
  $('#tilawatV28GlassPlay').addEventListener('click',()=>{$('#miniPlay')?.click();setTimeout(syncGlass,30)});
  $('#tilawatV28GlassFav').addEventListener('click',event=>{
    const button=event.currentTarget,next=button.getAttribute('aria-pressed')!=='true';
    button.classList.toggle('is-favorite',next);
    button.setAttribute('aria-pressed',String(next));
    button.setAttribute('aria-label',next?'إزالة من المفضلة':'إضافة للمفضلة');
    $('#miniFav')?.click();
    setTimeout(syncGlass,120);
  });
  $('#tilawatV28GlassFull').addEventListener('click',async()=>{await collapseGlass();$('#miniOpen')?.click()});

  const card=$('#tilawatV28GlassCard');let active=false,pid=null,startY=0,dy=0,raf=0;
  const apply=()=>{raf=0;const y=Math.min(72,Math.max(0,dy)*.52);card.style.transform=`translate3d(0,${y}px,0) scale(${1-Math.min(.03,Math.max(0,dy)/3000)})`};
  card.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;active=true;pid=e.pointerId;startY=e.clientY;dy=0;card.setPointerCapture?.(pid)});
  card.addEventListener('pointermove',e=>{if(!active||e.pointerId!==pid)return;dy=e.clientY-startY;if(dy<6)return;e.preventDefault();if(!raf)raf=requestAnimationFrame(apply)},{passive:false});
  card.addEventListener('pointerup',e=>{if(!active||e.pointerId!==pid)return;active=false;pid=null;if(raf){cancelAnimationFrame(raf);raf=0}if(dy>74)collapseGlass();else window.gsap?.to(card,{y:0,scale:1,duration:.2,ease:'power3.out'})||card.style.removeProperty('transform')});
  card.addEventListener('pointercancel',()=>{active=false;pid=null;if(raf){cancelAnimationFrame(raf);raf=0}window.gsap?.to(card,{y:0,scale:1,duration:.18})||card.style.removeProperty('transform')});
}
function setText(el,value){if(el&&el.textContent!==value)el.textContent=value}
function syncGlass(){
  if(!ui.glassOpen)return;
  const miniCover=$('#miniCover'),cover=$('#tilawatV28GlassCover'),src=miniCover?.currentSrc||miniCover?.src||'';
  if(cover&&src&&cover.src!==src){cover.dataset.fallback=miniCover?.dataset?.fallback||'';cover.src=src}
  setText($('#tilawatV28GlassTitle'),$('#miniTitle')?.textContent||'');setText($('#tilawatV28GlassSub'),$('#miniSub')?.textContent||'');
  const value=Number($('#miniSeek')?.value||0),bar=$('#tilawatV28GlassProgress');if(bar)bar.style.width=`${value/10}%`;
  setText($('#tilawatV28GlassCur'),$('#curTime')?.textContent||'0:00');setText($('#tilawatV28GlassDur'),$('#durTime')?.textContent||'0:00');
  const playIcon=$('#tilawatV28GlassPlayIcon'),miniIcon=$('#miniPlayIcon');if(playIcon&&miniIcon&&playIcon.innerHTML!==miniIcon.innerHTML)playIcon.innerHTML=miniIcon.innerHTML;
  const playing=document.documentElement.classList.contains('is-audio-playing'),playButton=$('#tilawatV28GlassPlay');
  playButton?.classList.toggle('is-playing',playing);playButton?.setAttribute('aria-label',playing?'إيقاف مؤقت':'تشغيل');
  const fav=$('#tilawatV28GlassFav'),favActive=$('#miniFav')?.getAttribute('aria-pressed')==='true'||$('#miniFav')?.classList.contains('is-favorite');
  fav?.classList.toggle('is-favorite',favActive);fav?.setAttribute('aria-pressed',String(!!favActive));fav?.setAttribute('aria-label',favActive?'إزالة من المفضلة':'إضافة للمفضلة');
}
async function expandGlass(){
  const mini=$('#miniPlayer');if(!mini||mini.classList.contains('hidden')||ui.glassOpen)return;
  ensureGlass();ui.glassOpen=true;syncGlass();const root=$('#tilawatV28Glass'),card=$('#tilawatV28GlassCard'),back=$('#tilawatV28GlassBackdrop');root.classList.add('is-open');root.setAttribute('aria-hidden','false');
  clearInterval(ui.glassTimer);ui.glassTimer=setInterval(syncGlass,300);
  const gsap=await ensureGsap();if(gsap){gsap.killTweensOf([card,back]);gsap.timeline().fromTo(back,{opacity:0},{opacity:1,duration:.18,ease:'power2.out'},0).fromTo(card,{y:54,scale:.98},{y:0,scale:1,duration:.36,ease:'power4.out'},0)}else{card.style.transform='none';back.style.opacity='1'}
}
async function collapseGlass(immediate=false){
  if(!ui.glassOpen&&!immediate)return;ui.glassOpen=false;clearInterval(ui.glassTimer);ui.glassTimer=0;
  const root=$('#tilawatV28Glass'),card=$('#tilawatV28GlassCard'),back=$('#tilawatV28GlassBackdrop');if(!root)return;
  const finish=()=>{root.classList.remove('is-open');root.setAttribute('aria-hidden','true');card.style.removeProperty('transform');card.style.removeProperty('opacity');back.style.removeProperty('opacity')};
  if(immediate){window.gsap?.killTweensOf([card,back]);finish();return}
  const gsap=await ensureGsap();if(!gsap){finish();return}
  await new Promise(resolve=>gsap.timeline({onComplete:()=>{finish();resolve()}}).to(card,{y:48,scale:.985,duration:.2,ease:'power3.in'},0).to(back,{opacity:0,duration:.18},.02));
}

/* Management sheet is created only when requested. Keeping it out of startup
   prevents the old edit form from flashing before its stylesheet loads. */
function ensureManagementUi(){
  if($('#tilawatV28ActionBackdrop'))return;
  document.body.insertAdjacentHTML('beforeend',`<div class="tilawat-v28-backdrop" id="tilawatV28ActionBackdrop" aria-hidden="true"><div class="tilawat-v28-sheet" id="tilawatV28ActionSheet" role="dialog" aria-modal="true" aria-label="إدارة التلاوة"></div></div>`);
  $('#tilawatV28ActionBackdrop').addEventListener('click',e=>{if(e.target===e.currentTarget)closeActionSheet()});
}
function closeActionSheet(){const back=$('#tilawatV28ActionBackdrop');if(!back)return;back.classList.remove('is-open');back.setAttribute('aria-hidden','true');ui.menuTrackId='';ui.menuSource=''}
async function openActionSheet(id=''){
  ensureManagementUi();ui.menuTrackId=id||currentPersistedId();const rec=ui.menuTrackId?await getTrack(ui.menuTrackId).catch(()=>null):null;ui.menuSource=(rec?.variants||[]).find(v=>v.sourceUrl)?.sourceUrl||'';
  const rows=[];
  if(rec)rows.push(`<button class="tilawat-v28-action" type="button" data-v28-action="edit">${icons.edit}<span><b>تعديل التلاوة</b><small>كل التفاصيل والمصدر والغلاف والأجزاء</small></span></button>`);
  rows.push(`<button class="tilawat-v28-action" type="button" data-v28-action="variant">${icons.layers}<span><b>إضافة نسخة</b><small>مصدر أو جودة أخرى لنفس التلاوة</small></span></button>`);
  if(ui.menuSource)rows.push(`<button class="tilawat-v28-action" type="button" data-v28-action="source">${icons.source}<span><b>فتح المصدر</b><small>الانتقال إلى المصدر الأصلي</small></span></button>`);
  if(!rec)rows.push(`<button class="tilawat-v28-action" type="button" data-v28-action="save">${icons.library}<span><b>أضف إلى مكتبتي</b><small>احفظ التلاوة لتظهر في مكتبتك</small></span></button>`);
  if(rec)rows.push(`<button class="tilawat-v28-action danger" type="button" data-v28-action="delete">${icons.trash}<span><b>حذف من المكتبة</b><small>يحذف التسجيل وملفاته المحلية</small></span></button>`);
  const sheet=$('#tilawatV28ActionSheet');sheet.innerHTML=rows.join('');sheet.onclick=async e=>{const button=e.target.closest('[data-v28-action]');if(!button)return;const action=button.dataset.v28Action,trackId=ui.menuTrackId,source=ui.menuSource;closeActionSheet();if(action==='edit')dispatchEvent(new CustomEvent('tilawat:edit-track',{detail:{id:trackId}}));else if(action==='variant')$('#addVariantBtn')?.click();else if(action==='source'&&source)window.open(source,'_blank','noopener');else if(action==='save')$('#saveRec')?.click();else if(action==='delete')confirmDelete(trackId)};
  const back=$('#tilawatV28ActionBackdrop');back.classList.add('is-open');back.setAttribute('aria-hidden','false');const gsap=await ensureGsap();if(gsap)gsap.fromTo(sheet,{y:24,scale:.988},{y:0,scale:1,duration:.24,ease:'power3.out'});
}
async function confirmDelete(id){
  if(!id)return;const rec=await getTrack(id).catch(()=>null);if(!rec)return;if(!confirm(`حذف «${rec.title||rec.surah||'التلاوة'}» من مكتبتك؟`))return;
  try{const keys=new Set([rec.coverKey,...(rec.variants||[]).map(v=>v.localAudioKey),...(rec.parts||[]).map(p=>p.localAudioKey)].filter(Boolean));for(const key of keys)await deleteBlob(key).catch(()=>{});await deleteTrack(id);const order=await getPref(PREF_ORDER).catch(()=>[]);if(Array.isArray(order))await setPref(PREF_ORDER,order.filter(x=>x!==id)).catch(()=>{});if(currentPersistedId()===id)stopPlayback();dispatchEvent(new CustomEvent('tilawat-library-imported'));notify('حُذفت التلاوة من المكتبة.')}catch(err){console.warn(err);notify('تعذر حذف التلاوة.')}
}

function bindCardSemantics(){
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;if(!target)return;
    if(target.closest('#playerMore')){event.preventDefault();event.stopImmediatePropagation();openActionSheet(currentPersistedId());return}
    const action=target.closest('[data-play],[data-catalog-play]');if(!action)return;
    ui.activeTrackId=action.dataset.play||'';
    const explicit=target.closest(explicitPlaySelector);
    if(explicit){clearPausedCardLoad();armPlayOnly();return}
    pauseCardLoad(action);
  },true);
}
function bindMini(){
  const mini=$('#miniPlayer');if(!mini)return;
  mini.addEventListener('click',event=>{if(!event.isTrusted||performance.now()>=ui.suppressClickUntil)return;event.preventDefault();event.stopImmediatePropagation()},true);
  mini.addEventListener('click',event=>{if(isMiniControl(event.target))return;if(event.target instanceof Element&&event.target.closest('#miniOpen'))return;$('#miniOpen')?.click()});
  mini.addEventListener('pointerdown',event=>{if(event.button!==undefined&&event.button!==0)return;if(isMiniControl(event.target))return;gesture.active=true;gesture.pointerId=event.pointerId;gesture.startX=event.clientX;gesture.startY=event.clientY;gesture.dx=0;gesture.dy=0;gesture.moved=false;mini.setPointerCapture?.(event.pointerId)});
  const apply=()=>{gesture.raf=0;const ax=Math.abs(gesture.dx),ay=Math.abs(gesture.dy);if(ay>ax*1.15){const y=Math.max(-30,Math.min(58,gesture.dy*.36)),opacity=gesture.dy>0?Math.max(.86,1-gesture.dy/620):1;mini.style.transform=`translate3d(0,${y}px,0)`;mini.style.opacity=String(opacity);$('#tilawatV28Hint')?.classList.toggle('on',gesture.dy>64)}else if(ax>ay*1.15){const x=Math.max(-56,Math.min(56,gesture.dx*.34));mini.style.transform=`translate3d(${x}px,0,0)`}};
  mini.addEventListener('pointermove',event=>{if(!gesture.active||event.pointerId!==gesture.pointerId)return;gesture.dx=event.clientX-gesture.startX;gesture.dy=event.clientY-gesture.startY;const distance=Math.hypot(gesture.dx,gesture.dy);if(!gesture.moved&&distance>14)gesture.moved=true;if(!gesture.moved)return;event.preventDefault();if(!gesture.raf)gesture.raf=requestAnimationFrame(apply)},{passive:false});
  const finish=event=>{
    if(!gesture.active||event.pointerId!==gesture.pointerId)return;gesture.active=false;gesture.pointerId=null;if(gesture.raf){cancelAnimationFrame(gesture.raf);gesture.raf=0}
    const dx=gesture.dx,dy=gesture.dy,ax=Math.abs(dx),ay=Math.abs(dy),horizontalThreshold=Math.max(104,mini.clientWidth*.28);
    if(gesture.moved)markGestureClick();
    if(dy>112&&ay>ax*1.3){$('#tilawatV28Hint')?.classList.remove('on');const done=()=>stopPlayback();if(window.gsap)window.gsap.to(mini,{y:Math.max(90,mini.offsetHeight+30),opacity:0,duration:.24,ease:'power3.in',onComplete:done});else done();return}
    if(dy<-72&&ay>ax*1.28){clearMiniVisual();expandGlass();return}
    if(ax>horizontalThreshold&&ax>ay*1.4){const direction=dx>0?1:-1;if(stepVisibleLibrary(direction)){if(window.gsap)window.gsap.fromTo(mini,{x:direction>0?30:-30},{x:0,duration:.24,ease:'power3.out',clearProps:'transform,opacity'});else resetMiniVisual();return}}
    resetMiniVisual();
  };
  mini.addEventListener('pointerup',finish);mini.addEventListener('pointercancel',event=>{if(!gesture.active||event.pointerId!==gesture.pointerId)return;gesture.active=false;gesture.pointerId=null;if(gesture.raf){cancelAnimationFrame(gesture.raf);gesture.raf=0}resetMiniVisual()});
}

function boot(){
  ensureStyle();ensureGsap();bindCardSemantics();bindMini();
  addEventListener('tilawat:stop-playback',()=>{ui.activeTrackId='';clearPausedCardLoad();collapseGlass(true)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();