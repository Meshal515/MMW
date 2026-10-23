// Unit models for the sprite forge. Units are world pixels, facing +x (east), y down.
// Silhouettes follow the real top-down shapes of each class; proportions are tuned for readability.
import type { Model, Part } from './forge';

const P = (pts: [number, number][]) => pts;
/** Mirror a half outline (y ≥ 0 side, listed nose → tail) into a closed symmetric polygon. */
const sym = (half: [number, number][]): [number, number][] => [...half.map(([x, y]) => [x, -y] as [number, number]), ...[...half].reverse().map(([x, y]) => [x, y] as [number, number])];

// ---------------- fixed wing ----------------
const f16: Model = { name: 'f16', size: 44, parts: [
  { k: 'poly', pts: P([[5, 1.5], [-5, 1.5], [-8, 11], [-4.5, 11.4]]), mat: 'lightgrey', h: 2, mirror: true, bevel: 1.2 },
  { k: 'cap', x0: -7.5, y0: 12, x1: 1, y1: 12, r: 0.7, mat: 'white', h: 2.4, mirror: true },
  { k: 'poly', pts: P([[-12, 1.2], [-16.5, 1.2], [-17.5, 6.8], [-15, 6.8]]), mat: 'lightgrey', h: 2.2, mirror: true },
  { k: 'cap', x0: -17, y0: 0, x1: 12, y1: 0, r: 2.5, r1: 1.9, mat: 'lightgrey', h: 3 },
  { k: 'cap', x0: 11, y0: 0, x1: 18.5, y1: 0, r: 1.9, r1: 0.3, mat: 'lightgrey', h: 3 },
  { k: 'ell', x: -17.6, y: 0, rx: 1.3, ry: 1.7, mat: 'darksteel', h: 3 },
  { k: 'cap', x0: -16, y0: 0, x1: -9, y1: 0, r: 0.75, mat: 'navygrey', h: 6.5 },
  { k: 'cap', x0: -15.5, y0: 0, x1: -12, y1: 0, r: 0.55, mat: 'team', h: 7 },
  { k: 'ell', x: 8, y: 0, rx: 3.8, ry: 1.3, mat: 'glass', h: 5.2 },
  { k: 'ell', x: -3, y: 6.5, rx: 1, ry: 1, mat: 'team', h: 2.4, mirror: true } as Part,
] };

const f35: Model = { name: 'f35', size: 44, parts: [
  { k: 'poly', pts: P([[3, 2.5], [-7, 2.5], [-9.5, 11], [-6, 11.4]]), mat: 'stealth', h: 2, mirror: true, bevel: 1.5 },
  { k: 'poly', pts: P([[-11, 2.5], [-15.5, 2.5], [-16.5, 7.6], [-13.5, 7.6]]), mat: 'stealth', h: 2.2, mirror: true },
  { k: 'poly', pts: sym([[17.5, 0.2], [12, 1.6], [7, 2.6], [1, 4.1], [-13, 3.8], [-16, 2.4], [-16.5, 0.5]]), mat: 'stealth', h: 3, dome: 0.55, bevel: 2.5 },
  { k: 'cap', x0: -14, y0: 3.2, x1: -9, y1: 2.4, r: 0.7, mat: 'darksteel', h: 6.3, mirror: true },
  { k: 'cap', x0: -13.5, y0: 3.1, x1: -11, y1: 2.7, r: 0.5, mat: 'team', h: 6.7, mirror: true },
  { k: 'ell', x: -16.8, y: 0, rx: 1.4, ry: 1.6, mat: 'darksteel', h: 3 },
  { k: 'ell', x: 7.5, y: 0, rx: 3.6, ry: 1.35, mat: 'copper', h: 5.3 },
] };

const su57: Model = { name: 'su57', size: 48, parts: [
  { k: 'poly', pts: P([[7, 3.5], [-8, 4], [-11.5, 14], [-7.5, 14.5]]), mat: 'navygrey', h: 2, mirror: true, bevel: 1.5 },
  { k: 'poly', pts: P([[13, 2], [8, 2], [7, 4.6]]), mat: 'navygrey', h: 2.2, mirror: true },
  { k: 'poly', pts: P([[-13, 3.5], [-19, 3.5], [-20, 9.5], [-16, 9.5]]), mat: 'navygrey', h: 2.2, mirror: true },
  { k: 'cap', x0: -19, y0: 2.4, x1: -4, y1: 2.4, r: 1.9, mat: 'navygrey', h: 2.8, mirror: true },
  { k: 'poly', pts: sym([[20.5, 0.2], [14, 1.5], [6, 2.6], [-8, 2.8], [-14, 1.2], [-15, 0.4]]), mat: 'navygrey', h: 3.3, dome: 0.6, bevel: 2 },
  { k: 'ell', x: -19.6, y: 2.4, rx: 1.1, ry: 1.5, mat: 'darksteel', h: 3, mirror: true } as Part,
  { k: 'cap', x0: -16, y0: 4.8, x1: -10, y1: 4.2, r: 0.65, mat: 'darksteel', h: 6.5, mirror: true },
  { k: 'cap', x0: -15.5, y0: 4.7, x1: -12.5, y1: 4.4, r: 0.5, mat: 'team', h: 6.8, mirror: true },
  { k: 'ell', x: 10, y: 0, rx: 4, ry: 1.35, mat: 'glass', h: 5.4 },
] };

