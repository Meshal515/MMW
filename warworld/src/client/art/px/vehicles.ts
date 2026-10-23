// Every vehicle, hand-placed pixel by pixel at its final in-game size (facing east, light top-left).
import { Pix } from './dsl';

export interface Vehicle { name: string; label: string; group: 'air' | 'heli' | 'sea' | 'land'; draw: () => Pix; rotor?: { x: number; r: number; blades: number }[] }

// ---------------- jets ----------------
function f16() {
  const p = new Pix(30, 25), c = 12;
  p.poly([[10, c - 1], [18.5, c - 1], [11.5, c - 10], [8, c - 10]], '3');
  p.hl(c - 10, 6, 13, '5').px(14, c - 10, 's').px(5, c - 10, '3');
  p.poly([[1.5, c - 1], [7.5, c - 1], [5, c - 6], [1.5, c - 6]], '3');
  p.mirror(c);
  p.rect(3, c - 2, 23, c + 2, '3').rect(24, c - 1, 26, c + 1, '3').px(27, c, '4').px(28, c, '2');
  p.rect(1, c - 1, 2, c + 1, '1');
  p.hl(c - 1, 5, 17, '4').hl(c + 2, 11, 18, '2');
  p.rect(18, c - 1, 22, c + 1, 'h').hl(c - 1, 19, 20, 'i').px(23, c, 'g');
  p.hl(c, 3, 10, '2').hl(c, 4, 7, 'T');
  p.px(12, c - 6, 'T').px(12, c + 6, 'U');
  p.hl(c - 4, 11, 13, '4');
  return p.finish();
}
function f35() {
  const p = new Pix(31, 25), c = 12;
  p.poly([[8, c - 2], [18.5, c - 2], [12.5, c - 10], [9, c - 10]], '8');
  p.poly([[1, c - 2], [7.5, c - 2], [4.5, c - 7], [1, c - 7]], '8');
  p.poly([[2.5, c - 3.5], [18, c - 4], [24, c - 2.5], [29, c], [2.5, c]], '8');
  p.mirror(c);
  p.rect(2, c - 1, 24, c + 1, '8');
  p.hl(c - 3, 5, 18, '9').hl(c - 1, 6, 16, '9');
  p.hl(c - 3, 3, 9, '7').hl(c + 3, 3, 9, '7').hl(c - 3, 4, 7, 'T').hl(c + 3, 4, 7, 'U');
  p.rect(18, c - 1, 22, c + 1, 'y').hl(c - 1, 19, 20, 'z').px(23, c, 'y');
  p.rect(0, c - 1, 1, c + 1, '6');
  p.hl(c - 6, 11, 13, '9').hl(c + 6, 11, 13, '7');
  return p.finish();
}
function su57() {
  const p = new Pix(34, 29), c = 14;
  p.poly([[9, c - 3], [21, c - 3], [12.5, c - 12], [8.5, c - 12]], '3');
  p.poly([[20, c - 2], [25, c - 2], [21, c - 4.5]], '3');
  p.poly([[1, c - 3], [7.5, c - 3], [4.5, c - 9], [1, c - 9]], '3');
  p.rect(2, c - 4, 13, c - 2, '3');
  p.mirror(c);
  p.rect(5, c - 1, 27, c + 1, '3').rect(28, c - 1, 29, c + 1, '3').px(30, c, '4').px(31, c, '2');
  p.rect(0, c - 4, 1, c - 2, '1').rect(0, c + 2, 1, c + 4, '1');
  p.hl(c - 4, 3, 12, '4').hl(c - 1, 8, 21, '4');
  p.hl(c - 5, 3, 9, '2').hl(c + 5, 3, 9, '2').hl(c - 5, 4, 7, 'T').hl(c + 5, 4, 7, 'U');
  p.rect(22, c - 1, 26, c + 1, 'h').hl(c - 1, 23, 24, 'i').px(27, c, 'g');
  return p.finish();
}
function b52() {
  const p = new Pix(48, 50), c = 24;
  p.poly([[20, c - 2], [26, c - 2], [14.5, c - 22], [11, c - 22]], '3');
  p.hl(c - 21, 11, 15, '4');
  for (const [x, y] of [[19, c - 8], [15, c - 15]]) { p.rect(x, y - 1, x + 5, y, '2').rect(x, y + 2, x + 5, y + 3, '2').px(x + 5, y - 1, '1').px(x + 5, y + 2, '1'); }
  p.poly([[2, c - 2], [8, c - 2], [3.5, c - 10], [1, c - 10]], '3');
  p.mirror(c);
  p.rect(2, c - 2, 42, c + 2, '3').rect(43, c - 1, 45, c + 1, '3').px(46, c, '4');
  p.hl(c - 1, 4, 41, '4').hl(c + 2, 6, 40, '2');
  p.hl(c, 2, 10, '2').hl(c, 3, 7, 'T');
  p.hl(c - 1, 41, 43, 'h').px(42, c - 1, 'i').hl(c + 1, 41, 43, 'g');
  return p.finish();
}
function b2() {
  const p = new Pix(32, 48), c = 23;
  p.poly([[29.5, c], [10, c - 22], [7, c - 21], [13, c - 14], [7, c - 8], [11, c - 3], [8.5, c], [29.5, c]], '8');
  p.mirror(c);
  p.poly([[29.5, c], [10, c - 22], [7, c - 21], [13, c - 14], [7, c - 8], [11, c - 3], [8.5, c]], '8');
  p.ell(20, c + 0.5, 7, 3.6, '9');
  p.hl(c - 1, 15, 25, '0');
  p.rect(24, c - 1, 26, c + 1, 'g').px(25, c - 1, 'h');
  p.rect(12, c - 4, 14, c - 3, '6').rect(12, c + 4, 14, c + 5, '6');
  p.hl(c - 19, 10, 11, 'T').hl(c + 19, 10, 11, 'U');
  for (let x = 14; x < 26; x += 3) p.line(x, c - (29 - x) * 1.1 + 1, x + 1, c - (29 - x) * 1.1 + 2, '9');
  return p.finish();
}
function ac130() {
  const p = new Pix(42, 46), c = 22;
  p.poly([[17, c - 2], [24, c - 2], [23, c - 21], [18.5, c - 21]], 'c');
  for (const y of [c - 7, c - 14]) { p.rect(22, y - 1, 27, y + 1, 'b').px(27, y, 'a'); p.vl(28, y - 3, y + 3, '3'); p.px(28, y, '1'); }
  p.poly([[2, c - 1], [8, c - 1], [6.5, c - 9], [2, c - 9]], 'c');
  p.mirror(c);
  p.rect(3, c - 3, 34, c + 3, 'c').rect(35, c - 2, 37, c + 2, 'c').rect(38, c - 1, 38, c + 1, 'c');
  p.hl(c - 2, 5, 33, 'd').hl(c + 3, 8, 32, 'b');
  p.hl(c, 2, 11, 'b').hl(c, 3, 7, 'T');
  p.rect(34, c - 1, 36, c + 1, 'h').px(35, c - 1, 'i');
  for (const x of [13, 17, 21]) p.px(x, c - 3, 'K');
  p.rect(14, c - 5, 15, c - 4, '1');
  return p.finish();
}
function reaper() {
  const p = new Pix(24, 31), c = 15;
  p.poly([[10, c - 1], [13, c - 1], [12.5, c - 14], [10, c - 14]], '4');
  p.hl(c - 12, 10, 12, 'T');
  p.poly([[2, c - 1], [5, c - 1], [3, c - 5], [1, c - 5]], '4');
  p.mirror(c);
  p.swap('T', 'U', 0, c + 1, 23, 30);
  p.rect(2, c - 1, 18, c + 1, '4').ell(19.5, c + 0.5, 3, 2, '4');
  p.hl(c - 1, 4, 18, '5');
  p.vl(0, c - 3, c + 3, '2').px(1, c, '1');
  p.px(21, c + 1, 'g');
  return p.finish();
}

