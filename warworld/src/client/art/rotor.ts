// Animated rotor discs: solid blades plus a translucent swept trail behind each blade.
import { rampOf } from './forge';

export function rotorFrames(R: number, blades: number, frames = 6) {
  const S = Math.ceil(R * 2 + 4), out: HTMLCanvasElement[] = [];
  const blade = rampOf('navygrey'), dark: [number, number, number] = [36, 32, 46];
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
        const ba = rot + (b / blades) * Math.PI * 2;
        let d = a - ba; d = Math.atan2(Math.sin(d), Math.cos(d));
        best = Math.min(best, Math.abs(d) * r);
        if (d < 0 && d > -0.55) behind = Math.min(behind, -d);
      }
      const k = (y * S + x) * 4;
      let col: [number, number, number] | null = null, al = 255;
      const w = 1.25 + Math.min(0.6, r / R * 0.6);
      if (r < 2.6) col = r < 1.4 ? blade[2] : dark;
      else if (best < w - 0.55) col = r > R - 2 ? blade[4] : blade[3];
      else if (best < w) col = blade[1];
      else if (best < w + 0.75) col = dark;
      else if (behind < 0.75 && r > R * 0.28) { col = blade[3]; al = Math.round(150 * (1 - behind / 0.75) ** 1.4); }
      if (!col) continue;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = al;
    }
    ctx.putImageData(img, 0, 0);
    out.push(c);
  }
  return out;
}