const b2: Model = { name: 'b2', size: 72, parts: [
  { k: 'poly', pts: [[14, 0], [-6, -33], [-9.5, -32], [-3.5, -22], [-9.5, -13], [-4.5, -6], [-7.5, 0], [-4.5, 6], [-9.5, 13], [-3.5, 22], [-9.5, 32], [-6, 33]], mat: 'darksteel', h: 3, dome: 0.7, bevel: 6 },
  { k: 'poly', pts: sym([[11, 0.3], [4, 4.2], [-2, 4.6], [-3, 0.4]]), mat: 'stealth', h: 4.4, dome: 0.6, bevel: 2.5 },
  { k: 'rect', x: 1, y: 5.5, w: 3, hh: 2, mat: 'black', h: 3.6, mirror: true },
  { k: 'ell', x: 9, y: 0, rx: 1.8, ry: 1.4, mat: 'glass', h: 5.5 },
  { k: 'cap', x0: -3, y0: 25, x1: 0, y1: 26, r: 0.7, mat: 'team', h: 3.8, mirror: true },
] };

const b52: Model = { name: 'b52', size: 76, parts: [
  { k: 'poly', pts: P([[7, 2], [0, 2], [-12, 32], [-8.5, 33]]), mat: 'lightgrey', h: 2, mirror: true, bevel: 1 },
  { k: 'cap', x0: -3, y0: 9, x1: 4, y1: 9, r: 1.1, mat: 'navygrey', h: 2.5, mirror: true },
  { k: 'cap', x0: -3, y0: 11.4, x1: 4, y1: 11.4, r: 1.1, mat: 'navygrey', h: 2.5, mirror: true },
  { k: 'cap', x0: -8, y0: 20, x1: -1, y1: 20, r: 1.1, mat: 'navygrey', h: 2.5, mirror: true },
  { k: 'cap', x0: -8, y0: 22.4, x1: -1, y1: 22.4, r: 1.1, mat: 'navygrey', h: 2.5, mirror: true },
  { k: 'poly', pts: P([[-24, 1.5], [-29, 1.5], [-31, 11], [-27.5, 11]]), mat: 'lightgrey', h: 2.2, mirror: true },
  { k: 'cap', x0: -31, y0: 0, x1: 28, y1: 0, r: 2.8, r1: 2.4, mat: 'lightgrey', h: 3.2 },
  { k: 'cap', x0: 27, y0: 0, x1: 32, y1: 0, r: 2.4, r1: 0.8, mat: 'lightgrey', h: 3.2 },
  { k: 'cap', x0: -30, y0: 0, x1: -23, y1: 0, r: 0.7, mat: 'navygrey', h: 7 },
  { k: 'cap', x0: -29.5, y0: 0, x1: -26, y1: 0, r: 0.55, mat: 'team', h: 7.5 },
  { k: 'ell', x: 27.5, y: 0, rx: 2.2, ry: 1.6, mat: 'glass', h: 5 },
] };

const ac130: Model = { name: 'ac130', size: 68, parts: [
  { k: 'poly', pts: P([[5, 1], [-4.5, 1], [-3.2, 28], [1.2, 28]]), mat: 'olive2', h: 2.5, mirror: true, bevel: 2, dome: 0.5 },
  { k: 'cap', x0: -2, y0: 8, x1: 7.5, y1: 8, r: 1.5, r1: 1.2, mat: 'olive', h: 3.6, mirror: true },
  { k: 'cap', x0: -2, y0: 16.5, x1: 7.5, y1: 16.5, r: 1.5, r1: 1.2, mat: 'olive', h: 3.6, mirror: true },
  { k: 'ell', x: 8.4, y: 8, rx: 0.45, ry: 3.6, mat: 'navygrey', h: 3.8, dome: 0, mirror: true } as Part,
  { k: 'ell', x: 8.4, y: 16.5, rx: 0.45, ry: 3.6, mat: 'navygrey', h: 3.8, dome: 0, mirror: true } as Part,
  { k: 'ell', x: 8.6, y: 8, rx: 0.6, ry: 0.6, mat: 'black', h: 4, mirror: true } as Part,
  { k: 'ell', x: 8.6, y: 16.5, rx: 0.6, ry: 0.6, mat: 'black', h: 4, mirror: true } as Part,
  { k: 'poly', pts: P([[-16, 1], [-21.5, 1], [-22.5, 10.5], [-18.5, 10.5]]), mat: 'olive2', h: 2.5, mirror: true, bevel: 1.5 },
  { k: 'cap', x0: -21, y0: 0, x1: 15, y1: 0, r: 3.9, r1: 3.7, mat: 'olive2', h: 3.5 },
  { k: 'cap', x0: 14, y0: 0, x1: 19.5, y1: 0, r: 3.7, r1: 1.6, mat: 'olive2', h: 3.5 },
  { k: 'cap', x0: -21, y0: 0, x1: -14, y1: 0, r: 0.8, mat: 'olive', h: 8 },
  { k: 'cap', x0: -20.5, y0: 0, x1: -17, y1: 0, r: 0.6, mat: 'team', h: 8.4 },
  { k: 'cap', x0: -5, y0: -4.3, x1: 0, y1: -4.8, r: 0.6, mat: 'black', h: 3.2 },
  { k: 'cap', x0: 4, y0: -4.3, x1: 7.5, y1: -5, r: 0.5, mat: 'black', h: 3.2 },
  { k: 'ell', x: 16.8, y: 0, rx: 1.5, ry: 2.5, mat: 'glass', h: 5.2 },
] };

