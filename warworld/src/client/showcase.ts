// In-engine showcase board: every new unit and building at its real in-game size, on painted ground,
// animated (rotors, afterburners, wakes, walking soldiers, traffic) plus a live F-35 sortie:
// 6 of 12 parked jets taxi, take off, strike an enemy army, return and park again.
import Phaser from 'phaser';
import '@fontsource/cairo/700.css';
import { Pix, C3 } from './art/px/dsl';
import { VEHICLE } from './art/px/vehicles';
import { AIRBASE, BUILDINGS, airbaseGround } from './art/px/buildings';
import { rotsprite } from './art/px/rotsprite';
import { rotorPx } from './art/px/rotor';
import { PAL } from './render/painter';

const W = 620, H = 360, COAST = 222;
const BLUE: C3 = [61, 123, 255], RED: C3 = [220, 68, 58];
const SH: C3 = [40, 24, 58];
const DIRS = 32;

// ---------- small helpers ----------
const cv = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const toCanvas = (img: ImageData) => { const c = cv(img.width, img.height); c.getContext('2d')!.putImageData(img, 0, 0); return c; };
function silhouette(img: ImageData, a = 110) {
  const o = new ImageData(img.width, img.height);
  for (let k = 0; k < img.data.length; k += 4) if (img.data[k + 3] > 40) o.data.set([SH[0], SH[1], SH[2], a], k);
  return o;
}
function hash(x: number, y: number, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, s: number) => (noise(x, y, s) + noise(x * 2.1, y * 2.1, s + 7) * 0.5 + noise(x * 4.3, y * 4.3, s + 13) * 0.25) / 1.75;
const pick = (p: C3[], t: number) => p[Math.max(0, Math.min(p.length - 1, Math.floor(t * p.length)))];
const coastAt = (x: number) => COAST + Math.sin(x * 0.021) * 7 + (fbm(x * 0.05, 3, 4) - 0.5) * 12;
const desert = (x: number, y: number) => x + (fbm(x * 0.04, y * 0.04, 9) - 0.5) * 30 > 470 && y < 128;

// ---------- ground (everything static is painted INTO this image: pixels on pixels) ----------
class Ground {
  img = new ImageData(W, H);
  constructor() {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = y - coastAt(x); let c: C3;
      if (d > 0) {
        const n = fbm(x * 0.06, y * 0.06, 2);
        c = d < 3 ? PAL.foam[d < 1.5 ? 1 : 0] : d < 12 ? pick(PAL.shallow, 0.9 - d / 14 + (n - 0.5) * 0.4) : d < 40 ? pick(PAL.sea, 1 - (d - 12) / 30 + (n - 0.5) * 0.5) : pick(PAL.deep, 1 - (d - 40) / 80 + (n - 0.5) * 0.5);
        if (d > 6 && hash(x, y, 5) < 0.012 && n > 0.55) c = PAL.shallow[3];
      } else if (d > -4) c = pick(PAL.sand, 0.85 + d / 20 + hash(x, y, 1) * 0.2);
      else if (desert(x, y)) {
        const n = Math.sin(x * 0.22 + fbm(x * 0.03, y * 0.03, 8) * 9 + y * 0.05);
        c = n > 0.75 ? PAL.sand[4] : n < -0.7 ? PAL.sand[1] : pick(PAL.sand, 0.45 + fbm(x * 0.09, y * 0.09, 3) * 0.35);
      } else {
        const n = fbm(x * 0.07, y * 0.07, 1), r = hash(x, y, 2);
        c = pick(PAL.grass, n * 1.15 + (r - 0.5) * 0.28);
        if (r < 0.006) c = PAL.flower[Math.floor(hash(x, y, 3) * 3)];
      }
      this.img.data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
    }
  }
  get(x: number, y: number): C3 { const k = (y * W + x) * 4; return [this.img.data[k], this.img.data[k + 1], this.img.data[k + 2]]; }
  set(x: number, y: number, c: number[]) { if (x >= 0 && y >= 0 && x < W && y < H) this.img.data.set([c[0], c[1], c[2], 255], (y * W + x) * 4); }
  /** Stamps sprite pixels into the ground, with a cast shadow (bottom-right) darkening the ground under it. */
  stamp(p: Pix | ImageData, x0: number, y0: number, shadow = 2, team = BLUE) {
    const img = p instanceof Pix ? p.toImage(team) : p;
    const op = (i: number, j: number) => i >= 0 && j >= 0 && i < img.width && j < img.height && img.data[(j * img.width + i) * 4 + 3] > 0;
    for (let j = 0; j < img.height + shadow; j++) for (let i = 0; i < img.width + shadow; i++) {
      if (op(i, j)) continue;
      let s = false; for (let k = 1; k <= shadow && !s; k++) s = op(i - k, j - k);
      if (!s) continue;
      const g = this.get(x0 + i, y0 + j);
      this.set(x0 + i, y0 + j, [g[0] * 0.58, g[1] * 0.56, g[2] * 0.7]);
    }
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
      const k = (j * img.width + i) * 4; if (!img.data[k + 3]) continue;
      this.set(x0 + i, y0 + j, [img.data[k], img.data[k + 1], img.data[k + 2]]);
    }
  }
  road(x0: number, y0: number, x1: number, y1: number) {
    const horiz = x1 - x0 > y1 - y0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = horiz ? y === y0 || y === y1 : x === x0 || x === x1;
      const mid = horiz ? y === (y0 + y1) >> 1 && x % 6 < 3 : x === (x0 + x1) >> 1 && y % 6 < 3;
      this.set(x, y, edge ? [84, 86, 96] : mid ? [233, 227, 198] : [52, 53, 61]);
    }
  }
}

