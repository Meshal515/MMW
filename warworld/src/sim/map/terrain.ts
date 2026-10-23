// Terrain generation for the three map families: the real Earth, seeded random worlds and fixed presets.
import { fbm, Rng, valueNoise } from '../rng';
import { EARTH_H, EARTH_LAT_BOTTOM, EARTH_LAT_TOP, EARTH_RLE, EARTH_W } from '../data/earth';

export const enum T { Deep = 0, Shallow = 1, Plains = 2, Forest = 3, Hills = 4, Mountain = 5, Desert = 6, Snow = 7 }
export const TERRAIN_NAMES = ['محيط', 'مياه ضحلة', 'سهول', 'غابات', 'تلال', 'جبال', 'صحراء', 'ثلوج'];
export const isLand = (t: number) => t >= 2;

export const MAP_W = 400;
export const MAP_H = 200;

export type MapKind = 'earth' | 'random' | 'preset';
export const PRESETS = [
  { id: 'pangaea', name: 'القارة العظمى' },
  { id: 'archipelago', name: 'الأرخبيل' },
  { id: 'twin', name: 'القارتان' },
  { id: 'straits', name: 'المضائق' },
  { id: 'ring', name: 'الحلقة' },
  { id: 'quad', name: 'القارات الأربع' },
  { id: 'crescent', name: 'الهلال' },
] as const;
export type PresetId = (typeof PRESETS)[number]['id'];

export interface TerrainResult { w: number; h: number; terrain: Uint8Array }

function decodeEarth(): Uint8Array {
  const out = new Uint8Array(EARTH_W * EARTH_H);
  let i = 0, v = 0;
  for (const r of EARTH_RLE.split(',')) {
    const n = parseInt(r, 36);
    if (v) out.fill(1, i, i + n);
    i += n; v ^= 1;
  }
  return out;
}

const lonOf = (x: number) => -180 + (x + 0.5) * 360 / EARTH_W;
const latOf = (y: number) => EARTH_LAT_TOP - (y + 0.5) * (EARTH_LAT_TOP - EARTH_LAT_BOTTOM) / EARTH_H;

// Major mountain chains as [lon, lat] polylines with a half-width in degrees.
const RANGES: { pts: [number, number][]; w: number }[] = [
  { pts: [[70, 37], [76, 35], [82, 31], [88, 28], [95, 28], [98, 26]], w: 2.4 }, // Himalaya
  { pts: [[78, 38], [88, 36], [98, 34]], w: 2.2 }, // Kunlun / Tibet
  { pts: [[-78, 8], [-77, 0], [-76, -10], [-71, -18], [-69, -28], [-70, -38], [-72, -48]], w: 1.8 }, // Andes
  { pts: [[-150, 63], [-135, 60], [-124, 53], [-116, 46], [-110, 40], [-106, 34], [-104, 26], [-100, 20]], w: 2.2 }, // Rockies / Sierra Madre
  { pts: [[6, 45.5], [10, 46.5], [14, 47]], w: 1.2 }, // Alps
  { pts: [[59, 67], [59, 60], [58, 52]], w: 1.2 }, // Urals
  { pts: [[44, 37], [48, 34], [53, 30], [57, 27]], w: 1.6 }, // Zagros
  { pts: [[40, 43], [47, 41.5]], w: 1.2 }, // Caucasus
  { pts: [[-8, 31], [0, 33], [8, 35.5]], w: 1.4 }, // Atlas
  { pts: [[37, 14], [39, 9], [38, 6]], w: 2 }, // Ethiopian highlands
  { pts: [[6, 61], [10, 64], [15, 68], [19, 70]], w: 1.4 }, // Scandinavian
  { pts: [[145, -15], [148, -25], [149, -33], [147, -37]], w: 1.3 }, // Great Dividing Range
  { pts: [[68, 39], [74, 42], [80, 43], [88, 44], [95, 46]], w: 1.8 }, // Tian Shan / Altai
  { pts: [[-84, 35], [-79, 38], [-74, 42]], w: 1.2 }, // Appalachians
  { pts: [[150, 62], [160, 65], [170, 66]], w: 2.0 }, // Chersky / Kolyma
  { pts: [[28, 42], [35, 38], [42, 39]], w: 1.4 }, // Anatolia
];

