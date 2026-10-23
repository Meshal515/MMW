// Paints a game city (and its districts) with the city generator onto a transparent canvas that sits
// exactly on the ground: roads, plazas and buildings are opaque pixels, lawns stay terrain, shadows
// darken whatever is below. Neighbouring cities never overlap thanks to the claim test.
import { CITY } from '../../sim/balance';
import { CELL, District, paintCity, Street } from '../art/px/citygen';
import { C3, Pix } from '../art/px/dsl';

export interface CitySpec {
  cx: number; cy: number; level: number; capital: boolean; seed: number; team: C3;
  districts: Partial<Record<District, number>>; damage: { x: number; y: number; r: number }[];
  /** true where this city may build (own land, inside its claim). */
  ok(x: number, y: number): boolean;
  water(x: number, y: number): boolean;
}
export interface CityCanvas { canvas: HTMLCanvasElement; x0: number; y0: number; size: number; streets: Street[]; chimneys: { x: number; y: number }[]; radius: number }

class Layer {
  data: Uint8ClampedArray<ArrayBuffer>; noLawn = true;
  constructor(public x0: number, public y0: number, public S: number) { this.data = new Uint8ClampedArray(new ArrayBuffer(S * S * 4)); }
  private i(x: number, y: number) { x -= this.x0; y -= this.y0; return x < 0 || y < 0 || x >= this.S || y >= this.S ? -1 : (y * this.S + x) * 4; }
  get(x: number, y: number): C3 { const k = this.i(x, y); return k < 0 ? [0, 0, 0] : [this.data[k], this.data[k + 1], this.data[k + 2]]; }
  set(x: number, y: number, c: number[]) { const k = this.i(x, y); if (k >= 0) { this.data[k] = c[0]; this.data[k + 1] = c[1]; this.data[k + 2] = c[2]; this.data[k + 3] = 255; } }
  stamp(p: Pix | ImageData, x0: number, y0: number, shadow = 2, team: C3 = [61, 123, 255]) {
    const img = p instanceof Pix ? p.toImage(team) : p;
    const op = (i: number, j: number) => i >= 0 && j >= 0 && i < img.width && j < img.height && img.data[(j * img.width + i) * 4 + 3] > 0;
    for (let j = 0; j < img.height + shadow; j++) for (let i = 0; i < img.width + shadow; i++) {
      if (op(i, j)) continue;
      let s = false; for (let k = 1; k <= shadow && !s; k++) s = op(i - k, j - k);
      if (!s) continue;
      const k = this.i(x0 + i, y0 + j); if (k < 0) continue;
      if (this.data[k + 3]) { this.data[k] *= 0.6; this.data[k + 1] *= 0.58; this.data[k + 2] *= 0.72; }
      else { this.data[k] = 40; this.data[k + 1] = 24; this.data[k + 2] = 58; this.data[k + 3] = 105; }
    }
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
      const s = (j * img.width + i) * 4; if (!img.data[s + 3]) continue;
      const k = this.i(x0 + i, y0 + j); if (k < 0) continue;
      this.data[k] = img.data[s]; this.data[k + 1] = img.data[s + 1]; this.data[k + 2] = img.data[s + 2]; this.data[k + 3] = 255;
    }
  }
}

export function paintGameCity(c: CitySpec): CityCanvas {
  const R = CITY.radius(c.level), half = R + CELL * 2 + 40, S = half * 2;
  const x0 = Math.round(c.cx) - half, y0 = Math.round(c.cy) - half;
  const layer = new Layer(x0, y0, S);
  const res = paintCity(layer, { cx: Math.round(c.cx), cy: Math.round(c.cy), level: c.level, capital: c.capital, seed: c.seed, team: c.team, districts: c.districts, damage: c.damage }, { ok: c.ok, water: c.water });
  const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
  canvas.getContext('2d')!.putImageData(new ImageData(layer.data, S, S), 0, 0);
  return { canvas, x0, y0, size: S, streets: res.streets, chimneys: res.chimneys, radius: res.radius };
}
