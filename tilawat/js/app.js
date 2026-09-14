/* ── تلاوات / catalogue v2 ─────────────────────────────────────────────────
   The catalogue entity is the recitation. Sources are replaceable details of
   that entity, not separate library items. */

import { allTracks, putTrack, deleteTrack, putBlob, deleteBlob,
         blobsSize, getPref, setPref, newId } from './store.js';
import { SURAHS, parseYoutube, parseAudioUrl, fetchYoutubeMeta, bestYoutubeThumb,
         youtubeThumb, youtubeWatch, titleFromFilename, parseTime, formatTime,
         formatBytes, normalizeArabic, queryTokens, matchesTokens, sourceSummary,
         backgroundReady, normalizeTrack } from './sources.js';
import { coverSrc, coverFallbackAttr, fallbackCover, hasOwnCover, loadCoverUrls,
         refreshCoverUrl, releaseCoverUrl } from './covers.js';
import { Player, bindMediaSession } from './player.js';
import { ensureVariants, syncPrimary, addVariant, removeVariant, setPreferred,
         useVariant, suggestFor, badgesFor } from './variants.js';
import { coverSVG } from './cover.js';
import { bindSheet, refresh as refreshMotion, clearSheet } from './motion.js';
import { resolveUrl, toVariants, apiBase, setApiBase, hasApi } from './catalog/resolve.js';
import { makeSortable } from './reorder.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const attr = s => esc(s).replace(/`/g, '&#96;');
const splitList = value => String(value || '').split(/[،,]/).map(s => s.trim()).filter(Boolean);
const uniq = arr => [...new Set(arr.filter(Boolean))];

const RATES = [0.75, 1, 1.25, 1.5, 2];
const LIB_SEGS = [
  { id: 'all', label: 'كل التلاوات' },
  { id: 'favorite', label: 'المفضلة' },
  { id: 'downloaded', label: 'التنزيلات' },
  { id: 'recent', label: 'الأخيرة' },
  { id: 'playlists', label: 'القوائم' }
];

const state = {
  tracks: [], tab: 'home', returnTab: 'home', libSeg: 'all', sort: 'added',
  arrange: false, query: '', queue: [], currentId: null,
  repeat: 'off', shuffle: false,
  browse: null,
  sleep: { mode: null, at: 0, timer: null }
};

const player = new Player('ytMount');
let libVisible = [];
let lastProgressSave = 0;
const trackById = id => state.tracks.find(t => t.id === id);
const current = () => trackById(state.currentId);
const isDownloaded = t => !!t.localAudioKey;

function blankTrack() {
  return normalizeTrack({
    id: newId(), title: '', reciter: '', surah: '', year: '', collection: '',
    tags: [], playlists: [], rare: false, youtubeId: '', youtubeUrl: '',
    audioUrl: '', localAudioKey: '', localOrigin: '', thumb: '', cover: '',
    favorite: false, start: 0, end: 0, duration: 0,
    addedAt: Date.now(), lastPlayedAt: 0, lastPosition: 0, playCount: 0,
    order: Date.now()
  });
}

let toastTimer = null;
function toast(message, ms = 3000) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

