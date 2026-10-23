/* ── القرآن ──────────────────────────────────────────────────────────────────
   A mushaf reader laid out on real pages. Each Madina mushaf page (604) keeps
   its own ayahs, taken from data/quran/pages.json; the density setting puts one,
   two or five Madina pages on a screen page (five is the Qiyam mushaf: about
   122 pages, al-Baqarah in about ten). Pages turn by swiping (left = next,
   right = previous) or scroll vertically; «اقرأ وافهم» lists one surah with a
   tafsir under every ayah instead. Tapping an ayah opens its tafsir from any of
   the sources below. Al-Muyassar ships with the app (data/quran/NNN.json); the
   others load per surah from api.alquran.cloud and are kept in Cache Storage. */

import { surahCover, normalizeName } from './ui-dossari-only.js';

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(3, '0');
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const TYPE = { meccan:'مكية', medinan:'مدنية' };
const SIZES = [0.8, 0.9, 1, 1.12, 1.26, 1.42, 1.6];
const PREF_KEY = 'tilawat-quran-v1';
const MADINA_PAGES = 604;

const FONTS = [
  { id:'amiri', name:'أميري', family:'TilawatQuran' },
  { id:'scheherazade', name:'شهرزاد', family:'TilawatScheherazade' },
  { id:'naskh', name:'النسخ', family:'TilawatNaskh' }
];
const DENSITIES = [
  { id:1, name:'مصحف المدينة', note:'٦٠٤ صفحات' },
  { id:2, name:'صفحتان في صفحة', note:'٣٠٢ صفحة' },
  { id:5, name:'مصحف القيام', note:'نحو ١٢٢ صفحة' }
];
const VIEWS = [
  { id:'paged', name:'صفحات' },
  { id:'scroll', name:'تمرير' },
  { id:'study', name:'اقرأ وافهم' }
];
const TAFSIRS = [
  { id:'muyassar', name:'الميسر', full:'التفسير الميسر', by:'مجمع الملك فهد' },
  { id:'jalalayn', name:'الجلالين', full:'تفسير الجلالين', by:'المحلي والسيوطي' },
  { id:'baghawi', name:'البغوي', full:'تفسير البغوي', by:'معالم التنزيل' },
  { id:'waseet', name:'الوسيط', full:'التفسير الوسيط', by:'محمد سيد طنطاوي' },
  { id:'qurtubi', name:'القرطبي', full:'تفسير القرطبي', by:'الجامع لأحكام القرآن' }
];

const prefs = (() => {
  const base = { size:2, last:null, filter:'all', view:'paged', density:1, font:'amiri', tafsir:'muyassar' };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch {}
  const p = { ...base, ...saved };
  if (saved.inline && !saved.view) p.view = 'study';
  delete p.inline;
  if (!VIEWS.some(v => v.id === p.view)) p.view = 'paged';
  if (!DENSITIES.some(d => d.id === p.density)) p.density = 1;
  if (!FONTS.some(f => f.id === p.font)) p.font = 'amiri';
  if (!TAFSIRS.some(t => t.id === p.tafsir)) p.tafsir = 'muyassar';
  return p;
})();
function savePrefs(){ try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {} }

const state = { surah:null, unit:1, active:null, observer:null, saveTimer:0, range:[0, 0], sheetToken:0 };
let index = null, pageMap = null, searchText = null;
const surahCache = new Map(), tafsirCache = new Map();

function toast(msg){
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2400);
}

/* ── data ──────────────────────────────────────────────────────────────── */

async function getJSON(url){
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}
async function loadIndex(){ if (!index) index = (await getJSON('./data/quran/index.json')).surahs; return index; }
async function loadPages(){ if (!pageMap) pageMap = await getJSON('./data/quran/pages.json'); return pageMap; }
function loadSurah(n){
  if (!surahCache.has(n)) surahCache.set(n, getJSON(`./data/quran/${pad(n)}.json`).catch(err => { surahCache.delete(n); throw err; }));
  return surahCache.get(n);
}

async function loadTafsir(id, n){
  if (id === 'muyassar') return (await loadSurah(n)).ayahs.map(a => a[1]);
  const key = `${id}/${n}`;
  if (!tafsirCache.has(key)){
    tafsirCache.set(key, (async () => {
      const url = `https://api.alquran.cloud/v1/surah/${n}/ar.${id}`;
      let cache = null;
      try { cache = await caches.open('tilawat-tafsir-v1'); } catch {}
      let res = cache && await cache.match(url);
      if (!res){
        res = await fetch(url);
        if (!res.ok) throw new Error('tafsir ' + res.status);
        if (cache) cache.put(url, res.clone()).catch(() => {});
      }
      const data = (await res.json()).data;
      return data.ayahs.map(a => String(a.text || '').trim());
    })().catch(err => { tafsirCache.delete(key); throw err; }));
  }
  return tafsirCache.get(key);
}

