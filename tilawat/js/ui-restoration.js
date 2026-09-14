/* Tilawat UI restoration layer
   Keeps the v2 catalogue/player architecture, while restoring the practical
   controls and visual behaviour that existed before the redesign. */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const PREF_KEY = 'tilawat-ui-restoration-v1';
const IMG_CACHE_KEY = 'tilawat-image-cache-v2';
const DEFAULT_PREFS = { reciterImages:true, surahImages:true, internetImages:true, fallbackImages:true };
let prefs = { ...DEFAULT_PREFS, ...safeJson(localStorage.getItem(PREF_KEY), {}) };
let imgCache = safeJson(localStorage.getItem(IMG_CACHE_KEY), {});
let installEvent = null;
let sleepTimer = null;

function safeJson(value, fallback){ try { return JSON.parse(value) || fallback; } catch { return fallback; } }
function savePrefs(){ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }
function saveImageCache(){ try { localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(imgCache)); } catch {} }
function norm(v=''){ return String(v).normalize('NFKD').replace(/[ً-ْٰـ]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim().toLowerCase(); }
function hash(str=''){ let h=2166136261; for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)} return h>>>0; }
function stablePick(list, key){ return list.length ? list[hash(key)%list.length] : ''; }
function isProcedural(src=''){ return !src || src.startsWith('data:image/svg') || src.includes('generated') || src.includes('monogram'); }

const BUILTIN = {
  generic: ['./assets/covers/default.jpg'],
  reciters: {
    [norm('ياسر الدوسري')]: ['./assets/covers/dossari.jpg']
  }
};

