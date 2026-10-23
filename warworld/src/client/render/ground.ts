// Ground rendering with level of detail:
//   far  — one 4 px/tile base texture of the whole world + political overlay
//   mid  — 8 px/tile chunks painted on demand by workers
//   near — 16 px/tile chunks + crisp per-chunk borders that follow the painted coastlines
import Phaser from 'phaser';
import type { Game } from '../../sim/game';

export const TILE = 16;
const BASE_PPT = 4;
const TIERS = { mid: { ppt: 8, tiles: 64 }, near: { ppt: 16, tiles: 32 } } as const;
type Tier = keyof typeof TIERS;

interface Job { id: number; x0: number; y0: number; w: number; h: number; ppt: number; regions: boolean; resolve: (r: { w: number; h: number; data: Uint8ClampedArray; regions: Int16Array | null }) => void }
interface Chunk { key: string; tier: Tier; cx: number; cy: number; img: Phaser.GameObjects.Image | null; regions: Int16Array | null; borders: Phaser.GameObjects.Image | null; bordersDirty: boolean; used: number; pending: boolean }

export class Ground {
  private workers: Worker[] = [];
  private busy: number[] = [];
  private queue: Job[] = [];
  private jobs = new Map<number, Job>();
  private nextJob = 1;
  private chunks = new Map<string, Chunk>();
  private colors: [number, number, number][];
  private ovCanvas!: HTMLCanvasElement;
  private ovCtx!: CanvasRenderingContext2D;
  private ovRegion: Int16Array | null = null;
  private ovTex: Phaser.Textures.CanvasTexture | null = null;
  overlay: Phaser.GameObjects.Image | null = null;
  base: Phaser.GameObjects.Image | null = null;
  ready = false;
  private regionBox: [number, number, number, number][];
  private dirty = new Set<number>();
  private lastOv = 0;