// ---------- the scene ----------
interface Mover { img: Phaser.GameObjects.Image; sh: Phaser.GameObjects.Image; flame: Phaser.GameObjects.Image; path: { x: number; y: number; alt: number; v: number }[]; seg: number; t: number; x: number; y: number; alt: number; slot: { x: number; y: number }; fired: boolean; target: Phaser.GameObjects.Image; delay: number; done: boolean }
interface Label { t: Phaser.GameObjects.Text; x: number; y: number }

class Showcase extends Phaser.Scene {
  labels: Label[] = [];
  ticks: (() => void)[] = [];
  movers: Mover[] = [];
  clock = 0;
  enemy: Phaser.GameObjects.Image[] = [];
  constructor() { super('showcase'); }

  tex(key: string, img: ImageData | HTMLCanvasElement) { if (!this.textures.exists(key)) this.textures.addCanvas(key, img instanceof ImageData ? toCanvas(img) : img); return key; }
  unit(name: string, team = BLUE) {
    const key = `${name}_${team.join('')}`;
    if (!this.textures.exists(key)) { const img = VEHICLE[name].draw().toImage(team); this.tex(key, img); this.tex(key + '_sh', silhouette(img)); }
    return key;
  }
  dirTex(name: string, dir: number, team = BLUE) {
    const key = `${name}_${team.join('')}_d${dir}`;
    if (!this.textures.exists(key)) {
      const src = VEHICLE[name].draw().toImage(team), out = Math.ceil(Math.hypot(src.width, src.height)) + 2;
      const img = rotsprite(src, dir / DIRS * Math.PI * 2, out);
      this.tex(key, img); this.tex(key + '_sh', silhouette(img));
    }
    return key;
  }
  label(text: string, x: number, y: number, hi = false) {
    const t = this.add.text(0, 0, text, { fontFamily: 'Cairo', fontStyle: '700', fontSize: '26px', color: hi ? '#ffe28a' : '#ffffff', stroke: '#1d1626', strokeThickness: 6, resolution: 2 }).setOrigin(0.5, 0).setDepth(100);
    this.labels.push({ t, x, y });
  }
  /** A unit standing on the ground (1 px shadow) or flying (shadow offset by altitude). */
  place(name: string, x: number, y: number, alt = 0, team = BLUE, depth = 20) {
    const k = this.unit(name, team);
    const off = alt ? 6 + alt * 4 : 1;
    this.add.image(x + off, y + off, k + '_sh').setDepth(depth - 1);
    return this.add.image(x, y, k).setDepth(alt ? 60 : depth);
  }

