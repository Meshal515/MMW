// Phaser scene: draws the living world from the simulation state and turns pointer input into taps.
// Rendering tiers: far (political map), mid (cities, fleets, armies), near (full pixel-art detail,
// traffic, smoke, rotors, wakes). All units come from the sprite forge at 32 headings.
import Phaser from 'phaser';
import type { Game } from '../../sim/game';
import { AIR_UNITS, Army, Fleet, SEA_UNITS } from '../../sim/state';
import { buildAtlas } from '../art/sprites';
import { canvasOf } from '../art/pixel';
import { Ground, TILE } from './ground';
import { CITY } from '../../sim/balance';
import { Fx } from './fx';
import { paintGameCity } from './cities';
import type { District, Street } from '../art/px/citygen';
import { FORT_PITS, FORT_TRENCH } from '../art/px/facilities';
import * as sfx from '../audio/sfx';
import { DIRS, dirIndex, Registry, ROTOR_OFFSETS } from './registry';

export type Lod = 'far' | 'mid' | 'near';
export interface TapInfo { region: number; sea: number; x: number; y: number }

const DIGITS = '0123456789.k+-%/';
const GLYPHS: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'], '.': ['000', '000', '000', '000', '010'], 'k': ['100', '101', '110', '101', '101'],
  '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'], '%': ['101', '001', '010', '100', '101'], '/': ['001', '001', '010', '100', '100'],
};

export function fmt(n: number) {
  n = Math.max(0, n);
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.floor(n));
}

const W2 = (v: number) => (v + 0.5) * TILE;
const FIGHTERS = ['f16', 'f35', 'su57'], BOMBERS = ['b52', 'b2', 'ac130'], ESCORTS = ['destroyer', 'frigate', 'corvette', 'cruiser'];

interface Vis { parts: { img: Phaser.GameObjects.Image; team: Phaser.GameObjects.Image | null; model: string }[]; label: Phaser.GameObjects.BitmapText | null; heading: number; lx: number; ly: number }
interface PlaneVis { img: Phaser.GameObjects.Image; team: Phaser.GameObjects.Image | null; shadow: Phaser.GameObjects.Image; rotors: Phaser.GameObjects.Image[]; model: string; heading: number; lx: number; ly: number; flame: Phaser.GameObjects.Image | null }
interface CityVis { key: string; img: Phaser.GameObjects.Image; streets: Street[]; size: number; radius: number; x: number; y: number; chimneys: { x: number; y: number }[] }
const DISTRICTS: District[] = ['factory', 'power', 'port', 'hospital', 'market', 'bank', 'barracks'];
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
interface FacVis { key: string; img: Phaser.GameObjects.Image; team: Phaser.GameObjects.Image | null; type: string; x: number; y: number; dir: number }

export class WorldScene extends Phaser.Scene {
  sim!: Game;
  human = 0;
  speed = 1;
  paused = false;
  onTap: (t: TapInfo) => void = () => {};
  onFrame: () => void = () => {};
  lod: Lod = 'far';
  ground!: Ground;
  reg!: Registry;
  fx!: Fx;
  /** Blast marks per city region (world px): buildings inside stand as ruins until the city is rebuilt. */
  private cityDamage = new Map<number, { x: number; y: number; r: number }[]>();
  private seenLoss = new Map<string, number>();
  private corpses: { o: Phaser.GameObjects.Image; t: number }[] = [];
  private battleVis = new Map<number, { men: Phaser.GameObjects.Image[]; t: number }>();

  private acc = 0;
  private cities = new Map<number, CityVis>();
  private facs = new Map<string, FacVis>();
  private armyVis = new Map<number, Vis>();
  private fleetVis = new Map<number, Vis>();
  private planeVis = new Map<string, PlaneVis>();
  private missileVis = new Map<number, { img: Phaser.GameObjects.Image; trail: number }>();
  private troopText: Phaser.GameObjects.BitmapText[] = [];
  private textPool: Phaser.GameObjects.BitmapText[] = [];
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private capMarks = new Map<number, Phaser.GameObjects.Image>();
  private selImg: Phaser.GameObjects.Image | null = null;
  private selTween: Phaser.Tweens.Tween | null = null;
  private targetGfx!: Phaser.GameObjects.Graphics;
  private rangeCircles: { x: number; y: number; r: number }[] = [];
  private ambient: { img: Phaser.GameObjects.Image; team?: Phaser.GameObjects.Image; vx: number; vy: number; life: number; max: number; kind: string }[] = [];
  private ambT = 0;
  private lastLabels = -10;
  private dirtyBuild = new Set<number>();
  private drag = { down: false, x: 0, y: 0, sx: 0, sy: 0, moved: false };
  private pinch: { d: number; z: number } | null = null;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private walkFrame = 0;
  private walkFrame2 = 0;
  private sortiePhase = new Map<number, string>();
  worldW = 0; worldH = 0;

  constructor() { super('world'); }

  init(data: { sim: Game; human: number }) { this.sim = data.sim; this.human = data.human; }

