/* ── app ──────────────────────────────────────────────────────────────────────
   The library, the forms and the wiring between them and the player. */

import { allTracks, putTrack, deleteTrack, putBlob, getBlob, deleteBlob,
         blobsSize, getPref, setPref, newId } from './store.js';
import { SURAHS, parseSource, fetchYoutubeMeta, youtubeThumb, youtubeWatch,
         titleFromFilename, parseTime, formatTime, formatBytes } from './sources.js';
import { Player, bindMediaSession } from './player.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const KIND_LABEL = { youtube: 'يوتيوب', url: 'رابط صوتي', file: 'من الجهاز' };
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
  filter: 'all',
  query: '',
  sort: 'added',
  queue: [],
  currentId: null,
  repeat: 'off',      // off | all | one
  shuffle: false,
  sleep: { mode: null, at: 0, timer: null }
};

const player = new Player('ytMount');

/* ── small helpers ──────────────────────────────────────────────────────── */

let toastTimer = null;
function toast(message, ms = 3200) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

const isOffline = track => track.kind === 'file' || !!track.blobKey;

function trackSubtitle(track) {
  return [track.reciter, track.surah].filter(Boolean).join(' · ');
}

/* ── theme ──────────────────────────────────────────────────────────────── */

$('themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('tilawat-theme', next); } catch {}
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = next === 'dark' ? '#0D1512' : '#F5F3ED';
});

/* ── library rendering ──────────────────────────────────────────────────── */

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

function matchesQuery(track) {
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return [track.title, track.reciter, track.surah, ...(track.tags || [])]
    .filter(Boolean).join(' ').toLowerCase().includes(q);
}

