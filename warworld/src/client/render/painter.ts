// Terrain painter: turns the tile map into organic pixel-art ground at any pixels-per-tile density.
//
// Coastlines come from a smoothed signed-distance field with domain warping, so land never looks
// like 8×8 blocks. Every biome has its own pattern language (dune strokes, canopy forests, ridged
// rock, terraced hills, depth-banded water) quantised to a small hand-picked palette and lit from
// the top-left like the unit sprites.
import type { MapData } from '../../sim/map/regions';
import { T } from '../../sim/map/terrain';

type C3 = [number, number, number];
const hex = (h: string): C3 => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const pal = (...h: string[]) => h.map(hex);

// palettes ordered dark → light
export const PAL = {
  deep: pal('#1c2f72', '#213985', '#284596', '#3253a8'),
  sea: pal('#2c55a8', '#3466b8', '#3f78c6', '#4d8bd2'),
  shallow: pal('#3f86c4', '#4b9ccf', '#5db3d8', '#79c7de'),
  foam: pal('#a9dceb', '#d8f1f5', '#f4fbfb'),
  sand: pal('#a8805e', '#c79f6e', '#dbb87c', '#e9cf94', '#f3e2ae'),
  grass: pal('#3e6a2e', '#4f7f34', '#62953b', '#78aa44', '#93bf55'),
  forestFloor: pal('#22382a', '#2b4630'),
  canopy: pal('#1f3a2c', '#2b5233', '#3a6a38', '#4f8440', '#6ba04c'),
  pine: pal('#1a3029', '#24423a', '#2f5544', '#3f6a4e'),
  hills: pal('#5a6a34', '#6c7d3c', '#7f9045', '#94a453', '#adb969'),
  rock: pal('#4a3f45', '#655652', '#82705f', '#9d8b72', '#b9a88a'),
  snow: pal('#8d9cbc', '#aebdd6', '#cfdbeb', '#e8eff7', '#ffffff'),
  desertDark: pal('#9c6f62'),
  flower: pal('#e6d35a', '#d07ab0', '#f2f2e6'),
};

function h2(x: number, y: number, s: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number, o = 3) {
  let t = 0, a = 1, n = 0, f = 1;
  for (let i = 0; i < o; i++) { t += vnoise(x * f, y * f, s + i * 31) * a; n += a; a *= 0.5; f *= 2.03; }
  return t / n;
}
const pick = (p: C3[], t: number) => p[Math.max(0, Math.min(p.length - 1, Math.floor(t * p.length)))];

export class TerrainPainter {
  private sdf: Float32Array;   // signed distance in tiles: + land, − water
  private w: number; private h: number;
  constructor(private map: MapData) {
    this.w = map.w; this.h = map.h;
    this.sdf = this.buildSdf();
  }