async function wikiImage(query){
  const key='wiki:'+norm(query);
  if(imgCache[key]!==undefined) return imgCache[key];
  if(!prefs.internetImages){ imgCache[key]=''; return ''; }
  const endpoints=[
    `https://ar.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=0&prop=pageimages&piprop=thumbnail&pithumbsize=900&format=json&origin=*`,
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=900&format=json&origin=*`
  ];
  for(const url of endpoints){
    try{
      const r=await fetch(url,{mode:'cors',credentials:'omit'}); if(!r.ok) continue;
      const d=await r.json(); const pages=Object.values(d?.query?.pages||{});
      const found=pages.map(p=>p.thumbnail?.source||p.imageinfo?.[0]?.thumburl||p.imageinfo?.[0]?.url).find(Boolean);
      if(found){ imgCache[key]=found; saveImageCache(); return found; }
    }catch{}
  }
  imgCache[key]=''; saveImageCache(); return '';
}

async function imageFor({reciter='',surah='',seed='',manual=''}){
  if(manual && !isProcedural(manual)) return manual;
  const recKey=norm(reciter);
  if(prefs.reciterImages && recKey){
    const pool=BUILTIN.reciters[recKey]||[];
    if(pool.length) return stablePick(pool,`${reciter}|${surah}|${seed}`);
    const remote=await wikiImage(`${reciter} قارئ قرآن`);
    if(remote) return remote;
  }
  if(prefs.surahImages && surah){
    const remote=await wikiImage(`مصحف القرآن الكريم سورة ${surah}`);
    if(remote) return remote;
  }
  if(prefs.fallbackImages){
    const remote=await wikiImage('مصحف القرآن الكريم الكعبة');
    return remote || stablePick(BUILTIN.generic,seed||reciter||surah||'tilawat');
  }
  return stablePick(BUILTIN.generic,seed||'tilawat');
}

function ensureCss(){
  if(document.querySelector('link[data-tilawat-restoration]')) return;
  const link=document.createElement('link'); link.rel='stylesheet'; link.href='./restoration.css'; link.dataset.tilawatRestoration=''; document.head.append(link);
}

function gearIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19 14.8a1.8 1.8 0 0 0 .3 2l.1.1-2.5 2.5-.1-.1a1.8 1.8 0 0 0-3 .9V21H10v-.8a1.8 1.8 0 0 0-3-.9l-.1.1-2.5-2.5.1-.1a1.8 1.8 0 0 0-.9-3H3v-3.6h.6a1.8 1.8 0 0 0 .9-3l-.1-.1 2.5-2.5.1.1a1.8 1.8 0 0 0 3-.9V3h3.6v.8a1.8 1.8 0 0 0 3 .9l.1-.1 2.5 2.5-.1.1a1.8 1.8 0 0 0 .9 3h.7v3.6z"/></svg>';}

function settingsMarkup(){
  return `<section class="restored-settings" id="restoredSettings" hidden aria-label="الإعدادات">
    <div class="rs-head"><button class="rs-close" type="button" aria-label="رجوع">‹</button><div><small>تفضيلات تلاوات</small><h1>الإعدادات</h1></div></div>
    <div class="rs-scroll">
      <section class="rs-group"><h2>المظهر</h2><div class="rs-panel">
        <button class="rs-row" id="rsTheme" type="button"><span><b>الوضع الداكن / الفاتح</b><small>استخدم نفس محرك الثيم الموجود في تلاوات.</small></span><em id="rsThemeState"></em></button>
      </div></section>
      <section class="rs-group"><h2>الصور والأغلفة</h2><div class="rs-panel">
        ${toggleRow('reciterImages','صور القراء','استخدم صورة القارئ بدل حرف اسمه.')}
        ${toggleRow('surahImages','صور السور','نوّع الأغلفة حسب السورة والتسجيل.')}
        ${toggleRow('internetImages','البحث من الإنترنت','إذا لم نجد صورة مناسبة محليًا، ابحث في المصادر العامة الموثوقة واحفظ النتيجة.')}
        ${toggleRow('fallbackImages','الصور الاحتياطية','لا تترك أي بطاقة بحرف أو مساحة فارغة.')}
        <button class="rs-row" id="rsClearImageCache" type="button"><span><b>إعادة جلب الصور</b><small>امسح اختيارات الإنترنت المخزنة وأعد حلها.</small></span><em>↻</em></button>
      </div></section>
      <section class="rs-group"><h2>التشغيل</h2><div class="rs-panel">
        <div class="rs-row static"><span><b>الخلفية وشاشة القفل</b><small>${'mediaSession' in navigator?'Media Session مدعوم على هذا الجهاز.':'المتصفح لا يعلن دعم Media Session.'}</small></span><em>${'mediaSession' in navigator?'✓':'—'}</em></div>
        <div class="rs-row static"><span><b>المصدر الأفضل تلقائيًا</b><small>النسخة المحلية ثم المفضلة ثم أفضل صوت مباشر.</small></span><em>تلقائي</em></div>
      </div></section>
      <section class="rs-group"><h2>التخزين والمكتبة</h2><div class="rs-panel">
        <div class="rs-row static"><span><b>مساحة تلاوات</b><small id="rsStorageText">جارٍ الحساب…</small></span><em id="rsStoragePct"></em></div>
        <button class="rs-row" id="rsExport" type="button"><span><b>تصدير بيانات المكتبة</b><small>يحفظ الفهرس والتفضيلات، وليس ملفات الصوت الكبيرة.</small></span><em>↓</em></button>
        <button class="rs-row" id="rsImport" type="button"><span><b>استعادة بيانات المكتبة</b><small>استرجع ملف JSON سابق.</small></span><em>↑</em></button>
        <input id="rsImportInput" type="file" accept="application/json,.json" hidden>
      </div></section>
      <section class="rs-group"><h2>التطبيق</h2><div class="rs-panel">
        <button class="rs-row" id="rsInstall" type="button"><span><b>تثبيت تلاوات</b><small>شغله كتطبيق مستقل على جهازك.</small></span><em>＋</em></button>
        <div class="rs-row static"><span><b>هوية الواجهة</b><small>الكتالوج الجديد مع روح الواجهة القديمة؛ بدون حذف الإعدادات العملية.</small></span><em>2.0</em></div>
      </div></section>
    </div>
  </section>`;
}
function toggleRow(id,title,desc){ return `<label class="rs-row"><span><b>${title}</b><small>${desc}</small></span><input class="rs-toggle" type="checkbox" data-pref="${id}" ${prefs[id]?'checked':''}><i></i></label>`; }

function injectSettings(){
  if($('#restoredSettings')) return;
  const top=$('.top__inner'); const theme=$('#themeBtn');
  if(top&&theme){ const b=document.createElement('button'); b.className='round rs-settings-btn'; b.id='restoredSettingsBtn'; b.type='button'; b.setAttribute('aria-label','الإعدادات'); b.innerHTML=gearIcon(); theme.insertAdjacentElement('afterend',b); b.onclick=openSettings; }
  document.body.insertAdjacentHTML('beforeend',settingsMarkup());
  $('.rs-close').onclick=closeSettings;
  $('#rsTheme').onclick=()=>{ $('#themeBtn')?.click(); setTimeout(syncSettings,40); };
  $$('.rs-toggle').forEach(input=>input.onchange=()=>{ prefs[input.dataset.pref]=input.checked; savePrefs(); imgCache={}; saveImageCache(); decorateAll(true); });
  $('#rsClearImageCache').onclick=()=>{ imgCache={}; saveImageCache(); decorateAll(true); toastLocal('سيتم جلب الصور من جديد.'); };
  $('#rsExport').onclick=exportLibrary; $('#rsImport').onclick=()=>$('#rsImportInput').click(); $('#rsImportInput').onchange=importLibrary;
  $('#rsInstall').onclick=async()=>{ if(installEvent){installEvent.prompt(); await installEvent.userChoice; installEvent=null;} else toastLocal('من قائمة كروم اختر «تثبيت التطبيق» إذا لم يظهر زر التثبيت.'); };
  syncSettings(); updateStorage();
}
function openSettings(){ const s=$('#restoredSettings'); if(!s)return; s.hidden=false; requestAnimationFrame(()=>s.classList.add('open')); document.body.classList.add('rs-locked'); syncSettings(); updateStorage(); }
function closeSettings(){ const s=$('#restoredSettings'); if(!s)return; s.classList.remove('open'); document.body.classList.remove('rs-locked'); setTimeout(()=>s.hidden=true,180); }
function syncSettings(){ const el=$('#rsThemeState'); if(el)el.textContent=document.documentElement.dataset.theme==='light'?'فاتح':'داكن'; $$('.rs-toggle').forEach(x=>x.checked=!!prefs[x.dataset.pref]); }

async function updateStorage(){
  try{ const {usage=0,quota=0}=await navigator.storage.estimate(); const f=n=>{const u=['B','KB','MB','GB'];let i=0;while(n>=1024&&i<3){n/=1024;i++}return `${n.toFixed(i?1:0)} ${u[i]}`}; const t=$('#rsStorageText'); const p=$('#rsStoragePct'); if(t)t.textContent=`${f(usage)} مستخدمة من ${f(quota)}`; if(p)p.textContent=quota?`${Math.round(usage/quota*100)}%`:''; }catch{}
}

function openTilawatDb(){ return new Promise((resolve,reject)=>{ const r=indexedDB.open('tilawat'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); }); }
async function readTracks(){ const db=await openTilawatDb(); return new Promise((resolve,reject)=>{ const tx=db.transaction('tracks','readonly'); const r=tx.objectStore('tracks').getAll(); r.onsuccess=()=>resolve(r.result||[]); r.onerror=()=>reject(r.error); }); }
async function exportLibrary(){ try{ const tracks=await readTracks(); const payload={app:'tilawat',version:4,exportedAt:new Date().toISOString(),tracks:tracks.map(({localAudioKey,coverKey,...rest})=>rest),ui:prefs}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`tilawat-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toastLocal(`صُدّرت ${tracks.length} تلاوة.`);}catch{toastLocal('تعذر تصدير المكتبة.')} }
async function importLibrary(e){ const file=e.target.files?.[0]; e.target.value=''; if(!file)return; try{const data=JSON.parse(await file.text()); if(!Array.isArray(data.tracks))throw 0; const db=await openTilawatDb(); const tx=db.transaction('tracks','readwrite'); const s=tx.objectStore('tracks'); data.tracks.forEach(t=>s.put(t)); await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)}); toastLocal('تمت الاستعادة. أعد فتح التطبيق لتحديث كل الرفوف.');}catch{toastLocal('ملف النسخة غير صالح.')} }