function sortTracks(list) {
  const by = {
    added:   (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
    title:   (a, b) => (a.title || '').localeCompare(b.title || '', 'ar'),
    reciter: (a, b) => (a.reciter || '').localeCompare(b.reciter || '', 'ar') ||
                       (a.title || '').localeCompare(b.title || '', 'ar'),
    played:  (a, b) => (b.playCount || 0) - (a.playCount || 0),
    recent:  (a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0)
  };
  return list.slice().sort(by[state.sort] || by.added);
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
  $('filters').innerHTML = FILTERS.map(f => `
    <button class="chip" type="button" data-filter="${f.id}" aria-pressed="${state.filter === f.id}">
      ${esc(f.label)}<span class="chip__n">${counts[f.id]}</span>
    </button>`).join('');
}

function cardArt(track) {
  if (track.thumb) {
    return `<img src="${esc(track.thumb)}" alt="" loading="lazy" decoding="async"
                 onerror="this.remove()" />`;
  }
  return `<div class="card__art--blank" style="position:absolute;inset:0">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/></svg>
          </div>`;
}

function renderGrid() {
  const list = sortTracks(state.tracks.filter(t => matchesFilter(t) && matchesQuery(t)));
  state.queue = list;

  const grid = $('grid');
  const emptyBox = $('empty');

  if (!state.tracks.length) {
    grid.innerHTML = '';
    emptyBox.hidden = false;
    emptyBox.querySelector('h2').textContent = 'المكتبة فاضية';
    emptyBox.querySelector('p').textContent =
      'الصق رابط تلاوة من يوتيوب، أو رابط ملف صوتي مباشر، أو اختر ملفًا من جهازك. كل شيء يُحفظ في هذا المتصفح وحده — بلا حساب وبلا سيرفر.';
    $('emptyAdd').hidden = false;
    return;
  }

  if (!list.length) {
    grid.innerHTML = '';
    emptyBox.hidden = false;
    emptyBox.querySelector('h2').textContent = 'لا نتائج';
    emptyBox.querySelector('p').textContent = 'غيّر البحث أو التصفية.';
    $('emptyAdd').hidden = true;
    return;
  }

  emptyBox.hidden = true;
  grid.innerHTML = list.map(track => {
    const offline = isOffline(track);
    const trimmed = track.start > 0 || track.end > 0;
    const length = track.end > 0 ? track.end - (track.start || 0) : track.duration || 0;
    return `
    <article class="card" data-id="${esc(track.id)}" data-current="${state.currentId === track.id}">
      <div class="card__art">
        ${cardArt(track)}
        <button class="card__play" type="button" data-act="play" aria-label="تشغيل ${esc(track.title)}">
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5 19 12 7 19.5z"/></svg></span>
        </button>
        <div class="card__badges">
          <span class="badge">${esc(KIND_LABEL[track.kind])}</span>
          ${offline ? '<span class="badge badge--off">بلا إنترنت</span>' : ''}
          ${trimmed ? '<span class="badge">مقصوص</span>' : ''}
        </div>
        ${length ? `<span class="card__dur">${formatTime(length)}</span>` : ''}
      </div>
      <div class="card__body">
        <div class="card__title">${esc(track.title || 'بلا عنوان')}</div>
        ${trackSubtitle(track) ? `<div class="card__meta">${esc(trackSubtitle(track))}</div>` : ''}
        ${(track.tags || []).length ? `<div class="card__tags">${track.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="card__row">
          <button class="btn icon-btn" type="button" data-act="favorite" aria-pressed="${!!track.favorite}"
                  aria-label="مفضّلة" title="مفضّلة">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 20.5-7-6.6a4.3 4.3 0 0 1 6-6.1l1 .9 1-.9a4.3 4.3 0 0 1 6 6.1Z"/></svg>
          </button>
          ${track.kind === 'url' ? `
          <button class="btn icon-btn" type="button" data-act="offline" aria-pressed="${offline}"
                  aria-label="${offline ? 'احذف النسخة المحفوظة' : 'احفظ للاستماع بلا إنترنت'}"
                  title="${offline ? 'محفوظة بلا إنترنت' : 'احفظ للاستماع بلا إنترنت'}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
          </button>` : ''}
          ${track.kind === 'youtube' ? `
          <a class="btn icon-btn" href="${esc(youtubeWatch(track.src))}" target="_blank" rel="noopener noreferrer"
             aria-label="افتح في يوتيوب" title="افتح في يوتيوب">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
          </a>` : ''}
          <span class="grow"></span>
          <button class="btn icon-btn" type="button" data-act="edit" aria-label="تعديل" title="تعديل">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/></svg>
          </button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function renderAll() {
  renderFilters();
  renderGrid();
}

/* ── library events ─────────────────────────────────────────────────────── */

$('filters').addEventListener('click', event => {
  const chip = event.target.closest('[data-filter]');
  if (!chip) return;
  state.filter = chip.dataset.filter;
  renderAll();
});

$('search').addEventListener('input', event => {
  state.query = event.target.value;
  renderGrid();
});

$('sort').addEventListener('change', event => {
  state.sort = event.target.value;
  setPref('sort', state.sort);
  renderGrid();
});

$('grid').addEventListener('click', async event => {
  const card = event.target.closest('.card');
  if (!card) return;
  const track = state.tracks.find(t => t.id === card.dataset.id);
  if (!track) return;
  const action = event.target.closest('[data-act]');
  if (!action) return;

  switch (action.dataset.act) {
    case 'play':     playTrack(track); break;
    case 'edit':     openEdit(track); break;
    case 'favorite':
      track.favorite = !track.favorite;
      await putTrack(track);
      renderAll();
      break;
    case 'offline':
      if (isOffline(track)) await dropOfflineCopy(track);
      else await saveOfflineCopy(track, action);
      break;
  }
});

/* ── offline copies ─────────────────────────────────────────────────────── */

async function saveOfflineCopy(track, button) {
  button.disabled = true;
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
    renderAll();
    toast(`حُفظت للاستماع بلا إنترنت (${formatBytes(blob.size)})`);
  } catch (err) {
    // Streaming through <audio> is exempt from CORS; copying the bytes is not.
    toast('تعذّر حفظ نسخة — الخادم لا يسمح بالتحميل من المتصفح. التشغيل المباشر يعمل كالمعتاد.', 5200);
    console.warn('offline copy failed', err);
  } finally {
    button.disabled = false;
  }
}

async function dropOfflineCopy(track) {
  if (track.kind === 'file') { toast('هذا ملف من جهازك — حذفه يحذف التلاوة نفسها.'); return; }
  if (track.blobKey) await deleteBlob(track.blobKey);
  delete track.blobKey;
  delete track.bytes;
  await putTrack(track);
  renderAll();
  toast('حُذفت النسخة المحفوظة.');
}

/* ── playback ───────────────────────────────────────────────────────────── */

async function playTrack(track) {
  state.currentId = track.id;
  track.playCount = (track.playCount || 0) + 1;
  track.lastPlayedAt = Date.now();
  putTrack(track);

  $('player').hidden = false;
  $('nowTitle').textContent = track.title || 'بلا عنوان';
  $('nowSub').textContent = trackSubtitle(track) || KIND_LABEL[track.kind];
  const art = $('nowArt');
  // A thumbnail that will not load (offline, or pulled from YouTube) should
  // leave nothing behind rather than an empty grey tile.
  art.onerror = () => { art.hidden = true; };
  if (track.thumb) { art.hidden = false; art.src = track.thumb; }
  else { art.removeAttribute('src'); art.hidden = true; }

  const isYt = track.kind === 'youtube';
  $('videoBtn').hidden = !isYt;
  if (!isYt) showVideo(false);

  await player.load(track, { autoplay: true });
  renderGrid();
}

function currentIndex() {
  return state.queue.findIndex(t => t.id === state.currentId);
}

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
  const track = state.tracks.find(t => t.id === state.currentId);
  if (!track || !title) return;
  let changed = false;
  if (!track.title) { track.title = title; changed = true; }
  if (!track.reciter && author) { track.reciter = author; changed = true; }
  if (!changed) return;
  putTrack(track);
  $('nowTitle').textContent = track.title;
  $('nowSub').textContent = trackSubtitle(track) || KIND_LABEL[track.kind];
  renderGrid();
});

player.on('duration', () => {
  const track = state.tracks.find(t => t.id === state.currentId);
  const seconds = Math.round(player.rawDuration);
  if (!track || !seconds || track.duration === seconds) return;
  track.duration = seconds;
  putTrack(track);
  renderGrid();
});

/* ── player bar ─────────────────────────────────────────────────────────── */

let scrubbing = false;

const PLAY_ICON = '<path d="M7 4.5 19 12 7 19.5z"/>';
const PAUSE_ICON = '<path d="M8 5h3v14H8zM13 5h3v14h-3z"/>';

player.on('state', () => {
  const playing = player.playing;
  $('playIcon').innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
  $('playBtn').setAttribute('aria-label', playing ? 'إيقاف مؤقّت' : 'تشغيل');
  $('playBtn').dataset.busy = String(player.buffering);
  $('rateBtn').textContent = player.rate.toFixed(2).replace(/0$/, '').replace(/\.$/, '') + '×';
  $('rateBtn').dataset.on = String(player.rate !== 1);
});

player.on('time', () => {
  if (scrubbing) return;
  const duration = player.duration;
  $('curTime').textContent = formatTime(player.position);
  $('durTime').textContent = duration ? formatTime(duration) : '—:—';
  $('seek').value = duration ? String(Math.min(1000, Math.round(player.position / duration * 1000))) : '0';
});

$('playBtn').addEventListener('click', () => player.toggle());
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
});

