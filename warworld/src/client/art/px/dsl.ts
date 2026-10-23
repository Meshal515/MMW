// Pixel DSL: draw sprites pixel-by-pixel at their final size with integer geometry, then apply
// edge lighting (top-left light), an outer outline, and export RGBA. Every pixel is deliberate.

export type C3 = [number, number, number];
const hex = (h: string): C3 => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/** Ramps: each character belongs to one ramp; bevel moves along the ramp. */
const RAMPS: Record<string, string[]> = {
  grey: ['1', '2', '3', '4', '5'],
  stealth: ['6', '7', '8', '9', '0'],
  olive: ['a', 'b', 'c', 'd', 'e'],
  tan: ['m', 'n', 'o', 'p', 'q'],
  deck: ['v', 'w', 'x', 'u'],
  glass: ['g', 'h', 'i'],
  red: ['r', 's'],
  yellow: ['y', 'z'],
  team: ['U', 'T'],
  flame: ['F', 'f'],
  roof: ['M', 'N', 'O', 'P'],
  conc: ['Q', 'S', 'V', 'X', 'Y'],
  lawn: ['H', 'G'],
  teal: ['B', 'I'],
};
export const COLORS: Record<string, C3> = {
  '1': hex('#2c3140'), '2': hex('#4d5568'), '3': hex('#78839a'), '4': hex('#a9b4c6'), '5': hex('#d9e0ea'),
  '6': hex('#23262e'), '7': hex('#363b47'), '8': hex('#4c5361'), '9': hex('#677082'), '0': hex('#8a93a4'),
  a: hex('#28331d'), b: hex('#3f5129'), c: hex('#5e7539'), d: hex('#82994c'), e: hex('#a9bb6c'),
  m: hex('#4a3a28'), n: hex('#735a3c'), o: hex('#9c7e54'), p: hex('#c2a474'), q: hex('#e2cc9a'),
  v: hex('#262a33'), w: hex('#353b47'), x: hex('#484f5e'), u: hex('#5d6575'),
  g: hex('#1f3550'), h: hex('#3d6a96'), i: hex('#8cc4ea'),
  r: hex('#b03a32'), s: hex('#e0604a'), y: hex('#b08a2a'), z: hex('#e8c547'),
  W: hex('#f2f4f6'), K: hex('#121118'), F: hex('#ff9b2e'), f: hex('#ffe08a'),
  C: hex('#c4573a'), D: hex('#3f7cae'), E: hex('#d6a63a'), J: hex('#5a9a5a'), L: hex('#8a5aa8'),
  k: hex('#1d1626'),
  M: hex('#6e2f27'), N: hex('#97443a'), O: hex('#bd6249'), P: hex('#dc8a63'),
  Q: hex('#56545c'), S: hex('#77747a'), V: hex('#999590'), X: hex('#bab5ab'), Y: hex('#dbd6c9'),
  H: hex('#4b7f32'), G: hex('#65a043'), B: hex('#2f6f78'), I: hex('#4f9aa0'),
  A: hex('#34353d'), Z: hex('#e9e3c6'), R: hex('#5b6170'),
  // team mask tones (tinted at runtime)
  T: [255, 255, 255], U: [165, 165, 172],
};
const RAMP_OF: Record<string, { r: string[]; i: number }> = {};
for (const r of Object.values(RAMPS)) r.forEach((c, i) => { RAMP_OF[c] = { r, i }; });

export class Pix {
  g: string[][];
  noBevel = new Set<string>();
  constructor(public w: number, public h: number) { this.g = Array.from({ length: h }, () => Array(w).fill('.')); }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? '.' : this.g[y][x]; }
  px(x: number, y: number, c: string) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = c; return this; }
  hl(y: number, x0: number, x1: number, c: string) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, c); return this; }
  vl(x: number, y0: number, y1: number, c: string) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.px(x, y, c); return this; }
  rect(x0: number, y0: number, x1: number, y1: number, c: string) { for (let y = y0; y <= y1; y++) this.hl(y, x0, x1, c); return this; }
  /** Fills a polygon by pixel-centre inclusion. */
  poly(pts: [number, number][], c: string) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const X = x + 0.5, Y = y + 0.5; let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > Y) !== (yj > Y) && X < (xj - xi) * (Y - yi) / (yj - yi) + xi) ins = !ins;
      }
      if (ins) this.g[y][x] = c;
    }
    return this;
  }
  ell(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.g[y][x] = c;
    return this;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) this.px(x0 + (x1 - x0) * i / Math.max(1, n), y0 + (y1 - y0) * i / Math.max(1, n), c);
    return this;
  }
  /** Mirrors rows above row `c` onto the rows below it (symmetric vehicles). */
  mirror(c: number) { for (let y = 0; y < c; y++) { const t = 2 * c - y; if (t < this.h) this.g[t] = [...this.g[y]]; } return this; }
  /** Replace every `a` with `b` inside a rectangle. */
  swap(a: string, b: string, x0 = 0, y0 = 0, x1 = this.w - 1, y1 = this.h - 1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.g[y][x] === a) this.g[y][x] = b; return this; }

  /** Edge lighting: silhouette edges facing the top-left get lighter, bottom-right darker. */
  bevel() {
    const src = this.g.map(r => [...r]);
    const empty = (x: number, y: number) => x < 0 || y < 0 || x >= this.w || y >= this.h || src[y][x] === '.';
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const ch = src[y][x], rp = RAMP_OF[ch];
      if (!rp || this.noBevel.has(ch)) continue;
      let d = 0;
      if (empty(x, y - 1) || empty(x - 1, y)) d++;
      if (empty(x, y + 1) || empty(x + 1, y)) d--;
      if (d) this.g[y][x] = rp.r[Math.max(0, Math.min(rp.r.length - 1, rp.i + d))];
    }
    return this;
  }
  /** One-pixel outline around the silhouette (grows the sprite by the outline). */
  outline() {
    const src = this.g.map(r => [...r]);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y][x] !== '.') continue;
      const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < this.w && yy < this.h && src[yy][xx] !== '.';
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) this.g[y][x] = 'k';
    }
    return this;
  }
  finish() { return this.bevel().outline(); }

  /** RGBA image; team pixels go to a separate mask image. */
  toImages(): { base: ImageData; team: ImageData | null } {
    const base = new ImageData(this.w, this.h);
    let team: ImageData | null = null;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const ch = this.g[y][x]; if (ch === '.') continue;
      const c = COLORS[ch]; if (!c) continue;
      const k = (y * this.w + x) * 4;
      if (ch === 'T' || ch === 'U') { team ??= new ImageData(this.w, this.h); team.data.set([c[0], c[1], c[2], 255], k); }
      else base.data.set([c[0], c[1], c[2], 255], k);
    }
    return { base, team };
  }
  /** Single RGBA with team pixels shown in a given colour (for galleries/icons). */
  toImage(teamColor: C3 = [61, 123, 255]) {
    const img = new ImageData(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const ch = this.g[y][x]; if (ch === '.') continue;
      let c = COLORS[ch]; if (!c) continue;
      if (ch === 'T' || ch === 'U') c = c.map((v, i) => v * teamColor[i] / 255) as C3;
      img.data.set([c[0], c[1], c[2], 255], (y * this.w + x) * 4);
    }
    return img;
  }
}
