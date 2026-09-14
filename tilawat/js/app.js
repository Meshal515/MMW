/* ── app ──────────────────────────────────────────────────────────────────────
   Three tabs over one library, a mini player that expands into a full sheet,
   and the forms that feed them. */

import { allTracks, putTrack, deleteTrack, putBlob, deleteBlob,
         blobsSize, getPref, setPref, newId } from './store.js';
import { SURAHS, parseSource, fetchYoutubeMeta, youtubeThumb, bestYoutubeThumb,
         youtubeWatch, titleFromFilename, parseTime, formatTime, formatBytes,
         coverHues } from './sources.js';
import { coverSrc, coverFallbackAttr, fallbackCover, hasOwnCover, loadCoverUrls,
         refreshCoverUrl, releaseCoverUrl } from './covers.js';
import { Player, bindMediaSession } from './player.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const KIND_LABEL = { youtube: 'يوتيوب', url: 'رابط', file: 'جهازك' };
const RATES = [0.75, 1, 1.25, 1.5, 2];
const FILTERS = [
  { id: 'all',      label: 'الكل' },
  { id: 'favorite', label: 'المفضّلة' },
  { id: 'youtube',  label: 'يوتيوب' },
  { id: 'url',      label: 'روابط' },
  { id: 'file',     label: 'من الجهاز' },
  { id: 'offline',  label: 'بلا إنترنت' }
];

const state = {
  tracks: [],
  tab: 'home',
  filter: 'all',
  query: '',
  sort: 'added',
  queue: [],
  currentId: null,
  repeat: 'off',
  shuffle: false,
  sleep: { mode: null, at: 0, timer: null }
};

const player = new Player('ytMount');
const trackById = id => state.tracks.find(t => t.id === id);
const current = () => trackById(state.currentId);
const isOffline = track => track.kind === 'file' || !!track.blobKey;
const subtitle = track => [track.reciter, track.surah].filter(Boolean).join(' · ') || KIND_LABEL[track.kind];

let toastTimer = null;
function toast(message, ms = 3200) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

/* ── theme ──────────────────────────────────────────────────────────────── */

$('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('tilawat-theme', next); } catch {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === 'dark' ? '#0A0C0B' : '#F5F3ED';
});

/* ── selection ──────────────────────────────────────────────────────────── */

function matchesFilter(track) {
  switch (state.filter) {
    case 'favorite': return !!track.favorite;
    case 'youtube':  return track.kind === 'youtube';
    case 'url':      return track.kind === 'url';
    case 'file':     return track.kind === 'file';
    case 'offline':  return isOffline(track);
    default:         return true;
  }
}

function matchesQuery(track, query) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return true;
  return [track.title, track.reciter, track.surah, ...(track.tags || [])]
    .filter(Boolean).join(' ').toLowerCase().includes(q);
}

