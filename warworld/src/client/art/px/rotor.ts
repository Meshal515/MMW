// Pixel rotor discs: hard blades plus a translucent sweep behind each blade (6-frame loop).
import { COLORS } from './dsl';

export function rotorPx(R: number, blades: number, frames = 6) {
  const S = Math.ceil(R * 2 + 2), out: HTMLCanvasElement[] = [];
  const hub = COLORS['2'], blade = COLORS['1'], tip = COLORS['z'], sweep = COLORS['4'];
  for (let f = 0; f < frames; f++) {
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d')!, img = ctx.createImageData(S, S);
    const rot = (f / frames) * (Math.PI * 2 / blades);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - S / 2, dy = y + 0.5 - S / 2, r = Math.hypot(dx, dy);
      if (r > R) continue;
      const a = Math.atan2(dy, dx);
      let best = Infinity, behind = Infinity;
      for (let b = 0; b < blades; b++) {
        let d = a - (rot + (b / blades) * Math.PI * 2); d = Math.atan2(Math.sin(d), Math.cos(d));
        best = Math.min(best, Math.abs(d) * r);
        if (d < 0 && d > -0.9) behind = Math.min(behind, -d);
      }
      let col: number[] | null = null, al = 255;
      if (r < 1.6) col = hub;
      else if (best < 0.62) col = r > R - 1.5 ? tip : blade;
      else if (behind < 0.9 && r > 2.5) { col = sweep; al = Math.round(110 * (1 - behind / 0.9) ** 1.6); }
      else if (r > R - 0.8) { col = sweep; al = 34; }
      if (!col || al < 8) continue;
      img.data.set([col[0], col[1], col[2], al], (y * S + x) * 4);
    }
    ctx.putImageData(img, 0, 0);
    out.push(c);
  }
  return out;
}
