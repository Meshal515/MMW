// Procedural modern cities in the game's pixel style (16 px per map tile).
// Layout: avenues + street grid clipped to buildable land, blocks zoned by distance from the
// centre (downtown towers → offices/apartments → houses and parks), buildings drawn with roofs,
// visible south facades and cast shadows toward the bottom-right. Deterministic per seed.

type C = [number, number, number];
const hex = (h: string): C => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const COL = {
  avenue: hex('#45414b'), street: hex('#55515a'), sidewalk: hex('#a9a39b'), curb: hex('#7f7a75'), dash: hex('#d9cf8a'), cross: hex('#d8d6d0'),
  outline: hex('#251d2d'), plaza: hex('#c8bea6'), plaza2: hex('#b4aa92'),
  park: [hex('#4f8438'), hex('#62973f')], tree: [hex('#24432c'), hex('#356138'), hex('#4c7f40'), hex('#68a04c')],
  roofs: {
    terracotta: [hex('#7c3527'), hex('#a5482f'), hex('#c45e3a'), hex('#d97a4e')],
    slate: [hex('#3b4150'), hex('#4f5868'), hex('#66717f'), hex('#7f8b98')],
    concrete: [hex('#7f7a72'), hex('#9a958c'), hex('#b6b1a7'), hex('#cfcac0')],
    white: [hex('#a9a7a6'), hex('#c9c8c4'), hex('#e2e1dc'), hex('#f2f1ec')],
    glass: [hex('#2c4766'), hex('#3d6189'), hex('#5582ad'), hex('#7eaacf')],
    dark: [hex('#2f2f38'), hex('#3f3f4a'), hex('#53535f'), hex('#6c6c78')],
  },
  walls: {
    brick: [hex('#7d4433'), hex('#985540'), hex('#e3d6ae')],
    concrete: [hex('#7a756d'), hex('#938e85'), hex('#c9d8e0')],
    glass: [hex('#2f4d70'), hex('#3f6690'), hex('#a6d0ec')],
    white: [hex('#9d9b97'), hex('#bebcb7'), hex('#8fb6d4')],
  },
  dome: [hex('#6b5a2a'), hex('#a88c3a'), hex('#d9b84c'), hex('#f2dc7a')],
};

export interface CitySpec { seed: number; level: number; capital: boolean; buildable: (x: number, y: number) => boolean }
export interface CityArt { canvas: HTMLCanvasElement; size: number; roads: [number, number, number][]; capitalAt: [number, number] | null }

function rngOf(seed: number) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5 | 0) >>> 0) / 4294967296; }

export const CITY_SIZE = [0, 48, 76, 108];