// Arid zones as [lonMin, lonMax, latMin, latMax].
const DESERTS: [number, number, number, number][] = [
  [-16, 33, 15, 31], [34, 58, 14, 31], [50, 66, 26, 35], [74, 90, 36, 42], [92, 116, 38, 46],
  [118, 143, -32, -19], [-118, -106, 28, 37], [-72, -69, -27, -19], [14, 25, -27, -19], [55, 72, 36, 44],
];
// Dense forest zones.
const FORESTS: [number, number, number, number][] = [
  [-76, -46, -15, 4], [9, 30, -6, 5], [95, 125, -8, 20], [-125, -60, 45, 62], [20, 140, 52, 66], [-90, -75, 8, 18],
];

function distToRange(lon: number, lat: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(lon - (ax + t * dx), lat - (ay + t * dy)));
  }
  return best;
}

function inBox(lon: number, lat: number, b: [number, number, number, number], soft: number) {
  return lon > b[0] - soft && lon < b[1] + soft && lat > b[2] - soft && lat < b[3] + soft;
}

function addShallows(terrain: Uint8Array, w: number, h: number, dist = 2) {
  const d = new Int16Array(w * h).fill(-1);
  const q: number[] = [];
  for (let i = 0; i < w * h; i++) if (isLand(terrain[i])) { d[i] = 0; q.push(i); }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi]; if (d[i] >= dist) continue;
    const x = i % w, y = (i / w) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (d[j] >= 0) continue;
      d[j] = d[i] + 1; terrain[j] = T.Shallow; q.push(j);
    }
  }
}

/** Removes land specks smaller than `min` tiles so every region is meaningful. */
function removeSpecks(terrain: Uint8Array, w: number, h: number, min: number) {
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || !isLand(terrain[s])) continue;
    const comp = [s]; seen[s] = 1;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k], x = i % w, y = (i / w) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!seen[j] && isLand(terrain[j])) { seen[j] = 1; comp.push(j); }
      }
    }
    if (comp.length < min) for (const i of comp) terrain[i] = T.Deep;
  }
}

export function generateEarth(seed: number): TerrainResult {
  const w = EARTH_W, h = EARTH_H;
  const mask = decodeEarth();
  const terrain = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i]) { terrain[i] = T.Deep; continue; }
    const lon = lonOf(x), lat = latOf(y), alat = Math.abs(lat);
    const n = fbm(x / 9, y / 9, seed + 7, 3);
    const n2 = fbm(x / 6, y / 6, seed + 31, 3);
    let t: T = T.Plains;
    if (alat > 66 + (n - 0.5) * 6 || (lon > -75 && lon < -10 && lat > 60)) t = T.Snow;
    else {
      let mtn = Infinity;
      for (const r of RANGES) mtn = Math.min(mtn, distToRange(lon, lat, r.pts) / r.w);
      const jitter = (n2 - 0.5) * 0.8;
      if (mtn + jitter < 0.55) t = T.Mountain;
      else if (mtn + jitter < 1.25) t = T.Hills;
      else if (DESERTS.some(b => inBox(lon, lat, b, (n - 0.5) * 5))) t = n2 > 0.78 ? T.Hills : T.Desert;
      else if (FORESTS.some(b => inBox(lon, lat, b, (n - 0.5) * 6))) t = n2 > 0.72 ? T.Plains : T.Forest;
      else if (n2 > 0.62) t = T.Forest;
      else if (n2 < 0.24) t = T.Hills;
      if (alat > 58 && t === T.Plains && n > 0.55) t = T.Snow;
    }
    terrain[i] = t;
  }
  removeSpecks(terrain, w, h, 3);
  addShallows(terrain, w, h);
  return { w, h, terrain };
}