  private buildSdf() {
    const { w, h } = this, land = (i: number) => this.map.terrain[i] >= 2;
    const INF = 1e9;
    const dIn = new Float32Array(w * h).fill(INF), dOut = new Float32Array(w * h).fill(INF);
    for (let i = 0; i < w * h; i++) (land(i) ? dOut : dIn)[i] = 0;
    // two-pass chamfer distance (3-4 metric) for each class
    const chamfer = (d: Float32Array) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) { v = Math.min(v, d[i - w] + 1); if (x > 0) v = Math.min(v, d[i - w - 1] + 1.414); if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.414); }
        d[i] = v;
      }
      for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x; let v = d[i];
        if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < h - 1) { v = Math.min(v, d[i + w] + 1); if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.414); if (x > 0) v = Math.min(v, d[i + w - 1] + 1.414); }
        d[i] = v;
      }
    };
    chamfer(dIn); chamfer(dOut);
    const s = new Float32Array(w * h);
    // dIn = distance to nearest water (for land), dOut = distance to nearest land (for water)
    for (let i = 0; i < w * h; i++) s[i] = land(i) ? dIn[i] - 0.5 : -(dOut[i] - 0.5);
    return s;
  }

  /** Bilinear SDF sample at tile coordinates (tile centres at +0.5). */
  sdfAt(x: number, y: number) {
    const fx = Math.max(0, Math.min(this.w - 1.001, x - 0.5)), fy = Math.max(0, Math.min(this.h - 1.001, y - 0.5));
    const xi = Math.floor(fx), yi = Math.floor(fy), tx = fx - xi, ty = fy - yi, w = this.w, s = this.sdf;
    const i = yi * w + xi;
    return (s[i] * (1 - tx) + s[i + 1] * tx) * (1 - ty) + (s[i + w] * (1 - tx) + s[i + w + 1] * tx) * ty;
  }
  terrainAt(x: number, y: number): number {
    const xi = Math.max(0, Math.min(this.w - 1, Math.floor(x))), yi = Math.max(0, Math.min(this.h - 1, Math.floor(y)));
    return this.map.terrain[yi * this.w + xi];
  }

  /** Signed coast distance at a world point after domain warping (same field the painter uses). */
  landAt(x: number, y: number) {
    const qx = x + (fbm(x * 0.33, y * 0.33, 11, 3) - 0.5) * 1.15;
    const qy = y + (fbm(x * 0.33, y * 0.33, 29, 3) - 0.5) * 1.15;
    return { qx, qy, d: this.sdfAt(qx, qy) + (vnoise(x * 16 * 0.09, y * 16 * 0.09, 5) - 0.5) * 0.18 };
  }

  /** Region under a world point, consistent with the painted coastline (−1 for water). */
  regionAtWarped(x: number, y: number, regionOf: Int16Array, w: number, h: number) {
    const { qx, qy, d } = this.landAt(x, y);
    if (d < 0) return -1;
    const tx = Math.max(0, Math.min(w - 1, Math.floor(qx))), ty = Math.max(0, Math.min(h - 1, Math.floor(qy)));
    let r = regionOf[ty * w + tx];
    if (r >= 0) return r;
    // warped onto a water tile: take the nearest land tile around it
    for (let rad = 1; rad <= 2; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const xx = tx + dx, yy = ty + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      r = regionOf[yy * w + xx]; if (r >= 0) return r;
    }
    return -1;
  }

  /** Colour of a world point. (x, y) in tiles; wx, wy in world pixels at 16 px/tile for pattern scale. */
  color(x: number, y: number): C3 {
    const wx = x * 16, wy = y * 16;
    // domain warp for organic coasts and biome borders
    const { qx, qy, d } = this.landAt(x, y);
    if (d < 0) return this.water(-d, wx, wy);
    // biome borders get their own, stronger and finer warp so forests and ranges have ragged edges
    const bx = qx + (fbm(x * 0.9, y * 0.9, 91, 3) - 0.5) * 1.9, by = qy + (fbm(x * 0.9, y * 0.9, 97, 3) - 0.5) * 1.9;
    const t = this.terrainAt(bx, by);
    if (d < 0.32 && t !== T.Snow && t !== T.Mountain) return this.beach(d, wx, wy);
    switch (t) {
      case T.Desert: return this.desert(wx, wy);
      case T.Forest: return this.forest(wx, wy, y);
      case T.Hills: return this.hills(wx, wy);
      case T.Mountain: return this.mountain(wx, wy, d);
      case T.Snow: return this.snow(wx, wy);
      default: return this.grass(wx, wy);
    }
  }

  private water(depth: number, wx: number, wy: number): C3 {
    if (depth < 0.09) return PAL.foam[h2(wx, wy, 3) < 0.5 ? 1 : 2];
    if (depth < 0.16) return h2(wx >> 1, wy, 4) < 0.55 ? PAL.foam[0] : PAL.shallow[3];
    // long soft swell strokes
    const swell = vnoise(wx * 0.045 + wy * 0.012, wy * 0.16, 77);
    const crest = swell > 0.74 ? 1 : swell < 0.22 ? -1 : 0;
    const dj = depth + (vnoise(wx * 0.02, wy * 0.02, 8) - 0.5) * 0.8;
    const band = dj < 1.1 ? PAL.shallow : dj < 2.6 ? PAL.sea : PAL.deep;
    const base = dj < 1.1 ? 1 + (dj < 0.55 ? 1 : 0) : dj < 2.6 ? 1 + (dj < 1.7 ? 1 : 0) : 1 + (dj < 4 ? 1 : 0);
    return band[Math.max(0, Math.min(band.length - 1, base + crest))];
  }

  private beach(d: number, wx: number, wy: number): C3 {
    const n = vnoise(wx * 0.2, wy * 0.2, 41);
    if (d < 0.09 && n < 0.6) return PAL.sand[2];
    return PAL.sand[n > 0.72 ? 4 : n < 0.25 ? 2 : 3];
  }

  private desert(wx: number, wy: number): C3 {
    // dune strokes: anisotropic warped noise, elongated along a diagonal wind direction
    const u = wx * 0.94 + wy * 0.34, v = -wx * 0.34 + wy * 0.94;
    const w = vnoise(u * 0.03, v * 0.03, 13) * 5;
    const s = vnoise(u * 0.07 + w, v * 0.24, 17);
    const fine = h2(wx, wy, 19);
    if (s > 0.78) return PAL.sand[fine < 0.15 ? 3 : 4];
    if (s > 0.62) return PAL.sand[3];
    if (s < 0.16) return PAL.desertDark[0];
    if (s < 0.27) return PAL.sand[1];
    return PAL.sand[2];
  }

  private grass(wx: number, wy: number): C3 {
    const big = fbm(wx * 0.012, wy * 0.012, 23, 3);
    const clump = vnoise(wx * 0.11, wy * 0.11, 29);
    const fine = h2(wx, wy, 31);
    // scattered lone trees
    const tree = this.canopy(wx, wy, 9, 0.12, 37);
    if (tree) return tree;
    if (fine > 0.995) return PAL.flower[Math.floor(h2(wx, wy, 33) * 3)];
    let k = big < 0.38 ? 1 : big < 0.6 ? 2 : 3;
    if (clump > 0.72) k++; else if (clump < 0.2) k--;
    if (fine < 0.04) k--;
    return PAL.grass[Math.max(0, Math.min(4, k))];
  }

  /** Worley canopy: round tree crowns shaded from the top-left. Returns null between crowns. */
  private canopy(wx: number, wy: number, cell: number, density: number, seed: number, pine = false): C3 | null {
    const cx = Math.floor(wx / cell), cy = Math.floor(wy / cell);
    let best: C3 | null = null, bestY = -Infinity;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      if (h2(gx, gy, seed) > density) continue;
      const tx = (gx + 0.15 + h2(gx, gy, seed + 1) * 0.7) * cell, ty = (gy + 0.15 + h2(gx, gy, seed + 2) * 0.7) * cell;
      const r = cell * (0.42 + h2(gx, gy, seed + 3) * 0.22);
      const dx = wx + 0.5 - tx, dy = wy + 0.5 - ty, dd = Math.hypot(dx, dy);
      if (dd > r || ty < bestY) continue;
      // lit from top-left: brighter where (dx,dy) points to the light
      const lit = (-dx - dy) / (r * 1.6) + 0.15 - (dd / r) * 0.45;
      const p = pine ? PAL.pine : PAL.canopy;
      const tone = dd > r - 0.9 ? 0 : lit > 0.42 ? p.length - 1 : lit > 0.12 ? p.length - 2 : lit > -0.25 ? p.length - 3 : 1;
      best = p[Math.max(0, tone)]; bestY = ty;
    }
    return best;
  }

  private forest(wx: number, wy: number, ty: number): C3 {
    const lat = Math.abs(ty / this.h - 0.45);
    const pine = lat > 0.2;
    const c = this.canopy(wx, wy, pine ? 5 : 6, 0.92, 51, pine);
    if (c) return c;
    // ground between crowns, with cast shadow toward bottom-right
    return PAL.forestFloor[h2(wx, wy, 53) < 0.5 ? 0 : 1];
  }

  private height(wx: number, wy: number, s: number) { return fbm(wx * 0.02, wy * 0.02, s, 4); }

  private hills(wx: number, wy: number): C3 {
    const hh = this.height(wx, wy, 61);
    const gx = this.height(wx + 1, wy, 61) - this.height(wx - 1, wy, 61), gy = this.height(wx, wy + 1, 61) - this.height(wx, wy - 1, 61);
    const lit = -(gx + gy) * 28;
    const band = (hh * 9) % 1;
    const tree = this.canopy(wx, wy, 8, 0.1, 63);
    if (tree) return tree;
    let k = 2 + (lit > 0.35 ? 1 : lit < -0.35 ? -1 : 0) + (lit > 0.9 ? 1 : lit < -0.9 ? -1 : 0);
    if (band < 0.07) k = Math.max(0, k - 1);
    return PAL.hills[Math.max(0, Math.min(4, k))];
  }

  private mountain(wx: number, wy: number, d: number): C3 {
    // ridged noise + directional light
    const r = (x: number, y: number) => 1 - Math.abs(2 * fbm(x * 0.03, y * 0.03, 71, 4) - 1);
    const hh = r(wx, wy);
    const gx = r(wx + 1, wy) - r(wx - 1, wy), gy = r(wx, wy + 1) - r(wx, wy - 1);
    const lit = -(gx + gy) * 9;
    if (hh > 0.88 && d > 1.2 && Math.abs(wy / 16 / this.h - 0.42) > 0.12) return PAL.snow[lit > 0.2 ? 4 : lit < -0.3 ? 2 : 3];
    let k = 2 + (lit > 0.25 ? 1 : lit < -0.25 ? -1 : 0) + (lit > 0.8 ? 1 : lit < -0.8 ? -1 : 0);
    if (h2(wx, wy, 73) < 0.03) k--;
    return PAL.rock[Math.max(0, Math.min(4, k))];
  }

  private snow(wx: number, wy: number): C3 {
    const hh = this.height(wx, wy, 81);
    const gx = this.height(wx + 1, wy, 81) - this.height(wx - 1, wy, 81), gy = this.height(wx, wy + 1, 81) - this.height(wx, wy - 1, 81);
    const lit = -(gx + gy) * 30;
    const k = 3 + (lit > 0.4 ? 1 : lit < -0.4 ? -1 : 0) + (lit < -1.1 ? -1 : 0);
    if (h2(wx, wy, 83) > 0.997) return PAL.snow[4];
    void hh;
    return PAL.snow[Math.max(0, Math.min(4, k))];
  }

  /** Paints a rectangle of tiles at `ppt` pixels per tile into a new ImageData. */
  paint(x0: number, y0: number, wTiles: number, hTiles: number, ppt: number): ImageData {
    const W = Math.round(wTiles * ppt), H = Math.round(hTiles * ppt);
    const img = new ImageData(W, H);
    const d = img.data;
    for (let py = 0; py < H; py++) {
      const y = y0 + (py + 0.5) / ppt;
      for (let px = 0; px < W; px++) {
        const c = this.color(x0 + (px + 0.5) / ppt, y);
        const k = (py * W + px) * 4;
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
      }
    }
    return img;
  }
}
