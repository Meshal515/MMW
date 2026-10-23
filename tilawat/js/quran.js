/* ── القرآن ──────────────────────────────────────────────────────────────────
   A reader for the whole mushaf with التفسير الميسر beside every ayah.
   Text and tafsir ship with the app as one JSON file per surah
   (data/quran/NNN.json, built by tools/build_quran_data.py), so reading works
   offline once a surah has been opened. Tapping an ayah opens its tafsir;
   «اقرأ وافهم» shows the tafsir under every ayah. The last ayah on screen is
   remembered so «تابع القراءة» returns to it. */

import { surahCover, normalizeName } from './ui-dossari-only.js';

const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(3, '0');
const AR = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const TYPE = { meccan:'مكية', medinan:'مدنية' };
const SIZES = [0.82, 0.92, 1, 1.12, 1.26, 1.42, 1.6];
const PREF_KEY = 'tilawat-quran-v1';

const prefs = (() => {
  const base = { size:2, inline:false, last:null, filter:'all' };
  try { return { ...base, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return base; }
})();
function savePrefs(){ try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {} }

let index = null;
const surahCache = new Map();
const state = { surah:null, active:-1, observer:null, saveTimer:0 };

function toast(msg){
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2400);
}

async function loadIndex(){
  if (!index){
    const res = await fetch('./data/quran/index.json');
    if (!res.ok) throw new Error('index ' + res.status);
    index = (await res.json()).surahs;
  }
  return index;
}
function loadSurah(n){
  if (!surahCache.has(n)){
    surahCache.set(n, fetch(`./data/quran/${pad(n)}.json`).then(res => {
      if (!res.ok) throw new Error('surah ' + res.status);
      return res.json();
    }).catch(err => { surahCache.delete(n); throw err; }));
  }
  return surahCache.get(n);
}

/* ── index ─────────────────────────────────────────────────────────────── */

function ayahCount(n){ return n === 1 ? 'آية واحدة' : n === 2 ? 'آيتان' : n <= 10 ? `${AR(n)} آيات` : `${AR(n)} آية`; }

