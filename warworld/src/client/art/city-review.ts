// City review: levels 1-3 plus capitals on painted grass, enlarged.
import { renderCity } from './city';
const scale = Number(new URLSearchParams(location.search).get('s') ?? 3);
const cv = document.getElementById('g') as HTMLCanvasElement;
const specs = [1, 2, 3, 2, 3].map((level, i) => ({ seed: 11 + i * 7, level, capital: i >= 3, buildable: (x: number, y: number) => !(i === 4 && x > 120 && y < 50) }));
const arts = specs.map(renderCity);
cv.width = arts.reduce((s, a) => s + a.size + 8, 8) * scale; cv.height = (Math.max(...arts.map(a => a.size)) + 130) * scale;
const ctx = cv.getContext('2d')!; ctx.imageSmoothingEnabled = false;
for (let y = 0; y < cv.height; y += scale) for (let x = 0; x < cv.width; x += scale) {
  const n = (Math.sin(x * 0.013 + y * 0.007) + Math.sin(y * 0.011)) * 0.5;
  ctx.fillStyle = n > 0.4 ? '#78aa44' : n < -0.4 ? '#4f7f34' : '#62953b'; ctx.fillRect(x, y, scale, scale);
}
let x = 8;
for (const a of arts) { ctx.drawImage(a.canvas, x * scale, 8 * scale, a.size * scale, a.size * scale); x += a.size + 8; }
import('./forge').then(({ renderModel }) => import('./facilities').then(({ FACILITIES }) => {
  let fx = 8, fy = Math.max(...arts.map(a => a.size)) + 24;
  for (const m of Object.values(FACILITIES)) {
    const r = renderModel(m, 0);
    const t = document.createElement('canvas'); t.width = r.w; t.height = r.h; t.getContext('2d')!.putImageData(r.base, 0, 0);
    if (r.team) { const t2 = document.createElement('canvas'); t2.width = r.w; t2.height = r.h; t2.getContext('2d')!.putImageData(r.team, 0, 0); t.getContext('2d')!.drawImage(t2, 0, 0); }
    if (fx + r.w > cv.width / scale) { fx = 8; fy += 50; }
    ctx.drawImage(t, fx * scale, fy * scale, r.w * scale, r.h * scale);
    fx += r.w + 8;
  }
  (window as any).__done = true;
}));
