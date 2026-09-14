/* ── quality ──────────────────────────────────────────────────────────────────
   Which copy plays first — and nothing more than that.

   The resolver never removes a variant. A 64kbps rip from a dead forum may be
   the only one taken from the original tape, so it keeps its place in the list
   even when a cleaner copy wins the default. */

import { qualityFlags, normalize } from './arabic.js';

/* Sites differ in how much you can trust what they publish. This is a starting
   nudge, not a verdict — a great file on a plain host still beats a poor one on
   a good host once the technical checks run. */
const PROVIDER_TRUST = {
  local: 10, mp3quran: 6, quranicaudio: 6, islamway: 5, assabile: 5,
  tvquran: 4, everyayah: 5, archive: 4, mazameer: 4, reciter_site: 7,
  soundcloud: 3, youtube: 1, tiktok: 0, instagram: 0, telegram: 2, generic: 2
};

const BITRATE_POINTS = [[320, 22], [256, 19], [192, 15], [160, 12], [128, 9], [96, 5], [64, 2]];
const CODEC_POINTS = { flac: 24, wav: 22, alac: 22, opus: 16, aac: 14, m4a: 14, mp3: 10, ogg: 12 };

/**
 * 0–100 for how good this copy is likely to be.
 *
 * Words on the page are evidence, not proof, so they are worth less than the
 * measurable facts underneath them; and a file being larger is only a point in
 * its favour once its length is known, because an hour at 64kbps outweighs ten
 * minutes at 320.
 */
export function qualityScore(variant) {
  const text = [variant.qualityLabel, variant.title, variant.sourceUrl].filter(Boolean).join(' ');
  const flags = qualityFlags(text);
  let score = 30;

  score += PROVIDER_TRUST[variant.provider] ?? 2;

  if (variant.original || flags.original) score += 14;
  if (variant.restored || flags.restored) score += 10;
  if (variant.remastered || flags.remastered) score += 9;
  if (variant.corrected || flags.corrected) score += 9;
  if (variant.refined || flags.refined) score += 8;
  if (flags.high) score += 7;
  if (variant.complete || flags.complete) score += 4;
  if (variant.partial || flags.partial) score -= 30;

  const bitrate = variant.bitrate || inferBitrate(variant);
  if (bitrate) score += (BITRATE_POINTS.find(([kbps]) => bitrate >= kbps) || [0, 0])[1];
  const codec = normalize(variant.codec || extension(variant.audioUrl));
  if (codec && CODEC_POINTS[codec]) score += CODEC_POINTS[codec];
  if (variant.sampleRate >= 44100) score += 4;
  if (variant.channels >= 2) score += 2;

  // No audio at all is not a quality rating — it is a different kind of copy.
  if (!variant.audioUrl && !variant.localKey) score -= 26;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function extension(url) {
  const match = String(url || '').match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  return match ? match[1].toLowerCase() : '';
}

/** kbps implied by size and length, when the source did not say. */
function inferBitrate(variant) {
  if (!variant.fileSize || !variant.duration) return 0;
  return Math.round((variant.fileSize * 8) / variant.duration / 1000);
}

export const isPlayableOffline = v => !!v.localKey;
export const hasDirectAudio = v => !!(v.localKey || v.audioUrl);

/**
 * The variant playback should start from.
 *
 * Order is fixed by what the listener gets, not by what scores best: a file on
 * the device, then a copy they chose themselves, then the best direct audio,
 * and an embed only when there is no audio at all — because an embed cannot
 * survive a locked screen.
 */
export function pickDefault(rec) {
  const variants = rec.variants || [];
  if (!variants.length) return null;

  const local = variants.filter(isPlayableOffline);
  if (local.length) return best(local);

  if (rec.preferredVariantId) {
    const chosen = variants.find(v => v.id === rec.preferredVariantId);
    if (chosen) return chosen;
  }

  const direct = variants.filter(v => v.audioUrl);
  if (direct.length) return best(direct);

  return best(variants);
}

const best = list => list.slice().sort((a, b) => scoreOf(b) - scoreOf(a))[0];
const scoreOf = v => (v.qualityScore || qualityScore(v));

/** Refreshes every cached score; call after a variant changes. */
export function rescore(rec) {
  for (const variant of rec.variants || []) variant.qualityScore = qualityScore(variant);
  return rec;
}

/** Short badges the variant card shows. */
export function badgesFor(variant) {
  const flags = qualityFlags([variant.qualityLabel, variant.title].filter(Boolean).join(' '));
  const out = [];
  if (variant.localKey) out.push({ text: 'على جهازك', tone: 'good' });
  if (variant.original || flags.original) out.push({ text: 'أصلية', tone: 'gold' });
  if (variant.restored || flags.restored) out.push({ text: 'مرمّمة', tone: 'gold' });
  if (variant.remastered || flags.remastered) out.push({ text: 'محسّنة', tone: 'gold' });
  if (variant.corrected || flags.corrected) out.push({ text: 'مصحّحة', tone: 'gold' });
  if (variant.refined || flags.refined) out.push({ text: 'منقّحة', tone: 'gold' });
  if (variant.rare) out.push({ text: 'نادرة', tone: 'rare' });
  if (variant.partial || flags.partial) out.push({ text: 'ناقصة', tone: 'warn' });
  if (!variant.audioUrl && !variant.localKey) out.push({ text: 'فيديو فقط', tone: 'muted' });
  return out;
}