$('shuffleBtn').addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  setPref('shuffle', state.shuffle);
  $('shuffleBtn').setAttribute('aria-pressed', String(state.shuffle));
  toast(state.shuffle ? 'ترتيب عشوائي.' : 'ترتيب المكتبة.');
});

$('closePlayer').addEventListener('click', () => {
  player.stop();
  state.currentId = null;
  $('player').hidden = true;
  showVideo(false);
  renderGrid();
});

function showVideo(on) {
  $('ytPark').classList.toggle('is-shown', on);
  $('ytPark').setAttribute('aria-hidden', String(!on));
  $('videoBtn').setAttribute('aria-pressed', String(on));
  $('videoBtn').title = on ? 'إخفاء الفيديو' : 'إظهار الفيديو';
}
$('videoBtn').addEventListener('click', () => showVideo(!$('ytPark').classList.contains('is-shown')));

bindMediaSession(player, { next: () => step(1), previous: () => step(-1) });

document.addEventListener('keydown', event => {
  const tag = (event.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || event.target.isContentEditable) return;
  if (document.querySelector('dialog[open]')) return;
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
  const status = state.sleep.mode === 'end' ? 'المؤقّت: يتوقّف بعد هذه التلاوة.'
    : state.sleep.mode === 'clock' ? `المؤقّت: يتوقّف عند ${new Date(state.sleep.at).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}.`
    : 'لا يوجد مؤقّت.';
  $('timerStatus').textContent = status;
  $('timerDialog').showModal();
});
$('timerDialog').addEventListener('click', event => {
  const chip = event.target.closest('[data-min]');
  if (!chip) return;
  const value = chip.dataset.min;
  setSleep(value === 'end' ? 'end' : Number(value));
  $('timerDialog').close();
});
$('timerOff').addEventListener('click', () => { clearSleep(); toast('أُوقف المؤقّت.'); $('timerDialog').close(); });

/* ── add / edit ─────────────────────────────────────────────────────────── */

let editing = null;
let detected = null;
let pendingFile = null;
let metaAbort = null;

