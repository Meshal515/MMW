import { allTracks, putTrack, getTrack, putBlob, getBlob, deleteBlob, newId } from './store.js';
import { SURAHS, SOURCE_REGISTRY, normalizeArabic, tokens, matches, detectSource, youtubeId, youtubeMeta, normalizeVariant, migrateTrack, resolveVariant, variantScore, makeCover } from './catalog/core.js';
import { fetchReciters, catalogRecitation, reciterMoshafs, reciterSurahs, hasSurah } from './catalog/mp3quran.js';
import { Player, bindMediaSession } from './player.js';
import { dossariImage, imageFor, QURAN_FALLBACK } from './ui-dossari-only.js';
import './classic-ui.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = s => { if(!Number.isFinite(s)||s<0)return '0:00'; s=Math.floor(s); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60,p=n=>String(n).padStart(2,'0'); return h?`${h}:${p(m)}:${p(x)}`:`${m}:${p(x)}`; };
const fmtBytes = n => { if(!n)return ''; const u=['ب','ك.ب','م.ب','غ.ب']; let i=0; while(n>=1024&&i<u.length-1){n/=1024;i++} return `${n>=10||i===0?Math.round(n):n.toFixed(1)} ${u[i]}`; };
const uniq = a => [...new Set(a.filter(Boolean))];

const state = {
  tab:'home', librarySeg:'all', local:[], reciters:[], catalogReady:false, catalogError:false,
  current:null, currentVariant:null, queue:[], queueIndex:-1, speed:1, currentObjectUrl:'',
  browse:null, toastTimer:null, downloadAbort:null, coverUrls:new Map(), lastProgressWrite:0,
  repeat:false, sleepTimer:null
};
const player = new Player('ytMount');

document.addEventListener('error',event=>{
  const img=event.target;if(!(img instanceof HTMLImageElement)||img.dataset.fallbackUsed==='1')return;
  img.dataset.fallbackUsed='1';img.src=img.dataset.fallback||QURAN_FALLBACK;
},true);

function toast(msg,ms=2600){ const el=$('toast'); el.textContent=msg; el.classList.add('on'); clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>el.classList.remove('on'),ms); }
function iconPlay(paused=true){ return paused?'<path d="M7 4.5 19 12 7 19.5z" fill="currentColor" stroke="none"/>':'<path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/>'; }
function setPlayIcons(){ const h=iconPlay(!player.playing); $('miniPlayIcon').innerHTML=h; $('mainPlayIcon').innerHTML=h; }
function theme(next){ document.documentElement.dataset.theme=next; localStorage.setItem('tilawat-theme',next); const m=document.querySelector('meta[name="theme-color"]'); if(m)m.content=next==='dark'?'#08090A':'#F7F7F5'; }
$('themeBtn').onclick=()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  $('themeBtn').animate([{transform:'rotate(0) scale(1)'},{transform:'rotate(16deg) scale(.9)'},{transform:'rotate(0) scale(1)'}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});
  if(document.startViewTransition) document.startViewTransition(()=>theme(next)); else theme(next);
};

async function resolveCover(rec){
  if(rec._coverResolved) return rec._coverResolved;
  if(rec.coverKey){
    try{ const blob=await getBlob(rec.coverKey); if(blob){ const u=URL.createObjectURL(blob); state.coverUrls.set(rec.id,u); rec._coverResolved=u; return u; } }catch{}
  }
  const visual=(rec.variants||[]).find(v=>v.thumbnail)?.thumbnail;
  rec._coverResolved=rec.cover||rec.sourceThumbnail||visual||fallbackCover(rec);
  return rec._coverResolved;
}
function coverSync(rec){ return rec._coverResolved||rec.cover||rec.sourceThumbnail||(rec.variants||[]).find(v=>v.thumbnail)?.thumbnail||fallbackCover(rec); }
function fallbackCover(rec){ return imageFor({reciter:rec?.reciter,surah:rec?.surah,seed:rec?.id})||QURAN_FALLBACK; }
function sourceLabel(v){ return SOURCE_REGISTRY[v?.provider]?.label || v?.provider || 'مصدر'; }
function recSubtitle(r){ return [r.reciter,r.surah,r.year?`${r.year}هـ`:'',r.collection].filter(Boolean).join(' · '); }
function isOffline(rec){ return (rec.variants||[]).some(v=>v.localAudioKey); }
function isPersisted(rec){ return !rec.catalogOnly; }

async function migrateLibrary(){
  const raw=await allTracks();
  state.local=[];
  for(const row of raw){
    const rec=migrateTrack(row);
    state.local.push(rec);
    if(row.schemaVersion!==4 || !Array.isArray(row.variants)) await putTrack(rec);
    await resolveCover(rec);
  }
  state.local.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
}

