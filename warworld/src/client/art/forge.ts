// Sprite forge: renders units from geometric models into crisp, hand-styled pixel art.
//
// Every model is a list of parts (ellipses, polygons, capsules...) with a material and a height.
// For each requested angle the parts are rasterised at pixel centres (no anti-aliasing), a height
// field is built, normals come from its gradient, and light from the top-left picks a tone from a
// hue-shifted 5-step ramp (purple shadows, warm highlights). A dark selective outline and panel
// occlusion lines finish the sprite. Because rotation happens before rasterising, every angle is
// clean pixel art instead of a rotated bitmap.

export type Mat =
  | 'olive' | 'olive2' | 'navygrey' | 'lightgrey' | 'stealth' | 'darksteel' | 'hull' | 'deck' | 'deckdark'
  | 'glass' | 'black' | 'white' | 'red' | 'team' | 'tan' | 'rust' | 'container1' | 'container2' | 'container3'
  | 'container4' | 'sand' | 'rubber' | 'copper' | 'yellow' | 'concrete' | 'blue' | 'camo';

type RGB = [number, number, number];

const BASE: Record<Mat, string> = {
  olive: '#5b7a3a', olive2: '#6e8a4a', navygrey: '#7e8c99', lightgrey: '#a7b0b8', stealth: '#646b74', darksteel: '#4a5058',
  hull: '#6b7682', deck: '#5d646c', deckdark: '#43484f', glass: '#3c6a8c', black: '#26232b', white: '#e4e6e8', red: '#b8433a',
  team: '#c8c8c8', tan: '#b59a6a', rust: '#8a4c34', container1: '#b85a3c', container2: '#3f7cae', container3: '#d2a23a',
  container4: '#5a9a5a', sand: '#c9ad78', rubber: '#2e2c30', copper: '#a87444', yellow: '#d6b84a', concrete: '#9a968c',
  blue: '#3f6fb0', camo: '#6f7a46',
};

function hexToRgb(h: string): RGB { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb(h: number, s: number, l: number): RGB {
  const f = (n: number) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return [f(0), f(8), f(4)];
}
const lerpHue = (a: number, b: number, t: number) => { let d = b - a; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return (a + d * t + 1) % 1; };

/** 5-tone ramp with hue shifting: shadows lean violet, highlights lean warm yellow. */
export function ramp(hex: string): RGB[] {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const out: RGB[] = [];
  const steps = [-0.30, -0.15, 0, 0.12, 0.24];
  steps.forEach((dl, i) => {
    const t = (i - 2) / 2;
    const hh = t < 0 ? lerpHue(h, 0.72, -t * 0.22) : lerpHue(h, 0.13, t * 0.18);
    const ss = Math.max(0, Math.min(1, s * (t < 0 ? 1 - t * 0.15 : 1 - t * 0.25)));
    out.push(hslToRgb(hh, ss, Math.max(0.04, Math.min(0.96, l + dl))));
  });
  return out;
}
const RAMPS = Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, ramp(v)])) as Record<Mat, RGB[]>;
// the team mask is a grey ramp that gets multiplied by the nation colour at runtime
RAMPS.team = [[105, 105, 115], [150, 150, 158], [200, 200, 204], [235, 235, 235], [255, 255, 250]];
const OUTLINE: RGB = [29, 22, 38];

export type Part =
  | { k: 'ell'; x: number; y: number; rx: number; ry: number; mat: Mat; h: number; dome?: number; rot?: number }
  | { k: 'poly'; pts: [number, number][]; mat: Mat; h: number; dome?: number; bevel?: number; mirror?: boolean }
  | { k: 'cap'; x0: number; y0: number; x1: number; y1: number; r: number; r1?: number; mat: Mat; h: number; dome?: number; mirror?: boolean }
  | { k: 'rect'; x: number; y: number; w: number; hh: number; mat: Mat; h: number; dome?: number; bevel?: number; mirror?: boolean };

export interface Model { name: string; size: number; parts: Part[]; outline?: boolean; scale?: number; castShadow?: boolean; w?: number; h?: number }

interface Shape { test: (x: number, y: number) => number; mat: Mat; h: number; dome: number } // test → profile 0..1 or -1 outside

function polyShape(pts: [number, number][], bevel: number) {
  return (x: number, y: number) => {
    let inside = false, dmin = Infinity;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      const dx = xj - xi, dy = yj - yi, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / l2));
      dmin = Math.min(dmin, Math.hypot(x - xi - t * dx, y - yi - t * dy));
    }
    if (!inside) return -1;
    return Math.min(1, dmin / Math.max(0.01, bevel));
  };
}