function resetForm() {
  ['linkInput', 'titleInput', 'reciterInput', 'surahInput', 'tagsInput', 'startInput', 'endInput']
    .forEach(id => { $(id).value = ''; });
  $('fileInput').value = '';
  $('preview').hidden = true;
  $('formError').hidden = true;
  detected = null;
  pendingFile = null;
}

function fillSuggestions() {
  $('surahList').innerHTML = SURAHS.map(s => `<option value="${esc(s)}"></option>`).join('');
  const reciters = [...new Set(state.tracks.map(t => t.reciter).filter(Boolean))].sort();
  $('reciterList').innerHTML = reciters.map(r => `<option value="${esc(r)}"></option>`).join('');
  const tags = [...new Set(state.tracks.flatMap(t => t.tags || []))].sort();
  $('tagList').innerHTML = tags.map(t => `<option value="${esc(t)}"></option>`).join('');
}

function showPreview(kind, name, thumb) {
  $('preview').hidden = false;
  $('previewKind').textContent = kind;
  $('previewName').textContent = name;
  const img = $('previewArt');
  if (thumb) { img.src = thumb; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; }
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
  showPreview(KIND_LABEL[track.kind],
    track.kind === 'youtube' ? youtubeWatch(track.src) : track.kind === 'url' ? track.src : track.fileName || 'ملف صوتي',
    track.thumb);
  $('addDialog').showModal();
}

let detectTimer = null;
$('linkInput').addEventListener('input', () => {
  clearTimeout(detectTimer);
  detectTimer = setTimeout(detectLink, 320);
});

async function detectLink() {
  const value = $('linkInput').value.trim();
  $('formError').hidden = true;
  if (!value) { detected = null; $('preview').hidden = true; return; }

  detected = parseSource(value);
  if (!detected) {
    $('preview').hidden = true;
    $('formError').hidden = false;
    $('formError').textContent = 'هذا ليس رابطًا مفهومًا. الصق رابط يوتيوب أو رابط ملف صوتي.';
    return;
  }
  pendingFile = null;
  $('fileInput').value = '';

  if (detected.kind === 'youtube') {
    showPreview('يوتيوب', 'جارٍ جلب العنوان…', detected.thumb);
    if (detected.start && !$('startInput').value) $('startInput').value = formatTime(detected.start);
    if (metaAbort) metaAbort.abort();
    metaAbort = new AbortController();
    const meta = await fetchYoutubeMeta(detected.src, metaAbort.signal);
    if (detected.kind !== 'youtube') return;
    if (meta && meta.title) {
      showPreview('يوتيوب', meta.title, detected.thumb);
      if (!$('titleInput').value) $('titleInput').value = meta.title;
      if (!$('reciterInput').value && meta.author) $('reciterInput').value = meta.author;
    } else {
      // oEmbed is a convenience; the player reports the title on first play.
      showPreview('يوتيوب', 'سيُجلب العنوان عند أول تشغيل', detected.thumb);
    }
    return;
  }

  const name = decodeURIComponent((new URL(detected.src).pathname.split('/').pop() || ''));
  showPreview('رابط صوتي', name || detected.src, '');
  if (!$('titleInput').value && name) $('titleInput').value = titleFromFilename(name);
  if (!detected.looksLikeAudio) {
    $('formError').hidden = false;
    $('formError').textContent = 'هذا الرابط لا ينتهي بامتداد صوتي — قد لا يشتغل. جرّب حفظه وشغّله للتأكّد.';
  }
}

$('fileInput').addEventListener('change', async () => {
  const files = [...$('fileInput').files];
  if (!files.length) return;
  $('linkInput').value = '';
  detected = null;

  if (files.length === 1) {
    pendingFile = files[0];
    showPreview('من الجهاز', files[0].name, '');
    if (!$('titleInput').value) $('titleInput').value = titleFromFilename(files[0].name);
    return;
  }

  // More than one file is a bulk import; the form would only be in the way.
  let added = 0;
  for (const file of files) {
    const track = blankTrack('file');
    track.blobKey = 'b-' + track.id;
    track.fileName = file.name;
    track.src = track.blobKey;
    track.title = titleFromFilename(file.name);
    track.bytes = file.size;
    await putBlob(track.blobKey, file);
    await putTrack(track);
    state.tracks.push(track);
    added++;
  }
  $('addDialog').close();
  renderAll();
  toast(`أُضيفت ${added} تلاوة من جهازك.`);
});