function cardHTML(rec,{tag=''}={}){
  const cover=coverSync(rec); const fallback=fallbackCover(rec); const status=tag||(rec.rare?'نادرة':isOffline(rec)?'بلا نت':'');
  const action=rec.catalogRef?`data-catalog-play="${rec.catalogRef.reciterId}|${rec.catalogRef.moshafId}|${rec.catalogRef.surahId}"`:`data-play="${esc(rec.id)}"`;
  return `<button class="media-card" type="button" ${action}><div class="art"><img src="${esc(cover)}" data-fallback="${esc(fallback)}" alt="" loading="lazy">${status?`<span class="tag ${status==='نادرة'?'gold':''}">${esc(status)}</span>`:''}<span class="art__play"><svg viewBox="0 0 24 24"><path d="M7 4.5 19 12 7 19.5z"/></svg></span></div><h3>${esc(rec.title||`سورة ${rec.surah}`||'تلاوة')}</h3><p>${esc(recSubtitle(rec))}</p></button>`;
}
function reciterCardHTML(r){ const m=reciterMoshafs(r),cover=imageFor({reciter:r.name,seed:`reciter|${r.name}`}); return `<button class="reciter-card" data-reciter="${r.id}" type="button"><div class="reciter-art"><img src="${cover}" data-fallback="${fallbackCover({reciter:r.name,id:r.id})}" alt=""></div><div class="reciter-card__text"><h3>${esc(r.name)}</h3><p>${m.length} مصحف · ${Math.max(0,...m.map(x=>Number(x.surah_total||0)))} سورة</p></div></button>`; }
function shelf(title,body,sub='',more=''){ return `<section class="shelf"><div class="shelf__head"><div><h2>${esc(title)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div>${more?`<button class="more" data-more="${esc(more)}">عرض الكل</button>`:''}</div>${body}</section>`; }
function rail(items){return `<div class="rail">${items.join('')}</div>`;}

function featuredReciters(){
  const names=['ياسر الدوسري','ماهر المعيقلي','محمد صديق المنشاوي','محمود خليل الحصري','عبدالباسط عبدالصمد','مشاري العفاسي','سعود الشريم','عبدالرحمن السديس','أحمد العجمي'];
  const out=[]; const used=new Set();
  for(const n of names){const f=state.reciters.find(r=>normalizeArabic(r.name).includes(normalizeArabic(n))); if(f&&!used.has(f.id)){out.push(f);used.add(f.id)}}
  for(const r of state.reciters){if(out.length>=12)break;if(!used.has(r.id)){out.push(r);used.add(r.id)}}
  return out;
}
function localByTag(...need){ const ns=need.map(normalizeArabic); return state.local.filter(r=>{const h=normalizeArabic([r.occasion,r.collection,...(r.tags||[])].join(' '));return ns.some(n=>h.includes(n));}); }

function greeting(){const h=new Date().getHours();return h<12?'صباح الخير':h<18?'مساء الخير':'مساء النور'}
function quickHTML(rec,label=''){
  const ref=rec.catalogRef,action=ref?`data-catalog-play="${ref.reciterId}|${ref.moshafId}|${ref.surahId}"`:`data-play="${esc(rec.id)}"`;
  return `<button class="quick" type="button" ${action}><img src="${esc(coverSync(rec))}" data-fallback="${esc(fallbackCover(rec))}" alt=""><span>${esc(label||rec.title)}</span><i><svg viewBox="0 0 24 24"><path d="M7 4.5 19 12 7 19.5z"/></svg></i></button>`;
}
function catalogueSet(moshaf,ids){
  const reciter=state.reciters[0]; if(!reciter||!moshaf)return[];
  return ids.filter(id=>hasSurah(moshaf,id)).map(id=>catalogRecitation(reciter,moshaf,id));
}
function renderHome(){
  $('homeGreeting').textContent=greeting();
  const stats=[]; stats.push('ياسر الدوسري'); stats.push('114 سورة'); if(state.local.length)stats.push(`${state.local.length} محفوظة`); stats.push('تشغيل بالخلفية');
  $('heroStats').innerHTML=stats.map(s=>`<span>${esc(s)}</span>`).join('');
  const blocks=[],quick=[...state.local.slice(0,2)];
  const cont=state.local.filter(r=>r.lastPosition>8).sort((a,b)=>(b.lastPlayedAt||0)-(a.lastPlayedAt||0)).slice(0,10);
  if(state.catalogReady){
    const reciter=state.reciters[0],moshafs=reciterMoshafs(reciter),archive=moshafs.find(m=>Number(m.id)===1425),murattal=moshafs.find(m=>Number(m.id)===1);
    const archiveIds=reciterSurahs(reciter,archive).map(s=>s.id);
    const archiveTracks=catalogueSet(archive,archiveIds.slice(0,12));
    const murattalTracks=catalogueSet(murattal,[18,36,55,56,67,78,112,113,114,2,19,20]);
    quick.push(...catalogueSet(archive,archiveIds.slice(0,2)),...catalogueSet(murattal,[18,67]));
    if(cont.length)blocks.push(shelf('أكمل الاستماع',rail(cont.map(r=>cardHTML(r,{tag:'متابعة'})))));
    if(state.local.length)blocks.push(shelf('أضيف حديثًا',rail(state.local.slice(0,10).map(cardHTML))));
    if(archiveTracks.length)blocks.push(shelf('رمضان 1425هـ',rail(archiveTracks.map(r=>cardHTML(r,{tag:'نادرة'}))),'تسجيلات الأرشيف القديمة'));
    blocks.push(shelf('المصحف المرتل',rail(murattalTracks.map(cardHTML)),'تلاوات مختارة بصوت ياسر الدوسري'));
    blocks.push(shelf('ياسر الدوسري',rail(featuredReciters().map(reciterCardHTML)),'كل المصاحف والتسجيلات','reciters'));
  }else{
    const loading=[18,36,55,67].map(id=>({id:`loading-${id}`,title:`سورة ${SURAHS[id-1]}`,reciter:'ياسر الدوسري',surah:SURAHS[id-1],cover:dossariImage(`loading|${id}`)}));
    quick.push(...loading);
    blocks.push(shelf(state.catalogError?'تعذر تحميل الكتالوج':'جارٍ تجهيز التلاوات',rail(loading.map(r=>cardHTML(r)))));
  }
  const rare=state.local.filter(r=>r.rare).slice(0,10); if(rare.length)blocks.push(shelf('كنوز الأرشيف',rail(rare.map(r=>cardHTML(r,{tag:'نادرة'})))));
  $('quickGrid').innerHTML=quick.slice(0,6).map(r=>quickHTML(r)).join('');
  $('homeShelves').innerHTML=blocks.join('');
}