function toastLocal(text){ let t=$('#rsToast'); if(!t){t=document.createElement('div');t.id='rsToast';t.className='rs-toast';document.body.append(t)}t.textContent=text;t.classList.add('show');clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),2400); }

function reciterFromMedia(card){ const p=card.querySelector('p')?.textContent||''; return p.split('·')[0].trim(); }
function surahFromCard(card){ const h=card.querySelector('h3,b')?.textContent||''; return h.replace(/^سورة\s+/,'').split('—')[0].trim(); }

async function decorateReciterCard(card,force=false){
  const name=card.querySelector('h3')?.textContent?.trim(); const art=card.querySelector('.reciter-art'); if(!name||!art)return;
  const sig=`${name}|${prefs.reciterImages}|${prefs.internetImages}`; if(!force&&art.dataset.visualSig===sig)return; art.dataset.visualSig=sig;
  art.classList.add('has-image'); art.innerHTML='<span class="rs-img-skeleton"></span>';
  const src=await imageFor({reciter:name,seed:`reciter|${name}`}); if(art.dataset.visualSig!==sig)return;
  art.innerHTML=`<img src="${escapeAttr(src)}" alt="" loading="lazy">`;
}
async function decorateMediaCard(card,force=false){
  const img=card.querySelector('.art img'); if(!img)return; const reciter=reciterFromMedia(card); const surah=surahFromCard(card); const current=img.getAttribute('src')||'';
  if(!force&&!isProcedural(current)&&!current.includes('default.jpg'))return;
  const sig=`${reciter}|${surah}|${card.dataset.play||''}`; if(!force&&img.dataset.visualSig===sig)return; img.dataset.visualSig=sig;
  const src=await imageFor({reciter,surah,seed:sig,manual:current}); if(img.dataset.visualSig===sig&&src)img.src=src;
}
async function decorateSurahButton(btn,force=false){
  const name=btn.querySelector('b')?.textContent?.trim(); if(!name)return; const sig=`surah|${name}`; if(!force&&btn.dataset.visualSig===sig)return; btn.dataset.visualSig=sig;
  let thumb=btn.querySelector('.entity-thumb'); if(!thumb){thumb=document.createElement('span');thumb.className='entity-thumb';btn.prepend(thumb)}
  const src=await imageFor({surah:name,seed:sig}); if(btn.dataset.visualSig===sig)thumb.style.backgroundImage=`url("${String(src).replace(/"/g,'%22')}")`;
}
async function decorateBrowse(force=false){
  const mono=$('#browseMono'), title=$('#browseTitle'); if(!mono||!title||!title.textContent.trim())return;
  const kicker=$('#browseKicker')?.textContent||''; const isReciter=/قارئ|القارئ/.test(kicker)||!/^سورة/.test(title.textContent); const reciter=isReciter?title.textContent.trim():''; const surah=isReciter?'':title.textContent.replace(/^سورة\s+/,'').trim();
  const sig=`browse|${reciter}|${surah}`; if(!force&&mono.dataset.visualSig===sig)return; mono.dataset.visualSig=sig; mono.classList.add('has-image');
  const src=await imageFor({reciter,surah,seed:sig}); if(mono.dataset.visualSig===sig)mono.innerHTML=`<img src="${escapeAttr(src)}" alt="">`;
}
function escapeAttr(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}

