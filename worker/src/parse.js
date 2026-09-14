/* ── parse ────────────────────────────────────────────────────────────────────
   Reading a public page for what it says about itself.

   Everything here is a pure function over a URL or a chunk of HTML, so the
   rules that matter — which hosts may be fetched, what counts as audio, how a
   page describes itself — can be tested without a network or a Worker. */

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^198\.1[89]\./, /^192\.0\.0\./, /^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./,
  /^22[4-9]\./, /^2[3-5]\d\./
];

/**
 * Is this safe for the Worker to fetch on a caller's behalf?
 *
 * A public endpoint that will retrieve any URL is an open proxy and an SSRF
 * hole: the obvious targets are the loopback interface and the cloud metadata
 * address, so both are refused by name before anything else happens.
 */
export function checkTarget(raw) {
  let url;
  try { url = new URL(String(raw || '')); } catch { return { ok: false, reason: 'رابط غير صالح' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'بروتوكول غير مسموح' };

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')
      || host.endsWith('.local') || host === 'metadata.google.internal') {
    return { ok: false, reason: 'مضيف داخلي' };
  }
  if (/^\[?::1\]?$/.test(host) || /^\[?f[cd][0-9a-f]{2}:/i.test(host) || /^\[?fe80:/i.test(host)) {
    return { ok: false, reason: 'عنوان داخلي' };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && PRIVATE_V4.some(re => re.test(host))) {
    return { ok: false, reason: 'عنوان داخلي' };
  }
  if (url.port && !['', '80', '443', '8080', '8443'].includes(url.port)) {
    return { ok: false, reason: 'منفذ غير مسموح' };
  }
  return { ok: true, url };
}

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)(\?|#|$)/i;
export const looksAudio = url => AUDIO_EXT.test(String(url || ''));

const decode = text => String(text || '')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&')
  .trim();

function metaContent(html, patterns) {
  for (const attr of patterns) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["']${attr}["'][^>]*>`, 'i');
    const tag = (html.match(re) || [])[0];
    if (!tag) continue;
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (content && content[1].trim()) return decode(content[1]);
  }
  return '';
}

/** Every JSON-LD block on the page, flattened, bad ones skipped. */
export function jsonLd(html) {
  const out = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node && node['@graph']) out.push(...[].concat(node['@graph']));
        else if (node) out.push(node);
      }
    } catch { /* a malformed block is not a reason to abandon the page */ }
  }
  return out;
}

const absolute = (href, base) => { try { return new URL(href, base).href; } catch { return ''; } };