function renderLibrary(){
  let list=[...state.local]; const s=state.librarySeg;
  if(s==='favorite') list=list.filter(r=>r.favorite); else if(s==='offline') list=list.filter(isOffline); else if(s==='rare') list=list.filter(r=>r.rare); else if(s==='recent') list=list.sort((a,b)=>(b.lastPlayedAt||0)-(a.lastPlayedAt||0));
  $('libraryCount').textContent=`${list.length} تسجيل`;
  $('libraryGrid').innerHTML=list.map(cardHTML).join(''); $('libraryEmpty').classList.toggle('hidden',!!list.length);
  document.querySelectorAll('#librarySegs button').forEach(b=>b.classList.toggle('on',b.dataset.seg===s));
}

function renderSearch(q=''){
  const root=$('searchResults'); const ts=tokens(q); if(!ts.length){root.innerHTML=`<div class="empty"><h2>ابحث كما تتكلم</h2><p>مثال: «ياسر 1425 الكهف» أو «مريم منقحة». كل كلمة تُفهم بشكل مستقل.</p></div>`;return}
  const local=state.local.filter(r=>matches(r,ts)).slice(0,30);
  const reciters=state.reciters.filter(r=>ts.every(t=>normalizeArabic(r.name).includes(t))).slice(0,18);
  const surahs=SURAHS.map((name,i)=>({id:i+1,name})).filter(s=>ts.every(t=>normalizeArabic(s.name).includes(t))).slice(0,18);
  let html='';
  if(local.length) html+=shelf('من أرشيفك',`<div class="library-grid">${local.map(cardHTML).join('')}</div>`);
  if(reciters.length) html+=shelf('القراء',rail(reciters.map(reciterCardHTML)));
  if(surahs.length) html+=shelf('السور',`<div class="entity-grid">${surahs.map(s=>`<button class="entity-btn" data-surah="${s.id}"><span class="n">${String(s.id).padStart(3,'0')}</span><span><b>${esc(s.name)}</b><small>استعرض كل القراء</small></span></button>`).join('')}</div>`);
  root.innerHTML=html||`<div class="empty"><h2>لا توجد نتيجة مطابقة</h2><p>جرّب اسم القارئ أو السورة أو السنة بشكل أقصر.</p></div>`;
}

function showTab(tab){
  state.tab=tab; ['home','search','library'].forEach(t=>$(t+'View').classList.toggle('hidden',t!==tab));
  document.querySelectorAll('.tab').forEach(b=>b.toggleAttribute('aria-current',b.dataset.tab===tab));
  if(tab==='library')renderLibrary(); if(tab==='search'){renderSearch($('searchInput').value);setTimeout(()=>$('searchInput').focus(),80)} window.scrollTo({top:0});
}
document.querySelector('.tabbar').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)showTab(b.dataset.tab)}); $('brand').onclick=()=>showTab('home');
$('searchInput').addEventListener('input',e=>renderSearch(e.target.value));
$('librarySegs').addEventListener('click',e=>{const b=e.target.closest('[data-seg]');if(!b)return;state.librarySeg=b.dataset.seg;renderLibrary()});

function findRec(id){ return state.local.find(r=>r.id===id) || (state.current?.id===id?state.current:null); }

document.addEventListener('click',async e=>{
  const p=e.target.closest('[data-play]'); if(p){const rec=findRec(p.dataset.play); if(rec)await playRecitation(rec,null,p.querySelector('.art')); return}
  const r=e.target.closest('[data-reciter]'); if(r){openReciter(Number(r.dataset.reciter));return}
  const s=e.target.closest('[data-surah]'); if(s){openSurah(Number(s.dataset.surah));return}
  const y=e.target.closest('[data-year]'); if(y){openLocalGroup('السنة '+y.dataset.year+'هـ',state.local.filter(x=>x.year===y.dataset.year));return}
  const close=e.target.closest('[data-close]'); if(close){$(close.dataset.close).classList.add('hidden');return}
  const more=e.target.closest('[data-more]'); if(more){ if(more.dataset.more==='reciters')openAllReciters(); if(more.dataset.more==='surahs')openAllSurahs(); }
});

