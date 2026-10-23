// Synthesised sound effects (WebAudio): no files to download or license. Every sound is shaped from
// noise and oscillators, panned and attenuated by where it happens relative to the camera.
let ctx: AudioContext | null = null, master: GainNode | null = null, noiseBuf: AudioBuffer | null = null;
let muted = false, volume = 0.7;
const last: Record<string, number> = {};

function ac() {
  if (ctx) return ctx;
  const C = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
  if (!C) return null;
  ctx = new C();
  master = ctx.createGain(); master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); let b = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.6 + b * 3; }
  return ctx;
}
/** Browsers only allow audio after a user gesture: call from the first tap/click. */
export function unlockAudio() { const c = ac(); if (c && c.state === 'suspended') void c.resume(); }
export function setMuted(m: boolean) { muted = m; if (master) master.gain.value = m ? 0 : volume; }
export function isMuted() { return muted; }
export function setVolume(v: number) { volume = v; if (master && !muted) master.gain.value = v; }

/** Spatial placement: pan from screen position (-1..1), gain from distance to view centre and zoom. */
export interface Where { pan: number; gain: number }
function out(w: Where) {
  const c = ctx!, g = c.createGain(); g.gain.value = w.gain;
  const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, w.pan));
  g.connect(p).connect(master!);
  return g;
}
function noise(dur: number) { const s = ctx!.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.loopStart = Math.random(); s.start(); s.stop(ctx!.currentTime + dur + 0.05); return s; }
function rate(key: string, ms: number) { const n = performance.now(); if (n - (last[key] ?? 0) < ms) return false; last[key] = n; return true; }
const ready = (w: Where) => !muted && w.gain > 0.01 && !!ac() && ctx!.state === 'running';

/** Explosion: a sharp crack, a low thump and a long rumble; bigger = deeper and longer. */
export function boom(size: number, w: Where) {
  if (!ready(w) || !rate('boom', 40)) return;
  const c = ctx!, t = c.currentTime, o = out(w), big = Math.min(1, size / 30);
  const n = noise(1.5 + big * 3), lp = c.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200 - big * 1800, t); lp.frequency.exponentialRampToValueAtTime(90, t + 0.6 + big * 2.5);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2 + big * 3);
  n.connect(lp).connect(g).connect(o);
  const s = c.createOscillator(); s.type = 'sine'; s.frequency.setValueAtTime(110 - big * 60, t); s.frequency.exponentialRampToValueAtTime(28, t + 0.5 + big);
  const sg = c.createGain(); sg.gain.setValueAtTime(0.8, t); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6 + big * 1.4);
  s.connect(sg).connect(o); s.start(t); s.stop(t + 2 + big * 2);
}
/** Machine-gun burst. */
export function gun(w: Where, shots = 6, heavy = false) {
  if (!ready(w) || !rate('gun', 90)) return;
  const c = ctx!, o = out(w);
  for (let i = 0; i < shots; i++) {
    const t = c.currentTime + i * (heavy ? 0.11 : 0.075), n = noise(0.08), bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = heavy ? 700 : 1500 + Math.random() * 500; bp.Q.value = 0.9;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(heavy ? 0.7 : 0.45, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + (heavy ? 0.09 : 0.05));
    n.connect(bp).connect(g).connect(o);
  }
}
/** Missile/rocket launch: a hiss that rises then fades. */
export function launch(w: Where, heavy = false) {
  if (!ready(w) || !rate('launch', 120)) return;
  const c = ctx!, t = c.currentTime, o = out(w), d = heavy ? 2.4 : 1;
  const n = noise(d), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(heavy ? 1800 : 3200, t + d);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(heavy ? 0.8 : 0.5, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  n.connect(bp).connect(g).connect(o);
}
/** Jet passing overhead: doppler sweep of a filtered roar. Faster jets sweep faster and higher. */
export function jet(w: Where, speed = 1) {
  if (!ready(w) || !rate('jet', 700)) return;
  const c = ctx!, t = c.currentTime, o = out(w), d = 2.2 / speed;
  const n = noise(d), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
  bp.frequency.setValueAtTime(1400 * speed, t); bp.frequency.exponentialRampToValueAtTime(380, t + d);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + d * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  n.connect(bp).connect(g).connect(o);
}
/** Helicopter rotor thump (a short loop of chops). */
export function rotor(w: Where) {
  if (!ready(w) || !rate('rotor', 900)) return;
  const c = ctx!, o = out(w);
  for (let i = 0; i < 9; i++) {
    const t = c.currentTime + i * 0.1, n = noise(0.06), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(lp).connect(g).connect(o);
  }
}
/** Two-tone air-raid style alert for incoming attacks/missiles. */
export function alarm(kind: 'attack' | 'missile' | 'info' = 'attack') {
  const w = { pan: 0, gain: 0.5 };
  if (!ready(w) || !rate('alarm' + kind, kind === 'info' ? 300 : 2500)) return;
  const c = ctx!, t = c.currentTime, o = out(w), s = c.createOscillator(), g = c.createGain();
  s.type = kind === 'info' ? 'triangle' : 'square';
  const f = kind === 'missile' ? [880, 660] : kind === 'attack' ? [520, 390] : [700, 940];
  const steps = kind === 'info' ? 2 : 6;
  for (let i = 0; i < steps; i++) s.frequency.setValueAtTime(f[i % 2], t + i * (kind === 'info' ? 0.07 : 0.22));
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === 'info' ? 0.15 : 0.22, t + 0.02);
  g.gain.setValueAtTime(kind === 'info' ? 0.15 : 0.22, t + steps * (kind === 'info' ? 0.07 : 0.22) - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + steps * (kind === 'info' ? 0.07 : 0.22));
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  s.connect(lp).connect(g).connect(o); s.start(t); s.stop(t + steps * 0.25 + 0.1);
}
/** UI click / build confirm. */
export function click(ok = true) {
  const w = { pan: 0, gain: 0.35 };
  if (!ready(w)) return;
  const c = ctx!, t = c.currentTime, o = out(w), s = c.createOscillator(), g = c.createGain();
  s.type = 'triangle'; s.frequency.setValueAtTime(ok ? 660 : 220, t); s.frequency.exponentialRampToValueAtTime(ok ? 990 : 150, t + 0.06);
  g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  s.connect(g).connect(o); s.start(t); s.stop(t + 0.1);
}
