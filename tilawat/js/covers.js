/* ── covers ───────────────────────────────────────────────────────────────────
   Every recitation gets a face, even with the network switched off.

   Order of preference: a picture the user chose (kept in IndexedDB), then a
   picture they pasted or pulled from the link, then one of the images shipped
   inside the app. The bundled ones are the reason a card never goes blank —
   they are part of the install, so they render on a plane. */

import { getBlob } from './store.js';

const COVER_DIR = './assets/covers/';
export const DEFAULT_COVER = COVER_DIR + 'default.jpg';

/* Reciters with artwork of their own. Matching is loose on purpose: the name
   may arrive from a YouTube channel, a typed field, or only the title. */
const RECITERS = [
  { file: 'dossari.jpg', match: /الدوسري|الدوسرى|دوسري|dossari|dossary|dosari|dosary/i }
];

/** The shipped image that best fits this recitation. Never returns empty. */
export function fallbackCover(track) {
  const haystack = [track.reciter, track.title, track.surah].filter(Boolean).join(' ');
  const hit = RECITERS.find(r => r.match.test(haystack));
  return hit ? COVER_DIR + hit.file : DEFAULT_COVER;
}

/* Object URLs for user-chosen covers, made once and reused; creating one per
   render would leak a handle on every keystroke in the search box. */
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

/** True when the track carries a picture of its own, rather than a fallback. */
export function hasOwnCover(track) {
  return !!(track.coverKey || track.cover || track.thumb);
}

/** What the <img> should point at right now. */
export function coverSrc(track) {
  return objectUrls.get(track.id) || track.cover || track.thumb || fallbackCover(track);
}

/**
 * Inline handler for a cover that fails to decode — offline, a dead YouTube
 * thumbnail, a link that rotted. Swaps in the bundled art and stops, so a
 * failing fallback can never loop.
 */
export function coverFallbackAttr(track) {
  const safe = fallbackCover(track).replace(/'/g, '&#39;');
  return `onerror="this.onerror=null;this.src='${safe}'"`;
}
