// Phaser scene: draws the world from the simulation state and turns pointer input into taps.
import Phaser from 'phaser';
import type { Game } from '../../sim/game';
import { WEAPONS } from '../../sim/balance';
import { AIR_UNITS, airTotal, Army, Fleet, SEA_UNITS } from '../../sim/state';
import { buildAtlas } from '../art/sprites';
import { canvasOf } from '../art/pixel';
import { Overlay, OV, regionOutline, renderTerrain, TILE } from './terrain';

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

interface ArmyVis { body: Phaser.GameObjects.Image[]; team: Phaser.GameObjects.Image[]; label: Phaser.GameObjects.BitmapText }
interface FleetVis { ships: Phaser.GameObjects.Image[]; team: Phaser.GameObjects.Image[]; label: Phaser.GameObjects.BitmapText; heading: number; lx: number; ly: number }
interface PlaneVis { img: Phaser.GameObjects.Image; team: Phaser.GameObjects.Image | null; rotor: Phaser.GameObjects.Image | null; shadow: Phaser.GameObjects.Image }

export class WorldScene extends Phaser.Scene {
  sim!: Game;
  human = 0;
  speed = 1;
  paused = false;
  onTap: (t: TapInfo) => void = () => {};
  onFrame: () => void = () => {};
  lod: Lod = 'far';

  private overlay!: Overlay;
  private overlayTex!: Phaser.Textures.CanvasTexture;
  private overlayImg!: Phaser.GameObjects.Image;
  private overlayDirty = new Set<number>();
  private lastOverlay = 0;
  private acc = 0;
  private slots: { x: number; y: number }[][] = [];
  private bVis = new Map<string, { img: Phaser.GameObjects.Image; team?: Phaser.GameObjects.Image; key: string }>();
  private armyVis = new Map<number, ArmyVis>();
  private fleetVis = new Map<number, FleetVis>();
  private planeVis = new Map<string, PlaneVis>();
  private missileVis = new Map<number, { img: Phaser.GameObjects.Image; trail: number }>();
  private troopText: Phaser.GameObjects.BitmapText[] = [];
  private garrisonIcons: Phaser.GameObjects.Image[] = [];
  private labels = new Map<number, Phaser.GameObjects.Text>();
  private selImg: Phaser.GameObjects.Image | null = null;
  private selTween: Phaser.Tweens.Tween | null = null;
  private targetGfx!: Phaser.GameObjects.Graphics;
  private rangeCircles: { x: number; y: number; r: number }[] = [];
  private ambient: { img: Phaser.GameObjects.Image; vx: number; vy: number; life: number; kind: string }[] = [];
  private smokeT = 0;
  private flagFrame = 0;
  private lastLabels = -10;
  private drag = { down: false, x: 0, y: 0, sx: 0, sy: 0, moved: false, t: 0 };
  private pinch: { d: number; z: number } | null = null;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  worldW = 0; worldH = 0;

  constructor() { super('world'); }

  init(data: { sim: Game; human: number }) { this.sim = data.sim; this.human = data.human; }

