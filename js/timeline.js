import{getOne,getAll,putOne,fmtNumber,fmtBytes,fmtDate,fmtDateShort,plural,esc,bdi}from'./core.js';

const SPACING=220,PAD=420;

export function createTimeline({runProject,toast,render}){
  const view=document.querySelector('#timelineView'),canvas=document.querySelector('#timelineCanvas'),world=document.querySelector('#timelineWorld'),nodes=document.querySelector('#timelineNodes'),panel=document.querySelector('#versionPanel');
  let state={project:null,versions:[],selected:null,x:0,y:0,scale:1,dragging:false,px:0,py:0};
  const pointers=new Map();let pinch=null;
  const clamp=v=>Math.min(1.8,Math.max(.45,v));

  function transform(){world.style.transform=`translate(${state.x}px,${state.y}px) scale(${state.scale})`}
  /* The world used to be a flat 4200px whatever the history was, so a project
     with one version gave you 3800px of empty grid to pan into. */
  function worldWidth(){return Math.max(canvas.clientWidth||0,PAD*2+Math.max(0,state.versions.length-1)*SPACING)}

  function build(){
    nodes.innerHTML='';
    const width=worldWidth(),base=width-PAD;
    world.style.width=`${width}px`;
    const frag=document.createDocumentFragment();
    state.versions.forEach((v,i)=>{
      const n=document.createElement('button');
      n.type='button';
      n.className='timeline-node'+(v.id===state.project.adoptedVersionId?' is-adopted':'');
      n.dataset.versionId=v.id;
      n.style.left=`${base-i*SPACING}px`;
      n.setAttribute('aria-label',`${i===0?'أول نسخة':'النسخة '+fmtNumber(v.index)} — ${fmtDateShort(v.createdAt)}`);
      n.innerHTML=`<span class="timeline-node__version">${i===0?'أول نسخة':`نسخة ${fmtNumber(v.index)}`}</span><span class="timeline-node__label"><bdi>${esc(fmtDateShort(v.createdAt))}</bdi></span>`;
      n.onclick=e=>{e.stopPropagation();select(v.id)};
      frag.appendChild(n);
    });
    nodes.appendChild(frag);
  }

  function select(id){
    const v=state.versions.find(x=>x.id===id);
    if(!v)return;
    state.selected=v;
    for(const n of document.querySelectorAll('.timeline-node'))n.classList.toggle('is-selected',n.dataset.versionId===id);
    const p=state.project,d=v.diff||{},stats=v.stats||{files:0,size:0,lines:0};
    panel.hidden=false;
    panel.innerHTML=`<p class="eyebrow">${v.id===p.adoptedVersionId?'النسخة المعتمدة':'نسخة محفوظة'}</p><h3>${esc(v.title||p.title)} · ${v.index===1?'أول نسخة':`النسخة ${fmtNumber(v.index)}`}</h3><p>${bdi(fmtDate(v.createdAt))}</p><div class="version-panel__stats"><div><strong>${fmtNumber(stats.files)}</strong><span>${plural(stats.files,'ملف','ملفان','ملفات','ملفًا')}</span></div><div><strong>${bdi(fmtBytes(stats.size))}</strong><span>الحجم</span></div><div><strong>${fmtNumber(stats.lines)}</strong><span>سطر</span></div></div><p>${v.index===1?'هذه نقطة البداية للمشروع.':`${fmtNumber(d.added||0)} أضيف · ${fmtNumber(d.removed||0)} حُذف · ${fmtNumber(d.changed||0)} تغيّر`}</p><div class="version-panel__actions"><button class="button run-version" type="button">تشغيل</button><button class="button button--outline adopt-version" type="button" ${v.id===p.adoptedVersionId?'disabled':''}>${v.id===p.adoptedVersionId?'معتمدة':'اعتماد'}</button></div>`;
    panel.querySelector('.run-version').onclick=()=>runProject(p.id,v.id);
    panel.querySelector('.adopt-version').onclick=async()=>{
      p.adoptedVersionId=v.id;p.updatedAt=Date.now();
      if(v.title)p.title=v.title;
      p.thumbnailHash=v.thumbnailHash||'';p.thumbSize=v.thumbSize||null;
      await putOne('projects',p);
      state.project=p;build();select(v.id);toast('تم اعتماد النسخة');render();
    };
  }

  async function show(projectId){
    const p=await getOne('projects',projectId);
    const versions=(await getAll('versions','projectId',projectId)).sort((a,b)=>a.index-b.index);
    if(!p||!versions.length){toast('لا توجد نسخ محفوظة لهذا المشروع');return}
    state={project:p,versions,selected:versions.at(-1),x:0,y:0,scale:1,dragging:false,px:0,py:0};
    document.querySelector('#timelineTitle').textContent=p.title;
    view.hidden=false;document.body.style.overflow='hidden';
    build();select(state.selected.id);
    requestAnimationFrame(()=>{
      /* Centre on the newest version — it sits at PAD from the leading edge. */
      state.x=(canvas.clientWidth/2)-PAD;state.y=0;transform();
      document.querySelector('#closeTimeline')?.focus();
    });
  }
  function close(){view.hidden=true;document.body.style.overflow='';pointers.clear();pinch=null;state.dragging=false;canvas.classList.remove('is-dragging')}

  document.querySelector('#closeTimeline').onclick=close;
  document.querySelector('#timelineZoomIn').onclick=()=>{state.scale=clamp(state.scale+.1);transform()};
  document.querySelector('#timelineZoomOut').onclick=()=>{state.scale=clamp(state.scale-.1);transform()};

  canvas.addEventListener('pointerdown',e=>{
    if(e.target.closest('.timeline-node')||e.target.closest('.version-panel'))return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){state.dragging=true;state.px=e.clientX-state.x;state.py=e.clientY-state.y;canvas.classList.add('is-dragging')}
    if(pointers.size===2){const[a,b]=[...pointers.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;pinch={distance:Math.hypot(a.x-b.x,a.y-b.y)||1,scale:state.scale,worldX:(cx-state.x)/state.scale,worldY:(cy-state.y)/state.scale};state.dragging=false}
  });
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2&&pinch){const[a,b]=[...pointers.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,dist=Math.hypot(a.x-b.x,a.y-b.y)||1;state.scale=clamp(pinch.scale*(dist/pinch.distance));state.x=cx-pinch.worldX*state.scale;state.y=cy-pinch.worldY*state.scale;transform();return}
    if(state.dragging){state.x=e.clientX-state.px;state.y=e.clientY-state.py;transform()}
  });
  function end(e){
    pointers.delete(e.pointerId);pinch=null;
    if(pointers.size===1){const a=[...pointers.values()][0];state.dragging=true;state.px=a.x-state.x;state.py=a.y-state.y}
    else if(!pointers.size){state.dragging=false;canvas.classList.remove('is-dragging')}
  }
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  canvas.addEventListener('wheel',e=>{
    e.preventDefault();
    if(e.ctrlKey||e.metaKey){const r=canvas.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top,wx=(cx-state.x)/state.scale,wy=(cy-state.y)/state.scale;state.scale=clamp(state.scale*(e.deltaY>0?.92:1.08));state.x=cx-wx*state.scale;state.y=cy-wy*state.scale}
    else state.x-=e.deltaY*.8+e.deltaX;
    transform();
  },{passive:false});
  /* Keep the world sized to the viewport when the window changes under it. */
  addEventListener('resize',()=>{if(!view.hidden){world.style.width=`${worldWidth()}px`}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!view.hidden)close()});
  return{show,close};
}
