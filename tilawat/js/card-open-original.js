import { Player } from './player.js';

/*
  A card tap should keep Tilawat's original full player page, but opening a card
  must not start audio by itself. v22 briefly introduced a separate preview page;
  keep that internal bridge invisible and immediately forward it into the original
  player flow with autoplay disabled for that one load.
*/
const FLAG='__tilawatOpenCardPausedOnce';
const originalLoad=Player.prototype.load;

if(!Player.prototype.__tilawatCardOpenPatched){
  Player.prototype.__tilawatCardOpenPatched=true;
  Player.prototype.load=function(track,options={}){
    if(window[FLAG]){
      window[FLAG]=false;
      return originalLoad.call(this,track,{...options,autoplay:false});
    }
    return originalLoad.call(this,track,options);
  };
}

function install(){
  if(document.getElementById('tilawatOriginalCardOpenStyle'))return;
  const style=document.createElement('style');
  style.id='tilawatOriginalCardOpenStyle';
  style.textContent='#tilawatPreview{display:none!important}';
  document.head.append(style);

  const wire=()=>{
    const preview=document.getElementById('tilawatPreview');
    if(!preview||preview.dataset.originalCardOpen==='1')return false;
    preview.dataset.originalCardOpen='1';
    const observer=new MutationObserver(()=>{
      if(!preview.classList.contains('is-open'))return;
      const play=document.getElementById('tilawatPreviewPlay');
      if(!play)return;
      window[FLAG]=true;
      queueMicrotask(()=>play.click());
    });
    observer.observe(preview,{attributes:true,attributeFilter:['class']});
    return true;
  };

  if(wire())return;
  const bodyObserver=new MutationObserver(()=>{if(wire())bodyObserver.disconnect()});
  bodyObserver.observe(document.body,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
