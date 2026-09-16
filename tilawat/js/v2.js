import { allTracks, putTrack, putBlob, getBlob, newId, getPref, setPref } from './store.js';
import { SURAHS, SOURCE_REGISTRY, normalizeArabic, tokens, detectSource, youtubeId, youtubeMeta, normalizeVariant, migrateTrack, resolveVariant, variantScore } from './catalog/core.js';
import { fetchReciters, hydrateArchive1425, catalogRecitation, reciterMoshafs, reciterSurahs, hasSurah } from './catalog/mp3quran.js';
import { Player, bindMediaSession, prewarmYouTube } from './player.js';
import { dossariImage, imageFor, QURAN_FALLBACK } from './ui-dossari-only.js';
import { makeSortable } from './reorder.js';
import { queueTargetIndex, findEquivalentTrack, mergeVariants, recordMatchesQuery, catalogRefKey } from './app-logic.js';
import './classic-ui.js';

const $=id=>document.getElementById(id);
const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime=s=>{if(!Number.isFinite(s)||s<0)return'0:00';s=Math.floor(s);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60,p=n=>String(n).padStart(2,'0');return h?`${h}:${p(m)}:${p(x)}`:`${m}:${p(x)}`};
const fmtBytes=n=>{if(!n)return'';const u=['ب','ك.ب','م.ب','غ.ب'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return`${n>=10||i===0?Math.round(n):n.toFixed(1)} ${u[i]}`};
const PREF_PROGRESS='tilawat-catalog-progress-v2';
const PREF_LAST='tilawat-last-listened-v2';
const PREF_ORDER='tilawat-library-order-v2';
const PREF_VARIANTS='tilawat-catalog-variant-prefs-v1';
const YALDOSRY_HOST=/^(?:www\.)?yaldosry\.com$/i;

const state={
  tab:'home',librarySeg:'all',local:[],reciters:[],catalogReady:false,catalogArchiveReady:false,catalogError:false,
  current:null,currentVariant:null,queue:[],queueIndex:-1,speed:1,toastTimer:null,coverUrls:new Map(),lastProgressWrite:0,
  repeat:false,sleepTimer:null,catalogProgress:{},lastListened:null,libraryOrder:[],catalogVariantPrefs:{},editMode:false,sortableMounted:false,
  seeking:false,lastSeekValue:0,downloadController:null,pendingYoutubeMeta:null,coverModeTouched:false,fallbackTriedFor:'',modalReturnFocus:new WeakMap()
};
const player=new Player('ytMount');
/* Keep one long-lived media element eligible for continuous background playback.
   Native looping is always off; repeat is owned only by the explicit app control. */
player.audio.loop=false;player.audio.autoplay=true;player.audio.preload='auto';player.audio.playsInline=true;

function toast(msg,ms=2600){const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('on');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>el.classList.remove('on'),ms)}
function playSvg(){return'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 19 12 7 19.5z"/></svg>'}
function eqSvg(){return'<span class="tilawat-card-eq" aria-hidden="true"><i></i><i></i><i></i></span>'}
function iconPlay(paused=true){return paused?'<path d="M7 4.5 19 12 7 19.5z" fill="currentColor" stroke="none"/>':'<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/>'}
function setPlayIcons(){const h=iconPlay(!player.playing);$('miniPlayIcon').innerHTML=h;$('mainPlayIcon').innerHTML=h;document.documentElement.classList.toggle('is-audio-playing',player.playing);syncCurrentCards()}
function theme(next){document.documentElement.dataset.theme=next;localStorage.setItem('tilawat-theme',next);const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=next==='dark'?'#08090A':'#F7F7F5'}
$('themeBtn').onclick=()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';$('themeBtn').animate?.([{transform:'rotate(0) scale(1)'},{transform:'rotate(16deg) scale(.9)'},{transform:'rotate(0) scale(1)'}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});if(document.startViewTransition)document.startViewTransition(()=>theme(next));else theme(next)};

document.addEventListener('error',event=>{const img=event.target;if(!(img instanceof HTMLImageElement)||img.dataset.fallbackUsed==='1')return;img.dataset.fallbackUsed='1';img.src=img.dataset.fallback||QURAN_FALLBACK},true);

function fallbackCover(rec){return imageFor({reciter:rec?.reciter,surah:rec?.surah,seed:rec?.id})||QURAN_FALLBACK}
async function resolveCover(rec){
  if(rec._coverResolved)return rec._coverResolved;
  if(rec.coverKey){try{const blob=await getBlob(rec.coverKey);if(blob){const u=URL.createObjectURL(blob);state.coverUrls.set(rec.id,u);rec._coverResolved=u;return u}}catch{}}
  if(rec.coverMode==='local'){rec._coverResolved=fallbackCover(rec);return rec._coverResolved}
  const thumb=rec.sourceThumbnail||(rec.variants||[]).find(v=>v.thumbnail)?.thumbnail||'';
  if(rec.coverMode==='youtube'&&thumb){rec._coverResolved=thumb;return thumb}
  rec._coverResolved=rec.cover||thumb||fallbackCover(rec);return rec._coverResolved;
}
function coverSync(rec){if(rec?.coverMode==='local')return rec._coverResolved||fallbackCover(rec);return rec?._coverResolved||rec?.cover||rec?.sourceThumbnail||(rec?.variants||[]).find(v=>v.thumbnail)?.thumbnail||fallbackCover(rec)}
function sourceLabel(v){return SOURCE_REGISTRY[v?.provider]?.label||v?.provider||'مصدر'}
function recSubtitle(r){return[r.reciter,r.surah,r.year?`${r.year}هـ`:'',r.collection].filter(Boolean).join(' · ')}
function isOffline(rec){return(rec.variants||[]).some(v=>v.localAudioKey)}
function isPersisted(rec){return!!rec&&!rec.catalogOnly}
function currentActionKey(){if(!state.current)return'';return isPersisted(state.current)?`local:${state.current.id}`:state.current.catalogRef?`catalog:${catalogRefKey(state.current.catalogRef)}`:`id:${state.current.id}`}
function elementActionKey(el){if(el?.dataset?.play)return`local:${el.dataset.play}`;if(el?.dataset?.catalogPlay)return`catalog:${el.dataset.catalogPlay}`;return''}
function syncCurrentCards(){const key=currentActionKey();$$('[data-play],[data-catalog-play]').forEach(el=>el.classList.toggle('is-current',!!key&&elementActionKey(el)===key))}

function applyCatalogState(rec){if(!rec?.catalogOnly)return rec;const p=state.catalogProgress[rec.id];if(p){rec.lastPosition=Number(p.lastPosition||0);rec.lastPlayedAt=Number(p.lastPlayedAt||0)}const pref=state.catalogVariantPrefs[rec.id];if(pref)rec.preferredVariantId=pref;return rec}
async function migrateLibrary(){
  const raw=await allTracks();state.local=[];
  for(const row of raw){const rec=migrateTrack(row);state.local.push(rec);if(row.schemaVersion!==4||!Array.isArray(row.variants))await putTrack(rec);await resolveCover(rec)}
  state.local.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
  const known=new Set(state.local.map(x=>x.id));state.libraryOrder=state.libraryOrder.filter(id=>known.has(id));for(const rec of state.local)if(!state.libraryOrder.includes(rec.id))state.libraryOrder.push(rec.id);
  setPref(PREF_ORDER,state.libraryOrder).catch(()=>{});
}

