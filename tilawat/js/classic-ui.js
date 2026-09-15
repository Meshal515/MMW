import { dossariImage, QURAN_FALLBACK, isDossari } from './ui-dossari-only.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let installPrompt = null;
let sleepTimer = null;

function mountCss(){
  if(document.querySelector('link[data-classic-ui]')) return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./classic.css';
  link.dataset.classicUi='';
  document.head.append(link);
}

function gearSvg(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19 14.8a1.8 1.8 0 0 0 .3 2l.1.1-2.5 2.5-.1-.1a1.8 1.8 0 0 0-3 .9V21H10v-.8a1.8 1.8 0 0 0-3-.9l-.1.1-2.5-2.5.1-.1a1.8 1.8 0 0 0-.9-3H3v-3.6h.6a1.8 1.8 0 0 0 .9-3l-.1-.1 2.5-2.5.1.1a1.8 1.8 0 0 0 3-.9V3h3.6v.8a1.8 1.8 0 0 0 3 .9l.1-.1 2.5 2.5-.1.1a1.8 1.8 0 0 0 .9 3h.7v3.6z"/></svg>';
}

function restoreTopbar(){
  if($('#classicSettingsBtn')) return;
  const theme=$('#themeBtn');
  if(!theme) return;
  const btn=document.createElement('button');
  btn.id='classicSettingsBtn';
  btn.className='round classic-settings';
  btn.type='button';
  btn.setAttribute('aria-label','الإعدادات');
  btn.innerHTML=gearSvg();
  theme.insertAdjacentElement('afterend',btn);
  btn.addEventListener('click',openSettings);
}

function restoreHome(){
  const hero=$('#homeView .hero');
  if(!hero || hero.dataset.classic==='1') return;
  hero.dataset.classic='1';
  hero.classList.add('classic-home');
  hero.innerHTML=`
    <div class="classic-heading">
      <p class="hero__eyebrow">مكتبتك الصوتية</p>
      <h1>استمع</h1>
    </div>
    <div class="classic-showcase">
      <div class="classic-showcase__art"><img src="./assets/covers/dossari-3.jpg" alt=""></div>
      <p class="hero__eyebrow">ياسر الدوسري</p>
      <h2>صوت واحد، وأرشيف مرتب</h2>
      <p>رمضان 1425هـ والمصحف المرتل فقط. اختر السورة، شغّلها، نزّلها، وكمل استماعك من شاشة القفل.</p>
      <button class="classic-primary" id="openDossari" data-reciter="92" type="button">ابدأ الاستماع</button>
    </div>
    <div id="heroStats" hidden></div>`;

  if(!$('#classicCollections')){
    const block=document.createElement('section');
    block.id='classicCollections';
    block.className='classic-collections';
    block.innerHTML=`
      <div class="classic-section-head"><div><h2>مكتبة ياسر</h2><p>مصدران فقط، بدون ازدحام.</p></div></div>
      <div class="classic-collection-rail">
        <button class="classic-collection" data-reciter="92" data-classic-moshaf="0" type="button">
          <div class="classic-collection__art"><img src="./assets/covers/dossari-2.jpg" alt=""></div>
          <h3>رمضان 1425هـ</h3><p>التسجيلات القديمة المتاحة من الأرشيف</p>
        </button>
        <button class="classic-collection" data-reciter="92" data-classic-moshaf="1" type="button">
          <div class="classic-collection__art"><img src="./assets/covers/dossari-4.jpg" alt=""></div>
          <h3>المصحف المرتل</h3><p>114 سورة بصوت ياسر الدوسري</p>
        </button>
      </div>`;
    hero.insertAdjacentElement('afterend',block);
  }
}

function cleanHomeShelves(){
  $$('#homeShelves>.shelf').forEach(section=>{
    const title=section.querySelector('.shelf__head h2')?.textContent?.trim()||'';
    const hide=['القراء','السور','اكتشف قارئًا'].includes(title);
    if(hide) section.dataset.classicHidden='1'; else delete section.dataset.classicHidden;
  });
}

function isLocalOwnerArt(src=''){
  const s=String(src||'');
  return s.startsWith('blob:') || s.includes('/assets/covers/dossari-') || s.includes('./assets/covers/dossari-') || s.includes('/assets/covers/default.jpg') || s.includes('./assets/covers/default.jpg');
}

function setLocalArt(img,{reciter='',seed=''}){
  if(!img) return;
  const desired=isDossari(reciter) ? dossariImage(seed||reciter) : QURAN_FALLBACK;
  const current=img.getAttribute('src')||'';
  if(current===desired) return;
  if(current.startsWith('blob:')) return; // user's own local cover wins.
  img.src=desired;
  img.onerror=()=>{img.onerror=null;img.src=QURAN_FALLBACK;};
}

