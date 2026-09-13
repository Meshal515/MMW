import{getAll,getOne,logsFor,storageSnapshot,requestPersistentStorage,fmtBytes,fmtNumber,fmtDate,since,plural,esc,bdi,safeThemeGet,safeThemeSet,deleteProject,deleteImpact,projectStorageFootprint,purgeProjectStorage,legacyToolDatabases}from'./core.js';
import{unzip,fromFileList,persistVersion}from'./importer.js';
import{exportLibrary,importLibrary,legacyStorage,adoptLegacy}from'./archive.js';
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
const timeline=createTimeline({runProject,toast,render,confirm:confirmAction});

function coverPlate(size){
  if(!size||typeof size.lum!=='number')return'';
  const small=size.vector||size.w<320||size.h<200;
  if(!small)return'';
  return size.lum<0.42?'light':size.lum>0.62?'dark':'';
}
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
    card.innerHTML=`<div class="project-cover" data-plate="${coverPlate(p.thumbSize)}">${coverMarkup(covers.get(p.id),p.thumbSize)}</div><div class="project-card__body"><div class="project-card__head"><div class="project-card__id"><h2>${esc(p.title)}</h2><div class="project-meta"><span>${fmtNumber(vc)} ${plural(vc,'نسخة','نسختان','نسخ','نسخة')}</span><span aria-hidden="true">·</span><span>آخر تحديث ${esc(since(p.updatedAt))}</span></div></div><div class="kebab-wrap"><button class="kebab" type="button" aria-label="خيارات ${esc(p.title)}" aria-haspopup="menu" aria-expanded="false"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/></svg></button></div></div><div class="project-actions"><button class="button enter" type="button">دخول</button><button class="button button--outline update" type="button">تحديث</button></div></div>`;
    card.querySelector('.enter').onclick=()=>runProject(p.id,p.adoptedVersionId);
    card.querySelector('.update').onclick=()=>openImport(p.id,p.title);
    card.querySelector('.kebab').onclick=e=>{e.stopPropagation();toggleMenu(card,p)};
    frag.appendChild(card);
  }
  grid.appendChild(frag);
}


/* Deleting is the one thing here that cannot be undone, so the dialog names what
   goes: how many versions, how many files, how much disk comes back. Shared
   files that other versions still use are not counted — they are not freed. */
const confirmDialog=$('#confirmDialog');
/* Returns the chosen value — 'ok', 'alt' or 'cancel' — because this dialog also
   asks questions that are not yes/no, such as "new project or new version?". */
function confirmAction({title,lede,cost=[],okLabel='حذف',altLabel='',tone='danger'}){
  $('#confirmTitle').textContent=title;
  $('#confirmLede').textContent=lede;
  /* Values are Latin (685 B, 12 KB) inside Arabic rows — isolate or the bidi
     algorithm moves the unit to the front and prints "B 685". */
  $('#confirmCost').innerHTML=cost.map(([k,v])=>`<div><span>${esc(k)}</span><b>${bdi(v)}</b></div>`).join('');
  $('#confirmCost').hidden=!cost.length;
  const ok=$('#confirmOk'),alt=$('#confirmAlt');
  ok.textContent=okLabel;
  ok.classList.toggle('button--danger',tone==='danger');
  ok.classList.toggle('button--accent',tone!=='danger');
  alt.hidden=!altLabel;
  alt.textContent=altLabel||'';
  confirmDialog.querySelector('.eyebrow').textContent=tone==='danger'?'لا يمكن التراجع':'اختر';
  return new Promise(resolve=>{
    confirmDialog.addEventListener('close',()=>resolve(confirmDialog.returnValue||'cancel'),{once:true});
    confirmDialog.showModal();
    ok.focus();
  });
}

