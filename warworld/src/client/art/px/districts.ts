// City pieces beyond the basic houses: dense housing, landmarks and the districts that make a city
// strong (hospital, market, bank, power plant, barracks, port). Same rules: final size, light top-left.
import { Pix } from './dsl';

/** Mid-rise block: flat roof with parapet, roof hatch, AC units, water tank. */
export function midrise(w: number, h: number, variant = 0) {
  const p = new Pix(w + 2, h + 2), roof = ['X', 'V', 'Y'][variant % 3];
  p.rect(1, 1, w, h, roof === 'Y' ? 'X' : 'Y').rect(2, 2, w - 1, h - 1, roof);
  p.rect(4, 4, 6, 5, 'S').rect(w - 5, 4, w - 4, 5, 'S').rect(4, h - 4, 5, h - 3, 'S');
  p.ell(w - 4, h - 3.5, 1.6, 1.6, 'Q').px(w - 5, h - 5, 'X');
  if (w > 18) p.rect(Math.floor(w / 2) - 1, 3, Math.floor(w / 2) + 1, 4, 'Q').hl(h - 3, 8, 12, 'h');
  return p.finish();
}
/** Glass tower: mullion grid, lit top edge, crown and helipad on the tallest. */
export function tallTower(s: number, glass: 'h' | 'B' = 'h', helipad = false) {
  const p = new Pix(s + 2, s + 2);
  p.rect(1, 1, s, s, 'X').rect(2, 2, s - 1, s - 1, glass);
  for (let i = 3; i < s - 1; i += 3) { p.vl(i, 2, s - 1, glass === 'h' ? 'g' : 'Q'); }
  p.hl(2, 2, s - 1, glass === 'h' ? 'i' : 'I').vl(2, 2, s - 1, glass === 'h' ? 'i' : 'I');
  const c = Math.floor(s / 2) + 1, r = Math.floor(s / 4);
  p.rect(c - r, c - r, c + r - 1, c + r - 1, 'Y').rect(c - r + 1, c - r + 1, c + r - 2, c + r - 2, 'V');
  if (helipad) { p.ell(c, c, r - 0.4, r - 0.4, 'Q'); p.vl(c - 2, c - 2, c + 1, 'z').vl(c + 1, c - 2, c + 1, 'z').hl(c, c - 2, c + 1, 'z'); }
  else p.rect(c - 1, c - 1, c, c, 'S');
  return p.finish();
}
/** Capital palace: sand-stone hall around a courtyard, central dome, team flags. */
export function palace() {
  const p = new Pix(46, 32);
  p.rect(1, 1, 44, 30, 'p').rect(4, 4, 41, 27, 'q').rect(9, 8, 36, 23, 'o');
  p.rect(11, 10, 34, 21, 'H');
  for (let x = 13; x <= 32; x += 4) p.vl(x, 11, 20, 'G');
  p.ell(22.5, 15.5, 6.5, 6.5, 'z').ell(21.5, 14.5, 4, 4, 'z').ell(23.5, 16.5, 5, 5, 'y').ell(21.5, 14.5, 3, 3, 'z');
  p.px(20, 12, 'W').px(21, 12, 'W').px(20, 13, 'W');
  for (const [x, y] of [[3, 3], [42, 3], [3, 28], [42, 28]]) { p.rect(x - 2, y - 2, x + 1, y + 1, 'q'); p.px(x, y, 'T').px(x - 1, y, 'T'); }
  p.rect(20, 28, 25, 30, 'Y');
  return p.finish();
}
export function hospital() {
  const p = new Pix(28, 24);
  p.rect(1, 1, 26, 8, 'Y').rect(10, 1, 17, 22, 'Y').rect(1, 15, 26, 22, 'Y');
  p.rect(2, 2, 25, 7, 'X').rect(11, 2, 16, 21, 'X').rect(2, 16, 25, 21, 'X');
  p.rect(12, 9, 15, 14, 'W').rect(11, 10, 16, 13, 'W').rect(13, 9, 14, 14, 'r').rect(11, 11, 16, 12, 'r');
  p.ell(5, 4.5, 2.6, 2.6, 'Q').vl(4, 3, 6, 'W').vl(6, 3, 6, 'W').px(5, 4, 'W');
  p.hl(19, 3, 8, 'h').hl(19, 19, 24, 'h');
  return p.finish();
}
export function market() {
  const p = new Pix(28, 24), cols = ['C', 'D', 'E', 'J', 'L', 'r', 'z'];
  p.rect(1, 1, 26, 22, 'V');
  let k = 0;
  for (let y = 2; y < 21; y += 6) for (let x = 2; x < 25; x += 6) {
    const c = cols[(k++ * 3 + y) % cols.length];
    p.rect(x, y, x + 4, y + 3, c);
    p.hl(y, x, x + 4, 'W');
    for (let i = x; i <= x + 4; i += 2) p.px(i, y + 1, 'W');
  }
  return p.finish();
}
/** Central bank: stepped tower with a gold crown. */
export function bank() {
  const p = new Pix(26, 26);
  p.rect(1, 1, 24, 24, 'Y').rect(3, 3, 22, 22, 'X').rect(6, 6, 19, 19, 'Y').rect(8, 8, 17, 17, 'z').rect(10, 10, 15, 15, 'y').rect(11, 11, 14, 14, 'z');
  p.hl(8, 8, 17, 'W').vl(8, 8, 17, 'W');
  for (let x = 4; x <= 21; x += 3) { p.px(x, 4, 'h'); p.px(x, 21, 'h'); }
  p.px(12, 12, 'T').px(13, 12, 'T');
  return p.finish();
}
/** Power plant: two cooling towers, turbine hall, switchyard. */
export function powerPlant() {
  const p = new Pix(58, 30);
  for (const cx of [9.5, 25.5]) { p.ell(cx, 11.5, 8, 8, 'X').ell(cx - 0.8, 10.7, 6, 6, 'S').ell(cx, 11.5, 5, 5, 'Q').ell(cx + 0.6, 12.1, 3.2, 3.2, 'A'); }
  p.rect(36, 2, 56, 14, 'Y').rect(37, 3, 55, 13, 'X');
  for (let x = 38; x < 55; x += 4) p.vl(x, 4, 12, 'V');
  p.rect(36, 17, 56, 28, 'V');
  for (let y = 18; y < 28; y += 3) p.hl(y, 37, 55, 'y');
  for (let x = 38; x < 56; x += 5) p.vl(x, 18, 27, 'Q');
  p.rect(2, 22, 32, 28, 'R').hl(25, 3, 31, 'y');
  return p.finish();
}
/** Barracks: fenced compound, olive halls, dirt parade ground with a running track, flag. */
export function barracks() {
  const p = new Pix(56, 44);
  p.rect(1, 1, 54, 42, 'Q').rect(2, 2, 53, 41, 'n');
  for (let x = 2; x < 54; x += 3) { p.px(x, 1, 'S'); p.px(x, 42, 'S'); }
  for (let i = 0; i < 3; i++) { p.rect(4, 4 + i * 12, 21, 12 + i * 12, 'c'); p.hl(8 + i * 12, 4, 21, 'b'); p.hl(4 + i * 12, 4, 21, 'd'); }
  p.ell(39.5, 21.5, 13, 9, 'o').ell(39.5, 21.5, 10.5, 6.6, 'p').ell(39.5, 21.5, 9.5, 5.6, 'H').ell(39.5, 21.5, 8, 4.2, 'G');
  p.vl(25, 4, 10, '2').hl(4, 26, 29, 'T').hl(5, 26, 29, 'T');
  p.rect(26, 33, 52, 39, 'A');
  for (let x = 28; x < 52; x += 5) p.vl(x, 34, 38, 'Z');
  return p.finish();
}
/** Port quay: concrete apron, warehouses, container stacks and two gantry cranes (water at the bottom). */
export function portQuay(w = 60) {
  const p = new Pix(w, 34);
  p.rect(0, 0, w - 1, 25, 'S').hl(25, 0, w - 1, 'Q');
  p.rect(2, 2, 18, 9, 'N').hl(2, 2, 18, 'P').hl(9, 2, 18, 'M');
  const cols = ['C', 'D', 'E', 'J', 'L', 'r'];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) p.rect(22 + i * 6, 3 + j * 4, 26 + i * 6, 5 + j * 4, cols[(i + j * 2) % cols.length]);
  for (let i = 0; i < 4; i++) p.rect(4 + i * 6, 13, 8 + i * 6, 15, cols[(i + 3) % cols.length]);
  for (const cx of [32, 48]) {
    if (cx + 4 >= w) continue;
    p.rect(cx - 4, 14, cx + 4, 15, 'z').rect(cx - 4, 22, cx + 4, 23, 'z');
    p.vl(cx - 4, 14, 23, 'y').vl(cx + 4, 14, 23, 'y');
    p.rect(cx - 1, 15, cx + 1, 32, 'z').vl(cx, 15, 32, 'y');
  }
  p.rect(0, 26, 7, 33, 'S').rect(w - 8, 26, w - 1, 33, 'S');
  for (let x = 2; x < w; x += 6) p.px(x, 24, 'K');
  return p.finish();
}

/** House turned the other way: ridge runs north–south, lit west slope, shaded east slope. */
export function houseV(r: number) {
  const [lit, mid, dark] = r < 0.45 ? ['P', 'O', 'N'] : r < 0.8 ? ['Y', 'X', 'V'] : ['I', 'I', 'B'];
  const w = 10, h = 12, p = new Pix(w + 2, h + 2), m = w / 2 + 0.5;
  p.rect(1, 1, Math.floor(m), h, lit).rect(Math.ceil(m), 1, w, h, dark);
  p.poly([[1, 1], [m, m], [w + 1, 1]], lit);
  p.poly([[1, h + 1], [m, h + 1 - m + 1], [w + 1, h + 1]], dark);
  p.vl(Math.floor(m), Math.round(m), h + 1 - Math.round(m), mid);
  p.px(2, h - 3, 'Q').px(3, h - 3, 'S');
  return p.finish();
}
