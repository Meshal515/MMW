import{getAll,getOne,logsFor,storageSnapshot,requestPersistentStorage,fmtBytes,fmtNumber,fmtDate,since,plural,esc,bdi,safeThemeGet,safeThemeSet}from'./core.js';
import{unzip,fromFileList,persistVersion}from'./importer.js';
import{createTimeline}from'./timeline.js';

const $=s=>document.querySelector(s),main=$('#main'),importDialog=$('#importDialog'),importProgress=$('#importProgress'),progressText=$('#progressText'),headerAdd=$('#headerAdd'),infoDialog=$('#infoDialog');
let importTargetProjectId=null,importing=false;
const objectUrlCache=new Map();
let renderToken=0,menuCloser=null;

function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('is-visible');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('is-visible'),2200)}

async function objectURL(hash){if(!hash)return'';if(objectUrlCache.has(hash))return objectUrlCache.get(hash);const obj=await getOne('objects',hash);if(!obj)return'';const u=URL.createObjectURL(obj.blob);objectUrlCache.set(hash,u);return u}
/* Every createObjectURL pins its blob in memory until it is revoked. Covers that
   no longer belong to any project were being kept alive for the whole session. */
function releaseUnusedURLs(keep){for(const[hash,url]of objectUrlCache)if(!keep.has(hash)){URL.revokeObjectURL(url);objectUrlCache.delete(hash)}}

async function runProject(projectId,versionId){if(!versionId){toast('لا توجد نسخة معتمدة لهذا المشروع');return}if('serviceWorker'in navigator){try{await navigator.serviceWorker.ready}catch{}}location.href=`./runner.html?project=${encodeURIComponent(projectId)}&version=${encodeURIComponent(versionId)}`}
const timeline=createTimeline({runProject,toast,render});

function coverMarkup(url,size){
  /* A 16x16 favicon stretched across a 16:10 frame was the single ugliest thing
     on the home screen. Anything under 320px wide gets letterboxed instead. */
  if(!url)return`<div class="project-cover__fallback"><img src="./assets/logo.svg" alt=""></div>`;
  /* A vector is almost always a logo here, never a screenshot: letterbox it.
     A raster is judged on whether it has the pixels to fill a 16:10 frame. */
  const small=!!size&&(size.vector||size.w<320||size.h<200);
  return`<img class="project-cover__img" data-fit="${small?'contain':'cover'}" src="${esc(url)}" alt="" loading="lazy">`;
}

async function render(){
  const token=++renderToken;
  const projects=(await getAll('projects')).sort((a,b)=>b.updatedAt-a.updatedAt);
  if(token!==renderToken)return; // a newer render started while we were reading
  headerAdd.hidden=projects.length===0;
  if(!projects.length){
    releaseUnusedURLs(new Set());
    main.innerHTML=`<section class="hero-empty"><div class="hero-empty__inner"><img class="hero-empty__logo" src="./assets/logo.svg" alt=""><h1>مشاريعك، محليًا.</h1><p>أضف مشروع ويب مرة واحدة، شغّله مباشرة، ثم حدّثه كلما وصلت لنسخة جديدة. كل نسخة تبقى في خطك الزمني.</p><button class="button button--accent" id="firstAdd"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>أضف أول مشروع</button></div></section>`;
    $('#firstAdd').onclick=()=>openImport();
    return;
  }
  const covers=new Map();
  for(const p of projects)covers.set(p.id,await objectURL(p.thumbnailHash));
  if(token!==renderToken)return;
  releaseUnusedURLs(new Set(projects.map(p=>p.thumbnailHash).filter(Boolean)));
  const n=projects.length;
  main.innerHTML=`<section class="section-head"><div><h1>مشاريعك</h1><p>${fmtNumber(n)} ${plural(n,'مشروع','مشروعان','مشاريع','مشروعًا')} محفوظة على هذا الجهاز.</p></div></section><section class="projects-grid" id="projectsGrid"></section>`;
  const grid=$('#projectsGrid'),frag=document.createDocumentFragment();
  for(const p of projects){
    const vc=p.versionCount||1,card=document.createElement('article');
    card.className='project-card';
    card.innerHTML=`<div class="project-cover">${coverMarkup(covers.get(p.id),p.thumbSize)}</div><div class="project-card__body"><div class="project-card__head"><div class="project-card__id"><h2>${esc(p.title)}</h2><div class="project-meta"><span>${fmtNumber(vc)} ${plural(vc,'نسخة','نسختان','نسخ','نسخة')}</span><span aria-hidden="true">·</span><span>آخر تحديث ${esc(since(p.updatedAt))}</span></div></div><button class="kebab" type="button" aria-label="خيارات ${esc(p.title)}" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg></button></div><div class="project-actions"><button class="button enter" type="button">دخول</button><button class="button button--outline update" type="button">تحديث</button></div></div>`;
    card.querySelector('.enter').onclick=()=>runProject(p.id,p.adoptedVersionId);
    card.querySelector('.update').onclick=()=>openImport(p.id,p.title);
    card.querySelector('.kebab').onclick=e=>{e.stopPropagation();toggleMenu(card,p)};
    frag.appendChild(card);
  }
  grid.appendChild(frag);
}