  create() {
    const g = this.sim;
    this.worldW = g.map.w * TILE; this.worldH = g.map.h * TILE;
    const atlas = buildAtlas();
    const at = this.textures.addCanvas('atlas', atlas.canvas)!;
    for (const [k, f] of Object.entries(atlas.frames)) at.add(k, 0, f.x, f.y, f.w, f.h);
    this.makeDigitFont();
    this.reg = new Registry(this);
    this.fx = new Fx(this);
    this.ground = new Ground(this, g);
    this.targetGfx = this.add.graphics().setDepth(60);
    const cam = this.cameras.main;
    cam.setBackgroundColor('#1c2f72');
    cam.setRoundPixels(true);
    this.fitWorld();
    this.scale.on('resize', () => this.clampCamera());
    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { sfx.unlockAudio(); this.pointerDown(p); });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.pointerMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.pointerUp(p));
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(p.x, p.y, dy > 0 ? 0.85 : 1.18));
    const kb = this.input.keyboard;
    if (kb) for (const k of ['LEFT', 'RIGHT', 'UP', 'DOWN', 'W', 'A', 'S', 'D', 'PLUS', 'MINUS', 'NUMPAD_ADD', 'NUMPAD_SUBTRACT']) this.keys[k] = kb.addKey(k, false);
    for (let r = 0; r < g.owner.length; r++) if (g.buildings[r].length) this.dirtyBuild.add(r);
  }

  /** Paints the world base texture; resolves when the map is ready to show. */
  async prepare(onProgress?: (f: number) => void) {
    await this.ground.init(onProgress);
    // warm up the most common unit sprites so the first battles don't hitch
    for (const m of ['soldier0', 'soldier1', 'mbt', 'spg', 'apc', 'transport', 'destroyer', 'f16', 'apache']) this.reg.model(m);
  }

  private makeDigitFont() {
    const cw = 5, ch = 7;
    const { c, ctx } = canvasOf(cw * DIGITS.length, ch);
    const img = ctx.createImageData(c.width, ch);
    DIGITS.split('').forEach((d, i) => {
      const gl = GLYPHS[d];
      const on = (x: number, y: number) => x >= 0 && y >= 0 && x < 3 && y < 5 && gl[y][x] === '1';
      for (let y = -1; y <= 5; y++) for (let x = -1; x <= 3; x++) {
        const k = ((y + 1) * c.width + i * cw + x + 1) * 4;
        if (on(x, y)) { img.data[k] = 255; img.data[k + 1] = 255; img.data[k + 2] = 255; img.data[k + 3] = 255; }
        else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x - 1, y - 1) || on(x + 1, y + 1) || on(x - 1, y + 1) || on(x + 1, y - 1)) { img.data[k] = 20; img.data[k + 1] = 16; img.data[k + 2] = 28; img.data[k + 3] = 235; }
      }
    });
    ctx.putImageData(img, 0, 0);
    this.textures.addCanvas('digitsImg', c);
    const data = Phaser.GameObjects.RetroFont.Parse(this, { image: 'digitsImg', width: cw, height: ch, chars: DIGITS, charsPerRow: DIGITS.length, 'offset.x': 0, 'offset.y': 0, 'spacing.x': 0, 'spacing.y': 0, lineSpacing: 0 } as any);
    this.cache.bitmapFont.add('digits', data as any);
  }

  // ---------------- camera ----------------
  minZoom() { const cam = this.cameras.main; return Math.min(cam.width / this.worldW, cam.height / this.worldH) * 0.98; }
  fitWorld() { const cam = this.cameras.main; cam.setZoom(this.minZoom()); cam.centerOn(this.worldW / 2, this.worldH / 2); this.updateLod(); }
  flyTo(x: number, y: number, zoom?: number) {
    const cam = this.cameras.main;
    if (zoom) cam.zoomTo(Math.max(this.minZoom(), Math.min(8, zoom)), 450, 'Sine.easeInOut');
    cam.pan(W2(x), W2(y), 450, 'Sine.easeInOut');
  }
  zoomAt(sx: number, sy: number, f: number) {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, this.minZoom(), 8));
    cam.preRender();
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x; cam.scrollY += before.y - after.y;
    this.clampCamera();
  }
  private clampCamera() {
    const cam = this.cameras.main;
    if (cam.zoom < this.minZoom()) cam.setZoom(this.minZoom());
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2;
    const tx = vw >= this.worldW ? this.worldW / 2 : Phaser.Math.Clamp(cx, vw / 2, this.worldW - vw / 2);
    const ty = vh >= this.worldH ? this.worldH / 2 : Phaser.Math.Clamp(cy, vh / 2, this.worldH - vh / 2);
    cam.scrollX = tx - cam.width / 2; cam.scrollY = ty - cam.height / 2;
    this.updateLod();
  }
  private updateLod() { const z = this.cameras.main.zoom; this.lod = z < 0.5 ? 'far' : z < 1.5 ? 'mid' : 'near'; }

  // ---------------- input ----------------
  private pointerDown(p: Phaser.Input.Pointer) {
    const ps = this.input.manager.pointers.filter(q => q.isDown);
    if (ps.length >= 2) { const [a, b] = ps; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cameras.main.zoom }; this.drag.moved = true; return; }
    this.drag = { down: true, x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY, moved: false };
  }
  private pointerMove(p: Phaser.Input.Pointer) {
    const ps = this.input.manager.pointers.filter(q => q.isDown);
    if (this.pinch && ps.length >= 2) {
      const [a, b] = ps;
      const target = Phaser.Math.Clamp(this.pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(10, this.pinch.d), this.minZoom(), 8);
      this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target / this.cameras.main.zoom);
      return;
    }
    if (!this.drag.down || !p.isDown) return;
    const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 7) this.drag.moved = true;
    if (this.drag.moved) { const cam = this.cameras.main; cam.scrollX = this.drag.sx - dx / cam.zoom; cam.scrollY = this.drag.sy - dy / cam.zoom; this.clampCamera(); }
  }
  private pointerUp(p: Phaser.Input.Pointer) {
    const stillDown = this.input.manager.pointers.filter(q => q.isDown).length;
    if (this.pinch) { if (stillDown === 0) { this.pinch = null; this.drag.down = false; } return; }
    if (!this.drag.down) return;
    this.drag.down = false;
    if (this.drag.moved) return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const map = this.sim.map;
    const tx = Math.floor(wp.x / TILE), ty = Math.floor(wp.y / TILE);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return;
    // use the painted (warped) coastline so taps match what the player sees
    const painted = this.ground.regionAtPixel(wp.x, wp.y);
    const region = painted >= 0 ? painted : -1;
    const sea = region < 0 ? (map.seaOf[ty * map.w + tx] >= 0 ? map.seaOf[ty * map.w + tx] : this.nearestSea(tx, ty)) : -1;
    this.onTap({ region, sea, x: wp.x / TILE - 0.5, y: wp.y / TILE - 0.5 });
  }
  private nearestSea(tx: number, ty: number) {
    const map = this.sim.map;
    for (let r = 1; r < 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx, y = ty + dy; if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
      const s = map.seaOf[y * map.w + x]; if (s >= 0) return s;
    }
    return -1;
  }

  // ---------------- selection & targeting ----------------
  select(r: number, color = '#ffffff') {
    this.selTween?.stop(); this.selImg?.destroy(); this.selImg = null;
    if (r < 0) return;
    const o = this.ground.outline(r, color);
    if (!o) return;
    if (this.textures.exists('sel')) this.textures.remove('sel');
    this.textures.addCanvas('sel', o.canvas);
    this.selImg = this.add.image(o.x, o.y, 'sel').setOrigin(0).setScale(o.scale).setDepth(4);
    this.selTween = this.tweens.add({ targets: this.selImg, alpha: { from: 1, to: 0.4 }, duration: 520, yoyo: true, repeat: -1 });
  }
  setRanges(circles: { x: number; y: number; r: number }[]) { this.rangeCircles = circles; }
  markOverlay(regions: Iterable<number>) { for (const r of regions) this.ground.markDirty(r); }

  // ---------------- main loop ----------------
  update(_t: number, delta: number) {
    const g = this.sim;
    if (!this.ground.ready) return;
    if (!this.paused && g.phase !== 'over') {
      this.acc += Math.min(delta, 250) * this.speed;
      let steps = 0;
      while (this.acc >= 100 && steps < 12) { g.step(); this.acc -= 100; steps++; }
    }
    this.keyboardPan(delta);
    for (const r of g.dirtyRegions) { this.ground.markDirty(r); this.dirtyBuild.add(r); }
    g.dirtyRegions.clear();
    const now = this.time.now;
    this.updateLod();
    const view = this.viewRect(80);
    this.ground.update(view, this.cameras.main.zoom, now);
    this.walkFrame = Math.floor(now / 180) % 2;
    this.walkFrame2 = Math.floor(now / 140) % 4;
    this.syncBuildings(view);
    this.syncArmies(view);
    this.syncBattles(view, now);
    this.syncFleets(view, delta);
    this.syncAir(view, delta, now);
    this.syncMissiles(delta);
    this.handleFx();
    this.syncGarrisons(view);
    this.syncLabels(now);
    this.ambientLife(view, delta);
    this.fx.update(delta);
    this.ageCorpses(delta);
    this.drawTargeting();
    this.onFrame();
  }

  private keyboardPan(delta: number) {
    const k = this.keys, cam = this.cameras.main;
    if (!k.LEFT) return;
    const s = delta * 0.7 / cam.zoom;
    let moved = false;
    if (k.LEFT.isDown || k.A.isDown) { cam.scrollX -= s; moved = true; }
    if (k.RIGHT.isDown || k.D.isDown) { cam.scrollX += s; moved = true; }
    if (k.UP.isDown || k.W.isDown) { cam.scrollY -= s; moved = true; }
    if (k.DOWN.isDown || k.S.isDown) { cam.scrollY += s; moved = true; }
    if (k.PLUS.isDown || k.NUMPAD_ADD.isDown) this.zoomAt(cam.width / 2, cam.height / 2, 1 + delta * 0.002);
    if (k.MINUS.isDown || k.NUMPAD_SUBTRACT.isDown) this.zoomAt(cam.width / 2, cam.height / 2, 1 - delta * 0.002);
    if (moved) this.clampCamera();
  }

  viewRect(marginPx = 0) {
    const cam = this.cameras.main, m = marginPx / cam.zoom;
    return { x0: cam.worldView.x - m, y0: cam.worldView.y - m, x1: cam.worldView.right + m, y1: cam.worldView.bottom + m };
  }
  private inView(v: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number, pad = 0) { return x >= v.x0 - pad && x <= v.x1 + pad && y >= v.y0 - pad && y <= v.y1 + pad; }

  // ---------------- cities & facilities ----------------
  private anchorPx(r: number) { const R = this.sim.map.regions[r]; return { x: W2(R.cx), y: W2(R.cy) }; }

  private syncBuildings(view: ReturnType<WorldScene['viewRect']>) {
    const g = this.sim, show = this.lod !== 'far';
    // rebuild changed regions (a few per frame to stay smooth)
    let budget = 3;
    for (const r of [...this.dirtyBuild]) {
      const a = this.anchorPx(r);
      if (!this.inView(view, a.x, a.y, 200) && this.lod !== 'far') { continue; }
      if (budget-- <= 0) break;
      this.dirtyBuild.delete(r);
      this.rebuildRegion(r);
    }
    for (const c of this.cities.values()) c.img.setVisible(show && this.inView(view, c.x, c.y, c.size));
    for (const f of this.facs.values()) { const v = show && this.inView(view, f.x, f.y, 60); f.img.setVisible(v); f.team?.setVisible(v); }
    // capitals as gold markers when zoomed out
    for (const n of g.nations) {
      let m = this.capMarks.get(n.id);
      if (!n.alive || n.capital < 0) { m?.setVisible(false); continue; }
      const a = this.anchorPx(n.capital);
      if (!m) { m = this.add.image(a.x, a.y, 'atlas', 'flag0_t').setDepth(48); this.capMarks.set(n.id, m); }
      m.setPosition(a.x + 6 / this.cameras.main.zoom, a.y - 8 / this.cameras.main.zoom).setScale(1.6 / this.cameras.main.zoom).setTint(n.color).setVisible(this.lod === 'far');
    }
  }

  private rebuildRegion(r: number) {
    const g = this.sim, owner = g.owner[r];
    const a = this.anchorPx(r);
    const bl = g.buildings[r];
    const cityB = bl.find(b => b.type === 'city' || b.type === 'capital');
    const cur = this.cities.get(r);
    const cap = cityB?.type === 'capital';
    const lvl = cityB ? Math.max(1, cityB.level) : 0;
    const districts: Partial<Record<District, number>> = {};
    for (const b of bl) if ((DISTRICTS as string[]).includes(b.type) && b.level > 0) districts[b.type as District] = b.level;
    const dmg = this.cityDamage.get(r) ?? [];
    const key = cityB ? `city_${r}_${lvl}_${cap ? 1 : 0}_${owner}_${Object.entries(districts).join()}_${dmg.length}` : '';
    if (cur && cur.key !== key) { cur.img.destroy(); this.textures.remove(cur.key); this.cities.delete(r); }
    if (cityB && (!cur || cur.key !== key)) {
      // every city builds only on its owner's land and inside its own claim (closer to it than to any other city)
      const others: { x: number; y: number; R: number }[] = [];
      for (let q = 0; q < g.owner.length; q++) if (q !== r) { const c = g.buildings[q].find(b => b.type === 'city' || b.type === 'capital'); if (c) { const p = this.anchorPx(q); if (Math.abs(p.x - a.x) < 400 && Math.abs(p.y - a.y) < 400) others.push({ x: p.x, y: p.y, R: CITY.radius(Math.max(1, c.level)) }); } }
      const Rm = CITY.radius(lvl);
      const art = paintGameCity({
        cx: a.x, cy: a.y, level: lvl, capital: cap, seed: r * 31 + 7, team: rgb(owner >= 0 ? g.nations[owner].color : 0x888888), districts, damage: dmg,
        water: (x, y) => this.ground.regionAtPixel(x, y) < 0,
        ok: (x, y) => {
          const rr = this.ground.regionAtPixel(x, y);
          if (rr < 0 || !(rr === r || (owner >= 0 && g.owner[rr] === owner))) return false;
          const dm = Math.hypot(x - a.x, y - a.y);
          for (const o of others) if (dm - Rm > Math.hypot(x - o.x, y - o.y) - o.R - 20) return false;
          return true;
        },
      });
      this.textures.addCanvas(key, art.canvas);
      const img = this.add.image(art.x0, art.y0, key).setOrigin(0, 0).setDepth(5);
      this.cities.set(r, { key, img, streets: art.streets, size: art.size, radius: art.radius, x: a.x, y: a.y, chimneys: art.chimneys });
    }
    const city = this.cities.get(r);
    if (city) city.img.setAlpha(cityB && cityB.level === 0 ? 0.55 : 1);
    // facilities placed in a ring around the city, on this region's land
    const keep = new Set<string>();
    let slot = 0;
    for (const b of bl) {
      if (b.type === 'city' || b.type === 'capital') continue;
      if (city && b.level > 0 && (DISTRICTS as string[]).includes(b.type)) continue;   // drawn as a city quarter
      const fk = `${r}:${b.type}`;
      keep.add(fk);
      const existing = this.facs.get(fk);
      let pos: { x: number; y: number; dir: number };
      if (existing) pos = existing;
      else pos = this.placeFacility(r, b.type, slot, city ? city.radius : 0);
      slot++;
      const { key: tk, team } = this.reg.facility(b.type === 'fort' ? 'fort' + Math.max(1, b.level) : b.type);
      let v = existing;
      if (v && v.key !== tk) { v.img.destroy(); v.team?.destroy(); this.facs.delete(fk); v = undefined; }
      if (!v) {
        const img = this.add.image(Math.round(pos.x), Math.round(pos.y), tk).setDepth(4.8 + pos.y * 1e-6);
        const t = team ? this.add.image(Math.round(pos.x), Math.round(pos.y), team).setDepth(4.801 + pos.y * 1e-6) : null;
        v = { key: tk, img, team: t, type: b.type, x: pos.x, y: pos.y, dir: pos.dir };
        this.facs.set(fk, v);
      }
      v.img.setAlpha(b.level === 0 ? 0.5 : 1);
      if (v.team && owner >= 0) v.team.setTint(g.nations[owner].color);
      v.img.setTint(b.level === 0 ? 0xb0b0b0 : 0xffffff);
    }
    for (const [k, v] of this.facs) if (k.startsWith(r + ':') && !keep.has(k)) { v.img.destroy(); v.team?.destroy(); this.facs.delete(k); }
  }

  /** Picks a spot for a facility: ports on the coast facing the sea, others around the city. */
  private placeFacility(r: number, type: string, slot: number, cityR: number) {
    const g = this.sim, map = g.map, R = map.regions[r], a = this.anchorPx(r);
    if (type === 'port') {
      let best = { x: a.x, y: a.y, dir: 0, d: Infinity };
      for (const t of R.tiles) {
        const x = t % map.w, y = (t / map.w) | 0;
        for (const [dx, dy, dir] of [[1, 0, 0], [0, 1, 2], [-1, 0, 4], [0, -1, 6]] as const) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || map.regionOf[ny * map.w + nx] >= 0) continue;
          const px = W2(x) + dx * 6, py = W2(y) + dy * 6, d = Math.hypot(px - a.x, py - a.y);
          if (d < best.d) best = { x: px, y: py, dir, d };
        }
      }
      return best;
    }
    const want = cityR + 30;
    for (let k = 0; k < 24; k++) {
      const ang = (slot * 2.399 + k * 0.52) % (Math.PI * 2), rad = want * (0.75 + (k % 4) * 0.12);
      const x = a.x + Math.cos(ang) * rad, y = a.y + Math.sin(ang) * rad;
      const rr = this.ground.regionAtPixel(x, y);
      if (rr === r || (rr >= 0 && g.owner[rr] === g.owner[r] && g.owner[r] >= 0)) return { x, y, dir: 0 };
    }
    return { x: a.x + (slot % 2 ? 24 : -24), y: a.y + 22, dir: 0 };
  }

  // ---------------- armies ----------------
  private takeText() { return this.textPool.pop() ?? this.add.bitmapText(0, 0, 'digits', '').setDepth(55).setOrigin(0.5, 1); }
  private dropText(t: Phaser.GameObjects.BitmapText) { t.setVisible(false); this.textPool.push(t); }
  private dropVis(v: Vis) { for (const p of v.parts) { p.img.destroy(); p.team?.destroy(); } if (v.label) this.dropText(v.label); }

  private armyModels(a: Army): string[] {
    const out: string[] = [];
    const tanks = Math.min(3, Math.ceil(a.tank / 15)), arts = Math.min(2, Math.ceil(a.art / 15));
    for (let i = 0; i < tanks; i++) out.push('mbt');
    if (!tanks && !arts) { for (let i = 0; i < Math.min(3, Math.ceil(a.inf / 140)); i++) out.push('technical'); }   // light raid: infantry + gun trucks
    else { if (a.inf > 150) out.push(a.id % 2 ? 'apc' : 'ifv'); if (a.inf > 600) out.push('truck'); }
    for (let i = 0; i < arts; i++) out.push('spg');
    const soldiers = Math.max(2, Math.min(8, Math.round(Math.log2(a.inf + 1))));
    for (let i = 0; i < soldiers; i++) out.push('soldier');
    return out;
  }

  private syncArmies(view: ReturnType<WorldScene['viewRect']>) {
    const g = this.sim, z = this.cameras.main.zoom;
    const seen = new Set<number>();
    const far = this.lod === 'far';
    for (const a of g.armies.values()) {
      if (a.state === 'embarked' || a.state === 'stationed') continue;
      // zoomed out, only the player's own armies are drawn — the map stays readable
      if (far && a.owner !== this.human) continue;
      const x = W2(a.x), y = W2(a.y);
      if (!this.inView(view, x, y)) continue;
      seen.add(a.id);
      let v = this.armyVis.get(a.id);
      if (!v) { v = { parts: [], label: this.takeText(), heading: 0, lx: x, ly: y }; this.armyVis.set(a.id, v); }
      const nxt = a.path[Math.min(a.idx + 1, a.path.length - 1)];
      const T = g.map.regions[nxt];
      if (a.state === 'march' || a.state === 'fight') v.heading = Math.atan2(W2(T.cy) - y, W2(T.cx) - x);
      const models = far ? ['mbt'] : this.armyModels(a);
      while (v.parts.length > models.length) { const p = v.parts.pop()!; p.img.destroy(); p.team?.destroy(); }
      const col = g.nations[a.owner].color;
      const dir = dirIndex(v.heading);
      const fx = Math.cos(v.heading), fy = Math.sin(v.heading);
      let vi = 0, si = 0, back = 0;
      models.forEach((m, i) => {
        const fighting = a.state === 'fight';
        const pose = ['soldier_prone', 'soldier_aim', 'soldier_fire', 'soldier_prone'][(Math.floor(this.time.now / 220) + i) % 4];
        const model = m === 'soldier' ? (fighting ? pose : 'soldier' + [0, 1, 0, 2][(this.walkFrame2 + i) % 4]) : m;
        const key = this.reg.model(model);
        let p = v!.parts[i];
        if (!p) { p = { img: this.add.image(0, 0, key, '0').setDepth(20), team: this.add.image(0, 0, key, '0_t').setDepth(20.01), model }; v!.parts.push(p); }
        if (p.model !== model) { p.img.setTexture(key, '0'); p.team!.setTexture(key, '0_t'); p.model = model; }
        // formation: vehicles in a column, infantry fanned out behind
        let ox: number, oy: number;
        if (m === 'soldier') { const row = Math.floor(si / 3), col3 = (si % 3) - 1; ox = -fx * (back + 8 + row * 7) - fy * col3 * 6; oy = -fy * (back + 8 + row * 7) + fx * col3 * 6; si++; }
        else { const len = this.reg.modelSize(m); ox = -fx * back + (vi % 2 ? -fy * 7 : 0); oy = -fy * back + (vi % 2 ? fx * 7 : 0); back += len + 3; vi++; }
        const sc = far ? Math.max(1, 0.9 / z) : 1;
        p.img.setFrame(String(dir)).setPosition(Math.round(x + ox * sc), Math.round(y + oy * sc)).setScale(sc).setVisible(true);
        p.team!.setFrame(dir + '_t').setPosition(Math.round(x + ox * sc), Math.round(y + oy * sc)).setScale(sc).setTint(col).setVisible(true);
      });
      // firefight: tracers from the line towards the defenders, guns rattling
      if (a.state === 'fight' && !far) {
        const T2 = g.map.regions[a.target >= 0 ? a.target : nxt], tx = W2(T2.cx), ty = W2(T2.cy);
        if (Math.random() < 0.35 && v.parts.length) { const p = v.parts[Math.floor(Math.random() * v.parts.length)]; this.fx.tracer(p.img.x, p.img.y, tx + (Math.random() - 0.5) * 18, ty + (Math.random() - 0.5) * 14, 0xffe070); this.fx.muzzle(p.img.x, p.img.y, v.heading); }
        if (Math.random() < 0.05) sfx.gun(this.where(x, y), 5);
        if (a.tank > 0.5 && Math.random() < 0.02) { this.fx.tracer(x, y, tx, ty, 0xfff4c0); this.time.delayedCall(200, () => this.boom(tx + (Math.random() - 0.5) * 14, ty + (Math.random() - 0.5) * 10, 0.8)); }
      }
      this.lossFx('a' + a.id, a.inf, a.tank + a.art, v.parts.map(p => ({ x: p.img.x, y: p.img.y, model: p.model })), v.heading, a.owner);
      const showLabel = !far || a.owner === this.human;
      v.label!.setText(fmt(a.inf + a.tank + a.art)).setPosition(x, y - 14 / Math.max(z, 0.6)).setScale(Math.max(0.35, 1.4 / z))
        .setTint(a.state === 'fight' ? 0xff9080 : a.owner === this.human ? 0xbfe0ff : 0xffffff).setVisible(showLabel);
    }
    for (const [id, v] of this.armyVis) if (!seen.has(id)) { this.dropVis(v); this.armyVis.delete(id); }
  }


  /** Casualties made visible: a vehicle that is lost explodes and leaves a burning wreck; fallen infantry stay on the ground for a while. */
  private lossFx(id: string, inf: number, heavy: number, parts: { x: number; y: number; model: string }[], heading: number, _owner: number) {
    const prevI = this.seenLoss.get(id + 'i'), prevH = this.seenLoss.get(id + 'h');
    this.seenLoss.set(id + 'i', inf); this.seenLoss.set(id + 'h', heavy);
    if (prevI === undefined || this.lod === 'far' || !parts.length) return;
    const veh = parts.filter(p => !p.model.startsWith('soldier')), men = parts.filter(p => p.model.startsWith('soldier'));
    if (prevH! - heavy >= 1 && veh.length) {
      const p = veh[Math.floor(Math.random() * veh.length)];
      const wreck = this.reg.model(p.model.replace(/_wreck$/, '') + '_wreck');
      this.boom(p.x, p.y, 1.1);
      this.corpse(wreck, String(dirIndex(heading)), p.x, p.y, 40000);
      this.fx.fire(p.x, p.y + 2, 20000);
    }
    const dead = Math.min(4, Math.floor((prevI! - inf) / 12));
    for (let i = 0; i < dead && men.length; i++) {
      const p = men[Math.floor(Math.random() * men.length)];
      this.corpse(this.reg.model('soldier_down'), String(dirIndex(heading + (Math.random() - 0.5) * 2)), p.x + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 6, 18000);
    }
  }

  /** Defenders on the ground: fort crews in their trench and tanks hull-down, or the region's garrison when it is attacked. */
  private syncBattles(view: ReturnType<WorldScene['viewRect']>, now: number) {
    const g = this.sim, used = new Set<number>();
    if (this.lod === 'far') { for (const [r, v] of this.battleVis) { v.men.forEach(m => m.destroy()); this.battleVis.delete(r); } return; }
    const want = new Set<number>(g.battles.keys());
    for (const f of this.facs.values()) if (f.type === 'fort') want.add(Number([...this.facs.entries()].find(e => e[1] === f)![0].split(':')[0]));
    for (const r of want) {
      const R = g.map.regions[r], o = g.owner[r];
      const fort = g.building(r, 'fort'), fv = this.facs.get(r + ':fort');
      const cx = fv ? fv.x : W2(R.cx), cy = fv ? fv.y : W2(R.cy);
      if (!this.inView(view, cx, cy, 60)) continue;
      used.add(r);
      const fighting = g.battles.has(r);
      // face the nearest hostile neighbour
      let ang = 0, best = Infinity;
      for (const m of R.neighbors) if (g.owner[m] !== o) { const M = g.map.regions[m], d = (M.cx - R.cx) ** 2 + (M.cy - R.cy) ** 2; if (d < best) { best = d; ang = Math.atan2(M.cy - R.cy, M.cx - R.cx); } }
      const gq = fort?.garrison;
      const nTank = gq ? Math.min(4, Math.ceil(gq.tank - 0.05)) : fighting ? Math.min(2, Math.ceil(g.tank[r] / 15)) : 0;
      const nMen = gq ? Math.min(10, Math.ceil(gq.inf / 18)) : fighting ? Math.min(8, Math.ceil((o < 0 ? g.neutral[r] : g.inf[r]) / 25)) : 0;
      let v = this.battleVis.get(r);
      if (!v) { v = { men: [], t: 0 }; this.battleVis.set(r, v); }
      const color = o >= 0 ? g.nations[o].color : 0xa0a0a0;
      let fixedDir = -1;
      const fx = Math.cos(ang), fy = Math.sin(ang);
      let k = 0;
      const put = (model: string, x: number, y: number, tint: boolean) => {
        const key = this.reg.model(model);
        let img = v!.men[k], team = v!.men[k + 1];
        if (!img) { img = this.add.image(0, 0, key, '0').setDepth(19); team = this.add.image(0, 0, key, '0_t').setDepth(19.01); v!.men.push(img, team); }
        const dir = fixedDir >= 0 ? fixedDir : dirIndex(ang);
        img.setTexture(key, String(dir)).setPosition(Math.round(x), Math.round(y)).setVisible(true);
        team.setTexture(key, dir + '_t').setPosition(Math.round(x), Math.round(y)).setTint(color).setVisible(tint);
        k += 2;
        return img;
      };
      const side = (i: number, n: number, sp: number) => (i - (n - 1) / 2) * sp;
      const shooters: Phaser.GameObjects.Image[] = [];
      if (fv) {
        // the fort's crew sits in its trench, armour parked hull-down between trench and tank obstacles
        // art is 64×48 centred on (cx, cy): tanks sit in their pits facing the border, riflemen line the trench
        const ox = cx - 32, oy = cy - 24, lvl = fort?.level ?? 1;
        fixedDir = 0;   // fort art faces east: crews and guns face the obstacles
        FORT_PITS.slice(0, Math.min(nTank, lvl >= 3 ? 3 : 2)).forEach(([px, py]) => put('mbt', ox + px, oy + py, true));
        const men = Math.min(nMen, 6);
        for (let i = 0; i < men; i++) {
          const pose = fighting ? ['soldier_aim', 'soldier_fire', 'soldier_prone'][(Math.floor(now / 200) + i) % 3] : 'soldier_prone';
          shooters.push(put(pose, ox + FORT_TRENCH.x0 + 4 + i * 7, oy + FORT_TRENCH.y, true));
        }
      } else {
        for (let i = 0; i < nTank; i++) put('mbt', cx + fx * 8 - fy * side(i, nTank, 22), cy + fy * 8 + fx * side(i, nTank, 22), true);
        for (let i = 0; i < nMen; i++) {
          const pose = ['soldier_prone', 'soldier_aim', 'soldier_fire'][(Math.floor(now / 200) + i) % 3], row = i % 2;
          shooters.push(put(pose, cx + fx * (18 + row * 7) - fy * side(i >> 1, Math.ceil(nMen / 2), 9), cy + fy * (18 + row * 7) + fx * side(i >> 1, Math.ceil(nMen / 2), 9), true));
        }
      }
      if (fighting) for (const img of shooters) if (Math.random() < 0.06) {
        const tx = img.x + fx * (30 + Math.random() * 30) + (Math.random() - 0.5) * 20, ty = img.y + fy * (30 + Math.random() * 30) + (Math.random() - 0.5) * 20;
        this.fx.tracer(img.x, img.y, tx, ty, 0xffd070); this.fx.muzzle(img.x, img.y, ang);
      }
      if (fighting && nTank && Math.random() < 0.03) { const tx = cx + fx * 60, ty = cy + fy * 60; this.fx.muzzle(cx + fx * 14, cy + fy * 14, ang); this.fx.tracer(cx, cy, tx, ty, 0xfff4c0); this.time.delayedCall(220, () => this.boom(tx + (Math.random() - 0.5) * 16, ty + (Math.random() - 0.5) * 16, 0.8)); sfx.boom(5, this.where(cx, cy)); }
      if (fighting && Math.random() < 0.04) sfx.gun(this.where(cx, cy), 4, !!gq);
      for (let i = k; i < v.men.length; i++) v.men[i].setVisible(false);
      if (gq) this.lossFx('f' + r, gq.inf, gq.tank, v.men.filter((_, i) => i % 2 === 0 && v!.men[i].visible).map(m => ({ x: m.x, y: m.y, model: m.texture.key.replace(/^m_/, '') })), ang, o);
    }
    for (const [r, v] of this.battleVis) if (!used.has(r)) { v.men.forEach(m => m.destroy()); this.battleVis.delete(r); }
  }

  /** Troop numbers: own and frontline regions at mid zoom, everything in view up close. */
  private syncGarrisons(view: ReturnType<WorldScene['viewRect']>) {
    const g = this.sim, z = this.cameras.main.zoom;
    let used = 0;
    if (this.lod !== 'far') {
      const ts = this.lod === 'near' ? Math.max(0.75, 1.6 / z) : Math.max(0.3, 1.3 / z);
      for (const R of g.map.regions) {
        const x = W2(R.cx), y = W2(R.cy);
        if (!this.inView(view, x, y)) continue;
        const o = g.owner[R.id];
        if (this.lod === 'mid' && o !== this.human && !R.neighbors.some(n => g.owner[n] === this.human)) continue;
        const troops = o >= 0 ? g.inf[R.id] + g.tank[R.id] + g.art[R.id] : g.neutral[R.id];
        if (troops < 1 || used > 300) continue;
        const city = this.cities.get(R.id);
        const ty = y + (city ? city.size / 2 + 6 : 10);
        let t = this.troopText[used];
        if (!t) { t = this.add.bitmapText(0, 0, 'digits', '').setDepth(54).setOrigin(0.5, 0.5); this.troopText.push(t); }
        t.setText(fmt(troops)).setPosition(Math.round(x), Math.round(ty)).setScale(ts).setVisible(true)
          .setTint(o < 0 ? 0xcfcfcf : o === this.human ? 0xbfe0ff : 0xffffff).setAlpha(o < 0 ? 0.75 : 1);
        used++;
      }
    }
    for (let i = used; i < this.troopText.length; i++) this.troopText[i].setVisible(false);
  }

  // ---------------- fleets ----------------
  private fleetModels(f: Fleet) {
    const out: string[] = [];
    if (f.ships.carrier >= 0.5) out.push('carrier');
    const esc = ESCORTS[f.id % ESCORTS.length];
    for (let i = 0; i < Math.min(3, Math.ceil(f.ships.destroyer - 0.05)); i++) out.push(i === 0 ? 'destroyer' : esc);
    if (f.ships.sub >= 0.5) out.push('sub');
    for (let i = 0; i < Math.min(3, Math.ceil(f.ships.transport - 0.05)); i++) out.push(i === 2 ? 'landing' : 'transport');
    for (let i = 0; i < Math.min(2, Math.ceil(f.ships.patrol - 0.05)); i++) out.push(i ? 'corvette' : 'patrol');
    return out.slice(0, 6).length ? out.slice(0, 6) : ['patrol'];
  }

  private syncFleets(view: ReturnType<WorldScene['viewRect']>, delta: number) {
    const g = this.sim, z = this.cameras.main.zoom;
    const seen = new Set<number>();
    for (const f of g.fleets.values()) {
      if (this.lod === 'far' && f.owner !== this.human) continue;
      const x = W2(f.x), y = W2(f.y);
      if (!this.inView(view, x, y, 80)) continue;
      seen.add(f.id);
      let v = this.fleetVis.get(f.id);
      if (!v) { v = { parts: [], label: this.takeText(), heading: 0, lx: x, ly: y }; this.fleetVis.set(f.id, v); }
      const dx = x - v.lx, dy = y - v.ly;
      if (Math.abs(dx) + Math.abs(dy) > 0.05) v.heading = Math.atan2(dy, dx);
      v.lx = x; v.ly = y;
      const models = this.fleetModels(f);
      while (v.parts.length > models.length) { const p = v.parts.pop()!; p.img.destroy(); p.team?.destroy(); }
      const dir = dirIndex(v.heading), fx = Math.cos(v.heading), fy = Math.sin(v.heading);
      const sc = this.lod === 'far' ? Math.max(1, 0.7 / z) : 1;
      let back = 0;
      models.forEach((m, i) => {
        const key = this.reg.model(m);
        let p = v!.parts[i];
        if (!p) { p = { img: this.add.image(0, 0, key, '0').setDepth(15), team: this.add.image(0, 0, key, '0_t').setDepth(15.01), model: m }; v!.parts.push(p); }
        if (p.model !== m) { p.img.setTexture(key, '0'); p.team!.setTexture(key, '0_t'); p.model = m; }
        const len = this.reg.modelSize(m);
        if (i > 0) back += len * 0.55 + 5;
        const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * 9;
        const ox = -fx * back - fy * side, oy = -fy * back + fx * side;
        p.img.setFrame(String(dir)).setPosition(Math.round(x + ox * sc), Math.round(y + oy * sc)).setScale(sc).setAlpha(m === 'sub' ? 0.82 : 1).setVisible(true);
        p.team!.setFrame(dir + '_t').setPosition(Math.round(x + ox * sc), Math.round(y + oy * sc)).setScale(sc).setTint(g.nations[f.owner].color).setVisible(true);
        // wake behind moving ships
        if (this.lod === 'near' && f.path.length && Math.random() < delta / 90) this.spawnAmbient('u_wake', x + ox - fx * len * 0.5, y + oy - fy * len * 0.5, -fx * 3, -fy * 3, 1100, 'wake');
      });
      if (f.combat < 1 && this.lod !== 'far' && Math.random() < 0.2) this.spark(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 20, 0xfff0a0);
      const total = SEA_UNITS.reduce((s, k) => s + Math.ceil(f.ships[k] - 0.05), 0);
      v.label!.setText(String(total)).setPosition(x, y - 16).setScale(Math.max(0.35, 1.4 / z)).setTint(f.combat < 1 ? 0xff9080 : 0xd0f0ff).setVisible(this.lod !== 'far');
    }
    for (const [id, v] of this.fleetVis) if (!seen.has(id)) { this.dropVis(v); this.fleetVis.delete(id); }
  }

  // ---------------- aircraft ----------------
  private planeModel(kind: string, _owner: number) {
    return kind === 'drone' ? 'reaper' : kind;
  }

  private syncAir(view: ReturnType<WorldScene['viewRect']>, delta: number, now: number) {
    const g = this.sim, z = this.cameras.main.zoom;
    const seen = new Set<string>();
    const place = (key: string, model: string, x: number, y: number, heading: number, owner: number, alt: number, parkScale = 1) => {
      seen.add(key);
      let v = this.planeVis.get(key);
      const tex = this.reg.model(model);
      if (v && v.model !== model) { v.img.destroy(); v.team?.destroy(); v.shadow.destroy(); v.rotors.forEach(r => r.destroy()); v.flame?.destroy(); this.planeVis.delete(key); v = undefined; }
      if (!v) {
        const shadow = this.add.image(0, 0, tex, '0').setTint(0x2a1838).setAlpha(0.38).setDepth(30);
        const img = this.add.image(0, 0, tex, '0').setDepth(40);
        const team = this.add.image(0, 0, tex, '0_t').setDepth(40.01);
        const rotors = (ROTOR_OFFSETS[model] ?? []).map((_, i) => this.add.image(0, 0, this.reg.rotor(model, i), '0').setDepth(40.02));
        const flame = FIGHTERS.includes(model) || BOMBERS.includes(model) ? this.add.image(0, 0, 'atlas', 'px').setDepth(39.9).setTint(0xffb040) : null;
        v = { img, team, shadow, rotors, model, heading: heading, lx: x, ly: y, flame };
        this.planeVis.set(key, v);
      }
      // smooth banking turn towards the travel heading
      let dh = heading - v.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      v.heading += dh * Math.min(1, delta / 220);
      const dir = dirIndex(v.heading);
      const sc = (this.lod === 'far' ? Math.max(1, 0.6 / z) : 1) * parkScale;
      const px = Math.round(x), py = Math.round(y - alt * 0.6);
      v.shadow.setFrame(String(dir)).setPosition(Math.round(x + alt * 0.8), Math.round(y + alt * 0.5)).setScale(sc).setVisible(alt > 0.5);
      v.img.setFrame(String(dir)).setPosition(px, py).setScale(sc);
      v.team?.setFrame(dir + '_t').setPosition(px, py).setScale(sc).setTint(g.nations[owner].color);
      (ROTOR_OFFSETS[model] ?? []).forEach((r, i) => {
        const rot = v!.rotors[i];
        rot.setFrame(String(Math.floor(now / 45 + i * 3) % 6)).setPosition(Math.round(px + Math.cos(v!.heading) * r.dx * sc), Math.round(py + Math.sin(v!.heading) * r.dx * sc)).setScale(sc);
      });
      if (v.flame) {
        const back = this.reg.modelSize(model) * 0.42;
        const on = alt > 0.5 && this.lod !== 'far';
        v.flame.setVisible(on).setPosition(px - Math.cos(v.heading) * back, py - Math.sin(v.heading) * back).setScale(1 + Math.random() * 0.8).setTint(Math.random() < 0.5 ? 0xffd060 : 0xff7a30);
      }
    };
    // a sortie flipping from 'out' to 'back' has just delivered its weapons: animate them
    for (const s of g.sorties.values()) {
      const prev = this.sortiePhase.get(s.id);
      if (prev === 'out' && s.phase === 'back' && this.lod !== 'far') this.strikeFx(s);
      this.sortiePhase.set(s.id, s.phase);
    }
    for (const id of [...this.sortiePhase.keys()]) if (!g.sorties.has(id)) this.sortiePhase.delete(id);
    for (const s of g.sorties.values()) {
      const x = W2(s.x), y = W2(s.y);
      // planes shot down on the way spin down in flames; new sorties roar off the runway
      const tot = AIR_UNITS.reduce((t, k) => t + s.planes[k], 0), key = 'sp' + s.id, prev = this.seenLoss.get(key);
      this.seenLoss.set(key, tot);
      if (prev === undefined) { const fast = s.planes.f35 + s.planes.su57 + s.planes.f16 > 0; sfx.jet(this.where(x, y), fast ? 1.8 : 1); if (s.planes.apache + s.planes.blackhawk > 0) sfx.rotor(this.where(x, y)); }
      else if (prev - tot >= 0.5 && this.inView(view, x, y, 80)) {
        const k = AIR_UNITS.find(u => s.planes[u] > 0) ?? 'f16', m = this.planeModel(k, s.owner);
        this.fx.crash(this.reg.model(m), String(dirIndex(Math.atan2(s.ty - s.y, s.tx - s.x))), x, y, 9, Math.atan2(s.ty - s.y, s.tx - s.x));
        this.fx.explosion(x, y, 7, { alt: 9 });
        sfx.boom(8, this.where(x, y));
      }
      if (!this.inView(view, x, y, 60)) continue;
      const heading = Math.atan2(s.ty - s.y, s.tx - s.x);
      const travelled = Math.hypot(s.x - s.fromX, s.y - s.fromY);
      const alt = Math.min(10, 3 + travelled * 2);   // climb after take-off
      let i = 0;
      for (const k of AIR_UNITS) {
        const n = Math.min(3, Math.ceil(s.planes[k] - 0.05));
        for (let j = 0; j < n; j++, i++) {
          const fx = Math.cos(heading), fy = Math.sin(heading), side = i === 0 ? 0 : (i % 2 ? 1 : -1) * 9 * Math.ceil(i / 2);
          place(`s${s.id}:${i}`, this.planeModel(k, s.owner), x - fx * 8 * Math.ceil(i / 2) - fy * side, y - fy * 8 * Math.ceil(i / 2) + fx * side, heading, s.owner, k === 'apache' || k === 'blackhawk' || k === 'drone' ? alt * 0.6 : alt);
        }
      }
    }
    if (z >= 2.4) for (const a of g.airGroups.values()) {
      const p = a.carrier >= 0 ? g.fleets.get(a.carrier) : null;
      const fac = a.carrier < 0 ? this.facs.get(a.base + ':airbase') : null;
      const bx = p ? W2(p.x) : fac ? fac.x : W2(g.map.regions[a.base].cx), by = p ? W2(p.y) : fac ? fac.y : W2(g.map.regions[a.base].cy);
      if (!this.inView(view, bx, by)) continue;
      const hv = p ? this.fleetVis.get(p.id)?.heading ?? 0 : 0;
      // parked aircraft: a neat row on the apron / along the carrier deck, at reduced scale
      let i = 0;
      for (const k of AIR_UNITS) for (let j = 0; j < Math.min(2, Math.floor(a.planes[k])) && i < (p ? 4 : 3); j++, i++) {
        const along = p ? 14 - i * 9 : (i - 1) * 13, across = p ? -2 : 10;
        const x = bx + Math.cos(hv) * along - Math.sin(hv) * across, y = by + Math.sin(hv) * along + Math.cos(hv) * across;
        place(`g${a.id}:${i}`, this.planeModel(k, a.owner), x, y, hv + (p ? Math.PI : -Math.PI / 2), a.owner, 0, 0.7);
      }
    }
    for (const [k, v] of this.planeVis) if (!seen.has(k)) { v.img.destroy(); v.team?.destroy(); v.shadow.destroy(); v.rotors.forEach(r => r.destroy()); v.flame?.destroy(); this.planeVis.delete(k); }
  }

  /** Weapon effects for one strike, by aircraft type: missiles, rocket salvos, gun tracers, carpet bombing. */
  private strikeFx(s: { id: number; planes: Record<string, number>; x: number; y: number; tx: number; ty: number; fromX: number; fromY: number }) {
    const tx = W2(s.tx), ty = W2(s.ty);
    if (!this.inView(this.viewRect(200), tx, ty)) return;
    const hx = Math.cos(Math.atan2(s.ty - s.fromY, s.tx - s.fromX)), hy = Math.sin(Math.atan2(s.ty - s.fromY, s.tx - s.fromX));
    const at = (back: number, side = 0) => ({ x: tx - hx * back - hy * side, y: ty - hy * back + hx * side });
    let delay = 0;
    const missile = (from: { x: number; y: number }, to: { x: number; y: number }, d: number, frame = 'u_missile') => this.time.delayedCall(d, () => {
      const m = this.add.image(from.x, from.y, 'atlas', frame).setDepth(45).setRotation(Math.atan2(to.y - from.y, to.x - from.x));
      const dur = 280 + Math.hypot(to.x - from.x, to.y - from.y) * 2;
      const trail = this.time.addEvent({ delay: 40, loop: true, callback: () => this.spawnAmbient('u_smoke', m.x, m.y, 0, -2, 700, 'trail') });
      this.tweens.add({ targets: m, x: to.x, y: to.y, duration: dur, ease: 'Quad.easeIn', onComplete: () => { trail.remove(); m.destroy(); this.boom(to.x, to.y, 0.8); } });
    });
    const tracers = (from: { x: number; y: number }, n: number, d: number, spread: number, color = 0xffe070) => {
      for (let i = 0; i < n; i++) this.time.delayedCall(d + i * 55, () => {
        const to = { x: tx + (Math.random() - 0.5) * spread, y: ty + (Math.random() - 0.5) * spread };
        const t = this.add.image(from.x, from.y, 'atlas', 'px').setDepth(44).setTint(color).setScale(1.6, 0.5).setRotation(Math.atan2(to.y - from.y, to.x - from.x));
        this.tweens.add({ targets: t, x: to.x, y: to.y, duration: 120, onComplete: () => { t.destroy(); this.spark(to.x, to.y, 0xffc040); if (Math.random() < 0.25) this.spawnAmbient('u_smoke', to.x, to.y, 0, -3, 600, 'smoke'); } });
      });
    };
    const p = s.planes;
    if (p.f16 + p.f35 + p.su57 + p.drone >= 0.5) for (let i = 0; i < Math.min(4, Math.ceil(p.f16 + p.f35 + p.su57 + p.drone)); i++) missile(at(46, (i - 1.5) * 6), { x: tx + (Math.random() - 0.5) * 10, y: ty + (Math.random() - 0.5) * 10 }, delay + i * 140);
    if (p.apache >= 0.5) { for (let i = 0; i < 6; i++) missile(at(34, (i % 2 ? 4 : -4)), { x: tx + (Math.random() - 0.5) * 14, y: ty + (Math.random() - 0.5) * 14 }, 120 + i * 90); tracers(at(30), 14, 300, 16); }
    if (p.blackhawk >= 0.5) { tracers(at(26, 6), 10, 100, 18, 0xfff0a0); tracers(at(26, -6), 10, 160, 18, 0xfff0a0); }
    if (p.ac130 >= 0.5) { tracers(at(10, 34), 26, 0, 22, 0xffd050); for (let i = 0; i < 3; i++) this.time.delayedCall(400 + i * 450, () => this.boom(tx + (Math.random() - 0.5) * 18, ty + (Math.random() - 0.5) * 18, 1)); }
    if (p.b52 + p.b2 >= 0.5) {
      // carpet bombing along the flight path
      for (let i = 0; i < 9; i++) this.time.delayedCall(i * 110, () => {
        const q = at(28 - i * 7, (Math.random() - 0.5) * 10);
        const b = this.add.image(q.x - hx * 6, q.y - hy * 6 - 10, 'atlas', 'u_warhead').setDepth(44).setScale(0.8).setRotation(Math.PI / 2);
        this.tweens.add({ targets: b, y: q.y, x: q.x, scale: 0.5, duration: 260, ease: 'Quad.easeIn', onComplete: () => { b.destroy(); this.boom(q.x, q.y, 1.3); this.spawnAmbient('u_smoke', q.x, q.y, 1, -4, 1800, 'smoke'); } });
      });
    }
  }

  // ---------------- missiles & effects ----------------
  private syncMissiles(delta: number) {
    const g = this.sim;
    const seen = new Set<number>();
    for (const m of g.missiles.values()) {
      seen.add(m.id);
      let v = this.missileVis.get(m.id);
      if (!v) { v = { img: this.add.image(0, 0, 'atlas', m.weapon === 'mirv' ? 'u_warhead' : 'u_missile').setDepth(58), trail: 0 }; this.missileVis.set(m.id, v); }
      const k = Math.min(1, m.t / m.dur);
      const dist = Math.hypot(m.tx - m.sx, m.ty - m.sy) * TILE;
      const arc = (t: number) => Math.sin(Math.PI * t) * Math.min(420, dist * 0.3);
      const x = W2(m.x), y = W2(m.y) - arc(k);
      const k2 = Math.min(1, k + 0.01);
      const nx = W2(m.sx + (m.tx - m.sx) * k2), ny = W2(m.sy + (m.ty - m.sy) * k2) - arc(k2);
      v.img.setPosition(x, y).setRotation(Math.atan2(ny - y, nx - x)).setScale(Math.max(1.5, 1.6 / this.cameras.main.zoom));
      v.trail += delta;
      if (v.trail > 35) { v.trail = 0; this.spawnAmbient('u_smoke', x, y, 0, 0, 1500, 'trail'); }
    }
    for (const [id, v] of this.missileVis) if (!seen.has(id)) { v.img.destroy(); this.missileVis.delete(id); }
  }

  private handleFx() {
    const g = this.sim;
    if (!g.fx.length) return;
    const view = this.viewRect(80);
    for (const f of g.fx) {
      if (f.k === 'explosion') {
        const x = W2(f.x), y = W2(f.y);
        if (f.nuke) this.nukeFx(x, y, f.r);
        else if (this.inView(view, x, y, 60)) { const n = Math.min(6, 1 + Math.round(f.r * 2)); for (let i = 0; i < n; i++) this.time.delayedCall(i * 140, () => this.boom(x + (Math.random() - 0.5) * f.r * 20, y + (Math.random() - 0.5) * f.r * 16, Math.min(3, 1 + f.r * 0.5))); }
        else this.damageCity(x, y, 10 + f.r * 8, 0);
      } else if (f.k === 'shot') {
        const x = W2(f.x), y = W2(f.y), tx = W2(f.tx), ty = W2(f.ty);
        if (!this.inView(view, tx, ty) || this.lod === 'far') continue;
        this.fx.tracer(x, y, tx, ty, f.sea ? 0xfff1a0 : 0xffe066);
        sfx.gun(this.where(x, y), 3, true);
        this.time.delayedCall(Math.max(60, Math.hypot(tx - x, ty - y) * 2.2), () => this.boom(tx, ty, f.sea ? 0.7 : 0.55));
      } else if (f.k === 'intercept') {
        const x = W2(f.x), y = W2(f.y);
        if (this.inView(view, x, y, 80)) { this.boom(x, y, 1.6, 70); sfx.launch(this.where(x, y)); }
      } else if (f.k === 'capture') {
        if (this.lod === 'far') continue;
        const a = this.anchorPx(f.region);
        if (!this.inView(view, a.x, a.y)) continue;
        const fl = this.add.image(a.x, a.y - 6, 'atlas', 'flag0_t').setTint(g.nations[f.owner].color).setDepth(56).setScale(1);
        this.tweens.add({ targets: fl, y: a.y - 26, scale: 2, alpha: 0, duration: 1000, onComplete: () => fl.destroy() });
      }
    }
    g.fx.length = 0;
  }

  private spark(x: number, y: number, color: number) {
    const s = this.add.image(Math.round(x), Math.round(y), 'atlas', 'px').setDepth(42).setTint(color).setScale(1.5);
    this.tweens.add({ targets: s, alpha: 0, scale: 0.5, duration: 160, onComplete: () => s.destroy() });
  }

  /** Generic explosion (scale 1 ≈ a tank shell). Ground blasts scar the terrain and damage cities. */
  boom(x: number, y: number, scale = 1, alt = 0) {
    this.fx.explosion(x, y, 4 + scale * 4, { alt, crater: !alt && scale >= 0.8 && this.ground.regionAtPixel(x, y) >= 0, fires: scale > 1.2 ? 2 : 0 });
    sfx.boom(4 + scale * 4, this.where(x, y));
    if (!alt && scale >= 1) this.damageCity(x, y, 6 + scale * 6);
  }

  /** Stereo position and loudness of something happening at world (x, y). */
  where(x: number, y: number): sfx.Where {
    const cam = this.cameras.main, v = cam.worldView;
    const pan = ((x - v.x) / Math.max(1, v.width)) * 2 - 1;
    const inside = x > v.x - 40 && x < v.right + 40 && y > v.y - 40 && y < v.bottom + 40;
    const d = Math.hypot(x - v.centerX, y - v.centerY) / Math.max(v.width, v.height);
    return { pan, gain: inside ? Math.min(1, 0.25 + cam.zoom * 0.18) * Math.max(0.3, 1 - d) : 0.06 };
  }

  /** Records a blast on any city it touches; the city redraws with ruins once the smoke has covered it. */
  damageCity(x: number, y: number, r: number, delay = 900) {
    for (const [reg, c] of this.cities) {
      if (Math.hypot(x - c.x, y - c.y) > c.radius + r + 20) continue;
      const list = this.cityDamage.get(reg) ?? [];
      list.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r) });
      if (list.length > 40) list.shift();
      this.cityDamage.set(reg, list);
      this.time.delayedCall(delay, () => this.dirtyBuild.add(reg));
    }
  }

  private nukeFx(x: number, y: number, radius: number) {
    const R = radius * TILE;
    sfx.boom(60, this.where(x, y));
    this.fx.nuke(x, y, Math.min(140, R * 0.55), () => this.damageCity(x, y, R * 0.8, 0));
  }

  private ageCorpses(delta: number) {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i]; c.t -= delta;
      if (c.t < 3000) c.o.setAlpha(Math.max(0, c.t / 3000));
      if (c.t <= 0) { c.o.destroy(); this.corpses.splice(i, 1); }
    }
  }
  private corpse(tex: string, frame: string, x: number, y: number, ms: number, tint?: number) {
    if (this.corpses.length > 160) { this.corpses.shift()!.o.destroy(); }
    const o = this.add.image(Math.round(x), Math.round(y), tex, frame).setDepth(6);
    if (tint !== undefined) o.setTint(tint);
    this.corpses.push({ o, t: ms });
  }

  // ---------------- ambient life ----------------
  private spawnAmbient(frame: string, x: number, y: number, vx: number, vy: number, life: number, kind: string, tex = 'atlas', team?: number) {
    if (this.ambient.length > 320) return;
    const img = this.add.image(Math.round(x), Math.round(y), tex, frame).setDepth(kind === 'trail' ? 57 : kind === 'smoke' ? 18 : kind === 'wake' || kind === 'sparkle' ? 2 : 7);
    let t: Phaser.GameObjects.Image | undefined;
    if (team !== undefined) t = this.add.image(img.x, img.y, tex, frame + '_t').setDepth(img.depth + 0.01).setTint(team);
    if (kind === 'person') img.setTint([0x3b6fb6, 0xc04040, 0x40a040, 0xe0c040, 0x8040a0, 0xe0e0e0][Math.floor(Math.random() * 6)]);
    this.ambient.push({ img, team: t, vx, vy, life, max: life, kind });
  }

  private ambientLife(view: ReturnType<WorldScene['viewRect']>, delta: number) {
    for (let i = this.ambient.length - 1; i >= 0; i--) {
      const a = this.ambient[i];
      a.life -= delta;
      a.img.x += a.vx * delta / 1000; a.img.y += a.vy * delta / 1000;
      if (a.team) { a.team.x = a.img.x; a.team.y = a.img.y; }
      const t = Math.max(0, a.life / a.max);
      if (a.kind === 'smoke' || a.kind === 'trail') { a.img.setAlpha(t * 0.85); a.img.setScale(1 + (1 - t) * 1.6); }
      else if (a.kind === 'wake' || a.kind === 'sparkle') a.img.setAlpha(Math.sin(Math.PI * t));
      else if (a.kind === 'car' || a.kind === 'person') a.img.setAlpha(Math.min(1, t * 4, (1 - t) * 6));
      if (a.life <= 0) { a.img.destroy(); a.team?.destroy(); this.ambient.splice(i, 1); }
    }
    if (this.lod !== 'near') return;
    this.ambT += delta;
    if (this.ambT < 120) return;
    this.ambT = 0;
    let cars = 0, people = 0;
    for (const a of this.ambient) { if (a.kind === 'car') cars++; else if (a.kind === 'person') people++; }
    for (const c of this.cities.values()) {
      if (!c.img.visible || !c.streets.length) continue;
      // cars drive along real streets, from one end of the block edge to the other, in their lane
      if (cars < 90 && Math.random() < 0.7) {
        const st = c.streets[Math.floor(Math.random() * c.streets.length)], horiz = st.y0 === st.y1;
        const fwd = Math.random() < 0.5, len = horiz ? st.x1 - st.x0 : st.y1 - st.y0;
        if (len < 10) continue;
        const name = ['car_r', 'car_b', 'car_w', 'car_y', 'car_g'][Math.floor(Math.random() * 5)], key = this.reg.model(name);
        const ang = horiz ? (fwd ? 0 : Math.PI) : (fwd ? Math.PI / 2 : -Math.PI / 2), lane = fwd ? 1 : -1, sp = 12 + Math.random() * 8;
        const x = horiz ? (fwd ? st.x0 : st.x1) : st.x0 + lane, y = horiz ? st.y0 + lane : (fwd ? st.y0 : st.y1);
        const img = this.add.image(x, y, key, String(dirIndex(ang))).setDepth(5.5);
        const life = len / sp * 1000;
        this.ambient.push({ img, vx: horiz ? (fwd ? sp : -sp) : 0, vy: horiz ? 0 : (fwd ? sp : -sp), life, max: life, kind: 'car' });
      }
      for (const ch of c.chimneys) if (Math.random() < 0.5) this.spawnAmbient('u_smoke', ch.x, ch.y, 2 + Math.random() * 3, -10, 2200, 'smoke');
    }
    for (const f of this.facs.values()) {
      if (!f.img.visible) continue;
      if (f.type === 'factory') for (const [cx, cy] of [[9, 4], [14, 4]]) if (Math.random() < 0.55) this.spawnAmbient('u_smoke', f.x + cx, f.y + cy, 2 + Math.random() * 3, -10, 2200, 'smoke');
      if (f.type === 'nuclear' && Math.random() < 0.4) this.spawnAmbient('u_smoke', f.x + 10, f.y - 4, 2, -7, 2600, 'smoke');
    }
    // sparkle on open water in view
    for (let i = 0; i < 4; i++) {
      const x = view.x0 + Math.random() * (view.x1 - view.x0), y = view.y0 + Math.random() * (view.y1 - view.y0);
      if (this.ground.regionAtPixel(x, y) < 0) this.spawnAmbient('u_wake', x, y, 0, 0, 1000, 'sparkle');
    }
  }

  // ---------------- labels ----------------
  private syncLabels(now: number) {
    const g = this.sim, z = this.cameras.main.zoom;
    const show = this.lod === 'far';
    if (now - this.lastLabels > 1500) {
      this.lastLabels = now;
      for (const n of g.nations) {
        let lbl = this.labels.get(n.id);
        if (!n.alive || n.area <= 0) { lbl?.setVisible(false); continue; }
        let sx = 0, sy = 0, sa = 0;
        for (let r = 0; r < g.owner.length; r++) if (g.owner[r] === n.id) { const R = g.map.regions[r]; sx += R.cx * R.area; sy += R.cy * R.area; sa += R.area; }
        if (!sa) continue;
        sx /= sa; sy /= sa;
        let best = n.capital, bd = Infinity;
        for (let r = 0; r < g.owner.length; r++) if (g.owner[r] === n.id) { const R = g.map.regions[r]; const d = (R.cx - sx) ** 2 + (R.cy - sy) ** 2; if (d < bd) { bd = d; best = r; } }
        const R = g.map.regions[best];
        if (!lbl) {
          lbl = this.add.text(0, 0, n.name, { fontFamily: 'Cairo, Tahoma, sans-serif', fontSize: '30px', color: '#ffffff', stroke: '#14101c', strokeThickness: 6, rtl: true, fontStyle: '700' }).setOrigin(0.5).setDepth(61);
          this.labels.set(n.id, lbl);
        }
        lbl.setData('size', Math.max(0.5, Math.min(3.2, Math.sqrt(n.area) / 12)));
        lbl.setPosition(W2(R.cx), W2(R.cy));
      }
    }
    for (const lbl of this.labels.values()) {
      const s = (lbl.getData('size') as number) ?? 1;
      const screen = Math.max(9, Math.min(26, s * 9 * z * 4.4));
      lbl.setScale(screen / 30 / z).setVisible(show).setAlpha(0.92);
    }
  }

  private drawTargeting() {
    const gfx = this.targetGfx;
    gfx.clear();
    if (!this.rangeCircles.length) return;
    const z = this.cameras.main.zoom;
    gfx.lineStyle(Math.max(1.5, 2 / z), 0xff5050, 0.85);
    gfx.fillStyle(0xff3030, 0.06);
    for (const c of this.rangeCircles) { gfx.fillCircle(W2(c.x), W2(c.y), c.r * TILE); gfx.strokeCircle(W2(c.x), W2(c.y), c.r * TILE); }
  }

  /** Screen position of a world tile coordinate (for anchoring HTML popups). */
  toScreen(x: number, y: number) {
    const cam = this.cameras.main;
    return { x: (W2(x) - cam.worldView.x) * cam.zoom, y: (W2(y) - cam.worldView.y) * cam.zoom };
  }
}

export { DIRS };
