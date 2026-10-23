// Partitions land into ~1200 natural regions and water into sea zones, with adjacency graphs.
import { Rng } from '../rng';
import { generateEarth, generateProcedural, isLand, MapKind, PresetId, PRESETS, T } from './terrain';

export interface Region {
  id: number;
  tiles: number[];
  area: number;
  cx: number; cy: number;      // centroid in tile units
  anchor: number;              // a tile inside the region near its centroid
  terrain: T;                  // dominant terrain
  forestShare: number; hillShare: number; flatShare: number;
  neighbors: number[];         // land neighbours (including short strait crossings)
  straits: number[];           // subset of neighbours reached across a strait
  seas: number[];              // adjacent sea zones
  coastal: boolean;
  continent: number;
  defense: number;             // terrain defence multiplier
  moveCost: number;            // terrain movement multiplier
  slots: number;               // building slots
}

export interface SeaZone {
  id: number; area: number; cx: number; cy: number;
  neighbors: number[]; coast: number[];
}

export interface MapData {
  kind: MapKind; seed: number; preset: PresetId | null; name: string;
  w: number; h: number;
  terrain: Uint8Array;
  regionOf: Int16Array;   // land tile -> region id, -1 for water
  seaOf: Int16Array;      // water tile -> sea zone id, -1 for land
  regions: Region[];
  seas: SeaZone[];
  landArea: number;
}

class Heap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop(): number {
    const k = this.k, v = this.v, top = v[0];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

const TERRAIN_DEF: Record<number, number> = { [T.Plains]: 1, [T.Forest]: 1.25, [T.Hills]: 1.4, [T.Mountain]: 1.8, [T.Desert]: 1.05, [T.Snow]: 1.2 };
const TERRAIN_MOVE: Record<number, number> = { [T.Plains]: 1, [T.Forest]: 1.3, [T.Hills]: 1.5, [T.Mountain]: 2.2, [T.Desert]: 1.25, [T.Snow]: 1.5 };

/** Seeds a Voronoi-like partition of tiles matching `accept`, grown with jittered Dijkstra for organic borders. */
function partition(w: number, h: number, accept: (i: number) => boolean, targetSize: number, rng: Rng, cost: (i: number) => number): Int16Array {
  const owner = new Int16Array(w * h).fill(-1);
  const cand: number[] = [];
  for (let i = 0; i < w * h; i++) if (accept(i)) cand.push(i);
  rng.shuffle(cand);
  const r = Math.sqrt(targetSize) * 0.92, cell = Math.max(1, Math.floor(r));
  const gw = Math.ceil(w / cell), grid = new Map<number, number[]>();
  const seeds: number[] = [];
  for (const i of cand) {
    const x = i % w, y = (i / w) | 0, gx = (x / cell) | 0, gy = (y / cell) | 0;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) {
      for (const s of grid.get((gy + dy) * gw + gx + dx) ?? []) {
        const sx = s % w, sy = (s / w) | 0;
        if ((sx - x) ** 2 + (sy - y) ** 2 < r * r) { ok = false; break; }
      }
    }
    if (!ok) continue;
    seeds.push(i);
    const key = gy * gw + gx; (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
  }
  const grow = (starts: number[], base: number) => {
    const heap = new Heap(), dist = new Map<number, number>();
    starts.forEach((s, k) => { owner[s] = base + k; heap.push(0, s); dist.set(s, 0); });
    while (heap.size) {
      const i = heap.pop(), d = dist.get(i)!;
      const x = i % w, y = (i / w) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (owner[j] >= 0 || !accept(j)) continue;
        owner[j] = owner[i];
        const nd = d + cost(j) * (0.7 + rng.next() * 0.6);
        dist.set(j, nd); heap.push(nd, j);
      }
    }
  };
  grow(seeds, 0);
  // Unreached pockets (islands without seeds) become their own regions.
  let next = seeds.length;
  for (const i of cand) if (owner[i] < 0) { grow([i], next); next++; }
  return owner;
}

function relabel(owner: Int16Array): number {
  const map = new Map<number, number>();
  for (let i = 0; i < owner.length; i++) {
    const o = owner[i]; if (o < 0) continue;
    let n = map.get(o); if (n === undefined) { n = map.size; map.set(o, n); }
    owner[i] = n;
  }
  return map.size;
}

/** Merges regions smaller than `min` tiles into their largest neighbour. */
function mergeSmall(owner: Int16Array, w: number, h: number, min: number) {
  const n = relabel(owner);
  const size = new Int32Array(n);
  for (let i = 0; i < owner.length; i++) if (owner[i] >= 0) size[owner[i]]++;
  const target = new Int32Array(n).map((_, k) => k);
  for (let i = 0; i < owner.length; i++) {
    const o = owner[i]; if (o < 0 || size[o] >= min) continue;
    const x = i % w, y = (i / w) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const p = owner[ny * w + nx];
      if (p >= 0 && p !== o && size[p] >= min && (target[o] === o || size[p] > size[target[o]])) target[o] = p;
    }
  }
  for (let i = 0; i < owner.length; i++) if (owner[i] >= 0) owner[i] = target[owner[i]];
  relabel(owner);
}

export interface MapOptions { kind: MapKind; seed: number; preset?: PresetId | null; regionTarget?: number }

