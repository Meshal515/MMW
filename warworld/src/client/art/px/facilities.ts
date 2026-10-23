// Facilities that stand outside cities (farms, mines, airbases, launch sites...), same pixel rules.
import { Pix } from './dsl';
import { BUILDINGS } from './buildings';
import { bank, barracks, hospital, market, portQuay, powerPlant } from './districts';

/** Patchwork fields with crop rows and a farmhouse. */
export function farm() {
  const p = new Pix(42, 30), crops = [['d', 'c'], ['p', 'o'], ['e', 'd'], ['q', 'p']];
  for (let fy = 0; fy < 2; fy++) for (let fx = 0; fx < 3; fx++) {
    const [a, b] = crops[(fx + fy * 2) % crops.length], x0 = 1 + fx * 14, y0 = 1 + fy * 14;
    p.rect(x0, y0, x0 + 12, y0 + 12, a);
    for (let y = y0 + 1; y <= y0 + 11; y += 2) p.hl(y, x0, x0 + 12, b);
  }
  p.rect(30, 16, 40, 27, 'G');
  p.rect(31, 17, 37, 22, 'N').hl(17, 31, 37, 'O').hl(22, 31, 37, 'M');
  p.ell(38.5, 25.5, 1.6, 1.6, 'X');
  p.noBevel = new Set(['c', 'd', 'e', 'o', 'p', 'q', 'G']);
  return p.finish();
}
/** Lumber camp: cleared ground, log stacks and a saw shed. */
export function lumber() {
  const p = new Pix(30, 24);
  p.ell(15, 12, 14, 11, 'n');
  for (let i = 0; i < 3; i++) { const y = 4 + i * 4; p.rect(3, y, 13, y + 2, 'o'); for (let x = 3; x <= 13; x += 2) p.px(x, y + 1, 'q'); p.vl(13, y, y + 2, 'p'); }
  p.rect(17, 5, 26, 13, 'b').hl(5, 17, 26, 'c').hl(13, 17, 26, 'a');
  p.rect(16, 16, 25, 18, 'm').hl(17, 16, 25, 'o');
  return p.finish();
}
/** Open-pit mine: terraced pit, conveyor and ore heap. */
export function mine() {
  const p = new Pix(34, 28);
  p.ell(13, 14, 12, 12, 'o').ell(13, 14, 9, 9, 'n').ell(13, 14, 6, 6, 'm').ell(13, 14, 3, 3, 'A');
  p.line(18, 8, 30, 4, 'y'); p.line(18, 9, 30, 5, 'Q');
  p.rect(26, 2, 32, 9, 'S').hl(2, 26, 32, 'X');
  p.ell(29, 21, 4, 3, 'Q').ell(28, 20, 2.5, 1.8, 'S');
  return p.finish();
}
/** Compact airbase that fits a region: runway, taxiway, three hangars and a small apron. */
export const AIRSTRIP = { w: 100, h: 46, runwayY: 8, apronY: 30, slots: [22, 42, 62, 82] };
export function airbaseSmall() {
  const { w, h } = AIRSTRIP, p = new Pix(w, h);
  p.rect(0, 3, w - 1, 12, 'A').hl(3, 0, w - 1, 'Q').hl(12, 0, w - 1, 'Q');
  for (let x = 12; x < w - 14; x += 8) p.hl(7, x, x + 3, 'Z').hl(8, x, x + 3, 'Z');
  for (const x0 of [2, w - 8]) for (let y = 5; y <= 10; y += 2) p.hl(y, x0, x0 + 5, 'Z');
  p.rect(8, 13, 11, 22, 'R').rect(w - 12, 13, w - 9, 22, 'R').rect(8, 19, w - 9, 22, 'R').hl(20, 9, w - 10, 'y');
  p.rect(12, 23, w - 13, h - 2, 'S');
  for (const x of [32, 52, 72]) p.vl(x, 25, h - 4, 'z');
  p.noBevel = new Set(['A', 'Q', 'Z', 'R', 'y', 'S', 'z']);
  return p;
}
export function hangarSmall() { return BUILDINGS.hangar.draw(); }
/** Missile launch site: hardened pad, two silo hatches, launcher on rails. */
export function silo() {
  const p = new Pix(28, 28);
  p.rect(1, 1, 26, 26, 'S').rect(3, 3, 24, 24, 'V');
  for (const [x, y] of [[8, 8], [19, 8]]) { p.ell(x + 0.5, y + 0.5, 4, 4, 'Q'); p.ell(x + 0.5, y + 0.5, 3, 3, 'X'); p.hl(y, x - 2, x + 3, 'Q'); }
  p.rect(6, 16, 21, 22, 'b').hl(16, 6, 21, 'c').rect(8, 18, 19, 20, 'W').px(19, 19, 'r').px(20, 19, 'r');
  p.px(13, 23, 'T').px(14, 23, 'T');
  return p.finish();
}
/** Nuclear plant: containment dome, cooling tower, turbine hall. */
export function nuclear() {
  const p = new Pix(42, 30);
  p.rect(1, 1, 40, 28, 'V');
  p.ell(11.5, 14.5, 9, 9, 'X').ell(10.5, 13.5, 7, 7, 'Y').ell(9.5, 12.5, 3, 3, 'W');
  p.ell(30.5, 10.5, 8, 8, 'X').ell(29.7, 9.7, 6, 6, 'S').ell(30.5, 10.5, 5, 5, 'Q').ell(31, 11, 3, 3, 'A');
  p.rect(22, 21, 39, 27, 'Y').rect(23, 22, 38, 26, 'X').hl(24, 24, 37, 'z');
  p.px(3, 3, 'T').px(4, 3, 'T');
  return p.finish();
}
/** SAM site: radar dish, command cabin and four launcher trucks on a sand pad. */
export function samSite() {
  const p = new Pix(34, 30);
  p.ell(17, 15, 16, 14, 'o').ell(17, 15, 14, 12, 'p');
  p.ell(17, 15, 4, 4, 'X').ell(16.3, 14.3, 2.6, 2.6, 'Y').px(17, 15, 'Q');
  for (const [x, y] of [[4, 4], [24, 4], [4, 21], [24, 21]]) {
    p.rect(x, y, x + 6, y + 4, 'c').hl(y, x, x + 6, 'd');
    for (let i = 0; i < 4; i++) p.px(x + 1 + i * 1.5, y + 2, 'W');
  }
  p.rect(14, 23, 20, 27, 'b').hl(23, 14, 20, 'c').px(17, 25, 'T');
  return p.finish();
}