function decorateMediaCards(){
  $$('.media-card').forEach(card=>{
    const img=card.querySelector('.art img');
    const sub=card.querySelector('p')?.textContent||'';
    const title=card.querySelector('h3')?.textContent||'';
    const reciter=isDossari(sub)?'ياسر الدوسري':'';
    if(reciter || !isLocalOwnerArt(img?.getAttribute('src'))) setLocalArt(img,{reciter,seed:`${title}|${sub}|${card.dataset.play||''}`});
  });
}

function decorateReciterCards(){
  $$('.reciter-card').forEach(card=>{
    const name=card.querySelector('h3')?.textContent?.trim()||'';
    const box=card.querySelector('.reciter-art');
    if(!box) return;
    let img=box.querySelector('img');
    if(!img){ img=document.createElement('img'); box.replaceChildren(img); }
    setLocalArt(img,{reciter:name,seed:`reciter|${name}`});
  });
}

function decorateResultRows(){
  $$('.result-row').forEach(row=>{
    const img=row.querySelector('img'); if(!img) return;
    const text=row.textContent||'';
    setLocalArt(img,{reciter:isDossari(text)?'ياسر الدوسري':'',seed:`result|${text}`});
  });
}

function decorateBrowse(){
  const box=$('#browseMono');
  const title=$('#browseTitle')?.textContent?.trim()||'';
  if(!box || !title) return;
  let img=box.querySelector('img');
  if(!img){ img=document.createElement('img'); box.replaceChildren(img); }
  const yasser=isDossari(title) || /^سورة\s+/.test(title) || /صفحة السورة/.test($('#browseKicker')?.textContent||'');
  setLocalArt(img,{reciter:yasser?'ياسر الدوسري':'',seed:`browse|${title}`});
}

function decoratePlayer(){
  const sub=$('#miniSub')?.textContent||$('#playerSub')?.textContent||'';
  const title=$('#miniTitle')?.textContent||$('#playerTitle')?.textContent||'';
  const reciter=isDossari(sub)?'ياسر الدوسري':'';
  for(const img of [$('#miniCover'),$('#playerCover')]){
    if(!img) continue;
    const src=img.getAttribute('src')||'';
    if(reciter || !isLocalOwnerArt(src)) setLocalArt(img,{reciter,seed:`player|${title}|${sub}`});
  }
}

function decorateAll(){
  cleanHomeShelves();
  decorateMediaCards();
  decorateReciterCards();
  decorateResultRows();
  decorateBrowse();
  decoratePlayer();
}

function settingsHtml(){
  return `<section class="classic-settings" id="classicSettings" hidden aria-label="الإعدادات">
    <div class="classic-settings__top">
      <button class="classic-close" id="classicSettingsClose" type="button" aria-label="رجوع">‹</button>
      <div><small>تفضيلات تلاوات</small><h1>الإعدادات</h1></div>
    </div>
    <div class="classic-settings__scroll">
      <h2>المظهر</h2>
      <div class="classic-panel">
        <button class="classic-row" id="classicTheme" type="button"><span><b>الوضع الداكن / الفاتح</b><small>نفس هوية تلاوات بدون تغيير التخطيط.</small></span><em id="classicThemeState">داكن</em></button>
      </div>
      <h2>التشغيل</h2>
      <div class="classic-panel">
        <div class="classic-row"><span><b>الخلفية وشاشة القفل</b><small>الصوت المباشر والنسخة المحلية يعملان من مشغل Audio واحد طويل العمر.</small></span><em>${'mediaSession' in navigator?'مدعوم':'—'}</em></div>
        <div class="classic-row"><span><b>مصادر الكتالوج</b><small>ياسر الدوسري فقط: رمضان 1425هـ + المصحف المرتل.</small></span><em>2</em></div>
      </div>
      <h2>التخزين والمكتبة</h2>
      <div class="classic-panel">
        <div class="classic-row"><span><b>مساحة التطبيق</b><small id="classicStorage">جارٍ الحساب…</small></span><em id="classicStoragePct"></em></div>
        <button class="classic-row" id="classicExport" type="button"><span><b>تصدير بيانات المكتبة</b><small>يحفظ الفهرس والبيانات، وليس ملفات الصوت الكبيرة.</small></span><em>↓</em></button>
        <button class="classic-row" id="classicImport" type="button"><span><b>استعادة بيانات المكتبة</b><small>استعد ملف JSON سابق.</small></span><em>↑</em></button>
        <input id="classicImportInput" type="file" accept="application/json,.json" hidden>
      </div>
      <h2>التطبيق</h2>
      <div class="classic-panel">
        <button class="classic-row" id="classicInstall" type="button"><span><b>تثبيت تلاوات</b><small>أضفه كتطبيق مستقل على جوالك.</small></span><em>＋</em></button>
        <div class="classic-row"><span><b>الصور</b><small>صور ياسر الخمس الموجودة داخل التطبيق فقط. لا بحث صور من الإنترنت.</small></span><em>محلية</em></div>
      </div>
    </div>
  </section>`;
}