// ---------------- helicopters (rotors drawn separately) ----------------
function apache() {
  const p = new Pix(28, 17), c = 8;
  p.rect(11, c - 6, 13, c - 3, 'b').rect(10, c - 6, 14, c - 5, '2').px(14, c - 6, '1');
  p.rect(2, c - 3, 3, c - 1, 'b');
  p.mirror(c);
  p.rect(3, c - 1, 9, c + 1, 'c').rect(1, c, 2, c, 'c');
  p.rect(9, c - 2, 21, c + 2, 'c').rect(22, c - 1, 24, c + 1, 'c').px(25, c, 'c');
  p.rect(10, c - 3, 14, c - 3, 'b').rect(10, c + 3, 14, c + 3, 'b');
  p.rect(17, c - 1, 19, c + 1, 'h').rect(13, c - 1, 15, c + 1, 'h').px(18, c - 1, 'i').px(14, c - 1, 'i');
  p.hl(c - 2, 10, 20, 'd');
  p.px(25, c + 1, 'K').px(6, c, 'T').px(5, c, 'T');
  p.vl(1, c - 3, c - 1, '3');
  return p.finish();
}
function blackhawk() {
  const p = new Pix(30, 17), c = 8;
  p.rect(2, c - 3, 3, c - 1, 'b');
  p.mirror(c);
  p.ell(18, c + 0.5, 8.5, 4.2, 'c');
  p.rect(3, c - 1, 11, c + 1, 'c').rect(1, c, 2, c, 'c');
  p.rect(22, c - 2, 25, c + 2, 'h').hl(c - 2, 22, 24, 'i');
  p.rect(14, c - 2, 18, c + 2, 'd').hl(c - 2, 14, 18, 'e');
  p.hl(c - 4, 13, 19, 'b').hl(c + 4, 13, 19, 'b');
  p.px(7, c, 'T').px(8, c, 'T');
  p.vl(1, c - 3, c - 1, '3');
  return p.finish();
}
function chinook() {
  const p = new Pix(40, 13), c = 6;
  p.rect(4, c - 3, 35, c + 3, 'c').ell(36, c + 0.5, 3, 3, 'c');
  p.rect(2, c - 2, 9, c + 2, 'd').rect(31, c - 2, 34, c + 2, 'd');
  p.hl(c - 3, 5, 34, 'd');
  p.rect(36, c - 2, 38, c + 2, 'h').px(37, c - 2, 'i');
  for (let x = 12; x < 29; x += 3) p.px(x, c - 2, 'h');
  p.hl(c, 18, 21, 'T');
  return p.finish();
}

