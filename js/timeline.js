import{getOne,getAll,putOne,fmtNumber,fmtBytes,plural,esc,bdi,deleteVersions,keepOnlyVersion,deleteImpact}from'./core.js';

/* Same locale contract as core.js: Arabic wording, Gregorian calendar, Latin
   digits. A second numeral system in the same column is unreadable. */
const LOCALE='ar-u-ca-gregory-nu-latn';
const TIME=new Intl.DateTimeFormat(LOCALE,{hour:'numeric',minute:'2-digit'});
const DAY=new Intl.DateTimeFormat(LOCALE,{weekday:'long',day:'numeric',month:'long'});
const DAY_YEAR=new Intl.DateTimeFormat(LOCALE,{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const DAY_TITLE=new Intl.DateTimeFormat(LOCALE,{dateStyle:'medium',timeStyle:'short'});
const DAY_KEY=ts=>{const d=new Date(ts);return`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`};

function dayLabel(ts){
  const now=new Date(),d=new Date(ts);
  if(DAY_KEY(ts)===DAY_KEY(now))return'اليوم';
  if(DAY_KEY(ts)===DAY_KEY(now.getTime()-864e5))return'أمس';
  return(d.getFullYear()===now.getFullYear()?DAY:DAY_YEAR).format(d);
}
/* How long the project sat still before this version. Elapsed time is real
   information; the old canvas spaced every version 220px apart and told you
   nothing. */
function gapText(ms){
  const m=Math.round(ms/6e4);
  if(m<60)return m<2?'بعد دقيقة من السابقة':`بعد ${fmtNumber(m)} ${plural(m,'دقيقة','دقيقتين','دقائق','دقيقة')} من السابقة`;
  const h=Math.round(ms/36e5);
  if(h<24)return h===1?'بعد ساعة من السابقة':`بعد ${fmtNumber(h)} ${plural(h,'ساعة','ساعتين','ساعات','ساعة')} من السابقة`;
  const d=Math.round(ms/864e5);
  if(d<30)return d===1?'بعد يوم من السابقة':`بعد ${fmtNumber(d)} ${plural(d,'يوم','يومين','أيام','يومًا')} من السابقة`;
  const mo=Math.round(ms/2592e6);
  return mo===1?'بعد شهر من السابقة':`بعد ${fmtNumber(mo)} ${plural(mo,'شهر','شهرين','أشهر','شهرًا')} من السابقة`;
}
function deltaText(v){
  if(v.index===1)return'نقطة البداية';
  const d=v.diff||{},parts=[];
  if(d.added)parts.push(`${fmtNumber(d.added)} ${plural(d.added,'ملف مضاف','ملفان مضافان','ملفات مضافة','ملفًا مضافًا')}`);
  if(d.removed)parts.push(`${fmtNumber(d.removed)} ${plural(d.removed,'ملف محذوف','ملفان محذوفان','ملفات محذوفة','ملفًا محذوفًا')}`);
  if(d.changed)parts.push(`${fmtNumber(d.changed)} ${plural(d.changed,'ملف معدَّل','ملفان معدَّلان','ملفات معدَّلة','ملفًا معدَّلًا')}`);
  return parts.length?parts.join('، '):'لم تتغيّر أي ملفات';
}
const weight=v=>{const d=v.diff||{};return(d.added||0)+(d.removed||0)+(d.changed||0)};
function barMarkup(v,total){
  const d=v.diff||{},sum=weight(v);
  if(!sum)return'';
  const seg=(kind,n)=>n?`<i data-kind="${kind}" style="flex:${n}"></i>`:'';
  return`<span class="entry__bar" style="opacity:${(0.45+0.55*(total?sum/total:1)).toFixed(2)}" aria-hidden="true">${seg('added',d.added)}${seg('removed',d.removed)}${seg('changed',d.changed)}</span>`;
}

export function createTimeline({runProject,toast,render,confirm}){
  /* Version covers get their own object-URL cache: the home screen's sweeper
     only keeps hashes that belong to a project, so sharing its cache would have
     revoked a cover out from under an open row on the next render. */
  const shots=new Map();
  async function shotURL(hash){
    if(!hash)return'';
    if(shots.has(hash))return shots.get(hash);
    const obj=await getOne('objects',hash);
    if(!obj)return'';
    const u=URL.createObjectURL(obj.blob);shots.set(hash,u);return u;
  }
  function releaseShots(){for(const u of shots.values())URL.revokeObjectURL(u);shots.clear()}
  const view=document.querySelector('#timelineView'),scroller=document.querySelector('#timelineScroll'),list=document.querySelector('#historyList');
  const overview=document.querySelector('#overview'),track=document.querySelector('#overviewTrack'),thenLabel=document.querySelector('#overviewThen');
  let state={project:null,versions:[],openId:null};

  function build(){
    const p=state.project,newestFirst=[...state.versions].sort((a,b)=>b.index-a.index);
    const total=Math.max(1,...newestFirst.map(weight));
    document.querySelector('#timelineTitle').textContent=p.title;
    const n=newestFirst.length;
    document.querySelector('#timelineCount').textContent=`${fmtNumber(n)} ${plural(n,'نسخة محفوظة','نسختان محفوظتان','نسخ محفوظة','نسخة محفوظة')}`;
    list.innerHTML='';
    const frag=document.createDocumentFragment();
    let day='';
    newestFirst.forEach(v=>{
      const key=DAY_KEY(v.createdAt);
      if(key!==day){
        day=key;
        const h=document.createElement('li');
        h.className='history__day';h.setAttribute('role','presentation');
        h.innerHTML=`<bdi>${esc(dayLabel(v.createdAt))}</bdi>`;
        frag.appendChild(h);
      }
      const li=document.createElement('li');
      li.className='entry';
      li.dataset.versionId=v.id;
      if(v.id===p.adoptedVersionId)li.dataset.adopted='';
      const mag=total?weight(v)/total:0;
      const name=v.index===1?'أول نسخة':`النسخة ${fmtNumber(v.index)}`;
      li.innerHTML=`<span class="entry__node" style="--mag:${mag.toFixed(3)}" aria-hidden="true"></span>`
        +`<button class="entry__head" type="button" aria-expanded="false">`
        +`<span class="entry__name"><em>${esc(name)}</em>${v.id===p.adoptedVersionId?'<span class="entry__chip">معتمدة</span>':''}</span>`
        +`<span class="entry__time"><bdi>${esc(TIME.format(new Date(v.createdAt)))}</bdi></span>`
        +`<span class="entry__change">${barMarkup(v,total)}<span class="entry__delta">${esc(deltaText(v))}</span></span>`
        +`</button>`
        +`<div class="entry__detail"><div><div class="entry__body"></div></div></div>`;
      li.querySelector('.entry__head').addEventListener('click',()=>toggle(v.id));
      frag.appendChild(li);
    });
    list.appendChild(frag);
    buildOverview(newestFirst,total);
  }


  /* Dots are placed by elapsed time, not by index: two versions minutes apart
     sit on top of each other and a month of silence is a month of empty rail.
     A floor of 13px keeps a busy afternoon from collapsing into one blob. */
  function buildOverview(newestFirst,total){
    if(!overview)return;
    track.innerHTML='';
    if(newestFirst.length<2){overview.hidden=true;return}
    overview.hidden=false;
    const newest=newestFirst[0].createdAt,oldest=newestFirst.at(-1).createdAt,span=Math.max(1,newest-oldest);
    const width=track.clientWidth||600,usable=Math.max(1,width-24),MIN=13;
    let last=-Infinity;
    const frag=document.createDocumentFragment();
    newestFirst.forEach(v=>{
      let x=12+((newest-v.createdAt)/span)*usable;
      if(x-last<MIN)x=last+MIN;
      last=x;
      const d=document.createElement('button');
      d.type='button';d.className='overview__dot';d.tabIndex=-1;
      d.dataset.versionId=v.id;
      if(v.id===state.project.adoptedVersionId)d.dataset.adopted='';
      d.style.setProperty('--mag',(total?weight(v)/total:0).toFixed(3));
      d.style.insetInlineStart=`${Math.min(x,width-4)}px`;
      const name=v.index===1?'أول نسخة':`النسخة ${fmtNumber(v.index)}`;
      d.title=`${name} · ${DAY_TITLE.format(new Date(v.createdAt))}`;
      d.onclick=()=>open(v.id);
      frag.appendChild(d);
    });
    track.appendChild(frag);
    thenLabel.textContent=dayLabel(oldest);
  }
  function markCurrent(id){
    for(const d of track.querySelectorAll('.overview__dot'))d.classList.toggle('is-current',d.dataset.versionId===id);
  }
  function factsMarkup(v){
    const s=v.stats||{files:0,size:0,lines:0},prev=state.versions.find(x=>x.index===v.index-1);
    const facts=[`<span><b>${fmtNumber(s.files)}</b> ${plural(s.files,'ملف','ملفان','ملفات','ملفًا')}</span>`,
      `<span><b>${bdi(fmtBytes(s.size))}</b></span>`,
      `<span><b>${fmtNumber(s.lines)}</b> ${plural(s.lines,'سطر','سطران','أسطر','سطرًا')}</span>`];
    return`<p class="entry__facts">${facts.join('')}</p>`
      +(prev?`<p class="entry__gap">${esc(gapText(v.createdAt-prev.createdAt))}</p>`:'');
  }

  async function fill(li,v){
    const body=li.querySelector('.entry__body');
    if(body.dataset.ready)return;
    body.dataset.ready='1';
    const p=state.project,adopted=v.id===p.adoptedVersionId;
    const url=await shotURL(v.thumbnailHash);
    const size=v.thumbSize,small=!!size&&(size.vector||size.w<320||size.h<200);
    body.innerHTML=(url?`<div class="entry__shot"><img src="${esc(url)}" data-fit="${small?'contain':'cover'}" alt="" loading="lazy"></div>`:'')
      +factsMarkup(v)
      +`<div class="entry__actions"><button class="button run-version" type="button">تشغيل هذه النسخة</button>`
      +`<button class="button button--outline adopt-version" type="button"${adopted?' disabled':''}>${adopted?'هي المعتمدة':'اعتمدها'}</button></div>`
      +(state.versions.length>1?`<div class="entry__danger"><button type="button" class="drop-version">احذف هذه النسخة</button><button type="button" class="keep-only">احذف ما عداها (${fmtNumber(state.versions.length-1)})</button></div>`:'');
    body.querySelector('.run-version').onclick=()=>runProject(p.id,v.id);
    body.querySelector('.drop-version')?.addEventListener('click',()=>removeVersion(v));
    body.querySelector('.keep-only')?.addEventListener('click',()=>keepOnly(v));
    body.querySelector('.adopt-version').onclick=async()=>{
      p.adoptedVersionId=v.id;p.updatedAt=Date.now();
      if(v.title)p.title=v.title;
      p.thumbnailHash=v.thumbnailHash||'';p.thumbSize=v.thumbSize||null;
      await putOne('projects',p);
      state.project=p;state.openId=v.id;build();open(v.id,{scroll:false});
      toast('تم اعتماد النسخة');render();
    };
  }

  function open(id,{scroll=true}={}){
    const li=list.querySelector(`.entry[data-version-id="${CSS.escape(id)}"]`),v=state.versions.find(x=>x.id===id);
    if(!li||!v)return;
    for(const other of list.querySelectorAll('.entry.is-open')){
      if(other===li)continue;
      other.classList.remove('is-open');
      other.querySelector('.entry__head').setAttribute('aria-expanded','false');
    }
    state.openId=id;
    li.classList.add('is-open');
    markCurrent(id);
    li.querySelector('.entry__head').setAttribute('aria-expanded','true');
    fill(li,v);
    if(scroll)requestAnimationFrame(()=>li.scrollIntoView({block:'nearest',behavior:'smooth'}));
  }
  function toggle(id){
    const li=list.querySelector(`.entry[data-version-id="${CSS.escape(id)}"]`);
    if(li&&li.classList.contains('is-open')){
      li.classList.remove('is-open');
      li.querySelector('.entry__head').setAttribute('aria-expanded','false');
      state.openId=null;return;
    }
    open(id);
  }

  async function reload(){
    const p=await getOne('projects',state.project.id);
    const versions=(await getAll('versions','projectId',state.project.id)).sort((a,b)=>a.index-b.index);
    if(!p||!versions.length){close();render();return}
    state.project=p;state.versions=versions;
    build();
    open(versions.find(v=>v.id===p.adoptedVersionId)?.id||versions.at(-1).id,{scroll:false});
    render();
  }

  async function removeVersion(v){
    const p=state.project;
    if(state.versions.length<2){toast('هذه آخر نسخة. احذف المشروع نفسه من بطاقته');return}
    const impact=await deleteImpact(p.id,state.versions.filter(x=>x.id!==v.id).map(x=>x.id));
    const adopted=v.id===p.adoptedVersionId;
    const choice=await confirm({
      title:`حذف النسخة ${fmtNumber(v.index)}؟`,
      lede:adopted
        ?'هذه هي النسخة المعتمدة. بحذفها تُعتمد أحدث نسخة باقية تلقائيًا. الملفات التي تشترك فيها نسخ أخرى تبقى كما هي.'
        :'تُحذف هذه النسخة وحدها. الملفات التي تشترك فيها نسخ أخرى تبقى كما هي.',
      cost:[['الملفات التي ستُحذف',fmtNumber(impact.files)],['المساحة المستعادة',fmtBytes(impact.bytes)]],
      okLabel:'احذف النسخة'});
    if(choice!=='ok')return;
    await deleteVersions([v.id]);
    const remaining=state.versions.filter(x=>x.id!==v.id);
    const project=await getOne('projects',p.id);
    if(project){
      project.versionCount=remaining.length;
      if(adopted){const newest=remaining.at(-1);project.adoptedVersionId=newest.id;project.thumbnailHash=newest.thumbnailHash||'';project.thumbSize=newest.thumbSize||null;if(newest.title)project.title=newest.title}
      await putOne('projects',project);
    }
    toast('حُذفت النسخة');
    await reload();
  }

  async function keepOnly(v){
    const p=state.project;
    if(state.versions.length<2)return;
    const impact=await deleteImpact(p.id,[v.id]);
    const choice=await confirm({
      title:`الإبقاء على النسخة ${fmtNumber(v.index)} وحدها؟`,
      lede:`تُحذف كل النسخ الأخرى ويبقى تاريخ المشروع نسخةً واحدة، وتصير هي المعتمدة.`,
      cost:[['النسخ التي ستُحذف',fmtNumber(impact.versions)],['الملفات',fmtNumber(impact.files)],['المساحة المستعادة',fmtBytes(impact.bytes)]],
      okLabel:'احذف ما عداها'});
    if(choice!=='ok')return;
    await keepOnlyVersion(p.id,v.id);
    toast('بقيت نسخة واحدة');
    await reload();
  }

  async function show(projectId){
    const p=await getOne('projects',projectId);
    const versions=(await getAll('versions','projectId',projectId)).sort((a,b)=>a.index-b.index);
    if(!p||!versions.length){toast('لا توجد نسخ محفوظة لهذا المشروع');return}
    state={project:p,versions,openId:null};
    build();
    view.hidden=false;document.body.style.overflow='hidden';
    /* The strip is laid out in pixels, and a hidden view measures zero — so the
       map has to be drawn once the view is actually on screen. */
    buildOverview([...versions].sort((a,b)=>b.index-a.index),Math.max(1,...versions.map(weight)));
    scroller.scrollTop=0;
    open(versions.find(v=>v.id===p.adoptedVersionId)?.id||versions.at(-1).id,{scroll:false});
    requestAnimationFrame(()=>document.querySelector('#closeTimeline')?.focus());
  }
  function close(){view.hidden=true;document.body.style.overflow='';releaseShots()}

  document.querySelector('#closeTimeline').onclick=close;
  let resizeTimer=null;
  addEventListener('resize',()=>{
    if(view.hidden||!state.project)return;
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      const newestFirst=[...state.versions].sort((a,b)=>b.index-a.index);
      buildOverview(newestFirst,Math.max(1,...newestFirst.map(weight)));
      if(state.openId)markCurrent(state.openId);
    },140);
  });

  /* Up and down walk the record; the row itself is a button, so Enter and Space
     already open it. */
  list.addEventListener('keydown',e=>{
    if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
    const heads=[...list.querySelectorAll('.entry__head')],i=heads.indexOf(document.activeElement);
    if(i<0)return;
    const next=heads[i+(e.key==='ArrowDown'?1:-1)];
    if(next){e.preventDefault();next.focus()}
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!view.hidden)close()});
  return{show,close};
}
