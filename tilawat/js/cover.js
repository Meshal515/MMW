/* ── cover ────────────────────────────────────────────────────────────────────
   Covers drawn, not fetched.

   Every surah gets its own artwork built from its name and number, as inline
   SVG so it reads the page's CSS variables — one drawing that turns itself over
   with the theme instead of two exported images. The ornament is geometric and
   quiet: an eight-point star on a faint grid, the way a مصحف binding is tooled,
   never a busy filigree. The reciter's name is deliberately absent; it belongs
   under the cover, not inside it. */

import { normalize } from './arabic.js';

const MOTIFS = ['star', 'rub', 'arcs', 'lattice'];

function seedOf(text) {
  let hash = 2166136261;
  for (const ch of String(text || 'تلاوة')) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

const polar = (cx, cy, r, deg) => {
  const rad = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
};

/** An n-pointed star as one closed path, alternating outer and inner radii. */
function starPath(cx, cy, outer, inner, points, rotate) {
  const steps = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 ? inner : outer;
    const [x, y] = polar(cx, cy, radius, rotate + (i * 180) / points);
    steps.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return steps.join(' ') + ' Z';
}

function motifFor(kind, seed) {
  const turn = seed % 45;
  switch (kind) {
    case 'rub':
      return `
        <path d="${starPath(200, 196, 118, 118, 4, turn)}" />
        <path d="${starPath(200, 196, 118, 118, 4, turn + 45)}" />
        <circle cx="200" cy="196" r="52" />`;
    case 'arcs':
      return [0, 1, 2, 3].map(i => `
        <circle cx="200" cy="196" r="${56 + i * 26}" />`).join('') + `
        <path d="${starPath(200, 196, 122, 50, 6, turn)}" />`;
    case 'lattice':
      return [0, 1, 2, 3, 4, 5].map(i => `
        <path d="${starPath(200, 196, 124, 124, 4, turn + i * 15)}" />`).join('');
    default:
      return `
        <path d="${starPath(200, 196, 126, 54, 8, turn)}" />
        <path d="${starPath(200, 196, 92, 40, 8, turn + 22.5)}" />
        <circle cx="200" cy="196" r="34" />`;
  }
}

/**
 * The artwork for a recitation, as an SVG string to drop straight into the DOM.
 * Colours come from `--cv-*` on the page, so the same node serves both themes.
 */
export function coverSVG(rec, { label = true } = {}) {
  const name = rec.surah || rec.title || 'تلاوة';
  const number = rec.surahNumber || 0;
  const seed = seedOf(normalize(name) + number);
  const motif = MOTIFS[seed % MOTIFS.length];
  const long = String(name).length > 9;

  return `<svg class="cv" viewBox="0 0 400 400" role="img" aria-label="${escapeXml(name)}" preserveAspectRatio="xMidYMid slice">
  <rect width="400" height="400" fill="var(--cv-bg)"/>
  <rect width="400" height="400" fill="url(#cv-fade-${seed % 997})"/>
  <defs>
    <linearGradient id="cv-fade-${seed % 997}" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="var(--cv-tint)" stop-opacity="0.9"/>
      <stop offset="1" stop-color="var(--cv-tint)" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g fill="none" stroke="var(--cv-line)" stroke-width="1" opacity="0.5">${motifFor(motif, seed)}</g>
  <rect x="26" y="26" width="348" height="348" fill="none" stroke="var(--cv-line)" stroke-width="1" opacity="0.6" rx="10"/>
  ${number ? `<text x="200" y="104" text-anchor="middle" fill="var(--cv-accent)" font-size="21"
       font-family="var(--ui)" font-weight="700" letter-spacing="2">${number}</text>` : ''}
  <text x="200" y="${long ? 218 : 222}" text-anchor="middle" fill="var(--cv-ink)"
        font-size="${long ? 46 : 58}" font-family="var(--ui)" font-weight="700">${escapeXml(name)}</text>
  ${label && rec.year ? `<text x="200" y="312" text-anchor="middle" fill="var(--cv-accent)" font-size="19"
       font-family="var(--ui)" font-weight="600">${rec.year}هـ</text>` : ''}
</svg>`;
}

const escapeXml = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

/**
 * Which picture a recitation should wear, most deliberate first. A thumbnail
 * scraped off a source never displaces a picture someone chose by hand.
 */
export function resolveCover(rec, { objectUrls, reciterPhoto } = {}) {
  if (objectUrls && rec.coverKey && objectUrls.get(rec.id)) {
    return { kind: 'image', src: objectUrls.get(rec.id) };
  }
  if (rec.cover) return { kind: 'image', src: rec.cover };
  if (reciterPhoto) return { kind: 'image', src: reciterPhoto };
  const thumbed = (rec.variants || []).find(v => v.thumbnail);
  if (thumbed) return { kind: 'image', src: thumbed.thumbnail };
  return { kind: 'svg', svg: coverSVG(rec) };
}