  create() {
    const g = this.sim;
    this.worldW = g.map.w * TILE; this.worldH = g.map.h * TILE;
    // textures
    const atlas = buildAtlas();
    const at = this.textures.addCanvas('atlas', atlas.canvas)!;
    for (const [k, f] of Object.entries(atlas.frames)) at.add(k, 0, f.x, f.y, f.w, f.h);
    this.textures.addCanvas('terrain', renderTerrain(g.map));
    this.overlay = new Overlay(g);
    this.overlayTex = this.textures.addCanvas('overlay', this.overlay.canvas)!;
    this.makeDigitFont();

    this.add.image(0, 0, 'terrain').setOrigin(0).setDepth(0);
    this.overlayImg = this.add.image(0, 0, 'overlay').setOrigin(0).setScale(TILE / OV).setDepth(1);
    this.targetGfx = this.add.graphics().setDepth(40);
    this.computeSlots();

    const cam = this.cameras.main;
    cam.setBackgroundColor('#162670');
    this.fitWorld();
    this.scale.on('resize', () => this.clampCamera());

    this.input.addPointer(1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.pointerDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.pointerMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.pointerUp(p));
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomAt(p.x, p.y, dy > 0 ? 0.87 : 1.15));
    const kb = this.input.keyboard;
    if (kb) for (const k of ['LEFT', 'RIGHT', 'UP', 'DOWN', 'W', 'A', 'S', 'D', 'PLUS', 'MINUS', 'NUMPAD_ADD', 'NUMPAD_SUBTRACT'])
      this.keys[k] = kb.addKey(k, false);
    for (let r = 0; r < g.owner.length; r++) this.overlayDirty.add(r);
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
        else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || on(x - 1, y - 1) || on(x + 1, y + 1) || on(x - 1, y + 1) || on(x + 1, y - 1)) { img.data[k + 3] = 230; }
      }
    });
    ctx.putImageData(img, 0, 0);
    this.textures.addCanvas('digitsImg', c);
    const data = Phaser.GameObjects.RetroFont.Parse(this, {
      image: 'digitsImg', width: cw, height: ch, chars: DIGITS, charsPerRow: DIGITS.length,
      'offset.x': 0, 'offset.y': 0, 'spacing.x': 0, 'spacing.y': 0, lineSpacing: 0,
    } as any);
    this.cache.bitmapFont.add('digits', data as any);
  }

  /** Building slots per region: anchor first, then spaced tiles; ports prefer the coast. */
  private computeSlots() {
    const map = this.sim.map;
    for (const R of map.regions) {
      const ax = R.anchor % map.w, ay = (R.anchor / map.w) | 0;
      const tiles = [...R.tiles].sort((a, b) => {
        const da = (a % map.w - ax) ** 2 + (((a / map.w) | 0) - ay) ** 2, db = (b % map.w - ax) ** 2 + (((b / map.w) | 0) - ay) ** 2;
        return da - db;
      });
      const out: { x: number; y: number }[] = [];
      for (const t of tiles) {
        const x = t % map.w, y = (t / map.w) | 0;
        if (out.every(o => Math.abs(o.x - x) + Math.abs(o.y - y) >= 3)) out.push({ x, y });
        if (out.length >= 6) break;
      }
      while (out.length < 6) out.push({ x: ax + (out.length % 2 ? 1 : -1), y: ay + (out.length > 3 ? 1 : 0) });
      this.slots.push(out);
    }
  }

  private coastSlot(r: number) {
    const map = this.sim.map, R = map.regions[r];
    let best = R.anchor, bd = Infinity;
    const ax = R.anchor % map.w, ay = (R.anchor / map.w) | 0;
    for (const t of R.tiles) {
      const x = t % map.w, y = (t / map.w) | 0;
      const coast = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < map.w && ny < map.h && map.regionOf[ny * map.w + nx] < 0; });
      if (!coast) continue;
      const d = (x - ax) ** 2 + (y - ay) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return { x: best % map.w, y: (best / map.w) | 0 };
  }

  // ---------------- camera ----------------
  minZoom() { const cam = this.cameras.main; return Math.min(cam.width / this.worldW, cam.height / this.worldH) * 0.98; }
  fitWorld() {
    const cam = this.cameras.main;
    cam.setZoom(this.minZoom());
    cam.centerOn(this.worldW / 2, this.worldH / 2);
    this.updateLod();
  }
  flyTo(x: number, y: number, zoom?: number) {
    const cam = this.cameras.main;
    if (zoom) cam.zoomTo(Math.max(this.minZoom(), Math.min(7, zoom)), 450, 'Sine.easeInOut');
    cam.pan(W2(x), W2(y), 450, 'Sine.easeInOut');
  }
  zoomAt(sx: number, sy: number, f: number) {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(sx, sy);
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * f, this.minZoom(), 7));
    cam.preRender();
    const after = cam.getWorldPoint(sx, sy);
    cam.scrollX += before.x - after.x; cam.scrollY += before.y - after.y;
    this.clampCamera();
  }
  private clampCamera() {
    const cam = this.cameras.main;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2;
    const mx = Math.max(vw / 2, this.worldW - vw / 2), my = Math.max(vh / 2, this.worldH - vh / 2);
    const tx = vw >= this.worldW ? this.worldW / 2 : Phaser.Math.Clamp(cx - cam.width / 2 + cam.width / 2, vw / 2, mx);
    const ty = vh >= this.worldH ? this.worldH / 2 : Phaser.Math.Clamp(cy, vh / 2, my);
    cam.scrollX = tx - cam.width / 2; cam.scrollY = ty - cam.height / 2;
    if (cam.zoom < this.minZoom()) cam.setZoom(this.minZoom());
    this.updateLod();
  }
  private updateLod() {
    const z = this.cameras.main.zoom;
    this.lod = z < 0.55 ? 'far' : z < 1.7 ? 'mid' : 'near';
    // let the terrain art show through when zoomed in
    this.overlayImg?.setAlpha(z < 0.55 ? 1 : z < 1.7 ? 0.9 : Math.max(0.5, 0.9 - (z - 1.7) * 0.15));
  }

  // ---------------- input ----------------
  private pointerDown(p: Phaser.Input.Pointer) {
    const ps = this.input.manager.pointers.filter(q => q.isDown);
    if (ps.length >= 2) {
      const [a, b] = ps;
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.cameras.main.zoom };
      this.drag.moved = true;
      return;
    }
    this.drag = { down: true, x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY, moved: false, t: this.time.now };
  }
  private pointerMove(p: Phaser.Input.Pointer) {
    const ps = this.input.manager.pointers.filter(q => q.isDown);
    if (this.pinch && ps.length >= 2) {
      const [a, b] = ps;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const target = Phaser.Math.Clamp(this.pinch.z * d / Math.max(10, this.pinch.d), this.minZoom(), 7);
      this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target / this.cameras.main.zoom);
      return;
    }
    if (!this.drag.down || !p.isDown) return;
    const dx = p.x - this.drag.x, dy = p.y - this.drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 7) this.drag.moved = true;
    if (this.drag.moved) {
      const cam = this.cameras.main;
      cam.scrollX = this.drag.sx - dx / cam.zoom; cam.scrollY = this.drag.sy - dy / cam.zoom;
      this.clampCamera();
    }
  }
  private pointerUp(p: Phaser.Input.Pointer) {
    const stillDown = this.input.manager.pointers.filter(q => q.isDown).length;
    if (this.pinch) { if (stillDown === 0) { this.pinch = null; this.drag.down = false; } return; }
    if (!this.drag.down) return;
    this.drag.down = false;
    if (this.drag.moved) return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const tx = Math.floor(wp.x / TILE), ty = Math.floor(wp.y / TILE);
    const map = this.sim.map;
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return;
    const i = ty * map.w + tx;
    this.onTap({ region: map.regionOf[i], sea: map.seaOf[i], x: wp.x / TILE - 0.5, y: wp.y / TILE - 0.5 });
  }

  // ---------------- selection & targeting ----------------
  select(r: number, color = '#ffffff') {
    this.selTween?.stop(); this.selImg?.destroy(); this.selImg = null;
    if (r < 0) return;
    const o = regionOutline(this.sim.map, r, color);
    const key = 'sel' + Date.now();
    if (this.textures.exists('sel')) this.textures.remove('sel');
    this.textures.addCanvas(key, o.canvas);
    this.selImg = this.add.image(o.x * (TILE / OV), o.y * (TILE / OV), key).setOrigin(0).setScale(TILE / OV).setDepth(2);
    this.selTween = this.tweens.add({ targets: this.selImg, alpha: { from: 1, to: 0.45 }, duration: 500, yoyo: true, repeat: -1 });
  }
  setRanges(circles: { x: number; y: number; r: number }[]) { this.rangeCircles = circles; }

  markOverlay(regions: Iterable<number>) { for (const r of regions) this.overlayDirty.add(r); }

  // ---------------- main loop ----------------
  update(_t: number, delta: number) {
    const g = this.sim;
    if (!this.paused && g.phase !== 'over') {
      this.acc += Math.min(delta, 250) * this.speed;
      let steps = 0;
      while (this.acc >= 100 && steps < 12) { g.step(); this.acc -= 100; steps++; }
    }
    this.keyboardPan(delta);
    for (const r of g.dirtyRegions) this.overlayDirty.add(r);
    const changed = [...g.dirtyRegions];
    g.dirtyRegions.clear();
    const now = this.time.now;
    if (this.overlayDirty.size && now - this.lastOverlay > 120) {
      if (this.overlayDirty.size > 400) this.overlay.redrawAll(); else this.overlay.redrawRegions(this.overlayDirty);
      this.overlayDirty.clear();
      this.overlayTex.refresh();
      this.lastOverlay = now;
    }
    for (const r of changed) this.syncBuildings(r);
    if (this.bVis.size === 0 && g.phase !== 'founding') for (let r = 0; r < g.owner.length; r++) if (g.buildings[r].length) this.syncBuildings(r);
    this.updateLod();
    const view = this.viewRect(40);
    this.syncArmies(view);
    this.syncFleets(view, delta);
    this.syncAir(view, delta);
    this.syncMissiles(delta);
    this.handleFx();
    this.syncGarrisons(view);
    this.syncLabels(now);
    this.ambientLife(view, delta);
    this.drawTargeting();
    this.flagFrame = Math.floor(now / 380) % 2;
    for (const v of this.bVis.values()) if (v.team && v.key.startsWith('flag')) v.team.setFrame('flag' + this.flagFrame + '_t');
    this.onFrame();
  }

  private keyboardPan(delta: number) {
    const k = this.keys, cam = this.cameras.main;
    if (!k.LEFT) return;
    const s = delta * 0.6 / cam.zoom;
    let moved = false;
    if (k.LEFT.isDown || k.A.isDown) { cam.scrollX -= s; moved = true; }
    if (k.RIGHT.isDown || k.D.isDown) { cam.scrollX += s; moved = true; }
    if (k.UP.isDown || k.W.isDown) { cam.scrollY -= s; moved = true; }
    if (k.DOWN.isDown || k.S.isDown) { cam.scrollY += s; moved = true; }
    if (k.PLUS.isDown || k.NUMPAD_ADD.isDown) { this.zoomAt(cam.width / 2, cam.height / 2, 1 + delta * 0.002); }
    if (k.MINUS.isDown || k.NUMPAD_SUBTRACT.isDown) { this.zoomAt(cam.width / 2, cam.height / 2, 1 - delta * 0.002); }
    if (moved) this.clampCamera();
  }

  viewRect(marginPx = 0) {
    const cam = this.cameras.main;
    const m = marginPx / cam.zoom;
    return { x0: cam.worldView.x - m, y0: cam.worldView.y - m, x1: cam.worldView.right + m, y1: cam.worldView.bottom + m };
  }
  private inView(v: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number) { return x >= v.x0 && x <= v.x1 && y >= v.y0 && y <= v.y1; }

  // ---------------- buildings ----------------
  private syncBuildings(r: number) {
    const g = this.sim;
    const prefix = r + ':';
    const live = new Set<string>();
    const owner = g.owner[r];
    const slotList = this.slots[r];
    let si = 1;
    for (const b of g.buildings[r]) {
      const key = prefix + b.type;
      live.add(key);
      let slot = slotList[0];
      if (b.type === 'port') slot = this.coastSlot(r);
      else if (b.type !== 'capital' && b.type !== 'city') slot = slotList[Math.min(si++, slotList.length - 1)];
      const lvl = Math.max(1, b.level);
      const frame = b.type === 'capital' ? `capital${lvl}_${r % 3}` : b.type === 'city' ? `city${lvl}_${r % 3}` : 'b_' + b.type;
      let v = this.bVis.get(key);
      if (!v) {
        const img = this.add.image(W2(slot.x), W2(slot.y), 'atlas', frame).setDepth(5 + slot.y * 0.001);
        v = { img, key: frame };
        this.bVis.set(key, v);
      }
      if (v.key !== frame && !v.key.startsWith('flag')) { v.img.setFrame(frame); v.key = frame; }
      v.img.setPosition(W2(slot.x), W2(slot.y));
      v.img.setAlpha(b.level === 0 ? 0.5 : 1);
      if (b.level === 0) v.img.setTint(0x9a9a9a); else v.img.clearTint();
      // team flag over capitals and barracks
      if ((b.type === 'capital' || b.type === 'barracks') && owner >= 0) {
        const fk = key + ':flag';
        live.add(fk);
        let f = this.bVis.get(fk);
        const fx = W2(slot.x) + (b.type === 'capital' ? 2 : -3), fy = W2(slot.y) - (b.type === 'capital' ? 16 + lvl * 3 : 9);
        if (!f) {
          const base = this.add.image(fx, fy, 'atlas', 'flag0').setDepth(6);
          const team = this.add.image(fx, fy, 'atlas', 'flag0_t').setDepth(6.01);
          f = { img: base, team, key: 'flag' };
          this.bVis.set(fk, f);
        }
        f.img.setPosition(fx, fy); f.team!.setPosition(fx, fy).setTint(g.nations[owner].color);
      }
    }
    for (const [k, v] of this.bVis) if (k.startsWith(prefix) && !live.has(k)) { v.img.destroy(); v.team?.destroy(); this.bVis.delete(k); }
  }

  private lodBuildings() {
    // far zoom: hide clutter except capitals
    const far = this.lod === 'far';
    for (const [k, v] of this.bVis) {
      const capital = v.key.startsWith('capital') || k.includes('capital');
      v.img.setVisible(!far || capital);
      v.team?.setVisible(!far || capital);
      if (far && capital && !k.endsWith(':flag')) v.img.setScale(1.6); else if (!k.endsWith(':flag')) v.img.setScale(1);
    }
  }

  // ---------------- armies ----------------
  private textPool: Phaser.GameObjects.BitmapText[] = [];
  private takeText() { return this.textPool.pop() ?? this.add.bitmapText(0, 0, 'digits', '').setDepth(30).setOrigin(0.5, 1); }
  private dropText(t: Phaser.GameObjects.BitmapText) { t.setVisible(false); this.textPool.push(t); }

  private syncArmies(view: ReturnType<WorldScene['viewRect']>) {
    const g = this.sim, z = this.cameras.main.zoom;
    const seen = new Set<number>();
    const ts = Math.max(0.3, 1.6 / z);
    for (const a of g.armies.values()) {
      if (a.state === 'embarked' || a.state === 'stationed') continue;
      const x = W2(a.x), y = W2(a.y);
      if (!this.inView(view, x, y)) continue;
      seen.add(a.id);
      let v = this.armyVis.get(a.id);
      const size = a.inf + a.tank * 4 + a.art * 3;
      const n = Math.max(1, Math.min(5, Math.round(Math.log2(size + 1) - 2)));
      if (!v) { v = { body: [], team: [], label: this.takeText() }; this.armyVis.set(a.id, v); }
      const kinds: string[] = [];
      if (a.tank >= 1) kinds.push('u_tank');
      if (a.art >= 1) kinds.push('u_art');
      while (kinds.length < n) kinds.push('u_soldier');
      while (v.body.length < kinds.length) { v.body.push(this.add.image(0, 0, 'atlas', 'u_soldier').setDepth(20)); v.team.push(this.add.image(0, 0, 'atlas', 'u_soldier_t').setDepth(20.01)); }
      while (v.body.length > kinds.length) { v.body.pop()!.destroy(); v.team.pop()!.destroy(); }
      const next = a.path[Math.min(a.idx + 1, a.path.length - 1)];
      const dir = g.map.regions[next].cx >= a.x ? 1 : -1;
      const col = g.nations[a.owner].color;
      const sc = this.lod === 'far' ? 2.2 / Math.max(z, 0.2) * 0.35 : 1;
      kinds.forEach((k, i) => {
        const ox = ((i % 3) - 1) * 5 * sc, oy = (Math.floor(i / 3) * 5 - 2) * sc;
        v!.body[i].setFrame(k).setPosition(x + ox, y + oy).setFlipX(dir < 0).setScale(sc).setVisible(true);
        const tk = k + '_t';
        v!.team[i].setFrame(tk).setPosition(x + ox, y + oy).setFlipX(dir < 0).setScale(sc).setTint(col).setVisible(true);
      });
      const fighting = a.state === 'fight';
      v.label.setText(fmt(a.inf + a.tank + a.art)).setPosition(x, y - 6 * sc).setScale(ts).setTint(fighting ? 0xff8080 : a.owner === this.human ? 0xbfe0ff : 0xffffff).setVisible(this.lod !== 'far' || a.owner === this.human);
    }
    for (const [id, v] of this.armyVis) if (!seen.has(id)) { v.body.forEach(b => b.destroy()); v.team.forEach(b => b.destroy()); this.dropText(v.label); this.armyVis.delete(id); }
  }

  /** Troop counts on regions (and a small soldier marker) at mid/near zoom. */
  private syncGarrisons(view: ReturnType<WorldScene['viewRect']>) {
    const g = this.sim, z = this.cameras.main.zoom;
    let used = 0, icons = 0;
    if (this.lod !== 'far') {
      const ts = Math.max(0.3, 1.5 / z);
      const map = g.map;
      for (const R of map.regions) {
        const x = W2(R.cx), y = W2(R.cy);
        if (!this.inView(view, x, y)) continue;
        const o = g.owner[R.id];
        const troops = o >= 0 ? g.inf[R.id] + g.tank[R.id] + g.art[R.id] : g.neutral[R.id];
        if (troops < 1 || used > 420) continue;
        const sl = this.slots[R.id][g.buildings[R.id].length ? Math.min(g.buildings[R.id].length, 5) : 0];
        const tx = W2(sl.x), ty = W2(sl.y) + 7;
        let t = this.troopText[used];
        if (!t) { t = this.add.bitmapText(0, 0, 'digits', '').setDepth(25).setOrigin(0.5, 0.5); this.troopText.push(t); }
        t.setText(fmt(troops)).setPosition(tx, ty).setScale(ts).setVisible(true).setTint(o < 0 ? 0xd8d8d8 : o === this.human ? 0xbfe0ff : 0xffffff).setAlpha(o < 0 ? 0.7 : 1);
        used++;
        if (o >= 0 && this.lod === 'near' && icons < 200) {
          let ic = this.garrisonIcons[icons * 2];
          if (!ic) { ic = this.add.image(0, 0, 'atlas', 'u_soldier').setDepth(19); this.garrisonIcons.push(ic, this.add.image(0, 0, 'atlas', 'u_soldier_t').setDepth(19.01)); }
          const it = this.garrisonIcons[icons * 2 + 1];
          const k = g.tank[R.id] >= 1 ? 'u_tank' : 'u_soldier';
          ic.setFrame(k).setPosition(tx - 7, ty - 5).setVisible(true);
          it.setFrame(k + '_t').setPosition(tx - 7, ty - 5).setTint(g.nations[o].color).setVisible(true);
          icons++;
        }
      }
    }
    for (let i = used; i < this.troopText.length; i++) this.troopText[i].setVisible(false);
    for (let i = icons * 2; i < this.garrisonIcons.length; i++) this.garrisonIcons[i].setVisible(false);
    this.lodBuildings();
  }

  // ---------------- fleets ----------------
  private syncFleets(view: ReturnType<WorldScene['viewRect']>, delta: number) {
    const g = this.sim, z = this.cameras.main.zoom;
    const seen = new Set<number>();
    for (const f of g.fleets.values()) {
      const x = W2(f.x), y = W2(f.y);
      if (!this.inView(view, x, y)) continue;
      seen.add(f.id);
      let v = this.fleetVis.get(f.id);
      if (!v) { v = { ships: [], team: [], label: this.takeText(), heading: 0, lx: x, ly: y }; this.fleetVis.set(f.id, v); }
      const kinds = this.fleetKinds(f);
      while (v.ships.length < kinds.length) { v.ships.push(this.add.image(0, 0, 'atlas', 'u_patrol').setDepth(15)); v.team.push(this.add.image(0, 0, 'atlas', 'u_patrol_t').setDepth(15.01)); }
      while (v.ships.length > kinds.length) { v.ships.pop()!.destroy(); v.team.pop()!.destroy(); }
      const dx = x - v.lx, dy = y - v.ly;
      if (Math.abs(dx) + Math.abs(dy) > 0.05) v.heading = Math.atan2(dy, dx);
      v.lx = x; v.ly = y;
      const sc = this.lod === 'far' ? 0.5 / Math.max(z, 0.2) : 1;
      kinds.forEach((k, i) => {
        const off = i === 0 ? { x: 0, y: 0 } : { x: -Math.cos(v!.heading) * 9 * i + Math.sin(v!.heading) * (i % 2 ? 6 : -6), y: -Math.sin(v!.heading) * 9 * i - Math.cos(v!.heading) * (i % 2 ? 6 : -6) };
        v!.ships[i].setFrame(k).setPosition(x + off.x * sc, y + off.y * sc).setRotation(v!.heading).setScale(sc).setAlpha(k === 'u_sub' ? 0.75 : 1);
        v!.team[i].setFrame(this.textures.get('atlas').has(k + '_t') ? k + '_t' : k).setPosition(x + off.x * sc, y + off.y * sc).setRotation(v!.heading).setScale(sc).setTint(g.nations[f.owner].color);
      });
      const total = SEA_UNITS.reduce((s, k) => s + Math.ceil(f.ships[k] - 0.05), 0);
      v.label.setText(String(total)).setPosition(x, y - 8 * sc).setScale(Math.max(0.3, 1.5 / z)).setTint(f.combat < 1 ? 0xff8080 : 0xd0f0ff).setVisible(this.lod !== 'far');
      // wake sparkles while moving at close zoom
      if (this.lod === 'near' && f.path.length && Math.random() < delta / 120) this.spawnAmbient('u_wake', x - Math.cos(v.heading) * 10, y - Math.sin(v.heading) * 10, 0, 0, 900, 'wake');
    }
    for (const [id, v] of this.fleetVis) if (!seen.has(id)) { v.ships.forEach(s => s.destroy()); v.team.forEach(s => s.destroy()); this.dropText(v.label); this.fleetVis.delete(id); }
  }
  private fleetKinds(f: Fleet) {
    const order = ['carrier', 'destroyer', 'sub', 'transport', 'patrol'] as const;
    const out: string[] = [];
    for (const k of order) if (f.ships[k] >= 0.5) out.push('u_' + k);
    return out.slice(0, 3).length ? out.slice(0, 3) : ['u_patrol'];
  }

  // ---------------- aircraft ----------------
  private syncAir(view: ReturnType<WorldScene['viewRect']>, delta: number) {
    const g = this.sim, z = this.cameras.main.zoom;
    const seen = new Set<string>();
    const place = (key: string, kind: string, x: number, y: number, rot: number, owner: number, flying: boolean) => {
      seen.add(key);
      let v = this.planeVis.get(key);
      if (!v) {
        const shadow = this.add.image(0, 0, 'atlas', kind).setTint(0x000000).setAlpha(0.25).setDepth(21);
        const img = this.add.image(0, 0, 'atlas', kind).setDepth(32);
        const team = this.textures.get('atlas').has(kind + '_t') ? this.add.image(0, 0, 'atlas', kind + '_t').setDepth(32.01) : null;
        const rotor = kind === 'u_heli' || kind === 'u_scout' ? this.add.image(0, 0, 'atlas', 'rotor').setDepth(32.02) : null;
        v = { img, team, rotor, shadow };
        this.planeVis.set(key, v);
      }
      const sc = this.lod === 'far' ? 0.6 / Math.max(z, 0.2) : 1;
      const alt = flying ? 6 * sc : 0;
      v.shadow.setPosition(x + alt * 0.6, y + alt).setRotation(rot).setScale(sc).setVisible(flying);
      v.img.setPosition(x, y).setRotation(rot).setScale(sc);
      v.team?.setPosition(x, y).setRotation(rot).setScale(sc).setTint(g.nations[owner].color);
      if (v.rotor) v.rotor.setPosition(x + Math.cos(rot) * 2 * sc, y + Math.sin(rot) * 2 * sc).setScale(sc).setRotation((v.rotor.rotation + delta * 0.045) % (Math.PI * 2));
    };
    for (const s of g.sorties.values()) {
      const x = W2(s.x), y = W2(s.y);
      if (!this.inView(view, x, y)) continue;
      const rot = Math.atan2(s.ty - s.y, s.tx - s.x);
      let i = 0;
      for (const k of AIR_UNITS) {
        const n = Math.min(3, Math.ceil(s.planes[k] - 0.05));
        for (let j = 0; j < n; j++, i++) place(`s${s.id}:${i}`, 'u_' + k, x - Math.cos(rot) * 8 * i + Math.sin(rot) * (i % 2 ? 6 : -6) * (i ? 1 : 0), y - Math.sin(rot) * 8 * i, rot, s.owner, true);
      }
    }
    if (this.lod === 'near') for (const a of g.airGroups.values()) {
      const p = a.carrier >= 0 ? g.fleets.get(a.carrier) : g.center(a.base);
      if (!p) continue;
      const x = W2(p.x), y = W2(p.y);
      if (!this.inView(view, x, y)) continue;
      let i = 0;
      for (const k of AIR_UNITS) for (let j = 0; j < Math.min(3, Math.floor(a.planes[k])); j++, i++) {
        place(`g${a.id}:${i}`, 'u_' + k, x - 10 + (i % 4) * 7, y + (a.carrier >= 0 ? -1 : 6) + Math.floor(i / 4) * 7, 0, a.owner, false);
      }
    }
    for (const [k, v] of this.planeVis) if (!seen.has(k)) { v.img.destroy(); v.team?.destroy(); v.rotor?.destroy(); v.shadow.destroy(); this.planeVis.delete(k); }
    void airTotal;
  }

  // ---------------- missiles & effects ----------------
  private syncMissiles(delta: number) {
    const g = this.sim;
    const seen = new Set<number>();
    for (const m of g.missiles.values()) {
      seen.add(m.id);
      let v = this.missileVis.get(m.id);
      if (!v) { v = { img: this.add.image(0, 0, 'atlas', m.weapon === 'mirv' ? 'u_warhead' : 'u_missile').setDepth(45), trail: 0 }; this.missileVis.set(m.id, v); }
      const k = Math.min(1, m.t / m.dur);
      const dist = Math.hypot(m.tx - m.sx, m.ty - m.sy) * TILE;
      const h = Math.sin(Math.PI * k) * Math.min(220, dist * 0.3);
      const x = W2(m.x), y = W2(m.y) - h;
      const k2 = Math.min(1, k + 0.01);
      const nx = W2(m.sx + (m.tx - m.sx) * k2), ny = W2(m.sy + (m.ty - m.sy) * k2) - Math.sin(Math.PI * k2) * Math.min(220, dist * 0.3);
      v.img.setPosition(x, y).setRotation(Math.atan2(ny - y, nx - x)).setScale(Math.max(1, 1 / this.cameras.main.zoom));
      v.trail += delta;
      if (v.trail > 40) { v.trail = 0; this.spawnAmbient('u_smoke', x, y, 0, 0, 1400, 'trail'); }
    }
    for (const [id, v] of this.missileVis) if (!seen.has(id)) { v.img.destroy(); this.missileVis.delete(id); }
    void WEAPONS;
  }

  private handleFx() {
    const g = this.sim;
    if (!g.fx.length) return;
    const view = this.viewRect(80);
    for (const f of g.fx) {
      if (f.k === 'explosion') {
        const x = W2(f.x), y = W2(f.y);
        if (f.nuke) this.nukeFx(x, y, f.r);
        else if (this.inView(view, x, y)) this.boom(x, y, Math.min(2.5, 0.7 + f.r * 0.4));
      } else if (f.k === 'shot') {
        const x = W2(f.x), y = W2(f.y), tx = W2(f.tx), ty = W2(f.ty);
        if (!this.inView(view, tx, ty) || this.lod === 'far') continue;
        const tr = this.add.image(x, y, 'atlas', 'px').setDepth(31).setTint(f.sea ? 0xfff1a0 : 0xffe066).setScale(0.8);
        this.tweens.add({ targets: tr, x: tx, y: ty, duration: 260, onComplete: () => { tr.destroy(); this.boom(tx, ty, f.sea ? 0.45 : 0.35); } });
      } else if (f.k === 'intercept') {
        const x = W2(f.x), y = W2(f.y) - 40;
        if (this.inView(view, x, y)) this.boom(x, y, 0.8);
      } else if (f.k === 'capture') {
        if (this.lod === 'far') continue;
        const R = g.map.regions[f.region];
        const x = W2(R.cx), y = W2(R.cy);
        if (!this.inView(view, x, y)) continue;
        const fl = this.add.image(x, y - 4, 'atlas', 'flag0_t').setTint(g.nations[f.owner].color).setDepth(34).setScale(0.6);
        this.tweens.add({ targets: fl, y: y - 14, scale: 1.2, alpha: 0, duration: 900, onComplete: () => fl.destroy() });
      }
    }
    g.fx.length = 0;
  }

  boom(x: number, y: number, scale = 1) {
    const img = this.add.image(x, y, 'atlas', 'boom0').setDepth(33).setScale(scale);
    let f = 0;
    const ev = this.time.addEvent({ delay: 60, repeat: 7, callback: () => { f++; if (f >= 8) { img.destroy(); ev.remove(); } else img.setFrame('boom' + f); } });
  }

  private nukeFx(x: number, y: number, radius: number) {
    const scale = radius * TILE / 30;
    const flash = this.add.image(x, y, 'atlas', 'nukeflash0').setDepth(46).setScale(scale * 1.6);
    let f = 0;
    const ev = this.time.addEvent({ delay: 80, repeat: 10, callback: () => { f++; if (f >= 10) { flash.destroy(); ev.remove(); } else flash.setFrame('nukeflash' + f); } });
    const ring = this.add.image(x, y, 'atlas', 'ring8').setDepth(46).setScale(0.5).setTint(0xfff4c0);
    this.tweens.add({ targets: ring, scale: radius * TILE / 8 * 1.3, alpha: 0, duration: 1100, onComplete: () => ring.destroy() });
    const mush = this.add.image(x, y + 4, 'atlas', 'mushroom0').setOrigin(0.5, 0.92).setDepth(47).setScale(scale * 0.9);
    let m = 0;
    const ev2 = this.time.addEvent({ delay: 170, repeat: 12, callback: () => { m++; if (m >= 12) { this.tweens.add({ targets: mush, alpha: 0, duration: 1500, onComplete: () => mush.destroy() }); ev2.remove(); } else mush.setFrame('mushroom' + m); } });
    const view = this.viewRect(0);
    if (this.inView(view, x, y)) this.cameras.main.shake(600, 0.012);
  }

  // ---------------- ambient life ----------------
  private spawnAmbient(frame: string, x: number, y: number, vx: number, vy: number, life: number, kind: string) {
    if (this.ambient.length > 260) return;
    const img = this.add.image(x, y, 'atlas', frame).setDepth(kind === 'trail' ? 44 : kind === 'smoke' ? 18 : 7);
    if (kind === 'person') img.setTint([0x3b6fb6, 0xc04040, 0x40a040, 0xe0c040, 0x8040a0][Math.floor(Math.random() * 5)]);
    this.ambient.push({ img, vx, vy, life, kind });
  }

  private ambientLife(view: ReturnType<WorldScene['viewRect']>, delta: number) {
    const g = this.sim;
    for (let i = this.ambient.length - 1; i >= 0; i--) {
      const a = this.ambient[i];
      a.life -= delta;
      a.img.x += a.vx * delta / 1000; a.img.y += a.vy * delta / 1000;
      if (a.kind === 'smoke' || a.kind === 'trail') { a.img.setAlpha(Math.max(0, a.life / 1600)); a.img.setScale(a.img.scale + delta * 0.0006); }
      if (a.kind === 'wake' || a.kind === 'sparkle') a.img.setAlpha(Math.max(0, Math.sin(Math.PI * Math.max(0, a.life) / 900)));
      if (a.life <= 0) { a.img.destroy(); this.ambient.splice(i, 1); }
    }
    if (this.lod !== 'near') return;
    this.smokeT += delta;
    const spawnTick = this.smokeT > 140;
    if (spawnTick) this.smokeT = 0;
    if (!spawnTick) return;
    let people = 0, cars = 0;
    for (const a of this.ambient) { if (a.kind === 'person') people++; else if (a.kind === 'car') cars++; }
    for (const [k, v] of this.bVis) {
      if (!this.inView(view, v.img.x, v.img.y)) continue;
      if (k.endsWith(':factory') && Math.random() < 0.6) {
        this.spawnAmbient('u_smoke', v.img.x - 6 + (Math.random() < 0.5 ? 0 : 6), v.img.y - 9, (Math.random() - 0.3) * 4, -9, 1600, 'smoke');
      }
      if ((v.key.startsWith('city') || v.key.startsWith('capital')) && !k.endsWith(':flag')) {
        const half = v.img.width / 2 - 2;
        if (people < 120 && Math.random() < 0.5) {
          const horiz = Math.random() < 0.5;
          const off = (Math.random() - 0.5) * half * 1.6;
          const sp = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3);
          this.spawnAmbient('u_person', v.img.x + (horiz ? -sp * 1.5 : off), v.img.y + (horiz ? 1 : off), horiz ? sp : 0, horiz ? 0 : sp, 2200, 'person');
        }
        if (cars < 50 && Math.random() < 0.25) {
          const horiz = Math.random() < 0.5, dir = Math.random() < 0.5 ? -1 : 1;
          const frame = Math.random() < 0.5 ? 'u_car' : 'u_car2';
          this.spawnAmbient(frame, v.img.x - (horiz ? dir * half : 0), v.img.y - (horiz ? 0 : dir * half), horiz ? dir * 14 : 0, horiz ? 0 : dir * 14, half * 2 / 14 * 1000, 'car');
        }
      }
    }
    // shimmer on open water in view
    for (let i = 0; i < 3; i++) {
      const x = view.x0 + Math.random() * (view.x1 - view.x0), y = view.y0 + Math.random() * (view.y1 - view.y0);
      const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= g.map.w || ty >= g.map.h) continue;
      if (g.map.seaOf[ty * g.map.w + tx] >= 0) this.spawnAmbient('u_wake', x, y, 0, 0, 900, 'sparkle');
    }
  }

  // ---------------- labels ----------------
  private syncLabels(now: number) {
    const g = this.sim, z = this.cameras.main.zoom;
    const show = this.lod !== 'near';
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
          lbl = this.add.text(0, 0, n.name, { fontFamily: 'Cairo, Tahoma, sans-serif', fontSize: '30px', color: '#ffffff', stroke: '#101418', strokeThickness: 6, rtl: true, fontStyle: '700' }).setOrigin(0.5).setDepth(50);
          this.labels.set(n.id, lbl);
        }
        lbl.setData('size', Math.max(0.5, Math.min(3.2, Math.sqrt(n.area) / 12)));
        lbl.setPosition(W2(R.cx), W2(R.cy));
      }
    }
    for (const lbl of this.labels.values()) {
      const s = (lbl.getData('size') as number) ?? 1;
      const screen = Math.max(9, Math.min(26, s * 9 * z * 2.2));
      lbl.setScale(screen / 30 / z).setVisible(show && lbl.visible !== false).setAlpha(this.lod === 'mid' ? 0.55 : 0.92);
      if (!show) lbl.setVisible(false); else lbl.setVisible(true);
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

export type { Army };