function actionAttr(rec){if(isPersisted(rec))return`data-play="${esc(rec.id)}"`;if(rec.catalogRef)return`data-catalog-play="${rec.catalogRef.reciterId}|${rec.catalogRef.moshafId}|${rec.catalogRef.surahId}"`;return`data-play="${esc(rec.id)}"`}
function cardHTML(rec,{tag=''}={}){
  const cover=coverSync(rec),fallback=fallbackCover(rec),status=tag||(rec.rare?'نادرة':isOffline(rec)?'بلا نت':''),current=elementActionKey({dataset:isPersisted(rec)?{play:rec.id}:rec.catalogRef?{catalogPlay:catalogRefKey(rec.catalogRef)}:{play:rec.id}})===currentActionKey();
  return`<button class="media-card ${current?'is-current':''}" type="button" ${actionAttr(rec)}><div class="art"><img src="${esc(cover)}" data-fallback="${esc(fallback)}" alt="" loading="lazy">${status?`<span class="tag ${status==='نادرة'?'gold':''}">${esc(status)}</span>`:''}<span class="art__play">${playSvg()}${eqSvg()}</span></div><h3>${esc(rec.title||`سورة ${rec.surah}`||'تلاوة')}</h3><p>${esc(recSubtitle(rec))}</p></button>`;
}
function reciterCardHTML(r){const m=reciterMoshafs(r),cover=imageFor({reciter:r.name,seed:`reciter|${r.name}`});return`<button class="reciter-card" data-reciter="${r.id}" type="button"><div class="reciter-art"><img src="${cover}" data-fallback="${fallbackCover({reciter:r.name,id:r.id})}" alt=""></div><div class="reciter-card__text"><h3>${esc(r.name)}</h3><p>${m.length} مصحف · ${Math.max(0,...m.map(x=>Number(x.surah_total||0)))} سورة</p></div></button>`}
function shelf(title,body,sub='',more=''){return`<section class="shelf"><div class="shelf__head"><div><h2>${esc(title)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div>${more?`<button class="more" data-more="${esc(more)}">عرض الكل</button>`:''}</div>${body}</section>`}
function rail(items){return`<div class="rail">${items.join('')}</div>`}
function greeting(){const h=new Date().getHours();return h<12?'صباح الخير':h<18?'مساء الخير':'مساء النور'}
function catalogueSet(moshaf,ids){const reciter=state.reciters[0];if(!reciter||!moshaf)return[];return ids.filter(id=>hasSurah(moshaf,id)).map(id=>applyCatalogState(catalogRecitation(reciter,moshaf,id)))}
function featuredReciters(){return state.reciters.slice(0,12)}

function renderLastListened(){
  const slot=$('lastListenedSlot');if(!slot)return;const d=state.lastListened;if(!d){slot.innerHTML='';return}
  const action=d.kind==='catalog'?`data-catalog-play="${esc(d.key)}"`:`data-play="${esc(d.key)}"`;
  const fallback=esc(d.fallback||QURAN_FALLBACK);
  slot.innerHTML=`<button class="last-listened-card" type="button" ${action}><span class="last-listened-card__art"><img src="${esc(d.cover||fallback)}" data-fallback="${fallback}" alt=""></span><span class="last-listened-card__text"><span class="last-listened-card__label">آخر سورة سمعتها</span><b>${esc(d.title||'آخر تلاوة')}</b><small>${esc(d.sub||'تابع من حيث توقفت')}</small></span><span class="last-listened-card__play" aria-hidden="true">${playSvg()}</span></button>`;
}
function renderHome(){
  $('homeGreeting').textContent=greeting();renderLastListened();
  const stats=['ياسر الدوسري','114 سورة'];if(state.local.length)stats.push(`${state.local.length} محفوظة`);stats.push('تشغيل بالخلفية');$('heroStats').innerHTML=stats.map(s=>`<span>${esc(s)}</span>`).join('');
  const blocks=[];
  if(state.local.length)blocks.push(shelf('أضيف حديثًا',rail(state.local.slice(0,10).map(cardHTML))));
  if(state.catalogReady){
    const reciter=state.reciters[0],moshafs=reciterMoshafs(reciter),archive=moshafs.find(m=>Number(m.id)===1425),murattal=moshafs.find(m=>Number(m.id)===1);
    if(archive){const ids=reciterSurahs(reciter,archive).map(s=>s.id),tracks=catalogueSet(archive,ids.slice(0,12));if(tracks.length)blocks.push(shelf('رمضان 1425هـ',rail(tracks.map(r=>cardHTML(r,{tag:'نادرة'}))),'تسجيلات الأرشيف القديمة'))}
    const murattalTracks=catalogueSet(murattal,[18,36,55,56,67,78,112,113,114,2,19,20]);if(murattalTracks.length)blocks.push(shelf('المصحف المرتل',rail(murattalTracks.map(cardHTML)),'تلاوات مختارة بصوت ياسر الدوسري'));
    const featured=featuredReciters();
    blocks.push(shelf('القراء',rail(featured.map(reciterCardHTML)),'المصاحف والتسجيلات',state.reciters.length>featured.length?'reciters':''));
  }else blocks.push(shelf(state.catalogError?'تعذر تحميل الكتالوج':'جارٍ تجهيز التلاوات',''));
  const rare=state.local.filter(r=>r.rare).slice(0,10);if(rare.length)blocks.push(shelf('كنوز الأرشيف',rail(rare.map(r=>cardHTML(r,{tag:'نادرة'})))));
  $('homeShelves').innerHTML=blocks.join('');syncCurrentCards();
}

function orderedLibrary(list){if(state.librarySeg==='recent')return[...list].sort((a,b)=>(b.lastPlayedAt||0)-(a.lastPlayedAt||0));const rank=new Map(state.libraryOrder.map((id,i)=>[id,i]));return[...list].sort((a,b)=>(rank.get(a.id)??999999)-(rank.get(b.id)??999999))}
function libraryRowHTML(rec){
  const cover=coverSync(rec),fallback=fallbackCover(rec),current=`local:${rec.id}`===currentActionKey();
  return`<div class="media-card library-row ${current?'is-current':''}" data-play="${esc(rec.id)}" role="button" tabindex="0" aria-label="تشغيل ${esc(rec.title||rec.surah||'التلاوة')}"><div class="art"><img src="${esc(cover)}" data-fallback="${esc(fallback)}" alt="" loading="lazy"></div><h3>${esc(rec.title||`سورة ${rec.surah}`)}</h3><p>${esc(recSubtitle(rec))}</p><button class="library-row__play" type="button" aria-label="تشغيل">${playSvg()}${eqSvg()}</button><button class="library-drag-handle" type="button" aria-label="تحريك ${esc(rec.title||rec.surah||'التلاوة')}" title="اسحب لإعادة الترتيب">≡</button></div>`;
}
function createLibraryRow(rec){
  const box=document.createElement('div');box.innerHTML=libraryRowHTML(rec);return box.firstElementChild;
}
function syncLibraryRow(row,rec){
  const title=rec.title||`سورة ${rec.surah}`,sub=recSubtitle(rec),cover=coverSync(rec),fallback=fallbackCover(rec),current=`local:${rec.id}`===currentActionKey();
  row.dataset.play=rec.id;row.classList.toggle('is-current',current);row.setAttribute('aria-label',`تشغيل ${title||rec.surah||'التلاوة'}`);
  const img=row.querySelector('.art img');if(img){if(img.dataset.fallback!==fallback)img.dataset.fallback=fallback;if((img.getAttribute('src')||'')!==cover){delete img.dataset.fallbackUsed;img.src=cover}}
  const heading=row.querySelector('h3');if(heading&&heading.textContent!==title)heading.textContent=title;
  const meta=row.querySelector('p');if(meta&&meta.textContent!==sub)meta.textContent=sub;
  const handle=row.querySelector('.library-drag-handle');if(handle){handle.setAttribute('aria-label',`تحريك ${title||rec.surah||'التلاوة'}`);handle.title='اسحب لإعادة الترتيب'}
}
function syncLibraryChrome(list,s){
  $('libraryCount').textContent=`${list.length} تسجيل`;$('libraryEmpty').classList.toggle('hidden',!!list.length);$$('#librarySegs button').forEach(b=>b.classList.toggle('on',b.dataset.seg===s));$('libraryView').classList.toggle('library-editing',state.editMode);$('libraryEditToggle')?.setAttribute('aria-pressed',String(state.editMode));
}
function renderLibrary(){
  let list=[...state.local],s=state.librarySeg;if(s==='favorite')list=list.filter(r=>r.favorite);else if(s==='offline')list=list.filter(isOffline);else if(s==='rare')list=list.filter(r=>r.rare);list=orderedLibrary(list);
  const grid=$('libraryGrid');grid.classList.add('library-list');const existing=new Map($$('.library-row[data-play]',grid).map(row=>[row.dataset.play,row])),keep=new Set();
  list.forEach((rec,index)=>{let row=existing.get(rec.id);if(row)syncLibraryRow(row,rec);else{row=createLibraryRow(rec);syncLibraryRow(row,rec)}keep.add(rec.id);if(grid.children[index]!==row)grid.insertBefore(row,grid.children[index]||null)});
  for(const[id,row]of existing)if(!keep.has(id))row.remove();syncLibraryChrome(list,s);mountSortable();syncCurrentCards();
}
function persistOrderFromDom(){state.libraryOrder=$$('#libraryGrid .library-row').map(x=>x.dataset.play).filter(Boolean);for(const rec of state.local)if(!state.libraryOrder.includes(rec.id))state.libraryOrder.push(rec.id);setPref(PREF_ORDER,state.libraryOrder).catch(()=>{})}
function moveLibraryRow(row,delta){const grid=$('libraryGrid'),rows=$$('.library-row',grid),from=rows.indexOf(row),to=from+delta;if(from<0||to<0||to>=rows.length)return;if(delta>0)rows[to].after(row);else rows[to].before(row);persistOrderFromDom();row.querySelector('.library-drag-handle')?.focus()}
function mountSortable(){
  if(state.sortableMounted)return;state.sortableMounted=true;
  makeSortable($('libraryGrid'),{handle:'.library-drag-handle',item:'.library-row',onDrop:()=>persistOrderFromDom()});
}
$('libraryEditToggle').onclick=()=>{state.editMode=!state.editMode;if(state.editMode&&state.librarySeg!=='all'){state.librarySeg='all';renderLibrary();return}syncLibraryChrome(orderedLibrary(state.local),state.librarySeg)};
$('libraryGrid').addEventListener('keydown',e=>{const row=e.target.closest('.library-row');if(!row)return;if(e.target.closest('.library-drag-handle')&&state.editMode&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();moveLibraryRow(row,e.key==='ArrowUp'?-1:1);return}if(!state.editMode&&(e.key==='Enter'||e.key===' ')){e.preventDefault();playByElement(row)}});

