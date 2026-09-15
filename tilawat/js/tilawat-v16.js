import { Player } from './player.js';

const $=(s,r=document)=>r.querySelector(s);
const SEEK_SEND_INTERVAL=180;
const SEEK_CONFIRM_TOLERANCE=1.4;
const SEEK_CONFIRM_TIMEOUT=5000;

function patchYoutubeSeeking(){
  if(Player.prototype.__tilawatV16SeekPatched)return;
  Object.defineProperty(Player.prototype,'__tilawatV16SeekPatched',{value:true});

  const pos=Object.getOwnPropertyDescriptor(Player.prototype,'position');
  const originalPosition=pos?.get;
  const originalSeek=Player.prototype.seek;
  const originalStop=Player.prototype._stopEverything;

  if(originalPosition){
    Object.defineProperty(Player.prototype,'position',{
      configurable:true,
      get(){
        const actual=originalPosition.call(this);
        const pending=this.__tilawatPendingSeek;
        if(!pending||this.engine!=='youtube')return actual;
        const now=performance.now();
        if(Math.abs(actual-pending.target)<=SEEK_CONFIRM_TOLERANCE||now>=pending.expires){
          this.__tilawatPendingSeek=null;
          return actual;
        }
        return pending.target;
      }
    });
  }

  Player.prototype.seek=function(offset){
    const duration=this.duration||0;
    const target=Math.max(0,Math.min(Number(offset)||0,duration||Number(offset)||0));
    if(this.engine!=='youtube'||!this.yt?.seekTo){
      this.__tilawatPendingSeek=null;
      return originalSeek.call(this,target);
    }

    this.__tilawatPendingSeek={target,expires:performance.now()+SEEK_CONFIRM_TIMEOUT};
    this.__tilawatQueuedSeek=target;
    this.emit('time');

    const send=()=>{
      this.__tilawatSeekTimer=0;
      const queued=Number(this.__tilawatQueuedSeek);
      if(!Number.isFinite(queued)||this.engine!=='youtube'||!this.yt?.seekTo)return;
      this.__tilawatLastSeekSent=performance.now();
      try{this.yt.seekTo(this.start+queued,true)}catch{}
    };
    const since=performance.now()-(this.__tilawatLastSeekSent||0);
    if(since>=SEEK_SEND_INTERVAL){
      if(this.__tilawatSeekTimer){clearTimeout(this.__tilawatSeekTimer);this.__tilawatSeekTimer=0}
      send();
    }else if(!this.__tilawatSeekTimer){
      this.__tilawatSeekTimer=setTimeout(send,SEEK_SEND_INTERVAL-since);
    }
  };

  Player.prototype._stopEverything=function(...args){
    if(this.__tilawatSeekTimer){clearTimeout(this.__tilawatSeekTimer);this.__tilawatSeekTimer=0}
    this.__tilawatPendingSeek=null;
    this.__tilawatQueuedSeek=null;
    return originalStop.apply(this,args);
  };
}

const YALDOSRY_HOST=/^(?:www\.)?yaldosry\.com$/i;
function isYaldosryPage(value=''){
  try{
    const u=new URL(value);
    return u.protocol==='https:'&&YALDOSRY_HOST.test(u.hostname)&&!(/\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(?:[?#]|$)/i.test(u.href));
  }catch{return false}
}
async function resolveYaldosry(value){
  const r=await fetch(`/api/resolve-source?url=${encodeURIComponent(value)}`,{headers:{accept:'application/json'},cache:'no-store'});
  let data=null;try{data=await r.json()}catch{}
  if(!r.ok||!data?.audioUrl)throw new Error(data?.error||`resolver-${r.status}`);
  return {...data,audioUrl:new URL(data.audioUrl,location.href).href};
}
function installYaldosryForms(){
  const specs=[
    {form:$('#addForm'),input:$('#addSource'),hint:$('#sourceHint'),title:$('#addTitle'),reciter:$('#addReciter')},
    {form:$('#variantForm'),input:$('#variantSource'),hint:null,title:null,reciter:null}
  ];
  const bypass=new WeakSet();
  for(const spec of specs){
    const {form,input,hint,title,reciter}=spec;if(!form||!input)continue;
    let timer=0,seq=0,cached=null,cachedFor='';
    const resolveCurrent=async()=>{
      const value=input.value.trim();
      if(!isYaldosryPage(value)){cached=null;cachedFor='';return null}
      const my=++seq;
      if(hint)hint.textContent='جارٍ استخراج ملف الصوت من صفحة ياسر الدوسري…';
      try{
        const data=await resolveYaldosry(value);
        if(my!==seq||input.value.trim()!==value)return null;
        cached=data;cachedFor=value;
        if(title&&!title.value&&data.title)title.value=data.title.replace(/\s*>.*$/,'').trim();
        if(reciter&&!reciter.value)reciter.value='ياسر الدوسري';
        if(hint)hint.textContent='تم العثور على ملف الصوت داخل الصفحة — سيعمل كرابط صوت مباشر.';
        return data;
      }catch(err){
        if(my===seq&&hint)hint.textContent='تعذر استخراج ملف الصوت من هذه الصفحة. جرّب رابط تلاوة آخر من الموقع.';
        throw err;
      }
    };
    input.addEventListener('input',()=>{
      clearTimeout(timer);timer=setTimeout(()=>{resolveCurrent().catch(()=>{})},520);
    });
    form.addEventListener('submit',async e=>{
      if(bypass.has(form)){bypass.delete(form);return}
      const original=input.value.trim();
      if(!isYaldosryPage(original))return;
      e.preventDefault();e.stopImmediatePropagation();
      let data=cachedFor===original?cached:null;
      try{if(!data)data=await resolveCurrent()}catch{return}
      if(!data?.audioUrl)return;
      const previous=input.value;
      input.value=data.audioUrl;
      bypass.add(form);
      try{form.requestSubmit(e.submitter||undefined)}finally{input.value=previous}
    },true);
  }
}

function boot(){
  patchYoutubeSeeking();
  installYaldosryForms();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