const reaper: Model = { name: 'reaper', size: 48, parts: [
  { k: 'poly', pts: P([[1.5, 0.8], [-1.5, 0.8], [-2, 20], [0.3, 20]]), mat: 'lightgrey', h: 2, mirror: true, bevel: 0.8 },
  { k: 'poly', pts: P([[-8, 0.5], [-10, 0.5], [-12.5, 5.5], [-11.2, 5.6]]), mat: 'lightgrey', h: 2.5, mirror: true },
  { k: 'cap', x0: -10, y0: 0, x1: 9, y1: 0, r: 1.5, r1: 1.2, mat: 'lightgrey', h: 3 },
  { k: 'ell', x: 8.5, y: 0, rx: 1.8, ry: 1.3, mat: 'navygrey', h: 3.6 },
  { k: 'ell', x: -11, y: 0, rx: 0.5, ry: 2.4, mat: 'black', h: 3, dome: 0 },
  { k: 'cap', x0: -2, y0: 12, x1: 1, y1: 12, r: 0.6, mat: 'team', h: 2.4, mirror: true },
] };

// ---------------- rotary wing (rotors are drawn separately and animated) ----------------
const apache: Model = { name: 'apache', size: 60, scale: 1.3, parts: [
  { k: 'cap', x0: -21, y0: 0, x1: -4, y1: 0, r: 0.9, r1: 1.5, mat: 'olive', h: 3 },
  { k: 'rect', x: -20, y: -4, w: 2.4, hh: 8, mat: 'olive', h: 3.3, bevel: 0.6 },
  { k: 'rect', x: -2.5, y: 2, w: 4, hh: 5.5, mat: 'olive', h: 2.8, mirror: true, bevel: 0.8 },
  { k: 'cap', x0: -3, y0: 6.6, x1: 3, y1: 6.6, r: 1.2, mat: 'darksteel', h: 3.3, mirror: true },
  { k: 'cap', x0: -1, y0: 3.8, x1: 3, y1: 3.8, r: 0.7, mat: 'darksteel', h: 3.1, mirror: true },
  { k: 'cap', x0: -6, y0: 0, x1: 11, y1: 0, r: 2.7, r1: 2, mat: 'olive', h: 4 },
  { k: 'cap', x0: -3, y0: 2.5, x1: 2, y1: 2.5, r: 1.2, mat: 'olive2', h: 4.6, mirror: true },
  { k: 'ell', x: 8.5, y: 0, rx: 2.2, ry: 1.5, mat: 'glass', h: 5.8 },
  { k: 'ell', x: 4.8, y: 0, rx: 2, ry: 1.6, mat: 'glass', h: 6.2 },
  { k: 'cap', x0: 11, y0: 0, x1: 13.5, y1: 0, r: 0.5, mat: 'black', h: 3 },
  { k: 'ell', x: -12, y: 0, rx: 1.2, ry: 0.8, mat: 'team', h: 3.5 },
] };

const blackhawk: Model = { name: 'blackhawk', size: 60, scale: 1.3, parts: [
  { k: 'cap', x0: -21, y0: 0, x1: -5, y1: 0, r: 1, r1: 1.7, mat: 'black', h: 3 },
  { k: 'rect', x: -20.5, y: -3.5, w: 2.4, hh: 7, mat: 'black', h: 3.3, bevel: 0.6 },
  { k: 'ell', x: 2, y: 0, rx: 9.5, ry: 3.6, mat: 'olive', h: 4, dome: 0.8 },
  { k: 'rect', x: -3, y: 3.2, w: 4, hh: 2, mat: 'olive', h: 3.4, mirror: true },
  { k: 'ell', x: 9, y: 0, rx: 2.4, ry: 2.6, mat: 'glass', h: 5.4 },
  { k: 'rect', x: -2, y: -1.5, w: 4, hh: 3, mat: 'olive2', h: 6, bevel: 1 },
  { k: 'ell', x: -12, y: 0, rx: 1.3, ry: 0.9, mat: 'team', h: 3.5 },
] };