function openBrowse(title,kicker,meta,body,mono='ق'){
  $('browseTitle').textContent=title;$('browseKicker').textContent=kicker;$('browseMeta').textContent=meta||'';
  const visual=/ياسر|سورة|القراء|القرآن/.test(`${title} ${kicker}`);
  $('browseMono').innerHTML=visual?`<img src="${dossariImage(`browse|${title}`)}" data-fallback="${QURAN_FALLBACK}" alt="">`:esc(mono);
  $('browseBody').innerHTML=body;$('browsePage').classList.remove('hidden');
}
$('browseClose').onclick=()=>$('browsePage').classList.add('hidden');
function openAllReciters(){openBrowse('كل القراء','كتالوج القرآن',`${state.reciters.length} قارئ`,`<div class="library-grid">${state.reciters.map(reciterCardHTML).join('')}</div>`,'ق')}
function openAllSurahs(){openBrowse('سور القرآن','114 سورة','اختر سورة ثم قارئًا',`<div class="surah-list">${SURAHS.map((n,i)=>`<button class="surah-row" data-surah="${i+1}"><span class="num">${String(i+1).padStart(3,'0')}</span><b>${esc(n)}</b><span>كل القراء</span></button>`).join('')}</div>`,'س')}
function openLocalGroup(title,list){openBrowse(title,'من أرشيفك',`${list.length} تسجيل`,`<div class="library-grid">${list.map(cardHTML).join('')}</div>`,title.trim()[0]||'ت')}
function openReciter(id){
  const r=state.reciters.find(x=>Number(x.id)===Number(id)); if(!r)return; const ms=reciterMoshafs(r); if(!ms.length)return;
  const tabs=ms.map((m,i)=>`<button class="${i===0?'on':''}" data-moshaf-index="${i}">${esc(m.name||`مصحف ${i+1}`)}</button>`).join('');
  const list=renderMoshafSurahs(r,ms[0]);
  openBrowse(r.name,'صفحة القارئ',`${ms.length} مصحف`, `<div class="moshaf-tabs" id="moshafTabs">${tabs}</div><div id="moshafBody">${list}</div>`,(r.name||'ق')[0]);
  $('moshafTabs').onclick=e=>{const b=e.target.closest('[data-moshaf-index]');if(!b)return;const i=Number(b.dataset.moshafIndex);document.querySelectorAll('#moshafTabs button').forEach(x=>x.classList.toggle('on',x===b));$('moshafBody').innerHTML=renderMoshafSurahs(r,ms[i])};
}
function renderMoshafSurahs(r,m){ const ss=reciterSurahs(r,m); return `<div class="surah-list">${ss.map(s=>`<button class="surah-row" data-catalog-play="${r.id}|${m.id}|${s.id}"><span class="num">${String(s.id).padStart(3,'0')}</span><b>${esc(s.name)}</b><span>${esc(m.name||'المصحف')}</span></button>`).join('')}</div>`; }
function openSurah(id){
  const name=SURAHS[id-1]; const available=[];
  for(const r of state.reciters){const m=reciterMoshafs(r).find(x=>hasSurah(x,id));if(m)available.push({r,m});if(available.length>=120)break}
  openBrowse(`سورة ${name}`,'صفحة السورة',`${available.length} قارئ متاح`,`<div class="result-list">${available.map(({r,m})=>`<button class="result-row" data-catalog-play="${r.id}|${m.id}|${id}"><img src="${dossariImage(`surah|${name}|${m.id}`)}" data-fallback="${QURAN_FALLBACK}" alt=""><span><b>${esc(r.name)}</b><small>${esc(m.name||'')}</small></span><span class="row-play">▶</span></button>`).join('')}</div>`,'س');
}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-catalog-play]');if(!b)return;const [rid,mid,sid]=b.dataset.catalogPlay.split('|').map(Number);const r=state.reciters.find(x=>Number(x.id)===rid);const m=reciterMoshafs(r).find(x=>Number(x.id)===mid);if(!r||!m)return;const rec=catalogRecitation(r,m,sid);await resolveCover(rec);state.queue=reciterSurahs(r,m).map(s=>catalogRecitation(r,m,s.id));state.queueIndex=state.queue.findIndex(x=>x.id===rec.id);playRecitation(rec,null,b);});

