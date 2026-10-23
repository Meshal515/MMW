// Renders the static terrain to a pixel-art canvas and maintains the political ownership overlay.
import type { Game } from '../../sim/game';
import type { MapData } from '../../sim/map/regions';
import { isLand, T } from '../../sim/map/terrain';
import { canvasOf, drawSprite, rgb } from '../art/pixel';
import { NATURE } from '../art/sprites';

export const TILE = 8;      // world pixels per map tile
export const OV = 4;        // overlay pixels per map tile

const C = (h: string) => rgb(h);
const PALETTE: Record<number, [number, number, number][]> = {
  [T.Deep]: [C('#1d2f86'), C('#22378f'), C('#263f9a'), C('#2f4cab')],
  [T.Shallow]: [C('#3466c6'), C('#3a6fd1'), C('#4079d8'), C('#5891e6')],
  [T.Plains]: [C('#5f9a35'), C('#6aa83c'), C('#76b445'), C('#86c152')],
  [T.Forest]: [C('#2f6328'), C('#376e2d'), C('#3f7a32'), C('#4a8a39')],
  [T.Hills]: [C('#7c8e43'), C('#8b9b4c'), C('#9aa756'), C('#6f7f3c')],
  [T.Mountain]: [C('#7b6a4e'), C('#8b7a5c'), C('#9a8a6c'), C('#6b5c44')],
  [T.Desert]: [C('#d6bd84'), C('#dfc890'), C('#e9d6a2'), C('#c7a96d')],
  [T.Snow]: [C('#dfe9f4'), C('#e9f1f9'), C('#f7fbff'), C('#c9d8e9')],
};
const SAND = C('#e4cf95'), SAND2 = C('#d4bb7b'), FOAM = C('#b9dcff'), FOAM2 = C('#e8f5ff');

