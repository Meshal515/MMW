/* ── model ────────────────────────────────────────────────────────────────────
   A recitation is the recording. A variant is one surviving copy of it.

   Five sites may each hold سورة الكهف — ياسر الدوسري — 1425. That is one
   recitation with five variants, not five recitations. Nothing is ever merged
   away: the resolver only decides which variant plays first. */

import { newId } from './store.js';
import { normalize } from './arabic.js';

export const COLLECTIONS = ['مصحف مرتل', 'مصحف مجود', 'تراويح', 'قيام', 'فروض', 'تسجيل نادر', 'أخرى'];

export function makeRecitation(fields = {}) {
  return {
    id: newId(),
    reciter: '', surah: '', surahNumber: 0,
    year: 0, collection: '', mosque: '', occasion: '', recordingDate: '',
    title: '', tags: [],
    cover: '', coverKey: '', gallery: [],
    favorite: false,
    preferredVariantId: '',
    start: 0, end: 0,
    order: Date.now(),
    addedAt: Date.now(), lastPlayedAt: 0, playCount: 0,
    variants: [],
    ...fields
  };
}

export function makeVariant(fields = {}) {
  return {
    id: 'v' + newId(),
    provider: 'generic',
    sourceUrl: '', audioUrl: '', videoUrl: '', embedUrl: '', videoId: '',
    title: '', thumbnail: '', channel: '',
    qualityLabel: '', bitrate: 0, codec: '', sampleRate: 0, channels: 0,
    duration: 0, fileSize: 0,
    original: false, restored: false, remastered: false, corrected: false,
    refined: false, complete: false, partial: false, rare: false,
    downloadable: true,
    localKey: '', localName: '', localSize: 0,
    archiveScore: 0, qualityScore: 0,
    provenance: {
      discoveredFrom: '', originalSource: '', archivedFrom: '',
      uploader: '', verified: false, confidence: 0.5
    },
    addedAt: Date.now(),
    ...fields
  };
}

/** Everything that identifies the recording, not the file. */
export function canonicalKey(rec) {
  return [
    normalize(rec.reciter),
    rec.surahNumber || normalize(rec.surah),
    rec.year || '',
    normalize(rec.collection),
    normalize(rec.mosque),
    normalize(rec.occasion)
  ].join('|');
}

/**
 * Are these the same recording?
 *
 * Reciter and surah must agree. Beyond that the rule is deliberately strict in
 * one direction: a 1425 تراويح must never absorb a modern مصحف of the same
 * surah just because both are clean. When one side has no year, only a close
 * duration match is allowed to bridge the gap.
 */
export function sameRecording(a, b) {
  if (normalize(a.reciter) !== normalize(b.reciter)) return false;
  const surahA = a.surahNumber || normalize(a.surah);
  const surahB = b.surahNumber || normalize(b.surah);
  if (!surahA || surahA !== surahB) return false;
  if (normalize(a.collection) !== normalize(b.collection)) return false;
  if (normalize(a.mosque) !== normalize(b.mosque)) return false;
  if (normalize(a.occasion) !== normalize(b.occasion)) return false;

  if (a.year && b.year) return a.year === b.year;

  // One side is undated. Only near-identical lengths justify joining them.
  const da = longestDuration(a);
  const db = longestDuration(b);
  if (!da || !db) return false;
  return Math.abs(da - db) / Math.max(da, db) <= 0.02;
}

export const longestDuration = rec =>
  (rec.variants || []).reduce((best, v) => Math.max(best, v.duration || 0), 0);

/** Adds a variant, unless the very same file is already on the recitation. */
export function addVariant(rec, variant) {
  const key = v => normalize(v.audioUrl || v.sourceUrl || v.videoUrl || v.localKey);
  if (rec.variants.some(v => key(v) && key(v) === key(variant))) return null;
  rec.variants.push(variant);
  return variant;
}

export const variantById = (rec, id) => (rec.variants || []).find(v => v.id === id) || null;

/** A display title, built from the parts when none was given. */
export function displayTitle(rec) {
  if (rec.title) return rec.title;
  const bits = [rec.surah ? `سورة ${rec.surah}` : '', rec.collection, rec.year ? `${rec.year}هـ` : ''];
  return bits.filter(Boolean).join(' — ') || 'تلاوة';
}