/* ── pages ─────────────────────────────────────────────────────────────── */

const unitCount = () => Math.ceil(MADINA_PAGES / prefs.density);
const unitOfPage = p => Math.ceil(p / prefs.density);
function unitPages(u){
  const first = (u - 1) * prefs.density + 1, out = [];
  for (let p = first; p < first + prefs.density && p <= MADINA_PAGES; p++) out.push(p);
  return out;
}
// Segments of one screen page: [[surah, fromAyah, toAyah], ...], merged across Madina pages.
function unitSegments(u){
  const segs = [];
  for (const p of unitPages(u)) for (const [s, a, b] of pageMap[p - 1]){
    const last = segs.at(-1);
    if (last && last[0] === s && last[2] + 1 === a) last[2] = b; else segs.push([s, a, b]);
  }
  return segs;
}
async function loadUnit(u){
  const segs = unitSegments(u);
  await Promise.all([...new Set(segs.map(x => x[0]))].map(loadSurah));
  return segs;
}

function ayahSpan(doc, i){
  const [text, , , , sajda] = doc.ayahs[i];
  return `<span class="ayah" data-s="${doc.n}" data-a="${i}" tabindex="0">${esc(text)}</span>${sajda ? '<span class="ayah-sajda" title="موضع سجدة">۩</span>' : ''}<span class="ayah-end" aria-label="الآية ${i + 1}">۝${AR(i + 1)}</span> `;
}

function surahBanner(doc){
  return `<div class="surah-banner"><span>سورة ${esc(doc.name)}</span></div>${doc.bismillah ? '<p class="mushaf-bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>' : ''}`;
}

async function pageHTML(u){
  const segs = await loadUnit(u);
  const docs = await Promise.all(segs.map(([s]) => loadSurah(s)));
  const firstDoc = docs[0], juz = firstDoc.ayahs[segs[0][1] - 1][2];
  let body = '';
  segs.forEach(([, from, to], k) => {
    const doc = docs[k];
    if (from === 1) body += surahBanner(doc);
    let lines = '';
    for (let a = from; a <= to; a++) lines += ayahSpan(doc, a - 1);
    body += `<p class="mushaf-lines">${lines}</p>`;
  });
  const madina = unitPages(u);
  const pageLabel = prefs.density === 1 ? `${AR(u)}` : `${AR(u)} · ص ${AR(madina[0])}–${AR(madina.at(-1))}`;
  return `<article class="mushaf-page" data-unit="${u}" aria-label="الصفحة ${u}">
    <header class="mushaf-page__head"><span>الجزء ${AR(juz)}</span><span>سورة ${esc(firstDoc.name)}</span></header>
    <div class="mushaf-page__body">${body}</div>
    <footer class="mushaf-page__foot">${pageLabel}</footer>
  </article>`;
}

function readerStyle(){
  const reader = $('quranReader');
  reader.style.setProperty('--quran-scale', SIZES[prefs.size]);
  reader.style.setProperty('--quran-font', `${FONTS.find(f => f.id === prefs.font).family}, TilawatQuran, serif`);
  reader.dataset.view = prefs.view;
}

function setTitle(s, unit){
  const meta = index?.[s - 1]; if (!meta) return;
  $('quranReaderTitle').textContent = `سورة ${meta.name}`;
  if (prefs.view === 'study') $('quranReaderSub').textContent = `${TYPE[meta.type]} · ${ayahCount(meta.count)}`;
  else $('quranReaderSub').textContent = `صفحة ${AR(unit)} من ${AR(unitCount())}`;
}

/* paged view: one page on screen, turned by swipe, buttons or arrow keys */

async function showUnit(u, dir = 0, focus = null){
  u = Math.max(1, Math.min(unitCount(), u));
  const token = ++showUnit.token;
  const html = await pageHTML(u);
  if (token !== showUnit.token) return;
  state.unit = u;
  const stage = $('quranStagePage');
  stage.innerHTML = html;
  stage.classList.remove('turn-next', 'turn-prev');
  if (dir){ void stage.offsetWidth; stage.classList.add(dir > 0 ? 'turn-next' : 'turn-prev'); }
  $('quranStage').scrollTop = 0;
  $('quranPageNo').textContent = `${AR(u)} / ${AR(unitCount())}`;
  $('quranPrevPage').disabled = u === 1;
  $('quranNextPage').disabled = u === unitCount();
  const [s, a] = unitSegments(u)[0];
  if (focus) flashAyah(focus.s, focus.a); else remember(s, a);
  setTitle(focus?.s || s, u);
  if (u < unitCount()) loadUnit(u + 1).catch(() => {});
}
showUnit.token = 0;