function allCatalogRecords(){const out=[];for(const r of state.reciters)for(const m of reciterMoshafs(r))for(const s of reciterSurahs(r,m))out.push(applyCatalogState(catalogRecitation(r,m,s.id)));return out}
function renderSearch(q=''){
  const root=$('searchResults'),ts=tokens(q);if(!ts.length){root.innerHTML='<div class="empty"><h2>ابحث كما تتكلم</h2><p>مثال: «ياسر 1425 الكهف». الاسم والسنة والسورة تعمل معًا.</p></div>';return}
  const local=state.local.filter(r=>recordMatchesQuery(r,ts)).slice(0,30);
  const catalog=state.catalogReady?allCatalogRecords().filter(r=>recordMatchesQuery(r,ts)&&!findEquivalentTrack(state.local,r)).slice(0,30):[];
  const reciters=state.reciters.filter(r=>ts.some(t=>normalizeArabic(r.name).includes(t))).slice(0,12);
  const surahs=SURAHS.map((name,i)=>({id:i+1,name})).filter(s=>ts.some(t=>normalizeArabic(s.name).includes(t))).slice(0,18);
  let html='';if(local.length)html+=shelf('من مكتبتك',`<div class="library-grid">${local.map(cardHTML).join('')}</div>`);if(catalog.length)html+=shelf('من الكتالوج',`<div class="library-grid">${catalog.map(cardHTML).join('')}</div>`);if(reciters.length)html+=shelf('القراء',rail(reciters.map(reciterCardHTML)));if(surahs.length)html+=shelf('السور',`<div class="entity-grid">${surahs.map(s=>`<button class="entity-btn" data-surah="${s.id}"><span class="n">${String(s.id).padStart(3,'0')}</span><span><b>${esc(s.name)}</b><small>استعرض التسجيلات</small></span></button>`).join('')}</div>`);
  root.innerHTML=html||'<div class="empty"><h2>لا توجد نتيجة مطابقة</h2><p>جرّب اسم القارئ أو السورة أو السنة بشكل أقصر.</p></div>';syncCurrentCards();
}

function showTab(tab){state.tab=tab;['home','search','library'].forEach(t=>$(t+'View').classList.toggle('hidden',t!==tab));$$('.tab').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});if(tab==='library')renderLibrary();if(tab==='search'){renderSearch($('searchInput').value);setTimeout(()=>$('searchInput').focus(),80)}window.scrollTo({top:0,behavior:'auto'})}
document.querySelector('.tabbar').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)});$('brand').onclick=()=>showTab('home');$('libraryEmptyBrowse').onclick=()=>showTab('home');$('libraryEmptyAdd').onclick=()=>$('addBtn').click();$('searchInput').addEventListener('input',e=>renderSearch(e.target.value));$('librarySegs').addEventListener('click',e=>{const b=e.target.closest('[data-seg]');if(!b)return;state.librarySeg=b.dataset.seg;renderLibrary()});

function findRec(id){return state.local.find(r=>r.id===id)||(state.current?.id===id?state.current:null)}
function queueKey(rec){if(!rec)return'';if(isPersisted(rec))return`local:${rec.id}`;if(rec.catalogRef)return`catalog:${catalogRefKey(rec.catalogRef)}`;return`id:${rec.id||''}`}
function catalogRecordFromAction(value=''){const [rid,mid,sid]=String(value).split('|').map(Number),r=state.reciters.find(x=>Number(x.id)===rid),m=reciterMoshafs(r).find(x=>Number(x.id)===mid);return r&&m?applyCatalogState(catalogRecitation(r,m,sid)):null}
function recordFromAction(el){if(el?.dataset?.play)return findRec(el.dataset.play);if(el?.dataset?.catalogPlay)return catalogRecordFromAction(el.dataset.catalogPlay);return null}
function fullCatalogQueue(rec){const ref=rec?.catalogRef;if(!ref)return[];const r=state.reciters.find(x=>Number(x.id)===Number(ref.reciterId)),m=reciterMoshafs(r).find(x=>Number(x.id)===Number(ref.moshafId));return r&&m?reciterSurahs(r,m).map(s=>applyCatalogState(catalogRecitation(r,m,s.id))):[]}
function contextualQueue(el,rec){
  const root=el?.closest?.('#libraryGrid,.rail,.library-grid,.reciter-surah-grid,.result-list');
  let list=root?$$('[data-play],[data-catalog-play]',root).map(recordFromAction).filter(Boolean):[];
  if(list.length<2)list=rec?.catalogRef?fullCatalogQueue(rec):isPersisted(rec)?orderedLibrary(state.local):list;
  const seen=new Set();list=list.filter(item=>{const key=queueKey(item);if(!key||seen.has(key))return false;seen.add(key);return true});
  return list;
}
function setQueueFromElement(el,rec){const list=contextualQueue(el,rec),key=queueKey(rec),i=list.findIndex(x=>queueKey(x)===key);if(i>=0){state.queue=list;state.queueIndex=i}else{state.queue=[rec];state.queueIndex=0}}
function openBrowse(title,kicker,meta,body,mono='ق'){$('browseTitle').textContent=title;$('browseKicker').textContent=kicker;$('browseMeta').textContent=meta||'';const visual=/ياسر|سورة|القراء|القرآن/.test(`${title} ${kicker}`);$('browseMono').innerHTML=visual?`<img src="${dossariImage(`browse|${title}`)}" data-fallback="${QURAN_FALLBACK}" alt="">`:esc(mono);$('browseBody').innerHTML=body;$('browsePage').scrollTop=0;$('browsePage').classList.remove('hidden');animateEnter($('browsePage'))}
$('browseClose').onclick=()=>$('browsePage').classList.add('hidden');
function openAllReciters(){openBrowse('كل القراء','كتالوج القرآن',`${state.reciters.length} قارئ`,`<div class="library-grid">${state.reciters.map(reciterCardHTML).join('')}</div>`,'ق')}
function openAllSurahs(){openBrowse('سور القرآن','114 سورة','اختر سورة',`<div class="surah-list">${SURAHS.map((n,i)=>`<button class="surah-row" data-surah="${i+1}"><span class="num">${String(i+1).padStart(3,'0')}</span><b>${esc(n)}</b><span>كل التسجيلات</span></button>`).join('')}</div>`,'س')}
function openLocalGroup(title,list){openBrowse(title,'من مكتبتك',`${list.length} تسجيل`,`<div class="library-grid">${list.map(cardHTML).join('')}</div>`,title.trim()[0]||'ت')}
function renderMoshafSurahs(r,m){const ss=reciterSurahs(r,m);return`<div class="surah-list reciter-surah-grid">${ss.map(s=>{const rec=applyCatalogState(catalogRecitation(r,m,s.id)),cover=fallbackCover(rec),key=`${r.id}|${m.id}|${s.id}`,current=`catalog:${key}`===currentActionKey();return`<button class="surah-row reciter-surah-card ${current?'is-current':''}" data-catalog-play="${key}" type="button" aria-label="تشغيل سورة ${esc(s.name)}"><span class="surah-card__art"><img src="${esc(cover)}" alt="" loading="lazy"></span><span class="surah-card__number">${String(s.id).padStart(3,'0')}</span><span class="surah-card__meta"><b>سورة ${esc(s.name)}</b><small>${esc(m.name||'المصحف')}</small></span><span class="surah-card__play">${playSvg()}<span class="surah-card__eq" aria-hidden="true"><i></i><i></i><i></i></span></span></button>`}).join('')}</div>`}
function openReciter(id){const r=state.reciters.find(x=>Number(x.id)===Number(id));if(!r)return;const ms=reciterMoshafs(r);if(!ms.length)return;const tabs=ms.map((m,i)=>`<button class="${i===0?'on':''}" data-moshaf-index="${i}">${esc(m.name||`مصحف ${i+1}`)}</button>`).join('');openBrowse(r.name,'صفحة القارئ',`${ms.length} مصحف`,`<div class="moshaf-tabs" id="moshafTabs">${tabs}</div><div id="moshafBody">${renderMoshafSurahs(r,ms[0])}</div>`,(r.name||'ق')[0]);$('moshafTabs').onclick=e=>{const b=e.target.closest('[data-moshaf-index]');if(!b)return;const i=Number(b.dataset.moshafIndex);$$('#moshafTabs button').forEach(x=>x.classList.toggle('on',x===b));$('moshafBody').innerHTML=renderMoshafSurahs(r,ms[i]);syncCurrentCards()}}
function openSurah(id){const name=SURAHS[id-1],available=[];for(const r of state.reciters)for(const m of reciterMoshafs(r))if(hasSurah(m,id))available.push({r,m});openBrowse(`سورة ${name}`,'صفحة السورة',`${available.length} تسجيل متاح`,`<div class="result-list">${available.map(({r,m})=>`<button class="result-row" data-catalog-play="${r.id}|${m.id}|${id}"><img src="${dossariImage(`surah|${name}|${m.id}`)}" data-fallback="${QURAN_FALLBACK}" alt=""><span><b>${esc(r.name)}</b><small>${esc(m.name||'')}</small></span><span class="row-play">▶</span></button>`).join('')}</div>`,'س')}

