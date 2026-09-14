/* ── variants ─────────────────────────────────────────────────────────────────
   Many copies, one recording.

   The catalogue entry carries three playback fields — `localAudioKey`,
   `audioUrl`, `youtubeId` — and the player reads only those. This module makes
   `variants[]` the truth underneath them: every copy ever found is kept in the
   array, the resolver picks one, and the winner is written back into those three
   fields. The player needs no knowledge of any of it, and nothing is ever
   discarded to make room. */

import { makeVariant } from './model.js';
import { pickDefault, rescore, badgesFor, qualityScore } from './quality.js';
import { normalize } from './arabic.js';
import { youtubeThumb, youtubeWatch } from './sources.js';

export { badgesFor };

/** Derives the array from the legacy three fields the first time it is needed. */
export function ensureVariants(track) {
  if (Array.isArray(track.variants) && track.variants.length) return rescore(track);
  const variants = [];

  // A downloaded copy is not a separate find — it is the same file, already here.
  const downloaded = track.localAudioKey && track.localOrigin !== 'device';
  if (track.audioUrl || downloaded) {
    variants.push(makeVariant({
      provider: providerFromUrl(track.audioUrl),
      sourceUrl: track.audioUrl, audioUrl: track.audioUrl,
      localKey: downloaded ? track.localAudioKey : '',
      localSize: downloaded ? track.bytes : 0,
      title: 'صوت مباشر', duration: track.duration,
      provenance: { originalSource: track.audioUrl, confidence: 0.8 }
    }));
  }
  if (track.localAudioKey && track.localOrigin === 'device') {
    variants.push(makeVariant({
      provider: 'local', localKey: track.localAudioKey, localSize: track.bytes,
      title: 'ملف من جهازك', duration: track.duration, downloadable: false,
      provenance: { originalSource: 'device', verified: true, confidence: 1 }
    }));
  }
  if (track.youtubeId) {
    variants.push(makeVariant({
      provider: 'youtube', videoId: track.youtubeId,
      sourceUrl: track.youtubeUrl || youtubeWatch(track.youtubeId),
      embedUrl: `https://www.youtube-nocookie.com/embed/${track.youtubeId}`,
      thumbnail: track.thumb || youtubeThumb(track.youtubeId),
      title: 'يوتيوب', duration: track.duration, downloadable: false,
      provenance: { originalSource: track.youtubeUrl || youtubeWatch(track.youtubeId), confidence: 0.7 }
    }));
  }

  track.variants = variants;
  return rescore(track);
}

function providerFromUrl(url) {
  const host = (String(url || '').match(/^https?:\/\/([^/]+)/i) || [])[1] || '';
  if (/mp3quran/i.test(host)) return 'mp3quran';
  if (/quranicaudio/i.test(host)) return 'quranicaudio';
  if (/islamway/i.test(host)) return 'islamway';
  if (/archive\.org/i.test(host)) return 'archive';
  if (/mazameer/i.test(host)) return 'mazameer';
  if (/assabile/i.test(host)) return 'assabile';
  if (/tvquran/i.test(host)) return 'tvquran';
  if (/everyayah/i.test(host)) return 'everyayah';
  if (/soundcloud/i.test(host)) return 'soundcloud';
  return 'generic';
}

/**
 * Writes the resolver's pick into the three fields the player reads.
 *
 * The YouTube identity is never cleared: it is where the title and the artwork
 * came from, and the spec is explicit that the original reference survives even
 * when a cleaner copy takes over playback.
 */
export function syncPrimary(track) {
  ensureVariants(track);
  const winner = pickDefault(track);
  track.defaultVariantId = winner ? winner.id : '';
  if (!winner) return track;

  track.localAudioKey = winner.localKey || '';
  track.localOrigin = winner.localKey ? (winner.provider === 'local' ? 'device' : 'download') : '';
  track.audioUrl = winner.audioUrl || '';
  if (winner.duration && !track.duration) track.duration = winner.duration;

  const youtube = track.variants.find(v => v.videoId);
  if (youtube) {
    track.youtubeId = youtube.videoId;
    track.youtubeUrl = youtube.sourceUrl || youtubeWatch(youtube.videoId);
    if (!track.thumb) track.thumb = youtube.thumbnail;
  }
  return track;
}

/** Adds a copy. Returns null when this exact file is already on the entry. */
export function addVariant(track, fields) {
  ensureVariants(track);
  const variant = makeVariant(fields);
  variant.qualityScore = qualityScore(variant);
  const key = v => normalize(v.localKey || v.audioUrl || v.sourceUrl || v.videoId);
  if (key(variant) && track.variants.some(v => key(v) === key(variant))) return null;
  track.variants.push(variant);
  syncPrimary(track);
  return variant;
}

export function removeVariant(track, variantId) {
  ensureVariants(track);
  track.variants = track.variants.filter(v => v.id !== variantId);
  if (track.preferredVariantId === variantId) track.preferredVariantId = '';
  syncPrimary(track);
  return track;
}

/** The listener's choice outranks the resolver, always. */
export function setPreferred(track, variantId) {
  ensureVariants(track);
  track.preferredVariantId = track.preferredVariantId === variantId ? '' : variantId;
  syncPrimary(track);
  return track;
}

/** Forces one variant to play now, without making it the standing choice. */
export function useVariant(track, variantId) {
  ensureVariants(track);
  const variant = track.variants.find(v => v.id === variantId);
  if (!variant) return track;
  track.localAudioKey = variant.localKey || '';
  track.localOrigin = variant.localKey ? (variant.provider === 'local' ? 'device' : 'download') : '';
  track.audioUrl = variant.audioUrl || '';
  track.defaultVariantId = variant.id;
  return track;
}

export const variantCount = track => (ensureVariants(track).variants || []).length;

/**
 * What to show under the player, in the order the listener cares about: the
 * same recording elsewhere first, then the same reciter and surah, then the
 * same year, and only then anything merely similar.
 */
export function suggestFor(track, all, limit = 18) {
  const others = all.filter(t => t.id !== track.id);
  const seen = new Set();
  const out = [];
  const take = (list, reason) => {
    for (const item of list) {
      if (seen.has(item.id) || out.length >= limit) continue;
      seen.add(item.id);
      out.push({ track: item, reason });
    }
  };
  const same = (a, b, field) => a[field] && normalize(a[field]) === normalize(b[field]);

  take(others.filter(t => same(t, track, 'reciter') && same(t, track, 'surah')), 'نفس القارئ والسورة');
  take(others.filter(t => same(t, track, 'reciter') && t.year && t.year === track.year), 'من نفس السنة');
  take(others.filter(t => same(t, track, 'reciter') && same(t, track, 'collection')), 'من نفس المجموعة');
  take(others.filter(t => same(t, track, 'reciter')), 'من نفس القارئ');
  take(others.filter(t => same(t, track, 'surah')), 'نفس السورة، قرّاء آخرون');
  take(others.filter(t => t.rare), 'من النوادر');
  return out;
}