const SORTS = {
  added:   (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
  title:   (a, b) => (a.title || '').localeCompare(b.title || '', 'ar'),
  reciter: (a, b) => (a.reciter || '').localeCompare(b.reciter || '', 'ar') ||
                     (a.title || '').localeCompare(b.title || '', 'ar'),
  played:  (a, b) => (b.playCount || 0) - (a.playCount || 0),
  recent:  (a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0)
};
const sortTracks = list => list.slice().sort(SORTS[state.sort] || SORTS.added);

/* ── rendering ──────────────────────────────────────────────────────────── */

function cardHTML(track) {
  const playing = state.currentId === track.id;
  const badges = [
    `<span class="badge">${esc(KIND_LABEL[track.kind])}</span>`,
    isOffline(track) ? '<span class="badge badge--off">بلا نت</span>' : '',
    (track.start > 0 || track.end > 0) ? '<span class="badge">مقصوص</span>' : ''
  ].join('');
  return `
  <article class="card" data-id="${esc(track.id)}" data-current="${playing}">
    <div class="card__art">
      <img src="${esc(coverSrc(track))}" alt="" loading="lazy" decoding="async" ${coverFallbackAttr(track)} />
      <div class="card__badges">${badges}</div>
      ${playing ? `<span class="eq" data-paused="${!player.playing}" aria-hidden="true"><i></i><i></i><i></i></span>` : ''}
      <button class="card__play" type="button" data-act="play" aria-label="تشغيل ${esc(track.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 19 12 7 19.5z"/></svg>
      </button>
    </div>
    <div>
      <div class="card__t">${esc(track.title || 'بلا عنوان')}</div>
      <div class="card__s">${esc(subtitle(track))}</div>
    </div>
  </article>`;
}

function rowHTML(track) {
  return `
  <div class="row" data-id="${esc(track.id)}" data-current="${state.currentId === track.id}">
    <img class="row__art" src="${esc(coverSrc(track))}" alt="" loading="lazy" ${coverFallbackAttr(track)} />
    <button class="row__text" type="button" data-act="play">
      <span class="row__t">${esc(track.title || 'بلا عنوان')}</span>
      <span class="row__s">${esc(subtitle(track))}${isOffline(track) ? ' · بلا نت' : ''}</span>
    </button>
    <span class="row__acts">
      <button class="iconbtn heart" type="button" data-act="favorite" aria-pressed="${!!track.favorite}" aria-label="مفضّلة">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 20.5-7-6.6a4.3 4.3 0 0 1 6-6.1l1 .9 1-.9a4.3 4.3 0 0 1 6 6.1Z"/></svg>
      </button>
      <button class="iconbtn" type="button" data-act="edit" aria-label="تعديل">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/></svg>
      </button>
    </span>
  </div>`;
}

function renderFilters() {
  const counts = {
    all: state.tracks.length,
    favorite: state.tracks.filter(t => t.favorite).length,
    youtube: state.tracks.filter(t => t.kind === 'youtube').length,
    url: state.tracks.filter(t => t.kind === 'url').length,
    file: state.tracks.filter(t => t.kind === 'file').length,
    offline: state.tracks.filter(isOffline).length
  };
  $('filters').innerHTML = FILTERS
    .filter(f => f.id === 'all' || counts[f.id] > 0)
    .map(f => `<button class="chip" type="button" data-filter="${f.id}" aria-pressed="${state.filter === f.id}">
                 ${esc(f.label)}<span class="chip__n">${counts[f.id]}</span></button>`).join('');
}

function renderHome() {
  const visible = sortTracks(state.tracks.filter(matchesFilter));
  state.queue = visible;

  const hasAny = state.tracks.length > 0;
  $('empty').hidden = visible.length > 0;
  $('shelfAll').hidden = visible.length === 0;

  if (!visible.length) {
    $('shortcuts').innerHTML = '';
    $('shelfFav').hidden = true;
    $('emptyTitle').textContent = hasAny ? 'لا شيء هنا' : 'ابدأ مكتبتك';
    $('emptyText').textContent = hasAny
      ? 'ما في تلاوة تطابق هذه التصفية.'
      : 'الصق رابط تلاوة من يوتيوب، أو رابط ملف صوتي مباشر، أو اختر ملفًا من جهازك. كل شيء يُحفظ في هذا المتصفح وحده — بلا حساب وبلا سيرفر.';
    $('emptyAdd').hidden = hasAny;
    return;
  }

  // The tiles at the top are the quickest way back to what you were on.
  const recent = state.tracks.filter(t => t.lastPlayedAt)
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, 6);
  const shortcuts = recent.length >= 2 ? recent : visible.slice(0, 6);
  $('shortcuts').innerHTML = shortcuts.map(track => `
    <button class="shortcut" type="button" data-id="${esc(track.id)}" data-act="play">
      <img src="${esc(coverSrc(track))}" alt="" loading="lazy" ${coverFallbackAttr(track)} />
      <span class="shortcut__t">${esc(track.title || 'بلا عنوان')}</span>
    </button>`).join('');

  const favourites = visible.filter(t => t.favorite);
  $('shelfFav').hidden = favourites.length === 0 || state.filter === 'favorite';
  $('railFav').innerHTML = favourites.map(cardHTML).join('');

  $('shelfAllTitle').textContent = state.filter === 'all'
    ? 'كل التلاوات'
    : FILTERS.find(f => f.id === state.filter).label;
  $('gridAll').innerHTML = visible.map(cardHTML).join('');
}

function renderSearch() {
  const results = sortTracks(state.tracks.filter(t => matchesQuery(t, state.query)));
  const searching = state.query.trim().length > 0;
  if (searching) state.queue = results;
  $('gridSearch').innerHTML = searching ? results.map(cardHTML).join('') : '';
  $('searchHint').hidden = searching && results.length > 0;
  $('searchHint').textContent = searching
    ? 'لا نتائج. جرّب كلمة أخرى.'
    : 'ابحث بالعنوان أو القارئ أو السورة أو الوسم.';
}

function renderLibrary() {
  const list = sortTracks(state.tracks);
  $('rowsLib').innerHTML = list.map(rowHTML).join('');
  $('statCount').textContent = state.tracks.length;
  $('statYt').textContent = state.tracks.filter(t => t.kind === 'youtube').length;
  $('statUrl').textContent = state.tracks.filter(t => t.kind === 'url').length;
  $('statFile').textContent = state.tracks.filter(t => t.kind === 'file').length;
  $('statOffline').textContent = state.tracks.filter(isOffline).length;
  blobsSize().then(size => { $('statSize').textContent = formatBytes(size); }).catch(() => {});
}

function render() {
  renderFilters();
  if (state.tab === 'home') renderHome();
  else if (state.tab === 'search') renderSearch();
  else if (state.tab === 'lib') renderLibrary();
  syncNow();
}

/* ── tabs ───────────────────────────────────────────────────────────────── */

function showTab(tab) {
  if (tab === 'add') { openAdd(); return; }
  state.tab = tab;
  $('viewHome').hidden = tab !== 'home';
  $('viewSearch').hidden = tab !== 'search';
  $('viewLib').hidden = tab !== 'lib';
  $('filters').hidden = tab !== 'home';
  document.querySelectorAll('.tab').forEach(button => {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0 });
  render();
  if (tab === 'search') setTimeout(() => $('search').focus(), 60);
}

