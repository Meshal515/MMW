// RotSprite-style rotation for pixel art: Scale2x three times (8×), rotate with nearest-neighbour,
// then sample back down. Keeps hand-placed pixels crisp instead of smearing them.

function scale2x(src: Uint32Array, w: number, h: number) {
  const out = new Uint32Array(w * 2 * h * 2), W = w * 2;
  const at = (x: number, y: number) => src[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    if (C === A && C !== D && A !== B) e0 = A;
    if (A === B && A !== C && B !== D) e1 = B;
    if (D === C && D !== B && C !== A) e2 = C;
    if (B === D && B !== A && D !== C) e3 = D;
    const o = (y * 2) * W + x * 2;
    out[o] = e0; out[o + 1] = e1; out[o + W] = e2; out[o + W + 1] = e3;
  }
  return out;
}

/** Rotates an RGBA sprite by `angle` radians into a square canvas of side `out`. */
export function rotsprite(img: ImageData, angle: number, out: number): ImageData {
  let w = img.width, h = img.height;
  let buf = new Uint32Array(img.data.buffer.slice(0));
  for (let i = 0; i < 3; i++) { buf = scale2x(buf, w, h) as any; w *= 2; h *= 2; }
  const res = new ImageData(out, out);
  const r32 = new Uint32Array(res.data.buffer);
  const c = Math.cos(-angle), s = Math.sin(-angle);
  const cx = w / 2, cy = h / 2;
  for (let y = 0; y < out; y++) for (let x = 0; x < out; x++) {
    // sample the centre of this output pixel in the 8× rotated space
    const dx = (x + 0.5 - out / 2) * 8, dy = (y + 0.5 - out / 2) * 8;
    const sx = Math.floor(dx * c - dy * s + cx), sy = Math.floor(dx * s + dy * c + cy);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    r32[y * out + x] = buf[sy * w + sx];
  }
  return res;
}