async function removeProject(p){
  const [impact,foot]=await Promise.all([deleteImpact(p.id),projectStorageFootprint(p.id)]);
  const cost=[['النسخ',fmtNumber(impact.versions)],['الملفات',fmtNumber(impact.files)],
              ['المساحة المستعادة',fmtBytes(impact.bytes)]];
  /* ما كتبته الأداة داخل نفسها يُذكر صراحةً: هو ما لا نسخةَ له في مكانٍ آخر. */
  if(foot.any)cost.push(['بيانات الأداة نفسها',
    `${fmtNumber(foot.dbs)} ${plural(foot.dbs,'قاعدة','قاعدتان','قواعد','قاعدة')} · ${fmtNumber(foot.keys)} مفتاح`]);
  const choice=await confirmAction({
    title:`حذف «${p.title}»؟`,
    lede:foot.any
      ? 'يُحذف المشروع وكل نسخه وملفاته، ومعها ما كتبته الأداة نفسها من بيانات على هذا الجهاز. لا نسخة احتياطية، ولا طريق للرجوع.'
      : 'يُحذف المشروع وكل نسخه وملفاته من هذا الجهاز. لا نسخة احتياطية، ولا طريق للرجوع.',
    cost, okLabel:'احذف المشروع'});
  if(choice!=='ok')return;
  await deleteProject(p.id);
  const {freed}=await purgeProjectStorage(p.id);
  toast(freed?`حُذف المشروع — تحرّر ${fmtBytes(freed)}`:'حُذف المشروع');
  await render();
}

