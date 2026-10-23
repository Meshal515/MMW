// Lazily turns forge models, cities and facilities into Phaser textures.
import Phaser from 'phaser';
import { renderModel, renderRotations, Model } from '../art/forge';
import { AIR_MODELS, LAND_MODELS, ROTORS, SEA_MODELS } from '../art/models';
import { FACILITIES } from '../art/facilities';
import { rotorFrames } from '../art/rotor';
import { renderCity, CityArt } from '../art/city';

export const DIRS = 32;

/** Display scale per model: units stay small next to cities and terrain (WorldBox-like proportions). */
export const UNIT_SCALE: Record<string, number> = {
  f16: 0.62, f35: 0.62, su57: 0.6, reaper: 0.52, b2: 0.5, b52: 0.48, ac130: 0.5,
  apache: 0.56, blackhawk: 0.56, chinook: 0.56,
  patrol: 0.6, corvette: 0.58, frigate: 0.56, destroyer: 0.54, cruiser: 0.54, sub: 0.52, transport: 0.52, landing: 0.6, amphib: 0.52, carrier: 0.55, supply: 0.52,
  mbt: 0.52, ifv: 0.52, apc: 0.52, spg: 0.52, mlrs: 0.52, aa: 0.52, humvee: 0.56, truck: 0.54,
  soldier0: 0.8, soldier1: 0.8,
};
const sc = (n: string) => UNIT_SCALE[n] ?? 1;
const ALL: Record<string, Model> = { ...AIR_MODELS, ...SEA_MODELS, ...LAND_MODELS };

const soldier = (step: number): Model => ({ name: 'soldier' + step, size: 12, parts: [
  { k: 'cap', x0: -1, y0: 1.3, x1: -1 + (step ? 1.6 : -0.6), y1: 1.6, r: 0.8, mat: 'olive', h: 1 },
  { k: 'cap', x0: -1, y0: -1.3, x1: -1 + (step ? -0.6 : 1.6), y1: -1.6, r: 0.8, mat: 'olive', h: 1 },
  { k: 'ell', x: 0, y: 0, rx: 1.6, ry: 2.4, mat: 'camo', h: 2 },
  { k: 'cap', x0: 0, y0: 1.2, x1: 3.6, y1: 0.8, r: 0.45, mat: 'black', h: 2.6 },
  { k: 'ell', x: 0.4, y: 0, rx: 1.4, ry: 1.4, mat: 'olive2', h: 3.4 },
  { k: 'ell', x: 0.1, y: -0.2, rx: 0.6, ry: 0.6, mat: 'team', h: 3.6 },
] });
ALL.soldier0 = soldier(0); ALL.soldier1 = soldier(1);
const car = (name: string, mat: any): Model => ({ name, size: 12, parts: [
  { k: 'rect', x: -2.5, y: -1.2, w: 5, hh: 2.4, mat, h: 1.6, bevel: 0.8 },
  { k: 'rect', x: -0.6, y: -1, w: 1.8, hh: 2, mat: 'glass', h: 2.4, bevel: 0.4 },
] });
for (const [n, m] of [['car_r', 'red'], ['car_b', 'blue'], ['car_w', 'white'], ['car_y', 'yellow'], ['car_g', 'darksteel']]) ALL[n] = car(n, m);
ALL.ambulance = { name: 'ambulance', size: 12, parts: [{ k: 'rect', x: -3.2, y: -1.5, w: 6.4, hh: 3, mat: 'white', h: 2, bevel: 0.6 }, { k: 'rect', x: -1, y: -0.4, w: 2, hh: 0.8, mat: 'red', h: 2.4, bevel: 0.2 }, { k: 'rect', x: 1.8, y: -1.2, w: 1.2, hh: 2.4, mat: 'glass', h: 2.2, bevel: 0.2 }] };

export class Registry {
  private made = new Set<string>();
  constructor(private scene: Phaser.Scene) {}

  hasModel(name: string) { return !!ALL[name]; }
  /** Footprint length in world pixels after scaling. */
  modelSize(name: string) { return (ALL[name]?.size ?? 16) * sc(name) * 0.8; }

  /** Ensures `m_<name>` exists with frames `0..DIRS-1` (+ `_t` team masks). */
  model(name: string): string {
    const key = 'm_' + name;
    if (this.made.has(key)) return key;
    const base = ALL[name], k = sc(name);
    const m: Model = { ...base, scale: (base.scale ?? 1) * k, size: Math.ceil(base.size * k) + 4 };
    const frames = renderRotations(m, DIRS);
    const S = frames[0].c.width;
    const cv = document.createElement('canvas'); cv.width = S * DIRS; cv.height = S * 2;
    const ctx = cv.getContext('2d')!;
    for (const f of frames) {
      const [, i, t] = f.name.match(/_(\d+)(_t)?$/)!;
      ctx.drawImage(f.c, Number(i) * S, t ? S : 0);
    }
    const tex = this.scene.textures.addCanvas(key, cv)!;
    for (let i = 0; i < DIRS; i++) { tex.add(String(i), 0, i * S, 0, S, S); tex.add(i + '_t', 0, i * S, S, S, S); }
    this.made.add(key);
    return key;
  }

  rotor(name: string, idx: number, scale: number): string {
    const r = ROTORS[name][idx];
    const key = `rotor_${name}_${idx}`;
    if (this.made.has(key)) return key;
    const frames = rotorFrames(r.r * scale * sc(name), r.blades, 6);
    const S = frames[0].width;
    const cv = document.createElement('canvas'); cv.width = S * 6; cv.height = S;
    frames.forEach((f, i) => cv.getContext('2d')!.drawImage(f, i * S, 0));
    const tex = this.scene.textures.addCanvas(key, cv)!;
    for (let i = 0; i < 6; i++) tex.add(String(i), 0, i * S, 0, S, S);
    this.made.add(key);
    return key;
  }

  /** Facility sprite at one of 8 orientations. Returns texture key; team mask at `<key>_t` if any. */
  facility(type: string, dir8: number): { key: string; team: string | null } {
    const key = `fac_${type}_${dir8}`;
    if (this.made.has(key)) return { key, team: this.textures(key + '_t') ? key + '_t' : null };
    const m = FACILITIES[type];
    const k = 0.42, side = Math.ceil(Math.max(m.w!, m.h!) * k) + 6;
    const r = renderModel({ ...m, w: side, h: side, scale: k }, (dir8 / 8) * Math.PI * 2);
    const cv = document.createElement('canvas'); cv.width = r.w; cv.height = r.h; cv.getContext('2d')!.putImageData(r.base, 0, 0);
    this.scene.textures.addCanvas(key, cv);
    if (r.team) { const t = document.createElement('canvas'); t.width = r.w; t.height = r.h; t.getContext('2d')!.putImageData(r.team, 0, 0); this.scene.textures.addCanvas(key + '_t', t); }
    this.made.add(key);
    return { key, team: r.team ? key + '_t' : null };
  }
  private textures(k: string) { return this.scene.textures.exists(k); }

  city(key: string, spec: Parameters<typeof renderCity>[0]): CityArt & { key: string } {
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    const art = renderCity(spec);
    this.scene.textures.addCanvas(key, art.canvas);
    return { ...art, key };
  }
}

export const dirIndex = (angle: number) => ((Math.round(angle / (Math.PI * 2) * DIRS) % DIRS) + DIRS) % DIRS;