function turn(delta){
  if (prefs.view !== 'paged') return;
  const next = state.unit + delta;
  if (next < 1 || next > unitCount()) return;
  closeSheet();
  showUnit(next, delta);
}

/* scroll view: pages stacked; more load as you reach either end */

async function renderScroll(fromUnit, focus){
  const box = $('quranText');
  box.className = 'quran-pages';
  box.innerHTML = fromUnit > 1 ? '<button class="quran-more" id="quranMoreUp" type="button">الصفحات السابقة</button>' : '';
  box.insertAdjacentHTML('beforeend', '<div class="quran-sentinel" id="quranSentinel" aria-hidden="true"></div>');
  state.range = [fromUnit, fromUnit - 1];
  state.observer?.disconnect(); state.observer = null;
  await appendUnits(3);
  watchScroll();
  if (focus) requestAnimationFrame(() => { scrollToAyah(focus.s, focus.a, false); flashAyah(focus.s, focus.a); });
  else $('quranScroll').scrollTop = 0;
}
async function appendUnits(n){
  const html = [];
  for (let i = 0; i < n && state.range[1] < unitCount(); i++){ state.range[1]++; html.push(await pageHTML(state.range[1])); }
  $('quranSentinel')?.insertAdjacentHTML('beforebegin', html.join(''));
  observeAyahs();
}
async function prependUnits(n){
  const scroller = $('quranScroll'), html = [];
  for (let i = 0; i < n && state.range[0] > 1; i++){ state.range[0]--; html.unshift(await pageHTML(state.range[0])); }
  const before = scroller.scrollHeight;
  $('quranMoreUp').insertAdjacentHTML('afterend', html.join(''));
  scroller.scrollTop += scroller.scrollHeight - before;
  if (state.range[0] <= 1) $('quranMoreUp')?.remove();
  observeAyahs();
}
function watchScroll(){
  state.observer?.disconnect();
  const seen = new Map();
  state.observer = new IntersectionObserver(entries => {
    for (const e of entries){
      if (e.target.id === 'quranSentinel'){
        if (e.isIntersecting && !watchScroll.busy){ watchScroll.busy = true; appendUnits(2).finally(() => { watchScroll.busy = false; }); }
        continue;
      }
      seen.set(e.target, e.isIntersecting);
    }
    const top = [...seen].filter(([el, v]) => v && el.isConnected).map(([el]) => el)
      .sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0];
    if (top){
      const s = Number(top.dataset.s), a = Number(top.dataset.a) + 1;
      remember(s, a);
      setTitle(s, Number(top.closest('[data-unit]')?.dataset.unit || state.unit));
    }
  }, { root:$('quranScroll'), rootMargin:'-80px 0px -60% 0px' });
  const sentinel = $('quranSentinel'); if (sentinel) state.observer.observe(sentinel);
  observeAyahs();
}
function observeAyahs(){
  if (!state.observer) return;
  $('quranText').querySelectorAll('.ayah:not([data-watched]), .ayah-block:not([data-watched])').forEach(el => { el.dataset.watched = '1'; state.observer.observe(el); });
}

/* study view: one surah, a tafsir under every ayah */