  create() {
    const g = new Ground();
    const O = { x: 10, y: 6 };
    // airbase painted into the ground + hangars + tower
    g.stamp(airbaseGround().toImage(), O.x, O.y, 0);
    [[214, 32], [214, 50], [214, 68]].forEach(([x, y]) => g.stamp(BUILDINGS.hangar.draw(), x, y));
    g.stamp(BUILDINGS.ctower.draw(), 216, 88);
    // town: roads first, then blocks
    g.road(244, 62, 470, 66); g.road(306, 4, 310, 116); g.road(386, 4, 390, 116); g.road(240, 4, 244, 116);
    const houses = ['house_r', 'house_g', 'house_r', 'house_t'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      if (r === 3 && c > 1) continue;
      g.stamp(BUILDINGS[houses[(r + c) % 4]].draw(), 247 + c * 15, 6 + r * 14 + (r > 3 ? 8 : 0));
    }
    g.stamp(BUILDINGS.tree.draw(), 280, 48); g.stamp(BUILDINGS.treeB.draw(), 293, 47);
    g.stamp(BUILDINGS.apartment.draw(), 314, 6); g.stamp(BUILDINGS.apartment.draw(), 332, 6);
    g.stamp(BUILDINGS.tower.draw(), 352, 6); g.stamp(BUILDINGS.tower.draw(), 368, 6);
    g.stamp(BUILDINGS.shop.draw(), 316, 24); g.stamp(BUILDINGS.apartment.draw(), 338, 24);
    g.stamp(BUILDINGS.shop.draw(), 358, 26); g.stamp(BUILDINGS.tree.draw(), 316, 44); g.stamp(BUILDINGS.tree.draw(), 324, 46);
    g.stamp(BUILDINGS.apartment.draw(), 332, 42); g.stamp(BUILDINGS.apartment.draw(), 352, 42); g.stamp(BUILDINGS.treeB.draw(), 372, 44);
    // southern block: houses right next to the factory
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.stamp(BUILDINGS[houses[(r * 3 + c) % 4]].draw(), 247 + c * 15, 70 + r * 15);
    g.stamp(BUILDINGS.factory.draw(), 312, 72);
    g.stamp(BUILDINGS.warehouse.draw(), 350, 72); g.stamp(BUILDINGS.warehouse.draw(), 350, 88);
    g.stamp(BUILDINGS.apartment.draw(), 394, 6); g.stamp(BUILDINGS.house_r.draw(), 414, 8); g.stamp(BUILDINGS.house_g.draw(), 430, 8);
    g.stamp(BUILDINGS.treeB.draw(), 396, 24); g.stamp(BUILDINGS.house_t.draw(), 410, 26); g.stamp(BUILDINGS.house_r.draw(), 426, 26);
    g.stamp(BUILDINGS.house_g.draw(), 394, 40); g.stamp(BUILDINGS.tree.draw(), 412, 44); g.stamp(BUILDINGS.house_r.draw(), 422, 42);
    g.stamp(BUILDINGS.house_t.draw(), 394, 72); g.stamp(BUILDINGS.house_r.draw(), 410, 72); g.stamp(BUILDINGS.tree.draw(), 428, 74);
    // land-unit training strip
    for (let x = 6; x < 600; x++) for (let y = 186; y < 200; y++) { const c = g.get(x, y); if (hash(x, y, 31) < 0.5) g.set(x, y, [c[0] * 0.9 + 14, c[1] * 0.86 + 8, c[2] * 0.8]); }
    this.tex('ground', g.img);
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(0);

    this.label('قاعدة جوية — 12 × F-35', O.x + 100, O.y + 105);
    this.label('منازل المدينة', 275, 116);
    this.label('مصنع بجانب المنازل', 330, 100, true);
    this.label('عمارات وأبراج', 345, 58);
    this.smoke(312 + 27, 72 + 17); this.smoke(312 + 32, 72 + 17, 0.4);

    // ---- parked F-35s (row 2 static, row 1 flies the sortie) ----
    const north = DIRS * 3 / 4;
    const k = this.dirTex('f35', north);
    for (let i = 0; i < 6; i++) {
      const x = O.x + AIRBASE.slotX0 + 14 + i * AIRBASE.slotW, y = O.y + AIRBASE.rows[1];
      this.add.image(x + 1, y + 1, k + '_sh').setDepth(19); this.add.image(x, y, k).setDepth(20);
    }

    // ---- enemy army: the sortie's target ----
    const eArmy: [string, number, number][] = [['mbt', 512, 30], ['mbt', 540, 38], ['mbt', 520, 60], ['ifv', 552, 66], ['mbt', 572, 46], ['apc', 584, 84]];
    for (const [n, x, y] of eArmy) {
      const k2 = this.dirTex(n, DIRS / 2, RED);
      this.add.image(x + 1, y + 1, k2 + '_sh').setDepth(19);
      this.enemy.push(this.add.image(x, y, k2).setDepth(20));
    }
    this.label('جيش معادٍ (هدف الطلعة)', 548, 100);

    // ---- air row: requested comparisons first (F-35 | F-16 | attack heli) ----
    let x = 16;
    const airRow: string[] = ['f35', 'f16', 'apache', 'su57', 'reaper', 'blackhawk', 'chinook', 'ac130', 'b2', 'b52'];
    for (const n of airRow) {
      const v = VEHICLE[n], img = this.place(n, 0, 0, n === 'reaper' ? 1.2 : 1);
      const w = img.width; img.setPosition(x + w / 2, 152); (this.children.getAt(this.children.length - 2) as Phaser.GameObjects.Image).setPosition(x + w / 2 + 10, 162);
      this.label(v.label, x + w / 2, 152 + img.height / 2 + 2, n === 'f35' || n === 'f16' || n === 'apache');
      if (v.rotor) for (const r of v.rotor) this.rotor(n, r, img);
      if (['f16', 'f35', 'su57'].includes(n)) this.afterburner(img);
      x += w + 14;
    }

    // ---- land row: tank | APC | truck first ----
    x = 14;
    const landRow: string[] = ['mbt', 'apc', 'truck', 'ifv', 'spg', 'mlrs', 'aa', 'humvee'];
    for (const [li, n] of landRow.entries()) {
      const img = this.place(n, 0, 0); const w = img.width;
      img.setPosition(x + w / 2, 192); (this.children.getAt(this.children.length - 2) as Phaser.GameObjects.Image).setPosition(x + w / 2 + 1, 193);
      this.label(VEHICLE[n].label, x + w / 2, 199 + (li % 2) * 6, ['mbt', 'apc', 'truck'].includes(n));
      x += w + 10;
    }
    this.soldiers(x + 4, 192);
    this.traffic();

    // ---- sea row: destroyer | carrier first ----
    x = 14;
    const seaRow: string[] = ['destroyer', 'carrier', 'frigate', 'corvette', 'cruiser', 'patrol', 'sub', 'transport', 'supply', 'landing', 'amphib'];
    const rowY = [264, 264, 264, 264, 264, 264, 264, 318, 318, 318, 318];
    seaRow.forEach((n, i) => {
      if (i === 7) x = 14;
      const img = this.place(n, 0, 0); const w = img.width, y = rowY[i];
      img.setPosition(x + w / 2, y); (this.children.getAt(this.children.length - 2) as Phaser.GameObjects.Image).setPosition(x + w / 2 + 1, y + 1);
      this.wake(img, n === 'sub');
      this.label(VEHICLE[n].label, x + w / 2, y + img.height / 2 + 2, n === 'destroyer' || n === 'carrier');
      x += w + 16;
    });

    // ---- scale ruler: one map tile ----
    const ruler = this.add.graphics().setDepth(90);
    ruler.fillStyle(0xffffff).fillRect(560, 340, 16, 1).fillRect(560, 338, 1, 4).fillRect(575, 338, 1, 4);
    this.label('خلية خريطة = 16px', 568, 342);

    this.sortie(O);
    this.setupCamera();
  }