function blankTrack(kind) {
  return {
    id: newId(), kind, src: '', title: '', reciter: '', surah: '', tags: [],
    start: 0, end: 0, duration: 0, thumb: '', favorite: false,
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

$('addForm').addEventListener('submit', async event => {
  event.preventDefault();
  const times = readTimes();
  if (times.error) { $('formError').hidden = false; $('formError').textContent = times.error; return; }

  const tags = $('tagsInput').value.split(/[،,]/).map(s => s.trim()).filter(Boolean);
  const common = {
    title: $('titleInput').value.trim(),
    reciter: $('reciterInput').value.trim(),
    surah: $('surahInput').value.trim(),
    tags, start: times.start, end: times.end
  };

  if (editing) {
    Object.assign(editing, common);
    await putTrack(editing);
    if (state.currentId === editing.id) {
      $('nowTitle').textContent = editing.title || 'بلا عنوان';
      $('nowSub').textContent = trackSubtitle(editing) || KIND_LABEL[editing.kind];
    }
    $('addDialog').close();
    renderAll();
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
  await putTrack(track);
  state.tracks.push(track);
  $('addDialog').close();
  renderAll();
  toast('أُضيفت التلاوة.');
});

$('deleteBtn').addEventListener('click', async () => {
  if (!editing) return;
  if (!confirm(`حذف «${editing.title || 'بلا عنوان'}» من المكتبة؟`)) return;
  if (editing.blobKey) await deleteBlob(editing.blobKey);
  await deleteTrack(editing.id);
  state.tracks = state.tracks.filter(t => t.id !== editing.id);
  if (state.currentId === editing.id) {
    player.stop();
    state.currentId = null;
    $('player').hidden = true;
  }
  $('addDialog').close();
  renderAll();
  toast('حُذفت التلاوة.');
});

$('addBtn').addEventListener('click', () => openAdd());
$('emptyAdd').addEventListener('click', () => openAdd());

document.addEventListener('click', event => {
  const close = event.target.closest('[data-close]');
  if (close) close.closest('dialog').close();
});

/* ── library dialog, backup, install ────────────────────────────────────── */

$('libraryBtn').addEventListener('click', async () => {
  $('statCount').textContent = state.tracks.length;
  $('statYt').textContent = state.tracks.filter(t => t.kind === 'youtube').length;
  $('statUrl').textContent = state.tracks.filter(t => t.kind === 'url').length;
  $('statFile').textContent = state.tracks.filter(t => t.kind === 'file').length;
  $('statOffline').textContent = state.tracks.filter(isOffline).length;
  $('statSize').textContent = formatBytes(await blobsSize().catch(() => 0));
  $('libDialog').showModal();
});

$('exportBtn').addEventListener('click', () => {
  // Device files have no copy outside this browser, so they cannot travel in a
  // JSON backup. Exporting them anyway would restore entries that never play.
  const portable = state.tracks.filter(t => t.kind !== 'file');
  const skipped = state.tracks.length - portable.length;
  const payload = {
    app: 'tilawat', version: 1, exportedAt: new Date().toISOString(),
    tracks: portable.map(({ blobKey, bytes, ...rest }) => rest)
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
      await putTrack(track);
      state.tracks.push(track);
      known.add(track.id);
      added++;
    }
    renderAll();
    toast(added ? `استُعيدت ${added} تلاوة.` : 'لا جديد في هذا الملف.');
  } catch {
    toast('ملف النسخة غير صالح.');
  }
});

let installEvent = null;
window.addEventListener('beforeinstallprompt', event => {
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
window.addEventListener('appinstalled', () => {
  $('installBtn').hidden = true;
  $('installNote').hidden = true;
  toast('تم التثبيت.');
});

/* ── start ──────────────────────────────────────────────────────────────── */

async function restorePrefs() {
  const [sort, repeat, shuffle, rate] = await Promise.all(
    ['sort', 'repeat', 'shuffle', 'rate'].map(k => getPref(k).catch(() => undefined)));
  if (sort) { state.sort = sort; $('sort').value = sort; }
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
  if (params.size) history.replaceState(null, '', location.pathname);
  if (!wantsAdd) return;
  const match = shared.match(/https?:\/\/\S+/);
  openAdd(match ? match[0] : '');
}

(async function start() {
  try {
    state.tracks = await allTracks();
  } catch (err) {
    console.error(err);
    toast('تعذّر فتح مكتبة المتصفح. جرّب خارج وضع التصفّح الخفي.', 6000);
    state.tracks = [];
  }
  await restorePrefs();
  renderAll();
  handleLaunchParams();

  // Ask the browser to keep the library when storage runs low.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then(ok => { if (!ok) navigator.storage.persist().catch(() => {}); });
  }

  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('sw', err));
  }
})();
