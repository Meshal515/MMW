/* One recitation, multiple playback engines. Local/direct audio stays on one
   long-lived Audio element. YouTube is a fallback/visual source. Multipart
   recordings keep one library item/cover and advance through up to five parts. */
import { getBlob } from './store.js';

const YT_API='https://www.youtube.com/iframe_api';
const TICK_MS=250;
const SEEK_SEND_INTERVAL=170;
const SEEK_CONFIRM_TOLERANCE=1.25;
const SEEK_CONFIRM_TIMEOUT=5000;
const MULTIPART_PROGRESS_PREFIX='tilawat-multipart-progress-v1:';

let ytApi=null;
function loadYouTubeApi(){
  if(ytApi)return ytApi;
  ytApi=new Promise((resolve,reject)=>{
    if(window.YT?.Player)return resolve(window.YT);
    const previous=window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady=()=>{try{previous?.()}catch{} resolve(window.YT)};
    let script=document.querySelector(`script[src="${YT_API}"]`);
    if(!script){script=document.createElement('script');script.src=YT_API;script.async=true;document.head.appendChild(script)}
    script.addEventListener('error',()=>reject(new Error('yt-api-unreachable')),{once:true});
  });
  return ytApi;
}
export function prewarmYouTube(){return loadYouTubeApi().catch(()=>null)}

export class Player{
  constructor(ytMountId){
    this.ytMountId=ytMountId;this.track=null;this.engine=null;this.source=null;this.objectUrl=null;
    this.listeners=new Map();this.rate=1;this.volume=1;this._wantPlay=false;this._seq=0;this._ended=false;this._resumeAt=0;
    this._pendingSeek=null;this._queuedSeek=null;this._seekTimer=0;this._lastSeekSent=0;
    this._parts=[];this._partIndex=0;this._activePart=null;this._lastMultipartWrite=0;
    this.audio=new Audio();this.audio.preload='metadata';this.audio.crossOrigin=null;
    this.audio.addEventListener('ended',()=>this._finish());
    this.audio.addEventListener('timeupdate',()=>{if(this.engine!=='audio')return;this._checkTrimEnd();this.emit('time');this._saveMultipartProgress()});
    this.audio.addEventListener('play',()=>this.emit('state'));
    this.audio.addEventListener('pause',()=>{this._saveMultipartProgress(true);this.emit('state')});
    this.audio.addEventListener('loadedmetadata',()=>this.emit('duration'));
    this.audio.addEventListener('error',()=>{
      if(this.engine!=='audio'||!this.track)return;
      if(this.source==='direct'&&this._activePart?.youtubeId){
        const seq=++this._seq;try{this.audio.pause()}catch{}this.audio.removeAttribute('src');try{this.audio.load()}catch{}
        this._loadYouTube(this._activePart.youtubeId,seq).catch(err=>{if(seq===this._seq)this.emit('error',err)});return;
      }
      this.emit('error',this.audio.error||new Error('audio-error'));
    });
    this.yt=null;this.ytState=-1;this._timer=setInterval(()=>this._tick(),TICK_MS);
  }
  on(event,fn){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(fn);return()=>this.listeners.get(event)?.delete(fn)}
  emit(event,payload){const set=this.listeners.get(event);if(set)for(const fn of set){try{fn(payload)}catch(err){console.error(err)}}}
  get playing(){if(this.engine==='youtube')return this.ytState===1||this.ytState===3;if(this.engine==='audio')return!this.audio.paused&&!this.audio.ended;return false}
  get buffering(){return this.engine==='youtube'?this.ytState===3:this.engine==='audio'&&this.audio.readyState<3}
  get time(){if(this.engine==='youtube')return this.yt?.getCurrentTime?.()||0;if(this.engine==='audio')return this.audio.currentTime||0;return 0}
  get start(){const part=this._activePart||this.track;return part&&part.start>0?Number(part.start):0}
  get rawDuration(){if(this.engine==='youtube')return this.yt?.getDuration?.()||0;if(this.engine==='audio')return Number.isFinite(this.audio.duration)?this.audio.duration:0;return 0}
  get end(){const raw=this.rawDuration,part=this._activePart||this.track,trim=part&&part.end>0?Number(part.end):0;return trim&&(!raw||trim<raw)?trim:raw}
  get position(){
    const actual=Math.max(0,this.time-this.start);
    const pending=this._pendingSeek;
    if(!pending||this.engine!=='youtube')return actual;
    const now=performance.now();
    if(Math.abs(actual-pending.target)<=SEEK_CONFIRM_TOLERANCE||now>=pending.expires){this._pendingSeek=null;return actual}
    return pending.target;
  }
  get duration(){return Math.max(0,this.end-this.start)}
  get backgroundCapable(){return this.engine==='audio'}
  get partIndex(){return this._partIndex}
  get partCount(){return Math.max(1,this._parts.length)}

