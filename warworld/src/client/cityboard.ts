// City board: cities at levels 1..50 side by side (same seed, so you see one city grow), plus a coast
// with neighbouring cities that share space without merging, connected by highways. Everything is
// painted into one ground image; only smoke and traffic move on top.
import Phaser from 'phaser';
import { CITY } from '../sim/balance';
import type { C3 } from './art/px/dsl';
import { CELL, CityInput, paintCity, paintHighway, Placed } from './art/px/citygen';
import { Pix } from './art/px/dsl';
import { PAL } from './render/painter';
import { fbm, hash, pick, setupCamera, toCanvas } from './showcase-common';

const W = 1500, H = 900;
const BLUE: C3 = [61, 123, 255], RED: C3 = [220, 68, 58], GREEN: C3 = [70, 170, 90];
const coastAt = (x: number) => 690 + Math.sin(x * 0.012) * 16 + Math.sin(x * 0.037 + 1) * 6 + (fbm(x * 0.03, 5, 4) - 0.5) * 16;
const water = (x: number, y: number) => y > coastAt(x);
const NAMES: Record<string, string> = { palace: 'القصر الرئاسي', bank: 'البنك المركزي', market: 'السوق', hospital: 'مستشفى', factory: 'منطقة صناعية', power: 'محطة كهرباء', barracks: 'ثكنة عسكرية', port: 'ميناء' };

class Canvas {
  img = new ImageData(W, H);
  constructor() {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = y - coastAt(x); let c: C3;
      if (d > 0) {
        const n = fbm(x * 0.06, y * 0.06, 2);
        c = d < 3 ? PAL.foam[d < 1.5 ? 1 : 0] : d < 12 ? pick(PAL.shallow, 0.9 - d / 14 + (n - 0.5) * 0.4) : d < 40 ? pick(PAL.sea, 1 - (d - 12) / 30 + (n - 0.5) * 0.5) : pick(PAL.deep, 1 - (d - 40) / 80 + (n - 0.5) * 0.5);
      } else if (d > -4) c = pick(PAL.sand, 0.85 + d / 20 + hash(x, y, 1) * 0.2);
      else { const n = fbm(x * 0.07, y * 0.07, 1), r = hash(x, y, 2); c = pick(PAL.grass, n * 1.15 + (r - 0.5) * 0.28); if (r < 0.005) c = PAL.flower[Math.floor(hash(x, y, 3) * 3)]; }
      this.set(x, y, c);
    }
  }
  get(x: number, y: number): C3 { const k = (y * W + x) * 4; return [this.img.data[k], this.img.data[k + 1], this.img.data[k + 2]]; }
  set(x: number, y: number, c: number[]) { if (x >= 0 && y >= 0 && x < W && y < H) this.img.data.set([c[0], c[1], c[2], 255], (y * W + x) * 4); }
  stamp(p: Pix | ImageData, x0: number, y0: number, shadow = 2, team: C3 = BLUE) {
    const img = p instanceof Pix ? p.toImage(team) : p;
    const op = (i: number, j: number) => i >= 0 && j >= 0 && i < img.width && j < img.height && img.data[(j * img.width + i) * 4 + 3] > 0;
    for (let j = 0; j < img.height + shadow; j++) for (let i = 0; i < img.width + shadow; i++) {
      if (op(i, j)) continue;
      let s = false; for (let k = 1; k <= shadow && !s; k++) s = op(i - k, j - k);
      if (!s || x0 + i >= W || y0 + j >= H || x0 + i < 0 || y0 + j < 0) continue;
      const g = this.get(x0 + i, y0 + j); this.set(x0 + i, y0 + j, [g[0] * 0.6, g[1] * 0.58, g[2] * 0.72]);
    }
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) { const k = (j * img.width + i) * 4; if (img.data[k + 3]) this.set(x0 + i, y0 + j, [img.data[k], img.data[k + 1], img.data[k + 2]]); }
  }
}

interface Spec extends CityInput { title: string }

export class CityBoard extends Phaser.Scene {
  labels: { t: Phaser.GameObjects.Text; x: number; y: number; minZ: number }[] = [];
  ticks: (() => void)[] = [];
  clock = 0;
  constructor() { super('cities'); }

