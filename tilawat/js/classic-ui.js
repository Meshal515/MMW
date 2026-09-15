const $ = s => document.querySelector(s);
let installPrompt = null;

function mountCss(){
  const mount=(href,key)=>{
    if(document.querySelector(`link[data-${key}]`)) return;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href=href;link.setAttribute(`data-${key}`,'');
    document.head.append(link);
  };
  mount('./classic.css','settings-ui');
  mount('./identity.css','identity-ui');
}
function gearSvg(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19 14.8a1.8 1.8 0 0 0 .3 2l.1.1-2.5 2.5-.1-.1a1.8 1.8 0 0 0-3 .9V21H10v-.8a1.8 1.8 0 0 0-3-.9l-.1.1-2.5-2.5.1-.1a1.8 1.8 0 0 0-.9-3H3v-3.6h.6a1.8 1.8 0 0 0 .9-3l-.1-.1 2.5-2.5.1.1a1.8 1.8 0 0 0 3-.9V3h3.6v.8a1.8 1.8 0 0 0 3 .9l.1-.1 2.5 2.5-.1.1a1.8 1.8 0 0 0 .9 3h.7v3.6z"/></svg>'}
function settingsHtml(){return `<section class="classic-settings" id="classicSettings" hidden aria-label="الإعدادات">
  <div class="classic-settings__top">
    <button class="classic-close" id="classicSettingsClose" type="button" aria-label="رجوع"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button>
    <h1>الإعدادات</h1>
  </div>
  <div class="classic-settings__scroll">
    <h2>المظهر</h2>
    <div class="classic-panel"><button class="classic-row" id="classicTheme" type="button"><span><b>الوضع الداكن والفاتح</b><small>غيّر الألوان بدون أن يتغير ترتيب التطبيق.</small></span><em id="classicThemeState">داكن</em></button></div>
    <h2>التشغيل</h2>
    <div class="classic-panel">
      <div class="classic-row"><span><b>الخلفية وشاشة القفل</b><small>تعمل مع الصوت المباشر والنسخ المحفوظة على الجهاز.</small></span><em>${'mediaSession' in navigator?'مدعوم':'غير مدعوم'}</em></div>
      <div class="classic-row"><span><b>مصادر الكتالوج</b><small>رمضان 1425هـ والمصحف المرتل، بدون حذف أي مصدر.</small></span><em>متصلة</em></div>
    </div>
    <h2>المكتبة</h2>
    <div class="classic-panel">
      <div class="classic-row"><span><b>مساحة التطبيق</b><small id="classicStorage">جارٍ الحساب…</small></span><em id="classicStoragePct"></em></div>
      <button class="classic-row" id="classicExport" type="button"><span><b>تصدير بيانات المكتبة</b><small>يحفظ الفهرس والمعلومات في ملف JSON.</small></span><em>تنزيل</em></button>
      <button class="classic-row" id="classicImport" type="button"><span><b>استعادة بيانات المكتبة</b><small>استعد ملف JSON سابقًا.</small></span><em>اختيار</em></button>
      <input id="classicImportInput" type="file" accept="application/json,.json" hidden>
    </div>
    <h2>التطبيق</h2>
    <div class="classic-panel"><button class="classic-row" id="classicInstall" type="button"><span><b>تثبيت تلاوات</b><small>أضفه كتطبيق مستقل على جوالك.</small></span><em>تثبيت</em></button></div>
  </div>
</section>`}
function notify(text){
  let el=$('#classicToast');if(!el){el=document.createElement('div');el.id='classicToast';el.className='classic-toast';document.body.append(el)}
  el.textContent=text;el.classList.add('on');clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('on'),2600);
}
function formatBytes(n=0){const u=['ب','ك.ب','م.ب','غ.ب'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`}
async function updateStorage(){try{const {usage=0,quota=0}=await navigator.storage.estimate();$('#classicStorage').textContent=`${formatBytes(usage)} مستخدمة من ${formatBytes(quota)}`;$('#classicStoragePct').textContent=quota?`${Math.round(usage/quota*100)}٪`:''}catch{$('#classicStorage').textContent='تعذر حساب المساحة'}}
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('tilawat');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function readTracks(){const db=await openDb();return new Promise((resolve,reject)=>{try{const tx=db.transaction('tracks','readonly'),r=tx.objectStore('tracks').getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)}catch(e){reject(e)}})}
async function exportLibrary(){try{const tracks=await readTracks();const payload={app:'tilawat',version:4,exportedAt:new Date().toISOString(),tracks:tracks.map(({localAudioKey,coverKey,...rest})=>rest)};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`tilawat-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);notify(`صُدّرت ${tracks.length} تلاوة.`)}catch{notify('تعذر تصدير المكتبة.')}}
async function importLibrary(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.tracks))throw new Error();const db=await openDb(),tx=db.transaction('tracks','readwrite'),store=tx.objectStore('tracks');data.tracks.forEach(t=>store.put(t));await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});notify('تمت الاستعادة. أعد فتح التطبيق لتحديث المكتبة.')}catch{notify('ملف النسخة غير صالح.')}}
function syncTheme(){const el=$('#classicThemeState');if(el)el.textContent=document.documentElement.dataset.theme==='light'?'فاتح':'داكن'}
function openSettings(){const pane=$('#classicSettings');pane.hidden=false;requestAnimationFrame(()=>pane.classList.add('open'));document.body.style.overflow='hidden';syncTheme();updateStorage()}
function closeSettings(){const pane=$('#classicSettings');pane.classList.remove('open');document.body.style.overflow='';setTimeout(()=>pane.hidden=true,200)}
function boot(){
  mountCss();
  import('./tilawat-polish.js').catch(err=>console.warn('Tilawat polish failed to load',err));
  const theme=$('#themeBtn');
  if(theme&&!$('#classicSettingsBtn')){const btn=document.createElement('button');btn.id='classicSettingsBtn';btn.className='round classic-settings-btn';btn.type='button';btn.setAttribute('aria-label','الإعدادات');btn.innerHTML=gearSvg();theme.insertAdjacentElement('afterend',btn);btn.addEventListener('click',openSettings)}
  document.body.insertAdjacentHTML('beforeend',settingsHtml());
  $('#classicSettingsClose').addEventListener('click',closeSettings);
  $('#classicTheme').addEventListener('click',()=>{$('#themeBtn')?.click();setTimeout(syncTheme,30)});
  $('#classicExport').addEventListener('click',exportLibrary);
  $('#classicImport').addEventListener('click',()=>$('#classicImportInput').click());
  $('#classicImportInput').addEventListener('change',importLibrary);
  $('#classicInstall').addEventListener('click',async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}else notify('من قائمة كروم اختر «تثبيت التطبيق».')});
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});
  addEventListener('appinstalled',()=>{installPrompt=null;notify('تم تثبيت تلاوات.')});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