function playbackTrack(rec,v){
  const videoId=youtubeId(v?.sourceUrl||v?.videoUrl||v?.embedUrl||'');
  const isYoutube=v?.provider==='youtube'||!!videoId;
  const direct=String(v?.audioUrl||'').trim();
  const audioLike=/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(\?|#|$)/i.test(direct);
  const trustedDirect=['mp3quran','archive','quranicaudio','islamway','tvquran','assabile','everyayah','surahquran','qurancom'].includes(v?.provider);
  return {...rec,localAudioKey:v?.localAudioKey||'',audioUrl:isYoutube?'':((audioLike||trustedDirect)?direct:''),youtubeId:videoId||'',start:0,end:0};
}
async function playRecitation(rec,variant=null,originEl=null,{resume=true}={}){
  if(!rec)return; variant=variant||resolveVariant(rec); if(!variant){toast('لا يوجد مصدر قابل للتشغيل لهذا التسجيل.');return}
  const playable=playbackTrack(rec,variant);
  if(!playable.localAudioKey&&!playable.audioUrl&&!playable.youtubeId){toast('هذا رابط صفحة وليس ملفًا صوتيًا مباشرًا. افتح المصدر أو أضف رابط MP3.');return}
  const wasSame=state.current?.id===rec.id; state.current=rec; state.currentVariant=variant;
  if(!state.queue.length||!state.queue.some(x=>x.id===rec.id)){state.queue=[rec];state.queueIndex=0}else state.queueIndex=state.queue.findIndex(x=>x.id===rec.id);
  rec.lastPlayedAt=Date.now(); rec.playCount=(rec.playCount||0)+1; if(isPersisted(rec))putTrack(rec).catch(()=>{});
  await renderPlayer(originEl);
  await player.load({...playable,lastPosition:resume?(wasSame?player.position:rec.lastPosition||0):0},{autoplay:true,resume});
  player.setRate(state.speed);setPlayIcons();
}
async function renderPlayer(originEl=null){
  const r=state.current;if(!r)return;const c=await resolveCover(r);$('miniCover').src=c;$('playerCover').src=c;$('miniTitle').textContent=r.title||`سورة ${r.surah}`;$('miniSub').textContent=recSubtitle(r);$('playerTitle').textContent=r.title||`سورة ${r.surah}`;$('playerSub').textContent=recSubtitle(r);$('playerKicker').textContent=[r.occasion,r.mosque,state.currentVariant?sourceLabel(state.currentVariant):''].filter(Boolean).join(' · ')||'قيد التشغيل';
  const fallback=fallbackCover(r);for(const img of [$('miniCover'),$('playerCover')]){img.dataset.fallback=fallback;img.onerror=()=>{img.onerror=null;img.src=fallback};}
  $('miniPlayer').classList.remove('hidden');$('app').classList.add('has-mini');renderVariants();renderRelated();$('saveRec').textContent=isPersisted(r)?(r.favorite?'محفوظة ♥':'في مكتبتك'):'حفظ بالمكتبة';$('miniFav').style.color=r.favorite?'var(--accent)':'';
  if(originEl&&window.gsap&&!matchMedia('(prefers-reduced-motion: reduce)').matches){gsap.fromTo('#playerArtWrap',{scale:.94,opacity:.55,y:16},{scale:1,opacity:1,y:0,duration:.42,ease:'power2.out'})}
}
$('miniOpen').onclick=()=>openPlayer(); $('playerClose').onclick=()=>closePlayer();
function openPlayer(){if(!state.current)return;$('playerPage').classList.remove('hidden');document.body.style.overflow='hidden';$('playerScroll').scrollTop=0;setupScrollMotion()}
function closePlayer(){$('playerPage').classList.add('hidden');document.body.style.overflow=''}
$('miniPlay').onclick=$('mainPlay').onclick=()=>player.toggle();
$('back10').onclick=()=>player.nudge(-10);$('forward10').onclick=()=>player.nudge(10);
$('prev').onclick=()=>stepQueue(-1);$('next').onclick=()=>stepQueue(1);
function stepQueue(d){if(!state.queue.length)return;let i=state.queueIndex+d;if(i<0)i=state.queue.length-1;if(i>=state.queue.length)i=0;state.queueIndex=i;playRecitation(state.queue[i],null,null,{resume:false})}
const speeds=[1,1.25,1.5,1.75,2,.75];$('speed').onclick=()=>{const i=speeds.indexOf(state.speed);state.speed=speeds[(i+1)%speeds.length];player.setRate(state.speed);$('speed').textContent=`${state.speed}×`};
$('repeat').onclick=()=>{state.repeat=!state.repeat;$('repeat').classList.toggle('on',state.repeat);$('repeat').textContent=state.repeat?'تكرار ✓':'تكرار'};
const sleepValues=[15,30,45,60,0];let sleepIndex=-1;$('sleep').onclick=()=>{sleepIndex=(sleepIndex+1)%sleepValues.length;const min=sleepValues[sleepIndex];clearTimeout(state.sleepTimer);$('sleep').classList.toggle('on',!!min);$('sleep').textContent=min?`إيقاف بعد ${min}د`:'مؤقت النوم';if(min){state.sleepTimer=setTimeout(()=>{player.pause();$('sleep').textContent='مؤقت النوم';$('sleep').classList.remove('on');toast('انتهى مؤقت النوم.');},min*60000)}};
function syncPlayerTime(){const d=player.duration||0,t=player.position||0;$('curTime').textContent=fmtTime(t);$('durTime').textContent=fmtTime(d);$('seek').value=d?Math.round(t/d*1000):0;if(state.current&&isPersisted(state.current)&&Date.now()-state.lastProgressWrite>5000){state.lastProgressWrite=Date.now();state.current.lastPosition=t;state.current.lastPlayedAt=Date.now();putTrack(state.current).catch(()=>{})}}
player.on('state',setPlayIcons);player.on('time',syncPlayerTime);player.on('duration',syncPlayerTime);
player.on('source',info=>{$('ytPark').classList.toggle('active',info?.source==='youtube')});
player.on('ended',()=>state.repeat&&state.current?playRecitation(state.current,state.currentVariant,null,{resume:false}):stepQueue(1));
player.on('error',err=>{console.warn(err);setPlayIcons();toast('تعذر تشغيل هذا المصدر. جرّب نسخة أخرى من التلاوة أو افتح المصدر.',4200)});
$('seek').addEventListener('input',()=>{if(player.duration)player.seek(Number($('seek').value)/1000*player.duration)});
bindMediaSession(player,{previous:()=>stepQueue(-1),next:()=>stepQueue(1)},track=>coverSync(track));

function variantBadges(v,bestId){const a=[];if(v.id===bestId)a.push('<span class="badge gold">أفضل جودة</span>');if(v.original)a.push('<span class="badge">أصلية</span>');if(v.restored||v.remastered)a.push('<span class="badge">منقحة</span>');if(v.corrected)a.push('<span class="badge">مصححة</span>');if(v.localAudioKey)a.push('<span class="badge gold">بلا نت</span>');if(v.rare)a.push('<span class="badge">نادرة</span>');return a.join('')}
function renderVariants(){
  const r=state.current;if(!r)return;const best=resolveVariant(r);const vs=r.variants||[];const audioVs=vs.filter(v=>v.audioUrl||v.localAudioKey||v.provider==='youtube'||youtubeId(v.sourceUrl||v.videoUrl||''));const visual=vs.filter(v=>!audioVs.includes(v)&&(v.videoUrl||v.embedUrl||v.sourceUrl));
  $('variantGrid').innerHTML=(audioVs.length?audioVs:[...visual]).map(v=>`<div class="variant ${state.currentVariant?.id===v.id?'current':''}" data-variant="${esc(v.id)}"><div class="variant__top"><div class="variant__icon">${esc(sourceLabel(v).slice(0,2))}</div><div class="variant__txt"><b>${esc(sourceLabel(v))}</b><span>${esc(v.qualityLabel||v.title||'نسخة محفوظة')}</span></div></div><div class="variant__badges">${variantBadges(v,best?.id)}</div><div class="variant__actions"><button data-use-variant="${esc(v.id)}">تشغيل</button><button data-prefer-variant="${esc(v.id)}">${r.preferredVariantId===v.id?'المفضلة ✓':'اجعلها المفضلة'}</button>${v.audioUrl&&!v.localAudioKey&&v.downloadable?`<button data-download-variant="${esc(v.id)}">تنزيل</button>`:''}${v.sourceUrl?`<button data-open-source="${esc(v.id)}">المصدر</button>`:''}</div></div>`).join('')||'<div class="empty"><p>لا توجد نسخ إضافية بعد.</p></div>';
  $('visualSection').classList.toggle('hidden',!visual.length);$('visualGrid').innerHTML=visual.map(v=>`<button class="visual-card" data-open-source="${esc(v.id)}"><img src="${esc(v.thumbnail||coverSync(r))}" alt=""><div><b>${esc(sourceLabel(v))}</b><p class="hint">${esc(v.qualityLabel||'أرشيف مرئي')}</p></div></button>`).join('');
}
$('variantGrid').addEventListener('click',async e=>{if(!state.current)return;const use=e.target.closest('[data-use-variant]');const pref=e.target.closest('[data-prefer-variant]');const down=e.target.closest('[data-download-variant]');const open=e.target.closest('[data-open-source]');const id=use?.dataset.useVariant||pref?.dataset.preferVariant||down?.dataset.downloadVariant||open?.dataset.openSource;if(!id)return;const v=state.current.variants.find(x=>x.id===id);if(!v)return;if(use){const at=player.position;await playRecitation(state.current,v);if(Number.isFinite(at))player.seek(at)}else if(pref){state.current.preferredVariantId=id;if(isPersisted(state.current))await putTrack(state.current);renderVariants();toast('تم اعتماد هذه النسخة للتشغيل الافتراضي.')}else if(down){downloadVariant(state.current,v)}else if(open&&v.sourceUrl)window.open(v.sourceUrl,'_blank','noopener')});
$('visualGrid').addEventListener('click',e=>{const b=e.target.closest('[data-open-source]');if(!b||!state.current)return;const v=state.current.variants.find(x=>x.id===b.dataset.openSource);if(v?.sourceUrl)window.open(v.sourceUrl,'_blank','noopener')});

function renderRelated(){
  const r=state.current;if(!r)return;const sameRec=state.local.filter(x=>x.id!==r.id&&normalizeArabic(x.reciter)===normalizeArabic(r.reciter)).slice(0,8);const sameYear=state.local.filter(x=>x.id!==r.id&&r.year&&x.year===r.year).slice(0,8);const sameSurah=state.local.filter(x=>x.id!==r.id&&normalizeArabic(x.surah)===normalizeArabic(r.surah)).slice(0,8);const parts=[];if(sameRec.length)parts.push(shelf('من نفس القارئ',rail(sameRec.map(cardHTML))));if(sameYear.length)parts.push(shelf('من نفس السنة',rail(sameYear.map(cardHTML))));if(sameSurah.length)parts.push(shelf('نفس السورة',rail(sameSurah.map(cardHTML))));$('relatedShelves').innerHTML=parts.join('')||'<div class="empty"><p>كلما كبر أرشيفك، ستظهر هنا اقتراحات أدق.</p></div>';
}
function setupScrollMotion(){if(!window.gsap||matchMedia('(prefers-reduced-motion: reduce)').matches)return;try{if(window.ScrollTrigger)gsap.registerPlugin(ScrollTrigger);ScrollTrigger.getAll().filter(t=>t.vars?.id?.startsWith('tilawat')).forEach(t=>t.kill());gsap.to('#playerArtWrap',{opacity:.12,scale:.88,y:58,ease:'none',scrollTrigger:{id:'tilawat-art',trigger:'#variantsSection',scroller:'#playerPage',start:'top 92%',end:'top 32%',scrub:true}});gsap.fromTo('#relatedSection',{opacity:.25,y:16},{opacity:1,y:0,scrollTrigger:{id:'tilawat-related',trigger:'#relatedSection',scroller:'#playerPage',start:'top 88%',end:'top 65%',scrub:true}})}catch{}
}

async function saveCurrent(){
  if(!state.current)return; if(isPersisted(state.current)){state.current.favorite=!state.current.favorite;await putTrack(state.current);$('miniFav').style.color=state.current.favorite?'var(--copper)':'';renderLibrary();renderHome();toast(state.current.favorite?'أضيفت للمفضلة.':'أزيلت من المفضلة.');return}
  const copy=migrateTrack({...state.current,id:newId(),catalogOnly:false,addedAt:Date.now(),lastPlayedAt:Date.now(),lastPosition:player.position||0});delete copy.catalogOnly;delete copy.catalogRef;state.current=copy;state.queue[state.queueIndex]=copy;state.local.unshift(copy);await putTrack(copy);await resolveCover(copy);renderAll();renderPlayer();toast('حُفظ التسجيل في مكتبتك.')
}
$('saveRec').onclick=saveCurrent;$('miniFav').onclick=saveCurrent;

async function downloadVariant(rec,v){
  if(!v.audioUrl){toast('هذه النسخة لا توفر ملفًا صوتيًا مباشرًا.');return} if(v.localAudioKey){toast('هذه النسخة موجودة بلا إنترنت.');return}
  if(!isPersisted(rec)){await saveCurrent();rec=state.current;v=rec.variants.find(x=>x.id===v.id)||v}
  $('downloadProgress').classList.remove('hidden');const bar=$('downloadProgress').querySelector('span');bar.style.width='2%';toast('جارٍ تنزيل النسخة…',60000);
  try{
    const res=await fetch(v.audioUrl,{mode:'cors',credentials:'omit'});if(!res.ok)throw new Error('HTTP '+res.status);const total=Number(res.headers.get('content-length')||0);let blob;
    if(res.body&&total){const reader=res.body.getReader(),chunks=[];let got=0;while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);got+=value.byteLength;bar.style.width=Math.min(99,got/total*100)+'%'}blob=new Blob(chunks,{type:res.headers.get('content-type')||'audio/mpeg'})}else blob=await res.blob();
    const key=`v-${rec.id}-${v.id}`;await putBlob(key,blob);v.localAudioKey=key;v.fileSize=blob.size;await putTrack(rec);bar.style.width='100%';renderVariants();renderLibrary();toast(`اكتمل التنزيل ${fmtBytes(blob.size)} — متاحة بلا إنترنت.`);setTimeout(()=>$('downloadProgress').classList.add('hidden'),700)
  }catch(err){console.warn(err);$('downloadProgress').classList.add('hidden');toast('المصدر يسمح بالتشغيل لكنه منع تنزيل الملف من المتصفح.',4200)}
}
$('downloadCurrent').onclick=()=>state.current&&state.currentVariant&&downloadVariant(state.current,state.currentVariant);

