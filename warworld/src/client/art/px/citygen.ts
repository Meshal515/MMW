// City generator: lays out and paints a city INTO the ground (pixels on pixels) for any level 1..50.
//
// The street grid is anchored on the city centre, so a city at level L+1 contains the city at level L:
// new blocks appear at the edge as the radius grows, while the centre densifies (houses → apartments
// → mid-rises → towers). Each city only builds inside its own claim (the land closer to it than to any
// neighbour, minus a green belt), so neighbouring cities never merge — they meet at a park strip and
// connect by highway. Districts (factory, power, port, hospital, market, bank, barracks, palace) take
// whole blocks in sensible places: industry downwind, port on the coast, hospital near the centre.
import { CITY } from '../../../sim/balance';
import { C3, COLORS, Pix } from './dsl';
import { BUILDINGS } from './buildings';
import { bank, barracks, hospital, houseV, market, midrise, palace, portQuay, powerPlant, tallTower } from './districts';

export type District = 'factory' | 'power' | 'port' | 'hospital' | 'market' | 'bank' | 'barracks';
export interface CityInput { cx: number; cy: number; level: number; capital: boolean; seed: number; team: C3; districts: Partial<Record<District, number>> }
export interface Site { ok(x: number, y: number): boolean; water(x: number, y: number): boolean }
export interface Paint { get(x: number, y: number): C3; set(x: number, y: number, c: number[]): void; stamp(p: Pix | ImageData, x: number, y: number, shadow?: number, team?: C3): void }
export interface Placed { kind: string; x: number; y: number; w: number; h: number }
export interface CityResult { placed: Placed[]; chimneys: { x: number; y: number }[]; radius: number }

export const CELL = 32;
const sw = (k: number) => (k === 0 ? 6 : 4);
function hash(x: number, y: number, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const col = (ch: string) => COLORS[ch];
function rot90(img: ImageData, k: number) {
  k = ((k % 4) + 4) % 4; if (!k) return img;
  let src = img;
  for (let n = 0; n < k; n++) {
    const o = new ImageData(src.height, src.width);
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
      const s = (y * src.width + x) * 4, d = (x * o.width + (o.width - 1 - y)) * 4;
      o.data.set(src.data.subarray(s, s + 4), d);
    }
    src = o;
  }
  return src;
}

interface Block { i: number; j: number; x0: number; y0: number; x1: number; y1: number; d: number; use: string | null }