function rowHTML(s){
  return `<li><button class="quran-row" type="button" data-quran-open="${s.n}" aria-label="سورة ${esc(s.name)}، ${TYPE[s.type]}، ${s.count} آية">
    <span class="quran-num" aria-hidden="true">${AR(s.n)}</span>
    <span class="quran-row__text"><b>${esc(s.name)}</b><small>${TYPE[s.type]} · ${ayahCount(s.count)} · الجزء ${AR(s.juz)}</small></span>
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

function renderIndex(){
  if (!index) return;
  const q = normalizeName($('quranSearch').value || '').replace(/^سوره\s+/, '');
  const digits = q.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const list = index.filter(s => (prefs.filter === 'all' || s.type === prefs.filter)
    && (!q || normalizeName(s.name).includes(q) || String(s.n) === digits));
  $('quranIndex').innerHTML = list.map(rowHTML).join('')
    || `<li class="quran-empty"><b>ما في سورة بهذا الاسم</b><span>جرّب جزءًا من الاسم أو رقم السورة.</span></li>`;
  document.querySelectorAll('#quranSegs button').forEach(b => b.classList.toggle('on', b.dataset.qseg === prefs.filter));
  renderContinue();
}

async function showIndex(){
  try { await loadIndex(); renderIndex(); }
  catch { $('quranIndex').innerHTML = `<li class="quran-empty"><b>تعذّر تحميل فهرس السور</b><span>تحقق من الاتصال ثم افتح القسم مرة ثانية.</span></li>`; }
}

/* ── reader ────────────────────────────────────────────────────────────── */

function textSizeVar(){ $('quranReader').style.setProperty('--quran-scale', SIZES[prefs.size]); }

function ayahHTML(doc, i){
  const [text, tafsir, , , sajda] = doc.ayahs[i];
  const mark = `<span class="ayah-no" aria-label="الآية ${i + 1}">﴿${AR(i + 1)}﴾</span>`;
  const sj = sajda ? '<span class="ayah-sajda" title="موضع سجدة">۩</span>' : '';
  if (prefs.inline){
    return `<article class="ayah-block" data-a="${i}"><p class="ayah ayah--block" data-a="${i}">${esc(text)} ${sj}${mark}</p><p class="ayah-tafsir">${esc(tafsir)}</p></article>`;
  }
  return `<span class="ayah" data-a="${i}" tabindex="0">${esc(text)}</span>${sj}${mark} `;
}

function bodyHTML(doc){
  let html = '', juz = doc.ayahs[0][2];
  if (!prefs.inline) html += '<p class="mushaf">';
  doc.ayahs.forEach((ayah, i) => {
    if (i > 0 && ayah[2] !== juz){
      juz = ayah[2];
      const marker = `<span class="juz-mark"><span>الجزء ${AR(juz)}</span></span>`;
      html += prefs.inline ? marker : `</p>${marker}<p class="mushaf">`;
    }
    html += ayahHTML(doc, i);
  });
  if (!prefs.inline) html += '</p>';
  return html;
}

function renderReaderBody(){
  const doc = state.surah; if (!doc) return;
  const meta = index[doc.n - 1];
  $('quranReaderTitle').textContent = `سورة ${doc.name}`;
  $('quranReaderSub').textContent = `${TYPE[doc.type]} · ${ayahCount(meta.count)}`;
  $('quranHeadArt').src = surahCover(doc.n);
  $('quranHeadName').textContent = doc.name;
  $('quranHeadMeta').textContent = `${TYPE[doc.type]} · ${ayahCount(meta.count)} · تبدأ في الجزء ${AR(meta.juz)}، صفحة ${AR(meta.page)}`;
  $('quranBismillah').hidden = !doc.bismillah;
  $('quranText').className = 'quran-text' + (prefs.inline ? ' is-inline' : '');
  $('quranText').innerHTML = bodyHTML(doc);
  $('quranInlineBtn').setAttribute('aria-pressed', String(prefs.inline));
  const prev = doc.n > 1 ? index[doc.n - 2] : null, next = doc.n < 114 ? index[doc.n] : null;
  $('quranPrev').hidden = !prev; $('quranNext').hidden = !next;
  if (prev) { $('quranPrev').dataset.quranOpen = prev.n; $('quranPrev').querySelector('b').textContent = `سورة ${prev.name}`; }
  if (next) { $('quranNext').dataset.quranOpen = next.n; $('quranNext').querySelector('b').textContent = `سورة ${next.name}`; }
  watchProgress();
}

function scrollToAyah(a, smooth){
  const el = $('quranText').querySelector(`[data-a="${a}"]`);
  if (!el) return;
  const box = $('quranScroll'), top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 120;
  box.scrollTo({ top:Math.max(0, top), behavior:smooth ? 'smooth' : 'auto' });
}

async function openReader(n, ayah = 0){
  n = Number(n); if (!(n >= 1 && n <= 114)) return;
  const reader = $('quranReader');
  reader.classList.remove('hidden'); reader.setAttribute('aria-busy', 'true');
  document.documentElement.classList.add('quran-reading');
  closeSheet(); closePanel();
  if (state.surah?.n !== n) $('quranText').innerHTML = '<p class="quran-loading">يجهّز السورة…</p>';
  try {
    await loadIndex();
    state.surah = await loadSurah(n);
    renderReaderBody();
    $('quranScroll').scrollTop = 0;
    if (ayah > 0) requestAnimationFrame(() => scrollToAyah(ayah - 1, false));
    else remember(n, 1);
  } catch {
    $('quranText').innerHTML = '<p class="quran-loading">تعذّر فتح السورة. تحقق من الاتصال وحاول مرة ثانية.</p>';
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
  state.observer?.disconnect();
  renderContinue();
  refreshHomeCard();
}

function remember(n, a){
  const meta = index?.[n - 1];
  prefs.last = { n, a, at:Date.now(), name:meta?.name || prefs.last?.name || '', count:meta?.count || 0 };
  clearTimeout(state.saveTimer); state.saveTimer = setTimeout(savePrefs, 400);
}

function watchProgress(){
  state.observer?.disconnect();
  const seen = new Map();
  state.observer = new IntersectionObserver(entries => {
    for (const e of entries) seen.set(e.target, e.isIntersecting);
    const visible = [...seen].filter(([, v]) => v).map(([el]) => Number(el.dataset.a));
    if (visible.length && state.surah) remember(state.surah.n, Math.min(...visible) + 1);
  }, { root:$('quranScroll'), rootMargin:'-90px 0px -55% 0px' });
  $('quranText').querySelectorAll(prefs.inline ? '.ayah-block' : '.ayah').forEach(el => state.observer.observe(el));
}

/* ── tafsir sheet ──────────────────────────────────────────────────────── */

function setActive(i){
  $('quranText').querySelectorAll('.is-active').forEach(el => el.classList.remove('is-active'));
  state.active = i;
  if (i >= 0) $('quranText').querySelectorAll(`[data-a="${i}"]`).forEach(el => el.classList.add('is-active'));
}

function openSheet(i){
  const doc = state.surah; if (!doc || i < 0 || i >= doc.ayahs.length) return;
  const [text, tafsir] = doc.ayahs[i];
  setActive(i);
  $('quranSheetTitle').textContent = `الآية ${AR(i + 1)} · سورة ${doc.name}`;
  $('quranSheetAyah').textContent = text;
  $('quranSheetTafsir').textContent = tafsir;
  $('quranSheetPrev').disabled = i === 0;
  $('quranSheetNext').disabled = i === doc.ayahs.length - 1;
  $('quranSheet').classList.remove('hidden');
  $('quranSheet').querySelector('.quran-sheet__body').scrollTop = 0;
  remember(doc.n, i + 1);
}
function closeSheet(){ $('quranSheet')?.classList.add('hidden'); setActive(-1); }

function closePanel(){ $('quranPanel')?.classList.add('hidden'); $('quranSizeBtn')?.setAttribute('aria-expanded', 'false'); }

async function copyAyah(){
  const doc = state.surah, i = state.active; if (!doc || i < 0) return;
  const text = `${doc.ayahs[i][0]} ﴿${AR(i + 1)}﴾ [سورة ${doc.name}]`;
  try { await navigator.clipboard.writeText(text); toast('نُسخت الآية'); }
  catch { toast('ما قدرت أنسخ، حدّد النص يدويًا.'); }
}

/* ── wiring ────────────────────────────────────────────────────────────── */

function init(){
  if (!$('quranView')) return;
  textSizeVar();

  document.addEventListener('click', e => {
    const tab = e.target.closest('[data-open-tab]');
    if (tab){ document.querySelector(`.tab[data-tab="${tab.dataset.openTab}"]`)?.click(); return; }
    const open = e.target.closest('[data-quran-open]');
    if (open){ e.preventDefault(); openReader(open.dataset.quranOpen, Number(open.dataset.quranAyah || 0)); return; }
    if (e.target.closest('#quranText')){
      const ayah = e.target.closest('[data-a]');
      if (ayah) openSheet(Number(ayah.dataset.a));
    }
  });
  $('quranText').addEventListener('keydown', e => {
    const ayah = e.target.closest('.ayah');
    if (ayah && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openSheet(Number(ayah.dataset.a)); }
  });

  $('quranSearch').addEventListener('input', renderIndex);
  $('quranSegs').addEventListener('click', e => {
    const b = e.target.closest('[data-qseg]'); if (!b) return;
    prefs.filter = b.dataset.qseg; savePrefs(); renderIndex();
  });

  $('quranBack').onclick = closeReader;
  $('quranListen').onclick = () => {
    if (!state.surah) return;
    document.dispatchEvent(new CustomEvent('tilawat:listen-surah', { detail:{ surah:state.surah.n } }));
  };
  $('quranInlineBtn').onclick = () => {
    const keep = prefs.last?.n === state.surah?.n ? prefs.last.a : 0;
    prefs.inline = !prefs.inline; savePrefs(); closeSheet(); renderReaderBody();
    if (keep > 1) requestAnimationFrame(() => scrollToAyah(keep - 1, false));
    toast(prefs.inline ? 'التفسير ظاهر تحت كل آية' : 'رجعت لعرض المصحف');
  };
  $('quranSizeBtn').onclick = () => {
    const panel = $('quranPanel'), open = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !open);
    $('quranSizeBtn').setAttribute('aria-expanded', String(open));
  };
  const step = d => {
    prefs.size = Math.max(0, Math.min(SIZES.length - 1, prefs.size + d)); savePrefs(); textSizeVar();
    $('quranSmaller').disabled = prefs.size === 0; $('quranBigger').disabled = prefs.size === SIZES.length - 1;
  };
  $('quranSmaller').onclick = () => step(-1);
  $('quranBigger').onclick = () => step(1);
  step(0);

  $('quranSheetClose').onclick = closeSheet;
  $('quranSheetPrev').onclick = () => { openSheet(state.active - 1); scrollToAyah(state.active, true); };
  $('quranSheetNext').onclick = () => { openSheet(state.active + 1); scrollToAyah(state.active, true); };
  $('quranSheetCopy').onclick = copyAyah;
  $('quranScroll').addEventListener('scroll', closePanel, { passive:true });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || $('quranReader').classList.contains('hidden')) return;
    if (document.querySelector('.dialog:not(.hidden)') || !$('playerPage')?.classList.contains('hidden')) return;
    e.preventDefault();
    if (!$('quranSheet').classList.contains('hidden')) closeSheet();
    else if (!$('quranPanel').classList.contains('hidden')) closePanel();
    else closeReader();
  });

  document.addEventListener('tilawat:tab', e => {
    if (e.detail?.tab === 'quran') showIndex();
    else if (!$('quranReader').classList.contains('hidden')) closeReader();
    refreshHomeCard();
  });
}

init();

/* The home screen shows where reading stopped, or an invitation to start. */
function homeQuranCard(){
  const last = prefs.last;
  if (last?.n && last.name){
    const pct = last.count ? Math.max(2, Math.round(last.a / last.count * 100)) : 0;
    return `<button class="home-quran" type="button" data-quran-open="${last.n}" data-quran-ayah="${last.a}">
      <img src="${surahCover(last.n)}" alt="">
      <span class="home-quran__text"><small>تابع القراءة</small><b>سورة ${esc(last.name)}</b><span>الآية ${AR(last.a)}${last.count ? ` من ${AR(last.count)}` : ''} · مع التفسير الميسر</span>
      ${pct ? `<span class="quran-continue__bar" aria-hidden="true"><i style="width:${pct}%"></i></span>` : ''}</span></button>`;
  }
  return `<button class="home-quran home-quran--start" type="button" data-open-tab="quran">
    <span class="home-quran__glyph" aria-hidden="true">﴿﴾</span>
    <span class="home-quran__text"><small>جديد في تلاوات</small><b>اقرأ القرآن وافهمه</b><span>المصحف كاملًا، وتفسير كل آية بضغطة.</span></span></button>`;
}

export { openReader as openQuranReader, closeReader as closeQuranReader, homeQuranCard };
