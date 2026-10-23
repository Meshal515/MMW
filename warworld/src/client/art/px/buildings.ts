// Buildings and city pieces, pixel by pixel at their final size (top-down, light top-left).
import { Pix } from './dsl';

export interface Building { name: string; label: string; draw: () => Pix }

/** Pitched-roof house: lit north slope, shaded south slope, ridge between. */
function house(lit: string, mid: string, dark: string, w = 12, h = 10) {
  // hip roof: lit north slope, shaded south slope, lit west hip, dark east hip, ridge along the middle
  const p = new Pix(w + 2, h + 2), r = h / 2 + 0.5;
  p.rect(1, 1, w, Math.floor(r), lit).rect(1, Math.ceil(r), w, h, dark);
  p.poly([[1, 1], [1 + r - 1, r], [1, h + 1]], mid);
  p.poly([[w + 1, 1], [w + 1 - r + 1, r], [w + 1, h + 1]], dark);
  p.hl(Math.floor(r), Math.round(r), w + 1 - Math.round(r), mid);
  p.px(w - 3, 2, 'Q').px(w - 3, 3, 'S');
  return p.finish();
}
function apartment() {
  const p = new Pix(16, 12);
  p.rect(1, 1, 14, 10, 'X').rect(3, 3, 12, 8, 'V');
  p.rect(4, 4, 6, 5, 'S').rect(9, 4, 10, 4, 'S').rect(9, 7, 10, 7, 'S');
  p.rect(12, 3, 12, 5, 'Q').px(5, 7, 'T').px(6, 7, 'T');
  return p.finish();
}
function tower() {
  const p = new Pix(14, 14);
  p.rect(1, 1, 12, 12, 'X').rect(2, 2, 11, 11, 'h');
  for (let i = 2; i <= 11; i += 3) { p.vl(i, 2, 11, 'g'); }
  p.hl(2, 2, 11, 'i').rect(5, 5, 8, 8, 'Y').vl(6, 6, 7, 'Q').px(7, 6, 'Q');
  return p.finish();
}
function shop() {
  const p = new Pix(18, 10);
  p.rect(1, 1, 16, 8, 'Y').rect(2, 2, 15, 7, 'X');
  for (let x = 3; x < 15; x += 3) p.rect(x, 3, x + 1, 4, 'i');
  p.hl(8, 1, 16, 'r').px(4, 8, 's').px(10, 8, 's');
  return p.finish();
}
function tree(big = false) {
  const s = big ? 7 : 5, p = new Pix(s + 2, s + 2);
  p.ell(s / 2 + 1, s / 2 + 1, s / 2, s / 2, 'c');
  p.px(Math.floor(s / 2), Math.floor(s / 2), 'e').px(Math.floor(s / 2) + 1, Math.floor(s / 2), 'd');
  return p.finish();
}
function factory() {
  const p = new Pix(36, 26);
  // main hall: sawtooth roof — glazed north-light strips between sloped steel panels
  p.rect(1, 1, 22, 16, 'X');
  for (let x = 2; x <= 21; x += 4) { p.vl(x, 2, 15, 'Y'); p.vl(x + 1, 2, 15, 'V'); p.vl(x + 2, 2, 15, 'S'); p.vl(x + 3, 2, 15, 'i'); }
  p.hl(16, 1, 22, 'Q');
  // office annex with team stripe
  p.rect(23, 4, 33, 12, 'Y').rect(24, 5, 32, 11, 'X').hl(8, 24, 32, 'h').hl(5, 25, 30, 'T');
  // two chimneys + storage tanks
  p.ell(27.5, 17.5, 2.5, 2.5, 'S').ell(27.5, 17.5, 1.2, 1.2, 'K');
  p.ell(32.5, 17.5, 2.5, 2.5, 'S').ell(32.5, 17.5, 1.2, 1.2, 'K');
  p.ell(4.5, 21.5, 3, 3, 'X').ell(4.5, 21.5, 1.5, 1.5, 'Y');
  p.ell(11.5, 21.5, 3, 3, 'X').ell(11.5, 21.5, 1.5, 1.5, 'Y');
  // pipe rack + loading dock
  p.hl(21, 15, 24, 'y').hl(22, 15, 24, 'z');
  p.rect(16, 18, 21, 24, 'A');
  for (let y = 19; y <= 24; y += 2) p.hl(y, 17, 20, 'Z');
  return p.finish();
}
function warehouse() {
  const p = new Pix(22, 12);
  p.rect(1, 1, 20, 5, 'O').rect(1, 6, 20, 10, 'N').hl(5, 1, 20, 'P');
  for (let x = 4; x < 20; x += 5) p.vl(x, 1, 10, 'M');
  return p.finish();
}
function hangar() {
  const p = new Pix(18, 14);
  // arched roof: brightest strip near the top, darkening downwards
  const tones = ['Y', 'Y', 'X', 'X', 'V', 'V', 'V', 'S', 'S', 'Q', 'Q'];
  tones.forEach((t, i) => p.hl(i + 1, 1, 16, t));
  p.vl(16, 1, 11, 'Q').rect(1, 12, 16, 12, 'A');
  for (let x = 4; x < 16; x += 4) p.vl(x, 1, 11, 'S');
  return p.finish();
}
function controlTower() {
  const p = new Pix(9, 9);
  p.ell(4.5, 4.5, 3.6, 3.6, 'Y').ell(4.5, 4.5, 2.6, 2.6, 'h').ell(4.5, 4.5, 1.3, 1.3, 'X').px(3, 2, 'i');
  return p.finish();
}
/** Airbase ground: runway, taxiway and an apron with 2×6 parking slots (painted ground, no outline). */
export const AIRBASE = { w: 200, h: 104, runwayY: 10, laneY: 22, slotW: 28, slotX0: 14, rows: [44, 80] };
export function airbaseGround() {
  const { w, h } = AIRBASE, p = new Pix(w, h);
  p.rect(0, 4, w - 1, 15, 'A').hl(4, 0, w - 1, 'Q').hl(15, 0, w - 1, 'Q');
  for (let x = 18; x < w - 22; x += 9) p.hl(9, x, x + 4, 'Z').hl(10, x, x + 4, 'Z');
  for (const x0 of [3, w - 11]) for (let y = 6; y <= 13; y += 2) p.hl(y, x0, x0 + 7, 'Z');
  p.rect(13, 16, 17, 23, 'R').rect(w - 18, 16, w - 14, 23, 'R');
  p.rect(13, 20, w - 14, 24, 'R').hl(22, 14, w - 15, 'y');
  p.rect(8, 26, 186, h - 3, 'S');
  for (let i = 0; i <= 6; i++) { const x = 14 + i * 28; p.vl(x, 29, 59, 'z').vl(x, 65, 95, 'z'); }
  p.hl(62, 10, 184, 'z');
  for (let i = 0; i < 6; i++) { const x = 28 + i * 28; p.hl(31, x - 3, x + 3, 'Y').hl(67, x - 3, x + 3, 'Y'); }
  return p;
}

export const BUILDINGS: Record<string, Building> = {
  house_r: { name: 'house_r', label: 'منزل', draw: () => house('P', 'O', 'N') },
  house_g: { name: 'house_g', label: 'منزل', draw: () => house('Y', 'X', 'V') },
  house_t: { name: 'house_t', label: 'منزل', draw: () => house('I', 'I', 'B', 10, 9) },
  apartment: { name: 'apartment', label: 'عمارة سكنية', draw: apartment },
  tower: { name: 'tower', label: 'برج', draw: tower },
  shop: { name: 'shop', label: 'سوق', draw: shop },
  tree: { name: 'tree', label: 'شجرة', draw: () => tree() },
  treeB: { name: 'treeB', label: 'شجرة', draw: () => tree(true) },
  factory: { name: 'factory', label: 'مصنع', draw: factory },
  warehouse: { name: 'warehouse', label: 'مستودع', draw: warehouse },
  hangar: { name: 'hangar', label: 'حظيرة طائرات', draw: hangar },
  ctower: { name: 'ctower', label: 'برج مراقبة', draw: controlTower },
};