/** Continental shape bias for each preset, in normalised coordinates nx∈[0,1], ny∈[0,1]. */
function presetShape(id: PresetId, nx: number, ny: number): number {
  const cx = nx - 0.5, cy = (ny - 0.5) * 0.55;
  const r = Math.hypot(cx, cy);
  switch (id) {
    case 'pangaea': return 0.42 - r * 1.25;
    case 'archipelago': return 0.06 - Math.abs(cy) * 0.35;
    case 'twin': return 0.3 - Math.min(Math.hypot(nx - 0.27, cy), Math.hypot(nx - 0.73, cy)) * 1.6;
    case 'straits': return 0.36 - Math.abs(r - 0.0) * 0.6 - (r < 0.16 ? 0.6 : 0) - (Math.abs(cx) < 0.018 || Math.abs(cy) < 0.012 ? 0.5 : 0);
    case 'ring': return 0.25 - Math.abs(r - 0.26) * 2.6;
    case 'quad': {
      const d = Math.min(...[[0.27, 0.3], [0.73, 0.3], [0.27, 0.72], [0.73, 0.72]].map(([a, b]) => Math.hypot(nx - a, (ny - b) * 0.55)));
      return 0.25 - d * 2.0;
    }
    case 'crescent': {
      const outer = Math.hypot(cx + 0.05, cy), inner = Math.hypot(cx - 0.1, cy);
      return 0.3 - Math.abs(outer - 0.3) * 2.2 - (inner < 0.22 ? 0.45 : 0);
    }
  }
}

export function generateProcedural(seed: number, preset: PresetId | null, landFraction = 0.36): TerrainResult {
  const w = MAP_W, h = MAP_H;
  const rng = new Rng(seed);
  const elev = new Float32Array(w * h);
  // Random worlds get a few continental blobs; presets use a fixed shape.
  const blobs = Array.from({ length: 4 + rng.int(4) }, () => ({ x: rng.range(0.12, 0.88), y: rng.range(0.18, 0.82), r: rng.range(0.1, 0.22) }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = x / w, ny = y / h;
    let e = fbm(x / 38, y / 38, seed, 5) - 0.5;
    e += (fbm(x / 10, y / 10, seed + 99, 3) - 0.5) * 0.25;
    if (preset) e += presetShape(preset, nx, ny);
    else e += Math.max(...blobs.map(b => b.r - Math.hypot(nx - b.x, (ny - b.y) * 0.55) * 1.1)) * 1.4;
    const edge = Math.min(nx, 1 - nx, ny * 1.4, (1 - ny) * 1.4);
    if (edge < 0.06) e -= (0.06 - edge) * 6;
    elev[y * w + x] = e;
  }
  const sorted = Array.from(elev).sort((a, b) => b - a);
  const sea = sorted[Math.floor(sorted.length * landFraction)];
  const peak = sorted[Math.floor(sorted.length * landFraction * 0.06)];
  const hill = sorted[Math.floor(sorted.length * landFraction * 0.2)];
  const terrain = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, e = elev[i];
    if (e <= sea) { terrain[i] = T.Deep; continue; }
    const lat = Math.abs(y / h - 0.5) * 2;
    const moist = fbm(x / 22, y / 22, seed + 555, 4) + (valueNoise(x / 5, y / 5, seed + 77) - 0.5) * 0.15;
    let t: T;
    if (e >= peak) t = T.Mountain;
    else if (e >= hill) t = T.Hills;
    else if (lat > 0.84) t = T.Snow;
    else if (moist < 0.36 && lat < 0.6) t = T.Desert;
    else if (moist > 0.58) t = T.Forest;
    else t = T.Plains;
    terrain[i] = t;
  }
  removeSpecks(terrain, w, h, 4);
  addShallows(terrain, w, h);
  return { w, h, terrain };
}