document.querySelector('.tabbar').addEventListener('click', event => {
  const tab = event.target.closest('[data-tab]');
  if (tab) showTab(tab.dataset.tab);
});

$('filters').addEventListener('click', event => {
  const chip = event.target.closest('[data-filter]');
  if (!chip) return;
  state.filter = chip.dataset.filter;
  render();
});

$('search').addEventListener('input', event => {
  state.query = event.target.value;
  renderSearch();
});

$('sort').addEventListener('change', event => {
  state.sort = event.target.value;
  setPref('sort', state.sort);
  render();
});

addEventListener('scroll', () => {
  $('topbar').classList.toggle('is-stuck', window.scrollY > 6);
}, { passive: true });

/* ── list interactions ──────────────────────────────────────────────────── */

async function handleListClick(event) {
  const host = event.target.closest('[data-id]');
  if (!host) return;
  const track = trackById(host.dataset.id);
  if (!track) return;
  const action = event.target.closest('[data-act]');
  if (!action) return;

  switch (action.dataset.act) {
    case 'play': playTrack(track); break;
    case 'edit': openEdit(track); break;
    case 'favorite': await toggleFavorite(track); break;
  }
}
['shortcuts', 'railFav', 'gridAll', 'gridSearch', 'rowsLib'].forEach(id =>
  $(id).addEventListener('click', handleListClick));

async function toggleFavorite(track) {
  track.favorite = !track.favorite;
  await putTrack(track);
  toast(track.favorite ? 'أُضيفت إلى المفضّلة.' : 'أُزيلت من المفضّلة.', 1800);
  render();
}

/* ── offline copies ─────────────────────────────────────────────────────── */