  label(text: string, x: number, y: number, size = 26, color = '#ffffff', minZ = 1) {
    const t = this.add.text(0, 0, text, { fontFamily: 'Cairo', fontStyle: '700', fontSize: size + 'px', color, stroke: '#1d1626', strokeThickness: 6, resolution: 2, align: 'center' }).setOrigin(0.5, 0).setDepth(100);
    this.labels.push({ t, x, y, minZ });
  }

  create() {
    const g = new Canvas();
    // row 1: one city (same seed) at growing levels; districts unlock as it grows
    const lv = [1, 3, 6, 10, 20, 35, 50];
    const row1: Spec[] = [];
    let x = 30;
    for (const L of lv) {
      const R = CITY.radius(L);
      x += R + 8;
      const districts = { market: L >= 3 ? 1 : 0, hospital: L >= 6 ? 1 : 0, factory: L >= 10 ? (L >= 35 ? 2 : 1) : 0, power: L >= 20 ? 1 : 0, bank: L >= 20 ? 1 : 0, barracks: L >= 35 ? 1 : 0 };
      row1.push({ cx: Math.round(x), cy: 200, level: L, capital: false, seed: 4242, team: BLUE, districts, title: `مستوى ${L}` });
      x += R + 34;
    }
    // row 2: a coast with neighbours packed close — each keeps its own land, a green belt between them
    const row2: Spec[] = [
      { cx: 190, cy: 600, level: 30, capital: true, seed: 11, team: BLUE, districts: { port: 1, bank: 1, market: 1, hospital: 1, power: 1 }, title: 'العاصمة — مستوى 30' },
      { cx: 400, cy: 520, level: 16, capital: false, seed: 23, team: BLUE, districts: { factory: 2, power: 1, market: 1 }, title: 'مدينة صناعية — مستوى 16' },
      { cx: 590, cy: 640, level: 12, capital: false, seed: 37, team: BLUE, districts: { port: 1, market: 1, hospital: 1 }, title: 'مدينة ساحلية — مستوى 12' },
      { cx: 800, cy: 520, level: 22, capital: false, seed: 51, team: RED, districts: { barracks: 1, factory: 1, hospital: 1, market: 1 }, title: 'مدينة دولة أخرى (حدود) — مستوى 22' },
      { cx: 1040, cy: 610, level: 40, capital: true, seed: 63, team: GREEN, districts: { port: 1, bank: 1, market: 1, hospital: 1, factory: 2, power: 1, barracks: 1 }, title: 'عاصمة كبرى — مستوى 40' },
      { cx: 1300, cy: 520, level: 8, capital: false, seed: 77, team: GREEN, districts: { market: 1, hospital: 1 }, title: 'مدينة صغيرة — مستوى 8' },
    ];
    const all = [...row1, ...row2];
    const site = (me: Spec) => ({
      water,
      ok: (px: number, py: number) => {
        if (px < 0 || py < 0 || px >= W || py >= H || water(px, py) || coastAt(px) - py < 3) return false;
        const R = CITY.radius(me.level), dm = Math.hypot(px - me.cx, py - me.cy);
        if (dm > R + CELL) return false;
        for (const o of all) if (o !== me) { const dO = Math.hypot(px - o.cx, py - o.cy); if (dm - R > dO - CITY.radius(o.level) - 22) return false; }
        return true;
      },
    });
    // highways first so city streets paint over their ends
    const link = (a: Spec, b: Spec) => paintHighway(g, { x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }, { water });
    for (let i = 0; i + 1 < row1.length; i++) link(row1[i], row1[i + 1]);
    for (let i = 0; i + 1 < row2.length; i++) link(row2[i], row2[i + 1]);
    const results = all.map(s => ({ s, r: paintCity(g, s, site(s)) }));
    this.textures.addCanvas('cityground', toCanvas(g.img));
    this.add.image(0, 0, 'cityground').setOrigin(0, 0);

    this.label('مدينة واحدة تكبر: نفس المدينة من المستوى 1 إلى 50 — المركز يتكثّف والأطراف تتوسع', W / 2, 44, 30, '#ffe28a');
    this.label('مدن متجاورة: كل مدينة تبني على أرضها فقط، بينها حزام أخضر، وتربطها الطرق السريعة', W / 2, 360, 30, '#ffe28a');
    for (const { s, r } of results) {
      const L = s.level, cap = s.capital;
      const stats = `السكان ${fmt(CITY.housing(L, cap))} • الجنود ${fmt(CITY.soldierCap(L, cap))} • المتانة ${fmt(CITY.hp(L))} • الدفاع +${Math.round(CITY.defense(L, cap) * 100)}%`;
      const ly = s.cy < 400 ? s.cy + r.radius + 14 : Math.max(s.cy + r.radius + 10, coastAt(s.cx) + 14);
      this.label(s.title, s.cx, ly, 26, '#ffffff');
      this.label(stats, s.cx, ly + 13, 20, '#cfe3ff', 2);
      for (const p of r.placed) if (NAMES[p.kind]) this.label(NAMES[p.kind], p.x + p.w / 2, p.y + p.h + 1, 20, '#ffe28a', 3);
      for (const ch of r.chimneys) this.smoke(ch.x, ch.y, hash(ch.x, ch.y, 1));
      this.traffic(g, s, r.radius);
    }
    setupCamera(this, W, H);
  }