  _buildParts(track){
    const first={id:'part-1',order:1,label:'الجزء 1',localAudioKey:track.localAudioKey||'',audioUrl:track.audioUrl||'',youtubeId:track.youtubeId||'',start:Number(track.start||0),end:Number(track.end||0)};
    const extras=(Array.isArray(track.parts)?track.parts:[]).slice(0,4).map((part,index)=>({id:part.id||`part-${index+2}`,order:index+2,label:part.label||`الجزء ${index+2}`,localAudioKey:part.localAudioKey||'',audioUrl:part.audioUrl||'',youtubeId:part.youtubeId||'',sourceUrl:part.sourceUrl||'',start:Number(part.start||0),end:Number(part.end||0)}));
    return [first,...extras].filter(part=>part.localAudioKey||part.audioUrl||part.youtubeId);
  }
  _progressKey(){return this.track?.id?`${MULTIPART_PROGRESS_PREFIX}${this.track.id}`:''}
  _readMultipartProgress(){
    if(this._parts.length<2)return null;const key=this._progressKey();if(!key)return null;
    try{const value=JSON.parse(localStorage.getItem(key)||'null');if(!value)return null;const index=Math.max(0,Math.min(this._parts.length-1,Number(value.index)||0)),position=Math.max(0,Number(value.position)||0);return{index,position}}catch{return null}
  }
  _saveMultipartProgress(force=false){
    if(this._parts.length<2||!this.track)return;const now=performance.now();if(!force&&now-this._lastMultipartWrite<1400)return;this._lastMultipartWrite=now;const key=this._progressKey();if(!key)return;
    try{localStorage.setItem(key,JSON.stringify({index:this._partIndex,position:this.position||0,at:Date.now()}))}catch{}
  }
  _clearMultipartProgress(){const key=this._progressKey();if(!key)return;try{localStorage.removeItem(key)}catch{}}
  _emitPart(){
    const detail={trackId:this.track?.id||'',index:this._partIndex,count:this.partCount,label:this._activePart?.label||`الجزء ${this._partIndex+1}`};
    this.emit('part',detail);try{window.dispatchEvent(new CustomEvent('tilawat:player-part',{detail}))}catch{}
  }