const chinook: Model = { name: 'chinook', size: 68, scale: 1.2, parts: [
  { k: 'rect', x: -18, y: -3.8, w: 34, hh: 7.6, mat: 'olive', h: 4, dome: 0.7, bevel: 2.5 },
  { k: 'cap', x0: 15, y0: 0, x1: 19, y1: 0, r: 3.6, r1: 2, mat: 'olive', h: 4 },
  { k: 'rect', x: -20, y: -2.5, w: 6, hh: 5, mat: 'olive2', h: 6.5, bevel: 1.5 },
  { k: 'ell', x: 17.6, y: 0, rx: 1.6, ry: 2.6, mat: 'glass', h: 5 },
  { k: 'rect', x: -10, y: 4, w: 14, hh: 1.6, mat: 'olive2', h: 3.4, mirror: true },
  { k: 'cap', x0: -4, y0: 0, x1: 4, y1: 0, r: 0.9, mat: 'team', h: 5.6 },
] };

// ---------------- naval ----------------
const hullPts = (len: number, beam: number, bow = 0.3, stern = 0.92): [number, number][] => sym([
  [len / 2, 0], [len / 2 - len * bow * 0.45, beam * 0.38], [len / 2 - len * bow, beam / 2], [-len / 2 * stern, beam / 2], [-len / 2, beam * 0.42], [-len / 2, 0.01],
]);

function warship(name: string, len: number, beam: number, extra: Part[]): Model {
  return { name, size: Math.ceil(len + 8), parts: [
    { k: 'poly', pts: hullPts(len, beam), mat: 'hull', h: 1, dome: 0.25, bevel: 2 },
    { k: 'poly', pts: hullPts(len - 2.4, beam - 2.2), mat: 'deck', h: 1.6, dome: 0.05, bevel: 0.8 },
    ...extra,
  ] };
}

const turret = (x: number, r = 1.8, barrel = 4.5): Part[] => [
  { k: 'cap', x0: x, y0: 0, x1: x + barrel, y1: 0, r: 0.45, mat: 'darksteel', h: 3.4 },
  { k: 'ell', x, y: 0, rx: r, ry: r, mat: 'lightgrey', h: 3.2 },
];
const vls = (x: number, w: number, hw: number): Part[] => [{ k: 'rect', x, y: -hw, w, hh: hw * 2, mat: 'deckdark', h: 1.8, dome: 0, bevel: 0.4 }];

