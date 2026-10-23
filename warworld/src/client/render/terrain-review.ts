// Terrain review page: paints a window of the map at a chosen density, scaled up for inspection.
import { buildMap } from '../../sim/map/regions';
import { TerrainPainter } from './painter';

const q = new URLSearchParams(location.search);
const x0 = Number(q.get('x') ?? 200), y0 = Number(q.get('y') ?? 50), w = Number(q.get('w') ?? 44), h = Number(q.get('h') ?? 27);
const ppt = Number(q.get('ppt') ?? 16), scale = Number(q.get('s') ?? 2);
const map = buildMap({ kind: (q.get('kind') as any) ?? 'earth', seed: 20240 });
let t = performance.now();
const painter = new TerrainPainter(map);
const tSdf = performance.now() - t;
t = performance.now();
const img = painter.paint(x0, y0, w, h, ppt);
const tPaint = performance.now() - t;
const src = document.createElement('canvas'); src.width = img.width; src.height = img.height;
src.getContext('2d')!.putImageData(img, 0, 0);
const cv = document.getElementById('g') as HTMLCanvasElement;
cv.width = img.width * scale; cv.height = img.height * scale;
const ctx = cv.getContext('2d')!; ctx.imageSmoothingEnabled = false;
ctx.drawImage(src, 0, 0, cv.width, cv.height);
document.getElementById('t')!.textContent = `sdf ${tSdf.toFixed(0)}ms paint ${tPaint.toFixed(0)}ms (${img.width}x${img.height}, ${(tPaint * 1e6 / (img.width * img.height)).toFixed(0)} ns/px)`;
(window as any).__done = true;
