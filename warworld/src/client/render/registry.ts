// Lazily turns forge models, cities and facilities into Phaser textures.
import Phaser from 'phaser';
import { FACILITY_ART } from '../art/px/facilities';
import { VEHICLE } from '../art/px/vehicles';
import { rotsprite } from '../art/px/rotsprite';
import { rotorPx } from '../art/px/rotor';
import { renderCity, CityArt } from '../art/city';

export const DIRS = 32;

/** New pixel art is drawn at its final size: no scaling anywhere. */
export const UNIT_SCALE: Record<string, number> = {};
const NAME_ALIAS: Record<string, string> = { drone: 'reaper', soldier: 'soldier0' };
const vehicleOf = (name: string) => VEHICLE[NAME_ALIAS[name] ?? name];
/** Rotor hubs relative to the sprite centre (pixels along the heading). */
export const ROTOR_OFFSETS: Record<string, { dx: number; r: number; blades: number }[]> = {};
for (const v of Object.values(VEHICLE)) if (v.rotor) { const w = v.draw().w; ROTOR_OFFSETS[v.name] = v.rotor.map(r => ({ dx: r.x + 1 - w / 2, r: r.r, blades: r.blades })); }

/** Burnt-out version of a sprite: charred greys with a few embers. */
function charred(img: ImageData, seed: number) {
  const o = new ImageData(img.width, img.height);
  for (let k = 0; k < img.data.length; k += 4) {
    if (!img.data[k + 3]) continue;
    const l = (img.data[k] * 0.3 + img.data[k + 1] * 0.55 + img.data[k + 2] * 0.15) * 0.42 + 14;
    const ember = ((k * 2654435761 + seed) >>> 0) % 97 === 0;
    o.data.set(ember ? [255, 140, 40, 255] : [l + 6, l, l - 2, 255], k);
  }
  return o;
}
const oddOut = (w: number, h: number) => { const o = Math.ceil(Math.hypot(w, h)) + 2; return o % 2 ? o : o + 1; };

export class Registry {
  private made = new Set<string>();
  constructor(private scene: Phaser.Scene) {}

  hasModel(name: string) { return !!vehicleOf(name.replace(/_wreck$/, '')); }
  /** Footprint length in world pixels. */
  modelSize(name: string) { return vehicleOf(name.replace(/_wreck$/, ''))?.draw().w ?? 16; }

  /** Ensures `m_<name>` exists with frames `0..DIRS-1` (+ `_t` team masks). `<name>_wreck` is the burnt hulk. */
  model(name: string): string {
    const key = 'm_' + name;
    if (this.made.has(key)) return key;
    const wreck = name.endsWith('_wreck'), v = vehicleOf(name.replace(/_wreck$/, ''));
    const { base, team } = v.draw().toImages();
    const src = wreck ? charred(base, name.length) : base;
    const S = oddOut(base.width, base.height);
    const cv = document.createElement('canvas'); cv.width = S * DIRS; cv.height = S * 2;
    const ctx = cv.getContext('2d')!;
    for (let i = 0; i < DIRS; i++) {
      const a = (i / DIRS) * Math.PI * 2;
      ctx.putImageData(rotsprite(src, a, S), i * S, 0);
      if (team && !wreck) ctx.putImageData(rotsprite(team, a, S), i * S, S);
    }
    const tex = this.scene.textures.addCanvas(key, cv)!;
    for (let i = 0; i < DIRS; i++) { tex.add(String(i), 0, i * S, 0, S, S); tex.add(i + '_t', 0, i * S, S, S, S); }
    this.made.add(key);
    return key;
  }

  rotor(name: string, idx: number, _scale = 1): string {
    const r = ROTOR_OFFSETS[name][idx];
    const key = `rotor_${name}_${idx}`;
    if (this.made.has(key)) return key;
    const frames = rotorPx(r.r, r.blades, 6);
    const S = frames[0].width;
    const cv = document.createElement('canvas'); cv.width = S * 6; cv.height = S;
    frames.forEach((f, i) => cv.getContext('2d')!.drawImage(f, i * S, 0));
    const tex = this.scene.textures.addCanvas(key, cv)!;
    for (let i = 0; i < 6; i++) tex.add(String(i), 0, i * S, 0, S, S);
    this.made.add(key);
    return key;
  }

  /** Facility sprite (new pixel art, no rotation). Returns texture key; team mask at `<key>_t` if any. */
  facility(type: string, _dir8 = 0): { key: string; team: string | null } {
    const key = `fac_${type}`;
    if (this.made.has(key)) return { key, team: this.textures(key + '_t') ? key + '_t' : null };
    const make = FACILITY_ART[type] ?? FACILITY_ART.factory;
    const { base, team } = make().toImages();
    const cv = document.createElement('canvas'); cv.width = base.width; cv.height = base.height; cv.getContext('2d')!.putImageData(base, 0, 0);
    this.scene.textures.addCanvas(key, cv);
    if (team) { const t = document.createElement('canvas'); t.width = base.width; t.height = base.height; t.getContext('2d')!.putImageData(team, 0, 0); this.scene.textures.addCanvas(key + '_t', t); }
    this.made.add(key);
    return { key, team: team ? key + '_t' : null };
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