async function playByElement(el){
  if(state.editMode&&el.closest('#libraryGrid'))return;
  if(el.dataset.play){const rec=findRec(el.dataset.play);if(rec){setQueueFromElement(el,rec);await playRecitation(rec,null,el.querySelector?.('.art')||el,{open:true})}return}
  if(el.dataset.catalogPlay){const rec=catalogRecordFromAction(el.dataset.catalogPlay);if(!rec){toast('الكتالوج لم يكتمل بعد.');return}await resolveCover(rec);setQueueFromElement(el,rec);await playRecitation(rec,null,el,{open:true})}
}
document.addEventListener('click',async e=>{
  const handle=e.target.closest('.library-drag-handle');if(handle){e.preventDefault();e.stopPropagation();return}
  const action=e.target.closest('[data-play],[data-catalog-play]');if(action){await playByElement(action);return}
  const r=e.target.closest('[data-reciter]');if(r){openReciter(Number(r.dataset.reciter));return}
  const s=e.target.closest('[data-surah]');if(s){openSurah(Number(s.dataset.surah));return}
  const y=e.target.closest('[data-year]');if(y){openLocalGroup('السنة '+y.dataset.year+'هـ',state.local.filter(x=>x.year===y.dataset.year));return}
  const close=e.target.closest('[data-close]');if(close){closeDialog($(close.dataset.close));return}
  const more=e.target.closest('[data-more]');if(more?.dataset.more==='reciters')openAllReciters();else if(more?.dataset.more==='surahs')openAllSurahs();
});