  constructor(private scene: Phaser.Scene, private g: Game) {
    const map = g.map;
    this.colors = g.nations.map(n => [(n.color >> 16) & 255, (n.color >> 8) & 255, n.color & 255]);
    this.regionBox = map.regions.map(R => {
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (const t of R.tiles) { const x = t % map.w, y = (t / map.w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return [x0 - 2, y0 - 2, x1 + 3, y1 + 3];
    });
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./paint.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = e => this.onMessage(i, e.data);
      w.postMessage({ type: 'init', terrain: map.terrain, regionOf: map.regionOf, w: map.w, h: map.h });
      this.workers.push(w); this.busy.push(0);
    }
  }

  destroy() { for (const w of this.workers) w.terminate(); }

  private onMessage(i: number, m: any) {
    if (m.type === 'ready') { this.pump(); return; }
    if (m.type !== 'done') return;
    this.busy[i]--;
    const job = this.jobs.get(m.id);
    this.jobs.delete(m.id);
    job?.resolve({ w: m.w, h: m.h, data: new Uint8ClampedArray(m.buf), regions: m.regions ? new Int16Array(m.regions) : null });
    this.pump();
  }

  private pump() {
    for (let i = 0; i < this.workers.length; i++) {
      while (this.busy[i] < 2 && this.queue.length) {
        const j = this.queue.shift()!;
        this.jobs.set(j.id, j);
        this.busy[i]++;
        this.workers[i].postMessage({ type: 'paint', id: j.id, x0: j.x0, y0: j.y0, w: j.w, h: j.h, ppt: j.ppt, regions: j.regions });
      }
    }
  }

  private paint(x0: number, y0: number, w: number, h: number, ppt: number, regions: boolean, front = false) {
    return new Promise<{ w: number; h: number; data: Uint8ClampedArray; regions: Int16Array | null }>(resolve => {
      const job: Job = { id: this.nextJob++, x0, y0, w, h, ppt, regions, resolve };
      if (front) this.queue.unshift(job); else this.queue.push(job);
      this.pump();
    });
  }

  /** Paints the whole-world base texture (and the overlay region map) in horizontal strips. */
  async init(onProgress?: (f: number) => void) {
    const map = this.g.map;
    const W = map.w * BASE_PPT, H = map.h * BASE_PPT;
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    this.ovRegion = new Int16Array(W * H);
    const strips = 16, sh = map.h / strips;
    let done = 0;
    await Promise.all(Array.from({ length: strips }, (_, s) => this.paint(0, s * sh, map.w, sh, BASE_PPT, true).then(r => {
      ctx.putImageData(new ImageData(r.data as any, r.w, r.h), 0, Math.round(s * sh * BASE_PPT));
      this.ovRegion!.set(r.regions!, Math.round(s * sh * BASE_PPT) * W);
      onProgress?.(++done / strips);
    })));
    this.scene.textures.addCanvas('ground_base', canvas);
    this.base = this.scene.add.image(0, 0, 'ground_base').setOrigin(0).setScale(TILE / BASE_PPT).setDepth(0);
    this.ovCanvas = document.createElement('canvas'); this.ovCanvas.width = W; this.ovCanvas.height = H;
    this.ovCtx = this.ovCanvas.getContext('2d')!;
    this.drawOverlayRect(0, 0, W, H);
    this.ovTex = this.scene.textures.addCanvas('ground_overlay', this.ovCanvas)!;
    this.overlay = this.scene.add.image(0, 0, 'ground_overlay').setOrigin(0).setScale(TILE / BASE_PPT).setDepth(3);
    this.ready = true;
  }

  markDirty(r: number) { this.dirty.add(r); }

  private drawOverlayRect(x0: number, y0: number, x1: number, y1: number) {
    const map = this.g.map, W = map.w * BASE_PPT, H = map.h * BASE_PPT, reg = this.ovRegion!, owner = this.g.owner;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const img = this.ovCtx.createImageData(w, h), d = img.data;
    const own = (x: number, y: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return -3; const r = reg[y * W + x]; return r < 0 ? -2 : owner[r]; };
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const r = reg[y * W + x]; if (r < 0) continue;
      const o = owner[r]; const k = ((y - y0) * w + (x - x0)) * 4;
      const border = own(x - 1, y) !== o || own(x + 1, y) !== o || own(x, y - 1) !== o || own(x, y + 1) !== o;
      if (o < 0) {
        // faint region outlines on unclaimed land
        const rb = reg[y * W + x + 1] !== r && x + 1 < W && reg[y * W + x + 1] >= 0 || (y + 1 < H && reg[(y + 1) * W + x] !== r && reg[(y + 1) * W + x] >= 0);
        if (rb) { d[k] = 30; d[k + 1] = 26; d[k + 2] = 40; d[k + 3] = 40; }
        continue;
      }
      const c = this.colors[o];
      if (border) { d[k] = Math.min(255, c[0] * 0.55 + 115); d[k + 1] = Math.min(255, c[1] * 0.55 + 115); d[k + 2] = Math.min(255, c[2] * 0.55 + 115); d[k + 3] = 245; }
      else {
        const rb = (x + 1 < W && reg[y * W + x + 1] !== r && reg[y * W + x + 1] >= 0) || (y + 1 < H && reg[(y + 1) * W + x] !== r && reg[(y + 1) * W + x] >= 0);
        d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = rb ? 120 : 92;
        if (rb) { d[k] *= 0.85; d[k + 1] *= 0.85; d[k + 2] *= 0.85; }
      }
      if (this.g.radiation[r] > 0 && ((x + y) % 5) < 2) { d[k] = 175; d[k + 1] = 235; d[k + 2] = 50; d[k + 3] = 170; }
    }
    this.ovCtx.putImageData(img, x0, y0);
  }