  rotor(name: string, r: { x: number; r: number; blades: number }, body: Phaser.GameObjects.Image) {
    const frames = rotorPx(r.r, r.blades).map((c, i) => this.tex(`rot_${name}_${r.x}_${i}`, c));
    const img = this.add.image(0, 0, frames[0]).setDepth(61);
    const sh = this.add.image(0, 0, frames[0]).setDepth(59).setTint(0x281838).setAlpha(0.35);
    this.ticks.push(() => {
      const f = frames[Math.floor(this.clock * 30) % frames.length];
      const px = body.x - body.width / 2 + r.x + 1, py = body.y;
      img.setTexture(f).setPosition(px, py); sh.setTexture(f).setPosition(px + 10, py + 10);
    });
  }
  smoke(x: number, y: number, ph = 0) {
    let next = ph;
    this.ticks.push(() => {
      if (this.clock < next) return;
      next = this.clock + 0.32;
      const g = 0xb8b4bc - Math.floor(hash(x, Math.floor(this.clock * 10), 4) * 3) * 0x101010;
      const p = this.add.rectangle(x, y, 2, 2, g, 0.85).setDepth(65);
      this.tweens.add({ targets: p, x: x + 10 + hash(x, this.clock * 9 | 0, 5) * 6, y: y - 14, scale: 2.5, alpha: 0, duration: 2600, onComplete: () => p.destroy() });
    });
  }
  afterburner(body: Phaser.GameObjects.Image) {
    const k = this.tex('flame', (() => { const p = new Pix(4, 3); p.hl(1, 0, 3, 'F').px(3, 1, 'f').px(2, 1, 'f').px(1, 0, 'F').px(1, 2, 'F'); return p.toImage(); })());
    const f = this.add.image(0, 0, k).setDepth(59.5);
    this.ticks.push(() => { f.setPosition(body.x - body.width / 2 - 1, body.y).setVisible(Math.floor(this.clock * 20) % 3 !== 0); });
  }
  wake(ship: Phaser.GameObjects.Image, sub: boolean) {
    const gfx = this.add.graphics().setDepth(18);
    const len = ship.width;
    this.ticks.push(() => {
      gfx.clear();
      const ph = Math.floor(this.clock * 6);
      for (let i = 1; i < 18; i++) {
        if (hash(i, ph, 3) < 0.35) continue;
        const sx = ship.x - len / 2 - i, spread = Math.min(ship.height / 2, 1 + i * 0.4);
        gfx.fillStyle(0xf0fbff, Math.max(0.15, (sub ? 0.4 : 0.85) - i * 0.04));
        gfx.fillRect(Math.round(sx), Math.round(ship.y - spread), 1, 1).fillRect(Math.round(sx), Math.round(ship.y + spread), 1, 1);
      }
      gfx.fillStyle(0xffffff, 0.8).fillRect(Math.round(ship.x + len / 2 - 2), Math.round(ship.y - 2 - (ph % 2)), 1, 1).fillRect(Math.round(ship.x + len / 2 - 2), Math.round(ship.y + 2 + (ph % 2)), 1, 1);
    });
  }
  soldiers(x0: number, y: number) {
    const frames = [0, 1, 0, 2].map(f => this.unit('soldier' + f));
    const men = [0, 1, 2, 3, 4, 5].map(i => ({ img: this.add.image(0, 0, frames[0]).setDepth(21), ox: (i % 3) * 7, oy: Math.floor(i / 3) * 7 - 3, ph: i * 0.3 }));
    this.ticks.push(() => {
      for (const m of men) {
        const t = (this.clock * 0.25 + m.ph) % 2, dir = t < 1 ? 1 : -1, s = t < 1 ? t : 2 - t;
        m.img.setTexture(frames[Math.floor(this.clock * 8 + m.ph * 10) % 4]).setPosition(Math.round(x0 + m.ox + s * 30), y + m.oy).setFlipX(dir < 0);
      }
    });
    this.label('مشاة', x0 + 22, 200);
  }
  traffic() {
    const cars = ['car_r', 'car_b', 'car_w', 'car_r', 'car_w'].map((n, i) => ({ img: this.add.image(0, 0, this.unit(n)).setDepth(21), i }));
    this.ticks.push(() => {
      for (const c of cars) {
        const t = ((this.clock * 14 + c.i * 47) % 226);
        if (c.i % 2) c.img.setPosition(Math.round(470 - t), 63).setFlipX(true); else c.img.setPosition(Math.round(244 + t), 66).setFlipX(false);
      }
    });
  }

