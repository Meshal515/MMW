import { getTrack, deleteTrack, deleteBlob, getPref, setPref } from './store.js';

const STYLE_URL='./library-membership.css';
const $=s=>document.querySelector(s);
const PREF_ORDER='tilawat-library-order-v2';
/* One plain bookmark, not a shape-per-state: three overlapping paths (two book
   spines, a tilted page, a tiny +/-) read as noise at 22px, and the row's other
   chips (repeat, sleep) already say "on" with colour alone via .is-library-saved
   below — that state doesn't need a second icon to carry it too. */
const BOOKMARK_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5V20l-5-3.4L7 20Z"/></svg>';
let syncing=false;

function ensureStyle(){if(document.querySelector('link[data-tilawat-membership]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href=STYLE_URL;link.dataset.tilawatMembership='';document.head.append(link)}
function toast(text){const el=$('#toast');if(!el)return;el.textContent=text;el.classList.add('on');clearTimeout(el._membershipTimer);el._membershipTimer=setTimeout(()=>el.classList.remove('on'),2500)}
function currentPersistedId(){return $('#libraryGrid .library-row.is-current[data-play]')?.dataset.play||''}
function setAttr(el,name,value){const next=String(value);if(el.getAttribute(name)!==next)el.setAttribute(name,next)}
function paint(button,{saved=false,manual=false}={}){
  if(!button)return;
  if(button.hidden!==!!manual)button.hidden=!!manual;
  if(manual)return;
  button.classList.toggle('is-library-saved',saved);
  button.classList.toggle('on',saved);
  setAttr(button,'aria-pressed',saved);
  setAttr(button,'aria-label',saved?'إزالة من مكتبتي':'أضف إلى مكتبتي');
  const title=saved?'إزالة من مكتبتي':'أضف إلى مكتبتي';if(button.title!==title)button.title=title;
  if(!button.dataset.membershipIcon){button.innerHTML=BOOKMARK_ICON;button.dataset.membershipIcon='1'}
}
async function sync(){
  if(syncing)return;syncing=true;
  try{
    const button=$('#saveRec');if(!button)return;
    const id=currentPersistedId();
    if(!id){paint(button,{saved:false,manual:false});return}
    const rec=await getTrack(id).catch(()=>null);
    if(!rec){paint(button,{saved:false,manual:false});return}
    /* Manual uploads are born in the library; a save toggle there is meaningless.
       They are removed explicitly from the management menu instead. */
    if(!rec.catalogRef){paint(button,{manual:true});return}
    paint(button,{saved:true});
  }finally{syncing=false}
}
async function removeSavedCatalog(button){
  const id=currentPersistedId();if(!id)return false;
  const rec=await getTrack(id).catch(()=>null);if(!rec||!rec.catalogRef)return false;
  const keys=new Set([rec.coverKey,...(rec.variants||[]).map(v=>v.localAudioKey),...(rec.parts||[]).map(p=>p.localAudioKey)].filter(Boolean));
  /* The v2 stop handler persists the current in-memory track. Stop while the row
     still exists, then delete it, so a stale player object cannot resurrect the
     record after deletion. */
  dispatchEvent(new CustomEvent('tilawat:stop-playback',{detail:{reason:'removed-from-library'}}));
  for(const key of keys)await deleteBlob(key).catch(()=>{});
  await deleteTrack(id);
  const order=await getPref(PREF_ORDER).catch(()=>[]);if(Array.isArray(order))await setPref(PREF_ORDER,order.filter(x=>x!==id)).catch(()=>{});
  paint(button,{saved:false});
  dispatchEvent(new CustomEvent('tilawat-library-imported'));
  toast('أزيلت التلاوة من مكتبتك.');
  return true;
}
function boot(){
  ensureStyle();const button=$('#saveRec');if(!button)return;
  button.addEventListener('click',async event=>{
    if(button.hidden||button.getAttribute('aria-pressed')!=='true')return;
    event.preventDefault();event.stopImmediatePropagation();
    try{await removeSavedCatalog(button)}catch(err){console.warn(err);toast('تعذر إزالة التلاوة من مكتبتك.')}
  },true);
  new MutationObserver(()=>queueMicrotask(sync)).observe(button,{attributes:true,attributeFilter:['aria-pressed','class','hidden']});
  addEventListener('tilawat-library-imported',()=>setTimeout(sync,0));
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-play],[data-catalog-play]'))setTimeout(sync,120)});
  setTimeout(sync,0);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();