// Cinematic pixel effects. Everything is generated as pixel textures once, then animated with whole-pixel
// positions. Ground explosions leave a permanent scorch/crater decal with fires that burn out slowly;
// air explosions stay in the air and rain debris down onto the ground below (shadows show altitude).
import Phaser from 'phaser';

type C = [number, number, number];
const FIRE: C[] = [[255, 255, 236], [255, 240, 140], [255, 196, 64], [255, 140, 40], [228, 82, 34], [150, 44, 30], [74, 38, 34]];
const SMOKE: C[] = [[224, 220, 214], [182, 178, 176], [140, 136, 138], [100, 96, 102], [64, 60, 68]];

function hash(x: number, y: number, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

/** Fireball strip: a noisy ball that blooms white-hot, cools to orange/red and collapses into smoke. */
function fireballFrames(S: number, frames: number, seed: number) {
  const c = canvas(S * frames, S), ctx = c.getContext('2d')!, img = ctx.createImageData(S * frames, S);
  for (let f = 0; f < frames; f++) {
    const t = f / (frames - 1), grow = Math.min(1, 0.35 + t * 1.6), heat = Math.max(0, 1 - t * 1.25);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1, r = Math.hypot(dx, dy);
      const n = vnoise(x * 0.28 + f * 0.6, y * 0.28 - f * 0.9, seed) * 0.55 + vnoise(x * 0.6, y * 0.6, seed + 9) * 0.25;
      const edge = grow * (0.72 + n * 0.5);
      if (r > edge) continue;
      const k = r / edge;                      // 0 centre → 1 rim
      const temp = heat * (1 - k * 0.9) + (n - 0.4) * 0.35;
      let col: C, a = 255;
      if (temp > 0.82) col = FIRE[0]; else if (temp > 0.66) col = FIRE[1]; else if (temp > 0.5) col = FIRE[2];
      else if (temp > 0.36) col = FIRE[3]; else if (temp > 0.24) col = FIRE[4]; else if (temp > 0.12) col = FIRE[5];
      else { col = SMOKE[Math.min(4, 2 + Math.floor((1 - n) * 3))]; a = Math.round(255 * Math.max(0, 1 - t * 0.9)); }
      if (a < 20) continue;
      img.data.set([col[0], col[1], col[2], a], (y * S * frames + f * S + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
/** Smoke puff variants (soft pixel blobs in 3 shades). */
function puffFrames(S: number, n: number) {
  const c = canvas(S * n, S), ctx = c.getContext('2d')!, img = ctx.createImageData(S * n, S);
  for (let f = 0; f < n; f++) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1, r = Math.hypot(dx, dy);
    const nn = vnoise(x * 0.5, y * 0.5, f * 17 + 3);
    if (r > 0.75 + nn * 0.3) continue;
    const lit = -dx * 0.5 - dy * 0.5 + nn * 0.6;                   // light from the top-left
    const col = SMOKE[lit > 0.55 ? 0 : lit > 0.2 ? 1 : lit > -0.2 ? 2 : 3];
    img.data.set([col[0], col[1], col[2], 255], (y * S * n + f * S + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
/** Flame sprite: 4-frame flicker. */
function flameFrames() {
  const W = 7, H = 10, n = 4, c = canvas(W * n, H), ctx = c.getContext('2d')!, img = ctx.createImageData(W * n, H);
  for (let f = 0; f < n; f++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - W / 2) / (W / 2), v = (H - y - 0.5) / H;                  // v: 0 base → 1 tip
    const sway = Math.sin(v * 5 + f * 1.7) * 0.18 * v;
    const width = (1 - v) * 0.95 * (0.8 + vnoise(v * 4, f, 4) * 0.4);
    if (Math.abs(u - sway) > width) continue;
    const k = Math.abs(u - sway) / Math.max(0.01, width);
    const col = v < 0.35 && k < 0.5 ? FIRE[1] : k < 0.55 && v < 0.6 ? FIRE[2] : v > 0.75 ? FIRE[4] : FIRE[3];
    img.data.set([col[0], col[1], col[2], 255], (y * W * n + f * W + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
/** Permanent ground scar: grey ash core, scorched dirt ring with surviving grass patches, black burnt rim. */
export function craterDecal(R: number, seed: number) {
  const S = R * 2 + 4, c = canvas(S, S), ctx = c.getContext('2d')!, img = ctx.createImageData(S, S);
  const ash: C[] = [[138, 134, 128], [158, 154, 146], [176, 170, 158]], dirt: C[] = [[118, 74, 44], [140, 90, 52], [160, 108, 62]], burnt: C[] = [[46, 40, 40], [62, 54, 50]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // blocky 2-px cells like the ground pixels, a ragged edge
    const bx = x >> 1, by = y >> 1, dx = x + 0.5 - S / 2, dy = y + 0.5 - S / 2, r = Math.hypot(dx, dy) / R;
    const n = vnoise(bx * 0.45, by * 0.45, seed), h = hash(bx, by, seed + 1);
    const rr = r + (n - 0.5) * 0.45;
    if (rr > 1) continue;
    let col: C | null;
    if (rr < 0.38) col = ash[Math.floor(h * 3)];
    else if (rr < 0.82) col = h < 0.18 ? null : h < 0.3 ? burnt[0] : dirt[Math.floor(h * 3) % 3];   // holes = grass that survived
    else col = h < 0.45 ? null : burnt[Math.floor(h * 2)];
    if (!col) continue;
    img.data.set([col[0], col[1], col[2], 255], (y * S + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

interface Particle { o: Phaser.GameObjects.Image; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; kind: 'debris' | 'smoke' | 'spark' | 'ember'; grow: number }

export class Fx {
  private parts: Particle[] = [];
  private fires: { o: Phaser.GameObjects.Image; t: number; life: number; x: number; y: number; next: number }[] = [];
  private decals: Phaser.GameObjects.Image[] = [];
  private n = 0;
  constructor(private scene: Phaser.Scene) {
    const T = scene.textures;
    for (const [S, key] of [[24, 'fb_s'], [48, 'fb_m'], [96, 'fb_l']] as const) {
      if (T.exists(key)) continue;
      const t = T.addCanvas(key, fireballFrames(S, 10, S))!;
      for (let i = 0; i < 10; i++) t.add(String(i), 0, i * S, 0, S, S);
    }
    if (!T.exists('puff')) { const t = T.addCanvas('puff', puffFrames(12, 4))!; for (let i = 0; i < 4; i++) t.add(String(i), 0, i * 12, 0, 12, 12); }
    if (!T.exists('puffL')) { const t = T.addCanvas('puffL', puffFrames(28, 4))!; for (let i = 0; i < 4; i++) t.add(String(i), 0, i * 28, 0, 28, 28); }
    if (!T.exists('flame')) { const t = T.addCanvas('flame', flameFrames())!; for (let i = 0; i < 4; i++) t.add(String(i), 0, i * 7, 0, 7, 10); }
    if (!T.exists('dot')) { const c = canvas(1, 1); c.getContext('2d')!.fillStyle = '#fff'; c.getContext('2d')!.fillRect(0, 0, 1, 1); T.addCanvas('dot', c); }
    if (!T.exists('ring')) {
      const S = 64, c = canvas(S, S), ctx = c.getContext('2d')!, img = ctx.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const r = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2); if (r > S / 2 - 2 && r < S / 2 - 0.5) img.data.set([255, 250, 220, 255], (y * S + x) * 4); }
      ctx.putImageData(img, 0, 0); T.addCanvas('ring', c);
    }
    if (!T.exists('glow')) {
      const S = 64, c = canvas(S, S), ctx = c.getContext('2d')!, img = ctx.createImageData(S, S);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const r = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2); if (r < 1) img.data.set([255, 236, 170, Math.round(255 * (1 - r) ** 2)], (y * S + x) * 4); }
      ctx.putImageData(img, 0, 0); T.addCanvas('glow', c);
    }
  }

  /**
   * One explosion. size ≈ radius in world px. `alt` > 0 → in the air: no crater, debris falls to the ground.
   * `crater` paints a permanent scar and leaves fires burning.
   */
  explosion(x: number, y: number, size: number, opt: { alt?: number; crater?: boolean; fires?: number } = {}) {
    const S = this.scene, alt = opt.alt ?? 0, sy = y - alt;
    x = Math.round(x); y = Math.round(y);
    const key = size > 22 ? 'fb_l' : size > 9 ? 'fb_m' : 'fb_s', base = key === 'fb_l' ? 96 : key === 'fb_m' ? 48 : 24;
    const sc = Math.max(0.5, (size * 2.2) / base);
    // light: a soft glow that lights the ground around the blast for a moment
    const glow = S.add.image(x, alt ? sy : y, 'glow').setDepth(alt ? 61 : 42).setScale(size * 5 / 64).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.95);
    S.tweens.add({ targets: glow, alpha: 0, scale: size * 7 / 64, duration: 380, onComplete: () => glow.destroy() });
    // fireball
    const fb = S.add.image(x, Math.round(sy), key, '0').setDepth(alt ? 62 : 44).setScale(sc);
    let f = 0;
    const ev = S.time.addEvent({ delay: 55, repeat: 9, callback: () => { f++; if (f >= 10) { fb.destroy(); ev.remove(); } else fb.setFrame(String(f)); } });
    // shockwave on the ground
    if (!alt && size > 5) {
      const ring = S.add.image(x, y, 'ring').setDepth(41).setScale(size / 40).setAlpha(0.9);
      S.tweens.add({ targets: ring, scale: size * 3 / 32, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    }
    // debris: dark chunks thrown up (or falling from the sky)
    const nDeb = Math.min(28, 4 + Math.round(size * 1.2));
    for (let i = 0; i < nDeb; i++) {
      const a = (i / nDeb) * Math.PI * 2 + hash(i, this.n, 3), sp = size * (0.8 + hash(i, this.n, 5) * 1.6);
      const col = [0x2a2426, 0x4a3c34, 0x6a5a4a, 0xffb040][Math.floor(hash(i, this.n, 7) * 4)];
      this.add('debris', x, y, alt, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, alt ? -10 : 18 + hash(i, this.n, 9) * size * 2, 900 + hash(i, this.n, 1) * 700, col, 1);
    }
    for (let i = 0; i < Math.min(18, 4 + size); i++) this.add('spark', x, y, alt + 2, (hash(i, this.n, 11) - 0.5) * size * 5, (hash(i, this.n, 13) - 0.5) * size * 3, 10 + hash(i, this.n, 15) * 30, 300 + hash(i, this.n, 17) * 300, 0xffe070, 1);
    // smoke column that rises and drifts
    const puffs = Math.min(40, 3 + Math.round(size * 1.4));
    for (let i = 0; i < puffs; i++) S.time.delayedCall(120 + i * 45, () => this.add('smoke', x + (hash(i, this.n, 19) - 0.5) * size, y + (hash(i, this.n, 21) - 0.5) * size * 0.6, alt + 4, 3 + (hash(i, this.n, 23) - 0.3) * 6, 0, 8 + hash(i, this.n, 25) * 10, 2600 + hash(i, this.n, 27) * 2200, 0xffffff, size > 18 ? 1.6 : 1));
    if (!alt && opt.crater !== false && size > 4) this.crater(x, y, Math.round(size * 0.9), opt.fires ?? Math.round(size / 5));
    if (!alt && size > 12) this.shake(size);
    this.n++;
  }

  /** Permanent scorch mark + fires. */
  crater(x: number, y: number, R: number, fires = 0) {
    const key = `crater_${R}_${this.n % 6}`;
    if (!this.scene.textures.exists(key)) this.scene.textures.addCanvas(key, craterDecal(R, this.n % 6 + R));
    const d = this.scene.add.image(Math.round(x), Math.round(y), key).setDepth(3.6).setAlpha(0);
    this.scene.tweens.add({ targets: d, alpha: 1, duration: 260 });
    this.decals.push(d);
    if (this.decals.length > 500) this.decals.shift()!.destroy();
    for (let i = 0; i < fires; i++) {
      const a = hash(i, x, 31) * Math.PI * 2, r = hash(i, y, 33) * R;
      this.fire(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, 9000 + hash(i, x + y, 35) * 22000);
    }
  }

  fire(x: number, y: number, life: number) {
    if (this.fires.length > 260) return;
    const o = this.scene.add.image(Math.round(x), Math.round(y), 'flame', '0').setOrigin(0.5, 1).setDepth(6.5);
    this.fires.push({ o, t: hash(x, y, 1) * 4, life, x, y, next: 0 });
  }

  /** A wrecked aircraft falls: spins down along its heading, smoking, and blows up on the ground. */
  crash(tex: string, frame: string, x: number, y: number, alt: number, heading: number, onGround?: (x: number, y: number) => void) {
    const S = this.scene, o = S.add.image(x, y - alt, tex, frame).setDepth(60).setTint(0x8a7a70);
    const tx = x + Math.cos(heading) * alt * 2.4, ty = y + Math.sin(heading) * alt * 2.4;
    const smoke = S.time.addEvent({ delay: 60, loop: true, callback: () => { this.add('smoke', o.x, o.y + alt * 0, 0, 0, 0, 2, 1400, 0xffffff, 0.8); if (Math.random() < 0.5) this.add('spark', o.x, o.y, 0, 0, 0, 0, 200, 0xff8030, 1); } });
    S.tweens.add({ targets: o, x: tx, y: ty, rotation: o.rotation + 2.4, scale: 0.8, duration: 1300 + alt * 30, ease: 'Quad.easeIn', onComplete: () => { smoke.remove(); o.destroy(); this.explosion(tx, ty, 10, { crater: true, fires: 3 }); onGround?.(tx, ty); } });
  }

  /** Nuclear blast: white flash, rising fireball, ring, then a dense smoke pall that hides the target and slowly clears. */
  nuke(x: number, y: number, R: number, onCovered?: () => void) {
    const S = this.scene, cam = S.cameras.main;
    const flash = S.add.image(x, y, 'glow').setDepth(70).setScale(R * 9 / 64).setBlendMode(Phaser.BlendModes.ADD);
    S.tweens.add({ targets: flash, alpha: 0, duration: 1600, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
    cam.flash(300, 255, 250, 230, false);
    this.shake(60);
    for (let i = 0; i < 3; i++) S.time.delayedCall(i * 180, () => this.explosion(x + (i - 1) * R * 0.3, y + (i % 2) * R * 0.2, R * 0.6, { crater: false }));
    const ring = S.add.image(x, y, 'ring').setDepth(41).setScale(0.3).setTint(0xfff4c0);
    S.tweens.add({ targets: ring, scale: R * 4 / 32, alpha: 0, duration: 1600, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    // smoke pall: big puffs that cover the whole blast zone, then thin out and drift away
    const n = Math.min(90, 20 + Math.round(R * 1.2));
    S.time.delayedCall(450, () => {
      for (let i = 0; i < n; i++) {
        const a = hash(i, 5, 1) * Math.PI * 2, r = Math.sqrt(hash(i, 7, 2)) * R * 1.1;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.8;
        const o = S.add.image(Math.round(px), Math.round(py), 'puffL', String(i % 4)).setDepth(66).setScale(0.6).setAlpha(0);
        S.tweens.add({ targets: o, alpha: 1, scale: 1.4 + hash(i, 9, 3) * 0.8, duration: 700, ease: 'Quad.easeOut' });
        S.tweens.add({ targets: o, alpha: 0, x: o.x + 18 + hash(i, 3, 4) * 24, y: o.y - 10, delay: 5200 + hash(i, 11, 5) * 3500, duration: 3200, onComplete: () => o.destroy() });
      }
      S.time.delayedCall(800, () => onCovered?.());
    });
    this.crater(x, y, Math.round(R * 0.9), Math.round(R / 3));
  }

  muzzle(x: number, y: number, a: number) {
    const o = this.scene.add.image(Math.round(x + Math.cos(a) * 2), Math.round(y + Math.sin(a) * 2), 'dot').setDepth(45).setTint(0xfff0a0).setScale(2, 1).setRotation(a);
    this.scene.time.delayedCall(50, () => o.destroy());
  }
  /** A tracer: a short bright dash that flies to the target, with a puff of dust where it lands. */
  tracer(x0: number, y0: number, x1: number, y1: number, color = 0xffe070, alt0 = 0, alt1 = 0) {
    const S = this.scene, a = Math.atan2(y1 - alt1 - (y0 - alt0), x1 - x0);
    const t = S.add.image(Math.round(x0), Math.round(y0 - alt0), 'dot').setDepth(alt0 ? 61 : 45).setTint(color).setScale(3, 1).setRotation(a);
    const d = Math.hypot(x1 - x0, y1 - y0);
    S.tweens.add({ targets: t, x: Math.round(x1), y: Math.round(y1 - alt1), duration: Math.max(60, d * 2.2), onComplete: () => { t.destroy(); if (!alt1) this.add('spark', x1, y1, 0, 0, 0, 6, 160, 0xd8c8a0, 1); } });
  }

  shake(size: number) { const cam = this.scene.cameras.main; cam.shake(Math.min(700, 120 + size * 8), Math.min(0.012, 0.0015 + size * 0.0002)); }

  private add(kind: Particle['kind'], x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, tint: number, grow: number) {
    if (this.parts.length > 900) return;
    const o = kind === 'smoke' ? this.scene.add.image(x, y - z, 'puff', String((this.parts.length + this.n) % 4)).setDepth(z > 6 ? 63 : 46).setScale(0.5)
      : this.scene.add.image(x, y - z, 'dot').setTint(tint).setDepth(z > 6 ? 62 : 45).setScale(kind === 'debris' ? 2 : 1);
    this.parts.push({ o, x, y, z, vx, vy, vz, life, max: life, kind, grow });
  }

  update(dms: number) {
    const dt = dms / 1000;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dms;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'debris' || p.kind === 'spark') {
        p.vz -= 60 * dt; p.z = Math.max(0, p.z + p.vz * dt);
        if (p.z === 0) { p.vx *= 0.8; p.vy *= 0.8; }
      } else if (p.kind === 'smoke') { p.z += p.vz * dt; p.vz *= 0.995; p.vx += 2 * dt; }
      const k = Math.max(0, p.life / p.max);
      p.o.setPosition(Math.round(p.x), Math.round(p.y - p.z));
      if (p.kind === 'smoke') p.o.setScale((0.5 + (1 - k) * 1.6) * p.grow).setAlpha(Math.min(0.9, k * 1.4));
      else if (p.kind === 'spark') p.o.setAlpha(k);
      if (p.life <= 0) { p.o.destroy(); this.parts.splice(i, 1); }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t += dt; f.life -= dms;
      f.o.setFrame(String(Math.floor(f.t * 9) % 4)).setScale(f.life < 3000 ? Math.max(0.2, f.life / 3000) : 1);
      if (f.t > f.next) { f.next = f.t + 0.35 + hash(i, f.t * 10, 3) * 0.4; this.add('smoke', f.x, f.y - 6, 4, 2, 0, 9, 2400, 0xffffff, 0.7); }
      if (f.life <= 0) { f.o.destroy(); this.fires.splice(i, 1); }
    }
  }
}