function h2(x: number, y: number, s = 0) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function renderTerrain(map: MapData): HTMLCanvasElement {
  const W = map.w * TILE, H = map.h * TILE;
  const { c, ctx } = canvasOf(W, H);
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const ter = map.terrain;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? T.Deep : ter[y * map.w + x]);
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    const t = ter[ty * map.w + tx];
    const pal = PALETTE[t];
    const land = isLand(t);
    const nW = isLand(at(tx - 1, ty)), nE = isLand(at(tx + 1, ty)), nN = isLand(at(tx, ty - 1)), nS = isLand(at(tx, ty + 1));
    for (let py = 0; py < TILE; py++) for (let px = 0; px < TILE; px++) {
      const gx = tx * TILE + px, gy = ty * TILE + py;
      const hh = h2(gx, gy);
      let col: [number, number, number];
      if (!land) {
        // water: banded swell pattern, foam where it touches land
        const band = ((gx + (gy >> 1) * 3 + ((h2(gx >> 3, gy >> 2) & 3))) % 13) === 0;
        col = pal[band ? 3 : (hh & 7) < 2 ? 0 : (hh & 7) < 5 ? 1 : 2];
        const edge = (nW && px === 0) || (nE && px === TILE - 1) || (nN && py === 0) || (nS && py === TILE - 1);
        const near = (nW && px <= 1) || (nE && px >= TILE - 2) || (nN && py <= 1) || (nS && py >= TILE - 2);
        if (edge) col = (hh & 3) === 0 ? FOAM2 : FOAM;
        else if (near && (hh & 3) === 0) col = FOAM;
      } else {
        let k = (hh >>> 3) & 15;
        // big soft patches so the land isn't flat noise
        const patch = (h2(gx >> 4, gy >> 4, t) >>> 4) & 3;
        k = k < 3 ? 3 : k < 7 ? (patch & 1 ? 2 : 1) : k < 13 ? patch === 3 ? 2 : 1 : 0;
        col = pal[k];
        if (t === T.Desert && ((gx * 2 + gy * 3 + (h2(gx >> 3, gy >> 3) & 7)) % 11) === 0) col = pal[3];
        if (t === T.Hills && ((gx + gy * 2) % 9 === 0)) col = pal[3];
        if (t === T.Plains && (hh & 255) === 7) col = C('#e8d65a');
        if (t === T.Plains && (hh & 255) === 9) col = C('#d77ab0');
        // beaches on coasts that aren't snow or mountain
        if (t !== T.Snow && t !== T.Mountain) {
          const beach = (!nW && px <= 1) || (!nE && px >= TILE - 2) || (!nN && py <= 1) || (!nS && py >= TILE - 2);
          if (beach) col = (hh & 3) === 0 ? SAND2 : SAND;
        }
      }
      const k4 = (gy * W + gx) * 4;
      d[k4] = col[0]; d[k4 + 1] = col[1]; d[k4 + 2] = col[2]; d[k4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // stamps: trees, mountains, hills, desert details
  const stamps = { tree: canvasOf(5, 6), tree2: canvasOf(5, 5), pine: canvasOf(5, 6), palm: canvasOf(5, 5), mountain: canvasOf(12, 7), hill: canvasOf(8, 4), rock: canvasOf(4, 3), cactus: canvasOf(3, 4) };
  for (const [k, v] of Object.entries(stamps)) drawSprite(v.ctx, (NATURE as any)[k], 0, 0);
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    const t = ter[ty * map.w + tx];
    const hh = h2(tx, ty, 99);
    const bx = tx * TILE, by = ty * TILE;
    const lat = Math.abs(ty / map.h - 0.45);
    if (t === T.Forest) {
      const kind = lat > 0.22 ? stamps.pine : lat < 0.12 && (hh & 1) ? stamps.palm : (hh & 2) ? stamps.tree : stamps.tree2;
      ctx.drawImage(kind.c, bx + (hh & 3) - 1, by - 2 + ((hh >> 2) & 1));
      if ((hh >> 4) & 1) ctx.drawImage(kind.c, bx + 3 + ((hh >> 5) & 1), by + 3);
    } else if (t === T.Mountain && ((tx + ty) & 1) === 0) ctx.drawImage(stamps.mountain.c, bx - 2 + ((hh >> 3) & 1), by - 1);
    else if (t === T.Hills && (hh & 3) === 0) ctx.drawImage(stamps.hill.c, bx, by + 2);
    else if (t === T.Plains && (hh & 31) === 3) ctx.drawImage(stamps.tree.c, bx + 1, by + 1);
    else if (t === T.Desert && (hh & 63) === 5) ctx.drawImage(stamps.cactus.c, bx + 2, by + 2);
    else if (t === T.Desert && (hh & 63) === 9) ctx.drawImage(stamps.rock.c, bx + 2, by + 3);
    else if (t === T.Snow && (hh & 15) === 1) ctx.drawImage(stamps.rock.c, bx + 2, by + 3);
  }
  return c;
}