$('addBtn').onclick=()=>{$('addForm').reset();$('sourceHint').textContent='سنحدد نوع المصدر ونأخذ ما يسمح به.';$('addDialog').classList.remove('hidden')};
$('surahDatalist').innerHTML=SURAHS.map(s=>`<option value="${esc(s)}"></option>`).join('');
let sourceTimer;$('addSource').addEventListener('input',()=>{clearTimeout(sourceTimer);sourceTimer=setTimeout(prefillSource,420)});
async function prefillSource(){const val=$('addSource').value.trim();const d=detectSource(val);if(!d){$('sourceHint').textContent=val?'تعذر فهم الرابط.':'سنحدد نوع المصدر ونأخذ ما يسمح به.';return}if(d.provider==='youtube'){const id=youtubeId(val),m=await youtubeMeta(id);if(m){if(!$('addTitle').value)$('addTitle').value=m.title;if(!$('addReciter').value)$('addReciter').value=m.author;$('sourceHint').textContent='تم جلب عنوان YouTube والقناة والصورة. الصوت يبقى مرجعًا/فيديو ما لم تضف ملفًا أو رابط صوت مباشر.'}}else $('sourceHint').textContent=d.audioUrl?'تم التعرف على رابط صوت مباشر — مناسب للخلفية والتنزيل.':`تم التعرف على ${sourceLabel(d)} كمصدر مرجعي.`}
$('addForm').addEventListener('submit',async e=>{e.preventDefault();const title=$('addTitle').value.trim(),reciter=$('addReciter').value.trim();if(!title||!reciter)return;const source=$('addSource').value.trim(),file=$('addFile').files[0],coverFile=$('addCoverFile').files[0];if(!source&&!file){toast('أضف رابطًا أو ملف صوت.');return}const id=newId();const rec=migrateTrack({id,title,reciter,surah:$('addSurah').value.trim(),year:$('addYear').value.trim(),collection:$('addCollection').value.trim(),mosque:$('addMosque').value.trim(),occasion:$('addOccasion').value.trim(),tags:$('addTags').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean),rare:$('addRare').checked,addedAt:Date.now(),variants:[]});const d=source?detectSource(source):null;if(d){if(d.provider==='youtube'){const meta=await youtubeMeta(youtubeId(source));if(meta){d.thumbnail=meta.thumbnail;rec.sourceThumbnail=meta.thumbnail}}rec.variants.push(normalizeVariant({...d,original:$('addOriginal').checked,restored:$('addRestored').checked,qualityLabel:$('addRestored').checked?'منقحة':'',provenance:{discoveredFrom:'إضافة يدوية',originalSource:source,verified:false,confidence:.8}}))}if(file){const key=`v-${id}-local`;await putBlob(key,file);rec.variants.unshift(normalizeVariant({provider:'local',localAudioKey:key,title:file.name,qualityLabel:'ملف الجهاز',fileSize:file.size,original:true,downloadable:true,provenance:{discoveredFrom:'رفع المستخدم',verified:true,confidence:1}}))}if(coverFile){const key=`cover-${id}`;await putBlob(key,coverFile);rec.coverKey=key}await putTrack(rec);await resolveCover(rec);state.local.unshift(rec);$('addDialog').classList.add('hidden');renderAll();toast('أضيف التسجيل إلى الأرشيف.');playRecitation(rec)});

