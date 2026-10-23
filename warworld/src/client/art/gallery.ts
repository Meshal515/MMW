// Art review page: every model at several angles, enlarged, on a sand backdrop, with shadows.
import { renderModel } from './forge';
import { AIR_MODELS, LAND_MODELS, ROTORS, SEA_MODELS } from './models';
import { rotorFrames } from './rotor';

const SCALE = Number(new URLSearchParams(location.search).get('scale') ?? 3);
const only = new URLSearchParams(location.search).get('only')?.split(',');
const groups = [Object.values(AIR_MODELS), Object.values(SEA_MODELS), Object.values(LAND_MODELS)].map(g => g.filter(m => !only || only.includes(m.name))).filter(g => g.length);
const team = [196, 64, 58];
const cv = document.getElementById('g') as HTMLCanvasElement;
const W = 1400, rows: { m: any; y: number }[] = [];
let y = 8, x = 8, rowH = 0;
const place: { m: any; x: number; y: number }[] = [];
for (const g of groups) {
  for (const m of g) {
    const w = m.size * 2 + 12;
    if (x + w * SCALE > W) { x = 8; y += rowH + 8; rowH = 0; }
    place.push({ m, x, y });
    x += w * SCALE + 8; rowH = Math.max(rowH, m.size * SCALE + 14);
  }
  x = 8; y += rowH + 16; rowH = 0;
}
cv.width = W; cv.height = y + 10;
const ctx = cv.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
// sand backdrop with dune strokes
const bg = ctx.createImageData(W, cv.height);
for (let j = 0; j < cv.height; j++) for (let i = 0; i < W; i++) {
  const v = Math.sin(i * 0.05 + Math.sin(j * 0.07) * 2) + Math.sin(j * 0.11 + i * 0.013);
  const c = v > 1.2 ? [233, 214, 160] : v < -1.3 ? [176, 140, 120] : [212, 182, 128];
  bg.data.set([...c, 255], (j * W + i) * 4);
}
ctx.putImageData(bg, 0, 0);
for (const p of place) {
  [0, Math.PI / 5].forEach((ang, i) => {
    const r = renderModel(p.m, ang);
    const tmp = document.createElement('canvas'); tmp.width = r.w; tmp.height = r.h;
    const tc = tmp.getContext('2d')!;
    tc.putImageData(r.base, 0, 0);
    if (r.team) {
      const t2 = document.createElement('canvas'); t2.width = r.w; t2.height = r.h;
      const d = new ImageData(new Uint8ClampedArray(r.team.data), r.w, r.h);
      for (let k = 0; k < d.data.length; k += 4) if (d.data[k + 3]) { d.data[k] = d.data[k] * team[0] / 255; d.data[k + 1] = d.data[k + 1] * team[1] / 255; d.data[k + 2] = d.data[k + 2] * team[2] / 255; }
      t2.getContext('2d')!.putImageData(d, 0, 0);
      tc.drawImage(t2, 0, 0);
    }
    const ox = p.x + i * (r.w + 6) * SCALE, oy = p.y + 10;
    // shadow: silhouette offset down-right
    const sh = document.createElement('canvas'); sh.width = r.w; sh.height = r.h;
    const sc = sh.getContext('2d')!; sc.drawImage(tmp, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = 'rgba(70,40,80,0.45)'; sc.fillRect(0, 0, r.w, r.h);
    const alt = AIR_MODELS[p.m.name as keyof typeof AIR_MODELS] ? 7 : 1.5;
    ctx.drawImage(sh, ox + alt * SCALE, oy + alt * SCALE, r.w * SCALE, r.h * SCALE);
    ctx.drawImage(tmp, ox, oy, r.w * SCALE, r.h * SCALE);
    for (const rt of ROTORS[p.m.name] ?? []) {
      const k = p.m.scale ?? 1; const f = rotorFrames(rt.r * k, rt.blades)[1];
      const cx = r.w / 2 + rt.x * k * Math.cos(ang), cy = r.h / 2 + rt.x * k * Math.sin(ang);
      ctx.drawImage(f, ox + (cx - f.width / 2) * SCALE, oy + (cy - f.height / 2) * SCALE, f.width * SCALE, f.height * SCALE);
    }
  });
  ctx.fillStyle = '#000'; ctx.fillText(p.m.name, p.x, p.y + 8);
}
(window as any).__done = true;