function toShapes(m: Model): Shape[] {
  const out: Shape[] = [];
  const push = (p: Part, mirrored: boolean) => {
    const my = (pts: [number, number][]) => mirrored ? pts.map(([x, y]) => [x, -y] as [number, number]) : pts;
    switch (p.k) {
      case 'ell': {
        const y0 = mirrored ? -p.y : p.y, c = Math.cos(-(p.rot ?? 0)), s = Math.sin(-(p.rot ?? 0));
        out.push({ mat: p.mat, h: p.h, dome: p.dome ?? 1, test: (x, y) => {
          const dx = x - p.x, dy = y - y0, u = dx * c - dy * s, v = dx * s + dy * c;
          const d = (u / p.rx) ** 2 + (v / p.ry) ** 2;
          return d > 1 ? -1 : Math.sqrt(1 - d);
        } });
        break;
      }
      case 'poly': out.push({ mat: p.mat, h: p.h, dome: p.dome ?? 0.4, test: polyShape(my(p.pts), p.bevel ?? 1.5) }); break;
      case 'rect': out.push({ mat: p.mat, h: p.h, dome: p.dome ?? 0.3, test: polyShape(my([[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.hh], [p.x, p.y + p.hh]]), p.bevel ?? 1.2) }); break;
      case 'cap': {
        const y0 = mirrored ? -p.y0 : p.y0, y1 = mirrored ? -p.y1 : p.y1, r1 = p.r1 ?? p.r;
        out.push({ mat: p.mat, h: p.h, dome: p.dome ?? 1, test: (x, y) => {
          const dx = p.x1 - p.x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((x - p.x0) * dx + (y - y0) * dy) / l2));
          const r = p.r + (r1 - p.r) * t;
          const d = Math.hypot(x - p.x0 - t * dx, y - y0 - t * dy);
          return d > r ? -1 : Math.sqrt(1 - (d / r) ** 2);
        } });
        break;
      }
    }
  };
  for (const p of m.parts) { push(p, false); if ((p as any).mirror) push(p, true); }
  return out;
}

export interface Rendered { base: ImageData; team: ImageData | null; w: number; h: number }

const LIGHT = (() => { const v = [-0.55, -0.65, 0.9]; const l = Math.hypot(...v); return v.map(x => x / l); })();

