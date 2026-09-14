/* ── sources ────────────────────────────────────────────────────────────────
   Source parsing and metadata helpers. A recitation is one catalogue entity
   that can carry several playback sources at the same time:

   localAudioKey  a file/cached copy stored in IndexedDB
   audioUrl       a direct audio stream
   youtubeId      the original YouTube reference / final fallback

   The UI never treats those as three different tracks. */

export const SURAHS = ['الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس','هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس'];

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba|webm)(\?|#|$)/i;

export function youtubeId(input) {
  const text = String(input || '').trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text); }
  catch { return null; }
  const host = url.hostname.replace(/^www\.|^m\./, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export function youtubeStart(input) {
  let url;
  try { url = new URL(/^https?:\/\//i.test(String(input)) ? input : 'https://' + input); }
  catch { return 0; }
  const raw = url.searchParams.get('t') || url.searchParams.get('start');
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m || !(m[1] || m[2] || m[3])) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

export function parseYoutube(input) {
  const id = youtubeId(input);
  if (!id) return null;
  return { id, url: youtubeWatch(id), start: youtubeStart(input), thumb: youtubeThumb(id) };
}

export function parseAudioUrl(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text); }
  catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  return { url: url.href, looksLikeAudio: AUDIO_EXT.test(url.pathname) || AUDIO_EXT.test(url.href) };
}

export const youtubeThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const youtubeWatch = id => `https://www.youtube.com/watch?v=${id}`;
const THUMB_SIZES = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];
export const youtubeThumbCandidates = id => THUMB_SIZES.map(size => `https://i.ytimg.com/vi/${id}/${size}.jpg`);

export function bestYoutubeThumb(id) {
  const candidates = youtubeThumbCandidates(id);
  const tryAt = index => new Promise(resolve => {
    if (index >= candidates.length) return resolve(youtubeThumb(id));
    const img = new Image();
    img.onload = () => img.naturalWidth > 200 ? resolve(candidates[index]) : resolve(tryAt(index + 1));
    img.onerror = () => resolve(tryAt(index + 1));
    img.src = candidates[index];
  });
  return tryAt(0);
}

export async function fetchYoutubeMeta(id, signal) {
  const endpoint = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(youtubeWatch(id));
  try {
    const res = await fetch(endpoint, { signal, mode: 'cors' });
    if (!res.ok) return null;
    const data = await res.json();
    return { title: data.title || '', author: data.author_name || '', thumbnail: data.thumbnail_url || '' };
  } catch { return null; }
}

export function titleFromFilename(name) {
  return String(name || '').replace(/\.[a-z0-9]{1,6}$/i, '').replace(/[_+]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function normalizeArabic(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function queryTokens(value) {
  return normalizeArabic(value).split(/\s+/).filter(Boolean);
}

export function matchesTokens(track, query) {
  const tokens = Array.isArray(query) ? query : queryTokens(query);
  if (!tokens.length) return true;
  const hay = normalizeArabic([
    track.title, track.reciter, track.surah, track.year, track.collection,
    ...(track.tags || []), ...(track.playlists || [])
  ].filter(Boolean).join(' '));
  return tokens.every(token => hay.includes(token));
}

export function parseTime(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(':');
  if (parts.length > 3 || !parts.every(p => /^\d+(\.\d+)?$/.test(p.trim()))) return null;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatBytes(bytes) {
  if (!bytes) return '0 ب';
  const units = ['ب', 'ك.ب', 'م.ب', 'غ.ب'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function sourceSummary(track) {
  const list = [];
  if (track.localAudioKey) list.push('محلي');
  if (track.audioUrl) list.push('صوت مباشر');
  if (track.youtubeId) list.push('يوتيوب');
  return list.join(' · ') || 'بلا مصدر';
}

export function backgroundReady(track) {
  return !!(track.localAudioKey || track.audioUrl);
}

export function normalizeTrack(raw = {}) {
  const track = {
    id: raw.id || '',
    title: raw.title || '', reciter: raw.reciter || '', surah: raw.surah || '',
    year: raw.year || '', collection: raw.collection || '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    playlists: Array.isArray(raw.playlists) ? raw.playlists : [],
    rare: !!raw.rare,
    youtubeId: raw.youtubeId || '', youtubeUrl: raw.youtubeUrl || '',
    audioUrl: raw.audioUrl || '', localAudioKey: raw.localAudioKey || '', localOrigin: raw.localOrigin || '',
    thumb: raw.thumb || '', cover: raw.cover || '', coverKey: raw.coverKey || '',
    favorite: !!raw.favorite,
    start: Number(raw.start || 0), end: Number(raw.end || 0), duration: Number(raw.duration || 0),
    addedAt: Number(raw.addedAt || Date.now()), lastPlayedAt: Number(raw.lastPlayedAt || 0),
    lastPosition: Number(raw.lastPosition || 0), playCount: Number(raw.playCount || 0),
    order: Number.isFinite(raw.order) ? raw.order : Date.now(),
    bytes: Number(raw.bytes || 0),
    // Every copy ever found of this recording, plus which one the listener
    // pinned. Rebuilt from the three fields above only when absent, so a
    // reload must carry them through here or the extra copies are lost.
    variants: Array.isArray(raw.variants) ? raw.variants : [],
    preferredVariantId: raw.preferredVariantId || '',
    defaultVariantId: raw.defaultVariantId || ''
  };

  // Legacy v1 migration: kind/src/blobKey represented mutually-exclusive sources.
  if (!track.youtubeId && raw.kind === 'youtube' && raw.src) {
    track.youtubeId = raw.src;
    track.youtubeUrl = youtubeWatch(raw.src);
  }
  if (!track.audioUrl && raw.kind === 'url' && raw.src) track.audioUrl = raw.src;
  if (!track.localAudioKey && raw.kind === 'file') {
    track.localAudioKey = raw.blobKey || raw.src || '';
    track.localOrigin = 'device';
  }
  if (!track.localAudioKey && raw.blobKey) {
    track.localAudioKey = raw.blobKey;
    track.localOrigin = raw.kind === 'file' ? 'device' : 'download';
  }
  if (!track.thumb && track.youtubeId) track.thumb = youtubeThumb(track.youtubeId);
  if (!track.youtubeUrl && track.youtubeId) track.youtubeUrl = youtubeWatch(track.youtubeId);
  return track;
}
