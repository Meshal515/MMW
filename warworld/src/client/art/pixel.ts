// Tiny pixel-art toolkit: ASCII sprites → canvases, palettes, and a shelf-packed texture atlas.

export const PAL: Record<string, string> = {
  k: '#1b1f24', x: '#0d0f12', d: '#3e434b', s: '#7d8088', S: '#aeb2ba', W: '#f4f1e8', w: '#e6dabd', v: '#c9b993',
  g: '#2f4a2a', G: '#4f7a3a', l: '#7fae4e', L: '#a7cf6a', h: '#5b6b3a', e: '#3d5c2f',
  b: '#5e3f24', B: '#8f6136', t: '#b5824b', z: '#dcc58e', Z: '#efdcaa',
  r: '#9c3a29', R: '#cf5a37', o: '#e07b28', y: '#e7c64c', Y: '#fff1a0', f: '#ff5a1f', F: '#ffd23f',
  u: '#2f5d9e', U: '#5b8fd6', c: '#a8dcef', C: '#dff4fb', n: '#37434f', N: '#9b917b', m: '#56677a', M: '#90a3b6',
  p: '#e3b48b', P: '#b9825e', q: '#d43c3c', Q: '#ff8a8a', a: '#6aa84f', i: '#2b2f6b', j: '#4a2f6b',
  T: '#ffffff', // team colour mask
};

export type Sprite = { w: number; h: number; rows: string[] };

export function sprite(rows: string[]): Sprite {
  const w = Math.max(...rows.map(r => r.length));
  return { w, h: rows.length, rows: rows.map(r => r.padEnd(w, '.')) };
}

export function mirror(s: Sprite): Sprite { return { ...s, rows: s.rows.map(r => [...r].reverse().join('')) }; }

const rgbCache = new Map<string, [number, number, number]>();
export function rgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) { const n = parseInt(hex.slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache.set(hex, c); }
  return c;
}

/** Draws an ASCII sprite. mode 'base' skips team pixels, 'team' draws only team pixels (white). */
export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, mode: 'all' | 'base' | 'team' = 'all', pal = PAL) {
  const img = ctx.getImageData(x, y, s.w, s.h);
  for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
    const ch = s.rows[j][i];
    if (ch === '.' || ch === ' ') continue;
    if (mode === 'base' && ch === 'T') continue;
    if (mode === 'team' && ch !== 'T') continue;
    const col = pal[ch]; if (!col) continue;
    const [r, g, b] = rgb(col);
    const k = (j * s.w + i) * 4;
    img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, x, y);
}

export function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

export function spriteCanvas(s: Sprite, mode: 'all' | 'base' | 'team' = 'all') {
  const { c, ctx } = canvasOf(s.w, s.h);
  drawSprite(ctx, s, 0, 0, mode);
  return c;
}

export function hasTeam(s: Sprite) { return s.rows.some(r => r.includes('T')); }

/** Shelf-packs canvases into one atlas; returns frame rectangles. */
export function packAtlas(items: { name: string; c: HTMLCanvasElement }[], width = 1024) {
  const sorted = [...items].sort((a, b) => b.c.height - a.c.height);
  let x = 1, y = 1, rowH = 0;
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const it of sorted) {
    if (x + it.c.width + 1 > width) { x = 1; y += rowH + 2; rowH = 0; }
    frames[it.name] = { x, y, w: it.c.width, h: it.c.height };
    x += it.c.width + 2; rowH = Math.max(rowH, it.c.height);
  }
  const height = Math.pow(2, Math.ceil(Math.log2(y + rowH + 2)));
  const { c, ctx } = canvasOf(width, height);
  for (const it of items) { const f = frames[it.name]; ctx.drawImage(it.c, f.x, f.y); }
  return { canvas: c, frames };
}

export function toDataURL(c: HTMLCanvasElement, scale = 1) {
  if (scale === 1) return c.toDataURL();
  const { c: big, ctx } = canvasOf(c.width * scale, c.height * scale);
  ctx.drawImage(c, 0, 0, big.width, big.height);
  return big.toDataURL();
}

export function hexColor(n: number) { return '#' + n.toString(16).padStart(6, '0'); }
