/* ── covers ───────────────────────────────────────────────────────────────────
   Every catalogue entry keeps one visual identity even when its playback source
   changes. Preference: user image → imported/link artwork → bundled fallback. */

import { getBlob } from './store.js';

const COVER_DIR = './assets/covers/';
export const DEFAULT_COVER = COVER_DIR + 'default.jpg';

const RECITERS = [
  { file: 'dossari.jpg', match: /الدوسري|الدوسرى|دوسري|dossari|dossary|dosari|dosary/i }
];

export function fallbackCover(track) {
  const haystack = [track.reciter, track.title, track.surah, track.year, track.collection].filter(Boolean).join(' ');
  const hit = RECITERS.find(r => r.match.test(haystack));
  return hit ? COVER_DIR + hit.file : DEFAULT_COVER;
}

const objectUrls = new Map();

export async function loadCoverUrls(tracks) {
  await Promise.all(tracks.filter(t => t.coverKey && !objectUrls.has(t.id)).map(async track => {
    const blob = await getBlob(track.coverKey).catch(() => null);
    if (blob) objectUrls.set(track.id, URL.createObjectURL(blob));
  }));
}

export async function refreshCoverUrl(track) {
  releaseCoverUrl(track.id);
  if (!track.coverKey) return;
  const blob = await getBlob(track.coverKey).catch(() => null);
  if (blob) objectUrls.set(track.id, URL.createObjectURL(blob));
}

export function releaseCoverUrl(id) {
  const url = objectUrls.get(id);
  if (url) { URL.revokeObjectURL(url); objectUrls.delete(id); }
}

export function hasOwnCover(track) {
  return !!(track.coverKey || track.cover || track.thumb);
}

export function coverSrc(track) {
  return objectUrls.get(track.id) || track.cover || track.thumb || fallbackCover(track);
}

export function coverFallbackAttr(track) {
  const safe = fallbackCover(track).replace(/'/g, '&#39;');
  return `onerror="this.onerror=null;this.src='${safe}'"`;
}