async function renderStudy(n, focus){
  const doc = await loadSurah(n), meta = index[n - 1];
  state.surah = doc;
  const box = $('quranText');
  box.className = 'quran-study';
  box.innerHTML = `<header class="quran-surah-head"><img src="${surahCover(n)}" alt=""><div><h1>${esc(doc.name)}</h1><p>${TYPE[doc.type]} · ${ayahCount(meta.count)} · تبدأ في الجزء ${AR(meta.juz)}، صفحة ${AR(meta.page)}</p></div></header>
    <div class="quran-study__source" id="quranStudySource"></div>
    ${doc.bismillah ? '<p class="mushaf-bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>' : ''}
    <div id="quranStudyList">${doc.ayahs.map((a, i) => `<article class="ayah-block" data-s="${n}" data-a="${i}"><p class="ayah ayah--block" data-s="${n}" data-a="${i}">${esc(a[0])}${a[4] ? ' <span class="ayah-sajda">۩</span>' : ''} <span class="ayah-end">۝${AR(i + 1)}</span></p><p class="ayah-tafsir">${esc(a[1])}</p></article>`).join('')}</div>
    <nav class="quran-nav" aria-label="السور المجاورة">
      ${n > 1 ? `<button class="quran-nav__btn" type="button" data-quran-open="${n - 1}"><small>السورة السابقة</small><b>سورة ${esc(index[n - 2].name)}</b></button>` : '<span></span>'}
      ${n < 114 ? `<button class="quran-nav__btn quran-nav__btn--next" type="button" data-quran-open="${n + 1}"><small>السورة التالية</small><b>سورة ${esc(index[n].name)}</b></button>` : ''}
    </nav>`;
  renderStudySource();
  if (prefs.tafsir !== 'muyassar') fillStudyTafsir(n);
  setTitle(n, state.unit);
  state.observer?.disconnect();
  const seen = new Map();
  state.observer = new IntersectionObserver(entries => {
    for (const e of entries) seen.set(e.target, e.isIntersecting);
    const vis = [...seen].filter(([el, v]) => v && el.isConnected).map(([el]) => Number(el.dataset.a));
    if (vis.length) remember(n, Math.min(...vis) + 1);
  }, { root:$('quranScroll'), rootMargin:'-80px 0px -60% 0px' });
  observeAyahs();
  if (focus?.a > 0) requestAnimationFrame(() => scrollToAyah(n, focus.a, false));
  else $('quranScroll').scrollTop = 0;
}
function renderStudySource(){
  const slot = $('quranStudySource'); if (!slot) return;
  slot.innerHTML = `<span>التفسير:</span>${TAFSIRS.map(t => `<button type="button" data-study-tafsir="${t.id}" aria-pressed="${t.id === prefs.tafsir}">${t.name}</button>`).join('')}`;
}
async function fillStudyTafsir(n){
  const list = $('quranStudyList'); if (!list) return;
  const id = prefs.tafsir;
  list.querySelectorAll('.ayah-tafsir').forEach(p => p.classList.add('is-loading'));
  try {
    const texts = await loadTafsir(id, n);
    if (prefs.tafsir !== id || state.surah?.n !== n) return;
    list.querySelectorAll('.ayah-tafsir').forEach((p, i) => { p.textContent = texts[i] || 'لا يوجد تفسير لهذه الآية في هذا المصدر.'; p.classList.remove('is-loading'); });
  } catch {
    list.querySelectorAll('.ayah-tafsir').forEach(p => p.classList.remove('is-loading'));
    toast('تعذّر تحميل هذا التفسير. يظهر الميسر حتى يرجع الاتصال.');
  }
}

/* ── open, close, remember ─────────────────────────────────────────────── */

function ayahCount(n){ return n === 1 ? 'آية واحدة' : n === 2 ? 'آيتان' : n <= 10 ? `${AR(n)} آيات` : `${AR(n)} آية`; }

async function openReader(n, ayah = 0){
  n = Number(n); if (!(n >= 1 && n <= 114)) return;
  const reader = $('quranReader');
  reader.classList.remove('hidden'); reader.setAttribute('aria-busy', 'true');
  document.documentElement.classList.add('quran-reading');
  closeSheet(); closePanel();
  readerStyle();
  const paged = prefs.view === 'paged';
  $('quranStage').classList.toggle('hidden', !paged);
  $('quranPager').classList.toggle('hidden', !paged);
  $('quranScroll').classList.toggle('hidden', paged);
  try {
    await Promise.all([loadIndex(), loadPages()]);
    const doc = await loadSurah(n);
    state.surah = doc;
    const a = Math.max(1, Math.min(doc.ayahs.length, ayah || 1));
    const unit = unitOfPage(doc.ayahs[a - 1][3]);
    const focus = ayah > 1 ? { s:n, a:a - 1 } : null;
    if (paged) await showUnit(unit, 0, focus);
    else if (prefs.view === 'scroll') await renderScroll(unit, focus || { s:n, a:a - 1 });
    else await renderStudy(n, focus);
    remember(n, a);
  } catch {
    const msg = '<p class="quran-loading">تعذّر فتح السورة. تحقق من الاتصال وحاول مرة ثانية.</p>';
    if (paged) $('quranStagePage').innerHTML = msg; else $('quranText').innerHTML = msg;
  } finally { reader.removeAttribute('aria-busy'); }
  $('quranBack').focus({ preventScroll:true });
}

function refreshHomeCard(){
  const slot = document.querySelector('.shelf--quran');
  if (slot) slot.innerHTML = homeQuranCard();
}

function closeReader(){
  savePrefs();
  closeSheet(); closePanel();
  $('quranReader').classList.add('hidden');
  document.documentElement.classList.remove('quran-reading');
  state.observer?.disconnect(); state.observer = null;
  renderContinue();
  refreshHomeCard();
}

