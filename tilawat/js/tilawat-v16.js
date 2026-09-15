const $=(s,r=document)=>r.querySelector(s);

const AUDIO_EXT=/\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(?:[?#]|$)/i;
const YOUTUBE_HOST=/(?:^|\.)(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;
let seek=null;
let valueDescriptor=null;
let seekDragging=false;
let seekUiLocked=false;
let seekTargetSeconds=null;
let deferredSeekValue=null;
let seekUnlockTimer=0;
let keyboardCommitTimer=0;
let suppressNextChange=false;

function parseClock(value=''){
  const parts=String(value).trim().split(':').map(Number);
  if(!parts.length||parts.some(n=>!Number.isFinite(n)))return 0;
  if(parts.length===3)return parts[0]*3600+parts[1]*60+parts[2];
  if(parts.length===2)return parts[0]*60+parts[1];
  return parts[0]||0;
}
function formatClock(seconds=0){
  seconds=Math.max(0,Math.floor(Number(seconds)||0));
  const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60),s=seconds%60;
  return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;
}
function rawSeekValue(){return Number(valueDescriptor?.get?.call(seek)||seek?.value||0)||0}
function setRawSeekValue(value){if(valueDescriptor?.set)valueDescriptor.set.call(seek,String(value));else if(seek)seek.value=String(value)}
function previewSeek(){
  if(!seek)return;
  const duration=parseClock($('#durTime')?.textContent||'');
  const ratio=Math.max(0,Math.min(1,rawSeekValue()/1000));
  if(duration>0){const cur=$('#curTime');if(cur)cur.textContent=formatClock(duration*ratio)}
  const bar=$('.mini2__progress'),fill=$('.mini2__progress i');
  const pct=ratio*100;
  if(fill)fill.style.width=`${pct}%`;
  if(bar){bar.style.setProperty('--mini-progress',`${pct}%`);bar.setAttribute('aria-valuenow',String(Math.round(pct)))}
}
function unlockSeekUi(){
  clearTimeout(seekUnlockTimer);seekUnlockTimer=0;
  seekUiLocked=false;seekDragging=false;seekTargetSeconds=null;
  document.documentElement.classList.remove('is-seeking');
  if(deferredSeekValue!=null){const v=deferredSeekValue;deferredSeekValue=null;setRawSeekValue(v)}
}
function armSeekAcknowledgement(target){
  seekTargetSeconds=target;
  clearTimeout(seekUnlockTimer);
  seekUnlockTimer=setTimeout(unlockSeekUi,3200);
}
function commitSeek(){
  if(!seek)return;
  clearTimeout(keyboardCommitTimer);keyboardCommitTimer=0;
  const value=Math.max(0,Math.min(1000,rawSeekValue()));
  const duration=parseClock($('#durTime')?.textContent||'');
  const target=duration>0?duration*(value/1000):null;
  seekDragging=false;seekUiLocked=true;
  document.documentElement.classList.add('is-seeking');
  const ev=new Event('input',{bubbles:true,cancelable:false});
  ev.__tilawatSeekCommit=true;
  seek.dispatchEvent(ev);
  if(target!=null)armSeekAcknowledgement(target);else seekUnlockTimer=setTimeout(unlockSeekUi,900);
}
function installStableSeek(){
  seek=$('#seek');if(!seek||seek.dataset.tilawatV16==='1')return;
  seek.dataset.tilawatV16='1';
  valueDescriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  if(valueDescriptor?.get&&valueDescriptor?.set){
    Object.defineProperty(seek,'value',{
      configurable:true,
      get(){return valueDescriptor.get.call(this)},
      set(value){
        if(seekUiLocked){deferredSeekValue=String(value);return}
        valueDescriptor.set.call(this,String(value));
      }
    });
  }

  document.addEventListener('pointerdown',event=>{
    if(event.target!==seek)return;
    seekDragging=true;seekUiLocked=true;deferredSeekValue=null;seekTargetSeconds=null;suppressNextChange=false;
    document.documentElement.classList.add('is-seeking');
  },true);

  document.addEventListener('input',event=>{
    if(event.target!==seek||event.__tilawatSeekCommit)return;
    event.stopImmediatePropagation();event.stopPropagation();
    if(!seekUiLocked)seekUiLocked=true;
    previewSeek();
    if(!seekDragging){
      clearTimeout(keyboardCommitTimer);
      keyboardCommitTimer=setTimeout(commitSeek,140);
    }
  },true);

  document.addEventListener('change',event=>{
    if(event.target!==seek)return;
    event.stopImmediatePropagation();event.stopPropagation();
    if(suppressNextChange){suppressNextChange=false;return}
    commitSeek();
  },true);

  document.addEventListener('pointerup',event=>{
    if(!seekDragging||event.target!==seek)return;
    // Prevent v14's older pointerup handler from issuing another seek with a stale value.
    event.stopPropagation();suppressNextChange=true;
    commitSeek();
  },true);

  document.addEventListener('pointercancel',event=>{
    if(!seekDragging||event.target!==seek)return;
    event.stopPropagation();suppressNextChange=false;
    unlockSeekUi();
  },true);

  const cur=$('#curTime');
  if(cur){
    new MutationObserver(()=>{
      if(seekTargetSeconds==null)return;
      const actual=parseClock(cur.textContent||'');
      if(Math.abs(actual-seekTargetSeconds)<=2.25)unlockSeekUi();
    }).observe(cur,{subtree:true,childList:true,characterData:true});
  }
}

function isPageLike(url=''){
  let u;try{u=new URL(url)}catch{return false}
  if(!/^https?:$/.test(u.protocol)||AUDIO_EXT.test(u.href)||YOUTUBE_HOST.test(u.hostname))return false;
  return true;
}
async function resolveAudioPage(url){
  const response=await fetch(`/api/resolve?url=${encodeURIComponent(url)}`,{headers:{accept:'application/json'},cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.ok)throw new Error(data?.reason||`resolve-${response.status}`);
  const audio=Array.isArray(data.audio)?data.audio.find(item=>item&&AUDIO_EXT.test(item.url||'')):null;
  return audio?.url||'';
}
function notifyResolve(message){const hint=$('#sourceHint');if(hint)hint.textContent=message}
function installPageResolver(){
  const form=$('#addForm'),source=$('#addSource');if(!form||!source||form.dataset.tilawatResolver==='1')return;
  form.dataset.tilawatResolver='1';
  source.addEventListener('change',()=>{
    const value=source.value.trim();
    if(isPageLike(value))notifyResolve('رابط صفحة — سنستخرج ملف الصوت المباشر منها عند الإضافة.');
  });
  document.addEventListener('submit',async event=>{
    if(event.target!==form||event.__tilawatResolved)return;
    const original=source.value.trim();
    if(!isPageLike(original))return;
    event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();
    notifyResolve('جارٍ استخراج ملف الصوت من صفحة المصدر…');
    try{
      const audio=await resolveAudioPage(original);
      if(!audio){notifyResolve('لم نجد ملفًا صوتيًا مباشرًا داخل الصفحة.');return}
      source.value=audio;
      source.dataset.resolvedFrom=original;
      notifyResolve('تم العثور على ملف الصوت المباشر — سيعمل داخل تلاوات.');
      const retry=new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:event.submitter||undefined});
      retry.__tilawatResolved=true;
      form.dispatchEvent(retry);
    }catch(err){
      console.warn('Tilawat page resolver failed',err);
      notifyResolve('تعذر استخراج الصوت من هذه الصفحة. جرّب رابط MP3 المباشر أو ملفًا من جهازك.');
    }
  },true);
}

function boot(){installStableSeek();installPageResolver()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