  smoke(x: number, y: number, ph = 0) {
    let next = ph;
    this.ticks.push(() => {
      if (this.clock < next) return;
      next = this.clock + 0.35;
      const p = this.add.rectangle(x, y, 2, 2, 0xc4c0c8, 0.85).setDepth(65);
      this.tweens.add({ targets: p, x: x + 10 + hash(x, this.clock * 9 | 0, 5) * 6, y: y - 16, scale: 2.5, alpha: 0, duration: 2800, onComplete: () => p.destroy() });
    });
  }

  /** Cars drive along the two avenues, only where the avenue is actually paved. */
  traffic(g: Canvas, s: Spec, R: number) {
    const paved = (x: number, y: number) => { const c = g.get(x, y); return c[0] === 52 && c[1] === 53 && c[2] === 61; };
    const span = (dx: number, dy: number) => { let a = 0, b = 0; while (a < R + 40 && paved(s.cx - dx * (a + 1) - (dy ? 2 : 0), s.cy - dy * (a + 1) - (dx ? 2 : 0))) a++; while (b < R + 40 && paved(s.cx + dx * (b + 1) - (dy ? 2 : 0), s.cy + dy * (b + 1) - (dx ? 2 : 0))) b++; return [a, b]; };
    const n = Math.min(10, 1 + Math.floor(s.level / 5));
    const colors = [0xd04a3a, 0x3f7cae, 0xe8e2c8, 0xd6a63a, 0x5a9a5a, 0xf2f4f6];
    const [hw, he] = span(1, 0), [vn, vs] = span(0, 1);
    for (let i = 0; i < n; i++) {
      const horiz = i % 2 === 0, fwd = (i >> 1) % 2 === 0;
      const lo = horiz ? -hw : -vn, hi = horiz ? he : vs; if (hi - lo < 12) continue;
      const len = hi - lo, color = colors[i % colors.length];
      const car = this.add.rectangle(0, 0, horiz ? 4 : 2, horiz ? 2 : 4, color).setOrigin(0, 0).setDepth(20);
      const speed = 12 + hash(i, s.seed, 9) * 8, off = hash(i, s.seed, 3) * len;
      this.ticks.push(() => {
        const t = (this.clock * speed + off) % len, p = Math.round(fwd ? lo + t : hi - t);
        if (horiz) car.setPosition(s.cx + p, s.cy + (fwd ? 1 : -3)); else car.setPosition(s.cx + (fwd ? -3 : 1), s.cy + p);
      });
    }
  }

  update(_t: number, dms: number) {
    this.clock += Math.min(0.05, dms / 1000);
    for (const t of this.ticks) t();
    const z = this.cameras.main.zoom, s = Math.min(0.5, 0.6 / z);
    for (const l of this.labels) l.t.setScale(s).setPosition(l.x, l.y).setVisible(z >= l.minZ);
  }
}
const fmt = (n: number) => n.toLocaleString('en-US');
