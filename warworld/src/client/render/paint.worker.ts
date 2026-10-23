// Off-thread terrain painting. Receives the tile map once, then paints rectangles on request,
// also returning the (warped) region id of every pixel so borders can follow organic coasts.
import { TerrainPainter } from './painter';

let painter: TerrainPainter | null = null;
let regionOf: Int16Array | null = null;
let w = 0, h = 0;

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'init') {
    w = m.w; h = m.h; regionOf = m.regionOf;
    painter = new TerrainPainter({ terrain: m.terrain, w, h } as any);
    (self as any).postMessage({ type: 'ready' });
    return;
  }
  if (m.type === 'paint' && painter && regionOf) {
    const img = painter.paint(m.x0, m.y0, m.w, m.h, m.ppt);
    let regions: Int16Array | null = null;
    if (m.regions) {
      const W = img.width, H = img.height;
      regions = new Int16Array(W * H);
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const x = m.x0 + (px + 0.5) / m.ppt, y = m.y0 + (py + 0.5) / m.ppt;
        regions[py * W + px] = painter.regionAtWarped(x, y, regionOf, w, h);
      }
    }
    const msg = { type: 'done', id: m.id, w: img.width, h: img.height, buf: img.data.buffer, regions: regions?.buffer ?? null };
    (self as any).postMessage(msg, regions ? [img.data.buffer, regions.buffer] : [img.data.buffer]);
  }
};
