/* ── resolve ──────────────────────────────────────────────────────────────────
   The client half of the catalogue Worker.

   A browser cannot read another site's page, so anything that is not already a
   direct file or a YouTube link has to be described by the Worker. The endpoint
   is configurable and may simply be absent: with no Worker the app keeps
   working exactly as before, and only this one convenience goes quiet. */

import { getPref, setPref } from '../store.js';
import { parseAudioUrl } from '../sources.js';

const looksAudio = url => {
  const parsed = parseAudioUrl(url);
  return !!(parsed && parsed.looksLikeAudio);
};

const PREF = 'catalogApi';
let endpoint;

export async function apiBase() {
  if (endpoint === undefined) endpoint = (await getPref(PREF).catch(() => '')) || '';
  return endpoint;
}

export async function setApiBase(url) {
  endpoint = String(url || '').trim().replace(/\/+$/, '');
  await setPref(PREF, endpoint);
  return endpoint;
}

export const hasApi = async () => !!(await apiBase());

async function ask(path, params) {
  const base = await apiBase();
  if (!base) return { ok: false, reason: 'no-api' };
  const url = `${base}${path}?${new URLSearchParams(params)}`;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, reason: 'رد غير مفهوم من الخادم' };
    return data;
  } catch {
    return { ok: false, reason: 'تعذّر الوصول إلى خادم الكتالوج' };
  }
}

/**
 * What lives at this link.
 *
 * Direct files and archive.org items are answered without troubling the
 * Worker where possible; everything else is a page someone has to read.
 */
export async function resolveUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return { ok: false, reason: 'رابط فارغ' };

  if (looksAudio(url)) {
    return { ok: true, kind: 'audio', audio: [{ url, from: 'direct' }], title: '', claims: {}, years: [] };
  }

  const archiveItem = url.match(/archive\.org\/(?:details|download)\/([\w.\-]+)/i);
  if (archiveItem) {
    const data = await ask('/api/archive', { id: archiveItem[1] });
    if (data.ok) {
      return {
        ok: true, kind: 'archive', title: data.title, author: data.creator,
        audio: (data.files || []).map(f => ({
          url: f.url, from: 'archive', bitrate: f.bitrate,
          duration: f.duration, fileSize: f.fileSize, label: f.format || f.name
        })),
        claims: {}, years: []
      };
    }
    if (data.reason !== 'no-api') return data;
  }

  return ask('/api/resolve', { url });
}

/** Where a dead page went, so a rotted link stays evidence rather than a loss. */
export const findSnapshot = url => ask('/api/wayback', { url });

/** Title and thumbnail for the providers that publish an oEmbed document. */
export const fetchOembed = url => ask('/api/oembed', { url });

/**
 * Turns a resolver answer into variant fields, best copy first.
 * Whatever the page claimed about a copy travels with it.
 */
export function toVariants(result, pageUrl) {
  if (!result || !result.ok) return [];
  const claims = result.claims || {};
  const shared = {
    thumbnail: result.thumbnail || '',
    original: !!claims.original, refined: !!claims.refined,
    corrected: !!claims.corrected, restored: !!claims.restored,
    remastered: !!claims.remastered, partial: !!claims.partial,
    rare: !!claims.rare,
    provenance: {
      discoveredFrom: result.siteName || '', originalSource: pageUrl,
      uploader: result.author || '', verified: false,
      confidence: result.kind === 'archive' ? 0.85 : 0.6
    }
  };

  const audio = (result.audio || []).map(file => ({
    ...shared,
    provider: result.kind === 'archive' ? 'archive' : 'generic',
    sourceUrl: pageUrl || file.url,
    audioUrl: file.url,
    title: file.label || result.title || '',
    qualityLabel: file.label || '',
    bitrate: file.bitrate || 0,
    duration: file.duration || result.duration || 0,
    fileSize: file.fileSize || 0
  }));

  // A page with no audio is still worth keeping: it is where the recording was
  // documented, even when the file itself has to come from somewhere else.
  if (!audio.length && pageUrl) {
    audio.push({ ...shared, provider: 'generic', sourceUrl: pageUrl, title: result.title || '',
                 duration: result.duration || 0, downloadable: false });
  }
  return audio;
}
