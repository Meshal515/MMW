const $=s=>document.querySelector(s);

const gesture={active:false,pointerId:null,startX:0,startY:0,dx:0,dy:0,moved:false,suppressClick:false,suppressTimer:0};

function injectInteractionCss(){
  if(document.getElementById('tilawatMiniGestureCss'))return;
  const style=document.createElement('style');
  style.id='tilawatMiniGestureCss';
  style.textContent=`
    #miniPlayer{touch-action:none;will-change:transform,opacity}
    .tilawat-play-only #playerPage{visibility:hidden!important}
  `;
  document.head.append(style);
}

function armPlayOnly(){
  const page=$('#playerPage');
  if(!page)return;
  document.documentElement.classList.add('tilawat-play-only');
  let settled=false;
  const observer=new MutationObserver(()=>{
    if(page.classList.contains('hidden'))return;
    settled=true;
    page.classList.add('hidden');
    document.body.style.overflow='';
    observer.disconnect();
    queueMicrotask(()=>document.documentElement.classList.remove('tilawat-play-only'));
  });
  observer.observe(page,{attributes:true,attributeFilter:['class']});
  setTimeout(()=>{
    if(settled)return;
    observer.disconnect();
    document.documentElement.classList.remove('tilawat-play-only');
  },2000);
}

document.addEventListener('click',event=>{
  const target=event.target instanceof Element?event.target:null;
  if(!target)return;
  const action=target.closest('[data-play],[data-catalog-play]');
  if(!action)return;
  const explicitPlay=target.closest('.library-row__play,.art__play,.surah-card__play,.last-listened-card__play,.row-play');
  if(explicitPlay)armPlayOnly();
},true);

function setSuppressClick(){
  gesture.suppressClick=true;
  clearTimeout(gesture.suppressTimer);
  gesture.suppressTimer=setTimeout(()=>{gesture.suppressClick=false},360);
}

function resetMiniVisual(mini){
  mini.style.transition='transform .18s cubic-bezier(.2,.8,.2,1),opacity .18s ease';
  mini.style.transform='';
  mini.style.opacity='';
  setTimeout(()=>{if(!gesture.active)mini.style.transition=''},190);
}

function dismissMini(){
  const mini=$('#miniPlayer'),app=$('#app');
  if(!mini||mini.classList.contains('hidden'))return;
  const finish=()=>{
    mini.classList.add('hidden');
    app?.classList.remove('has-mini');
    mini.style.transform='';
    mini.style.opacity='';
    mini.style.transition='';
  };
  const animation=mini.animate?.([
    {transform:'translateY(0)',opacity:1},
    {transform:'translateY(calc(100% + 24px))',opacity:0}
  ],{duration:180,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
  if(animation?.finished)animation.finished.then(finish).catch(()=>finish());
  else finish();
}

function stepVisibleLibrary(direction){
  const rows=[...document.querySelectorAll('#libraryGrid .library-row')].filter(row=>!row.hidden);
  const current=rows.findIndex(row=>row.classList.contains('is-current'));
  if(rows.length>1&&current>=0){
    const index=(current+(direction>0?1:-1)+rows.length)%rows.length;
    const play=rows[index].querySelector('.library-row__play');
    (play||rows[index]).click();
    return true;
  }
  const fallback=$(direction>0?'#next':'#prev');
  if(!fallback)return false;
  fallback.click();
  return true;
}

function installMiniInteractions(){
  injectInteractionCss();
  const mini=$('#miniPlayer'),open=$('#miniOpen');
  if(!mini||!open)return;
  const isControl=target=>target instanceof Element&&!!target.closest('#miniPlay,#miniFav,#miniSeek');

  mini.addEventListener('click',event=>{
    if(!gesture.suppressClick)return;
    gesture.suppressClick=false;
    clearTimeout(gesture.suppressTimer);
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);

  mini.addEventListener('click',event=>{
    if(isControl(event.target))return;
    if(event.target instanceof Element&&event.target.closest('#miniOpen'))return;
    open.click();
  });

  mini.addEventListener('pointerdown',event=>{
    if(event.button!==undefined&&event.button!==0)return;
    if(isControl(event.target))return;
    gesture.active=true;
    gesture.pointerId=event.pointerId;
    gesture.startX=event.clientX;
    gesture.startY=event.clientY;
    gesture.dx=0;
    gesture.dy=0;
    gesture.moved=false;
    mini.setPointerCapture?.(event.pointerId);
  });

  mini.addEventListener('pointermove',event=>{
    if(!gesture.active||event.pointerId!==gesture.pointerId)return;
    gesture.dx=event.clientX-gesture.startX;
    gesture.dy=event.clientY-gesture.startY;
    if(!gesture.moved&&Math.hypot(gesture.dx,gesture.dy)>8)gesture.moved=true;
    if(!gesture.moved)return;
    event.preventDefault();
    mini.style.transition='none';
    const ax=Math.abs(gesture.dx),ay=Math.abs(gesture.dy);
    if(ay>ax&&gesture.dy>0){
      const y=Math.min(42,gesture.dy*.42);
      mini.style.transform=`translateY(${y}px)`;
      mini.style.opacity=String(Math.max(.72,1-gesture.dy/260));
    }else if(ax>=ay){
      const x=Math.max(-30,Math.min(30,gesture.dx*.22));
      mini.style.transform=`translateX(${x}px)`;
    }
  },{passive:false});

  mini.addEventListener('pointerup',event=>{
    if(!gesture.active||event.pointerId!==gesture.pointerId)return;
    const dx=gesture.dx,dy=gesture.dy,ax=Math.abs(dx),ay=Math.abs(dy);
    gesture.active=false;
    gesture.pointerId=null;
    if(dy>64&&ay>ax*.85){
      setSuppressClick();
      dismissMini();
      return;
    }
    resetMiniVisual(mini);
    if(ax>70&&ax>ay*1.12){
      setSuppressClick();
      const direction=dx>0?1:-1;
      if(stepVisibleLibrary(direction)){
        mini.animate?.([
          {transform:`translateX(${direction>0?'18px':'-18px'})`,opacity:.72},
          {transform:'translateX(0)',opacity:1}
        ],{duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
      }
    }
  });

  mini.addEventListener('pointercancel',event=>{
    if(!gesture.active||event.pointerId!==gesture.pointerId)return;
    gesture.active=false;
    gesture.pointerId=null;
    resetMiniVisual(mini);
  });
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installMiniInteractions,{once:true});
else installMiniInteractions();