export function paintCity(g: Paint, c: CityInput, site: Site): CityResult {
  const L = Math.max(1, Math.min(50, c.level)), R = CITY.radius(L), K = Math.ceil((R + CELL) / CELL) + 1;
  const placed: Placed[] = [], chimneys: { x: number; y: number }[] = [];
  const cellX = (i: number) => c.cx + i * CELL, cellY = (j: number) => c.cy + j * CELL;
  const inner = (i: number, j: number) => ({ x0: cellX(i) + Math.ceil(sw(i) / 2), y0: cellY(j) + Math.ceil(sw(j) / 2), x1: cellX(i + 1) - Math.floor(sw(i + 1) / 2) - 1, y1: cellY(j + 1) - Math.floor(sw(j + 1) / 2) - 1 });
  const rectOk = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0 - 2; y <= y1 + 2; y += 3) for (let x = x0 - 2; x <= x1 + 2; x += 3) if (!site.ok(x, y)) return false;
    return site.ok(x1 + 2, y1 + 2);
  };

  // 1) which blocks exist at this level
  const blocks = new Map<string, Block>();
  for (let j = -K; j < K; j++) for (let i = -K; i < K; i++) {
    const r = inner(i, j), bx = (r.x0 + r.x1) / 2, by = (r.y0 + r.y1) / 2;
    const d = Math.hypot(bx - c.cx, by - c.cy), core = i >= -1 && i <= 0 && j >= -1 && j <= 0;
    const n = (hash(i, j, c.seed) - 0.5) * CELL * 0.9;
    if ((core || d + n <= R + 6) && rectOk(r.x0, r.y0, r.x1, r.y1)) blocks.set(`${i},${j}`, { i, j, ...r, d, use: null });
  }
  const B = (i: number, j: number) => blocks.get(`${i},${j}`);
  const free = (i: number, j: number) => { const b = B(i, j); return b && !b.use ? b : null; };

  // 2) districts claim blocks (single, 2×1 or 2×2), each in its preferred ring and sector
  const ang0 = hash(7, 7, c.seed) * Math.PI * 2;
  const reserve = (want: string, cells: [number, number][], ring: number, ang: number | null) => {
    let best: Block | null = null, bs = Infinity;
    for (const b of blocks.values()) {
      if (!cells.every(([di, dj]) => free(b.i + di, b.j + dj))) continue;
      const a = Math.atan2((b.y0 + b.y1) / 2 - c.cy, (b.x0 + b.x1) / 2 - c.cx);
      const da = ang === null ? 0 : Math.abs(Math.atan2(Math.sin(a - ang), Math.cos(a - ang)));
      const s = Math.abs(b.d / R - ring) * 3 + da + hash(b.i, b.j, c.seed + 3) * 0.2;
      if (s < bs) { bs = s; best = b; }
    }
    if (!best) return null;
    for (const [di, dj] of cells) B(best.i + di, best.j + dj)!.use = want + (di || dj ? '+' : '');
    const last = B(best.i + cells[cells.length - 1][0], best.j + cells[cells.length - 1][1])!;
    return { x0: best.x0, y0: best.y0, x1: Math.max(best.x1, last.x1), y1: Math.max(best.y1, last.y1) };
  };
  const zones: { kind: string; r: { x0: number; y0: number; x1: number; y1: number } }[] = [];
  const add = (kind: string, r: ReturnType<typeof reserve>) => { if (r) zones.push({ kind, r }); };
  if (c.capital) { const b = free(-1, -1) && free(0, -1) && free(-1, -2) && free(0, -2) ? B(-1, -2) : null; if (b) add('palace', reserve('palace', [[0, 0], [1, 0], [0, 1], [1, 1]], b.d / R, Math.atan2(b.y0 - c.cy, b.x0 - c.cx))); }
  const d = c.districts;
  if (d.bank) add('bank', reserve('bank', [[0, 0]], 0.15, null));
  if (d.market) add('market', reserve('market', [[0, 0]], 0.3, ang0 + 1.2));
  if (d.hospital) add('hospital', reserve('hospital', [[0, 0]], 0.4, ang0 + 2.6));
  if (d.factory) add('factory', reserve('factory', [[0, 0], [1, 0]], 0.8, ang0));
  if (d.power) add('power', reserve('power', [[0, 0], [1, 0]], 0.85, ang0 + 0.6));
  if (d.barracks) add('barracks', reserve('barracks', [[0, 0], [1, 0], [0, 1], [1, 1]], 0.8, ang0 + Math.PI));
  // port: the quay sits on the shore closest to the centre, facing the water, joined by the avenue
  let port: { x: number; y: number; img: ImageData; ax: number; ay: number } | null = null;
  if (c.districts.port) {
    let best: { x: number; y: number; k: number } | null = null, bd = Infinity;
    const dirs: [number, number, number][] = [[0, 1, 0], [-1, 0, 1], [0, -1, 2], [1, 0, 3]];
    for (const [dx, dy, k] of dirs) for (let s2 = 8; s2 < R + CELL * 2; s2 += 2) {
      const x = c.cx + dx * s2, y = c.cy + dy * s2;
      if (site.water(x, y)) { if (s2 < bd) { bd = s2; best = { x, y, k }; } break; }
    }
    if (best) {
      const img = rot90(portQuay(60).toImage(c.team), best.k), w = img.width, hh = img.height;
      const [ox, oy] = best.k === 0 ? [best.x - w / 2, best.y - 26] : best.k === 2 ? [best.x - w / 2, best.y - hh + 26] : best.k === 1 ? [best.x - w + 26, best.y - hh / 2] : [best.x - 26, best.y - hh / 2];
      port = { x: Math.round(ox), y: Math.round(oy), img, ax: best.x, ay: best.y };
      for (const b of blocks.values()) if (!b.use && b.x1 >= port.x - 2 && b.x0 <= port.x + w + 1 && b.y1 >= port.y - 2 && b.y0 <= port.y + hh + 1) b.use = 'portzone';
    }
  }
  // parks: a few blocks of green so dense cities breathe
  for (const b of blocks.values()) if (!b.use && L >= 4 && hash(b.i, b.j, c.seed + 11) < 0.08) b.use = 'park';

  // 3) streets: between blocks and on each block's inner side; the outer edge opens onto the fields
  const asphalt = col('A'), curb = [84, 86, 96], dash = col('Z');
  const paintRect = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (site.ok(x, y) || (port && Math.abs(x - c.cx) < 4 && Math.abs(y - c.cy) < R + CELL * 2)) g.set(x, y, asphalt); };
  for (const b of blocks.values()) {
    const sx0 = cellX(b.i) - Math.floor(sw(b.i) / 2), sx1 = cellX(b.i) + Math.ceil(sw(b.i) / 2) - 1;
    const ex0 = cellX(b.i + 1) - Math.floor(sw(b.i + 1) / 2), ex1 = cellX(b.i + 1) + Math.ceil(sw(b.i + 1) / 2) - 1;
    const ny0 = cellY(b.j) - Math.floor(sw(b.j) / 2), ny1 = cellY(b.j) + Math.ceil(sw(b.j) / 2) - 1;
    const sy0 = cellY(b.j + 1) - Math.floor(sw(b.j + 1) / 2), sy1 = cellY(b.j + 1) + Math.ceil(sw(b.j + 1) / 2) - 1;
    const W_ = !!B(b.i - 1, b.j) || b.i === 0, E_ = !!B(b.i + 1, b.j) || b.i === -1, N_ = !!B(b.i, b.j - 1) || b.j === 0, S_ = !!B(b.i, b.j + 1) || b.j === -1;
    if (W_) paintRect(sx0, N_ ? ny0 : b.y0, sx1, S_ ? sy1 : b.y1);
    if (E_) paintRect(ex0, N_ ? ny0 : b.y0, ex1, S_ ? sy1 : b.y1);
    if (N_) paintRect(W_ ? sx0 : b.x0, ny0, E_ ? ex1 : b.x1, ny1);
    if (S_) paintRect(W_ ? sx0 : b.x0, sy0, E_ ? ex1 : b.x1, sy1);
  }
  if (port) { const [dx, dy] = [Math.sign(port.ax - c.cx), Math.sign(port.ay - c.cy)]; for (let t = 0; t < Math.hypot(port.ax - c.cx, port.ay - c.cy) - 20; t++) for (let w2 = -3; w2 <= 2; w2++) { const x = c.cx + dx * t + (dy ? w2 : 0), y = c.cy + dy * t + (dx ? w2 : 0); if (!site.water(x, y)) g.set(x, y, asphalt); } }
  // lane markings on the two avenues, curbs everywhere
  for (const b of blocks.values()) {
    if (b.i === 0 || b.i === -1) for (let y = b.y0 - 3; y <= b.y1 + 3; y++) if (y % 6 < 3 && site.ok(c.cx, y) && !isInterior(c.cx, y)) g.set(c.cx, y, dash);
    if (b.j === 0 || b.j === -1) for (let x = b.x0 - 3; x <= b.x1 + 3; x++) if (x % 6 < 3 && site.ok(x, c.cy) && !isInterior(x, c.cy)) g.set(x, c.cy, dash);
  }
  function isInterior(x: number, y: number) { for (const z of zones) if (x >= z.r.x0 && x <= z.r.x1 && y >= z.r.y0 && y <= z.r.y1) return true; return false; }

  // 4) block grounds
  const fillRect = (x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => number[] | null) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = f(x, y); if (v) g.set(x, y, v); } };
  const lawn = (x: number, y: number) => { const n = hash(x, y, 77); return n < 0.5 ? col('G') : n < 0.85 ? [92, 148, 60] : col('H'); };
  const paved = (x: number, y: number) => (hash(x >> 1, y >> 1, 5) < 0.5 ? col('X') : [176, 171, 160]);
  const kindOf = (b: Block) => {
    const t = b.d / R;
    if (L >= 10 && t < 0.3) return 'tower';
    if (L >= 5 && t < 0.52) return 'mid';
    if (L >= 2 && t < 0.74) return 'apt';
    return 'house';
  };
  for (const z of zones) fillRect(z.r.x0, z.r.y0, z.r.x1, z.r.y1, (x, y) => (z.kind === 'palace' || z.kind === 'barracks' ? lawn(x, y) : paved(x, y)));
  for (const b of blocks.values()) {
    if (b.use) { if (b.use === 'park') fillRect(b.x0, b.y0, b.x1, b.y1, lawn); continue; }
    const k = kindOf(b);
    if (k === 'house') fillRect(b.x0, b.y0, b.x1, b.y1, lawn);
    else if (k === 'apt') fillRect(b.x0, b.y0, b.x1, b.y1, (x, y) => (x === b.x0 || y === b.y0 || x === b.x1 || y === b.y1 ? col('X') : lawn(x, y)));
    else fillRect(b.x0, b.y0, b.x1, b.y1, (x, y) => (x === b.x0 || y === b.y0 || x === b.x1 || y === b.y1 ? col('Y') : paved(x, y)));
  }
  // curb line where asphalt meets the blocks
  for (const b of blocks.values()) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) for (const y of [b.y0 - 1, b.y1 + 1]) if (site.ok(x, y) && !isInterior(x, y)) { const p = g.get(x, y); if (p[0] === asphalt[0] && p[1] === asphalt[1]) g.set(x, y, curb); }
  for (const b of blocks.values()) for (let y = b.y0 - 1; y <= b.y1 + 1; y++) for (const x of [b.x0 - 1, b.x1 + 1]) if (site.ok(x, y) && !isInterior(x, y)) { const p = g.get(x, y); if (p[0] === asphalt[0] && p[1] === asphalt[1]) g.set(x, y, curb); }

  // 5) buildings, painted top-left → bottom-right so cast shadows fall on what is behind them
  const jobs: { x: number; y: number; p: Pix | ImageData; sh: number; kind: string }[] = [];
  const put = (p: Pix, x: number, y: number, sh: number, kind: string) => jobs.push({ x, y, p, sh, kind });
  const houses = ['house_r', 'house_g', 'house_r', 'house_t', 'house_g'];
  for (const b of blocks.values()) {
    const h = (n: number) => hash(b.i * 7 + n, b.j * 13 - n, c.seed);
    if (b.use === 'park') {
      for (let n = 0; n < 7; n++) put(BUILDINGS[h(n) < 0.5 ? 'tree' : 'treeB'].draw(), b.x0 + 2 + Math.floor(h(n + 10) * 18), b.y0 + 2 + Math.floor(h(n + 20) * 18), 1, 'tree');
      continue;
    }
    if (b.use) continue;
    const k = kindOf(b), X = b.x0 + 1, Y = b.y0 + 1;
    if (k === 'house') {
      const edge = !B(b.i - 1, b.j) || !B(b.i + 1, b.j) || !B(b.i, b.j - 1) || !B(b.i, b.j + 1);
      const vert = h(30) < 0.4;
      for (const [dx, dy, n] of [[0, 0, 1], [14, 0, 2], [0, 14, 3], [14, 14, 4]] as const) {
        const r = h(n);
        if (edge && r > 0.72) continue;
        if (r < 0.14) put(BUILDINGS[h(n + 5) < 0.5 ? 'treeB' : 'tree'].draw(), X + dx + 3, Y + dy + 2, 1, 'tree');
        else if (vert) { const v = houseV(h(n + 9)); put(v, X + dx + 1, Y + dy, 2, 'house'); }
        else put(BUILDINGS[houses[Math.floor(h(n + 9) * houses.length)]].draw(), X + dx, Y + dy, 2, 'house');
      }
    } else if (k === 'apt') {
      put(BUILDINGS.apartment.draw(), X, Y, 3, 'apt'); put(BUILDINGS.apartment.draw(), X, Y + 14, 3, 'apt');
      if (h(3) < 0.5) { put(BUILDINGS.treeB.draw(), X + 17, Y + 1, 1, 'tree'); put(BUILDINGS.tree.draw(), X + 18, Y + 15, 1, 'tree'); }
      else put(midrise(8, 22, 1), X + 16, Y + 1, 3, 'apt');
    } else if (k === 'mid') {
      if (h(4) < 0.5) put(midrise(24, 24, Math.floor(h(5) * 3)), X, Y, 4, 'mid');
      else { put(midrise(24, 10, Math.floor(h(5) * 3)), X, Y, 4, 'mid'); put(midrise(24, 10, Math.floor(h(6) * 3)), X, Y + 13, 4, 'mid'); }
    } else {
      const central = b.d < CELL * 0.8;
      if (central || h(4) < 0.45) put(tallTower(23, h(6) < 0.5 ? 'h' : 'B', central), X, Y, central ? 9 : 7, 'tower');
      else for (const [dx, dy, n] of [[0, 0, 1], [14, 0, 2], [0, 14, 3], [14, 14, 4]] as const) put(tallTower(11, h(n) < 0.5 ? 'h' : 'B'), X + dx, Y + dy, 5, 'tower');
    }
  }
  for (const z of zones) {
    const { x0, y0, x1, y1 } = z.r, w = x1 - x0 + 1, hh = y1 - y0 + 1;
    const mid = (p: Pix) => [x0 + Math.floor((w - p.w) / 2), y0 + Math.floor((hh - p.h) / 2)] as const;
    let p: Pix;
    switch (z.kind) {
      case 'palace': {
        p = palace(); const [x, y] = mid(p); put(p, x, y, 3, 'palace');
        for (let n = 0; n < 6; n++) put(BUILDINGS.tree.draw(), x0 + 1 + n * 10, y1 - 7, 1, 'tree');
        break;
      }
      case 'bank': p = bank(); put(p, ...mid(p), 7, 'bank'); break;
      case 'market': p = market(); put(p, ...mid(p), 1, 'market'); break;
      case 'hospital': p = hospital(); put(p, ...mid(p), 3, 'hospital'); break;
      case 'power': { p = powerPlant(); const [x, y] = mid(p); put(p, x, y, 3, 'power'); chimneys.push({ x: x + 10, y: y + 11 }, { x: x + 26, y: y + 11 }); break; }
      case 'factory': {
        const f = BUILDINGS.factory.draw(); put(f, x0 + 1, y0 + 1, 3, 'factory');
        put(BUILDINGS.warehouse.draw(), x0 + 38, y0 + 1, 2, 'factory');
        if ((d.factory ?? 0) >= 2) put(BUILDINGS.warehouse.draw(), x0 + 38, y0 + 14, 2, 'factory');
        chimneys.push({ x: x0 + 28, y: y0 + 18 }, { x: x0 + 33, y: y0 + 18 });
        break;
      }
      case 'barracks': { p = barracks(); put(p, ...mid(p), 2, 'barracks'); break; }
    }
  }
  if (port) jobs.push({ x: port.x, y: port.y, p: port.img, sh: 1, kind: 'port' });
  jobs.sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const j of jobs) {
    g.stamp(j.p, j.x, j.y, j.sh, c.team);
    const w = j.p instanceof Pix ? j.p.w : j.p.width, h = j.p instanceof Pix ? j.p.h : j.p.height;
    if (j.kind !== 'tree' && j.kind !== 'house' && j.kind !== 'apt') placed.push({ kind: j.kind, x: j.x, y: j.y, w, h });
  }
  return { placed, chimneys, radius: R };
}

/** A highway between two cities: L-shaped, follows the grid, never paints over water. */
export function paintHighway(g: Paint, a: { x: number; y: number }, b: { x: number; y: number }, site: { water(x: number, y: number): boolean }) {
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    const horiz = y0 === y1;
    for (let t = 0; t <= Math.abs(horiz ? x1 - x0 : y1 - y0); t++) for (let w = -2; w <= 1; w++) {
      const x = horiz ? Math.min(x0, x1) + t : x0 + w, y = horiz ? y0 + w : Math.min(y0, y1) + t;
      if (site.water(x, y)) continue;
      const edge = w === -2 || w === 1, mid = w === 0 && (horiz ? x : y) % 6 < 3;
      g.set(x, y, edge ? [84, 86, 96] : mid ? col('Z') : col('A'));
    }
  };
  seg(a.x, a.y, b.x, a.y); seg(b.x, a.y, b.x, b.y);
}