async function saveOfflineCopy(track) {
  toast('جارٍ حفظ نسخة…', 60000);
  try {
    const res = await fetch(track.src, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    if (!blob.size) throw new Error('empty');
    const key = 'b-' + track.id;
    await putBlob(key, blob);
    track.blobKey = key;
    track.bytes = blob.size;
    await putTrack(track);
    render();
    toast(`حُفظت للاستماع بلا إنترنت (${formatBytes(blob.size)})`);
  } catch (err) {
    // Streaming through <audio> is exempt from CORS; copying the bytes is not.
    toast('تعذّر حفظ نسخة — الخادم لا يسمح بالتحميل من المتصفح. التشغيل المباشر يعمل كالمعتاد.', 5200);
    console.warn('offline copy failed', err);
  }
}

async function dropOfflineCopy(track) {
  if (track.blobKey) await deleteBlob(track.blobKey);
  delete track.blobKey;
  delete track.bytes;
  await putTrack(track);
  render();
  toast('حُذفت النسخة المحفوظة.');
}

/* ── playback ───────────────────────────────────────────────────────────── */

async function playTrack(track) {
  state.currentId = track.id;
  track.playCount = (track.playCount || 0) + 1;
  track.lastPlayedAt = Date.now();
  putTrack(track);

  $('mini').hidden = false;
  showVideo(false);
  syncNow();
  render();
  await player.load(track, { autoplay: true });
}

const currentIndex = () => state.queue.findIndex(t => t.id === state.currentId);

function step(delta, { auto = false } = {}) {
  if (!state.queue.length) return;
  const index = currentIndex();

  if (state.shuffle && auto) {
    if (state.queue.length === 1) { playTrack(state.queue[0]); return; }
    let pick = index;
    while (pick === index) pick = Math.floor(Math.random() * state.queue.length);
    playTrack(state.queue[pick]);
    return;
  }

  let next = index + delta;
  if (index < 0) next = 0;
  if (next < 0) next = state.queue.length - 1;
  if (next >= state.queue.length) {
    if (auto && state.repeat !== 'all') { player.pause(); return; }
    next = 0;
  }
  playTrack(state.queue[next]);
}

player.on('ended', () => {
  if (state.sleep.mode === 'end') { clearSleep(); player.pause(); toast('انتهى المؤقّت.'); return; }
  if (state.repeat === 'one') { player.seek(0); player.play(); return; }
  step(1, { auto: true });
});

player.on('error', err => {
  const code = err && err.message ? err.message : '';
  if (code === 'file-missing') toast('الملف غير موجود في هذا المتصفح — أعِد اختياره من جهازك.', 5000);
  else if (code === 'yt-api-unreachable') toast('تعذّر الوصول إلى يوتيوب — تأكّد من الإنترنت.', 5000);
  else if (code.startsWith('yt-')) toast('يوتيوب رفض تشغيل هذا المقطع (محذوف أو ممنوع من التضمين).', 5200);
  else toast('تعذّر تشغيل هذه التلاوة.', 4200);
  console.warn('playback error', err);
});

player.on('meta', ({ title, author }) => {
  const track = current();
  if (!track || !title) return;
  let changed = false;
  if (!track.title) { track.title = title; changed = true; }
  if (!track.reciter && author) { track.reciter = author; changed = true; }
  if (!changed) return;
  putTrack(track);
  syncNow();
  render();
});

player.on('duration', () => {
  const track = current();
  const seconds = Math.round(player.rawDuration);
  if (!track || !seconds || track.duration === seconds) return;
  track.duration = seconds;
  putTrack(track);
});

/* ── transport UI ───────────────────────────────────────────────────────── */

let scrubbing = false;
const PLAY_ICON = '<path d="M7 4.5 19 12 7 19.5z"/>';
const PAUSE_ICON = '<path d="M8 5h3v14H8zM13 5h3v14h-3z"/>';

player.on('state', () => {
  const playing = player.playing;
  $('playIcon').innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
  $('miniIcon').innerHTML = (playing ? PAUSE_ICON : PLAY_ICON).replace('<path', '<path fill="currentColor" stroke="none"');
  $('playBtn').setAttribute('aria-label', playing ? 'إيقاف مؤقّت' : 'تشغيل');
  $('miniPlay').setAttribute('aria-label', playing ? 'إيقاف مؤقّت' : 'تشغيل');
  $('playBtn').dataset.busy = String(player.buffering);
  $('rateBtn').textContent = String(player.rate).replace(/^1$/, '1.0') + '×';
  $('rateBtn').setAttribute('aria-pressed', String(player.rate !== 1));
  document.querySelectorAll('.eq').forEach(el => { el.dataset.paused = String(!playing); });
});

player.on('time', () => {
  if (scrubbing) return;
  const duration = player.duration;
  const ratio = duration ? Math.min(1, player.position / duration) : 0;
  $('curTime').textContent = formatTime(player.position);
  $('durTime').textContent = duration ? formatTime(duration) : '—:—';
  $('seek').value = String(Math.round(ratio * 1000));
  $('miniProgress').style.width = (ratio * 100).toFixed(2) + '%';
});

$('playBtn').addEventListener('click', () => player.toggle());
$('miniPlay').addEventListener('click', () => player.toggle());
$('prevBtn').addEventListener('click', () => {
  // A second press within the first few seconds means "the one before this".
  if (player.position > 4) { player.seek(0); return; }
  step(-1);
});
$('nextBtn').addEventListener('click', () => step(1));
$('back10').addEventListener('click', () => player.nudge(-10));
$('fwd10').addEventListener('click', () => player.nudge(10));

$('seek').addEventListener('input', () => {
  scrubbing = true;
  const duration = player.duration;
  if (duration) $('curTime').textContent = formatTime(Number($('seek').value) / 1000 * duration);
});
$('seek').addEventListener('change', () => {
  const duration = player.duration;
  if (duration) player.seek(Number($('seek').value) / 1000 * duration);
  scrubbing = false;
});

$('rateBtn').addEventListener('click', () => {
  const next = RATES[(RATES.indexOf(player.rate) + 1) % RATES.length];
  player.setRate(next);
  setPref('rate', next);
});

const REPEAT_ORDER = ['off', 'all', 'one'];
const REPEAT_LABEL = { off: 'التكرار: بلا', all: 'التكرار: الكل', one: 'التكرار: هذه التلاوة' };
const REPEAT_BASE = '<path d="M17 3l3 3-3 3"/><path d="M20 6H8a4 4 0 0 0-4 4v1"/><path d="M7 21l-3-3 3-3"/><path d="M4 18h12a4 4 0 0 0 4-4v-1"/>';

function renderRepeat() {
  const button = $('repeatBtn');
  button.setAttribute('aria-pressed', String(state.repeat !== 'off'));
  button.setAttribute('aria-label', REPEAT_LABEL[state.repeat]);
  button.title = REPEAT_LABEL[state.repeat];
  $('repeatIcon').innerHTML = state.repeat === 'one'
    ? REPEAT_BASE + '<text x="12" y="15.5" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" stroke="none">1</text>'
    : REPEAT_BASE;
}

$('repeatBtn').addEventListener('click', () => {
  state.repeat = REPEAT_ORDER[(REPEAT_ORDER.indexOf(state.repeat) + 1) % REPEAT_ORDER.length];
  setPref('repeat', state.repeat);
  renderRepeat();
  toast(REPEAT_LABEL[state.repeat], 1600);
});

$('shuffleBtn').addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  setPref('shuffle', state.shuffle);
  $('shuffleBtn').setAttribute('aria-pressed', String(state.shuffle));
  toast(state.shuffle ? 'ترتيب عشوائي.' : 'ترتيب المكتبة.', 1600);
});

/* ── now playing sheet ──────────────────────────────────────────────────── */