const patrol = warship('patrol', 22, 6.2, [
  { k: 'rect', x: -3, y: -2, w: 7, hh: 4, mat: 'white', h: 3.5, bevel: 0.8 },
  { k: 'rect', x: 2.8, y: -1.6, w: 1, hh: 3.2, mat: 'glass', h: 3.7, bevel: 0.3 },
  ...turret(7.5, 1, 2.5),
  { k: 'rect', x: -9, y: -1, w: 3, hh: 2, mat: 'team', h: 2.2, bevel: 0.4 },
]);
const corvette = warship('corvette', 34, 7.4, [
  ...turret(11, 1.4, 3.5), ...vls(5, 3, 1.8),
  { k: 'rect', x: -6, y: -2.6, w: 10, hh: 5.2, mat: 'lightgrey', h: 4, bevel: 1 },
  { k: 'rect', x: 2.8, y: -2, w: 1, hh: 4, mat: 'glass', h: 4.2, bevel: 0.3 },
  { k: 'ell', x: -1, y: 0, rx: 1.2, ry: 1.2, mat: 'darksteel', h: 6 },
  { k: 'rect', x: -15, y: -2.6, w: 7, hh: 5.2, mat: 'deckdark', h: 1.7, dome: 0 },
  { k: 'rect', x: -4.5, y: -1, w: 3, hh: 2, mat: 'team', h: 4.5, bevel: 0.4 },
]);
const frigate = warship('frigate', 44, 8.6, [
  ...turret(15, 1.6, 4), ...vls(8.5, 4, 2.2),
  { k: 'rect', x: -8, y: -3, w: 14, hh: 6, mat: 'lightgrey', h: 4.2, bevel: 1.2 },
  { k: 'rect', x: 4.8, y: -2.4, w: 1, hh: 4.8, mat: 'glass', h: 4.4, bevel: 0.3 },
  { k: 'ell', x: 0, y: 0, rx: 1.5, ry: 1.5, mat: 'darksteel', h: 6.5 },
  { k: 'rect', x: -20, y: -3.2, w: 9, hh: 6.4, mat: 'deckdark', h: 1.7, dome: 0 },
  { k: 'ell', x: -15.5, y: 0, rx: 2.4, ry: 2.4, mat: 'white', h: 1.75, dome: 0 },
  { k: 'ell', x: -15.5, y: 0, rx: 1.7, ry: 1.7, mat: 'deckdark', h: 1.8, dome: 0 },
  { k: 'rect', x: -6, y: -1.2, w: 4, hh: 2.4, mat: 'team', h: 4.6, bevel: 0.4 },
]);
const destroyer = warship('destroyer', 56, 10, [
  ...turret(20, 2, 5), ...vls(12, 5, 2.6), ...vls(-11, 4, 2.6),
  { k: 'rect', x: -7, y: -3.8, w: 16, hh: 7.6, mat: 'lightgrey', h: 4.6, bevel: 1.5 },
  { k: 'rect', x: 7.8, y: -3, w: 1.1, hh: 6, mat: 'glass', h: 4.8, bevel: 0.3 },
  { k: 'ell', x: 2, y: 0, rx: 1.8, ry: 1.8, mat: 'darksteel', h: 7.5 },
  { k: 'rect', x: -4, y: -1, w: 3.5, hh: 2, mat: 'darksteel', h: 6, bevel: 0.6 },
  { k: 'rect', x: -26, y: -3.8, w: 11, hh: 7.6, mat: 'deckdark', h: 1.7, dome: 0 },
  { k: 'ell', x: -20.5, y: 0, rx: 2.8, ry: 2.8, mat: 'white', h: 1.75, dome: 0 },
  { k: 'ell', x: -20.5, y: 0, rx: 2, ry: 2, mat: 'deckdark', h: 1.8, dome: 0 },
  { k: 'rect', x: 0.5, y: -1.5, w: 4, hh: 3, mat: 'team', h: 5, bevel: 0.4 },
]);
const cruiser = warship('cruiser', 62, 12, [
  ...turret(23, 2.2, 5.5), ...turret(-23, 2.2, -5.5).map(p => p), ...vls(15, 5, 3), ...vls(-17, 5, 3),
  { k: 'rect', x: -9, y: -4.6, w: 20, hh: 9.2, mat: 'lightgrey', h: 5, bevel: 1.6 },
  { k: 'rect', x: 9.8, y: -3.6, w: 1.2, hh: 7.2, mat: 'glass', h: 5.2, bevel: 0.3 },
  { k: 'ell', x: 4, y: 0, rx: 2, ry: 2, mat: 'darksteel', h: 8 },
  { k: 'ell', x: -4, y: 0, rx: 1.8, ry: 1.8, mat: 'darksteel', h: 7.6 },
  { k: 'rect', x: -2, y: -1.8, w: 5, hh: 3.6, mat: 'team', h: 5.4, bevel: 0.4 },
]);
const sub: Model = { name: 'sub', size: 52, parts: [
  { k: 'cap', x0: -21, y0: 0, x1: 19, y1: 0, r: 3.1, r1: 2.6, mat: 'black', h: 1.5, dome: 0.8 },
  { k: 'poly', pts: P([[-19, 0], [-23, 0.1], [-23.5, 3.6], [-21.5, 3.6]]), mat: 'black', h: 1.4, mirror: true },
  { k: 'rect', x: 5, y: -1.1, w: 5.5, hh: 2.2, mat: 'darksteel', h: 4.5, bevel: 0.9 },
  { k: 'rect', x: 7, y: 1.2, w: 2, hh: 2.6, mat: 'darksteel', h: 4, mirror: true, bevel: 0.4 },
  { k: 'rect', x: 6, y: -0.6, w: 2.5, hh: 1.2, mat: 'team', h: 4.8, bevel: 0.3 },
] };
const transport: Model = { name: 'transport', size: 62, parts: [
  { k: 'poly', pts: hullPts(54, 12, 0.18, 0.95), mat: 'rust', h: 1, dome: 0.25, bevel: 2 },
  { k: 'poly', pts: hullPts(51, 9.8, 0.16, 0.95), mat: 'deck', h: 1.5, dome: 0.05, bevel: 0.8 },
  ...[0, 1, 2, 3, 4, 5].flatMap(i => [-1, 1].map(s => ({ k: 'rect', x: 13 - i * 5.4, y: s < 0 ? -4.4 : 0.2, w: 5, hh: 4.2, mat: (['container1', 'container2', 'container3', 'container4'] as const)[(i * 3 + (s + 1)) % 4], h: 3 + ((i + s) % 2), bevel: 0.6 } as Part))),
  { k: 'rect', x: -24, y: -4.6, w: 6, hh: 9.2, mat: 'white', h: 5.5, bevel: 1.2 },
  { k: 'rect', x: -18.8, y: -3.8, w: 0.9, hh: 7.6, mat: 'glass', h: 5.7, bevel: 0.2 },
  { k: 'rect', x: -23, y: -1.2, w: 3, hh: 2.4, mat: 'team', h: 6, bevel: 0.4 },
] };
const landing: Model = { name: 'landing', size: 28, parts: [
  { k: 'rect', x: -10, y: -4, w: 20, hh: 8, mat: 'olive', h: 1.2, bevel: 1.2 },
  { k: 'rect', x: -5, y: -2.8, w: 14, hh: 5.6, mat: 'deckdark', h: 1.6, dome: 0, bevel: 0.4 },
  { k: 'rect', x: -9.5, y: -3.4, w: 4, hh: 6.8, mat: 'olive2', h: 3.6, bevel: 0.8 },
  { k: 'rect', x: -8, y: -1, w: 2, hh: 2, mat: 'team', h: 3.9, bevel: 0.3 },
] };
const amphib: Model = { name: 'amphib', size: 92, parts: [
  { k: 'poly', pts: hullPts(84, 18, 0.12, 0.98), mat: 'hull', h: 1, dome: 0.2, bevel: 2 },
  { k: 'poly', pts: sym([[40, 0.5], [36, 7.5], [-41, 7.8], [-41, 0.1]]), mat: 'deck', h: 2, dome: 0, bevel: 0.6 },
  ...[30, 16, 2, -12, -26].map(x => ({ k: 'ell', x, y: -3, rx: 2.4, ry: 2.4, mat: 'white', h: 2.05, dome: 0 } as Part)),
  ...[30, 16, 2, -12, -26].map(x => ({ k: 'ell', x, y: -3, rx: 1.7, ry: 1.7, mat: 'deck', h: 2.1, dome: 0 } as Part)),
  { k: 'rect', x: -6, y: 5, w: 18, hh: 4.4, mat: 'lightgrey', h: 6, bevel: 1.3 },
  { k: 'rect', x: 11.2, y: 5.4, w: 0.9, hh: 3.4, mat: 'glass', h: 6.2, bevel: 0.2 },
  { k: 'ell', x: 4, y: 7, rx: 1.4, ry: 1.4, mat: 'darksteel', h: 8.5 },
  { k: 'rect', x: -40, y: -6, w: 70, hh: 0.6, mat: 'yellow', h: 2.06, dome: 0, bevel: 0.1 },
  { k: 'rect', x: -3, y: 6.2, w: 4, hh: 2, mat: 'team', h: 6.4, bevel: 0.3 },
] };
const carrier: Model = { name: 'carrier', size: 112, parts: [
  { k: 'poly', pts: hullPts(100, 20, 0.14, 0.98), mat: 'hull', h: 1, dome: 0.2, bevel: 2 },
  { k: 'poly', pts: [[48, -4], [44, -9], [-46, -10.5], [-49, -6], [-49, 6], [-30, 9], [18, 12.8], [30, 10], [46, 4]], mat: 'deck', h: 2, dome: 0, bevel: 0.6 },
  { k: 'poly', pts: [[-49, 0.4], [18, 12.2], [17.6, 12.9], [-49, 1.2]], mat: 'white', h: 2.06, dome: 0, bevel: 0.1 },
  { k: 'rect', x: -48, y: -0.4, w: 92, hh: 0.6, mat: 'yellow', h: 2.05, dome: 0, bevel: 0.1 },
  { k: 'rect', x: 22, y: -6.5, w: 24, hh: 0.5, mat: 'white', h: 2.05, dome: 0, bevel: 0.1 },
  { k: 'rect', x: 22, y: -3.2, w: 24, hh: 0.5, mat: 'white', h: 2.05, dome: 0, bevel: 0.1 },
  { k: 'rect', x: -8, y: 7, w: 14, hh: 4.8, mat: 'lightgrey', h: 7, bevel: 1.4 },
  { k: 'rect', x: 4.8, y: 7.4, w: 0.9, hh: 4, mat: 'glass', h: 7.3, bevel: 0.2 },
  { k: 'ell', x: -1, y: 9.4, rx: 1.6, ry: 1.6, mat: 'darksteel', h: 10 },
  { k: 'rect', x: -6, y: 8, w: 4, hh: 2.6, mat: 'team', h: 7.4, bevel: 0.3 },
] };
const supply: Model = { name: 'supply', size: 64, parts: [
  { k: 'poly', pts: hullPts(56, 11, 0.2, 0.95), mat: 'hull', h: 1, dome: 0.25, bevel: 2 },
  { k: 'poly', pts: hullPts(53, 9, 0.18, 0.95), mat: 'deck', h: 1.5, dome: 0.05, bevel: 0.8 },
  ...[14, 6, -2].map(x => ({ k: 'ell', x, y: 0, rx: 3.2, ry: 3.2, mat: 'lightgrey', h: 3.5 } as Part)),
  ...[10, 2].map(x => ({ k: 'rect', x, y: -4.2, w: 0.8, hh: 8.4, mat: 'yellow', h: 6, bevel: 0.2 } as Part)),
  { k: 'rect', x: -24, y: -4.4, w: 12, hh: 8.8, mat: 'lightgrey', h: 5, bevel: 1.3 },
  { k: 'rect', x: -12.6, y: -3.6, w: 0.9, hh: 7.2, mat: 'glass', h: 5.2, bevel: 0.2 },
  { k: 'rect', x: -21, y: -1.2, w: 4, hh: 2.4, mat: 'team', h: 5.4, bevel: 0.3 },
] };