function playbackTrack(rec,v){const videoId=youtubeId(v?.sourceUrl||v?.videoUrl||v?.embedUrl||''),isYoutube=v?.provider==='youtube'||!!videoId,direct=String(v?.audioUrl||'').trim(),audioLike=/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(\?|#|$)/i.test(direct)||/^\/api\/yaldosry-audio/.test(direct),trusted=['mp3quran','archive','quranicaudio','islamway','tvquran','assabile','everyayah','surahquran','qurancom','yaldosry'].includes(v?.provider);return{...rec,localAudioKey:v?.localAudioKey||'',audioUrl:isYoutube?'':((audioLike||trusted)?direct:''),youtubeId:videoId||'',start:0,end:0}}
function localVariant(rec,excludeId=''){return(rec.variants||[]).find(v=>v.localAudioKey&&v.id!==excludeId)||null}
function chooseVariant(rec,explicit=null){if(explicit)return explicit;if(navigator.onLine===false){const local=localVariant(rec);if(local)return local}return resolveVariant(rec)}
function playableVariant(rec,explicit=null){const variant=chooseVariant(rec,explicit);if(!variant)return null;const playable=playbackTrack(rec,variant);return playable.localAudioKey||playable.audioUrl||playable.youtubeId?{variant,playable}:null}
async function updateLastListened(rec){const cover=await resolveCover(rec),action=isPersisted(rec)?{kind:'local',key:rec.id}:{kind:'catalog',key:catalogRefKey(rec.catalogRef)};state.lastListened={...action,title:rec.title||`سورة ${rec.surah}`,sub:recSubtitle(rec),cover,fallback:fallbackCover(rec),position:player.position||rec.lastPosition||0,at:Date.now()};setPref(PREF_LAST,state.lastListened).catch(()=>{});renderLastListened()}
async function playRecitation(rec,variant=null,originEl=null,{resume=true,open=false,priorityPlayback=false}={}){
  if(!rec)return;applyCatalogState(rec);const resolved=playableVariant(rec,variant);if(!resolved){toast('لا يوجد مصدر قابل للتشغيل لهذا التسجيل.');return}variant=resolved.variant;const playable=resolved.playable;
  const wasSame=queueKey(state.current)===queueKey(rec),key=queueKey(rec),queueIndex=state.queue.findIndex(x=>queueKey(x)===key);state.current=rec;state.currentVariant=variant;state.fallbackTriedFor='';if(queueIndex<0){state.queue=[rec];state.queueIndex=0}else state.queueIndex=queueIndex;
  rec.lastPlayedAt=Date.now();rec.playCount=(rec.playCount||0)+1;if(isPersisted(rec))putTrack(rec).catch(()=>{});
  const payload={...playable,lastPosition:resume?(wasSame?player.position:rec.lastPosition||0):0};
  if(priorityPlayback){const loading=player.load(payload,{autoplay:true,resume});player.setRate(state.speed);renderPlayer(originEl).catch(()=>{});updateLastListened(rec).catch(()=>{});if(open)openPlayer();await loading;setPlayIcons();return}
  await renderPlayer(originEl);await updateLastListened(rec);if(open)openPlayer();await player.load(payload,{autoplay:true,resume});player.setRate(state.speed);setPlayIcons();
}
async function renderPlayer(originEl=null){
  const r=state.current;if(!r)return;const c=await resolveCover(r),fallback=fallbackCover(r);for(const img of [$('miniCover'),$('playerCover')]){img.src=c;img.dataset.fallback=fallback;img.onerror=()=>{img.onerror=null;img.src=fallback}}
  $('miniTitle').textContent=r.title||`سورة ${r.surah}`;$('miniSub').textContent=recSubtitle(r);$('playerTitle').textContent=r.title||`سورة ${r.surah}`;$('playerSub').textContent=recSubtitle(r);$('playerKicker').textContent=[r.occasion,r.mosque,state.currentVariant?sourceLabel(state.currentVariant):''].filter(Boolean).join(' · ')||'قيد التشغيل';$('miniPlayer').classList.remove('hidden');$('app').classList.add('has-mini');renderVariants();renderRelated();const saved=isPersisted(r);$('saveRec').classList.toggle('on',saved);$('saveRec').setAttribute('aria-pressed',String(saved));$('saveRec').setAttribute('aria-label',saved?'محفوظة في المكتبة':'حفظ في المكتبة');$('saveRec').title=saved?'محفوظة في المكتبة':'حفظ في المكتبة';$('miniFav').classList.toggle('is-favorite',!!r.favorite);$('miniFav').setAttribute('aria-pressed',String(!!r.favorite));if(originEl&&!matchMedia('(prefers-reduced-motion: reduce)').matches)$('playerArtWrap').animate?.([{transform:'translateY(12px) scale(.96)',opacity:.55},{transform:'none',opacity:1}],{duration:360,easing:'cubic-bezier(.2,.8,.2,1)'});syncCurrentCards();
}
function animateEnter(el){if(!el||matchMedia('(prefers-reduced-motion: reduce)').matches)return;el.classList.remove('tilawat-enter');void el.offsetWidth;el.classList.add('tilawat-enter');setTimeout(()=>el.classList.remove('tilawat-enter'),500)}
function openPlayer(){if(!state.current)return;$('playerPage').scrollTop=0;$('playerPage').classList.remove('hidden');document.body.style.overflow='hidden';animateEnter($('playerPage'))}
function closePlayer(){$('playerPage').classList.add('hidden');document.body.style.overflow=''}
$('miniOpen').onclick=openPlayer;$('playerClose').onclick=closePlayer;$('miniPlay').onclick=$('mainPlay').onclick=()=>player.toggle();$('back10').onclick=()=>player.nudge(-10);$('forward10').onclick=()=>player.nudge(10);
function stepQueue(d,{wrap=true,priorityPlayback=false}={}){const len=state.queue.length;if(!len)return false;let cursor=state.queueIndex;for(let attempt=0;attempt<len;attempt++){const i=queueTargetIndex(cursor,len,d,{wrap});if(i<0)return false;const rec=state.queue[i],resolved=playableVariant(rec);if(resolved){state.queueIndex=i;playRecitation(rec,resolved.variant,null,{resume:false,open:false,priorityPlayback});return true}cursor=i;if(!wrap&&((d>0&&i>=len-1)||(d<0&&i<=0)))return false}return false}
$('prev').onclick=()=>stepQueue(-1,{wrap:true});$('next').onclick=()=>stepQueue(1,{wrap:true});
const speeds=[1,1.25,1.5,1.75,2,.75];$('speed').onclick=()=>{const i=speeds.indexOf(state.speed);state.speed=speeds[(i+1)%speeds.length];player.setRate(state.speed);$('speed').querySelector('[data-chip-value]').textContent=`${state.speed}×`;$('speed').setAttribute('aria-label',`سرعة التشغيل: ${state.speed}`)};$('repeat').onclick=()=>{state.repeat=!state.repeat;$('repeat').classList.toggle('on',state.repeat);$('repeat').setAttribute('aria-pressed',String(state.repeat));$('repeat').setAttribute('aria-label',state.repeat?'إلغاء تكرار السورة':'تكرار السورة');$('repeat').title=state.repeat?'إلغاء تكرار السورة':'تكرار السورة'};
const sleepValues=[15,30,45,60,0];let sleepIndex=-1;function syncSleepButton(min=0){const button=$('sleep'),badge=button.querySelector('[data-chip-value]');button.classList.toggle('on',!!min);button.setAttribute('aria-pressed',String(!!min));button.setAttribute('aria-label',min?`إيقاف التشغيل بعد ${min} دقيقة`:'مؤقت النوم');button.title=min?`بعد ${min} دقيقة`:'مؤقت النوم';badge.hidden=!min;badge.textContent=min?`${min}د`:''}$('sleep').onclick=()=>{sleepIndex=(sleepIndex+1)%sleepValues.length;const min=sleepValues[sleepIndex];clearTimeout(state.sleepTimer);syncSleepButton(min);if(min)state.sleepTimer=setTimeout(()=>{player.pause();syncSleepButton(0);toast('انتهى مؤقت النوم.')},min*60000)};

function syncSeekDisplays(value){const v=Math.max(0,Math.min(1000,Number(value)||0));$('seek').value=v;$('miniSeek').value=v;$('miniSeek').style.setProperty('--mini-pct',`${v/10}%`);const d=player.duration||0,t=d?v/1000*d:0;$('curTime').textContent=fmtTime(t);$('durTime').textContent=fmtTime(d)}
function bindSeek(input){
  const begin=()=>{state.seeking=true;state.lastSeekValue=Number(input.value)||0;document.documentElement.classList.add('is-seeking')},end=()=>{state.lastSeekValue=Number(input.value)||0;syncSeekDisplays(state.lastSeekValue);if(player.duration)player.seek(state.lastSeekValue/1000*player.duration);state.seeking=false;document.documentElement.classList.remove('is-seeking')};
  input.addEventListener('pointerdown',begin,{passive:true});input.addEventListener('touchstart',begin,{passive:true});input.addEventListener('input',()=>{state.seeking=true;state.lastSeekValue=Number(input.value)||0;syncSeekDisplays(state.lastSeekValue);if(player.duration)player.seek(state.lastSeekValue/1000*player.duration)});input.addEventListener('change',end);input.addEventListener('pointerup',end,{passive:true});input.addEventListener('pointercancel',()=>{state.seeking=false;document.documentElement.classList.remove('is-seeking')},{passive:true});
}
bindSeek($('seek'));bindSeek($('miniSeek'));
async function persistProgress(force=false){
  if(!state.current)return;const now=Date.now();if(!force&&now-state.lastProgressWrite<5000)return;state.lastProgressWrite=now;const t=player.position||0;state.current.lastPosition=t;state.current.lastPlayedAt=now;
  if(isPersisted(state.current))await putTrack(state.current).catch(()=>{});else{state.catalogProgress[state.current.id]={lastPosition:t,lastPlayedAt:now};setPref(PREF_PROGRESS,state.catalogProgress).catch(()=>{})}
  if(state.lastListened){state.lastListened.position=t;state.lastListened.at=now;setPref(PREF_LAST,state.lastListened).catch(()=>{})}
}
function completeCurrentProgress(){const rec=state.current;if(!rec)return;const now=Date.now();rec.lastPosition=0;rec.lastPlayedAt=now;if(isPersisted(rec))putTrack(rec).catch(()=>{});else{state.catalogProgress[rec.id]={lastPosition:0,lastPlayedAt:now};setPref(PREF_PROGRESS,state.catalogProgress).catch(()=>{})}if(state.lastListened){state.lastListened.position=0;state.lastListened.at=now;setPref(PREF_LAST,state.lastListened).catch(()=>{})}}
function repeatIsActive(){const button=$('repeat');return state.repeat===true&&button?.getAttribute('aria-pressed')==='true'&&button?.classList.contains('on')}
function syncPlayerTime(){const d=player.duration||0,t=player.position||0;$('curTime').textContent=fmtTime(t);$('durTime').textContent=fmtTime(d);if(!state.seeking){const value=d?Math.round(t/d*1000):0;$('seek').value=value;$('miniSeek').value=value;$('miniSeek').style.setProperty('--mini-pct',`${value/10}%`)}persistProgress(false)}
player.on('state',setPlayIcons);player.on('time',syncPlayerTime);player.on('duration',syncPlayerTime);player.on('source',info=>{$('ytPark').classList.toggle('active',info?.source==='youtube')});player.on('ended',()=>{completeCurrentProgress();if(repeatIsActive()&&state.current){playRecitation(state.current,state.currentVariant,null,{resume:false,open:false,priorityPlayback:true});return}if(!stepQueue(1,{wrap:false,priorityPlayback:true}))setPlayIcons()});
player.on('error',err=>{console.warn(err);setPlayIcons();const current=state.current,local=current&&localVariant(current,state.currentVariant?.id),fallbackKey=current?`${current.id}:${state.currentVariant?.id||''}`:'';if(current&&local&&state.fallbackTriedFor!==fallbackKey){state.fallbackTriedFor=fallbackKey;current.lastPosition=player.position||current.lastPosition||0;toast('تعذر المصدر الحالي، شغّلنا النسخة المحفوظة على الجهاز.');playRecitation(current,local,null,{resume:true,open:false});return}toast('تعذر تشغيل هذا المصدر. جرّب نسخة أخرى من التلاوة أو افتح المصدر.',4200)});
addEventListener('tilawat:stop-playback',()=>{persistProgress(true);player.stop();state.current=null;state.currentVariant=null;state.queue=[];state.queueIndex=-1;state.fallbackTriedFor='';clearTimeout(state.sleepTimer);state.sleepTimer=null;$('miniPlayer').classList.add('hidden');$('app').classList.remove('has-mini');$('playerPage').classList.add('hidden');$('seek').value=0;$('miniSeek').value=0;$('miniSeek').style.setProperty('--mini-pct','0%');$('curTime').textContent='0:00';$('durTime').textContent='0:00';document.body.style.overflow='';document.documentElement.classList.remove('is-audio-playing');syncCurrentCards();renderLibrary()});
bindMediaSession(player,{previous:()=>stepQueue(-1,{wrap:true,priorityPlayback:true}),next:()=>stepQueue(1,{wrap:true,priorityPlayback:true})},track=>coverSync(track));

function variantBadges(v,bestId){const a=[];if(v.id===bestId)a.push('<span class="badge gold">أفضل جودة</span>');if(v.original)a.push('<span class="badge">أصلية</span>');if(v.restored||v.remastered)a.push('<span class="badge">منقحة</span>');if(v.corrected)a.push('<span class="badge">مصححة</span>');if(v.localAudioKey)a.push('<span class="badge gold">بلا نت</span>');if(v.rare)a.push('<span class="badge">نادرة</span>');return a.join('')}
function renderVariants(){
  const r=state.current;if(!r)return;const vs=r.variants||[],playable=vs.filter(v=>v.audioUrl||v.localAudioKey||v.provider==='youtube'||youtubeId(v.sourceUrl||v.videoUrl||'')),best=[...playable].sort((a,b)=>variantScore(b)-variantScore(a))[0],visual=vs.filter(v=>!playable.includes(v)&&(v.videoUrl||v.embedUrl||v.sourceUrl));
  $('variantGrid').innerHTML=(playable.length?playable:[...visual]).map(v=>`<div class="variant ${state.currentVariant?.id===v.id?'current':''}" data-variant="${esc(v.id)}"><div class="variant__top"><div class="variant__icon">${esc(sourceLabel(v).slice(0,2))}</div><div class="variant__txt"><b>${esc(sourceLabel(v))}</b><span>${esc(v.qualityLabel||v.title||'نسخة محفوظة')}</span></div></div><div class="variant__badges">${variantBadges(v,best?.id)}</div><div class="variant__actions"><button data-use-variant="${esc(v.id)}">تشغيل</button><button data-prefer-variant="${esc(v.id)}">${r.preferredVariantId===v.id?'الافتراضية ✓':'اجعلها الافتراضية'}</button>${v.audioUrl&&!v.localAudioKey&&v.downloadable?`<button data-download-variant="${esc(v.id)}">تنزيل</button>`:''}${v.sourceUrl?`<button data-open-source="${esc(v.id)}">المصدر</button>`:''}</div></div>`).join('')||'<div class="empty"><p>لا توجد نسخ إضافية بعد.</p></div>';
  $('visualSection').classList.toggle('hidden',!visual.length);$('visualGrid').innerHTML=visual.map(v=>`<button class="visual-card" data-open-source="${esc(v.id)}"><img src="${esc(v.thumbnail||coverSync(r))}" data-fallback="${esc(fallbackCover(r))}" alt=""><div><b>${esc(sourceLabel(v))}</b><p class="hint">${esc(v.qualityLabel||'أرشيف مرئي')}</p></div></button>`).join('');
}
$('variantGrid').addEventListener('click',async e=>{if(!state.current)return;const use=e.target.closest('[data-use-variant]'),pref=e.target.closest('[data-prefer-variant]'),down=e.target.closest('[data-download-variant]'),open=e.target.closest('[data-open-source]'),id=use?.dataset.useVariant||pref?.dataset.preferVariant||down?.dataset.downloadVariant||open?.dataset.openSource;if(!id)return;const v=state.current.variants.find(x=>x.id===id);if(!v)return;if(use){const at=player.position;state.current.lastPosition=at;await playRecitation(state.current,v,null,{resume:true,open:false})}else if(pref){state.current.preferredVariantId=id;if(isPersisted(state.current))await putTrack(state.current);else{state.catalogVariantPrefs[state.current.id]=id;await setPref(PREF_VARIANTS,state.catalogVariantPrefs)}renderVariants();toast('تم اعتماد هذه النسخة للتشغيل الافتراضي.')}else if(down)downloadVariant(state.current,v);else if(open&&v.sourceUrl)window.open(v.sourceUrl,'_blank','noopener')});
$('visualGrid').addEventListener('click',e=>{const b=e.target.closest('[data-open-source]');if(!b||!state.current)return;const v=state.current.variants.find(x=>x.id===b.dataset.openSource);if(v?.sourceUrl)window.open(v.sourceUrl,'_blank','noopener')});
function renderRelated(){const r=state.current;if(!r)return;const sameRec=state.local.filter(x=>x.id!==r.id&&normalizeArabic(x.reciter)===normalizeArabic(r.reciter)).slice(0,8),sameYear=state.local.filter(x=>x.id!==r.id&&r.year&&x.year===r.year).slice(0,8),sameSurah=state.local.filter(x=>x.id!==r.id&&normalizeArabic(x.surah)===normalizeArabic(r.surah)).slice(0,8),parts=[];if(sameRec.length)parts.push(shelf('من نفس القارئ',rail(sameRec.map(cardHTML))));if(sameYear.length)parts.push(shelf('من نفس السنة',rail(sameYear.map(cardHTML))));if(sameSurah.length)parts.push(shelf('نفس السورة',rail(sameSurah.map(cardHTML))));$('relatedShelves').innerHTML=parts.join('')||'<div class="empty"><p>كلما كبرت مكتبتك، ستظهر هنا اقتراحات أدق.</p></div>'}

async function saveToLibrary({favorite=false}={}){
  if(!state.current)return null;if(isPersisted(state.current)){if(favorite&&!state.current.favorite){state.current.favorite=true;await putTrack(state.current)}renderPlayer();renderLibrary();return state.current}
  let existing=findEquivalentTrack(state.local,state.current);
  if(existing){mergeVariants(existing,state.current);existing.lastPlayedAt=Date.now();existing.lastPosition=player.position||existing.lastPosition||0;if(favorite)existing.favorite=true;await putTrack(existing);state.current=existing;const qi=state.queue.findIndex(x=>x.id===state.current.id||findEquivalentTrack([existing],x));if(qi>=0)state.queue[qi]=existing;await resolveCover(existing);await updateLastListened(existing);renderAll();await renderPlayer();toast('التلاوة موجودة في مكتبتك؛ دمجنا النسخ بدل تكرارها.');return existing}
  const copy=migrateTrack({...state.current,id:newId(),catalogOnly:false,addedAt:Date.now(),lastPlayedAt:Date.now(),lastPosition:player.position||0,favorite:favorite||state.current.favorite});delete copy.catalogOnly;copy.catalogRef=state.current.catalogRef?{...state.current.catalogRef}:copy.catalogRef;state.current=copy;if(state.queueIndex>=0)state.queue[state.queueIndex]=copy;state.local.unshift(copy);state.libraryOrder=[copy.id,...state.libraryOrder.filter(id=>id!==copy.id)];await putTrack(copy);await setPref(PREF_ORDER,state.libraryOrder);await resolveCover(copy);await updateLastListened(copy);renderAll();await renderPlayer();toast(favorite?'حُفظت وأضيفت للمفضلة.':'حُفظ التسجيل في مكتبتك.');return copy;
}
async function toggleFavorite(){if(!state.current)return;if(!isPersisted(state.current)){await saveToLibrary({favorite:true});return}state.current.favorite=!state.current.favorite;await putTrack(state.current);$('miniFav').classList.toggle('is-favorite',state.current.favorite);$('miniFav').setAttribute('aria-pressed',String(state.current.favorite));renderLibrary();renderHome();toast(state.current.favorite?'أضيفت للمفضلة · تجدها في مكتبتي':'أزيلت من المفضلة.')}
$('saveRec').onclick=()=>isPersisted(state.current)?toast('هذه التلاوة موجودة في مكتبتك.'):saveToLibrary();$('miniFav').onclick=toggleFavorite;

async function downloadVariant(rec,v){
  if(!v.audioUrl){toast('هذه النسخة لا توفر ملفًا صوتيًا مباشرًا.');return}if(v.localAudioKey){toast('هذه النسخة موجودة بلا إنترنت.');return}if(!isPersisted(rec)){await saveToLibrary();rec=state.current;v=rec.variants.find(x=>x.id===v.id)||v}
  state.downloadController?.abort();const controller=new AbortController();state.downloadController=controller;$('downloadProgress').classList.remove('hidden');const bar=$('downloadProgress').querySelector('span');bar.style.width='18%';toast('جارٍ تنزيل النسخة…',60000);
  try{const res=await fetch(v.audioUrl,{mode:'cors',credentials:'omit',signal:controller.signal});if(!res.ok)throw new Error('HTTP '+res.status);bar.style.width='58%';const blob=await res.blob();if(controller.signal.aborted)return;const key=`v-${rec.id}-${v.id}`;await putBlob(key,blob);v.localAudioKey=key;v.fileSize=blob.size;await putTrack(rec);bar.style.width='100%';renderVariants();renderLibrary();toast(`اكتمل التنزيل ${fmtBytes(blob.size)} — متاحة بلا إنترنت.`);setTimeout(()=>$('downloadProgress').classList.add('hidden'),700)}catch(err){console.warn(err);$('downloadProgress').classList.add('hidden');if(err?.name!=='AbortError')toast('تعذر تنزيل الملف من هذا المصدر.',4200)}finally{if(state.downloadController===controller)state.downloadController=null}
}
$('downloadCurrent').onclick=()=>state.current&&state.currentVariant&&downloadVariant(state.current,state.currentVariant);

function isYaldosryPage(value=''){try{const u=new URL(value);return u.protocol==='https:'&&YALDOSRY_HOST.test(u.hostname)&&!(/\.(?:mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(?:[?#]|$)/i.test(u.href))}catch{return false}}
async function resolveYaldosry(value){const r=await fetch(`/api/resolve-source?url=${encodeURIComponent(value)}`,{headers:{accept:'application/json'},cache:'no-store'});let data=null;try{data=await r.json()}catch{}if(!r.ok||!data?.audioUrl)throw new Error(data?.error||`resolver-${r.status}`);return{...data,audioUrl:new URL(data.audioUrl,location.href).href}}
async function resolveEnteredSource(value,{hint=null}={}){
  if(!value)return null;
  if(isYaldosryPage(value)){if(hint)hint.textContent='جارٍ استخراج ملف الصوت من صفحة ياسر الدوسري…';try{const data=await resolveYaldosry(value);if(hint)hint.textContent='تم العثور على ملف الصوت وسيعمل مباشرة.';return{...detectSource(data.audioUrl),provider:'yaldosry',sourceUrl:value,audioUrl:data.audioUrl,resolvedTitle:data.title||''}}catch(err){if(hint)hint.textContent='تعذر استخراج ملف الصوت من هذه الصفحة.';throw err}}
  return detectSource(value);
}
function localCoverPreview(){return imageFor({reciter:$('addReciter').value.trim(),surah:$('addSurah').value.trim(),seed:`preview|${$('addTitle').value.trim()}`})||QURAN_FALLBACK}
function selectedCoverMode(){return document.querySelector('input[name="addCoverMode"]:checked')?.value||'local'}
function updateCoverPicker(){
  const yt=$('coverModeYoutube'),upload=$('coverModeUpload'),preview=$('addCoverPreview'),mode=selectedCoverMode(),file=$('addCoverFile').files?.[0];yt.disabled=!state.pendingYoutubeMeta?.thumbnail;upload.disabled=!file;
  let src=localCoverPreview();if(mode==='youtube'&&state.pendingYoutubeMeta?.thumbnail)src=state.pendingYoutubeMeta.thumbnail;else if(mode==='upload'&&file)src=URL.createObjectURL(file);preview.src=src;preview.dataset.fallback=localCoverPreview();
  if(mode==='upload'&&file)preview.onload=()=>{try{if(preview.src.startsWith('blob:'))URL.revokeObjectURL(preview.src)}catch{}};
}
function syncFilePicker(inputId,statusId,empty='لم يُختر ملف'){const file=$(inputId).files?.[0];$(statusId).textContent=file?.name||empty}
function openAddDialog({source='',title='',text=''}={}){$('addForm').reset();syncFilePicker('addFile','addFileStatus');syncFilePicker('addCoverFile','addCoverFileStatus','اختياري');state.pendingYoutubeMeta=null;state.coverModeTouched=false;$('sourceHint').textContent='سنحدد نوع المصدر ونأخذ ما يسمح به.';$('coverModeLocal').checked=true;$('addSource').value=source;$('addTitle').value=title||text||'';openDialog($('addDialog'),$('addBtn'));updateCoverPicker();if(source)prefillSource()}
$('addBtn').onclick=()=>openAddDialog();$('surahDatalist').innerHTML=SURAHS.map(s=>`<option value="${esc(s)}"></option>`).join('');
let sourceTimer=0;$('addSource').addEventListener('input',()=>{clearTimeout(sourceTimer);sourceTimer=setTimeout(prefillSource,360)});['addTitle','addReciter','addSurah'].forEach(id=>$(id).addEventListener('input',updateCoverPicker));document.querySelectorAll('input[name="addCoverMode"]').forEach(r=>r.addEventListener('change',()=>{state.coverModeTouched=true;updateCoverPicker()}));$('addFile').addEventListener('change',()=>syncFilePicker('addFile','addFileStatus'));$('addCoverFile').addEventListener('change',()=>{syncFilePicker('addCoverFile','addCoverFileStatus','اختياري');if($('addCoverFile').files?.[0]){$('coverModeUpload').disabled=false;$('coverModeUpload').checked=true;state.coverModeTouched=true}updateCoverPicker()});
async function prefillSource(){
  const val=$('addSource').value.trim();state.pendingYoutubeMeta=null;if(!val){$('sourceHint').textContent='سنحدد نوع المصدر ونأخذ ما يسمح به.';updateCoverPicker();return}
  try{const d=await resolveEnteredSource(val,{hint:$('sourceHint')});if(!d){$('sourceHint').textContent='تعذر فهم الرابط.';return}if(d.provider==='youtube'){const m=await youtubeMeta(youtubeId(val));if(m){state.pendingYoutubeMeta=m;if(!$('addTitle').value)$('addTitle').value=m.title;if(!$('addReciter').value)$('addReciter').value=m.author;if(!state.coverModeTouched){$('coverModeYoutube').checked=true}$('sourceHint').textContent='جلبنا عنوان YouTube والقناة والثامنيل. إذا انقطع النت سيظهر الغلاف المحلي تلقائيًا.'}}else if(d.resolvedTitle&&!$('addTitle').value)$('addTitle').value=d.resolvedTitle.replace(/\s*>.*$/,'').trim();else if(d.audioUrl)$('sourceHint').textContent='تم التعرف على رابط صوت مباشر — مناسب للخلفية والتنزيل.';else $('sourceHint').textContent=`تم التعرف على ${sourceLabel(d)} كمصدر مرجعي.`}catch(err){console.warn(err)}updateCoverPicker();
}
$('addForm').addEventListener('submit',async e=>{
  e.preventDefault();const title=$('addTitle').value.trim(),reciter=$('addReciter').value.trim();if(!title||!reciter){toast('اكتب العنوان واسم القارئ.');return}const source=$('addSource').value.trim(),file=$('addFile').files[0],coverFile=$('addCoverFile').files[0];if(!source&&!file){toast('أضف رابطًا أو ملف صوت.');return}
  const id=newId(),rec=migrateTrack({id,title,reciter,surah:$('addSurah').value.trim(),year:$('addYear').value.trim(),collection:$('addCollection').value.trim(),mosque:$('addMosque').value.trim(),occasion:$('addOccasion').value.trim(),tags:$('addTags').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean),rare:$('addRare').checked,addedAt:Date.now(),variants:[],coverMode:selectedCoverMode()});
  try{if(source){const d=await resolveEnteredSource(source,{hint:$('sourceHint')});if(d){if(d.provider==='youtube'){const meta=state.pendingYoutubeMeta||await youtubeMeta(youtubeId(source));if(meta){d.thumbnail=meta.thumbnail;if(rec.coverMode==='youtube')rec.sourceThumbnail=meta.thumbnail}}rec.variants.push(normalizeVariant({...d,original:$('addOriginal').checked,restored:$('addRestored').checked,qualityLabel:$('addRestored').checked?'منقحة':'',provenance:{discoveredFrom:'إضافة يدوية',originalSource:source,verified:false,confidence:.8}}))}}
    if(file){const key=`v-${id}-local`;await putBlob(key,file);rec.variants.unshift(normalizeVariant({provider:'local',localAudioKey:key,title:file.name,qualityLabel:'ملف الجهاز',fileSize:file.size,original:true,downloadable:true,provenance:{discoveredFrom:'رفع المستخدم',verified:true,confidence:1}}))}
    if(rec.coverMode==='upload'&&coverFile){const key=`cover-${id}`;await putBlob(key,coverFile);rec.coverKey=key}else if(rec.coverMode==='youtube'&&!rec.sourceThumbnail)rec.coverMode='local';
    let target=findEquivalentTrack(state.local,rec);if(target){mergeVariants(target,rec);if(rec.coverKey)target.coverKey=rec.coverKey;if(rec.sourceThumbnail&&rec.coverMode==='youtube')target.sourceThumbnail=rec.sourceThumbnail;target.coverMode=rec.coverMode||target.coverMode;target._coverResolved='';await putTrack(target);await resolveCover(target);closeDialog($('addDialog'));renderAll();toast('هذا التسجيل موجود؛ دمجنا المصدر والنسخة الجديدة معه.');await playRecitation(target,null,null,{open:true});return}
    await putTrack(rec);await resolveCover(rec);state.local.unshift(rec);state.libraryOrder=[rec.id,...state.libraryOrder.filter(x=>x!==rec.id)];await setPref(PREF_ORDER,state.libraryOrder);closeDialog($('addDialog'));renderAll();toast('أضيف التسجيل إلى المكتبة.');await playRecitation(rec,null,null,{open:true});
  }catch(err){console.warn(err);toast('تعذر إضافة هذا المصدر. تأكد من الرابط أو جرّب ملفًا مباشرًا.',4200)}
});

const openVariantDialog=()=>{if(!state.current)return;const opener=document.activeElement;$('variantForm').reset();syncFilePicker('variantFile','variantFileStatus','اختياري');$('variantSourceHint').textContent='يمكنك إضافة YouTube أو MP3 أو صفحة تلاوة من موقع ياسر الدوسري.';openDialog($('variantDialog'),opener)};$('addVariantBtn').onclick=$('playerMore').onclick=openVariantDialog;$('variantFile').addEventListener('change',()=>syncFilePicker('variantFile','variantFileStatus','اختياري'));
let variantTimer=0;$('variantSource').addEventListener('input',()=>{clearTimeout(variantTimer);variantTimer=setTimeout(async()=>{const value=$('variantSource').value.trim();if(!value)return;try{const d=await resolveEnteredSource(value,{hint:$('variantSourceHint')});if(d?.provider==='youtube')$('variantSourceHint').textContent='YouTube جاهز كنسخة مرئية/تشغيلية.'}catch(err){console.warn(err);$('variantSourceHint').textContent='تعذر استخراج الصوت من هذا الرابط.'}},420)});
$('variantForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!state.current)return;let rec=state.current;if(!isPersisted(rec)){await saveToLibrary();rec=state.current}const source=$('variantSource').value.trim(),file=$('variantFile').files[0];if(!source&&!file){toast('أضف رابطًا أو ملفًا.');return}
  try{let base=source?await resolveEnteredSource(source,{hint:$('variantSourceHint')}):{provider:'local'};if(!base)base={provider:'generic',sourceUrl:source};const provider=$('variantProvider').value.trim()||base.provider||'generic',v=normalizeVariant({...base,provider,qualityLabel:$('variantQuality').value.trim(),bitrate:Number($('variantBitrate').value||0),codec:$('variantCodec').value.trim(),original:$('variantOriginal').checked,restored:$('variantRestored').checked,corrected:$('variantCorrected').checked,rare:$('variantRare').checked,provenance:{discoveredFrom:'إضافة يدوية',originalSource:source,verified:!!file,confidence:file?1:.75}});if(file){const key=`v-${rec.id}-${v.id}`;await putBlob(key,file);v.localAudioKey=key;v.fileSize=file.size;v.downloadable=true;v.provider=provider==='generic'?'local':provider}mergeVariants(rec,{variants:[v]});await putTrack(rec);closeDialog($('variantDialog'));renderVariants();renderHome();toast('أضيفت النسخة دون حذف أي مصدر آخر.')}catch(err){console.warn(err);$('variantSourceHint').textContent='تعذر إضافة هذه النسخة. الرابط لم يتحول إلى مصدر قابل للاستخدام.';toast('تعذر إضافة النسخة.',3600)}
});

function focusables(root){return $$('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',root).filter(el=>!el.hidden&&el.offsetParent!==null)}
function openDialog(dialog,opener=document.activeElement){if(!dialog)return;state.modalReturnFocus.set(dialog,opener);dialog.classList.remove('hidden');requestAnimationFrame(()=>focusables(dialog)[0]?.focus())}
function closeDialog(dialog){if(!dialog)return;dialog.classList.add('hidden');const prev=state.modalReturnFocus.get(dialog);state.modalReturnFocus.delete(dialog);prev?.focus?.()}
document.addEventListener('keydown',e=>{const dialog=$$('.dialog:not(.hidden)').at(-1);if(!dialog)return;if(e.key==='Escape'){e.preventDefault();closeDialog(dialog);return}if(e.key!=='Tab')return;const list=focusables(dialog);if(!list.length)return;const first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}});

function renderAll(){renderHome();renderLibrary();if(state.tab==='search')renderSearch($('searchInput').value);if(state.current)renderPlayer().catch(()=>{})}
async function loadCatalog(){
  try{state.reciters=await fetchReciters();state.catalogReady=true;state.catalogError=false;renderAll();hydrateArchive1425().then(reciters=>{state.reciters=reciters;state.catalogArchiveReady=true;renderAll()}).catch(err=>{console.warn('Archive 1425 unavailable',err)})}catch(err){console.warn(err);state.catalogError=true;renderAll()}
}
function launchIntent(){const p=new URLSearchParams(location.search);const direct=p.get('url')||'',text=p.get('text')||'',title=p.get('title')||'',fromText=(text.match(/https?:\/\/\S+/)||[])[0]||'',source=direct||fromText,should=p.get('add')==='1'||!!source||!!title||!!text;if(!should)return;setTimeout(()=>openAddDialog({source,title,text:source?title:(title||text)}),80);const clean=location.pathname+location.hash;history.replaceState(null,'',clean)}
async function restorePrefs(){
  const [progress,last,order,variantPrefs]=await Promise.all([getPref(PREF_PROGRESS).catch(()=>null),getPref(PREF_LAST).catch(()=>null),getPref(PREF_ORDER).catch(()=>null),getPref(PREF_VARIANTS).catch(()=>null)]);state.catalogProgress=progress&&typeof progress==='object'?progress:{};state.lastListened=last&&typeof last==='object'?last:null;state.libraryOrder=Array.isArray(order)?order:[];state.catalogVariantPrefs=variantPrefs&&typeof variantPrefs==='object'?variantPrefs:{};
  if(!state.lastListened){try{const legacy=JSON.parse(localStorage.getItem('tilawat-last-listened-v15')||'null');if(legacy){state.lastListened={kind:legacy.type==='catalog'?'catalog':'local',key:legacy.key,title:legacy.title,sub:legacy.sub,cover:legacy.cover,fallback:QURAN_FALLBACK,at:legacy.at||Date.now()};await setPref(PREF_LAST,state.lastListened)}}catch{}}
  if(!state.libraryOrder.length){try{const legacy=JSON.parse(localStorage.getItem('tilawat-library-order-v1')||'[]');if(Array.isArray(legacy))state.libraryOrder=legacy}catch{}}
}
async function start(){
  await restorePrefs();try{await migrateLibrary()}catch(err){console.error(err);toast('تعذر فتح مكتبة الجهاز.');state.local=[]}renderAll();loadCatalog();launchIntent();
  if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>{});if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  const warm=()=>prewarmYouTube();if('requestIdleCallback'in window)requestIdleCallback(warm,{timeout:2500});else setTimeout(warm,1300);
  addEventListener('beforeunload',()=>{persistProgress(true);for(const u of state.coverUrls.values())URL.revokeObjectURL(u);state.downloadController?.abort()});document.addEventListener('visibilitychange',()=>{if(document.hidden)persistProgress(true)});
  addEventListener('tilawat-library-imported',async()=>{await migrateLibrary();renderAll()});
}
start();