function closeMenu(){if(menuCloser){menuCloser();menuCloser=null}}
function toggleMenu(card,p){
  const kebab=card.querySelector('.kebab'),wasOpen=card.contains(document.querySelector('.popover'));
  closeMenu();
  if(wasOpen)return; // second click on the same kebab closes it
  const m=document.createElement('div');
  m.className='popover';m.setAttribute('role','menu');
  m.innerHTML=`<button role="menuitem" type="button" data-act="info"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>كل المعلومات</button><button role="menuitem" type="button" data-act="timeline"><svg viewBox="0 0 24 24"><path d="M4 12h16M7 8v8m5-10v12m5-8v4"/></svg>الخط الزمني</button><hr><button role="menuitem" type="button" class="is-danger" data-act="delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/></svg>حذف المشروع</button>`;
  const onDown=e=>{if(!m.contains(e.target)&&!kebab.contains(e.target))closeMenu()};
  const onKey=e=>{if(e.key==='Escape'){closeMenu();kebab.focus()}};
  /* The old code registered this listener per menu and only ever removed it from
     inside itself, so opening a second menu orphaned the first one forever. */
  menuCloser=()=>{document.removeEventListener('pointerdown',onDown);document.removeEventListener('keydown',onKey);m.remove();kebab.setAttribute('aria-expanded','false')};
  m.onclick=e=>{const b=e.target.closest('button');if(!b)return;const act=b.dataset.act;closeMenu();
    if(act==='info')showInfo(p.id);else if(act==='timeline')timeline.show(p.id);else if(act==='delete')removeProject(p);};
  kebab.parentElement.appendChild(m);kebab.setAttribute('aria-expanded','true');
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

/* ── فتحُ ملفٍّ من النظام ────────────────────────────────────────────────────
   التطبيقُ المثبَّت يُسجَّل لدى النظام معالِجًا لـ.html و.zip، فيظهر في «الفتح
   بواسطة» بجانب المتصفّحات والمحرّرات. والملفّ يصل هنا بدل أن يُفتح في لسانٍ
   لا يحسن إلّا النظر إليه. */

async function peekTitle(file){
  const fallback=String(file.name||'').replace(/\.(zip|html?)$/i,'').trim()||'مشروع';
  if(!/\.html?$/i.test(file.name||''))return fallback;
  try{
    /* العنوان في <head>، فأوّل مقطعٍ يكفي — أداةٌ بحجم ميجابايتين لا تُقرأ
       كاملةً لمجرّد معرفة اسمها. */
    const head=await file.slice(0,65536).text();
    const m=/<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
    return (m&&m[1].trim())||fallback;
  }catch{return fallback}
}

async function openLaunchedFiles(files){
  if(!files.length||importing)return;
  const first=files[0];
  const kind=files.length>1?'folder':(/\.zip$/i.test(first.name||'')?'zip':'file');
  const title=await peekTitle(first);
  const existing=(await getAll('projects')).find(p=>p.title===title);
  let targetId=null;
  if(existing){
    /* هذا هو الطريق الطبيعيّ: تنزّل نسخةً أحدث من أداتك وتفتحها. السؤال ليس
       «متأكّد؟» بل «نسخةٌ في تاريخه، أم مشروعٌ مستقلّ؟». */
    const vc=existing.versionCount||1;
    const choice=await confirmAction({
      title:`«${title}» موجود عندك`,
      lede:'تبيه نسخةً جديدةً داخل المشروع الموجود فيبقى تاريخه كله ويصير هذا هو المعتمد؟ أو مشروعًا مستقلًّا بتاريخٍ خاصٍّ به؟',
      cost:[['المشروع الموجود',`${fmtNumber(vc)} ${plural(vc,'نسخة','نسختان','نسخ','نسخة')}`],
            ['الملف المفتوح',fmtBytes(first.size||0)]],
      okLabel:'نسخة جديدة',
      altLabel:'مشروع مستقل',
      tone:'neutral'});
    if(choice==='cancel')return;
    targetId=choice==='ok'?existing.id:null;
  }
  openImport(targetId,existing?.title||'');
  await handleImport(kind,files);
}

if('launchQueue' in window && 'files' in (window.LaunchParams?.prototype||{})){
  launchQueue.setConsumer(async (params)=>{
    if(!params?.files?.length)return;
    try{
      const files=await Promise.all(params.files.map(h=>h.getFile()));
      await openLaunchedFiles(files);
    }catch(err){
      console.error(err);
      toast('تعذر فتح الملف');
    }
  });
}

/* ── ما وصل من قائمة المشاركة ───────────────────────────────────────────────
   عاملُ الخدمة أودع الملفّ في مخزنٍ مؤقّت ثمّ حوّل المتصفّح إلى هنا. والصندوق
   يُستنزف في كلّ إقلاع، لا عند `?share=1` وحدها: التحويل قد يُفقد أو تُغلق
   الصفحة قبله، والملفّ المودَع يجب ألّا يضيع بلا أثر. */
async function drainInbox(){
  if(!('caches' in window))return;
  let cache,keys;
  try{ cache=await caches.open('local-inbox'); keys=await cache.keys(); }catch{ return }
  if(!keys.length)return;
  const files=[];
  for(const req of keys){
    try{
      const res=await cache.match(req);
      if(!res)continue;
      const name=decodeURIComponent(res.headers.get('X-Local-Name')||'shared');
      const blob=await res.blob();
      files.push(new File([blob],name,{type:blob.type||''}));
    }catch{}
  }
  /* يُفرَّغ قبل الاستيراد: لو تعثّر الاستيراد لا يعيد المحاولة عند كل فتحة. */
  await Promise.all(keys.map(k=>cache.delete(k).catch(()=>{})));
  if(location.search){try{history.replaceState({},'',location.pathname)}catch{}}
  if(files.length)await openLaunchedFiles(files);
}
await drainInbox();

/* ── النسخ الاحتياطيّ ───────────────────────────────────────────────────────
   المشروع يُعاد استيراده من ملفّه الأصليّ إن ضاع، أمّا ما كتبتَه **داخل**
   أداتك فلا نسخةَ له في مكانٍ آخر. فالأرشيف يحمل الاثنين. */
const backupDialog=$('#backupDialog'),backupProgress=$('#backupProgress'),backupProgressText=$('#backupProgressText');
let archiving=false;

async function showBackup(){
  const [projects,versions]=await Promise.all([getAll('projects'),getAll('versions')]);
  const storage=await storageSnapshot();
  let toolDbs=0;
  try{ toolDbs=(await indexedDB.databases?.()||[]).filter(d=>d.name&&d.name!=='local-launcher-v1').length }catch{}
  $('#backupStats').innerHTML=[
    ['المشاريع',fmtNumber(projects.length)],
    ['النسخ',fmtNumber(versions.length)],
    ['قواعد بيانات الأدوات',fmtNumber(toolDbs)],
    ['المستخدم على الجهاز',bdi(fmtBytes(storage.usage))],
    ['المتاح',storage.quota?bdi(fmtBytes(storage.quota)):'—'],
    ['تخزين دائم',storage.persisted?'نعم':'لا — قد يُمحى عند ضغط المساحة'],
  ].map(([k,v])=>`<div><span>${esc(k)}</span><b>${v}</b></div>`).join('');
  await showLegacy(projects);
  backupProgress.hidden=true;
  backupDialog.showModal();
}

/* ما كُتب قبل النَّسْب لا بادئة له، فلا يراه المشروع بعد التحديث ويبدو ضائعًا
   وهو موجود. لا يُنقل تلقائيًّا: Local لا يعرف لأيّ مشروعٍ هو، فيسأل. */
async function showLegacy(projects){
  const box=$('#legacyBox');
  const {dbs,keys}=await legacyStorage();
  if((!dbs.length&&!keys.length)||!projects.length){ box.hidden=true; return }
  box.hidden=false;
  $('#legacyText').textContent=
    `وجدت ${fmtNumber(dbs.length)} ${plural(dbs.length,'قاعدة','قاعدتين','قواعد','قاعدة')} و${fmtNumber(keys.length)} مفتاحًا كُتبت قبل أن يصير لكل مشروع ركنه الخاص. `+
    `أدواتك لا تراها الآن. اختر المشروع الذي تخصه لتعود إليه.`;
  const sel=$('#legacyTarget');
  sel.innerHTML=projects.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}</option>`).join('');
  $('#legacyAdopt').onclick=async()=>{
    const id=sel.value; if(!id)return;
    busy(true,'أنقل البيانات…');
    try{
      const r=await adoptLegacy(id,t=>{backupProgressText.textContent=t});
      toast(`نُسبت ${fmtNumber(r.dbs)} ${plural(r.dbs,'قاعدة','قاعدتان','قواعد','قاعدة')} و${fmtNumber(r.keys)} مفتاحًا`);
      await showBackup();
    }catch(err){ console.error(err); backupProgressText.textContent=err.message||'تعذر النقل' }
    finally{ busy(false) }
  };
}

function busy(on,text=''){
  archiving=on;
  backupProgress.hidden=!on;
  backupProgressText.textContent=text;
  for(const b of [$('#exportLibrary'),$('#importLibrary')])b.disabled=on;
}

async function doExport(){
  if(archiving)return;
  busy(true,'أجهّز…');
  try{
    const {blob,manifest}=await exportLibrary(t=>{backupProgressText.textContent=t});
    const stamp=new Date().toISOString().slice(0,10);
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`local-library-${stamp}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    /* لا يُسحب فورًا: بعض المتصفّحات تقرأ الرابط بعد النقرة. */
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    toast(`صُدِّرت — ${fmtNumber(manifest.counts.projects)} ${plural(manifest.counts.projects,'مشروع','مشروعان','مشاريع','مشروعًا')} · ${fmtBytes(blob.size)}`);
    backupDialog.close();
  }catch(err){
    console.error(err);
    backupProgressText.textContent=err.message||'تعذر التصدير';
    toast('تعذر التصدير');
  }finally{ busy(false) }
}

