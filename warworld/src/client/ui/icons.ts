// Toolbar icons rendered from the same forge models and facility art used on the map.
import { renderModel } from '../art/forge';
import { AIR_MODELS, LAND_MODELS, SEA_MODELS } from '../art/models';
import { FACILITIES } from '../art/facilities';
import { renderCity } from '../art/city';

const cache = new Map<string, string>();
const ALL: Record<string, any> = { ...AIR_MODELS, ...SEA_MODELS, ...LAND_MODELS };

function fit(src: HTMLCanvasElement | ImageData, size: number, tint?: [number, number, number]) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d')!; ctx.imageSmoothingEnabled = false;
  let s: HTMLCanvasElement;
  if (src instanceof ImageData) { s = document.createElement('canvas'); s.width = src.width; s.height = src.height; s.getContext('2d')!.putImageData(src, 0, 0); } else s = src;
  // crop to content
  const d = s.getContext('2d')!.getImageData(0, 0, s.width, s.height).data;
  let x0 = s.width, y0 = s.height, x1 = 0, y1 = 0;
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (d[(y * s.width + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const k = Math.max(1, Math.floor(size / Math.max(w, h))) || 1;
  const sc = Math.max(w, h) * k > size ? size / Math.max(w, h) : k;
  ctx.drawImage(s, x0, y0, w, h, Math.round((size - w * sc) / 2), Math.round((size - h * sc) / 2), Math.round(w * sc), Math.round(h * sc));
  void tint;
  return c.toDataURL();
}

function compose(base: ImageData, team: ImageData | null, color: number) {
  if (!team) return base;
  const out = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  for (let i = 0; i < out.data.length; i += 4) if (team.data[i + 3]) { out.data[i] = team.data[i] * r / 255; out.data[i + 1] = team.data[i + 1] * g / 255; out.data[i + 2] = team.data[i + 2] * b / 255; out.data[i + 3] = 255; }
  return out;
}

export function modelIcon(name: string, color = 0x3d7bff, size = 40) {
  const key = `m${name}${color}${size}`;
  let u = cache.get(key); if (u) return u;
  const m = ALL[name]; if (!m) return '';
  const r = renderModel(m, -Math.PI / 4);
  u = fit(compose(r.base, r.team, color), size);
  cache.set(key, u); return u;
}

export function facilityIcon(type: string, color = 0x3d7bff, size = 40) {
  const key = `f${type}${color}${size}`;
  let u = cache.get(key); if (u) return u;
  const m = FACILITIES[type] ?? FACILITIES.factory; if (!m) return '';
  const side = Math.max(m.w!, m.h!) + 6;
  const r = renderModel({ ...m, w: side, h: side, castShadow: false }, 0);
  u = fit(compose(r.base, r.team, color), size);
  cache.set(key, u); return u;
}

export function cityIcon(level: number, capital = false, size = 40) {
  const key = `c${level}${capital}${size}`;
  let u = cache.get(key); if (u) return u;
  const a = renderCity({ seed: 5 + level, level, capital, buildable: () => true });
  u = fit(a.canvas, size);
  cache.set(key, u); return u;
}