function remember(n, a){
  const meta = index?.[n - 1];
  prefs.last = { n, a, at:Date.now(), name:meta?.name || prefs.last?.name || '', count:meta?.count || 0 };
  clearTimeout(state.saveTimer); state.saveTimer = setTimeout(savePrefs, 400);
}

function findAyah(s, a){ return document.querySelector(`#quranReader .ayah[data-s="${s}"][data-a="${a}"]`); }
function scrollToAyah(s, a, smooth){
  const el = findAyah(s, a); if (!el) return;
  const box = prefs.view === 'paged' ? $('quranStage') : $('quranScroll');
  const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 110;
  box.scrollTo({ top:Math.max(0, top), behavior:smooth ? 'smooth' : 'auto' });
}
function flashAyah(s, a){
  const el = findAyah(s, a); if (!el) return;
  if (prefs.view === 'paged') scrollToAyah(s, a, false);
  el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1600);
}

/* ── tafsir sheet ──────────────────────────────────────────────────────── */

function setActive(s, i){
  document.querySelectorAll('#quranReader .is-active').forEach(el => el.classList.remove('is-active'));
  state.active = s ? { s, a:i } : null;
  if (s) document.querySelectorAll(`#quranReader [data-s="${s}"][data-a="${i}"]`).forEach(el => el.classList.add('is-active'));
}

async function openSheet(s, i){
  const doc = await loadSurah(s); if (i < 0 || i >= doc.ayahs.length) return;
  setActive(s, i);
  $('quranSheetTitle').textContent = `سورة ${doc.name} · الآية ${AR(i + 1)}`;
  $('quranSheetAyah').textContent = doc.ayahs[i][0];
  $('quranSheetPrev').disabled = s === 1 && i === 0;
  $('quranSheetNext').disabled = s === 114 && i === doc.ayahs.length - 1;
  renderSheetSources();
  $('quranSheet').classList.remove('hidden');
  $('quranSheet').querySelector('.quran-sheet__body').scrollTop = 0;
  remember(s, i + 1);
  fillSheetTafsir();
}
function renderSheetSources(){
  $('quranSheetSources').innerHTML = TAFSIRS.map(t => `<button type="button" data-sheet-tafsir="${t.id}" aria-pressed="${t.id === prefs.tafsir}">${t.name}</button>`).join('');
}
async function fillSheetTafsir(){
  const cur = state.active; if (!cur) return;
  const t = TAFSIRS.find(x => x.id === prefs.tafsir), token = ++state.sheetToken;
  $('quranSheetLabel').textContent = `${t.full} · ${t.by}`;
  const out = $('quranSheetTafsir');
  out.textContent = 'يجهّز التفسير…'; out.classList.add('is-loading');
  try {
    const texts = await loadTafsir(t.id, cur.s);
    if (token !== state.sheetToken) return;
    out.textContent = texts[cur.a] || 'لا يوجد تفسير لهذه الآية في هذا المصدر.';
  } catch {
    if (token !== state.sheetToken) return;
    out.textContent = 'تعذّر تحميل هذا التفسير الآن. تحقق من الاتصال، أو اختر الميسر فهو محفوظ في التطبيق.';
  } finally { if (token === state.sheetToken) out.classList.remove('is-loading'); }
}
async function stepSheet(delta){
  const cur = state.active; if (!cur) return;
  let s = cur.s, a = cur.a + delta;
  const doc = await loadSurah(s);
  if (a >= doc.ayahs.length && s < 114){ s++; a = 0; }
  if (a < 0 && s > 1){ s--; a = (await loadSurah(s)).ayahs.length - 1; }
  if (prefs.view === 'paged' && !findAyah(s, a)){
    await loadPages();
    await showUnit(unitOfPage((await loadSurah(s)).ayahs[a][3]), delta);
  }
  await openSheet(s, a);
  scrollToAyah(s, a, true);
}
function closeSheet(){ $('quranSheet')?.classList.add('hidden'); setActive(null); }

async function copyAyah(){
  const cur = state.active; if (!cur) return;
  const doc = await loadSurah(cur.s);
  const text = `${doc.ayahs[cur.a][0]} ﴿${AR(cur.a + 1)}﴾ [سورة ${doc.name}]`;
  try { await navigator.clipboard.writeText(text); toast('نُسخت الآية'); }
  catch { toast('ما قدرت أنسخ، حدّد النص يدويًا.'); }
}

/* ── settings panel ────────────────────────────────────────────────────── */