  async load(track,{autoplay=true,resume=true}={}){
    this._saveMultipartProgress(true);const seq=++this._seq;this._ended=false;this._wantPlay=autoplay;this._stopEverything();this.track=track;this._parts=this._buildParts(track);
    if(!resume){this._partIndex=0;this._resumeAt=0;this._clearMultipartProgress()}
    else{const saved=this._readMultipartProgress();this._partIndex=saved?.index||0;this._resumeAt=this._parts.length>1?(saved?.position||0):(track.lastPosition>8?track.lastPosition:0)}
    this.emit('track',track);this.emit('state');
    try{await this._loadPart(this._partIndex,seq)}catch(err){if(seq===this._seq)this.emit('error',err)}
  }
  async _loadPart(index,seq){
    if(seq!==this._seq)return;const part=this._parts[index];if(!part)throw new Error('no-source');this._partIndex=index;this._activePart=part;this._ended=false;this._emitPart();
    if(part.localAudioKey){const blob=await getBlob(part.localAudioKey).catch(()=>null);if(seq!==this._seq)return;if(blob){this.objectUrl=URL.createObjectURL(blob);await this._loadAudio(this.objectUrl,'local',seq);return}}
    if(part.audioUrl){await this._loadAudio(part.audioUrl,'direct',seq);return}
    if(part.youtubeId){await this._loadYouTube(part.youtubeId,seq);return}
    throw new Error('no-source');
  }
  async _advancePart(){
    const next=this._partIndex+1;if(next>=this._parts.length)return false;this._saveMultipartProgress(true);this._stopEverything();const seq=++this._seq;this._wantPlay=true;this._resumeAt=0;this._partIndex=next;this._activePart=this._parts[next];try{localStorage.setItem(this._progressKey(),JSON.stringify({index:next,position:0,at:Date.now()}))}catch{}await this._loadPart(next,seq);return true
  }
  async _loadAudio(src,source,seq){
    if(seq!==this._seq)return;this.engine='audio';this.source=source;this.audio.src=src;this.audio.playbackRate=this.rate;this.audio.volume=this.volume;this.audio.load();
    const desired=this._resumeAt>this.start?this._resumeAt:this.start;
    const positionSource=()=>{if(seq!==this._seq)return;try{const max=this.end||this.rawDuration||desired||this.start,target=desired>0?Math.min(desired,Math.max(this.start,max-1)):this.start;this.audio.currentTime=Number.isFinite(target)?target:this.start;this.emit('time')}catch{}};
    if(this.audio.readyState>=1)positionSource();else this.audio.addEventListener('loadedmetadata',positionSource,{once:true});
    this.emit('source',{source:this.source,backgroundCapable:true,partIndex:this._partIndex,partCount:this.partCount});if(this._wantPlay)this.play();
  }
  async _loadYouTube(videoId,seq){
    const YT=await loadYouTubeApi();if(seq!==this._seq)return;this.engine='youtube';this.source='youtube';this.emit('source',{source:this.source,backgroundCapable:false,partIndex:this._partIndex,partCount:this.partCount});
    if(!this.yt){
      this.yt=await new Promise((resolve,reject)=>{
        const player=new YT.Player(this.ytMountId,{host:'https://www.youtube-nocookie.com',width:320,height:180,playerVars:{autoplay:0,controls:0,disablekb:1,playsinline:1,modestbranding:1,rel:0,iv_load_policy:3,fs:0},events:{onReady:()=>resolve(player),onError:e=>this.emit('error',new Error('yt-'+(e&&e.data))),onStateChange:e=>this._onYtState(e)}});
        setTimeout(()=>reject(new Error('yt-player-timeout')),20000);
      });
      if(seq!==this._seq)return;
    }
    const resume=this._resumeAt>this.start?this._resumeAt:this.start;this.yt.loadVideoById({videoId,startSeconds:resume});
    try{this.yt.setPlaybackRate(this.rate)}catch{}try{this.yt.setVolume(Math.round(this.volume*100))}catch{}
    if(!this._wantPlay){const stop=()=>{try{this.yt.pauseVideo()}catch{}};setTimeout(stop,60);setTimeout(stop,320)}
    this.emit('duration');setTimeout(()=>{if(seq!==this._seq||!this.yt?.getVideoData)return;const data=this.yt.getVideoData();if(data?.title)this.emit('meta',{title:data.title,author:data.author})},900);
  }
  _finish(){
    if(this._ended)return;
    if(this._parts.length>1&&this._partIndex<this._parts.length-1){this._ended=true;this._advancePart().catch(err=>this.emit('error',err));return}
    this._ended=true;if(this._parts.length>1)this._clearMultipartProgress();this.emit('ended')
  }
  _checkTrimEnd(){const limit=this._activePart&&this._activePart.end>0?this._activePart.end:0;if(!limit||!this.playing)return false;if(this.time>=limit-.15){this._finish();return true}return false}
  _onYtState(event){if(this.engine!=='youtube')return;this.ytState=event.data;if(event.data===0)this._finish();if(event.data===1)this.emit('duration');this.emit('state')}
  _stopEverything(){
    this.engine=null;this.source=null;this.ytState=-1;this._pendingSeek=null;this._queuedSeek=null;if(this._seekTimer){clearTimeout(this._seekTimer);this._seekTimer=0}
    const oldObjectUrl=this.objectUrl;this.objectUrl=null;
    try{this.audio.pause()}catch{}this.audio.removeAttribute('src');try{this.audio.load()}catch{}
    if(oldObjectUrl)setTimeout(()=>{try{URL.revokeObjectURL(oldObjectUrl)}catch{}},250);
    if(this.yt?.stopVideo){try{this.yt.stopVideo()}catch{}}
  }
  play(){this._wantPlay=true;if(this.engine==='youtube'&&this.yt){try{this.yt.playVideo()}catch{}}else if(this.engine==='audio'){const p=this.audio.play();p?.catch?.(err=>{if(err?.name!=='AbortError')this.emit('error',err)})}this.emit('state')}
  pause(){this._wantPlay=false;if(this.engine==='youtube'&&this.yt){try{this.yt.pauseVideo()}catch{}}else if(this.engine==='audio')this.audio.pause();this._saveMultipartProgress(true);this.emit('state')}
  toggle(){this.playing?this.pause():this.play()}
  seek(offset){
    const duration=this.duration||0,target=Math.max(0,Math.min(Number(offset)||0,duration||Number(offset)||0));
    if(this.engine==='youtube'&&this.yt?.seekTo){
      this._pendingSeek={target,expires:performance.now()+SEEK_CONFIRM_TIMEOUT};this._queuedSeek=target;this.emit('time');
      const send=()=>{this._seekTimer=0;const queued=Number(this._queuedSeek);if(!Number.isFinite(queued)||this.engine!=='youtube'||!this.yt?.seekTo)return;this._lastSeekSent=performance.now();try{this.yt.seekTo(this.start+queued,true)}catch{}};
      const since=performance.now()-(this._lastSeekSent||0);
      if(since>=SEEK_SEND_INTERVAL){if(this._seekTimer){clearTimeout(this._seekTimer);this._seekTimer=0}send()}else if(!this._seekTimer)this._seekTimer=setTimeout(send,SEEK_SEND_INTERVAL-since);
      return;
    }
    this._pendingSeek=null;if(this.engine==='audio'){try{this.audio.currentTime=this.start+target}catch{}}this.emit('time');this._saveMultipartProgress(true);
  }
  nudge(seconds){this.seek(this.position+seconds)}
  setRate(rate){this.rate=rate;this.audio.playbackRate=rate;if(this.yt?.setPlaybackRate){try{this.yt.setPlaybackRate(rate)}catch{}}this.emit('state')}
  setVolume(volume){this.volume=volume;this.audio.volume=volume;if(this.yt?.setVolume){try{this.yt.setVolume(Math.round(volume*100))}catch{}}}
  stop(){this._saveMultipartProgress(true);this._seq++;this._stopEverything();this.track=null;this._parts=[];this._activePart=null;this._partIndex=0;this.emit('track',null);this.emit('state')}
  _tick(){if(!this.track||!this.engine)return;this._saveMultipartProgress();if(this.engine==='youtube'&&this._checkTrimEnd())return;if(this.engine==='youtube'&&(this.playing||this._pendingSeek))this.emit('time')}
}