export function buildMap(opts: MapOptions): MapData {
  const { kind, seed } = opts;
  const preset = kind === 'preset' ? (opts.preset ?? 'pangaea') : null;
  const gen = kind === 'earth' ? generateEarth(seed) : generateProcedural(seed, preset);
  const { w, h, terrain } = gen;
  const rng = new Rng(seed ^ 0x51ed);
  let landArea = 0;
  for (let i = 0; i < w * h; i++) if (isLand(terrain[i])) landArea++;
  const regionTarget = opts.regionTarget ?? Math.round(landArea / 19);
  const landSize = landArea / regionTarget;

  const regionOf = partition(w, h, i => isLand(terrain[i]), landSize, rng, i => TERRAIN_MOVE[terrain[i]] ?? 1);
  mergeSmall(regionOf, w, h, 4);
  const seaOf = partition(w, h, i => !isLand(terrain[i]), 150, rng, () => 1);
  mergeSmall(seaOf, w, h, 12);

  let nr = 0, ns = 0;
  for (let i = 0; i < w * h; i++) { nr = Math.max(nr, regionOf[i] + 1); ns = Math.max(ns, seaOf[i] + 1); }

  const regions: Region[] = Array.from({ length: nr }, (_, id) => ({
    id, tiles: [], area: 0, cx: 0, cy: 0, anchor: 0, terrain: T.Plains, forestShare: 0, hillShare: 0, flatShare: 0,
    neighbors: [], straits: [], seas: [], coastal: false, continent: -1, defense: 1, moveCost: 1, slots: 1,
  }));
  const seas: SeaZone[] = Array.from({ length: ns }, (_, id) => ({ id, area: 0, cx: 0, cy: 0, neighbors: [], coast: [] }));
  const rn = regions.map(() => new Set<number>()), rs = regions.map(() => new Set<number>()), sn = seas.map(() => new Set<number>());

  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i / w) | 0, r = regionOf[i], s = seaOf[i];
    if (r >= 0) { const R = regions[r]; R.tiles.push(i); R.cx += x; R.cy += y; }
    else if (s >= 0) { const S = seas[s]; S.area++; S.cx += x; S.cy += y; }
    for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
      if (nx >= w || ny >= h) continue;
      const j = ny * w + nx, r2 = regionOf[j], s2 = seaOf[j];
      if (r >= 0 && r2 >= 0 && r !== r2) { rn[r].add(r2); rn[r2].add(r); }
      if (s >= 0 && s2 >= 0 && s !== s2) { sn[s].add(s2); sn[s2].add(s); }
      if (r >= 0 && s2 >= 0) { rs[r].add(s2); seas[s2].coast.includes(r) || seas[s2].coast.push(r); }
      if (s >= 0 && r2 >= 0) { rs[r2].add(s); seas[s].coast.includes(r2) || seas[s].coast.push(r2); }
    }
  }
  // Short sea crossings (≤3 water tiles in a straight line) count as land links — Gibraltar, Bosphorus, Dover...
  const straits = regions.map(() => new Set<number>());
  for (let i = 0; i < w * h; i++) {
    const r = regionOf[i]; if (r < 0) continue;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      for (let k = 1; k <= 4; k++) {
        const nx = x + dx * k, ny = y + dy * k;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;
        const r2 = regionOf[ny * w + nx];
        if (r2 < 0) continue;
        if (k > 1 && r2 !== r && !rn[r].has(r2)) { straits[r].add(r2); straits[r2].add(r); }
        break;
      }
    }
  }
  for (const R of regions) {
    R.area = R.tiles.length; R.cx /= R.area; R.cy /= R.area;
    let best = Infinity, f = 0, hl = 0, fl = 0;
    const counts = new Map<number, number>();
    for (const t of R.tiles) {
      const x = t % w, y = (t / w) | 0, d = (x - R.cx) ** 2 + (y - R.cy) ** 2;
      if (d < best) { best = d; R.anchor = t; }
      const tt = terrain[t]; counts.set(tt, (counts.get(tt) ?? 0) + 1);
      if (tt === T.Forest) f++; else if (tt === T.Hills || tt === T.Mountain) hl++; else if (tt === T.Plains) fl++;
    }
    R.terrain = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] as T;
    R.forestShare = f / R.area; R.hillShare = hl / R.area; R.flatShare = fl / R.area;
    R.straits = [...straits[R.id]].filter(s => !rn[R.id].has(s));
    R.neighbors = [...rn[R.id], ...R.straits];
    R.seas = [...rs[R.id]];
    R.coastal = R.seas.length > 0;
    R.defense = TERRAIN_DEF[R.terrain] ?? 1;
    R.moveCost = TERRAIN_MOVE[R.terrain] ?? 1;
    R.slots = Math.min(4, 2 + Math.floor(R.area / 24));
  }
  for (const S of seas) { S.cx /= Math.max(1, S.area); S.cy /= Math.max(1, S.area); S.neighbors = [...sn[S.id]]; }
  // Continents = connected components over land links.
  let c = 0;
  for (const R of regions) {
    if (R.continent >= 0) continue;
    const stack = [R.id]; R.continent = c;
    while (stack.length) for (const n of regions[stack.pop()!].neighbors) if (regions[n].continent < 0) { regions[n].continent = c; stack.push(n); }
    c++;
  }
  const name = kind === 'earth' ? 'العالم الحقيقي' : kind === 'random' ? `عالم عشوائي #${seed}` : PRESETS.find(p => p.id === preset)!.name;
  return { kind, seed, preset, name, w, h, terrain, regionOf, seaOf, regions, seas, landArea };
}

export function regionDistance(map: MapData, a: number, b: number): number {
  const A = map.regions[a], B = map.regions[b];
  return Math.hypot(A.cx - B.cx, A.cy - B.cy);
}