  /** Called every frame: refreshes overlays and keeps the right chunk tier painted around the camera. */
  update(view: { x0: number; y0: number; x1: number; y1: number }, zoom: number, now: number) {
    if (!this.ready) return;
    if (this.dirty.size && now - this.lastOv > 150) {
      this.lastOv = now;
      let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
      for (const r of this.dirty) {
        const b = this.regionBox[r];
        bx0 = Math.min(bx0, b[0]); by0 = Math.min(by0, b[1]); bx1 = Math.max(bx1, b[2]); by1 = Math.max(by1, b[3]);
        for (const c of this.chunks.values()) if (c.tier === 'near' && c.borders) {
          const t = TIERS.near.tiles;
          if (b[2] >= c.cx * t && b[0] <= (c.cx + 1) * t && b[3] >= c.cy * t && b[1] <= (c.cy + 1) * t) c.bordersDirty = true;
        }
      }
      this.dirty.clear();
      if ((bx1 - bx0) * (by1 - by0) > 6000) this.drawOverlayRect(0, 0, this.g.map.w * BASE_PPT, this.g.map.h * BASE_PPT);
      else this.drawOverlayRect(bx0 * BASE_PPT, by0 * BASE_PPT, bx1 * BASE_PPT, by1 * BASE_PPT);
      this.ovTex!.refresh();
    }
    const tier: Tier | null = zoom >= 1.5 ? 'near' : zoom >= 0.5 ? 'mid' : null;
    this.overlay!.setVisible(tier !== 'near').setAlpha(tier === 'mid' ? 0.72 : 1);
    for (const c of this.chunks.values()) { c.img?.setVisible(false); c.borders?.setVisible(false); }
    if (!tier) return;
    const { ppt, tiles } = TIERS[tier];
    const span = tiles * TILE;
    const cx0 = Math.max(0, Math.floor(view.x0 / span)), cy0 = Math.max(0, Math.floor(view.y0 / span));
    const cx1 = Math.min(Math.ceil(this.g.map.w / tiles) - 1, Math.floor(view.x1 / span)), cy1 = Math.min(Math.ceil(this.g.map.h / tiles) - 1, Math.floor(view.y1 / span));
    const mx = (view.x0 + view.x1) / 2, my = (view.y0 + view.y1) / 2;
    const want: Chunk[] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = `${tier}_${cx}_${cy}`;
      let c = this.chunks.get(key);
      if (!c) { c = { key, tier, cx, cy, img: null, regions: null, borders: null, bordersDirty: true, used: now, pending: false }; this.chunks.set(key, c); }
      c.used = now;
      want.push(c);
    }
    want.sort((a, b) => Math.hypot((a.cx + 0.5) * span - mx, (a.cy + 0.5) * span - my) - Math.hypot((b.cx + 0.5) * span - mx, (b.cy + 0.5) * span - my));
    for (const c of want) {
      if (c.img) { c.img.setVisible(true); if (tier === 'near') this.syncBorders(c); continue; }
      if (c.pending) continue;
      c.pending = true;
      const x0 = c.cx * tiles, y0 = c.cy * tiles, w = Math.min(tiles, this.g.map.w - x0), h = Math.min(tiles, this.g.map.h - y0);
      this.paint(x0, y0, w, h, ppt, tier === 'near', true).then(r => {
        if (!this.chunks.has(c.key)) return;
        const cv = document.createElement('canvas'); cv.width = r.w; cv.height = r.h;
        cv.getContext('2d')!.putImageData(new ImageData(r.data as any, r.w, r.h), 0, 0);
        this.scene.textures.addCanvas('gc_' + c.key, cv);
        c.img = this.scene.add.image(x0 * TILE, y0 * TILE, 'gc_' + c.key).setOrigin(0).setScale(TILE / ppt).setDepth(1).setVisible(false);
        c.regions = r.regions;
        c.pending = false;
      });
    }
    // evict least recently used chunks
    if (this.chunks.size > 90) {
      const old = [...this.chunks.values()].filter(c => !c.pending).sort((a, b) => a.used - b.used).slice(0, this.chunks.size - 70);
      for (const c of old) {
        c.img?.destroy(); c.borders?.destroy();
        if (this.scene.textures.exists('gc_' + c.key)) this.scene.textures.remove('gc_' + c.key);
        if (this.scene.textures.exists('gb_' + c.key)) this.scene.textures.remove('gb_' + c.key);
        this.chunks.delete(c.key);
      }
    }
  }

  /** Thin, crisp national borders for a near chunk (2 px line + soft tint). */
  private syncBorders(c: Chunk) {
    if (!c.regions || !c.img) return;
    if (c.borders && !c.bordersDirty) { c.borders.setVisible(true); return; }
    const W = c.img.width, H = c.img.height, reg = c.regions, owner = this.g.owner;
    const key = 'gb_' + c.key;
    let tex = this.scene.textures.exists(key) ? this.scene.textures.get(key) as Phaser.Textures.CanvasTexture : null;
    if (!tex) tex = this.scene.textures.createCanvas(key, W, H)!;
    const ctx = tex.context, img = ctx.createImageData(W, H), d = img.data;
    const own = (x: number, y: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return -9; const r = reg[y * W + x]; return r < 0 ? -2 : owner[r]; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const r = reg[y * W + x]; if (r < 0) continue;
      const o = owner[r]; if (o < 0) continue;
      const k = (y * W + x) * 4, col = this.colors[o];
      let edge = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = own(x + dx, y + dy); if (n !== o && n !== -9) edge = Math.max(edge, 2); }
      if (!edge) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const n = own(x + dx, y + dy); if (n !== o && n !== -9) edge = 1; }
      if (edge === 2) { d[k] = col[0] * 0.45; d[k + 1] = col[1] * 0.45; d[k + 2] = col[2] * 0.45; d[k + 3] = 230; }
      else if (edge === 1) { d[k] = Math.min(255, col[0] * 0.7 + 90); d[k + 1] = Math.min(255, col[1] * 0.7 + 90); d[k + 2] = Math.min(255, col[2] * 0.7 + 90); d[k + 3] = 235; }
      else { d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 34; }
      if (this.g.radiation[r] > 0 && ((x + y) % 9) < 2) { d[k] = 175; d[k + 1] = 235; d[k + 2] = 50; d[k + 3] = 150; }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    if (!c.borders) c.borders = this.scene.add.image(c.img.x, c.img.y, key).setOrigin(0).setScale(c.img.scaleX).setDepth(3);
    c.borders.setVisible(true);
    c.bordersDirty = false;
  }

  /** White outline of one region (for selection), in overlay pixels. */
  outline(r: number, color: string): { canvas: HTMLCanvasElement; x: number; y: number; scale: number } | null {
    if (!this.ovRegion) return null;
    const W = this.g.map.w * BASE_PPT, reg = this.ovRegion, b = this.regionBox[r];
    const x0 = Math.max(0, b[0] * BASE_PPT), y0 = Math.max(0, b[1] * BASE_PPT), x1 = Math.min(W, b[2] * BASE_PPT), y1 = Math.min(this.g.map.h * BASE_PPT, b[3] * BASE_PPT);
    const w = x1 - x0, h = y1 - y0;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!, img = ctx.createImageData(w, h);
    const n = parseInt(color.slice(1), 16), cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255;
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && reg[y * W + x] === r;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (!at(x, y)) continue;
      const k = ((y - y0) * w + (x - x0)) * 4;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      img.data[k] = cr; img.data[k + 1] = cg; img.data[k + 2] = cb; img.data[k + 3] = edge ? 255 : 46;
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: cv, x: x0 * TILE / BASE_PPT, y: y0 * TILE / BASE_PPT, scale: TILE / BASE_PPT };
  }

  /** Is the world pixel (x, y) painted land belonging to region r? (from the nearest cached tier). */
  regionAtPixel(x: number, y: number): number {
    if (!this.ovRegion) return -1;
    const W = this.g.map.w * BASE_PPT;
    const ox = Math.floor(x / TILE * BASE_PPT), oy = Math.floor(y / TILE * BASE_PPT);
    if (ox < 0 || oy < 0 || ox >= W || oy >= this.g.map.h * BASE_PPT) return -1;
    return this.ovRegion[oy * W + ox];
  }
}