function stableMediaHash(value=''){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}
  return h>>>0;
}
function mediaArtworkFallback(track){
  const direct=track?.sourceThumbnail||(track?.variants||[]).find(v=>v?.thumbnail)?.thumbnail||track?.cover||'';
  if(direct&&!String(direct).startsWith('blob:')){try{return new URL(direct,location.href).href}catch{return direct}}
  const name=String(track?.reciter||'').normalize('NFKD').replace(/[ً-ْٰـ]/g,'').replace(/[أإآٱ]/g,'ا').toLowerCase();
  const dossari=(name.includes('ياسر')&&name.includes('دوسري'))||/(yasser|yaser).*(dosari|dossari|aldosari|al-dosari)/i.test(name);
  const pool=dossari?['./assets/covers/dossari-1.jpg','./assets/covers/dossari-2.jpg','./assets/covers/dossari-3.jpg','./assets/covers/dossari-4.jpg']:['./assets/covers/fallback-1.jpg','./assets/covers/fallback-2.jpg','./assets/covers/fallback-3.jpg'];
  const seed=`${track?.reciter||''}|${track?.surah||''}|${track?.id||track?.title||''}`;
  try{return new URL(pool[stableMediaHash(seed)%pool.length],location.href).href}catch{return pool[0]}
}
function stableMediaArtwork(track,resolved){
  const value=String(resolved||'').trim();
  if(value&&!value.startsWith('blob:')){try{return new URL(value,location.href).href}catch{return value}}
  return mediaArtworkFallback(track);
}

export function bindMediaSession(player,handlers,artworkResolver){
  if(!('mediaSession'in navigator))return;const ms=navigator.mediaSession;const safe=(action,fn)=>{try{ms.setActionHandler(action,fn)}catch{}};let currentTrack=null;
  const syncMetadata=part=>{const track=currentTrack;if(!track)return;const raw=artworkResolver?artworkResolver(track):(track.cover||track.thumb||'./assets/icon-512.png');const resolved=stableMediaArtwork(track,raw);const artwork=resolved?[{src:resolved}]:[];const partText=part?.count>1?` · الجزء ${Number(part.index)+1} من ${part.count}`:'';try{ms.metadata=new MediaMetadata({title:track.title||'تلاوة',artist:track.reciter||'',album:([track.surah,track.year].filter(Boolean).join(' · ')||track.collection||'تلاوات')+partText,artwork})}catch{}};
  safe('play',()=>player.play());safe('pause',()=>player.pause());safe('stop',()=>player.stop());safe('previoustrack',()=>handlers.previous());safe('nexttrack',()=>handlers.next());
  safe('seekbackward',d=>player.nudge(-(d?.seekOffset||10)));safe('seekforward',d=>player.nudge(d?.seekOffset||10));safe('seekto',d=>{if(typeof d?.seekTime==='number')player.seek(d.seekTime-player.start)});
  player.on('track',track=>{currentTrack=track;if(!track){ms.metadata=null;ms.playbackState='none';return}syncMetadata({index:player.partIndex,count:player.partCount})});
  player.on('part',syncMetadata);
  player.on('state',()=>{ms.playbackState=player.playing?'playing':'paused'});
  player.on('time',()=>{if(!ms.setPositionState)return;const duration=player.duration;if(!duration||!Number.isFinite(duration))return;try{ms.setPositionState({duration,position:Math.min(Math.max(player.position,0),duration),playbackRate:player.rate})}catch{}});
}