async function doImport(file){
  if(archiving||!file)return;
  busy(true,'أقرأ الملف…');
  try{
    const {report}=await importLibrary(file,t=>{backupProgressText.textContent=t});
    const added=report.projects+report.versions+report.objects+report.toolRows;
    if(!added){
      backupProgressText.textContent='كل ما في النسخة موجود عندك أصلًا — لم يُغيَّر شيء.';
    }else{
      backupDialog.close();
      toast(`استُعيد ${fmtNumber(report.projects)} ${plural(report.projects,'مشروع','مشروعان','مشاريع','مشروعًا')} و${fmtNumber(report.toolRows)} سجلًّا من بيانات الأدوات`);
      await render();
    }
  }catch(err){
    console.error(err);
    backupProgressText.textContent=err.message||'تعذر الاستيراد';
    toast('تعذر الاستيراد');
  }finally{ busy(false); $('#libraryInput').value='' }
}

$('#headerBackup').onclick=()=>showBackup();
$('#closeBackup').onclick=()=>{ if(!archiving)backupDialog.close() };
$('#exportLibrary').onclick=()=>doExport();
$('#importLibrary').onclick=()=>$('#libraryInput').click();
$('#libraryInput').onchange=e=>e.target.files[0]&&doImport(e.target.files[0]);