function syncNow() {
  const track = current();
  if (!track) { $('mini').hidden = true; closeNow(); return; }

  const src = coverSrc(track);
  const onFallback = fallback => () => { $('nowArt').src = fallback; $('miniArt').src = fallback; };
  $('nowArt').onerror = onFallback(fallbackCover(track));
  $('miniArt').onerror = onFallback(fallbackCover(track));
  $('nowArt').src = src;
  $('miniArt').src = src;

  $('nowTitle').textContent = track.title || 'بلا عنوان';
  $('miniTitle').textContent = track.title || 'بلا عنوان';
  $('nowSub').textContent = subtitle(track);
  $('miniSub').textContent = subtitle(track);
  $('nowFrom').textContent = 'من مكتبتك · ' + KIND_LABEL[track.kind];

  $('nowFav').setAttribute('aria-pressed', String(!!track.favorite));
  $('miniFav').setAttribute('aria-pressed', String(!!track.favorite));

  const [h1, h2] = coverHues(track.title || track.id);
  $('now').style.setProperty('--glow', `hsl(${h1} 52% 26%)`);
  $('nowGlow').style.background =
    `radial-gradient(120% 70% at 50% 0%, hsl(${h1} 54% 28%) 0%, hsl(${h2} 46% 16%) 38%, transparent 74%)`;

  const isYt = track.kind === 'youtube';
  $('videoBtn').hidden = !isYt;
  $('offlineBtn').hidden = track.kind !== 'url';
  $('offlineBtn').setAttribute('aria-pressed', String(isOffline(track)));
  $('offlineBtn').title = isOffline(track) ? 'محفوظة بلا إنترنت' : 'حفظ بلا إنترنت';
}

function openNow() {
  if (!current()) return;
  $('now').hidden = false;
  document.body.classList.add('is-locked');
}
function closeNow() {
  $('now').hidden = true;
  document.body.classList.remove('is-locked');
}

$('miniOpen').addEventListener('click', openNow);
$('nowClose').addEventListener('click', closeNow);
$('nowEdit').addEventListener('click', () => { const t = current(); if (t) openEdit(t); });
$('nowFav').addEventListener('click', () => { const t = current(); if (t) toggleFavorite(t); });
$('miniFav').addEventListener('click', () => { const t = current(); if (t) toggleFavorite(t); });
$('offlineBtn').addEventListener('click', () => {
  const track = current();
  if (!track || track.kind !== 'url') return;
  isOffline(track) ? dropOfflineCopy(track) : saveOfflineCopy(track);
});

function showVideo(on) {
  $('ytPark').classList.toggle('is-shown', on);
  $('videoBtn').setAttribute('aria-pressed', String(on));
  $('videoBtn').title = on ? 'إخفاء الفيديو' : 'إظهار الفيديو';
}
$('videoBtn').addEventListener('click', () => {
  const on = !$('ytPark').classList.contains('is-shown');
  showVideo(on);
  if (on) openNow();
});

bindMediaSession(player, { next: () => step(1), previous: () => step(-1) });

document.addEventListener('keydown', event => {
  const tag = (event.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape' && !$('now').hidden) { closeNow(); return; }
  if (!player.track) return;
  if (event.code === 'Space') { event.preventDefault(); player.toggle(); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); player.nudge(-10); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); player.nudge(10); }
});

/* ── sleep timer ────────────────────────────────────────────────────────── */

function clearSleep() {
  clearTimeout(state.sleep.timer);
  state.sleep = { mode: null, at: 0, timer: null };
  $('timerBtn').setAttribute('aria-pressed', 'false');
}

function setSleep(minutes) {
  clearSleep();
  if (minutes === 'end') {
    state.sleep.mode = 'end';
    $('timerBtn').setAttribute('aria-pressed', 'true');
    toast('سيتوقّف بعد هذه التلاوة.');
    return;
  }
  state.sleep.mode = 'clock';
  state.sleep.at = Date.now() + minutes * 60000;
  state.sleep.timer = setTimeout(() => { player.pause(); clearSleep(); toast('انتهى المؤقّت.'); }, minutes * 60000);
  $('timerBtn').setAttribute('aria-pressed', 'true');
  toast(`سيتوقّف بعد ${minutes} دقيقة.`);
}

$('timerBtn').addEventListener('click', () => {
  $('timerStatus').textContent = state.sleep.mode === 'end'
    ? 'المؤقّت: يتوقّف بعد هذه التلاوة.'
    : state.sleep.mode === 'clock'
      ? `المؤقّت: يتوقّف عند ${new Date(state.sleep.at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}.`
      : 'لا يوجد مؤقّت.';
  $('timerDialog').showModal();
});
$('timerDialog').addEventListener('click', event => {
  const chip = event.target.closest('[data-min]');
  if (!chip) return;
  setSleep(chip.dataset.min === 'end' ? 'end' : Number(chip.dataset.min));
  $('timerDialog').close();
});
$('timerOff').addEventListener('click', () => { clearSleep(); toast('أُوقف المؤقّت.'); $('timerDialog').close(); });

/* ── add / edit ─────────────────────────────────────────────────────────── */

let editing = null;
let detected = null;
let pendingFile = null;
let pendingCoverFile = null;   // an image picked this session, not yet saved
let draftCover = '';           // a cover URL pulled from the link
let clearCover = false;
let metaAbort = null;

let pendingCoverUrl = '';
function setPendingCoverFile(file) {
  if (pendingCoverUrl) URL.revokeObjectURL(pendingCoverUrl);
  pendingCoverFile = file;
  pendingCoverUrl = file ? URL.createObjectURL(file) : '';
}