function mountSettings(){
  if($('#classicSettings')) return;
  document.body.insertAdjacentHTML('beforeend',settingsHtml());
  $('#classicSettingsClose').addEventListener('click',closeSettings);
  $('#classicTheme').addEventListener('click',()=>{ $('#themeBtn')?.click(); setTimeout(syncSettings,30); });
  $('#classicExport').addEventListener('click',exportLibrary);
  $('#classicImport').addEventListener('click',()=>$('#classicImportInput').click());
  $('#classicImportInput').addEventListener('change',importLibrary);
  $('#classicInstall').addEventListener('click',async()=>{
    if(installPrompt){ installPrompt.prompt(); await installPrompt.userChoice; installPrompt=null; }
    else notify('من قائمة كروم اختر «تثبيت التطبيق» إذا لم يظهر الطلب.');
  });
}

function openSettings(){
  const pane=$('#classicSettings'); if(!pane) return;
  pane.hidden=false;
  requestAnimationFrame(()=>pane.classList.add('open'));
  document.body.style.overflow='hidden';
  syncSettings(); updateStorage();
}
function closeSettings(){
  const pane=$('#classicSettings'); if(!pane) return;
  pane.classList.remove('open'); document.body.style.overflow='';
  setTimeout(()=>pane.hidden=true,200);
}
function syncSettings(){
  const el=$('#classicThemeState'); if(el) el.textContent=document.documentElement.dataset.theme==='light'?'فاتح':'داكن';
}
function formatBytes(n=0){ const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`; }
async function updateStorage(){
  try{const {usage=0,quota=0}=await navigator.storage.estimate();$('#classicStorage').textContent=`${formatBytes(usage)} مستخدمة من ${formatBytes(quota)}`;$('#classicStoragePct').textContent=quota?`${Math.round(usage/quota*100)}%`:'';}catch{}
}
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('tilawat');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function readTracks(){const db=await openDb();return new Promise((resolve,reject)=>{try{const tx=db.transaction('tracks','readonly');const r=tx.objectStore('tracks').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);}catch(e){reject(e);}});}
async function exportLibrary(){
  try{const tracks=await readTracks();const payload={app:'tilawat',version:4,exportedAt:new Date().toISOString(),tracks:tracks.map(({localAudioKey,coverKey,...rest})=>rest)};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`tilawat-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);notify(`صُدّرت ${tracks.length} تلاوة.`);}catch{notify('تعذر تصدير المكتبة.');}
}
async function importLibrary(e){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{const data=JSON.parse(await file.text());if(!Array.isArray(data.tracks))throw new Error();const db=await openDb();const tx=db.transaction('tracks','readwrite');const store=tx.objectStore('tracks');data.tracks.forEach(t=>store.put(t));await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});notify('تمت الاستعادة. افتح التطبيق من جديد لتحديث المكتبة.');}catch{notify('ملف النسخة غير صالح.');}
}
function notify(text){
  let el=$('#classicToast');if(!el){el=document.createElement('div');el.id='classicToast';el.className='classic-toast';document.body.append(el);}el.textContent=text;el.classList.add('on');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),2400);
}

function mountPlayerUtilities(){
  const actions=$('.player-actions'); if(!actions || $('#classicRepeat')) return;
  const repeat=document.createElement('button'); repeat.className='chip'; repeat.id='classicRepeat'; repeat.type='button'; repeat.textContent='تكرار';
  const sleep=document.createElement('button'); sleep.className='chip'; sleep.id='classicSleep'; sleep.type='button'; sleep.textContent='مؤقت';
  actions.append(repeat,sleep);
  repeat.addEventListener('click',()=>{const audio=$('#audioEngine');if(!audio)return;audio.loop=!audio.loop;repeat.classList.toggle('on',audio.loop);repeat.textContent=audio.loop?'تكرار ✓':'تكرار';});
  sleep.addEventListener('click',()=>{const audio=$('#audioEngine');if(!audio)return;const values=[15,30,45,60,0],current=Number(sleep.dataset.min||0),idx=Math.max(0,values.indexOf(current)),min=values[(idx+1)%values.length];clearTimeout(sleepTimer);sleep.dataset.min=String(min);if(min){sleep.textContent=`مؤقت ${min}د`;sleepTimer=setTimeout(()=>{audio.pause();sleep.textContent='مؤقت';sleep.dataset.min='0';notify('انتهى مؤقت النوم.');},min*60000);}else{sleep.textContent='مؤقت';notify('أوقف مؤقت النوم.');}});
}

function bindCollections(){
  document.addEventListener('click',e=>{
    const card=e.target.closest('[data-classic-moshaf]');
    if(!card) return;
    const index=card.dataset.classicMoshaf;
    setTimeout(()=>document.querySelector(`[data-moshaf-index="${index}"]`)?.click(),0);
  });
}

function boot(){
  mountCss();
  restoreTopbar();
  restoreHome();
  mountSettings();
  mountPlayerUtilities();
  bindCollections();
  decorateAll();
  const observer=new MutationObserver(()=>{decorateAll();mountPlayerUtilities();});
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
  addEventListener('appinstalled',()=>{installPrompt=null;notify('تم تثبيت تلاوات.');});
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
