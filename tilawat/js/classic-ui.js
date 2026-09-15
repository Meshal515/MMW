import { allTracks, putTrack } from './store.js';
import { portableTrack, sanitizeImportedTrack } from './app-logic.js';
import './codex-ui-recovery.js';

const $=s=>document.querySelector(s);
/* v2 currently asks getElementById('.tabbar'); expose the already-rendered nav
   under that exact id during module evaluation so startup cannot abort before start(). */
const startupTabbar=document.querySelector('.tabbar');
if(startupTabbar&&!document.getElementById('.tabbar'))startupTabbar.id='.tabbar';
let installPrompt=null;
let settingsCloseTimer=0;
let settingsReturnFocus=null;

function gearSvg(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19 14.8a1.8 1.8 0 0 0 .3 2l.1.1-2.5 2.5-.1-.1a1.8 1.8 0 0 0-3 .9V21H10v-.8a1.8 1.8 0 0 0-3-.9l-.1.1-2.5-2.5.1-.1a1.8 1.8 0 0 0-.9-3H3v-3.6h.6a1.8 1.8 0 0 0 .9-3l-.1-.1 2.5-2.5.1.1a1.8 1.8 0 0 0 3-.9V3h3.6v.8a1.8 1.8 0 0 0 3 .9l.1-.1 2.5 2.5-.1.1a1.8 1.8 0 0 0 .9 3h.7v3.6z"/></svg>'}
function settingsHtml(){return `<section class="classic-settings" id="classicSettings" hidden aria-label="الإعدادات" role="dialog" aria-modal="true">
  <div class="classic-settings__top"><button class="classic-close" id="classicSettingsClose" type="button" aria-label="رجوع"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></button><h1>الإعدادات</h1></div>
  <div class="classic-settings__scroll">
    <h2>المظهر</h2><div class="classic-panel"><button class="classic-row" id="classicTheme" type="button"><span><b>الوضع الداكن والفاتح</b><small>غيّر الألوان بدون أن يتغير ترتيب التطبيق.</small></span><em id="classicThemeState">داكن</em></button></div>
    <h2>التشغيل</h2><div class="classic-panel"><div class="classic-row"><span><b>الخلفية وشاشة القفل</b><small>تعمل مع الصوت المباشر والنسخ المحفوظة على الجهاز.</small></span><em>${'mediaSession'in navigator?'مدعوم':'غير مدعوم'}</em></div><div class="classic-row"><span><b>مصادر الكتالوج</b><small>المصحف المرتل يظهر فورًا، وأرشيف 1425 يلتحق به في الخلفية.</small></span><em>متصلة</em></div></div>
    <h2>المكتبة</h2><div class="classic-panel"><div class="classic-row"><span><b>مساحة التطبيق</b><small id="classicStorage">جارٍ الحساب…</small></span><em id="classicStoragePct"></em></div><button class="classic-row" id="classicExport" type="button"><span><b>تصدير بيانات المكتبة</b><small>يحفظ الفهرس والمعلومات فقط؛ ملفات الصوت المحلية لا تدخل في JSON.</small></span><em>تنزيل</em></button><button class="classic-row" id="classicImport" type="button"><span><b>استعادة بيانات المكتبة</b><small>يستعيد الفهرس دون ادعاء أن الملفات المحلية غير الموجودة ما زالت محمّلة.</small></span><em>اختيار</em></button><input id="classicImportInput" type="file" accept="application/json,.json" hidden></div>
    <h2>التطبيق</h2><div class="classic-panel"><button class="classic-row" id="classicInstall" type="button"><span><b>تثبيت تلاوات</b><small>أضفه كتطبيق مستقل على جوالك.</small></span><em>تثبيت</em></button></div>
  </div></section>`}
function notify(text){let el=$('#classicToast');if(!el){el=document.createElement('div');el.id='classicToast';el.className='classic-toast';document.body.append(el)}el.textContent=text;el.classList.add('on');clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('on'),2600)}
function formatBytes(n=0){const u=['ب','ك.ب','م.ب','غ.ب'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return`${n.toFixed(i?1:0)} ${u[i]}`}
async function updateStorage(){try{const{usage=0,quota=0}=await navigator.storage.estimate();$('#classicStorage').textContent=`${formatBytes(usage)} مستخدمة من ${formatBytes(quota)}`;$('#classicStoragePct').textContent=quota?`${Math.round(usage/quota*100)}٪`:''}catch{$('#classicStorage').textContent='تعذر حساب المساحة'}}
async function exportLibrary(){try{const tracks=await allTracks();const payload={app:'tilawat',version:5,exportedAt:new Date().toISOString(),tracks:tracks.map(portableTrack)};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`tilawat-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1200);notify(`صُدّرت ${tracks.length} تلاوة.`)}catch(err){console.warn(err);notify('تعذر تصدير المكتبة.')}}
async function importLibrary(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.tracks))throw new Error('invalid');for(const raw of data.tracks)await putTrack(sanitizeImportedTrack(raw));notify('تمت الاستعادة بدون مؤشرات ملفات محلية مفقودة.');dispatchEvent(new CustomEvent('tilawat-library-imported'))}catch(err){console.warn(err);notify('ملف النسخة غير صالح.')}}
function syncTheme(){const el=$('#classicThemeState');if(el)el.textContent=document.documentElement.dataset.theme==='light'?'فاتح':'داكن'}
function focusables(root){return [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden&&el.offsetParent!==null)}
function openSettings(){clearTimeout(settingsCloseTimer);settingsCloseTimer=0;const pane=$('#classicSettings');settingsReturnFocus=document.activeElement;pane.hidden=false;requestAnimationFrame(()=>pane.classList.add('open'));document.body.style.overflow='hidden';syncTheme();updateStorage();requestAnimationFrame(()=>$('#classicSettingsClose')?.focus())}
function closeSettings(){const pane=$('#classicSettings');pane.classList.remove('open');document.body.style.overflow='';clearTimeout(settingsCloseTimer);settingsCloseTimer=setTimeout(()=>{if(!pane.classList.contains('open'))pane.hidden=true;settingsCloseTimer=0;settingsReturnFocus?.focus?.();settingsReturnFocus=null},200)}
function onSettingsKey(e){const pane=$('#classicSettings');if(!pane||pane.hidden)return;if(e.key==='Escape'){e.preventDefault();closeSettings();return}if(e.key!=='Tab')return;const list=focusables(pane);if(!list.length)return;const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}
function boot(){
  const theme=$('#themeBtn');
  if(theme&&!$('#classicSettingsBtn')){const btn=document.createElement('button');btn.id='classicSettingsBtn';btn.className='round classic-settings-btn';btn.type='button';btn.setAttribute('aria-label','الإعدادات');btn.innerHTML=gearSvg();theme.insertAdjacentElement('afterend',btn);btn.addEventListener('click',openSettings)}
  if(!$('#classicSettings'))document.body.insertAdjacentHTML('beforeend',settingsHtml());
  $('#classicSettingsClose').addEventListener('click',closeSettings);$('#classicTheme').addEventListener('click',()=>{$('#themeBtn')?.click();setTimeout(syncTheme,30)});$('#classicExport').addEventListener('click',exportLibrary);$('#classicImport').addEventListener('click',()=>$('#classicImportInput').click());$('#classicImportInput').addEventListener('change',importLibrary);$('#classicInstall').addEventListener('click',async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null}else notify('من قائمة كروم اختر «تثبيت التطبيق».')});
  document.addEventListener('keydown',onSettingsKey);addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e});addEventListener('appinstalled',()=>{installPrompt=null;notify('تم تثبيت تلاوات.')});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();