/**
 * Border fort: concrete bunker with a firing slit, sandbag walls, a zigzag trench, rows of
 * anti-tank "dragon's teeth" and a supply stack. Its men and armour are drawn live on top.
 */
export const FORT_PITS = [[14, 37], [38, 37], [50, 9]];   // tank emplacements (art coords); third from level 3
export const FORT_TRENCH = { x0: 4, x1: 46, y: 22 };
export function fortArt(level = 1) {
  const p = new Pix(64, 48);
  // trench: dark zigzag with a lit near lip
  for (let x = FORT_TRENCH.x0; x <= FORT_TRENCH.x1; x++) { const y = FORT_TRENCH.y + (Math.floor(x / 6) % 2 ? 1 : -1); p.rect(x, y, x, y + 2, 'm').px(x, y, 'n'); }
  // sandbag parapet in front of the trench
  for (let x = FORT_TRENCH.x0 + 2; x < FORT_TRENCH.x1; x += 3) { const y = FORT_TRENCH.y - 3 + (Math.floor(x / 6) % 2 ? 1 : -1); p.rect(x, y, x + 1, y + 1, 'p').px(x, y, 'q').px(x + 1, y + 1, 'o'); }
  // bunker: thick concrete block, firing slit facing the border (east), roof hatch
  p.rect(6, 3, 24, 14, 'X').rect(7, 4, 23, 13, 'V').hl(3, 6, 24, 'Y').vl(6, 3, 14, 'Y');
  p.hl(9, 23, 24, 'K').hl(8, 23, 24, 'Q').rect(12, 7, 14, 9, 'S').px(13, 8, 'Q').rect(18, 6, 20, 7, 'S').px(10, 11, 'T').px(11, 11, 'T');
  if (level >= 2) { p.rect(28, 4, 38, 12, 'X').rect(29, 5, 37, 11, 'V').hl(4, 28, 38, 'Y').hl(8, 37, 38, 'K'); }
  // tank pits: U-shaped sandbag revetments, open to the rear, dirt floor
  FORT_PITS.slice(0, level >= 3 ? 3 : 2).forEach(([cx, cy]) => {
    p.rect(cx - 11, cy - 6, cx + 11, cy + 6, 'n');
    for (let x = cx - 12; x <= cx + 12; x += 2) { p.rect(x, cy - 8, x + 1, cy - 7, 'p').px(x, cy - 8, 'q'); p.rect(x, cy + 7, x + 1, cy + 8, 'o').px(x + 1, cy + 8, 'm'); }
    for (let y = cy - 6; y <= cy + 6; y += 2) p.rect(cx + 12, y, cx + 13, y + 1, 'p').px(cx + 12, y, 'q');
  });
  // dragon's teeth: staggered concrete pyramids on the border side, each lit top-left
  for (let row = 0; row < 2 + (level >= 3 ? 1 : 0); row++) for (let y = 17; y < 44; y += 5) {
    const x = 54 + row * 3 + (((y - 17) / 5) % 2 ? 2 : 0);
    if (x > 61) continue;
    p.px(x + 1, y, 'Y').hl(y + 1, x, x + 2, 'X').px(x, y + 1, 'Y').hl(y + 2, x, x + 2, 'S').px(x + 2, y + 1, 'S').px(x + 1, y + 1, 'V');
  }
  p.noBevel = new Set(['m', 'n', 'o', 'p', 'q']);
  return p.finish();
}

/** Every facility type → its art (districts reuse the city pieces when standing alone). */
export const FACILITY_ART: Record<string, () => Pix> = {
  farm, lumber, mine, silo, nuclear, airdefense: samSite,
  factory: () => BUILDINGS.factory.draw(), warehouse: () => BUILDINGS.warehouse.draw(),
  port: () => portQuay(60), barracks, hospital, market, bank, power: powerPlant,
  airbase: airbaseSmall,
  fort: () => fortArt(1), fort1: () => fortArt(1), fort2: () => fortArt(2), fort3: () => fortArt(3),
};