function paintCoverPreview() {
  const img = $('coverPreview');
  if (pendingCoverFile) { img.src = pendingCoverUrl; return; }
  if (draftCover) { img.src = draftCover; return; }
  // Only a picture the track actually owns beats the live form: when the track
  // has none, the fallback must follow the reciter being typed right now.
  if (!clearCover && editing && hasOwnCover(editing)) { img.src = coverSrc(editing); return; }
  img.src = fallbackCover({
    reciter: $('reciterInput').value,
    title: $('titleInput').value,
    surah: $('surahInput').value
  });
}

function resetForm() {
  ['linkInput', 'titleInput', 'reciterInput', 'surahInput', 'tagsInput', 'startInput', 'endInput']
    .forEach(id => { $(id).value = ''; });
  $('fileInput').value = '';
  $('coverFileInput').value = '';
  $('formError').hidden = true;
  detected = null;
  pendingFile = null;
  setPendingCoverFile(null);
  draftCover = '';
  clearCover = false;
  $('coverFromLink').disabled = true;
}

function fillSuggestions() {
  $('surahList').innerHTML = SURAHS.map(s => `<option value="${esc(s)}"></option>`).join('');
  const reciters = [...new Set(state.tracks.map(t => t.reciter).filter(Boolean))].sort();
  $('reciterList').innerHTML = reciters.map(r => `<option value="${esc(r)}"></option>`).join('');
  const tags = [...new Set(state.tracks.flatMap(t => t.tags || []))].sort();
  $('tagList').innerHTML = tags.map(t => `<option value="${esc(t)}"></option>`).join('');
}

function openAdd(prefill = '') {
  editing = null;
  resetForm();
  fillSuggestions();
  $('addTitle').textContent = 'أضف تلاوة';
  $('saveBtn').textContent = 'حفظ';
  $('deleteBtn').hidden = true;
  $('linkField').hidden = false;
  $('fileField').hidden = false;
  paintCoverPreview();
  $('addDialog').showModal();
  if (prefill) { $('linkInput').value = prefill; detectLink(); }
  setTimeout(() => $('linkInput').focus(), 30);
}

function openEdit(track) {
  editing = track;
  resetForm();
  fillSuggestions();
  $('addTitle').textContent = 'تعديل التلاوة';
  $('saveBtn').textContent = 'حفظ التعديل';
  $('deleteBtn').hidden = false;
  $('linkField').hidden = true;
  $('fileField').hidden = true;
  $('titleInput').value = track.title || '';
  $('reciterInput').value = track.reciter || '';
  $('surahInput').value = track.surah || '';
  $('tagsInput').value = (track.tags || []).join('، ');
  $('startInput').value = track.start ? formatTime(track.start) : '';
  $('endInput').value = track.end ? formatTime(track.end) : '';
  $('coverFromLink').disabled = track.kind !== 'youtube';
  paintCoverPreview();
  $('addDialog').showModal();
}

let detectTimer = null;
$('linkInput').addEventListener('input', () => {
  clearTimeout(detectTimer);
  detectTimer = setTimeout(detectLink, 320);
});
['titleInput', 'reciterInput', 'surahInput'].forEach(id =>
  $(id).addEventListener('input', () => { if (!pendingCoverFile && !draftCover) paintCoverPreview(); }));

async function detectLink() {
  const value = $('linkInput').value.trim();
  $('formError').hidden = true;
  if (!value) { detected = null; $('coverFromLink').disabled = true; paintCoverPreview(); return; }

  detected = parseSource(value);
  if (!detected) {
    $('coverFromLink').disabled = true;
    $('formError').hidden = false;
    $('formError').textContent = 'هذا ليس رابطًا مفهومًا. الصق رابط يوتيوب أو رابط ملف صوتي.';
    return;
  }
  pendingFile = null;
  $('fileInput').value = '';
  $('coverFromLink').disabled = detected.kind !== 'youtube';

  if (detected.kind === 'youtube') {
    if (!pendingCoverFile) { draftCover = detected.thumb; clearCover = false; paintCoverPreview(); }
    if (detected.start && !$('startInput').value) $('startInput').value = formatTime(detected.start);
    if (metaAbort) metaAbort.abort();
    metaAbort = new AbortController();
    const meta = await fetchYoutubeMeta(detected.src, metaAbort.signal);
    if (!detected || detected.kind !== 'youtube') return;
    if (meta && meta.title) {
      if (!$('titleInput').value) $('titleInput').value = meta.title;
      if (!$('reciterInput').value && meta.author) $('reciterInput').value = meta.author;
    }
    // The sharpest thumbnail YouTube actually stores, once we know it exists.
    if (!pendingCoverFile) {
      const best = await bestYoutubeThumb(detected.src);
      if (detected && detected.kind === 'youtube' && !pendingCoverFile) { draftCover = best; paintCoverPreview(); }
    }
    return;
  }

  const name = decodeURIComponent(new URL(detected.src).pathname.split('/').pop() || '');
  if (!$('titleInput').value && name) $('titleInput').value = titleFromFilename(name);
  paintCoverPreview();
  if (!detected.looksLikeAudio) {
    $('formError').hidden = false;
    $('formError').textContent = 'هذا الرابط لا ينتهي بامتداد صوتي — قد لا يشتغل. جرّب حفظه وشغّله للتأكّد.';
  }
}