// ---------------- ships ----------------
function hull(p: Pix, len: number, beam: number, c: number, bow: number, mat = '3') {
  p.poly([[0.5, c - beam / 2], [len - bow, c - beam / 2], [len - 0.5, c + 0.5], [0.5, c + 0.5]], mat);
  p.mirror(c);
}
function deckInset(p: Pix, len: number, beam: number, c: number, bow: number, mat = 'x') {
  p.poly([[1.5, c - beam / 2 + 1], [len - bow - 0.5, c - beam / 2 + 1], [len - 2.5, c + 0.5], [1.5, c + 0.5]], mat);
  p.poly([[1.5, c + beam / 2], [len - bow - 0.5, c + beam / 2], [len - 2.5, c + 0.5], [1.5, c + 0.5]], mat);
}
function turretGun(p: Pix, x: number, c: number, fwd = true) {
  p.ell(x + 0.5, c + 0.5, 1.6, 1.6, '4').px(x, c, '5');
  if (fwd) p.hl(c, x + 2, x + 4, '1'); else p.hl(c, x - 4, x - 2, '1');
}
function vlsGrid(p: Pix, x0: number, x1: number, y0: number, y1: number) {
  p.rect(x0, y0, x1, y1, 'v');
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x + y) % 2) p.px(x, y, 'w');
}
function patrol() {
  const p = new Pix(16, 7), c = 3;
  hull(p, 16, 6, c, 5);
  p.rect(5, c - 1, 8, c + 1, 'W').vl(9, c - 1, c + 1, 'h').px(12, c, '1').hl(c, 2, 3, 'T');
  return p.finish();
}
function corvette() {
  const p = new Pix(24, 8), c = 4;
  hull(p, 24, 7, c, 7);
  deckInset(p, 24, 7, c, 7);
  p.rect(7, c - 2, 13, c + 2, '4').vl(14, c - 1, c + 1, 'h').px(10, c, '2');
  turretGun(p, 17, c);
  p.rect(1, c - 2, 5, c + 2, 'w').px(3, c, 'W');
  p.hl(c, 8, 9, 'T');
  return p.finish();
}
function frigate() {
  const p = new Pix(30, 10), c = 5;
  hull(p, 30, 9, c, 8);
  deckInset(p, 30, 9, c, 8);
  vlsGrid(p, 17, 19, c - 1, c + 1);
  p.rect(8, c - 3, 15, c + 3, '4').vl(16, c - 2, c + 2, 'h').ell(11.5, c + 0.5, 1.5, 1.5, '2').px(11, c, '5');
  turretGun(p, 22, c);
  p.rect(1, c - 3, 6, c + 3, 'w').ell(3.5, c + 0.5, 2, 2, 'W').ell(3.5, c + 0.5, 1.2, 1.2, 'w');
  p.hl(c - 3, 9, 11, 'T');
  return p.finish();
}
function destroyer() {
  const p = new Pix(36, 11), c = 5;
  hull(p, 36, 10, c, 9);
  deckInset(p, 36, 10, c, 9);
  vlsGrid(p, 21, 24, c - 2, c + 2);
  vlsGrid(p, 6, 8, c - 2, c + 2);
  p.rect(10, c - 3, 19, c + 3, '4').vl(20, c - 2, c + 2, 'h').hl(c - 3, 10, 19, '5');
  p.ell(14.5, c + 0.5, 1.6, 1.6, '2').px(14, c, '5').rect(11, c - 1, 12, c + 1, '2');
  turretGun(p, 27, c);
  p.rect(1, c - 3, 5, c + 3, 'w').ell(3, c + 0.5, 2, 2, 'W').ell(3, c + 0.5, 1.2, 1.2, 'w');
  p.hl(c + 3, 15, 18, 'T').hl(c - 3, 15, 18, 'T');
  return p.finish();
}
function cruiser() {
  const p = new Pix(40, 13), c = 6;
  hull(p, 40, 12, c, 10);
  deckInset(p, 40, 12, c, 10);
  vlsGrid(p, 24, 27, c - 2, c + 2);
  vlsGrid(p, 8, 11, c - 2, c + 2);
  p.rect(13, c - 4, 22, c + 4, '4').vl(23, c - 3, c + 3, 'h').hl(c - 4, 13, 22, '5');
  p.ell(18.5, c + 0.5, 1.8, 1.8, '2').px(18, c, '5').ell(15, c + 0.5, 1.4, 1.4, '2');
  turretGun(p, 30, c);
  turretGun(p, 5, c, false);
  p.hl(c + 4, 16, 20, 'T').hl(c - 4, 16, 20, 'T');
  return p.finish();
}
function sub() {
  const p = new Pix(32, 7), c = 3;
  p.ell(16, c + 0.5, 15.2, 3.1, 'K');
  p.hl(c - 2, 6, 26, '1').hl(c - 1, 3, 29, '1');
  p.rect(18, c - 1, 21, c + 1, '2').hl(c - 1, 18, 21, '3').px(19, c, 'T');
  p.vl(19, c - 3, c - 2, '2').vl(19, c + 2, c + 3, '1');
  p.vl(1, c - 2, c + 2, '1');
  return p.finish();
}
function transport() {
  const p = new Pix(36, 12), c = 6;
  hull(p, 36, 11, c, 7, 'r');
  p.swap('r', 'r');
  deckInset(p, 36, 11, c, 7, 'x');
  const cols = ['C', 'D', 'E', 'J', 'D', 'C', 'J', 'E'];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) p.rect(9 + i * 3, j ? c + 1 : c - 3, 10 + i * 3, j ? c + 3 : c - 1, cols[(i * 2 + j) % cols.length]);
  p.rect(2, c - 3, 6, c + 3, 'W').vl(7, c - 2, c + 2, 'h').px(4, c, 'T').px(3, c, 'T');
  return p.finish();
}
function landing() {
  const p = new Pix(16, 9), c = 4;
  p.rect(0, c - 4, 14, c + 4, 'c');
  p.rect(4, c - 2, 13, c + 2, 'w').hl(c, 5, 12, 'v');
  p.rect(0, c - 3, 3, c + 3, 'd').px(1, c, 'T');
  p.vl(15, c - 3, c + 3, 'b');
  return p.finish();
}
function amphib() {
  const p = new Pix(52, 17), c = 8;
  hull(p, 52, 16, c, 6);
  p.rect(1, c - 7, 47, c + 7, 'x').poly([[47, c - 7], [50.5, c + 0.5], [47, c + 8]], 'x');
  p.hl(c - 4, 2, 46, 'z');
  for (let x = 8; x < 46; x += 8) { p.ell(x + 0.5, c - 3.5, 2, 2, 'W'); p.ell(x + 0.5, c - 3.5, 1.2, 1.2, 'x'); }
  p.rect(22, c + 4, 31, c + 7, '4').vl(32, c + 4, c + 6, 'h').hl(c + 4, 22, 31, '5').px(26, c + 5, '2');
  p.hl(c + 6, 23, 25, 'T');
  return p.finish();
}
function carrier() {
  const p = new Pix(64, 23), c = 11;
  p.poly([[1, c - 6], [52, c - 6], [62.5, c], [52, c + 7], [1, c + 7]], '3');
  p.poly([[1, c - 7], [50, c - 7], [60.5, c - 1], [60.5, c + 2], [50, c + 6], [2, c + 6]], 'x');
  p.poly([[12, c - 7], [34, c - 10.5], [38, c - 10.5], [26, c - 4]], 'x');
  p.line(4, c + 3, 35, c - 9, 'W');
  p.line(4, c + 4, 36, c - 8, 'w');
  for (let x = 3; x < 56; x += 4) p.hl(c + 1, x, x + 1, 'z');
  p.hl(c - 4, 44, 59, 'u').hl(c - 2, 44, 59, 'u');
  p.rect(36, c + 2, 43, c + 5, '4').hl(c + 2, 36, 43, '5').vl(44, c + 2, c + 4, 'h').px(39, c + 3, '2');
  p.rect(2, c + 3, 6, c + 5, 'w');
  p.hl(c + 5, 37, 40, 'T');
  return p.finish();
}
function supply() {
  const p = new Pix(38, 12), c = 6;
  hull(p, 38, 11, c, 8);
  deckInset(p, 38, 11, c, 8);
  for (const x of [12, 18, 24]) { p.ell(x + 0.5, c + 0.5, 2.6, 2.6, '4'); p.px(x - 1, c - 1, '5'); }
  for (const x of [15, 21]) p.vl(x, c - 4, c + 4, 'z');
  p.rect(2, c - 4, 8, c + 4, '4').vl(9, c - 3, c + 3, 'h').hl(c - 4, 2, 8, '5').px(4, c, 'T').px(5, c, 'T');
  return p.finish();
}