/** Political overlay at OV px per tile: translucent fill, crisp national borders, faint region lines. */
export class Overlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private colors: [number, number, number][] = [];
  private border: [number, number, number][] = [];
  fillAlpha = 92;
  constructor(private g: Game) {
    const { c, ctx } = canvasOf(g.map.w * OV, g.map.h * OV);
    this.canvas = c; this.ctx = ctx;
    for (const n of g.nations) {
      const r = (n.color >> 16) & 255, gg = (n.color >> 8) & 255, b = n.color & 255;
      this.colors.push([r, gg, b]);
      this.border.push([Math.min(255, r * 0.6 + 100), Math.min(255, gg * 0.6 + 100), Math.min(255, b * 0.6 + 100)]);
    }
    this.redrawAll();
  }

  redrawAll() { this.drawRect(0, 0, this.g.map.w, this.g.map.h); }

  /** Redraws the given regions and their neighbours (borders depend on both sides). */
  redrawRegions(regions: Iterable<number>) {
    const map = this.g.map;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const r of regions) {
      for (const t of map.regions[r].tiles) {
        const x = t % map.w, y = (t / map.w) | 0;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return;
    this.drawRect(Math.max(0, x0 - 1), Math.max(0, y0 - 1), Math.min(map.w, x1 + 2), Math.min(map.h, y1 + 2));
  }

  private drawRect(x0: number, y0: number, x1: number, y1: number) {
    const g = this.g, map = g.map, w = map.w;
    const pw = (x1 - x0) * OV, ph = (y1 - y0) * OV;
    if (pw <= 0 || ph <= 0) return;
    const img = this.ctx.createImageData(pw, ph);
    const d = img.data;
    const ownerAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= map.h) return -2;
      const r = map.regionOf[y * w + x];
      return r < 0 ? -2 : g.owner[r];
    };
    const regAt = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= map.h ? -1 : map.regionOf[y * w + x]);
    const t = g.time;
    for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
      const r = map.regionOf[ty * w + tx];
      if (r < 0) continue;
      const o = g.owner[r];
      const rad = g.radiation[r] > 0;
      const oW = ownerAt(tx - 1, ty), oE = ownerAt(tx + 1, ty), oN = ownerAt(tx, ty - 1), oS = ownerAt(tx, ty + 1);
      const rW = regAt(tx - 1, ty), rE = regAt(tx + 1, ty), rN = regAt(tx, ty - 1), rS = regAt(tx, ty + 1);
      for (let py = 0; py < OV; py++) for (let px = 0; px < OV; px++) {
        const k = (((ty - y0) * OV + py) * pw + (tx - x0) * OV + px) * 4;
        const edgeW = px === 0, edgeE = px === OV - 1, edgeN = py === 0, edgeS = py === OV - 1;
        const natBorder = (edgeW && oW !== o) || (edgeE && oE !== o) || (edgeN && oN !== o) || (edgeS && oS !== o);
        const regBorder = (edgeW && rW !== r && rW >= 0) || (edgeE && rE !== r && rE >= 0) || (edgeN && rN !== r && rN >= 0) || (edgeS && rS !== r && rS >= 0);
        if (o >= 0) {
          const col = natBorder ? this.border[o] : this.colors[o];
          d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2];
          d[k + 3] = natBorder ? 235 : regBorder ? this.fillAlpha + 40 : this.fillAlpha;
          if (regBorder && !natBorder) { d[k] = col[0] * 0.6; d[k + 1] = col[1] * 0.6; d[k + 2] = col[2] * 0.6; }
        } else if (regBorder && ((px + py + tx + ty) & 1) === 0) {
          d[k] = 20; d[k + 1] = 24; d[k + 2] = 30; d[k + 3] = 46;
        }
        if (rad && ((tx * OV + px + ty * OV + py) % 6 < 2)) { d[k] = 170; d[k + 1] = 230; d[k + 2] = 40; d[k + 3] = 150; }
      }
    }
    void t;
    this.ctx.putImageData(img, x0 * OV, y0 * OV);
  }
}

/** Builds a white outline image of one region for selection highlighting. */
export function regionOutline(map: MapData, r: number, color = '#ffffff') {
  const R = map.regions[r];
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const t of R.tiles) { const x = t % map.w, y = (t / map.w) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = (x1 - x0 + 1) * OV, h = (y1 - y0 + 1) * OV;
  const { c, ctx } = canvasOf(w + 2, h + 2);
  const img = ctx.createImageData(w + 2, h + 2);
  const [cr, cg, cb] = rgb(color);
  const inR = (x: number, y: number) => x >= 0 && y >= 0 && x < map.w && y < map.h && map.regionOf[y * map.w + x] === r;
  for (const t of R.tiles) {
    const tx = t % map.w, ty = (t / map.w) | 0;
    for (let py = 0; py < OV; py++) for (let px = 0; px < OV; px++) {
      const edge = (px === 0 && !inR(tx - 1, ty)) || (px === OV - 1 && !inR(tx + 1, ty)) || (py === 0 && !inR(tx, ty - 1)) || (py === OV - 1 && !inR(tx, ty + 1));
      const k = (((ty - y0) * OV + py + 1) * (w + 2) + (tx - x0) * OV + px + 1) * 4;
      if (edge) { img.data[k] = cr; img.data[k + 1] = cg; img.data[k + 2] = cb; img.data[k + 3] = 255; }
      else { img.data[k] = cr; img.data[k + 1] = cg; img.data[k + 2] = cb; img.data[k + 3] = 40; }
    }
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: c, x: x0 * OV - 1, y: y0 * OV - 1 };
}