  /** Six F-35s: taxi → runway roll → climb → strike the enemy army → return → land → park. */
  sortie(O: { x: number; y: number }) {
    const R = O.y + AIRBASE.runwayY, L = O.y + AIRBASE.laneY;
    for (let i = 0; i < 6; i++) {
      const sx = O.x + AIRBASE.slotX0 + 14 + i * AIRBASE.slotW, sy = O.y + AIRBASE.rows[0];
      const tgt = this.enemy[i];
      const yy = (i - 2.5) * 9;
      const path = [
        { x: sx, y: sy, alt: 0, v: 10 }, { x: sx, y: L, alt: 0, v: 10 }, { x: O.x + 15, y: L, alt: 0, v: 12 }, { x: O.x + 15, y: R, alt: 0, v: 10 },
        { x: O.x + 90, y: R, alt: 0, v: 40 }, { x: O.x + 175, y: R - 4, alt: 0.6, v: 70 }, { x: 330, y: 150 + yy * 0.3, alt: 1, v: 85 },
        { x: tgt.x - 70, y: tgt.y + 40, alt: 1, v: 85 }, { x: tgt.x - 30, y: tgt.y + 15, alt: 1, v: 85 },
        { x: tgt.x + 30, y: tgt.y - 18 + yy * 0.2, alt: 1, v: 85 }, { x: 600, y: 120 + yy, alt: 1, v: 85 }, { x: 520, y: 140 - yy, alt: 1, v: 85 },
        { x: O.x + 250, y: R + 8, alt: 0.6, v: 70 }, { x: O.x + 178, y: R, alt: 0, v: 45 }, { x: O.x + 15, y: R, alt: 0, v: 18 },
        { x: O.x + 15, y: L, alt: 0, v: 10 }, { x: sx, y: L, alt: 0, v: 10 }, { x: sx, y: sy + 0.01, alt: 0, v: 10 },
      ];
      const img = this.add.image(sx, sy, this.dirTex('f35', DIRS * 3 / 4)).setDepth(20);
      const sh = this.add.image(sx + 1, sy + 1, this.dirTex('f35', DIRS * 3 / 4) + '_sh').setDepth(19);
      const flame = this.add.image(0, 0, 'flame').setDepth(59.5).setVisible(false);
      this.movers.push({ img, sh, flame, path, seg: 0, t: 0, x: sx, y: sy, alt: 0, slot: { x: sx, y: sy }, fired: false, target: tgt, delay: i * 1.6, done: false });
    }
    this.label('طلعة: 6 من 12 تقلع وتضرب وتعود', O.x + 100, O.y - 2, true);
  }
  stepSortie(dt: number) {
    if (this.movers.every(m => m.done)) { for (const [i, m] of this.movers.entries()) { m.done = false; m.seg = 0; m.t = 0; m.fired = false; m.delay = 3 + i * 1.6; } for (const e of this.enemy) e.clearTint(); }
    for (const m of this.movers) {
      if (m.done) continue;
      if (m.delay > 0) { m.delay -= dt; continue; }
      const a = m.path[m.seg], b = m.path[m.seg + 1];
      if (!b) { m.done = true; m.img.setTexture(this.dirTex('f35', DIRS * 3 / 4)); m.sh.setTexture(this.dirTex('f35', DIRS * 3 / 4) + '_sh'); continue; }
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      m.t += (a.v + (b.v - a.v) * m.t / len) * dt;
      if (m.t >= len) { m.t -= len; m.seg++; continue; }
      const f = m.t / len;
      m.x = a.x + (b.x - a.x) * f; m.y = a.y + (b.y - a.y) * f; m.alt = a.alt + (b.alt - a.alt) * f;
      const ang = Math.atan2(b.y - a.y, b.x - a.x), dir = ((Math.round(ang / (Math.PI * 2) * DIRS) % DIRS) + DIRS) % DIRS;
      const k = this.dirTex('f35', dir), off = m.alt > 0 ? 1 + m.alt * 9 : 1;
      m.img.setTexture(k).setPosition(Math.round(m.x), Math.round(m.y)).setDepth(m.alt > 0.05 ? 62 : 20);
      m.sh.setTexture(k + '_sh').setPosition(Math.round(m.x + off), Math.round(m.y + off)).setDepth(m.alt > 0.05 ? 58 : 19);
      const burn = m.seg >= 4 && m.seg <= 6;
      m.flame.setVisible(burn && Math.floor(this.clock * 20) % 3 !== 0).setPosition(Math.round(m.x - Math.cos(ang) * 15), Math.round(m.y - Math.sin(ang) * 15)).setRotation(ang);
      if (m.seg === 8 && !m.fired) { m.fired = true; this.missile(m.x, m.y, m.target); }
    }
  }
  missile(x: number, y: number, tgt: Phaser.GameObjects.Image) {
    const k = this.tex('missile', (() => { const p = new Pix(5, 1); p.hl(0, 0, 3, 'W').px(4, 0, 's'); return p.toImage(); })());
    const m = this.add.image(x, y, k).setDepth(63);
    let t = 0; const sx = x, sy = y, dist = Math.hypot(tgt.x - x, tgt.y - y);
    const puffs: Phaser.GameObjects.Rectangle[] = [];
    const tick = () => {
      t += 1 / 60 * 160;
      const f = Math.min(1, t / dist), px = sx + (tgt.x - sx) * f, py = sy + (tgt.y - sy) * f;
      m.setPosition(Math.round(px), Math.round(py)).setRotation(Math.atan2(tgt.y - sy, tgt.x - sx));
      const p = this.add.rectangle(Math.round(px), Math.round(py), 2, 2, 0xd8d8e0, 0.7).setDepth(62);
      puffs.push(p);
      this.tweens.add({ targets: p, alpha: 0, scale: 2, duration: 700, onComplete: () => p.destroy() });
      if (f >= 1) { this.ticks.splice(this.ticks.indexOf(tick), 1); m.destroy(); this.boom(tgt.x, tgt.y); tgt.setTint(0x5a4a44); }
    };
    this.ticks.push(tick);
  }
  boom(x: number, y: number) {
    const cols = [0xfff1a8, 0xffc04a, 0xff7a30, 0xc8402a, 0x6a5a5a, 0x4a4446];
    for (let i = 0; i < 14; i++) {
      const a = hash(i, x | 0, 1) * Math.PI * 2, r = 2 + hash(i, y | 0, 2) * 7;
      const p = this.add.rectangle(Math.round(x), Math.round(y), 2, 2, cols[i % 3]).setDepth(64);
      this.tweens.add({ targets: p, x: Math.round(x + Math.cos(a) * r), y: Math.round(y + Math.sin(a) * r), duration: 380, onComplete: () => { p.setFillStyle(cols[3 + (i % 3)]); this.tweens.add({ targets: p, alpha: 0, y: p.y - 6, duration: 900, onComplete: () => p.destroy() }); } });
    }
    const core = this.add.circle(Math.round(x), Math.round(y), 5, 0xfff1a8).setDepth(64);
    this.tweens.add({ targets: core, scale: 1.8, alpha: 0, duration: 300, onComplete: () => core.destroy() });
  }

