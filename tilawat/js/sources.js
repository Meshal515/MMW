/* ── sources ──────────────────────────────────────────────────────────────────
   Three ways a recitation gets in, and what we can learn about it without a
   server of our own:

   youtube  the official IFrame player streams it. There is no way to turn it
            into an MP3 in the browser — YouTube serves no CORS headers and the
            stream URLs are signed — so we do not pretend to; we play it.
   url      a direct link to an audio file. <audio> streams any origin; saving a
            copy for offline needs that origin to allow CORS.
   file     picked off this device, kept whole in IndexedDB. Works with no network at all. */

export const SURAHS = ['الفاتحة','البقرة','آل عمران','النساء','المائدة','الأنعام','الأعراف','الأنفال','التوبة','يونس','هود','يوسف','الرعد','إبراهيم','الحجر','النحل','الإسراء','الكهف','مريم','طه','الأنبياء','الحج','المؤمنون','النور','الفرقان','الشعراء','النمل','القصص','العنكبوت','الروم','لقمان','السجدة','الأحزاب','سبأ','فاطر','يس','الصافات','ص','الزمر','غافر','فصلت','الشورى','الزخرف','الدخان','الجاثية','الأحقاف','محمد','الفتح','الحجرات','ق','الذاريات','الطور','النجم','القمر','الرحمن','الواقعة','الحديد','المجادلة','الحشر','الممتحنة','الصف','الجمعة','المنافقون','التغابن','الطلاق','التحريم','الملك','القلم','الحاقة','المعارج','نوح','الجن','المزمل','المدثر','القيامة','الإنسان','المرسلات','النبأ','النازعات','عبس','التكوير','الانفطار','المطففين','الانشقاق','البروج','الطارق','الأعلى','الغاشية','الفجر','البلد','الشمس','الليل','الضحى','الشرح','التين','العلق','القدر','البينة','الزلزلة','العاديات','القارعة','التكاثر','العصر','الهمزة','الفيل','قريش','الماعون','الكوثر','الكافرون','النصر','المسد','الإخلاص','الفلق','الناس'];

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba|webm)(\?|#|$)/i;

/** A YouTube id is exactly 11 chars of the URL-safe alphabet. */
function youtubeId(url) {
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

/** `t=90`, `t=1m30s`, `start=90` — YouTube writes the resume point several ways. */
function youtubeStart(url) {
  const raw = url.searchParams.get('t') || url.searchParams.get('start');
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!m || !(m[1] || m[2] || m[3])) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

/**
 * What did the user paste? Returns null when it is not a usable link at all —
 * the caller shows the "this is not a link we can play" message.
 */
export function parseSource(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : 'https://' + text);
  } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const vid = youtubeId(url);
  if (vid) return { kind: 'youtube', src: vid, start: youtubeStart(url), thumb: youtubeThumb(vid) };

  return {
    kind: 'url',
    src: url.href,
    start: 0,
    thumb: '',
    // A direct file extension is a good sign, but plenty of valid audio links
    // have none. We allow it either way and let playback be the real test.
    looksLikeAudio: AUDIO_EXT.test(url.pathname) || AUDIO_EXT.test(url.href)
  };
}

export const youtubeThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const youtubeWatch = id => `https://www.youtube.com/watch?v=${id}`;

/* Biggest first. `maxresdefault` only exists for videos uploaded above 720p and
   `sddefault` is missing on older ones, so the list is tried in order and the
   first that actually decodes wins. `hqdefault` is the one that always exists. */
const THUMB_SIZES = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault'];

export function youtubeThumbCandidates(id) {
  return THUMB_SIZES.map(size => `https://i.ytimg.com/vi/${id}/${size}.jpg`);
}

/**
 * The sharpest thumbnail YouTube actually has for this video. A missing size
 * answers with a 120x90 grey placeholder rather than a 404, so the width is the
 * only reliable test.
 */
export function bestYoutubeThumb(id) {
  const candidates = youtubeThumbCandidates(id);
  const tryAt = index => new Promise(resolve => {
    if (index >= candidates.length) return resolve(youtubeThumb(id));
    const img = new Image();
    img.onload = () => (img.naturalWidth > 200 ? resolve(candidates[index]) : resolve(tryAt(index + 1)));
    img.onerror = () => resolve(tryAt(index + 1));
    img.src = candidates[index];
  });
  return tryAt(0);
}

/** A stable pair of hues per track, so a coverless recitation still has a face. */
export function coverHues(seed) {
  let hash = 0;
  const text = String(seed || 'تلاوة');
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return [hue, (hue + 38) % 360];
}

/**
 * Title and channel straight from YouTube's oEmbed endpoint, which is public and
 * CORS-open. If it ever stops answering, the player reports the title itself
 * once the video loads, so this is a convenience and never a dependency.
 */
export async function fetchYoutubeMeta(id, signal) {
  const endpoint = 'https://www.youtube.com/oembed?format=json&url=' +
    encodeURIComponent(youtubeWatch(id));
  try {
    const res = await fetch(endpoint, { signal, mode: 'cors' });
    if (!res.ok) return null;
    const data = await res.json();
    return { title: data.title || '', author: data.author_name || '' };
  } catch { return null; }
}

/** A filename is usually the only title a device file comes with. */
export function titleFromFilename(name) {
  return String(name || '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_+]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Accepts `93`, `1:33`, `1:02:03`. Returns null when it is not a time. */
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
