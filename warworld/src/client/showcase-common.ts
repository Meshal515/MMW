// Shared helpers for the in-engine showcase boards: noise, shadows, and a pixel-exact camera.
import Phaser from 'phaser';
import type { C3 } from './art/px/dsl';

const SH: C3 = [40, 24, 58];
export const toCanvas = (img: ImageData) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.putImageData(img, 0, 0); return c; };
/** Flat violet silhouette used as a cast shadow. */
export function silhouette(img: ImageData, a = 110) {
  const o = new ImageData(img.width, img.height);
  for (let k = 0; k < img.data.length; k += 4) if (img.data[k + 3] > 40) o.data.set([SH[0], SH[1], SH[2], a], k);
  return o;
}
export function hash(x: number, y: number, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, y: number, s: number) => (noise(x, y, s) + noise(x * 2.1, y * 2.1, s + 7) * 0.5 + noise(x * 4.3, y * 4.3, s + 13) * 0.25) / 1.75;
export const pick = (p: C3[], t: number) => p[Math.max(0, Math.min(p.length - 1, Math.floor(t * p.length)))];

/**
 * Camera that never shimmers: zoom is always a whole number (1 art pixel = exactly N screen pixels;
 * below 1× only 1/2), and the scroll is snapped to whole screen pixels, so sprites never wobble.
 */
export function setupCamera(scene: Phaser.Scene, W: number, H: number) {
  const cam = scene.cameras.main;
  cam.setBounds(-200, -200, W + 400, H + 400);
  const snapZ = (z: number) => (z >= 1 ? Math.round(z) : 0.5);
  const fit = () => snapZ(Math.max(1, Math.floor(Math.min(cam.width / W, cam.height / H))));
  const snapScroll = () => { cam.scrollX = Math.round(cam.scrollX * cam.zoom) / cam.zoom; cam.scrollY = Math.round(cam.scrollY * cam.zoom) / cam.zoom; };
  const setZoom = (z: number) => { cam.setZoom(snapZ(z)); };
  const centerOn = (x: number, y: number) => { cam.centerOn(x, y); snapScroll(); };
  setZoom(fit()); centerOn(W / 2, H / 2);
  let drag: { x: number; y: number; sx: number; sy: number } | null = null;
  scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => { drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY }; });
  scene.input.on('pointerup', () => { drag = null; });
  scene.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (drag && p.isDown) { cam.scrollX = drag.sx - (p.x - drag.x) / cam.zoom; cam.scrollY = drag.sy - (p.y - drag.y) / cam.zoom; snapScroll(); } });
  scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
    const before = cam.getWorldPoint(p.x, p.y);
    setZoom(Phaser.Math.Clamp(cam.zoom < 1 ? (dy > 0 ? 0.5 : 1) : cam.zoom + (dy > 0 ? -1 : 1), 0.5, 10));
    const after = cam.getWorldPoint(p.x, p.y); cam.scrollX += before.x - after.x; cam.scrollY += before.y - after.y; snapScroll();
  });
  const bar = document.getElementById('zoom')!;
  bar.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    const z = b.dataset.z!, mid = cam.midPoint.clone();
    if (z === 'fit') { setZoom(fit()); centerOn(W / 2, H / 2); } else { setZoom(Number(z)); centerOn(mid.x, mid.y); }
  });
  (window as any).__sc = { cam, W, H, focus: (x: number, y: number, z: number) => { setZoom(z); centerOn(x, y); } };
}