$('coverFromLink').addEventListener('click', async () => {
  const id = detected && detected.kind === 'youtube' ? detected.src
           : editing && editing.kind === 'youtube' ? editing.src : null;
  if (!id) return;
  $('coverFromLink').disabled = true;
  draftCover = await bestYoutubeThumb(id);
  setPendingCoverFile(null);
  clearCover = false;
  paintCoverPreview();
  $('coverFromLink').disabled = false;
  toast('جُلبت الصورة المصغّرة.', 2000);
});

$('coverFromFile').addEventListener('click', () => $('coverFileInput').click());
$('coverFileInput').addEventListener('change', () => {
  const file = $('coverFileInput').files[0];
  if (!file) return;
  setPendingCoverFile(file);
  draftCover = '';
  clearCover = false;
  paintCoverPreview();
});
$('coverClear').addEventListener('click', () => {
  setPendingCoverFile(null);
  draftCover = '';
  clearCover = true;
  $('coverFileInput').value = '';
  paintCoverPreview();
  toast('سيُستخدم الغلاف المدمج.', 2000);
});

$('fileInput').addEventListener('change', async () => {
  const files = [...$('fileInput').files];
  if (!files.length) return;
  $('linkInput').value = '';
  detected = null;
  $('coverFromLink').disabled = true;

  if (files.length === 1) {
    pendingFile = files[0];
    if (!$('titleInput').value) $('titleInput').value = titleFromFilename(files[0].name);
    paintCoverPreview();
    return;
  }

  // More than one file is a bulk import; the form would only be in the way.
  let added = 0;
  for (const file of files) {
    const track = blankTrack('file');
    track.blobKey = 'b-' + track.id;
    track.src = track.blobKey;
    track.fileName = file.name;
    track.title = titleFromFilename(file.name);
    track.bytes = file.size;
    await putBlob(track.blobKey, file);
    await putTrack(track);
    state.tracks.push(track);
    added++;
  }
  $('addDialog').close();
  render();
  toast(`أُضيفت ${added} تلاوة من جهازك.`);
});

function blankTrack(kind) {
  return {
    id: newId(), kind, src: '', title: '', reciter: '', surah: '', tags: [],
    start: 0, end: 0, duration: 0, thumb: '', cover: '', favorite: false,
    addedAt: Date.now(), lastPlayedAt: 0, playCount: 0
  };
}

function readTimes() {
  const start = $('startInput').value.trim() ? parseTime($('startInput').value) : 0;
  const end = $('endInput').value.trim() ? parseTime($('endInput').value) : 0;
  if (start === null || end === null) return { error: 'وقت غير صحيح. اكتب مثل 1:23 أو 83.' };
  if (end && start && end <= start) return { error: 'وقت النهاية لازم يكون بعد البداية.' };
  return { start: start || 0, end: end || 0 };
}

/** Applies whatever the cover picker was left on. */
async function commitCover(track) {
  if (pendingCoverFile) {
    track.coverKey = 'c-' + track.id;
    await putBlob(track.coverKey, pendingCoverFile);
    track.cover = '';
    await refreshCoverUrl(track);
    return;
  }
  if (draftCover) {
    if (track.coverKey) { await deleteBlob(track.coverKey); delete track.coverKey; releaseCoverUrl(track.id); }
    track.cover = draftCover;
    return;
  }
  if (clearCover) {
    if (track.coverKey) { await deleteBlob(track.coverKey); delete track.coverKey; releaseCoverUrl(track.id); }
    track.cover = '';
    track.thumb = '';
  }
}

$('addForm').addEventListener('submit', async event => {
  event.preventDefault();
  const times = readTimes();
  if (times.error) { $('formError').hidden = false; $('formError').textContent = times.error; return; }

  const common = {
    title: $('titleInput').value.trim(),
    reciter: $('reciterInput').value.trim(),
    surah: $('surahInput').value.trim(),
    tags: $('tagsInput').value.split(/[،,]/).map(s => s.trim()).filter(Boolean),
    start: times.start,
    end: times.end
  };

  if (editing) {
    Object.assign(editing, common);
    await commitCover(editing);
    await putTrack(editing);
    $('addDialog').close();
    render();
    toast('حُفظ التعديل.');
    return;
  }

  let track;
  if (pendingFile) {
    track = blankTrack('file');
    track.blobKey = 'b-' + track.id;
    track.src = track.blobKey;
    track.fileName = pendingFile.name;
    track.bytes = pendingFile.size;
    await putBlob(track.blobKey, pendingFile);
  } else if (detected) {
    track = blankTrack(detected.kind);
    track.src = detected.src;
    track.thumb = detected.kind === 'youtube' ? youtubeThumb(detected.src) : '';
  } else {
    $('formError').hidden = false;
    $('formError').textContent = 'الصق رابطًا أو اختر ملفًا أولًا.';
    return;
  }

  Object.assign(track, common);
  if (!track.title) track.title = track.kind === 'youtube' ? 'تلاوة من يوتيوب' : 'تلاوة';
  await commitCover(track);
  await putTrack(track);
  state.tracks.push(track);
  $('addDialog').close();
  render();
  toast('أُضيفت التلاوة.');
});