function decorateAll(force=false){
  $$('.reciter-card').forEach(x=>decorateReciterCard(x,force));
  $$('.media-card').forEach(x=>decorateMediaCard(x,force));
  $$('.entity-btn[data-surah]').forEach(x=>decorateSurahButton(x,force));
  decorateBrowse(force);
}

function injectPlayerUtilities(){
  const actions=$('.player-actions'); if(!actions||$('#rsSleep'))return;
  const repeat=document.createElement('button'); repeat.className='chip'; repeat.id='rsRepeat'; repeat.type='button'; repeat.textContent='تكرار'; repeat.setAttribute('aria-pressed','false');
  const sleep=document.createElement('button'); sleep.className='chip'; sleep.id='rsSleep'; sleep.type='button'; sleep.textContent='مؤقت';
  actions.append(repeat,sleep);
  repeat.onclick=()=>{const audio=$('#audioEngine');if(!audio)return;audio.loop=!audio.loop;repeat.setAttribute('aria-pressed',String(audio.loop));repeat.textContent=audio.loop?'تكرار ✓':'تكرار';};
  sleep.onclick=()=>{const audio=$('#audioEngine');if(!audio)return;const options=[15,30,45,60,0];const current=Number(sleep.dataset.min||0);const idx=Math.max(0,options.indexOf(current));const min=options[(idx+1)%options.length];clearTimeout(sleepTimer);sleep.dataset.min=String(min);if(min){sleep.textContent=`مؤقت ${min}د`;sleepTimer=setTimeout(()=>{audio.pause();sleep.textContent='مؤقت';sleep.dataset.min='0';toastLocal('انتهى مؤقت النوم.');},min*60000);}else{sleep.textContent='مؤقت';toastLocal('أوقف مؤقت النوم.');}};
}

function boot(){
  ensureCss(); injectSettings(); injectPlayerUtilities(); decorateAll();
  const obs=new MutationObserver(()=>{decorateAll();injectPlayerUtilities();}); obs.observe(document.body,{childList:true,subtree:true});
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});
  addEventListener('appinstalled',()=>{installEvent=null;toastLocal('تم تثبيت تلاوات.');});
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();

export { imageFor, decorateAll };