export function renderCity(spec: CitySpec): CityArt {
  const lvl = Math.max(1, Math.min(3, spec.level));
  const S = CITY_SIZE[lvl] + (spec.capital ? 16 : 0);
  const R = S / 2 - 4;
  const rnd = rngOf(spec.seed * 7919 + lvl * 104729);
  const img = new ImageData(S, S), d = img.data;
  const H = new Float32Array(S * S);           // building heights (0 = ground)
  const kind = new Uint8Array(S * S);           // 1 road, 2 sidewalk, 3 lot/park, 4 building
  const c0 = S / 2;
  const edgeNoise = (x: number, y: number) => Math.sin(x * 0.31 + spec.seed) * 3 + Math.cos(y * 0.27 + spec.seed * 2) * 3;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && Math.hypot(x - c0, y - c0) < R + edgeNoise(x, y) && spec.buildable(x, y);
  const put = (x: number, y: number, c: C, a = 255) => { if (x < 0 || y < 0 || x >= S || y >= S) return; const k = (y * S + x) * 4; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = a; };

  // ---- road network ----
  const spacing = lvl === 3 ? 21 : lvl === 2 ? 18 : 16;
  const roads: [number, number, number][] = [];
  const lines: { pos: number; w: number; horiz: boolean; avenue: boolean }[] = [];
  for (let k = -6; k <= 6; k++) {
    const pos = Math.round(c0 + k * spacing + (k ? Math.round((rnd() - 0.5) * 3) : 0));
    if (pos < 2 || pos > S - 3) continue;
    const avenue = k === 0;
    lines.push({ pos, w: avenue ? 5 : 3, horiz: true, avenue }, { pos, w: avenue ? 5 : 3, horiz: false, avenue });
  }
  for (const L of lines) {
    for (let t = 0; t < S; t++) for (let o = -1 - (L.w >> 1); o <= (L.w >> 1) + 1; o++) {
      const x = L.horiz ? t : L.pos + o, y = L.horiz ? L.pos + o : t;
      if (!inside(x, y)) continue;
      const k = y * S + x;
      const side = Math.abs(o) === (L.w >> 1) + 1;
      if (side) { if (kind[k] !== 1) { kind[k] = 2; put(x, y, COL.sidewalk); } continue; }
      kind[k] = 1;
      let c = L.avenue ? COL.avenue : COL.street;
      if (L.avenue && o === 0 && (t >> 2) % 2 === 0) c = COL.dash;
      put(x, y, c);
      if (o === 0 && t % 3 === 0) roads.push([x, y, L.horiz ? 1 : 0]);
    }
  }
  // zebra crossings at avenue intersections
  for (const a of lines.filter(l => l.avenue && l.horiz)) for (const b of lines.filter(l => !l.horiz)) {
    for (let o = -2; o <= 2; o++) for (const dd of [-4, 4]) {
      const x = b.pos + dd, y = a.pos + o;
      if (inside(x, y) && kind[y * S + x] === 1 && (o & 1) === 0) put(x, y, COL.cross);
    }
  }

  // ---- blocks ----
  const xs = [...new Set(lines.filter(l => !l.horiz).map(l => l.pos))].sort((a, b) => a - b);
  const ys = [...new Set(lines.filter(l => l.horiz).map(l => l.pos))].sort((a, b) => a - b);
  const blocks: { x: number; y: number; w: number; h: number }[] = [];
  const edgesX = [0, ...xs, S], edgesY = [0, ...ys, S];
  for (let i = 0; i + 1 < edgesX.length; i++) for (let j = 0; j + 1 < edgesY.length; j++) {
    const x0 = edgesX[i] + (i > 0 ? 4 : 1), x1 = edgesX[i + 1] - (i + 1 < edgesX.length - 1 ? 4 : 1);
    const y0 = edgesY[j] + (j > 0 ? 4 : 1), y1 = edgesY[j + 1] - (j + 1 < edgesY.length - 1 ? 4 : 1);
    if (x1 - x0 >= 5 && y1 - y0 >= 5) blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  const buildings: { x: number; y: number; w: number; h: number; H: number; style: string }[] = [];
  let capitalAt: [number, number] | null = null;
  const fits = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (!inside(xx, yy) || kind[yy * S + xx] === 1 || kind[yy * S + xx] === 2) return false;
    return true;
  };
  for (const b of blocks) {
    const bc = Math.hypot(b.x + b.w / 2 - c0, b.y + b.h / 2 - c0) / R;
    if (spec.capital && !capitalAt && bc < 0.4 && b.w >= 11 && b.h >= 11) {
      capitalAt = [b.x + b.w / 2, b.y + b.h / 2];
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inside(x, y)) { kind[y * S + x] = 3; put(x, y, ((x + y) & 1) ? COL.plaza : COL.plaza2); }
      const pw = Math.min(b.w - 2, 18), ph = Math.min(b.h - 2, 14);
      buildings.push({ x: Math.round(b.x + (b.w - pw) / 2), y: Math.round(b.y + (b.h - ph) / 2 + 2), w: pw, h: ph, H: 7, style: 'palace' });
      continue;
    }
    // parks on the outskirts, sometimes downtown
    if (rnd() < (bc > 0.7 ? 0.22 : 0.08)) {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inside(x, y)) { kind[y * S + x] = 3; put(x, y, COL.park[(x * 7 + y * 3) % 5 === 0 ? 1 : 0]); }
      for (let t = 0; t < (b.w * b.h) / 18; t++) treeAt(b.x + 1 + Math.floor(rnd() * (b.w - 2)), b.y + 1 + Math.floor(rnd() * (b.h - 2)));
      continue;
    }
    // fill the whole block with lots for its zone
    const zone = lvl === 3 && bc < 0.45 ? 'tower' : lvl >= 2 && bc < (lvl === 3 ? 0.8 : 0.62) ? 'mid' : 'house';
    const paved = zone !== 'house';
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inside(x, y)) {
      kind[y * S + x] = 3;
      put(x, y, paved ? (((x * 5 + y * 3) % 11) === 0 ? COL.plaza2 : COL.plaza) : COL.park[((x * 7 + y * 3) % 9) === 0 ? 1 : 0]);
    }
    const nx = zone === 'tower' ? (b.w >= 15 && rnd() < 0.5 ? 2 : 1) : zone === 'mid' ? Math.max(1, Math.floor((b.w + 1) / 7)) : Math.max(1, Math.floor((b.w + 1) / 6));
    const ny = zone === 'tower' ? (b.h >= 15 && rnd() < 0.5 ? 2 : 1) : zone === 'mid' ? Math.max(1, Math.floor((b.h + 1) / 7)) : Math.max(1, Math.floor((b.h + 1) / 6));
    const gap = zone === 'house' ? 1 : 1;
    const lw = Math.floor((b.w - gap * (nx - 1)) / nx), lh = Math.floor((b.h - gap * (ny - 1)) / ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let x = b.x + i * (lw + gap), y = b.y + j * (lh + gap), w = lw, h = lh;
      if (zone === 'house') { x += 1; y += 1; w -= 1; h -= 1; }
      if (zone === 'tower') { x += 1; w -= 1; }
      if (w < 3 || h < 3 || !fits(x, y, w, h)) continue;
      const r = rnd();
      if (zone === 'tower') buildings.push({ x, y, w, h, H: 16 + Math.floor(r * 14), style: r < 0.5 ? 'glass' : r < 0.8 ? 'dark' : 'concrete' });
      else if (zone === 'mid') buildings.push({ x, y, w, h, H: 6 + Math.floor(r * 7), style: r < 0.35 ? 'concrete' : r < 0.6 ? 'white' : r < 0.82 ? 'glass' : 'brick' });
      else if (r < 0.9) buildings.push({ x, y, w, h, H: 2, style: r < 0.55 ? 'terracotta' : r < 0.8 ? 'slate' : 'whitehouse' });
      else treeAt(x + w / 2, y + h / 2);
    }
  }
  // street trees along avenues
  for (const L of lines.filter(l => l.avenue)) for (let t = 3; t < S; t += 7) {
    const x = L.horiz ? t : L.pos + 4, y = L.horiz ? L.pos + 4 : t;
    if (inside(x, y) && kind[y * S + x] !== 1 && kind[y * S + x] !== 4) treeAt(x, y, true);
  }

  // ---- buildings: draw north to south so southern ones overlap correctly ----
  buildings.sort((a, b) => a.y + a.h - (b.y + b.h));
  for (const b of buildings) drawBuilding(b);

  // ---- cast shadows onto ground pixels ----
  const shade = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const h = H[y * S + x]; if (h <= 0) continue;
    const len = Math.round(h * 0.5);
    for (let i = 1; i <= len; i++) { const xx = x + i, yy = y + Math.round(i * 0.6); if (xx >= S || yy >= S) break; if (H[yy * S + xx] <= 0) shade[yy * S + xx] = 1; }
  }
  for (let k = 0; k < S * S; k++) if (shade[k]) {
    if (d[k * 4 + 3] === 0) { d[k * 4] = 40; d[k * 4 + 1] = 28; d[k * 4 + 2] = 58; d[k * 4 + 3] = 95; }
    else { d[k * 4] = d[k * 4] * 0.62 + 12; d[k * 4 + 1] = d[k * 4 + 1] * 0.6 + 6; d[k * 4 + 2] = d[k * 4 + 2] * 0.66 + 22; }
  }
  // ---- outline around buildings ----
  const out: number[] = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (kind[y * S + x] === 4) continue;
    const nb = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < S && yy < S && kind[yy * S + xx] === 4;
    if (nb(x - 1, y) || nb(x + 1, y) || nb(x, y - 1) || nb(x, y + 1)) out.push(y * S + x);
  }
  for (const k of out) { d[k * 4] = COL.outline[0]; d[k * 4 + 1] = COL.outline[1]; d[k * 4 + 2] = COL.outline[2]; d[k * 4 + 3] = 255; }

  const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
  canvas.getContext('2d')!.putImageData(img, 0, 0);
  return { canvas, size: S, roads, capitalAt };

  function treeAt(x: number, y: number, small = false) {
    const r = small ? 1.6 : 2.2 + rnd();
    for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
      const dx = xx - x, dy = yy - y, dd = Math.hypot(dx, dy);
      if (dd > r || !inside(xx, yy) || kind[yy * S + xx] === 1 || kind[yy * S + xx] === 4) continue;
      const lit = (-dx - dy) / (r * 1.5) - dd / r * 0.3;
      put(xx, yy, COL.tree[dd > r - 0.8 ? 0 : lit > 0.3 ? 3 : lit > -0.1 ? 2 : 1]);
      H[yy * S + xx] = Math.max(H[yy * S + xx], 1.5);
    }
  }

  function drawBuilding(b: { x: number; y: number; w: number; h: number; H: number; style: string }) {
    const off = b.H >= 5 ? Math.min(b.h - 2, Math.round(b.H * 0.36)) : 0;  // how much of the south facade shows
    const roofKey = b.style === 'brick' ? 'terracotta' : b.style === 'whitehouse' ? 'white' : b.style === 'palace' ? 'white' : b.style as keyof typeof COL.roofs;
    const roof = COL.roofs[roofKey] ?? COL.roofs.concrete;
    const wallKey = b.style === 'glass' || b.style === 'dark' ? 'glass' : b.style === 'brick' ? 'brick' : b.style === 'white' || b.style === 'palace' ? 'white' : 'concrete';
    const wall = COL.walls[wallKey as keyof typeof COL.walls];
    const roofTop = b.y - off;
    for (let y = roofTop; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
      if (x < 0 || y < 0 || x >= S || y >= S) continue;
      const k = y * S + x;
      const ry = y - roofTop, rx = x - b.x, rh = b.h - off;
      let c: C;
      if (ry < rh) {
        // roof
        if (b.style === 'terracotta' || b.style === 'slate') {
          const horizRidge = b.w >= b.h;
          const half = horizRidge ? ry < rh / 2 : rx < b.w / 2;
          c = roof[half ? 3 : 1];
          if (horizRidge ? Math.abs(ry - rh / 2 + 0.5) < 0.6 : Math.abs(rx - b.w / 2 + 0.5) < 0.6) c = roof[3];
          if (ry === rh - 1) c = roof[0];
        } else {
          const edge = rx === 0 || ry === 0 || rx === b.w - 1 || ry === rh - 1;
          c = edge ? roof[ry === 0 || rx === 0 ? 3 : 1] : roof[2];
          if (b.style === 'glass' && !edge && (rx % 3 === 0 || ry % 3 === 0)) c = roof[3];
          if ((b.style === 'concrete' || b.style === 'white') && !edge && ((rx * 13 + ry * 7 + b.x) % 17 === 0)) c = roof[0]; // AC units
          if (b.style === 'dark' && !edge && rx === (b.w >> 1) && ry === (rh >> 1)) c = hex('#d24a3c'); // aviation light
        }
        if (b.style === 'palace') {
          const dx = rx - b.w / 2 + 0.5, dy = ry - rh / 2 + 0.5, dd = Math.hypot(dx, dy * 1.2);
          if (dd < Math.min(b.w, rh) * 0.42) { const lit = (-dx - dy) / 4; c = COL.dome[dd > Math.min(b.w, rh) * 0.38 ? 0 : lit > 0.4 ? 3 : lit > -0.2 ? 2 : 1]; }
        }
      } else {
        // south facade with window rows
        const fy = ry - rh;
        c = wall[1];
        if (fy === off - 1) c = wall[0];
        else if (rx > 0 && rx < b.w - 1 && fy % 2 === 0 && rx % 2 === 1) c = wall[2];
        if (rx === 0) c = wall[0];
      }
      put(x, y, c);
      kind[k] = 4; H[k] = b.H;
    }
  }
}