$('deleteBtn').addEventListener('click', async () => {
  if (!editing) return;
  if (!confirm(`حذف «${editing.title || 'بلا عنوان'}» من المكتبة؟`)) return;
  if (editing.blobKey) await deleteBlob(editing.blobKey);
  if (editing.coverKey) await deleteBlob(editing.coverKey);
  releaseCoverUrl(editing.id);
  await deleteTrack(editing.id);
  state.tracks = state.tracks.filter(t => t.id !== editing.id);
  if (state.currentId === editing.id) {
    player.stop();
    state.currentId = null;
    $('mini').hidden = true;
    closeNow();
  }
  $('addDialog').close();
  render();
  toast('حُذفت التلاوة.');
});

$('addTop').addEventListener('click', () => openAdd());
$('emptyAdd').addEventListener('click', () => openAdd());
document.addEventListener('click', event => {
  const close = event.target.closest('[data-close]');
  if (close) close.closest('dialog').close();
});

/* ── backup and install ─────────────────────────────────────────────────── */

$('exportBtn').addEventListener('click', () => {
  // Device files and device images have no copy outside this browser, so they
  // cannot travel in a JSON backup. Exporting them would restore dead entries.
  const portable = state.tracks.filter(t => t.kind !== 'file');
  const skipped = state.tracks.length - portable.length;
  const payload = {
    app: 'tilawat', version: 2, exportedAt: new Date().toISOString(),
    tracks: portable.map(({ blobKey, bytes, coverKey, ...rest }) => rest)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tilawat-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(skipped ? `صُدّرت ${portable.length} تلاوة. ${skipped} من ملفات جهازك لم تُصدَّر.` : `صُدّرت ${portable.length} تلاوة.`, 4600);
});

$('importBtn').addEventListener('click', () => $('importInput').click());

$('importInput').addEventListener('change', async () => {
  const file = $('importInput').files[0];
  $('importInput').value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== 'tilawat' || !Array.isArray(data.tracks)) throw new Error('shape');
    const known = new Set(state.tracks.map(t => t.id));
    let added = 0;
    for (const raw of data.tracks) {
      if (!raw || !raw.id || !raw.kind || !raw.src || known.has(raw.id)) continue;
      if (raw.kind !== 'youtube' && raw.kind !== 'url') continue;
      const track = { ...blankTrack(raw.kind), ...raw };
      delete track.blobKey;
      delete track.coverKey;
      await putTrack(track);
      state.tracks.push(track);
      known.add(track.id);
      added++;
    }
    render();
    toast(added ? `استُعيدت ${added} تلاوة.` : 'لا جديد في هذا الملف.');
  } catch {
    toast('ملف النسخة غير صالح.');
  }
});

let installEvent = null;
addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installEvent = event;
  $('installBtn').hidden = false;
  $('installNote').hidden = true;
});
$('installBtn').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  $('installBtn').hidden = true;
});
addEventListener('appinstalled', () => {
  $('installBtn').hidden = true;
  $('installNote').hidden = true;
  toast('تم التثبيت.');
});

/* ── start ──────────────────────────────────────────────────────────────── */

async function restorePrefs() {
  const [sort, repeat, shuffle, rate] = await Promise.all(
    ['sort', 'repeat', 'shuffle', 'rate'].map(k => getPref(k).catch(() => undefined)));
  if (sort && SORTS[sort]) { state.sort = sort; $('sort').value = sort; }
  if (repeat) state.repeat = repeat;
  if (shuffle) { state.shuffle = true; $('shuffleBtn').setAttribute('aria-pressed', 'true'); }
  if (rate && RATES.includes(rate)) player.setRate(rate);
  renderRepeat();
}

function handleLaunchParams() {
  const params = new URLSearchParams(location.search);
  // The Android share sheet sends a YouTube link as `url`, or inside `text`.
  const shared = params.get('url') || params.get('text') || '';
  const wantsAdd = params.has('add') || shared;
  if ([...params.keys()].length) history.replaceState(null, '', location.pathname);
  if (!wantsAdd) return;
  const match = shared.match(/https?:\/\/\S+/);
  openAdd(match ? match[0] : '');
}

(async function start() {
  try {
    state.tracks = await allTracks();
    await loadCoverUrls(state.tracks);
  } catch (err) {
    console.error(err);
    toast('تعذّر فتح مكتبة المتصفح. جرّب خارج وضع التصفّح الخفي.', 6000);
    state.tracks = [];
  }
  await restorePrefs();
  showTab('home');
  handleLaunchParams();

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(ok => { if (!ok) navigator.storage.persist().catch(() => {}); });
  }
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('sw', err));
  }
})();