$('addVariantBtn').onclick=$('playerMore').onclick=()=>{if(!state.current)return;$('variantForm').reset();$('variantDialog').classList.remove('hidden')};
$('variantForm').addEventListener('submit',async e=>{e.preventDefault();if(!state.current)return;let rec=state.current;if(!isPersisted(rec)){await saveCurrent();rec=state.current}const source=$('variantSource').value.trim(),file=$('variantFile').files[0];if(!source&&!file){toast('أضف رابطًا أو ملفًا.');return}let base=source?detectSource(source):{provider:'local'};if(!base)base={provider:'generic',sourceUrl:source};const provider=$('variantProvider').value.trim()||base.provider||'generic';const v=normalizeVariant({...base,provider,qualityLabel:$('variantQuality').value.trim(),bitrate:Number($('variantBitrate').value||0),codec:$('variantCodec').value.trim(),original:$('variantOriginal').checked,restored:$('variantRestored').checked,corrected:$('variantCorrected').checked,rare:$('variantRare').checked,provenance:{discoveredFrom:'إضافة يدوية',originalSource:source,verified:!!file,confidence:file?1:.75}});if(file){const key=`v-${rec.id}-${v.id}`;await putBlob(key,file);v.localAudioKey=key;v.fileSize=file.size;v.downloadable=true;v.provider=provider==='generic'?'local':provider}rec.variants.push(v);await putTrack(rec);$('variantDialog').classList.add('hidden');renderVariants();renderHome();toast('أضيفت النسخة دون حذف أي مصدر آخر.')});

function renderAll(){renderHome();renderLibrary();if(state.tab==='search')renderSearch($('searchInput').value);if(state.current)renderPlayer()}

async function loadCatalog(){try{state.reciters=await fetchReciters();state.catalogReady=true;state.catalogError=false}catch(err){console.warn(err);state.catalogError=true}renderAll()}

async function start(){
  try{await migrateLibrary()}catch(err){console.error(err);toast('تعذر فتح مكتبة الجهاز.');state.local=[]}
  renderAll();loadCatalog();
  if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>{});
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  window.addEventListener('beforeunload',()=>{for(const u of state.coverUrls.values())URL.revokeObjectURL(u);if(state.currentObjectUrl)URL.revokeObjectURL(state.currentObjectUrl)});
}
start();