/** Audio the page links to directly: media elements first, then plain links. */
export function audioLinks(html, base) {
  const found = new Map();
  const push = (href, from) => {
    const url = absolute(decode(href), base);
    if (url && looksAudio(url) && !found.has(url)) found.set(url, { url, from });
  };
  for (const m of html.matchAll(/<audio[^>]+src\s*=\s*["']([^"']+)["']/gi)) push(m[1], 'audio');
  for (const m of html.matchAll(/<source[^>]+src\s*=\s*["']([^"']+)["']/gi)) push(m[1], 'source');
  for (const m of html.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["']/gi)) push(m[1], 'link');
  return [...found.values()];
}

/* Hijri years, and the phrases forum posts use to say what a copy is. Reading
   the thread is the point: the year and «من الشريط الأصلي» live in the prose,
   not in the file name. */
const YEAR = /\b(1[34]\d{2})\s*(?:هـ|ه\b|هجري)?/g;
const CLAIMS = [
  [/من\s*الشريط\s*الأصلي|الشريط\s*الاصلي/, 'original'],
  [/نسخ[ةه]\s*أصلي[ةه]|النسخ[ةه]\s*الأصلي[ةه]|أصلي[ةه]\b/, 'original'],
  [/منقح[ةه]|منقّح[ةه]/, 'refined'],
  [/مصحح[ةه]|مصحّح[ةه]/, 'corrected'],
  [/مرمم[ةه]|معالج[ةه]/, 'restored'],
  [/محسن[ةه]|محسّن[ةه]/, 'remastered'],
  [/أعلى\s*جود[ةه]|جود[ةه]\s*عالي[ةه]|high\s*quality|\bhq\b/i, 'high'],
  [/ناقص[ةه]|غير\s*كامل[ةه]/, 'partial'],
  [/كامل[ةه]\b|السور[ةه]\s*كامل[ةه]/, 'complete'],
  [/نادر[ةه]|نوادر/, 'rare'],
  [/من\s*البث|تسجيل\s*البث/, 'broadcast']
];

/** What the surrounding prose claims about this copy. */
export function readClaims(text) {
  const flat = String(text || '').replace(/\s+/g, ' ');
  const claims = {};
  for (const [re, flag] of CLAIMS) if (re.test(flat)) claims[flag] = true;
  const years = [...flat.matchAll(YEAR)].map(m => Number(m[1]));
  // Letters only: the Arabic comma and full stop live inside the same Unicode
  // block as the letters, so a range-based capture runs straight past
  // «خالد،» into the next clause.
  const mosque = (flat.match(/(?:مسجد|جامع)\s+[ء-ي]+(?:\s+[ء-ي]+){0,2}/) || [])[0] || '';
  return { claims, years: [...new Set(years)], mosque: mosque.trim() };
}

/**
 * Everything a page is willing to say about itself: the card metadata it
 * publishes for link previews, its structured data, and any audio it links to.
 */
export function describe(html, baseUrl) {
  const page = String(html).slice(0, 600000);
  const ld = jsonLd(page);
  const audioNode = ld.find(n => /AudioObject|MusicRecording|PodcastEpisode/i.test(n['@type'] || ''));
  const titleTag = decode((page.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const body = decode(page.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).slice(0, 12000);

  const contentUrl = audioNode && (audioNode.contentUrl || audioNode.url);
  const audio = audioLinks(page, baseUrl);
  if (contentUrl && looksAudio(contentUrl)) {
    const url = absolute(contentUrl, baseUrl);
    if (url && !audio.some(a => a.url === url)) audio.unshift({ url, from: 'json-ld' });
  }

  return {
    title: metaContent(page, ['og:title', 'twitter:title']) || (audioNode && audioNode.name) || titleTag,
    description: metaContent(page, ['og:description', 'twitter:description', 'description']),
    thumbnail: absolute(metaContent(page, ['og:image', 'twitter:image', 'twitter:image:src']), baseUrl),
    siteName: metaContent(page, ['og:site_name']),
    author: metaContent(page, ['author', 'article:author']) || (audioNode && audioNode.creator && audioNode.creator.name) || '',
    published: metaContent(page, ['article:published_time', 'og:updated_time']) || (audioNode && audioNode.uploadDate) || '',
    canonical: absolute((page.match(/<link[^>]+rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i) || [])[1] || '', baseUrl),
    duration: parseIsoDuration(audioNode && audioNode.duration),
    audio,
    ...readClaims(`${titleTag} ${body}`)
  };
}

/** ISO 8601 durations, which is how schema.org states a length. */
export function parseIsoDuration(value) {
  const match = String(value || '').match(/^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match || !(match[1] || match[2] || match[3])) return 0;
  return Math.round((+(match[1] || 0)) * 3600 + (+(match[2] || 0)) * 60 + (+(match[3] || 0)));
}

/** archive.org publishes a full file listing; no scraping required. */
export function fromArchiveMetadata(data) {
  if (!data || !data.files) return [];
  const base = data.server && data.dir ? `https://${data.server}${data.dir}/` : '';
  return data.files
    .filter(f => looksAudio(f.name))
    .map(f => ({
      url: base ? base + encodeURIComponent(f.name) : '',
      name: f.name,
      format: f.format || '',
      bitrate: Number(String(f.bitrate || '').replace(/\D/g, '')) || 0,
      duration: Math.round(Number(f.length) || 0) || 0,
      fileSize: Number(f.size) || 0
    }))
    .filter(f => f.url);
}