function closeMenu(){if(menuCloser){menuCloser();menuCloser=null}}
function toggleMenu(card,p){
  const kebab=card.querySelector('.kebab'),wasOpen=card.contains(document.querySelector('.popover'));
  closeMenu();
  if(wasOpen)return; // second click on the same kebab closes it
  const m=document.createElement('div');
  m.className='popover';m.setAttribute('role','menu');
  m.innerHTML=`<button role="menuitem" type="button" data-act="info"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>كل المعلومات</button><button role="menuitem" type="button" data-act="timeline"><svg viewBox="0 0 24 24"><path d="M4 12h16M7 8v8m5-10v12m5-8v4"/></svg>الخط الزمني</button>`;
  const onDown=e=>{if(!m.contains(e.target)&&!kebab.contains(e.target))closeMenu()};
  const onKey=e=>{if(e.key==='Escape'){closeMenu();kebab.focus()}};
  /* The old code registered this listener per menu and only ever removed it from
     inside itself, so opening a second menu orphaned the first one forever. */
  menuCloser=()=>{document.removeEventListener('pointerdown',onDown);document.removeEventListener('keydown',onKey);m.remove();kebab.setAttribute('aria-expanded','false')};
  m.onclick=e=>{const b=e.target.closest('button');if(!b)return;const act=b.dataset.act;closeMenu();act==='info'?showInfo(p.id):timeline.show(p.id)};
  card.appendChild(m);kebab.setAttribute('aria-expanded','true');
  setTimeout(()=>{document.addEventListener('pointerdown',onDown);document.addEventListener('keydown',onKey)},0);
}

function openImport(projectId=null,title=''){requestPersistentStorage();importTargetProjectId=projectId;$('#importEyebrow').textContent=projectId?'تحديث جديد':'مشروع جديد';$('#importTitle').textContent=projectId?`تحديث ${title}`:'أضف مشروعك';importProgress.hidden=true;importDialog.showModal()}

async function handleImport(kind,list){
  if(importing)return;
  importing=true;importProgress.hidden=false;progressText.textContent='أجهز المشروع…';
  document.querySelectorAll('.import-choice').forEach(b=>b.disabled=true);
  try{
    let files=kind==='zip'?await unzip(list[0]):await fromFileList(list);
    if(kind==='file')files=files.map(f=>({...f,path:'index.html'}));
    const name=kind==='zip'?list[0].name:(list[0].webkitRelativePath?.split('/')[0]||list[0].name);
    const updating=!!importTargetProjectId;
    await persistVersion(files,importTargetProjectId,name,t=>progressText.textContent=t);
    importDialog.close();
    toast(updating?'تمت إضافة نسخة جديدة واعتمادها':'تمت إضافة المشروع');
    await render();
  }catch(err){
    console.error(err);
    progressText.textContent=err.message||'تعذر استيراد المشروع';
    toast('تعذر استيراد المشروع');
  }finally{
    importing=false;importTargetProjectId=null;
    document.querySelectorAll('.import-choice').forEach(b=>b.disabled=false);
    /* Clearing only on success meant picking the same file again after a failure
       fired no change event at all — the retry looked like a dead button. */
    for(const i of[$('#zipInput'),$('#folderInput'),$('#singleInput')])i.value='';
  }
}