function renderPanel(){
  const group = (title, attr, items, current, label = x => x.name, note = x => x.note) =>
    `<div class="quran-panel__group"><span class="quran-panel__label">${title}</span><div class="quran-panel__options">${items.map(x =>
      `<button type="button" data-${attr}="${x.id}" aria-pressed="${String(x.id) === String(current)}"><b>${label(x)}</b>${note(x) ? `<small>${note(x)}</small>` : ''}</button>`).join('')}</div></div>`;
  $('quranPanelBody').innerHTML =
    group('طريقة القراءة', 'q-view', VIEWS, prefs.view, x => x.name, () => '') +
    group('كثافة الصفحة', 'q-density', DENSITIES, prefs.density) +
    group('نوع الخط', 'q-font', FONTS, prefs.font, x => `<span style="font-family:${x.family},serif">${x.name}</span>`, () => '') +
    `<div class="quran-panel__group"><span class="quran-panel__label">حجم الخط</span><div class="quran-panel__size"><button type="button" id="quranSmaller" aria-label="تصغير الخط" ${prefs.size === 0 ? 'disabled' : ''}>أ−</button><span>${AR(Math.round(SIZES[prefs.size] * 100))}٪</span><button type="button" id="quranBigger" aria-label="تكبير الخط" ${prefs.size === SIZES.length - 1 ? 'disabled' : ''}>أ+</button></div></div>` +
    group('التفسير المفضّل', 'q-tafsir', TAFSIRS, prefs.tafsir, x => x.name, () => '');
}
function openPanel(){
  renderPanel();
  $('quranPanel').classList.remove('hidden');
  $('quranViewBtn').setAttribute('aria-expanded', 'true');
}
function closePanel(){ $('quranPanel')?.classList.add('hidden'); $('quranViewBtn')?.setAttribute('aria-expanded', 'false'); }

async function applyLayout(){
  savePrefs(); readerStyle();
  const last = prefs.last;
  if (last?.n) await openReader(last.n, last.a);
  openPanel();
}

/* ── index ─────────────────────────────────────────────────────────────── */

function rowHTML(s){
  return `<li><button class="quran-row" type="button" data-quran-open="${s.n}" aria-label="سورة ${esc(s.name)}، ${TYPE[s.type]}، ${s.count} آية">
    <span class="quran-num" aria-hidden="true">${AR(s.n)}</span>
    <span class="quran-row__text"><b>${esc(s.name)}</b><small>${TYPE[s.type]} · ${ayahCount(s.count)} · الجزء ${AR(s.juz)} · صفحة ${AR(s.page)}</small></span>
    <img class="quran-row__art" src="${surahCover(s.n)}" alt="" loading="lazy" decoding="async">
  </button></li>`;
}

function renderContinue(){
  const slot = $('quranContinue'); if (!slot) return;
  const last = prefs.last, s = last && index?.[last.n - 1];
  if (!s){ slot.innerHTML = ''; return; }
  const pct = Math.max(2, Math.round(last.a / s.count * 100));
  slot.innerHTML = `<button class="quran-continue" type="button" data-quran-open="${s.n}" data-quran-ayah="${last.a}">
    <img src="${surahCover(s.n)}" alt="">
    <span class="quran-continue__text"><small>تابع القراءة</small><b>سورة ${esc(s.name)}</b><span>الآية ${AR(last.a)} من ${AR(s.count)}</span>
      <span class="quran-continue__bar" aria-hidden="true"><i style="width:${pct}%"></i></span></span>
    <span class="quran-continue__go" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg></span>
  </button>`;
}

async function renderIndex(){
  if (!index) return;
  const raw = $('quranSearch').value || '';
  const q = normalizeName(raw).replace(/^سوره\s+/, '');
  const digits = q.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const list = index.filter(s => (prefs.filter === 'all' || s.type === prefs.filter)
    && (!q || normalizeName(s.name).includes(q) || String(s.n) === digits));
  $('quranIndex').innerHTML = list.map(rowHTML).join('')
    || (q.length < 3 ? `<li class="quran-empty"><b>ما في سورة بهذا الاسم</b><span>جرّب جزءًا من الاسم أو رقم السورة.</span></li>` : '');
  document.querySelectorAll('#quranSegs button').forEach(b => b.classList.toggle('on', b.dataset.qseg === prefs.filter));
  renderContinue();
  renderAyahHits($('quranAyahHits'), /^\d+$/.test(digits) ? '' : raw, 40);
}

async function showIndex(){
  try { await loadIndex(); renderIndex(); }
  catch { $('quranIndex').innerHTML = `<li class="quran-empty"><b>تعذّر تحميل فهرس السور</b><span>تحقق من الاتصال ثم افتح القسم مرة ثانية.</span></li>`; }
}

/* ── ayah search ───────────────────────────────────────────────────────── */

// Same normalisation as tools/build_quran_data.py applies to search.json.
function normalizeSearch(t){
  return String(t || '').replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ﻿]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ').trim();
}
async function loadSearch(){ if (!searchText) searchText = await getJSON('./data/quran/search.json'); return searchText; }