// ---------------- land ----------------
function tracks(p: Pix, x0: number, x1: number, c: number, half: number) {
  p.rect(x0, c - half, x1, c - half + 1, 'K');
  for (let x = x0; x <= x1; x += 2) p.px(x, c - half, '2');
}
function mbt() {
  const p = new Pix(20, 12), c = 6;
  tracks(p, 1, 14, c, 6);
  p.mirror(c);
  p.rect(2, c - 4, 14, c + 4, 'c').rect(15, c - 3, 15, c + 3, 'b');
  p.hl(c - 4, 2, 14, 'd').rect(2, c - 2, 3, c + 2, 'b');
  p.ell(7.5, c + 0.5, 3.6, 3.1, 'd').hl(c - 2, 6, 9, 'e');
  p.hl(c, 10, 19, '1').px(19, c, '2');
  p.px(6, c - 1, 'T').px(7, c - 1, 'T').px(6, c + 1, 'U');
  return p.finish();
}
function ifv() {
  const p = new Pix(17, 12), c = 6;
  tracks(p, 1, 14, c, 6);
  p.mirror(c);
  p.rect(2, c - 4, 14, c + 4, 'o').poly([[14, c - 4], [16, c - 2], [16, c + 3], [14, c + 5]], 'o');
  p.hl(c - 4, 2, 14, 'p');
  p.rect(7, c - 2, 10, c + 1, 'n').hl(c - 2, 7, 10, 'p').hl(c - 1, 11, 15, '1');
  p.rect(2, c - 1, 4, c + 1, 'T');
  return p.finish();
}
function apc() {
  const p = new Pix(16, 11), c = 5;
  for (const x of [3, 6, 9, 12]) p.rect(x, c - 5, x + 1, c - 5, 'K');
  p.mirror(c);
  p.rect(2, c - 4, 13, c + 4, 'c').poly([[13, c - 4], [15.5, c - 1], [15.5, c + 2], [13, c + 5]], 'c');
  p.hl(c - 4, 2, 13, 'd');
  p.rect(7, c - 1, 8, c + 1, 'b').hl(c, 9, 12, '1');
  p.rect(3, c - 1, 4, c + 1, 'T');
  return p.finish();
}
function spg() {
  const p = new Pix(22, 12), c = 6;
  tracks(p, 1, 14, c, 6);
  p.mirror(c);
  p.rect(2, c - 4, 14, c + 4, 'c').hl(c - 4, 2, 14, 'd');
  p.rect(3, c - 3, 9, c + 3, 'b').hl(c - 3, 3, 9, 'd');
  p.hl(c, 10, 21, '1').rect(20, c - 1, 21, c + 1, '1');
  p.px(5, c, 'T').px(6, c, 'T');
  return p.finish();
}
function mlrs() {
  const p = new Pix(17, 11), c = 5;
  for (const x of [3, 6, 12]) p.rect(x, c - 5, x + 1, c - 5, 'K');
  p.mirror(c);
  p.rect(2, c - 4, 15, c + 4, 'o').hl(c - 4, 2, 15, 'p');
  p.rect(12, c - 3, 15, c + 3, 'n').vl(15, c - 2, c + 2, 'h');
  p.rect(2, c - 3, 10, c + 3, 'b');
  for (let x = 3; x <= 9; x += 2) for (let y = c - 2; y <= c + 2; y += 2) p.px(x, y, 'K');
  p.px(13, c, 'T');
  return p.finish();
}
function aa() {
  const p = new Pix(16, 12), c = 6;
  tracks(p, 1, 13, c, 6);
  p.mirror(c);
  p.rect(2, c - 4, 13, c + 4, 'c').hl(c - 4, 2, 13, 'd');
  p.rect(6, c - 3, 11, c + 3, 'b');
  p.hl(c - 3, 9, 14, '1').hl(c + 3, 9, 14, '1');
  p.ell(4, c + 0.5, 1.6, 3, 'W').vl(4, c - 2, c + 2, '4');
  p.px(8, c, 'T');
  return p.finish();
}
function humvee() {
  const p = new Pix(11, 8), c = 3;
  p.rect(1, c - 3, 9, c + 3, 'o').hl(c - 3, 1, 9, 'p').vl(9, c - 2, c + 2, 'n');
  p.vl(6, c - 2, c + 2, 'h').rect(2, c - 2, 5, c + 2, 'n').px(3, c, 'T');
  p.px(2, c - 4, 'K').px(7, c - 4, 'K').px(2, c + 4, 'K').px(7, c + 4, 'K');
  return p.finish();
}
function truck() {
  const p = new Pix(15, 9), c = 4;
  p.rect(1, c - 3, 9, c + 3, 'b').hl(c - 3, 1, 9, 'd');
  for (let x = 2; x < 9; x += 2) p.vl(x, c - 2, c + 2, 'c');
  p.rect(10, c - 3, 13, c + 3, 'c').vl(13, c - 2, c + 2, 'h').px(11, c, 'T');
  for (const x of [2, 7, 11]) { p.px(x, c - 4, 'K'); p.px(x, c + 4, 'K'); }
  return p.finish();
}
function soldier(step: number) {
  // top-down rifleman facing east: helmet, shoulders, backpack, rifle forward, legs alternate when walking
  const p = new Pix(10, 9), c = 4;
  const lf = step === 1 ? 1 : 0, rf = step === 2 ? 1 : 0;
  p.hl(c - 2, 2 + lf, 3 + lf, 'a').hl(c + 2, 2 + rf, 3 + rf, 'a');
  p.rect(2, c - 1, 2, c + 1, 'b').rect(3, c - 2, 4, c + 2, 'c');
  p.ell(4, c + 0.5, 1.5, 1.5, 'd').px(3, c, 'e').px(4, c - 1, 'T');
  p.hl(c + 1, 5, 8, '1').px(5, c + 2, 'n');
  return p.finish();
}
function car(col: string) {
  const p = new Pix(8, 5), c = 2;
  p.rect(1, c - 1, 6, c + 1, col).rect(3, c - 1, 4, c + 1, 'h').px(4, c - 1, 'i');
  return p.finish();
}