async function showInfo(projectId){
  const p=await getOne('projects',projectId);
  if(!p){toast('تعذر العثور على المشروع');return}
  const v=await getOne('versions',p.adoptedVersionId);
  if(!v){toast('النسخة المعتمدة مفقودة — افتح الخط الزمني واعتمد نسخة أخرى');return}
  const stats=v.stats||{files:0,size:0,lines:0,chars:0,types:{}};
  const logs=await logsFor(v.id).catch(()=>[]),storage=await storageSnapshot();
  $('#infoTitle').textContent=p.title;
  const types=Object.entries(stats.types||{}).sort((a,b)=>b[1]-a[1]).slice(0,16);
  const errors=logs.filter(x=>x.level==='error').length;
  const vc=p.versionCount||1;
  $('#infoBody').innerHTML=`<div class="stats-grid"><div class="stat-card"><strong>${fmtNumber(stats.files)}</strong><span>${plural(stats.files,'ملف','ملفان','ملفات','ملفًا')}</span></div><div class="stat-card"><strong>${bdi(fmtBytes(stats.size))}</strong><span>الحجم</span></div><div class="stat-card"><strong>${fmtNumber(stats.lines)}</strong><span>سطر كود/نص</span></div><div class="stat-card"><strong>${fmtNumber(stats.chars)}</strong><span>حرف</span></div></div><section class="info-section"><div class="info-section__head"><h3>النسخة المعتمدة</h3><span class="chip">النسخة ${fmtNumber(v.index)}</span></div><div class="file-types">${types.map(([k,n])=>`<span class="chip">${bdi(k.toUpperCase())} · ${fmtNumber(n)}</span>`).join('')}</div></section><section class="info-section"><div class="info-section__head"><h3>التشخيص والكونسول</h3><span class="chip">${fmtNumber(errors)} ${plural(errors,'خطأ','خطآن','أخطاء','خطأ')}</span></div>${logs.length?`<div class="console">${logs.map(l=>`<div class="console-row" data-level="${esc(l.level)}"><span>${esc(new Date(l.ts).toLocaleTimeString('en-GB',{hour12:false}))}</span><b>${esc(l.level)}</b><span>${esc((l.args||[]).join(' '))}</span></div>`).join('')}</div>`:`<div class="console-empty">شغّل المشروع مرة واحدة، وبعدها ستظهر رسائل الكونسول والأخطاء هنا.</div>`}</section><section class="info-section"><div class="info-section__head"><h3>تفاصيل</h3></div><div class="file-types"><span class="chip">نقطة الدخول ${bdi(v.entry)}</span><span class="chip">أضيف ${bdi(fmtDate(v.createdAt))}</span><span class="chip">${fmtNumber(vc)} ${plural(vc,'نسخة','نسختان','نسخ','نسخة')}</span><span class="chip">التخزين ${storage.persisted?'دائم':'قياسي'}</span>${storage.quota?`<span class="chip">${bdi(fmtBytes(storage.usage)+' / '+fmtBytes(storage.quota))}</span>`:''}</div></section>`;
  infoDialog.showModal();
}

headerAdd.onclick=()=>openImport();
$('#importForm').addEventListener('submit',()=>{importTargetProjectId=null});
for(const b of document.querySelectorAll('[data-import]'))b.onclick=()=>({zip:$('#zipInput'),folder:$('#folderInput'),file:$('#singleInput')})[b.dataset.import].click();
$('#zipInput').onchange=e=>e.target.files[0]&&handleImport('zip',e.target.files);
$('#folderInput').onchange=e=>e.target.files.length&&handleImport('folder',e.target.files);
$('#singleInput').onchange=e=>e.target.files[0]&&handleImport('file',e.target.files);
const drop=$('#dropZone');
for(const t of['dragenter','dragover'])drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('is-over')});
for(const t of['dragleave','drop'])drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('is-over')});
drop.addEventListener('drop',e=>{const f=[...e.dataTransfer.files];if(!f.length)return;const single=f.length===1&&f[0].name.toLowerCase().endsWith('.zip');handleImport(single?'zip':'folder',f)});
$('#closeInfo').onclick=()=>infoDialog.close();
window.addEventListener('pagehide',()=>{for(const url of objectUrlCache.values())URL.revokeObjectURL(url)});

const themeMeta=document.querySelector('meta[name="theme-color"]');
$('#themeToggle').onclick=()=>{const n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;safeThemeSet(n);themeMeta.content=n==='dark'?'#171C1C':'#F4F3EF';$('#themeToggle').setAttribute('aria-pressed',String(n==='dark'))};
$('#themeToggle').setAttribute('aria-pressed',String((safeThemeGet()||'light')==='dark'));
requestPersistentStorage();
if('serviceWorker'in navigator){try{await navigator.serviceWorker.register('./sw.js',{scope:'./'})}catch(e){console.warn('SW',e)}}
await render();