/* ── theme ─────────────────────────────────────────────────────────────── */
function setTheme(next) {
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('tilawat-theme', next); } catch {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === 'dark' ? '#08090A' : '#FCFCFD';
  $('themeSwitch').setAttribute('aria-checked', String(next === 'dark'));
}
$('themeToggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
$('themeSwitch').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

/* ── catalogue helpers ─────────────────────────────────────────────────── */
function subtitle(track) {
  return [track.reciter, track.surah, track.year ? `${track.year}هـ` : ''].filter(Boolean).join(' · ') || sourceSummary(track);
}
function trackBadges(track) {
  const badges = [];
  if (track.rare) badges.push('<span class="badge badge--gold">نادرة</span>');
  if (track.localAudioKey) badges.push('<span class="badge badge--off">بلا نت</span>');
  else if (track.audioUrl) badges.push('<span class="badge">خلفية</span>');
  if (track.year) badges.push(`<span class="badge">${esc(track.year)}هـ</span>`);
  return badges.join('');
}
function cardHTML(track) {
  const playing = state.currentId === track.id;
  return `<article class="card" data-id="${attr(track.id)}" data-current="${playing}">
    <div class="card__art">
      <img src="${attr(coverSrc(track))}" alt="" loading="lazy" decoding="async" ${coverFallbackAttr(track)} />
      <div class="card__badges">${trackBadges(track)}</div>
      ${playing ? `<span class="eq" data-paused="${!player.playing}" aria-hidden="true"><i></i><i></i><i></i></span>` : ''}
      <button class="card__play" type="button" data-act="play" aria-label="تشغيل ${attr(track.title)}"><svg viewBox="0 0 24 24"><path d="M7 4.5 19 12 7 19.5z"/></svg></button>
    </div>
    <button class="card__text" type="button" data-act="play"><span class="card__t">${esc(track.title || 'بلا عنوان')}</span><span class="card__s">${esc(subtitle(track))}</span></button>
  </article>`;
}
function rowHTML(track) {
  const down = downloadState(track);
  const label = downloadLabel(down);
  return `<div class="row" data-id="${attr(track.id)}" data-current="${state.currentId === track.id}">
    <span class="row__drag" data-drag role="button" tabindex="-1" aria-label="اسحب لإعادة الترتيب"><svg viewBox="0 0 24 24"><path d="M4 8h16M4 16h16"/></svg></span>
    <img class="row__art" src="${attr(coverSrc(track))}" alt="" loading="lazy" ${coverFallbackAttr(track)} />
    <button class="row__text" type="button" data-act="play"><span class="row__t">${esc(track.title || 'بلا عنوان')}</span><span class="row__s">${esc(subtitle(track))}</span></button>
    <span class="row__acts">
      <button class="iconbtn" type="button" data-act="download" aria-label="${attr(label)}" title="${attr(label)}">${down === 'downloaded' || down === 'device' ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8.4 12.2 2.4 2.4 4.8-4.8"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M12 3v11m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>'}</button>
      <button class="iconbtn heart" type="button" data-act="favorite" aria-pressed="${!!track.favorite}" aria-label="مفضلة"><svg viewBox="0 0 24 24"><path d="m12 20.5-7-6.6a4.3 4.3 0 0 1 6-6.1l1 .9 1-.9a4.3 4.3 0 0 1 6 6.1Z"/></svg></button>
      <button class="iconbtn" type="button" data-act="edit" aria-label="تعديل"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/></svg></button>
    </span>
  </div>`;
}

function groupBy(field, tracks = state.tracks) {
  const map = new Map();
  tracks.forEach(track => {
    const key = String(track[field] || '').trim();
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(track);
  });
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ar'));
}
function playlistGroups(tracks = state.tracks) {
  const map = new Map();
  tracks.forEach(track => (track.playlists || []).forEach(name => {
    if (!name) return;
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(track);
  }));
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ar'));
}
function entityLabel(type) {
  return ({ reciter: 'قارئ', year: 'سنة', surah: 'سورة', collection: 'مجموعة', playlist: 'قائمة تشغيل' })[type] || 'مجموعة';
}
function entityTitle(type, key) { return type === 'year' ? `${key}هـ` : key; }
function entityHTML(type, key, tracks) {
  const sample = tracks.find(hasOwnCover) || tracks[0];
  const cover = sample ? coverSrc(sample) : './assets/covers/default.jpg';
  const detail = type === 'reciter' ? `${tracks.length} تلاوة` : type === 'year' ? `${tracks.length} من ${key}هـ` : `${tracks.length} تلاوة`;
  return `<button class="entity" type="button" data-entity="${attr(type)}" data-key="${attr(key)}">
    <img src="${attr(cover)}" alt="" loading="lazy" ${sample ? coverFallbackAttr(sample) : ''} />
    <span class="entity__text"><b>${esc(entityTitle(type, key))}</b><small>${esc(entityLabel(type))} · ${esc(detail)}</small></span>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
  </button>`;
}
function railSection(title, tracks, kicker = '') {
  if (!tracks.length) return '';
  return `<section class="shelf"><div class="shelf__head"><div>${kicker ? `<p class="eyebrow">${esc(kicker)}</p>` : ''}<h2>${esc(title)}</h2></div><span class="count">${tracks.length}</span></div><div class="rail">${tracks.map(cardHTML).join('')}</div></section>`;
}
function entitySection(title, type, groups, kicker = '') {
  if (!groups.length) return '';
  return `<section class="shelf"><div class="shelf__head"><div>${kicker ? `<p class="eyebrow">${esc(kicker)}</p>` : ''}<h2>${esc(title)}</h2></div><span class="count">${groups.length}</span></div><div class="entityrail">${groups.slice(0, 12).map(([key, tracks]) => entityHTML(type, key, tracks)).join('')}</div></section>`;
}

/* ── sorting / filtering ───────────────────────────────────────────────── */
const SORTS = {
  manual: (a, b) => (a.order ?? 0) - (b.order ?? 0),
  added: (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
  title: (a, b) => (a.title || '').localeCompare(b.title || '', 'ar'),
  reciter: (a, b) => (a.reciter || '').localeCompare(b.reciter || '', 'ar') || (a.title || '').localeCompare(b.title || '', 'ar'),
  year: (a, b) => Number(b.year || 0) - Number(a.year || 0) || (a.title || '').localeCompare(b.title || '', 'ar'),
  played: (a, b) => (b.playCount || 0) - (a.playCount || 0),
  recent: (a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0)
};
const sortTracks = list => list.slice().sort(SORTS[state.sort] || SORTS.added);

async function ensureManualOrder() {
  if (state.tracks.every(t => typeof t.order === 'number')) return;
  const seeded = state.tracks.slice().sort(SORTS.added);
  await Promise.all(seeded.map((track, i) => { track.order = i * 10; return putTrack(track); }));
}
async function applyManualMove(visible, from, to) {
  const slots = visible.map(t => t.order).sort((a, b) => a - b);
  const moved = visible.slice();
  moved.splice(to, 0, ...moved.splice(from, 1));
  const touched = [];
  moved.forEach((track, i) => { if (track.order !== slots[i]) { track.order = slots[i]; touched.push(track); } });
  await Promise.all(touched.map(putTrack));
}

/* ── views ─────────────────────────────────────────────────────────────── */
function hideAllViews() { ['viewHome','viewSearch','viewLib','viewBrowse','viewSettings'].forEach(id => { $(id).hidden = true; }); }
function showTab(tab) {
  state.tab = tab;
  state.browse = null;
  hideAllViews();
  const id = tab === 'home' ? 'viewHome' : tab === 'search' ? 'viewSearch' : 'viewLib';
  $(id).hidden = false;
  document.querySelectorAll('.tab').forEach(b => b.toggleAttribute('aria-current', b.dataset.tab === tab));
  render();
  window.scrollTo({ top: 0 });
  if (tab === 'search') setTimeout(() => $('search').focus(), 60);
}
function showSettings() {
  state.returnTab = ['home','search','lib'].includes(state.tab) ? state.tab : state.returnTab;
  hideAllViews(); $('viewSettings').hidden = false; renderSettings(); window.scrollTo({ top: 0 });
}
function entityTracks(type, key) {
  if (type === 'playlist') return state.tracks.filter(t => (t.playlists || []).includes(key));
  return state.tracks.filter(t => String(t[type] || '') === String(key));
}
function openBrowse(type, key) {
  const tracks = entityTracks(type, key).sort(SORTS.added);
  if (!tracks.length) return;
  state.returnTab = ['home','search','lib'].includes(state.tab) ? state.tab : state.returnTab;
  state.browse = { type, key, tracks };
  state.queue = tracks;
  hideAllViews(); $('viewBrowse').hidden = false;
  const first = tracks.find(hasOwnCover) || tracks[0];
  $('browseArt').src = coverSrc(first);
  $('browseArt').onerror = () => { $('browseArt').src = fallbackCover(first); };
  $('browseEyebrow').textContent = entityLabel(type);
  $('browseTitle').textContent = entityTitle(type, key);
  const reciters = uniq(tracks.map(t => t.reciter));
  const years = uniq(tracks.map(t => t.year));
  $('browseMeta').textContent = [tracks.length + ' تلاوة', reciters.length === 1 ? reciters[0] : '', years.length === 1 ? `${years[0]}هـ` : ''].filter(Boolean).join(' · ');
  $('browseCount').textContent = tracks.length;
  $('browseShelfTitle').textContent = type === 'surah' ? 'كل التسجيلات' : 'التلاوات';
  $('browseGrid').innerHTML = tracks.map(cardHTML).join('');
  window.scrollTo({ top: 0 });
}

function renderHome() {
  const tracks = state.tracks;
  $('empty').hidden = tracks.length > 0;
  $('homeSections').hidden = tracks.length === 0;
  $('homeMeta').textContent = tracks.length ? `${tracks.length} تلاوة · ${groupBy('reciter').length} قارئ` : '';
  if (!tracks.length) { $('homeSections').innerHTML = ''; return; }

  const recentPlayed = tracks.filter(t => t.lastPlayedAt).sort((a,b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, 8);
  const recentAdded = tracks.slice().sort(SORTS.added).slice(0, 12);
  const rare = tracks.filter(t => t.rare).sort(SORTS.added).slice(0, 12);
  const fav = tracks.filter(t => t.favorite).sort(SORTS.recent).slice(0, 12);
  const reciters = groupBy('reciter');
  const years = groupBy('year').sort((a,b) => Number(b[0]) - Number(a[0]));
  const collections = groupBy('collection');
  const surahs = groupBy('surah');

  $('homeSections').innerHTML = [
    railSection(recentPlayed.length ? 'أكمل الاستماع' : 'ابدأ الاستماع', recentPlayed.length ? recentPlayed : recentAdded.slice(0, 6), 'لك'),
    railSection('أضيفت حديثًا', recentAdded),
    rare.length ? railSection('تلاوات نادرة', rare, 'من الأرشيف') : '',
    fav.length ? railSection('المفضلة', fav) : '',
    entitySection('القراء', 'reciter', reciters, 'تصفح'),
    entitySection('السنوات', 'year', years),
    entitySection('المصاحف والمجموعات', 'collection', collections),
    entitySection('السور', 'surah', surahs)
  ].join('');
}

function searchEntityGroups(tokens) {
  const entityMatches = (type, groups) => groups.filter(([key]) => {
    const hay = normalizeArabic(type === 'year' ? `${key} ${key}هـ` : key);
    return tokens.every(t => hay.includes(t));
  }).slice(0, 8).map(([key, tracks]) => entityHTML(type, key, tracks)).join('');
  return [
    entityMatches('reciter', groupBy('reciter')),
    entityMatches('year', groupBy('year')),
    entityMatches('surah', groupBy('surah')),
    entityMatches('collection', groupBy('collection')),
    entityMatches('playlist', playlistGroups())
  ].join('');
}
function renderSearch() {
  const tokens = queryTokens(state.query);
  const searching = tokens.length > 0;
  const results = searching ? state.tracks.filter(t => matchesTokens(t, tokens)).sort(SORTS.added) : [];
  if (searching) state.queue = results;
  const entities = searching ? searchEntityGroups(tokens) : '';
  $('searchEntities').innerHTML = entities ? `<div class="entitygrid searchentities">${entities}</div>` : '';
  $('searchTrackShelf').hidden = !searching || results.length === 0;
  $('gridSearch').innerHTML = results.map(cardHTML).join('');
  $('searchCount').textContent = results.length;
  $('searchBlank').hidden = searching && (results.length > 0 || !!entities);
  if (searching && !results.length && !entities) $('searchBlank').innerHTML = '<p><b>لا نتائج.</b></p><span>جرّب اسم القارئ أو السورة أو السنة بكلمات أقل.</span>';
  else if (!searching) $('searchBlank').innerHTML = '<p>مثال: <b>ياسر 1425 الكهف</b></p><span>كل كلمة تُفهم بشكل مستقل، مع تجاهل التشكيل واختلافات الهمزات.</span>';
}
function libMatches(track) {
  if (state.libSeg === 'favorite') return !!track.favorite;
  if (state.libSeg === 'downloaded') return !!track.localAudioKey;
  if (state.libSeg === 'recent') return !!track.lastPlayedAt;
  return true;
}
function renderSegs() {
  const counts = {
    all: state.tracks.length,
    favorite: state.tracks.filter(t => t.favorite).length,
    downloaded: state.tracks.filter(t => t.localAudioKey).length,
    recent: state.tracks.filter(t => t.lastPlayedAt).length,
    playlists: playlistGroups().length
  };
  $('libSegs').innerHTML = LIB_SEGS.map(seg => `<button class="seg" type="button" role="tab" data-seg="${seg.id}" aria-selected="${state.libSeg === seg.id}">${esc(seg.label)}<span class="seg__n">${counts[seg.id]}</span></button>`).join('');
}
const LIB_BLANK = {
  all: 'المكتبة فاضية. أضف تلاوة من زر «أضف».', favorite: 'ما أضفت شيئًا للمفضلة بعد.',
  downloaded: 'ما عندك نسخة محلية بعد.', recent: 'ما استمعت إلى شيء بعد.', playlists: 'ما أنشأت قائمة تشغيل بعد.'
};
function renderLibrary() {
  renderSegs();
  const playlists = state.libSeg === 'playlists';
  $('libbar').hidden = playlists;
  $('rowsLib').hidden = playlists;
  $('libEntities').hidden = !playlists;
  $('libBlank').hidden = true;
  if (playlists) {
    const groups = playlistGroups();
    $('libEntities').innerHTML = groups.map(([key, tracks]) => entityHTML('playlist', key, tracks)).join('');
    $('libBlank').hidden = groups.length > 0;
    $('libBlankText').textContent = LIB_BLANK.playlists;
    return;
  }
  const list = sortTracks(state.tracks.filter(libMatches));
  state.queue = list;
  libVisible = list;
  $('rowsLib').innerHTML = list.map(rowHTML).join('');
  $('rowsLib').classList.toggle('is-arranging', state.arrange);
  $('libBlank').hidden = list.length > 0;
  $('libBlankText').textContent = LIB_BLANK[state.libSeg];
  $('arrangeHint').textContent = state.libSeg === 'all' ? 'اسحب من المقبض لترتيب مكتبتك يدويًا.' : 'إعادة الترتيب هنا تحرك العناصر الظاهرة فقط.';
}
function renderSettings() {
  const bg = state.tracks.filter(backgroundReady).length;
  $('statCount').textContent = state.tracks.length;
  $('statBg').textContent = bg;
  $('statOffline').textContent = state.tracks.filter(t => t.localAudioKey).length;
  $('statYt').textContent = state.tracks.filter(t => t.youtubeId).length;
  $('statUrl').textContent = state.tracks.filter(t => t.audioUrl).length;
  $('bgCount').textContent = `${bg}/${state.tracks.length}`;
  $('bgState').textContent = state.tracks.length ? `${bg} تلاوة تستطيع الاستمرار مع قفل الشاشة الآن.` : 'أضف رابط صوت مباشر أو ملفًا محليًا.';
  blobsSize().then(size => { $('statSize').textContent = formatBytes(size); }).catch(() => {});
  $('themeSwitch').setAttribute('aria-checked', String(document.documentElement.dataset.theme === 'dark'));
}
function render() {
  if (!$('viewHome').hidden) renderHome();
  if (!$('viewSearch').hidden) renderSearch();
  if (!$('viewLib').hidden) renderLibrary();
  if (!$('viewSettings').hidden) renderSettings();
  syncNow();
}

/* ── navigation / delegated clicks ─────────────────────────────────────── */
document.querySelector('.tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) showTab(b.dataset.go); });
$('settingsTop').addEventListener('click', showSettings);
$('settingsBack').addEventListener('click', () => showTab(state.returnTab));
$('browseBack').addEventListener('click', () => showTab(state.returnTab));
$('browsePlay').addEventListener('click', () => { if (state.browse && state.browse.tracks[0]) playTrack(state.browse.tracks[0], state.browse.tracks); });
$('browseShuffle').addEventListener('click', () => {
  if (!state.browse || !state.browse.tracks.length) return;
  state.shuffle = true; $('shuffleBtn').setAttribute('aria-pressed', 'true');
  const t = state.browse.tracks[Math.floor(Math.random() * state.browse.tracks.length)];
  playTrack(t, state.browse.tracks); toast('تشغيل عشوائي.');
});

function handleEntityClick(event) {
  const entity = event.target.closest('[data-entity]');
  if (entity) { openBrowse(entity.dataset.entity, entity.dataset.key); return true; }
  return false;
}
['searchEntities','libEntities'].forEach(id => $(id).addEventListener('click', handleEntityClick));

async function handleTrackClick(event) {
  if (handleEntityClick(event)) return;
  const host = event.target.closest('[data-id]');
  if (!host) return;
  const track = trackById(host.dataset.id);
  const action = event.target.closest('[data-act]');
  if (!track || !action) return;
  if (action.dataset.act === 'play') {
    let queue = state.tracks.slice().sort(SORTS.added);
    if (host.closest('#gridSearch')) queue = state.tracks.filter(t => matchesTokens(t, queryTokens(state.query))).sort(SORTS.added);
    else if (host.closest('#rowsLib')) queue = libVisible;
    else if (host.closest('#browseGrid') && state.browse) queue = state.browse.tracks;
    playTrack(track, queue);
  }
  if (action.dataset.act === 'edit') openEdit(track);
  if (action.dataset.act === 'favorite') toggleFavorite(track);
  if (action.dataset.act === 'download') handleDownload(track);
}
['homeSections','gridSearch','rowsLib','browseGrid'].forEach(id => $(id).addEventListener('click', handleTrackClick));

$('search').addEventListener('input', e => { state.query = e.target.value; renderSearch(); });
$('libSegs').addEventListener('click', e => { const b = e.target.closest('[data-seg]'); if (!b) return; state.libSeg = b.dataset.seg; setPref('libSeg', state.libSeg); renderLibrary(); });
$('sort').addEventListener('change', e => { state.sort = e.target.value; setPref('sort', state.sort); renderLibrary(); });
$('arrangeBtn').addEventListener('click', async () => {
  state.arrange = !state.arrange;
  $('arrangeBtn').setAttribute('aria-pressed', String(state.arrange));
  $('libtools').hidden = !state.arrange;
  if (state.arrange && state.sort !== 'manual') { await ensureManualOrder(); state.sort = 'manual'; $('sort').value = 'manual'; setPref('sort', 'manual'); }
  renderLibrary();
});
makeSortable($('rowsLib'), { handle: '[data-drag]', item: '.row', onDrop: async (from, to) => { await ensureManualOrder(); state.sort = 'manual'; $('sort').value = 'manual'; setPref('sort', 'manual'); await applyManualMove(libVisible, from, to); renderLibrary(); } });
addEventListener('scroll', () => $('topbar').classList.toggle('is-stuck', scrollY > 6), { passive: true });

/* ── playback ───────────────────────────────────────────────────────────── */
async function playTrack(track, explicitQueue = null) {
  state.currentId = track.id;
  if (explicitQueue) state.queue = explicitQueue;
  else if (!state.queue.some(t => t.id === track.id)) state.queue = state.tracks.slice().sort(SORTS.added);
  track.playCount = (track.playCount || 0) + 1;
  track.lastPlayedAt = Date.now();
  putTrack(track);
  $('mini').hidden = false;
  showVideo(false);
  syncNow(); render();
  await player.load(track, { autoplay: true, resume: true });
}
const currentIndex = () => state.queue.findIndex(t => t.id === state.currentId);
function step(delta, { auto = false } = {}) {
  if (!state.queue.length) return;
  const index = currentIndex();
  if (state.shuffle && auto && state.queue.length > 1) {
    let pick = index; while (pick === index) pick = Math.floor(Math.random() * state.queue.length);
    playTrack(state.queue[pick], state.queue); return;
  }
  let next = index + delta;
  if (index < 0) next = 0;
  if (next < 0) next = state.queue.length - 1;
  if (next >= state.queue.length) {
    if (auto && state.repeat !== 'all') { player.pause(); return; }
    next = 0;
  }
  playTrack(state.queue[next], state.queue);
}
player.on('ended', () => {
  const track = current(); if (track) { track.lastPosition = 0; putTrack(track); }
  if (state.sleep.mode === 'end') { clearSleep(); player.pause(); toast('انتهى المؤقت.'); return; }
  if (state.repeat === 'one') { player.seek(0); player.play(); return; }
  step(1, { auto: true });
});
player.on('error', err => {
  const code = err && err.message ? err.message : '';
  if (code === 'no-source') toast('لا يوجد مصدر صوت لهذه التلاوة.', 4500);
  else if (code === 'yt-api-unreachable') toast('تعذر الوصول إلى يوتيوب.', 4500);
  else if (code.startsWith('yt-')) toast('يوتيوب رفض تشغيل هذا المقطع.', 4500);
  else toast('تعذر تشغيل مصدر الصوت.', 4200);
  console.warn('playback error', err);
});
player.on('meta', ({ title, author }) => {
  const track = current(); if (!track) return;
  let changed = false;
  if (!track.title && title) { track.title = title; changed = true; }
  if (!track.reciter && author) { track.reciter = author; changed = true; }
  if (changed) { putTrack(track); render(); }
});
player.on('duration', () => {
  const track = current(); const seconds = Math.round(player.rawDuration);
  if (track && seconds && track.duration !== seconds) { track.duration = seconds; putTrack(track); }
});
player.on('time', () => {
  const track = current();
  if (track && player.playing && Date.now() - lastProgressSave > 5000) {
    lastProgressSave = Date.now(); track.lastPosition = player.time; putTrack(track);
  }
  updateClock();
});
player.on('source', ({ source, backgroundCapable }) => {
  const names = { local: 'من جهازك · يعمل في الخلفية', direct: 'بث صوتي · يعمل في الخلفية', youtube: 'YouTube · يتوقف مع قفل الشاشة' };
  $('nowSource').textContent = names[source] || '';
  $('nowSource').dataset.good = String(backgroundCapable);
  const track = current();
  $('videoBtn').hidden = !(track && track.youtubeId && source === 'youtube');
  syncDownloadButton();
});

const PLAY_ICON = '<path d="M7 4.5 19 12 7 19.5z"/>';
const PAUSE_ICON = '<path d="M8 5h3v14H8zM13 5h3v14h-3z"/>';
player.on('state', () => {
  const icon = player.playing ? PAUSE_ICON : PLAY_ICON;
  $('playIcon').innerHTML = icon; $('miniIcon').innerHTML = icon;
  document.querySelectorAll('.eq').forEach(el => { el.dataset.paused = String(!player.playing); });
});
function updateClock() {
  const duration = player.duration; const position = player.position;
  $('curTime').textContent = formatTime(position); $('durTime').textContent = formatTime(duration);
  if (duration) {
    const ratio = Math.min(1, Math.max(0, position / duration));
    if (!scrubbing) $('seek').value = String(Math.round(ratio * 1000));
    $('miniProgress').style.width = `${ratio * 100}%`;
  }
}
let scrubbing = false;
$('playBtn').addEventListener('click', () => player.toggle()); $('miniPlay').addEventListener('click', () => player.toggle());
$('prevBtn').addEventListener('click', () => step(-1)); $('nextBtn').addEventListener('click', () => step(1));
$('back10').addEventListener('click', () => player.nudge(-10)); $('fwd10').addEventListener('click', () => player.nudge(10));
$('seek').addEventListener('input', () => { scrubbing = true; if (player.duration) $('curTime').textContent = formatTime(Number($('seek').value) / 1000 * player.duration); });
$('seek').addEventListener('change', () => { if (player.duration) player.seek(Number($('seek').value) / 1000 * player.duration); scrubbing = false; });
$('rateBtn').addEventListener('click', () => { const next = RATES[(RATES.indexOf(player.rate) + 1) % RATES.length]; player.setRate(next); $('rateBtn').textContent = `${next.toFixed(next % 1 ? 2 : 1)}×`; setPref('rate', next); });
const REPEAT_ORDER = ['off','all','one'];
$('repeatBtn').addEventListener('click', () => { state.repeat = REPEAT_ORDER[(REPEAT_ORDER.indexOf(state.repeat) + 1) % REPEAT_ORDER.length]; setPref('repeat', state.repeat); $('repeatBtn').setAttribute('aria-pressed', String(state.repeat !== 'off')); toast(state.repeat === 'one' ? 'تكرار هذه التلاوة.' : state.repeat === 'all' ? 'تكرار القائمة.' : 'أوقف التكرار.'); });
$('shuffleBtn').addEventListener('click', () => { state.shuffle = !state.shuffle; setPref('shuffle', state.shuffle); $('shuffleBtn').setAttribute('aria-pressed', String(state.shuffle)); toast(state.shuffle ? 'الترتيب العشوائي يعمل.' : 'الترتيب العشوائي متوقف.'); });

function syncNow() {
  if (!$('now').hidden) queueMicrotask(renderStrata);
  const track = current();
  if (!track) { $('mini').hidden = true; closeNow(); return; }
  const src = coverSrc(track); const fallback = fallbackCover(track);
  ['nowArt','miniArt'].forEach(id => { const img = $(id); img.onerror = () => { img.onerror = null; img.src = fallback; }; img.src = src; });
  $('nowTitle').textContent = $('miniTitle').textContent = track.title || 'بلا عنوان';
  $('nowSub').textContent = $('miniSub').textContent = subtitle(track);
  $('nowFrom').textContent = [track.collection, track.year ? `${track.year}هـ` : '', sourceSummary(track)].filter(Boolean).join(' · ') || 'من مكتبتك';
  $('nowFav').setAttribute('aria-pressed', String(!!track.favorite)); $('miniFav').setAttribute('aria-pressed', String(!!track.favorite));
  $('videoBtn').hidden = !(track.youtubeId && player.source === 'youtube');
  syncDownloadButton();
}
function openNow() {
  if (!current()) return;
  $('now').hidden = false;
  document.body.classList.add('is-locked');
  $('now').scrollTop = 0;
  renderStrata();
  bindSheet($('now'));
}
function closeNow() {
  clearSheet();
  $('now').hidden = true;
  document.body.classList.remove('is-locked');
}

/* ── the copies of this recording, and what to hear after it ─────────────── */

const PROVIDER_NAME = {
  local: 'ملف على جهازك', youtube: 'يوتيوب', mp3quran: 'MP3Quran', quranicaudio: 'QuranicAudio',
  islamway: 'طريق الإسلام', archive: 'أرشيف الإنترنت', mazameer: 'مزامير آل داود',
  assabile: 'السبيل', tvquran: 'TVQuran', everyayah: 'EveryAyah', soundcloud: 'SoundCloud',
  generic: 'رابط مباشر'
};

function variantArt(track, variant) {
  if (variant.thumbnail) {
    return `<img src="${esc(variant.thumbnail)}" alt="" loading="lazy"
                 onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cvwrap',innerHTML:this.dataset.fb}))"
                 data-fb="${esc(coverSVG(track))}" />`;
  }
  return coverSVG(track);
}

function variantCard(track, variant) {
  const playing = track.defaultVariantId === variant.id;
  const preferred = track.preferredVariantId === variant.id;
  const bits = [
    variant.duration ? formatTime(variant.duration) : '',
    variant.bitrate ? variant.bitrate + 'kbps' : '',
    variant.fileSize ? formatBytes(variant.fileSize) : '',
    track.year || ''
  ].filter(Boolean).join(' · ');
  return `
  <article class="vcard" data-variant="${esc(variant.id)}" data-playing="${playing}" data-reveal-item>
    <div class="vcard__art">${variantArt(track, variant)}
      ${playing ? '<span class="vcard__mark">تُشغَّل الآن</span>' : ''}</div>
    <div class="vcard__body">
      <span class="vcard__src">${esc(variant.qualityLabel || PROVIDER_NAME[variant.provider] || variant.provider)}</span>
      ${bits ? `<span class="vcard__meta">${esc(bits)}</span>` : ''}
      <span class="vbadges">${badgesFor(variant).map(b =>
        `<span class="vbadge" data-tone="${b.tone}">${esc(b.text)}</span>`).join('')}</span>
      <span class="vcard__acts">
        <button class="iconbtn" type="button" data-vact="play" aria-label="شغّل هذه النسخة">
          <svg viewBox="0 0 24 24"><path d="M7 4.5 19 12 7 19.5z" fill="currentColor" stroke="none"/></svg></button>
        <button class="iconbtn vcard__star" type="button" data-vact="prefer" aria-pressed="${preferred}"
                aria-label="اجعلها المفضّلة" title="اجعل هذه النسخة المفضّلة">
          <svg viewBox="0 0 24 24"><path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z"/></svg></button>
        ${variant.audioUrl && !variant.localKey ? `
        <button class="iconbtn" type="button" data-vact="download" aria-label="نزّل هذه النسخة">
          <svg viewBox="0 0 24 24"><path d="M12 3v11m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg></button>` : ''}
        ${variant.sourceUrl ? `
        <a class="iconbtn" href="${esc(variant.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="المصدر">
          <svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a>` : ''}
        <span class="spacer"></span>
        <button class="iconbtn" type="button" data-vact="remove" aria-label="احذف هذه النسخة">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </span>
    </div>
  </article>`;
}

function renderStrata() {
  const track = current();
  if (!track) return;
  ensureVariants(track);

  $('variantGrid').innerHTML = track.variants.map(v => variantCard(track, v)).join('');
  const count = track.variants.length;
  $('variantNote').textContent = count > 1
    ? `${count} نسخ محفوظة لهذا التسجيل. المشغّل يبدأ بأفضلها، والباقي يبقى كما هو.`
    : 'نسخة واحدة محفوظة. أضف نسخة أخرى من موقع آخر لتظهر هنا جنبها.';

  const suggestions = suggestFor(track, state.tracks);
  $('suggestSection').hidden = suggestions.length === 0;
  $('suggestGrid').innerHTML = suggestions.map(({ track: item, reason }) => `
    <article class="vcard" data-id="${esc(item.id)}" data-reveal-item>
      <div class="vcard__art">${item.thumb
        ? `<img src="${esc(item.thumb)}" alt="" loading="lazy" />`
        : coverSVG(item)}
        <button class="card__play" type="button" data-act="play" aria-label="تشغيل">
          <svg viewBox="0 0 24 24"><path d="M7 4.5 19 12 7 19.5z"/></svg></button>
      </div>
      <div class="vcard__body">
        <span class="vcard__src">${esc(item.title || 'تلاوة')}</span>
        <span class="vcard__meta">${esc(item.reciter || '')}</span>
        <span class="vbadges"><span class="vbadge">${esc(reason)}</span></span>
      </div>
    </article>`).join('');
  refreshMotion();
}

$('variantGrid').addEventListener('click', async event => {
  const card = event.target.closest('[data-variant]');
  const action = event.target.closest('[data-vact]');
  const track = current();
  if (!card || !action || !track) return;
  const id = card.dataset.variant;

  switch (action.dataset.vact) {
    case 'play':
      useVariant(track, id);
      await putTrack(track);
      await playTrack(track);
      renderStrata();
      break;
    case 'prefer':
      setPreferred(track, id);
      await putTrack(track);
      renderStrata();
      toast(track.preferredVariantId ? 'صارت هذه نسختك المفضّلة لهذه التلاوة.' : 'رجع الاختيار تلقائيًا.');
      break;
    case 'download': {
      const variant = track.variants.find(v => v.id === id);
      if (variant) await downloadVariant(track, variant);
      break;
    }
    case 'remove': {
      if (track.variants.length < 2) { toast('لا يمكن حذف النسخة الوحيدة.'); return; }
      if (!confirm('حذف هذه النسخة من التلاوة؟ باقي النسخ تبقى.')) return;
      removeVariant(track, id);
      await putTrack(track);
      renderStrata();
      render();
      break;
    }
  }
});

$('suggestGrid').addEventListener('click', event => {
  const card = event.target.closest('[data-id]');
  if (!card) return;
  const next = state.tracks.find(t => t.id === card.dataset.id);
  if (!next) return;
  $('now').scrollTop = 0;
  playTrack(next);
});

async function downloadVariant(track, variant) {
  toast('جارٍ التنزيل…', 60000);
  try {
    const res = await fetch(variant.audioUrl, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    if (!blob.size) throw new Error('empty');
    const key = 'b-' + track.id + '-' + variant.id;
    await putBlob(key, blob);
    variant.localKey = key;
    variant.localSize = blob.size;
    variant.fileSize = variant.fileSize || blob.size;
    syncPrimary(track);
    await putTrack(track);
    renderStrata();
    render();
    toast(`نُزّلت (${formatBytes(blob.size)}) — تعمل بلا إنترنت والشاشة مطفأة.`, 4200);
  } catch (err) {
    toast('تعذّر التنزيل — الخادم لا يسمح بالنسخ من المتصفح. التشغيل المباشر يعمل.', 5200);
    console.warn('variant download failed', err);
  }
}

/* ── attaching another copy ──────────────────────────────────────────────── */

$('addSourceBtn').addEventListener('click', () => {
  const track = current();
  if (!track) return;
  $('sourceForm').reset();
  $('srcError').hidden = true;
  $('sourceFor').textContent = `تُضاف إلى: ${track.title || 'هذه التلاوة'}`;
  $('sourceDialog').showModal();
});

let srcResolved = null;

let resolveTimer = null;
$('srcUrl').addEventListener('input', () => {
  clearTimeout(resolveTimer);
  srcResolved = null;
  $('srcFound').hidden = true;
  resolveTimer = setTimeout(lookUpSource, 500);
});

/** Asks the Worker what a pasted page holds, and offers what it found. */
async function lookUpSource() {
  const url = $('srcUrl').value.trim();
  $('srcError').hidden = true;
  if (!url || !/^https?:\/\//i.test(url)) return;
  // parseAudioUrl answers for any valid http(s) link, so the extension check
  // is what actually decides whether this is already a file we understand.
  const direct = parseAudioUrl(url);
  if (parseYoutube(url) || (direct && direct.looksLikeAudio)) return;
  if (!(await hasApi())) {
    // Saying nothing here would look like a bug: the listener pasted a page
    // and watched the dialog do nothing at all.
    $('srcError').hidden = false;
    $('srcError').textContent = 'لقراءة هذا الرابط اضبط خادم الكتالوج من الإعدادات — أو الصق رابط MP3 مباشر أو اختر ملفًا.';
    return;
  }

  $('srcFound').hidden = false;
  $('srcFoundNote').textContent = 'جارٍ قراءة الصفحة…';
  $('srcCandidates').innerHTML = '';

  const result = await resolveUrl(url);
  if ($('srcUrl').value.trim() !== url) return;          // the field moved on
  if (!result.ok) {
    $('srcFound').hidden = true;
    $('srcError').hidden = false;
    $('srcError').textContent = result.reason === 'no-api'
      ? 'اضبط عنوان خادم الكتالوج من الإعدادات لقراءة هذا النوع من الروابط.'
      : result.reason;
    return;
  }

  srcResolved = { result, url };
  const variants = toVariants(result, url);
  const claims = Object.keys(result.claims || {});
  $('srcFoundNote').textContent = [
    result.title ? `«${result.title}»` : 'الصفحة',
    variants.length && variants[0].audioUrl ? `— ${variants.length} ملف صوتي` : '— بلا ملف صوتي مباشر',
    (result.years || []).length ? `— ${result.years.join('، ')}هـ` : '',
    claims.length ? `— ${claims.length} وصف من نصّ الصفحة` : ''
  ].filter(Boolean).join(' ');

  if (!result.title && !variants.some(v => v.audioUrl)) { $('srcFound').hidden = true; return; }
  if (!$('srcLabel').value && result.title) $('srcLabel').value = result.title;

  $('srcCandidates').innerHTML = variants.slice(0, 12).map((v, i) => `
    <button class="pick" type="button" data-cand="${i}">
      <span class="pick__t">${esc(v.qualityLabel || v.title || 'ملف صوتي')}</span>
      <span class="pick__s">${esc([
        v.bitrate ? v.bitrate + 'kbps' : '',
        v.duration ? formatTime(v.duration) : '',
        v.fileSize ? formatBytes(v.fileSize) : '',
        v.audioUrl ? '' : 'مرجع فقط'
      ].filter(Boolean).join(' · ') || 'أضفه')}</span>
    </button>`).join('');
}

$('srcCandidates').addEventListener('click', async event => {
  const pick = event.target.closest('[data-cand]');
  const track = current();
  if (!pick || !track || !srcResolved) return;
  const variant = toVariants(srcResolved.result, srcResolved.url)[Number(pick.dataset.cand)];
  if (!variant) return;
  const added = addVariant(track, { ...variant, rare: $('srcRare').checked || variant.rare });
  if (!added) { toast('هذه النسخة مضافة مسبقًا.'); return; }
  await putTrack(track);
  $('sourceDialog').close();
  renderStrata();
  render();
  toast('أُضيفت النسخة من الصفحة.', 3600);
});

$('sourceForm').addEventListener('submit', async event => {
  event.preventDefault();
  const track = current();
  if (!track) return;
  const url = $('srcUrl').value.trim();
  const file = $('srcFile').files[0];
  if (!url && !file) {
    $('srcError').hidden = false;
    $('srcError').textContent = 'الصق رابطًا أو اختر ملفًا.';
    return;
  }

  const flags = {
    original: $('srcOriginal').checked, refined: $('srcRefined').checked,
    rare: $('srcRare').checked, partial: $('srcPartial').checked
  };
  const label = $('srcLabel').value.trim();
  const from = $('srcFrom').value.trim();
  let fields;

  if (file) {
    const key = 'b-' + track.id + '-' + Date.now().toString(36);
    await putBlob(key, file);
    fields = { provider: 'local', localKey: key, localName: file.name, localSize: file.size,
               fileSize: file.size, downloadable: false,
               provenance: { originalSource: 'device', discoveredFrom: from, verified: true, confidence: 1 } };
  } else {
    const yt = parseYoutube(url);
    fields = yt
      ? { provider: 'youtube', videoId: yt.id, sourceUrl: youtubeWatch(yt.id),
          embedUrl: `https://www.youtube-nocookie.com/embed/${yt.id}`,
          thumbnail: youtubeThumb(yt.id), downloadable: false,
          provenance: { originalSource: url, discoveredFrom: from, confidence: 0.7 } }
      : { sourceUrl: url, audioUrl: url,
          provenance: { originalSource: url, discoveredFrom: from, confidence: 0.75 } };
  }

  const added = addVariant(track, { ...fields, ...flags, qualityLabel: label, title: label });
  if (!added) {
    $('srcError').hidden = false;
    $('srcError').textContent = 'هذه النسخة مضافة مسبقًا لهذه التلاوة.';
    return;
  }
  await putTrack(track);
  $('sourceDialog').close();
  renderStrata();
  render();
  toast('أُضيفت النسخة. المشغّل اختار الأفضل تلقائيًا.', 4000);
});
$('miniOpen').addEventListener('click', openNow); $('nowClose').addEventListener('click', closeNow); $('nowEdit').addEventListener('click', () => current() && openEdit(current()));
$('nowFav').addEventListener('click', () => current() && toggleFavorite(current())); $('miniFav').addEventListener('click', () => current() && toggleFavorite(current()));
function showVideo(on) { $('ytPark').classList.toggle('is-shown', on); $('videoBtn').setAttribute('aria-pressed', String(on)); }
$('videoBtn').addEventListener('click', () => { const on = !$('ytPark').classList.contains('is-shown'); showVideo(on); if (on) openNow(); });
bindMediaSession(player, { next: () => step(1), previous: () => step(-1) }, track => coverSrc(track));

document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase(); if (['input','textarea','select'].includes(tag) || e.target.isContentEditable || document.querySelector('dialog[open]')) return;
  if (e.key === 'Escape' && !$('now').hidden) { closeNow(); return; }
  if (!player.track) return;
  if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); player.nudge(-10); }
  if (e.key === 'ArrowRight') { e.preventDefault(); player.nudge(10); }
});