export const VEHICLES: Vehicle[] = [
  { name: 'f16', label: 'F-16 فالكون', group: 'air', draw: f16 },
  { name: 'f35', label: 'F-35 لايتنينغ', group: 'air', draw: f35 },
  { name: 'su57', label: 'Su-57 فيلون', group: 'air', draw: su57 },
  { name: 'reaper', label: 'MQ-9 ريبر', group: 'air', draw: reaper },
  { name: 'ac130', label: 'AC-130 غانشيب', group: 'air', draw: ac130 },
  { name: 'b52', label: 'B-52 ستراتوفورتريس', group: 'air', draw: b52 },
  { name: 'b2', label: 'B-2 سبيريت', group: 'air', draw: b2 },
  { name: 'apache', label: 'أباتشي AH-64', group: 'heli', draw: apache, rotor: [{ x: 15, r: 12, blades: 4 }] },
  { name: 'blackhawk', label: 'بلاك هوك UH-60', group: 'heli', draw: blackhawk, rotor: [{ x: 17, r: 13, blades: 4 }] },
  { name: 'chinook', label: 'شينوك CH-47', group: 'heli', draw: chinook, rotor: [{ x: 33, r: 12, blades: 3 }, { x: 6, r: 12, blades: 3 }] },
  { name: 'patrol', label: 'زورق دورية', group: 'sea', draw: patrol },
  { name: 'corvette', label: 'كورفيت', group: 'sea', draw: corvette },
  { name: 'frigate', label: 'فرقاطة', group: 'sea', draw: frigate },
  { name: 'destroyer', label: 'مدمرة', group: 'sea', draw: destroyer },
  { name: 'cruiser', label: 'طراد', group: 'sea', draw: cruiser },
  { name: 'sub', label: 'غواصة', group: 'sea', draw: sub },
  { name: 'transport', label: 'سفينة نقل', group: 'sea', draw: transport },
  { name: 'landing', label: 'زورق إنزال', group: 'sea', draw: landing },
  { name: 'amphib', label: 'حاملة هجوم برمائي', group: 'sea', draw: amphib },
  { name: 'carrier', label: 'حاملة طائرات', group: 'sea', draw: carrier },
  { name: 'supply', label: 'سفينة إمداد', group: 'sea', draw: supply },
  { name: 'mbt', label: 'دبابة قتال', group: 'land', draw: mbt },
  { name: 'ifv', label: 'عربة قتال مشاة', group: 'land', draw: ifv },
  { name: 'apc', label: 'ناقلة جند 8×8', group: 'land', draw: apc },
  { name: 'spg', label: 'مدفعية ذاتية', group: 'land', draw: spg },
  { name: 'mlrs', label: 'راجمة صواريخ', group: 'land', draw: mlrs },
  { name: 'aa', label: 'دفاع جوي متحرك', group: 'land', draw: aa },
  { name: 'humvee', label: 'همفي استطلاع', group: 'land', draw: humvee },
  { name: 'truck', label: 'شاحنة إمداد', group: 'land', draw: truck },
  { name: 'soldier0', label: 'جندي', group: 'land', draw: () => soldier(0) },
  { name: 'soldier1', label: 'جندي (مشي)', group: 'land', draw: () => soldier(1) },
  { name: 'soldier2', label: 'جندي (مشي)', group: 'land', draw: () => soldier(2) },
  { name: 'car_r', label: 'سيارة', group: 'land', draw: () => car('r') },
  { name: 'car_b', label: 'سيارة', group: 'land', draw: () => car('D') },
  { name: 'car_w', label: 'سيارة', group: 'land', draw: () => car('5') },
];
export const VEHICLE = Object.fromEntries(VEHICLES.map(v => [v.name, v]));