// ---------------- land ----------------
const tracks = (x0: number, len: number, y: number, w: number): Part[] => [
  { k: 'rect', x: x0, y, w: len, hh: w, mat: 'rubber', h: 1.4, mirror: true, bevel: 0.6 },
  ...Array.from({ length: Math.floor(len / 2.2) }, (_, i) => ({ k: 'rect', x: x0 + 0.6 + i * 2.2, y: y + 0.4, w: 0.8, hh: w - 0.8, mat: 'darksteel', h: 1.6, mirror: true, dome: 0, bevel: 0.1 } as Part)),
];
const mbt: Model = { name: 'mbt', size: 34, parts: [
  ...tracks(-11, 22, 3.6, 2.8),
  { k: 'rect', x: -10.5, y: -4, w: 21, hh: 8, mat: 'camo', h: 2.4, bevel: 1.2 },
  { k: 'rect', x: 7, y: -3, w: 3, hh: 6, mat: 'olive', h: 2.6, dome: 0.2, bevel: 0.6 },
  { k: 'cap', x0: 2, y0: 0, x1: 17, y1: 0, r: 0.75, mat: 'darksteel', h: 5.2 },
  { k: 'poly', pts: sym([[5.5, 1.5], [3.5, 3.7], [-6, 3.6], [-7, 2.5], [-7, 0.2]]), mat: 'camo', h: 4.2, dome: 0.5, bevel: 1.4 },
  { k: 'ell', x: -2.5, y: -1.5, rx: 1.1, ry: 1.1, mat: 'team', h: 5.6 },
  { k: 'rect', x: -6.5, y: 0.6, w: 3, hh: 2, mat: 'olive', h: 5, bevel: 0.4 },
] };
const ifv: Model = { name: 'ifv', size: 30, parts: [
  ...tracks(-9.5, 19, 3.2, 2.4),
  { k: 'rect', x: -9, y: -3.6, w: 18, hh: 7.2, mat: 'tan', h: 2.6, bevel: 1.1 },
  { k: 'poly', pts: sym([[8.6, 1], [6, 3.6], [-9, 3.6], [-9, 0.1]]), mat: 'tan', h: 2.8, dome: 0.3, bevel: 1 },
  { k: 'cap', x0: 1, y0: -0.8, x1: 9, y1: -0.8, r: 0.45, mat: 'darksteel', h: 4.8 },
  { k: 'rect', x: -1.5, y: -2.6, w: 4.4, hh: 3.8, mat: 'tan', h: 4.2, bevel: 0.9 },
  { k: 'rect', x: -8, y: -1.2, w: 3, hh: 2.4, mat: 'team', h: 3.1, bevel: 0.4 },
] };
const apc: Model = { name: 'apc', size: 30, parts: [
  ...[-6.5, -2.2, 2.2, 6.5].map(x => ({ k: 'ell', x, y: 4.1, rx: 1.4, ry: 0.9, mat: 'rubber', h: 1.4, mirror: true } as Part)),
  { k: 'poly', pts: sym([[10, 1.4], [8, 3.8], [-9.5, 3.8], [-10, 3], [-10, 0.1]]), mat: 'olive2', h: 2.6, dome: 0.35, bevel: 1.2 },
  { k: 'rect', x: -1, y: -1.6, w: 3, hh: 3.2, mat: 'olive', h: 4.2, bevel: 0.8 },
  { k: 'cap', x0: 1, y0: 0, x1: 5, y1: 0, r: 0.35, mat: 'black', h: 4.6 },
  { k: 'rect', x: -8, y: -1.4, w: 3, hh: 2.8, mat: 'team', h: 3.1, bevel: 0.4 },
] };
const spg: Model = { name: 'spg', size: 36, parts: [
  ...tracks(-10.5, 20, 3.4, 2.6),
  { k: 'rect', x: -10, y: -3.8, w: 20, hh: 7.6, mat: 'camo', h: 2.4, bevel: 1.2 },
  { k: 'cap', x0: 0, y0: 0, x1: 18, y1: 0, r: 0.8, mat: 'darksteel', h: 5.8 },
  { k: 'cap', x0: 16, y0: 0, x1: 18.5, y1: 0, r: 1.1, mat: 'darksteel', h: 5.9 },
  { k: 'rect', x: -8.5, y: -3.2, w: 11, hh: 6.4, mat: 'camo', h: 4.8, bevel: 1.3 },
  { k: 'rect', x: -7, y: -1.2, w: 3, hh: 2.4, mat: 'team', h: 5.3, bevel: 0.4 },
] };
const mlrs: Model = { name: 'mlrs', size: 32, parts: [
  ...[-6, -1.6, 5.5].map(x => ({ k: 'ell', x, y: 3.6, rx: 1.4, ry: 0.9, mat: 'rubber', h: 1.4, mirror: true } as Part)),
  { k: 'rect', x: -9, y: -3.4, w: 18, hh: 6.8, mat: 'tan', h: 2.2, bevel: 0.8 },
  { k: 'rect', x: 4.5, y: -3.2, w: 5, hh: 6.4, mat: 'tan', h: 4.2, bevel: 1.1 },
  { k: 'rect', x: 8.3, y: -2.6, w: 0.9, hh: 5.2, mat: 'glass', h: 4.4, bevel: 0.2 },
  { k: 'rect', x: -8.5, y: -2.8, w: 11, hh: 5.6, mat: 'olive', h: 4.6, bevel: 0.6 },
  ...[-7.5, -5.5, -3.5, -1.5, 0.5].flatMap(x => [-1.6, 0.6].map(y => ({ k: 'ell', x: x + 0.8, y: y + 0.5, rx: 0.6, ry: 0.6, mat: 'black', h: 4.8, dome: 0 } as Part))),
  { k: 'rect', x: 5, y: -1, w: 2.5, hh: 2, mat: 'team', h: 4.6, bevel: 0.3 },
] };
const aa: Model = { name: 'aa', size: 30, parts: [
  ...tracks(-9.5, 19, 3.2, 2.4),
  { k: 'rect', x: -9, y: -3.6, w: 18, hh: 7.2, mat: 'camo', h: 2.4, bevel: 1.1 },
  { k: 'rect', x: -4, y: -3, w: 8, hh: 6, mat: 'camo', h: 4.4, bevel: 1.2 },
  { k: 'cap', x0: 0, y0: -3.6, x1: 9, y1: -3.6, r: 0.4, mat: 'darksteel', h: 5 },
  { k: 'cap', x0: 0, y0: 3.6, x1: 9, y1: 3.6, r: 0.4, mat: 'darksteel', h: 5 },
  { k: 'ell', x: -6, y: 0, rx: 1.4, ry: 3.2, mat: 'lightgrey', h: 6.5 },
  { k: 'ell', x: 1, y: 0, rx: 1, ry: 1, mat: 'team', h: 4.9 },
] };
const humvee: Model = { name: 'humvee', size: 22, parts: [
  ...[-4, 3.6].map(x => ({ k: 'ell', x, y: 3, rx: 1.3, ry: 0.8, mat: 'rubber', h: 1.4, mirror: true } as Part)),
  { k: 'rect', x: -6.5, y: -3.2, w: 13, hh: 6.4, mat: 'tan', h: 2.4, bevel: 1.1 },
  { k: 'rect', x: 1.5, y: -2.6, w: 1, hh: 5.2, mat: 'glass', h: 3.2, bevel: 0.2 },
  { k: 'rect', x: -4, y: -2.4, w: 5, hh: 4.8, mat: 'tan', h: 3.4, bevel: 0.8 },
  { k: 'ell', x: -1.5, y: 0, rx: 0.9, ry: 0.9, mat: 'team', h: 3.8 },
] };
const truck: Model = { name: 'truck', size: 26, parts: [
  ...[-6, -3, 4.6].map(x => ({ k: 'ell', x, y: 3.2, rx: 1.2, ry: 0.8, mat: 'rubber', h: 1.4, mirror: true } as Part)),
  { k: 'rect', x: -9, y: -3.4, w: 12, hh: 6.8, mat: 'olive2', h: 3.6, bevel: 0.6, dome: 0.1 },
  { k: 'rect', x: 3.5, y: -3, w: 5, hh: 6, mat: 'olive', h: 3.2, bevel: 1 },
  { k: 'rect', x: 7.3, y: -2.4, w: 0.9, hh: 4.8, mat: 'glass', h: 3.4, bevel: 0.2 },
  { k: 'rect', x: -7, y: -1, w: 3, hh: 2, mat: 'team', h: 3.9, bevel: 0.3 },
] };

export const AIR_MODELS = { f16, f35, su57, b2, b52, ac130, reaper, apache, blackhawk, chinook };
export const SEA_MODELS = { patrol, corvette, frigate, destroyer, cruiser, sub, transport, landing, amphib, carrier, supply };
export const LAND_MODELS = { mbt, ifv, apc, spg, mlrs, aa, humvee, truck };

/** Main rotor descriptions per helicopter (relative to the hull centre, facing east). */
export const ROTORS: Record<string, { x: number; y: number; r: number; blades: number }[]> = {
  apache: [{ x: 0, y: 0, r: 19, blades: 4 }],
  blackhawk: [{ x: 1.3, y: 0, r: 21, blades: 4 }],
  chinook: [{ x: 15.6, y: 0, r: 17, blades: 3 }, { x: -18, y: 0, r: 17, blades: 3 }],
};