  // ---------- camera ----------
  setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(-200, -200, W + 400, H + 400);
    const fit = () => Math.min(cam.width / W, cam.height / H);
    const setZoom = (z: number) => { cam.setZoom(z); };
    setZoom(fit()); cam.centerOn(W / 2, H / 2);
    let drag: { x: number; y: number; sx: number; sy: number } | null = null;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY }; });
    this.input.on('pointerup', () => { drag = null; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (drag && p.isDown) { cam.scrollX = drag.sx - (p.x - drag.x) / cam.zoom; cam.scrollY = drag.sy - (p.y - drag.y) / cam.zoom; } });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.85 : 1.18), 0.8, 10));
      const after = cam.getWorldPoint(p.x, p.y); cam.scrollX += before.x - after.x; cam.scrollY += before.y - after.y;
    });
    const bar = document.getElementById('zoom')!;
    bar.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('button'); if (!b) return;
      const z = b.dataset.z!, mid = cam.midPoint.clone();
      if (z === 'fit') { setZoom(fit()); cam.centerOn(W / 2, H / 2); } else { setZoom(Number(z)); cam.centerOn(mid.x, mid.y); }
      if (b.dataset.cx) cam.centerOn(Number(b.dataset.cx), Number(b.dataset.cy));
    });
    (window as any).__sc = { cam, W, H, focus: (x: number, y: number, z: number) => { setZoom(z); cam.centerOn(x, y); } };
  }

  update(_t: number, dms: number) {
    const dt = Math.min(0.05, dms / 1000);
    this.clock += dt;
    for (const a of [...this.ticks]) a();
    this.stepSortie(dt);
    const z = this.cameras.main.zoom, s = Math.min(0.42, 0.55 / z);
    for (const l of this.labels) l.t.setScale(s).setPosition(l.x, l.y + 1).setVisible(z > 1.4);
  }
}

document.fonts.load('700 20px Cairo').finally(() => {
  new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', backgroundColor: '#1c2f72', pixelArt: true, roundPixels: true, banner: false,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: Showcase,
  });
  (window as any).__ready = true;
});