async function searchAyahs(query, limit){
  const q = normalizeSearch(query);
  if (q.replace(/\s/g, '').length < 3) return { q, hits:[], total:0 };
  const [all] = await Promise.all([loadSearch(), loadIndex()]);
  const words = q.split(' ');
  const hits = []; let total = 0;
  all.forEach((ayahs, si) => ayahs.forEach((text, ai) => {
    if (words.every(w => text.includes(w))){ total++; if (hits.length < limit) hits.push({ s:si + 1, a:ai + 1, text }); }
  }));
  return { q, hits, total };
}
function highlight(text, q){
  let out = esc(text);
  for (const w of q.split(' ').filter(Boolean).sort((a, b) => b.length - a.length)) out = out.split(esc(w)).join(`<mark>${esc(w)}</mark>`);
  return out;
}
const hitTokens = new WeakMap();
async function renderAyahHits(slot, query, limit){
  if (!slot) return;
  const token = (hitTokens.get(slot) || 0) + 1;
  hitTokens.set(slot, token);
  if (normalizeSearch(query).replace(/\s/g, '').length < 3){ slot.innerHTML = ''; return; }
  let res;
  try { res = await searchAyahs(query, limit); } catch { slot.innerHTML = ''; return; }
  if (hitTokens.get(slot) !== token) return;
  if (!res.total){ slot.innerHTML = `<div class="ayah-hits"><h2>في الآيات</h2><p class="ayah-hits__none">ما لقيت آية فيها «${esc(query.trim())}».</p></div>`; return; }
  slot.innerHTML = `<div class="ayah-hits"><h2>في الآيات <small>${AR(res.total)} نتيجة${res.total > res.hits.length ? `، أول ${AR(res.hits.length)}` : ''}</small></h2>
    <ol>${res.hits.map(h => `<li><button class="ayah-hit" type="button" data-quran-open="${h.s}" data-quran-ayah="${h.a}"><small>سورة ${esc(index[h.s - 1].name)} · الآية ${AR(h.a)}</small><span>${highlight(h.text, res.q)}</span></button></li>`).join('')}</ol></div>`;
}

/* The home screen shows where reading stopped, or an invitation to start. */
function homeQuranCard(){
  const last = prefs.last;
  if (last?.n && last.name){
    const pct = last.count ? Math.max(2, Math.round(last.a / last.count * 100)) : 0;
    return `<button class="home-quran" type="button" data-quran-open="${last.n}" data-quran-ayah="${last.a}">
      <img src="${surahCover(last.n)}" alt="">
      <span class="home-quran__text"><small>تابع القراءة</small><b>سورة ${esc(last.name)}</b><span>الآية ${AR(last.a)}${last.count ? ` من ${AR(last.count)}` : ''}</span>
      ${pct ? `<span class="quran-continue__bar" aria-hidden="true"><i style="width:${pct}%"></i></span>` : ''}</span></button>`;
  }
  return `<button class="home-quran home-quran--start" type="button" data-open-tab="quran">
    <span class="home-quran__glyph" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 6.5C10 5 7.5 4.5 4 4.5v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-14c-3.5 0-6 .5-8 2Z"/><path d="M12 6.5v14"/></svg></span>
    <span class="home-quran__text"><small>جديد في تلاوات</small><b>اقرأ القرآن وافهمه</b><span>صفحات المصحف، وتفسير كل آية بضغطة.</span></span></button>`;
}

/* ── wiring ────────────────────────────────────────────────────────────── */

let swipeGuard = 0;
function bindSwipe(){
  const stage = $('quranStage'), page = $('quranStagePage');
  let start = null;
  stage.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button !== 0) return; start = { x:e.clientX, y:e.clientY, t:Date.now(), dx:0 }; });
  stage.addEventListener('pointermove', e => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3){ start.dx = dx; page.style.transform = `translateX(${dx * 0.6}px)`; page.style.transition = 'none'; }
  });
  const end = () => {
    if (!start) return;
    const dx = start.dx, fast = Date.now() - start.t < 320;
    page.style.transform = ''; page.style.transition = '';
    start = null;
    // Swipe left goes forward, swipe right goes back.
    if (Math.abs(dx) > (fast ? 40 : 90)){ swipeGuard = Date.now(); turn(dx < 0 ? 1 : -1); }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}

