const $=(s,r=document)=>r.querySelector(s);
const AUDIO_EXT=/\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(?:[?#]|$)/i;
const YOUTUBE_HOST=/(?:^|\.)(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/i;
const YALDOSRY_HOST=/^(?:www\.)?yaldosry\.com$/i;
const RESOLVERS=['/api/resolve','https://tilawat-catalog.ngm-309.workers.dev/api/resolve'];
const seekInputs=[];
const valueDescriptors=new Map();
let activeSeek=null;
let seekDragging=false;
let seekUiLocked=false;
let seekTargetSeconds=null;
let seekUnlockTimer=0;
let keyboardCommitTimer=0;
let suppressNextChange=false;
const deferredValues=new Map();

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
function descriptorFor(input){return valueDescriptors.get(input)||Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')}
function rawSeekValue(input=activeSeek){
  if(!input)return 0;const d=descriptorFor(input);return Number(d?.get?.call(input)||input.value||0)||0;
}
function setRawSeekValue(input,value){
  if(!input)return;const d=descriptorFor(input);if(d?.set)d.set.call(input,String(value));else input.value=String(value);
}
function setAllRawSeekValues(value){for(const input of seekInputs)setRawSeekValue(input,value)}
function previewSeek(){
  if(!activeSeek)return;
  const value=Math.max(0,Math.min(1000,rawSeekValue(activeSeek))),duration=parseClock($('#durTime')?.textContent||''),ratio=value/1000;
  setAllRawSeekValues(value);
  const cur=$('#curTime');if(cur&&duration>0)cur.textContent=formatClock(duration*ratio);
  const mini=$('#miniSeek');if(mini)mini.style.setProperty('--mini-pct',`${ratio*100}%`);
}
function unlockSeekUi(){
  clearTimeout(seekUnlockTimer);seekUnlockTimer=0;clearTimeout(keyboardCommitTimer);keyboardCommitTimer=0;
  seekUiLocked=false;seekDragging=false;seekTargetSeconds=null;activeSeek=null;suppressNextChange=false;
  document.documentElement.classList.remove('is-seeking');
  for(const input of seekInputs){if(deferredValues.has(input)){setRawSeekValue(input,deferredValues.get(input));deferredValues.delete(input)}}
}
function armSeekAcknowledgement(target){
  seekTargetSeconds=target;clearTimeout(seekUnlockTimer);seekUnlockTimer=setTimeout(unlockSeekUi,3200);
}
function commitSeek(){
  if(!activeSeek)return;
  clearTimeout(keyboardCommitTimer);keyboardCommitTimer=0;
  const value=Math.max(0,Math.min(1000,rawSeekValue(activeSeek))),duration=parseClock($('#durTime')?.textContent||''),target=duration>0?duration*(value/1000):null;
  seekDragging=false;seekUiLocked=true;setAllRawSeekValues(value);document.documentElement.classList.add('is-seeking');
  const ev=new Event('change',{bubbles:true,cancelable:false});ev.__tilawatSeekCommit=true;activeSeek.dispatchEvent(ev);
  if(target!=null)armSeekAcknowledgement(target);else seekUnlockTimer=setTimeout(unlockSeekUi,900);
}
function installStableSeek(){
  for(const input of [$('#seek'),$('#miniSeek')]){
    if(!input||input.dataset.codexStableSeek==='1')continue;
    input.dataset.codexStableSeek='1';seekInputs.push(input);
    const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');valueDescriptors.set(input,d);
    if(d?.get&&d?.set){Object.defineProperty(input,'value',{configurable:true,get(){return d.get.call(this)},set(value){if(seekUiLocked){deferredValues.set(this,String(value));return}d.set.call(this,String(value))}})}
  }
  if(!seekInputs.length)return;
  document.addEventListener('pointerdown',event=>{
    const input=seekInputs.find(x=>x===event.target);if(!input)return;
    activeSeek=input;seekDragging=true;seekUiLocked=true;deferredValues.clear();seekTargetSeconds=null;suppressNextChange=false;document.documentElement.classList.add('is-seeking');
  },true);
  document.addEventListener('touchstart',event=>{
    const input=seekInputs.find(x=>x===event.target);if(!input)return;
    activeSeek=input;seekDragging=true;seekUiLocked=true;deferredValues.clear();seekTargetSeconds=null;suppressNextChange=false;document.documentElement.classList.add('is-seeking');
  },{capture:true,passive:true});
  document.addEventListener('input',event=>{
    const input=seekInputs.find(x=>x===event.target);if(!input||event.__tilawatSeekCommit)return;
    event.stopImmediatePropagation();event.stopPropagation();activeSeek=input;if(!seekUiLocked)seekUiLocked=true;previewSeek();
    if(!seekDragging){clearTimeout(keyboardCommitTimer);keyboardCommitTimer=setTimeout(commitSeek,140)}
  },true);
  document.addEventListener('change',event=>{
    const input=seekInputs.find(x=>x===event.target);if(!input||event.__tilawatSeekCommit)return;
    event.stopImmediatePropagation();event.stopPropagation();activeSeek=input;if(suppressNextChange){suppressNextChange=false;return}commitSeek();
  },true);
  document.addEventListener('pointerup',event=>{
    const input=seekInputs.find(x=>x===event.target);if(!input||!seekDragging)return;
    event.stopPropagation();activeSeek=input;suppressNextChange=true;commitSeek();
  },true);
  document.addEventListener('pointercancel',event=>{if(seekInputs.includes(event.target)&&seekDragging){event.stopPropagation();unlockSeekUi()}},true);
  const cur=$('#curTime');if(cur)new MutationObserver(()=>{if(seekTargetSeconds==null)return;const actual=parseClock(cur.textContent||'');if(Math.abs(actual-seekTargetSeconds)<=2.25)unlockSeekUi()}).observe(cur,{subtree:true,childList:true,characterData:true});
}

function isPageLike(url=''){
  let u;try{u=new URL(url)}catch{return false}
  if(!/^https?:$/.test(u.protocol)||AUDIO_EXT.test(u.href)||YOUTUBE_HOST.test(u.hostname)||YALDOSRY_HOST.test(u.hostname))return false;
  return true;
}
async function resolveAudioPage(url){
  let lastError=null;
  for(const base of RESOLVERS){
    try{
      const response=await fetch(`${base}?url=${encodeURIComponent(url)}`,{headers:{accept:'application/json'},cache:'no-store'}),data=await response.json().catch(()=>null);
      if(!response.ok||!data?.ok)throw new Error(data?.reason||data?.error||`resolve-${response.status}`);
      const audio=Array.isArray(data.audio)?data.audio.find(item=>item&&AUDIO_EXT.test(item.url||'')):null;
      if(audio?.url)return audio.url;
      if(data.audioUrl&&AUDIO_EXT.test(data.audioUrl))return data.audioUrl;
      lastError=new Error('no-audio');
    }catch(error){lastError=error}
  }
  if(lastError)throw lastError;return'';
}
function resolverMessage(config,message){const hint=$(config.hint);if(hint)hint.textContent=message}
function installPageResolver(){
  const configs=[
    {form:'#addForm',source:'#addSource',hint:'#sourceHint'},
    {form:'#variantForm',source:'#variantSource',hint:'#variantSourceHint',provider:'#variantProvider'}
  ];
  for(const config of configs){
    const source=$(config.source);if(!source)continue;
    source.addEventListener('change',()=>{if(isPageLike(source.value.trim()))resolverMessage(config,'رابط صفحة — سنستخرج ملف الصوت المباشر منها عند الإضافة.')});
  }
  document.addEventListener('submit',async event=>{
    if(event.__tilawatResolved)return;
    const config=configs.find(item=>event.target===$(item.form));if(!config)return;
    const form=$(config.form),source=$(config.source);if(!form||!source)return;
    const original=source.value.trim();if(!isPageLike(original))return;
    event.preventDefault();event.stopImmediatePropagation();event.stopPropagation();resolverMessage(config,'جارٍ استخراج ملف الصوت من صفحة المصدر…');
    try{
      const audio=await resolveAudioPage(original);if(!audio){resolverMessage(config,'لم نجد ملفًا صوتيًا مباشرًا داخل الصفحة.');return}
      source.value=audio;source.dataset.resolvedFrom=original;
      if(config.provider&&!$(config.provider)?.value.trim())$(config.provider).value='generic';
      resolverMessage(config,'تم العثور على ملف الصوت المباشر — سيعمل داخل تلاوات.');
      const retry=new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:event.submitter||undefined});retry.__tilawatResolved=true;form.dispatchEvent(retry);
    }catch(err){console.warn('Tilawat page resolver failed',err);resolverMessage(config,'تعذر استخراج الصوت من هذه الصفحة. جرّب رابط MP3 المباشر أو ملفًا من جهازك.')}
  },true);
}

function boot(){installStableSeek();installPageResolver();document.documentElement.dataset.codexQa='v16'}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