/* ── download / local audio ────────────────────────────────────────────── */
function downloadState(track) {
  if (track.localAudioKey) return track.localOrigin === 'device' ? 'device' : 'downloaded';
  if (track.audioUrl) return 'idle';
  return 'blocked';
}
function downloadLabel(stateNow) {
  return ({ device: 'على جهازك', downloaded: 'منزلة — اضغط لحذف النسخة', idle: 'تنزيل للاستماع بلا إنترنت', blocked: 'أضف رابط صوت مباشر أولًا' })[stateNow];
}
function syncDownloadButton() {
  const track = current(); if (!track) return;
  const down = downloadState(track); const chip = $('offlineBtn');
  chip.setAttribute('aria-pressed', String(down === 'downloaded' || down === 'device'));
  chip.title = chip.setAttribute('aria-label', downloadLabel(down)) || downloadLabel(down);
  $('offlineIcon').innerHTML = down === 'downloaded' || down === 'device' ? '<circle cx="12" cy="12" r="9"/><path d="m8.4 12.2 2.4 2.4 4.8-4.8"/>' : '<path d="M12 3v11m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>';
}
async function handleDownload(track) {
  const down = downloadState(track);
  if (down === 'device') { toast('هذه النسخة من جهازك أصلًا.'); return; }
  if (down === 'blocked') { toast('أضف رابط صوت مباشر لنفس التلاوة ثم نزّلها.', 4300); return; }
  if (down === 'downloaded') { await dropOfflineCopy(track); return; }
  await saveOfflineCopy(track);
}
$('offlineBtn').addEventListener('click', () => current() && handleDownload(current()));
async function saveOfflineCopy(track) {
  if (!track.audioUrl) return;
  toast('جارٍ تنزيل النسخة الصوتية…', 60000);
  try {
    const res = await fetch(track.audioUrl, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob(); if (!blob.size) throw new Error('empty');
    const key = 'a-' + track.id; await putBlob(key, blob);
    track.localAudioKey = key; track.localOrigin = 'download'; track.bytes = blob.size;
    await putTrack(track); render();
    if (state.currentId === track.id) player.load(track, { autoplay: player.playing, resume: true });
    toast(`نُزّلت (${formatBytes(blob.size)}) — الآن تعمل بلا نت وفي الخلفية.`, 4800);
  } catch (err) {
    console.warn('download failed', err);
    toast('الخادم يسمح بالتشغيل لكنه منع نسخ الملف من المتصفح (CORS).', 5200);
  }
}
async function dropOfflineCopy(track) {
  if (!track.localAudioKey || track.localOrigin === 'device') return;
  await deleteBlob(track.localAudioKey); track.localAudioKey = ''; track.localOrigin = ''; track.bytes = 0;
  await putTrack(track); render(); toast('حُذفت النسخة المحلية؛ سيعود للبث المباشر.');
}
async function toggleFavorite(track) { track.favorite = !track.favorite; await putTrack(track); render(); toast(track.favorite ? 'أضيفت للمفضلة.' : 'أزيلت من المفضلة.', 1600); }

/* ── sleep timer ───────────────────────────────────────────────────────── */
function clearSleep() { clearTimeout(state.sleep.timer); state.sleep = { mode: null, at: 0, timer: null }; $('timerBtn').setAttribute('aria-pressed', 'false'); }
function setSleep(minutes) {
  clearSleep();
  if (minutes === 'end') { state.sleep.mode = 'end'; $('timerBtn').setAttribute('aria-pressed', 'true'); toast('سيتوقف بعد هذه التلاوة.'); return; }
  state.sleep.mode = 'clock'; state.sleep.at = Date.now() + minutes * 60000;
  state.sleep.timer = setTimeout(() => { player.pause(); clearSleep(); toast('انتهى المؤقت.'); }, minutes * 60000);
  $('timerBtn').setAttribute('aria-pressed', 'true'); toast(`سيتوقف بعد ${minutes} دقيقة.`);
}
$('timerBtn').addEventListener('click', () => { $('timerStatus').textContent = state.sleep.mode === 'end' ? 'يتوقف بعد هذه التلاوة.' : state.sleep.mode === 'clock' ? `يتوقف ${new Date(state.sleep.at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}.` : 'لا يوجد مؤقت.'; $('timerDialog').showModal(); });
$('timerDialog').addEventListener('click', e => { const b = e.target.closest('[data-min]'); if (!b) return; setSleep(b.dataset.min === 'end' ? 'end' : Number(b.dataset.min)); $('timerDialog').close(); });
$('timerOff').addEventListener('click', () => { clearSleep(); $('timerDialog').close(); toast('أوقف المؤقت.'); });

/* ── add / edit ────────────────────────────────────────────────────────── */
let editing = null, pendingFile = null, pendingCoverFile = null, pendingCoverUrl = '', draftCover = '', clearCover = false, removeLocalPending = false, metaAbort = null;
function setPendingCoverFile(file) { if (pendingCoverUrl) URL.revokeObjectURL(pendingCoverUrl); pendingCoverFile = file; pendingCoverUrl = file ? URL.createObjectURL(file) : ''; }
function paintCoverPreview() {
  const img = $('coverPreview');
  if (pendingCoverFile) { img.src = pendingCoverUrl; return; }
  if (draftCover) { img.src = draftCover; return; }
  if (!clearCover && editing && hasOwnCover(editing)) { img.src = coverSrc(editing); return; }
  img.src = fallbackCover({ reciter: $('reciterInput').value, title: $('titleInput').value, surah: $('surahInput').value, year: $('yearInput').value });
}
function resetForm() {
  ['youtubeInput','audioInput','titleInput','reciterInput','surahInput','yearInput','collectionInput','playlistsInput','tagsInput','startInput','endInput'].forEach(id => { $(id).value = ''; });
  $('fileInput').value = ''; $('coverFileInput').value = ''; $('rareInput').checked = false; $('formError').hidden = true;
  pendingFile = null; setPendingCoverFile(null); draftCover = ''; clearCover = false; removeLocalPending = false; $('removeLocalBtn').hidden = true; $('coverFromLink').disabled = true;
}
function fillSuggestions() {
  $('surahList').innerHTML = SURAHS.map(s => `<option value="${attr(s)}"></option>`).join('');
  const fill = (id, values) => { $(id).innerHTML = uniq(values).sort((a,b) => a.localeCompare(b,'ar')).map(v => `<option value="${attr(v)}"></option>`).join(''); };
  fill('reciterList', state.tracks.map(t => t.reciter)); fill('collectionList', state.tracks.map(t => t.collection)); fill('playlistList', state.tracks.flatMap(t => t.playlists || [])); fill('tagList', state.tracks.flatMap(t => t.tags || []));
}
function openAdd(prefill = '') {
  editing = null; resetForm(); fillSuggestions(); $('addTitle').textContent = 'أضف تلاوة'; $('saveBtn').textContent = 'حفظ'; $('deleteBtn').hidden = true; paintCoverPreview(); $('addDialog').showModal();
  if (prefill) {
    if (parseYoutube(prefill)) $('youtubeInput').value = prefill; else $('audioInput').value = prefill;
    detectYoutube(); detectAudio();
  }
  setTimeout(() => ($('youtubeInput').value ? $('titleInput') : $('youtubeInput')).focus(), 30);
}
function openEdit(track) {
  editing = track; resetForm(); fillSuggestions(); $('addTitle').textContent = 'تعديل التلاوة'; $('saveBtn').textContent = 'حفظ التعديل'; $('deleteBtn').hidden = false;
  $('youtubeInput').value = track.youtubeUrl || (track.youtubeId ? youtubeWatch(track.youtubeId) : ''); $('audioInput').value = track.audioUrl || '';
  $('titleInput').value = track.title || ''; $('reciterInput').value = track.reciter || ''; $('surahInput').value = track.surah || ''; $('yearInput').value = track.year || ''; $('collectionInput').value = track.collection || '';
  $('playlistsInput').value = (track.playlists || []).join('، '); $('tagsInput').value = (track.tags || []).join('، '); $('rareInput').checked = !!track.rare;
  $('startInput').value = track.start ? formatTime(track.start) : ''; $('endInput').value = track.end ? formatTime(track.end) : '';
  $('removeLocalBtn').hidden = !track.localAudioKey; $('fileHint').textContent = track.localAudioKey ? `يوجد ملف محلي (${track.localOrigin === 'device' ? 'من جهازك' : 'تنزيل'}). اختيار ملف جديد يستبدله.` : 'يمكنك إرفاق ملف الآن لنفس التلاوة.';
  $('coverFromLink').disabled = !track.youtubeId; paintCoverPreview(); $('addDialog').showModal();
}
$('addTop').addEventListener('click', () => openAdd()); $('emptyAdd').addEventListener('click', () => openAdd());
let detectTimer = null;
$('youtubeInput').addEventListener('input', () => { clearTimeout(detectTimer); detectTimer = setTimeout(detectYoutube, 350); });
$('audioInput').addEventListener('input', () => { clearTimeout(detectTimer); detectTimer = setTimeout(detectAudio, 250); });
['titleInput','reciterInput','surahInput','yearInput'].forEach(id => $(id).addEventListener('input', () => { if (!pendingCoverFile && !draftCover) paintCoverPreview(); }));
$('fileInput').addEventListener('change', () => { pendingFile = $('fileInput').files[0] || null; if (pendingFile && !$('titleInput').value) $('titleInput').value = titleFromFilename(pendingFile.name); });
async function detectYoutube() {
  const value = $('youtubeInput').value.trim(); const parsed = parseYoutube(value);
  $('coverFromLink').disabled = !parsed;
  if (!value) return;
  if (!parsed) { $('ytHint').textContent = 'الرابط ليس رابط YouTube مفهومًا.'; return; }
  $('ytHint').textContent = 'جارٍ جلب بيانات الفيديو…';
  if (!pendingCoverFile) { draftCover = parsed.thumb; clearCover = false; paintCoverPreview(); }
  if (parsed.start && !$('startInput').value) $('startInput').value = formatTime(parsed.start);
  if (metaAbort) metaAbort.abort(); metaAbort = new AbortController();
  const meta = await fetchYoutubeMeta(parsed.id, metaAbort.signal);
  if ($('youtubeInput').value.trim() !== value) return;
  if (meta) {
    if (!$('titleInput').value) $('titleInput').value = meta.title;
    if (!$('reciterInput').value) $('reciterInput').value = meta.author;
    $('ytHint').textContent = 'تم جلب العنوان والقناة. يمكنك تعديلهما.';
  } else $('ytHint').textContent = 'الرابط صالح؛ تعذر جلب البيانات الآن.';
  if (!pendingCoverFile) { const best = await bestYoutubeThumb(parsed.id); if ($('youtubeInput').value.trim() === value) { draftCover = best; paintCoverPreview(); } }
}
function detectAudio() {
  const value = $('audioInput').value.trim(); if (!value) return;
  const parsed = parseAudioUrl(value); if (!parsed) return;
  if (!$('titleInput').value) { try { $('titleInput').value = titleFromFilename(decodeURIComponent(new URL(parsed.url).pathname.split('/').pop() || '')); } catch {} }
}
$('coverFromLink').addEventListener('click', async () => { const parsed = parseYoutube($('youtubeInput').value); if (!parsed) return; draftCover = await bestYoutubeThumb(parsed.id); clearCover = false; setPendingCoverFile(null); paintCoverPreview(); });
$('coverFromFile').addEventListener('click', () => $('coverFileInput').click());
$('coverFileInput').addEventListener('change', () => { const file = $('coverFileInput').files[0]; if (!file) return; setPendingCoverFile(file); draftCover = ''; clearCover = false; paintCoverPreview(); });
$('coverClear').addEventListener('click', () => { setPendingCoverFile(null); draftCover = ''; clearCover = true; paintCoverPreview(); });
$('removeLocalBtn').addEventListener('click', () => { removeLocalPending = true; pendingFile = null; $('fileInput').value = ''; $('removeLocalBtn').hidden = true; $('fileHint').textContent = 'ستُزال النسخة المحلية عند الحفظ.'; });
function readTimes() {
  const start = $('startInput').value.trim() ? parseTime($('startInput').value) : 0; const end = $('endInput').value.trim() ? parseTime($('endInput').value) : 0;
  if (start === null || end === null) return { error: 'وقت غير صحيح. اكتب مثل 1:23 أو 83.' };
  if (end && start && end <= start) return { error: 'وقت النهاية يجب أن يكون بعد البداية.' };
  return { start: start || 0, end: end || 0 };
}
async function commitCover(track) {
  if (pendingCoverFile) {
    if (track.coverKey) await deleteBlob(track.coverKey).catch(() => {});
    track.coverKey = 'c-' + track.id; await putBlob(track.coverKey, pendingCoverFile); track.cover = ''; await refreshCoverUrl(track); return;
  }
  if (draftCover) {
    if (track.coverKey) { await deleteBlob(track.coverKey).catch(() => {}); delete track.coverKey; releaseCoverUrl(track.id); }
    track.cover = draftCover; return;
  }
  if (clearCover) {
    if (track.coverKey) await deleteBlob(track.coverKey).catch(() => {});
    releaseCoverUrl(track.id); track.coverKey = ''; track.cover = ''; track.thumb = '';
  }
}
$('addForm').addEventListener('submit', async e => {
  e.preventDefault(); $('formError').hidden = true;
  const times = readTimes(); if (times.error) { $('formError').hidden = false; $('formError').textContent = times.error; return; }
  const yt = $('youtubeInput').value.trim() ? parseYoutube($('youtubeInput').value.trim()) : null;
  const audio = $('audioInput').value.trim() ? parseAudioUrl($('audioInput').value.trim()) : null;
  if ($('youtubeInput').value.trim() && !yt) { $('formError').hidden = false; $('formError').textContent = 'رابط YouTube غير صحيح.'; return; }
  if ($('audioInput').value.trim() && !audio) { $('formError').hidden = false; $('formError').textContent = 'رابط الصوت غير صحيح.'; return; }

  const isNew = !editing; const track = editing || blankTrack();
  const hasExistingLocal = !!track.localAudioKey && !removeLocalPending;
  if (!yt && !audio && !pendingFile && !hasExistingLocal) { $('formError').hidden = false; $('formError').textContent = 'أضف مصدرًا واحدًا على الأقل: YouTube أو رابط صوت أو ملف.'; return; }

  track.youtubeId = yt ? yt.id : ''; track.youtubeUrl = yt ? yt.url : ''; track.thumb = yt ? (draftCover || track.thumb || youtubeThumb(yt.id)) : (clearCover ? '' : track.thumb);
  track.audioUrl = audio ? audio.url : '';
  track.title = $('titleInput').value.trim() || (pendingFile ? titleFromFilename(pendingFile.name) : 'تلاوة');
  track.reciter = $('reciterInput').value.trim(); track.surah = $('surahInput').value.trim(); track.year = $('yearInput').value.trim().replace(/هـ/g, '').trim();
  track.collection = $('collectionInput').value.trim(); track.playlists = splitList($('playlistsInput').value); track.tags = splitList($('tagsInput').value); track.rare = $('rareInput').checked;
  track.start = times.start; track.end = times.end;

  if (removeLocalPending && track.localAudioKey) { await deleteBlob(track.localAudioKey).catch(() => {}); track.localAudioKey = ''; track.localOrigin = ''; track.bytes = 0; }
  if (pendingFile) {
    if (track.localAudioKey) await deleteBlob(track.localAudioKey).catch(() => {});
    track.localAudioKey = 'a-' + track.id; track.localOrigin = 'device'; track.bytes = pendingFile.size; await putBlob(track.localAudioKey, pendingFile);
  }
  await commitCover(track); await putTrack(track);
  if (isNew) state.tracks.push(track);
  $('addDialog').close(); render(); toast(isNew ? 'أضيفت التلاوة.' : 'حُفظ التعديل.');
  if (state.currentId === track.id) { syncNow(); player.load(track, { autoplay: player.playing, resume: true }); }
});
$('deleteBtn').addEventListener('click', async () => {
  if (!editing || !confirm(`حذف «${editing.title || 'بلا عنوان'}» من المكتبة؟`)) return;
  if (editing.localAudioKey) await deleteBlob(editing.localAudioKey).catch(() => {});
  if (editing.coverKey) await deleteBlob(editing.coverKey).catch(() => {});
  releaseCoverUrl(editing.id); await deleteTrack(editing.id); state.tracks = state.tracks.filter(t => t.id !== editing.id);
  if (state.currentId === editing.id) { player.stop(); state.currentId = null; $('mini').hidden = true; closeNow(); }
  $('addDialog').close(); render(); toast('حُذفت التلاوة.');
});
document.addEventListener('click', e => { const close = e.target.closest('[data-close]'); if (close) close.closest('dialog').close(); });

/* ── backup / install ──────────────────────────────────────────────────── */
apiBase().then(url => { if ($('apiInput')) $('apiInput').value = url; });

$('apiSave').addEventListener('click', async () => {
  await setApiBase($('apiInput').value);
  $('apiState').textContent = $('apiInput').value.trim() ? 'حُفظ.' : 'أُلغي — سيعمل التطبيق بدون خادم.';
});

$('apiTest').addEventListener('click', async () => {
  await setApiBase($('apiInput').value);
  const base = await apiBase();
  if (!base) { $('apiState').textContent = 'لا عنوان محفوظ.'; return; }
  $('apiState').textContent = 'جارٍ الاختبار…';
  try {
    const res = await fetch(base + '/api/health', { mode: 'cors' });
    const data = await res.json();
    $('apiState').textContent = data && data.ok
      ? `متصل. فهرس D1: ${data.d1 ? 'مربوط' : 'غير مربوط'}.`
      : 'ردّ غير متوقّع.';
  } catch {
    $('apiState').textContent = 'تعذّر الاتصال — تأكّد من العنوان ومن نشر الخادم.';
  }
});

$('exportBtn').addEventListener('click', () => {
  const portable = state.tracks.filter(t => t.youtubeId || t.audioUrl).map(t => { const { localAudioKey, localOrigin, bytes, coverKey, ...rest } = t; return rest; });
  const payload = { app: 'tilawat', version: 3, exportedAt: new Date().toISOString(), tracks: portable };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `tilawat-${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast(`صُدّرت ${portable.length} تلاوة.`);
});
$('importBtn').addEventListener('click', () => $('importInput').click());
$('importInput').addEventListener('change', async () => {
  const file = $('importInput').files[0]; $('importInput').value = ''; if (!file) return;
  try {
    const data = JSON.parse(await file.text()); if (!data || data.app !== 'tilawat' || !Array.isArray(data.tracks)) throw new Error('shape');
    const known = new Set(state.tracks.map(t => t.id)); let added = 0;
    for (const raw of data.tracks) { const track = normalizeTrack(raw); if (!track.id || known.has(track.id) || (!track.youtubeId && !track.audioUrl)) continue; track.localAudioKey = ''; track.localOrigin = ''; track.coverKey = ''; await putTrack(track); state.tracks.push(track); known.add(track.id); added++; }
    render(); toast(added ? `استُعيدت ${added} تلاوة.` : 'لا جديد في الملف.');
  } catch { toast('ملف النسخة غير صالح.'); }
});
let installEvent = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; $('installBtn').hidden = false; $('installNote').hidden = true; });
$('installBtn').addEventListener('click', async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice; installEvent = null; $('installBtn').hidden = true; });
addEventListener('appinstalled', () => { $('installBtn').hidden = true; $('installNote').hidden = true; toast('تم التثبيت.'); });

/* ── startup / migration ───────────────────────────────────────────────── */
async function restorePrefs() {
  const [sort, repeat, shuffle, rate, seg] = await Promise.all(['sort','repeat','shuffle','rate','libSeg'].map(k => getPref(k).catch(() => undefined)));
  if (sort && SORTS[sort]) { state.sort = sort; $('sort').value = sort; }
  if (repeat) { state.repeat = repeat; $('repeatBtn').setAttribute('aria-pressed', String(repeat !== 'off')); }
  if (shuffle) { state.shuffle = true; $('shuffleBtn').setAttribute('aria-pressed', 'true'); }
  if (rate && RATES.includes(rate)) { player.setRate(rate); $('rateBtn').textContent = `${rate.toFixed(rate % 1 ? 2 : 1)}×`; }
  if (seg && LIB_SEGS.some(s => s.id === seg)) state.libSeg = seg;
}
function handleLaunchParams() {
  const params = new URLSearchParams(location.search); const shared = params.get('url') || params.get('text') || ''; const wantsAdd = params.has('add') || shared;
  if ([...params.keys()].length) history.replaceState(null, '', location.pathname); if (!wantsAdd) return;
  const match = shared.match(/https?:\/\/\S+/); openAdd(match ? match[0] : '');
}
(async function start() {
  try {
    const raw = await allTracks();
    state.tracks = raw.map(normalizeTrack).map(ensureVariants);
    // Persist migrated v1 records once so future starts are native v2.
    await Promise.all(state.tracks.map(putTrack));
    await loadCoverUrls(state.tracks);
  } catch (err) { console.error(err); state.tracks = []; toast('تعذر فتح مكتبة المتصفح.', 5000); }
  await restorePrefs(); showTab('home'); handleLaunchParams();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(ok => { if (!ok) navigator.storage.persist().catch(() => {}); });
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(err => console.warn('sw', err));
})();