/** Rasterises a model rotated by `angle` (radians, 0 = facing right). */
export function renderModel(m: Model, angle: number, shapes = toShapes(m)): Rendered {
  const S = m.w ?? m.size, SH = m.h ?? m.size, sc = m.scale ?? 1;
  const N = S * SH;
  const mat = new Int16Array(N).fill(-1), H = new Float32Array(N), part = new Int16Array(N).fill(-1);
  const matIdx: Mat[] = [];
  const c = Math.cos(-angle), s = Math.sin(-angle);
  for (let py = 0; py < SH; py++) for (let px = 0; px < S; px++) {
    const wx = (px + 0.5 - S / 2) / sc, wy = (py + 0.5 - SH / 2) / sc;
    const x = wx * c - wy * s, y = wx * s + wy * c;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const sh = shapes[i];
      const prof = sh.test(x, y);
      if (prof < 0) continue;
      const k = py * S + px;
      let mi = matIdx.indexOf(sh.mat); if (mi < 0) { matIdx.push(sh.mat); mi = matIdx.length - 1; }
      mat[k] = mi; part[k] = i; H[k] = sh.h + sh.dome * prof * 2.2;
      break;
    }
  }
  const base = new ImageData(S, SH);
  let team: ImageData | null = null;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= S || y >= SH ? -1 : mat[y * S + x]);
  const hAt = (x: number, y: number, fb: number) => (at(x, y) < 0 ? fb - 1.5 : H[y * S + x]);
  if (m.castShadow) {
    // project each tall pixel's shadow toward the bottom-right onto empty ground
    for (let py = 0; py < SH; py++) for (let px = 0; px < S; px++) {
      const k = py * S + px; if (mat[k] < 0 || H[k] < 1.6) continue;
      const len = Math.round(H[k] * 0.55);
      for (let i = 1; i <= len; i++) {
        const x = px + i, y = py + i;
        if (x >= S || y >= SH) break;
        const j = y * S + x;
        if (mat[j] >= 0) continue;
        base.data.set([46, 30, 64, 105], j * 4);
      }
    }
  }
  for (let py = 0; py < SH; py++) for (let px = 0; px < S; px++) {
    const k = py * S + px;
    const mi = mat[k];
    if (mi < 0) {
      // selective outline just outside the silhouette
      if (base.data[k * 4 + 3] === 105) continue;
      if (m.outline !== false && (at(px - 1, py) >= 0 || at(px + 1, py) >= 0 || at(px, py - 1) >= 0 || at(px, py + 1) >= 0)) {
        base.data.set([OUTLINE[0], OUTLINE[1], OUTLINE[2], 255], k * 4);
      }
      continue;
    }
    const h0 = H[k];
    const dx = hAt(px + 1, py, h0) - hAt(px - 1, py, h0), dy = hAt(px, py + 1, h0) - hAt(px, py - 1, h0);
    const nx = -dx * 0.55, ny = -dy * 0.55, nz = 1, nl = Math.hypot(nx, ny, nz);
    let shade = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl;
    // occlusion where a taller neighbouring part sits above / left of us (cast towards bottom-right)
    const up = H[Math.max(0, py - 1) * S + px], left = H[py * S + Math.max(0, px - 1)];
    void up; void left;
    if ((part[Math.max(0, py - 1) * S + px] !== part[k] && up - h0 > 0.8) || (part[py * S + Math.max(0, px - 1)] !== part[k] && left - h0 > 0.8)) shade -= 0.35;
    const t = shade - 0.62 + h0 * 0.012;
    let tone = t < -0.28 ? 0 : t < -0.08 ? 1 : t < 0.12 ? 2 : t < 0.27 ? 3 : 4;
    // separate distinct parts with a darker seam on their lower edge
    const below = py + 1 < SH ? part[(py + 1) * S + px] : -1;
    if (below >= 0 && below !== part[k] && H[(py + 1) * S + px] > h0 + 0.5) tone = Math.max(0, tone - 1);
    // rim light on edges facing the sun, extra shade on edges facing away
    if (at(px - 1, py) < 0 || at(px, py - 1) < 0) tone = Math.min(4, tone + 1);
    else if ((at(px + 1, py) < 0 || at(px, py + 1) < 0) && tone > 0) tone -= 1;
    const name = matIdx[mi];
    const col = RAMPS[name][tone];
    if (name === 'team') {
      team ??= new ImageData(S, SH);
      team.data.set([col[0], col[1], col[2], 255], k * 4);
    } else base.data.set([col[0], col[1], col[2], 255], k * 4);
  }
  pixelPerfect(base, S, SH);
  return { base, team, w: S, h: SH };
}

/** Removes doubled outline corners ("L" steps) so diagonal outlines stay one pixel thin. */
function pixelPerfect(img: ImageData, S: number, SH: number) {
  const d = img.data;
  const isOut = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= S || y >= SH) return false;
    const k = (y * S + x) * 4;
    return d[k + 3] === 255 && d[k] === OUTLINE[0] && d[k + 1] === OUTLINE[1] && d[k + 2] === OUTLINE[2];
  };
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < SH && d[(y * S + x) * 4 + 3] === 255 && !isOut(x, y);
  for (let y = 0; y < SH; y++) for (let x = 0; x < S; x++) {
    if (!isOut(x, y)) continue;
    // an outline pixel that only touches the sprite diagonally and bridges two outline neighbours is redundant
    const n4 = filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1);
    if (n4) continue;
    const h = isOut(x - 1, y) || isOut(x + 1, y), v = isOut(x, y - 1) || isOut(x, y + 1);
    if (h && v) d[(y * S + x) * 4 + 3] = 0;
  }
}

/** Pre-renders `dirs` angles of a model; returns canvases for atlas packing. */
export function renderRotations(m: Model, dirs: number) {
  const shapes = toShapes(m);
  const out: { name: string; c: HTMLCanvasElement }[] = [];
  for (let i = 0; i < dirs; i++) {
    const r = renderModel(m, (i / dirs) * Math.PI * 2, shapes);
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
    c.getContext('2d')!.putImageData(r.base, 0, 0);
    out.push({ name: `${m.name}_${i}`, c });
    if (r.team) {
      const t = document.createElement('canvas'); t.width = r.w; t.height = r.h;
      t.getContext('2d')!.putImageData(r.team, 0, 0);
      out.push({ name: `${m.name}_${i}_t`, c: t });
    }
  }
  return out;
}

export const rampOf = (m: Mat) => RAMPS[m];