function init(){
  if (!$('quranView')) return;
  readerStyle();
  bindSwipe();

  // The search tab gets a «في الآيات» section under its own results.
  const searchView = $('searchView');
  if (searchView && !$('searchAyahs')){
    searchView.insertAdjacentHTML('beforeend', '<div id="searchAyahs"></div>');
    let t = 0;
    $('searchInput')?.addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => renderAyahHits($('searchAyahs'), e.target.value, 30), 220); });
  }

  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-open-tab]');
    if (tab){ document.querySelector(`.tab[data-tab="${tab.dataset.openTab}"]`)?.click(); return; }
    const open = e.target.closest('[data-quran-open]');
    if (open){ e.preventDefault(); openReader(open.dataset.quranOpen, Number(open.dataset.quranAyah || 0)); return; }
    if (e.target.closest('#quranStage, #quranText')){
      if (Date.now() - swipeGuard < 400) return;
      const ayah = e.target.closest('.ayah, .ayah-block');
      if (ayah) openSheet(Number(ayah.dataset.s), Number(ayah.dataset.a));
    }
  });
  $('quranReader').addEventListener('keydown', e => {
    const ayah = e.target.closest?.('.ayah');
    if (ayah && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openSheet(Number(ayah.dataset.s), Number(ayah.dataset.a)); }
  });

  let searchTimer = 0;
  $('quranSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderIndex, 180); });
  $('quranSegs').addEventListener('click', e => {
    const b = e.target.closest('[data-qseg]'); if (!b) return;
    prefs.filter = b.dataset.qseg; savePrefs(); renderIndex();
  });

  $('quranBack').onclick = closeReader;
  $('quranListen').onclick = () => {
    const s = prefs.last?.n || state.surah?.n; if (!s) return;
    document.dispatchEvent(new CustomEvent('tilawat:listen-surah', { detail:{ surah:s } }));
  };
  $('quranPrevPage').onclick = () => turn(-1);
  $('quranNextPage').onclick = () => turn(1);
  $('quranViewBtn').onclick = () => $('quranPanel').classList.contains('hidden') ? openPanel() : closePanel();
  $('quranPanelClose').onclick = closePanel;
  $('quranPanel').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'quranSmaller' || b.id === 'quranBigger'){
      prefs.size = Math.max(0, Math.min(SIZES.length - 1, prefs.size + (b.id === 'quranBigger' ? 1 : -1)));
      savePrefs(); readerStyle(); renderPanel(); return;
    }
    if (b.dataset.qFont){ prefs.font = b.dataset.qFont; savePrefs(); readerStyle(); renderPanel(); return; }
    if (b.dataset.qTafsir){
      prefs.tafsir = b.dataset.qTafsir; savePrefs(); renderPanel();
      if (prefs.view === 'study' && state.surah){ renderStudySource(); fillStudyTafsir(state.surah.n); }
      return;
    }
    if (b.dataset.qView){ prefs.view = b.dataset.qView; await applyLayout(); return; }
    if (b.dataset.qDensity){ prefs.density = Number(b.dataset.qDensity); await applyLayout(); }
  });
  $('quranText').addEventListener('click', e => {
    if (e.target.id === 'quranMoreUp'){ prependUnits(2); return; }
    const b = e.target.closest('[data-study-tafsir]');
    if (b && state.surah){ prefs.tafsir = b.dataset.studyTafsir; savePrefs(); renderStudySource(); fillStudyTafsir(state.surah.n); }
  });

  $('quranSheetClose').onclick = closeSheet;
  $('quranSheetPrev').onclick = () => stepSheet(-1);
  $('quranSheetNext').onclick = () => stepSheet(1);
  $('quranSheetCopy').onclick = copyAyah;
  $('quranSheetSources').addEventListener('click', e => {
    const b = e.target.closest('[data-sheet-tafsir]'); if (!b) return;
    prefs.tafsir = b.dataset.sheetTafsir; savePrefs(); renderSheetSources(); fillSheetTafsir();
  });

  document.addEventListener('keydown', e => {
    if ($('quranReader').classList.contains('hidden')) return;
    if (document.querySelector('.dialog:not(.hidden)') || !$('playerPage')?.classList.contains('hidden')) return;
    if (e.key === 'Escape'){
      e.preventDefault();
      if (!$('quranSheet').classList.contains('hidden')) closeSheet();
      else if (!$('quranPanel').classList.contains('hidden')) closePanel();
      else closeReader();
      return;
    }
    if (/input|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'ArrowLeft'){ e.preventDefault(); turn(1); }
    if (e.key === 'ArrowRight'){ e.preventDefault(); turn(-1); }
  });

  document.addEventListener('tilawat:tab', e => {
    if (e.detail?.tab === 'quran') showIndex();
    else if (!$('quranReader').classList.contains('hidden')) closeReader();
    refreshHomeCard();
  });
}

init();

export { openReader as openQuranReader, closeReader as closeQuranReader, homeQuranCard };
