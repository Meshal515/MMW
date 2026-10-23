// Facility models (factories, ports, bases...) for the sprite forge, with cast shadows.
import type { Model, Part } from './forge';

const R = (x: number, y: number, w: number, hh: number, mat: Part['mat'], h: number, bevel = 0.8, dome = 0.2): Part => ({ k: 'rect', x, y, w, hh, mat, h, bevel, dome });
const E = (x: number, y: number, rx: number, ry: number, mat: Part['mat'], h: number, dome = 1): Part => ({ k: 'ell', x, y, rx, ry, mat, h, dome });

/** Sawtooth factory roof: alternating light/dark strips. */
const sawtooth = (x: number, y: number, w: number, hh: number, h: number): Part[] =>
  Array.from({ length: Math.floor(w / 3) }, (_, i) => R(x + i * 3, y, 3, hh, i % 2 ? 'lightgrey' : 'navygrey', h + (i % 2) * 0.6, 0.4, 0.6));

export const FACILITIES: Record<string, Model> = {
  factory: { name: 'fac_factory', size: 0, w: 52, h: 40, castShadow: true, parts: [
    ...sawtooth(-21, -12, 27, 16, 5),
    R(8, -12, 13, 11, 'darksteel', 7, 1),
    E(12, -6, 2.2, 2.2, 'rust', 13), E(17, -6, 2.2, 2.2, 'rust', 13),
    E(12, -6, 1, 1, 'black', 14, 0), E(17, -6, 1, 1, 'black', 14, 0),
    ...[0, 1, 2, 3].map(i => R(-20 + i * 7, 7, 5, 3, (['container1', 'container2', 'container3', 'container4'] as const)[i], 2.2, 0.4)),
    R(8, 3, 13, 10, 'deckdark', 0.5, 0.3, 0),
    R(10, 5, 4, 2, 'red', 1.6, 0.3), R(15, 8, 4, 2, 'blue', 1.6, 0.3),
    R(-23, -15, 3, 2, 'team', 5.5, 0.3),
  ] },
  port: { name: 'fac_port', size: 0, w: 56, h: 40, castShadow: true, parts: [
    R(-1, -10, 28, 4, 'tan', 1.2, 0.4), R(-1, 6, 28, 4, 'tan', 1.2, 0.4),
    R(-25, -15, 12, 9, 'navygrey', 4.5, 1),
    ...[0, 1, 2].flatMap(i => [0, 1].map(j => R(-23 + i * 4, 1 + j * 4, 3.5, 3, (['container1', 'container2', 'container3', 'container4'] as const)[(i + j * 2) % 4], 2.4 + j, 0.3))),
    R(-8, -16, 2, 34, 'yellow', 9, 0.4), R(-3, -16, 2, 34, 'yellow', 9, 0.4),
    R(-8, -14, 7, 3, 'yellow', 10, 0.4), R(-8, 11, 7, 3, 'yellow', 10, 0.4),
    R(-24, -2, 3, 2, 'team', 5, 0.3),
  ] },
  airbase: { name: 'fac_airbase', size: 0, w: 88, h: 40, castShadow: true, parts: [
    R(-42, -4, 84, 11, 'deckdark', 0.4, 0.4, 0),
    ...Array.from({ length: 10 }, (_, i) => R(-36 + i * 8, 1, 4, 0.8, 'white', 0.5, 0.1, 0)),
    R(-41, -3, 3, 9, 'white', 0.5, 0.1, 0), R(38, -3, 3, 9, 'white', 0.5, 0.1, 0),
    R(-30, -16, 50, 6, 'deck', 0.35, 0.3, 0),
    ...[0, 1, 2].map(i => ({ k: 'ell', x: -22 + i * 14, y: -15, rx: 5.5, ry: 4, mat: 'olive2', h: 5, dome: 1 } as Part)),
    R(24, -17, 5, 5, 'concrete', 9, 1), R(24.5, -16.5, 4, 1.4, 'glass', 9.5, 0.3),
    R(23, -16, 2, 2, 'team', 10, 0.3),
  ] },
  silo: { name: 'fac_silo', size: 0, w: 36, h: 36, castShadow: true, parts: [
    ...[[-8, -8], [8, -8], [-8, 8], [8, 8]].flatMap(([x, y]) => [E(x, y, 5, 5, 'lightgrey', 1.6, 0.4), E(x, y, 3.4, 3.4, 'darksteel', 2, 0), E(x - 1, y - 1, 1.5, 1.5, 'yellow', 2.2, 0)]),
    R(-2, -2, 4, 4, 'team', 1.2, 0.3),
  ] },
  nuclear: { name: 'fac_nuclear', size: 0, w: 52, h: 44, castShadow: true, parts: [
    E(-12, -6, 10, 10, 'lightgrey', 10, 0.6), E(-12, -6, 6.5, 6.5, 'darksteel', 11, 0),
    E(11, 6, 8, 8, 'white', 8, 1),
    R(4, -16, 16, 8, 'navygrey', 5, 1),
    R(-22, 10, 14, 7, 'navygrey', 3.5, 0.8),
    R(14, -14, 3, 3, 'team', 5.5, 0.3),
  ] },
  airdefense: { name: 'fac_airdefense', size: 0, w: 36, h: 32, castShadow: true, parts: [
    E(-6, -4, 6, 6, 'white', 7, 1),
    ...[0, 1].map(i => R(4, -9 + i * 9, 10, 5, 'camo', 3, 0.8)),
    ...[0, 1].flatMap(i => [0, 1, 2].map(j => E(13, -8 + i * 9 + j * 1.5, 0.6, 0.6, 'red', 3.6, 0))),
    R(-14, 8, 3, 3, 'team', 1.6, 0.3),
  ] },
  hospital: { name: 'fac_hospital', size: 0, w: 40, h: 36, castShadow: true, parts: [
    R(-15, -12, 9, 22, 'white', 6, 1), R(6, -12, 9, 22, 'white', 6, 1), R(-6, -4, 12, 7, 'white', 5, 1),
    R(-2, -3, 4, 5, 'red', 5.6, 0.2, 0), R(-4, -1.5, 8, 2, 'red', 5.6, 0.2, 0),
    E(0, 11, 4, 4, 'deckdark', 0.5, 0), R(-1.5, 9.5, 3, 3, 'white', 0.6, 0.2, 0),
    R(-14, -11, 3, 2, 'team', 6.4, 0.3),
  ] },
  barracks: { name: 'fac_barracks', size: 0, w: 44, h: 36, castShadow: true, parts: [
    ...[0, 1, 2].map(i => R(-18, -14 + i * 8, 20, 5, 'olive', 3.5, 0.8)),
    R(6, -12, 12, 22, 'tan', 0.4, 0.3, 0),
    R(9, -10, 1, 1, 'black', 0.6), R(12, -6, 1, 1, 'black', 0.6), R(15, -2, 1, 1, 'black', 0.6),
    E(16, 13, 0.8, 0.8, 'darksteel', 8),
    R(16, 11, 4, 2.5, 'team', 8.2, 0.2),
  ] },
  farm: { name: 'fac_farm', size: 0, w: 48, h: 40, castShadow: true, parts: [
    ...[0, 1, 2, 3].flatMap(i => [R(-22 + (i % 2) * 22, -18 + Math.floor(i / 2) * 19, 21, 17, (['olive2', 'yellow', 'camo', 'tan'] as const)[i], 0.2, 0.2, 0),
      ...Array.from({ length: 5 }, (_, j) => R(-21 + (i % 2) * 22, -16 + Math.floor(i / 2) * 19 + j * 3.3, 19, 0.8, i === 1 ? 'tan' : 'olive', 0.25, 0.1, 0))]),
    R(10, 4, 9, 7, 'red', 4, 0.8), E(4, 8, 2.5, 2.5, 'lightgrey', 7, 1),
    R(11, 5, 3, 2, 'team', 4.5, 0.3),
  ] },
  lumber: { name: 'fac_lumber', size: 0, w: 44, h: 36, castShadow: true, parts: [
    R(-17, -13, 16, 11, 'rust', 4.5, 1),
    ...[0, 1, 2, 3].flatMap(i => [0, 1, 2].map(j => ({ k: 'cap', x0: 2 + j * 0, y0: -12 + i * 3, x1: 16, y1: -12 + i * 3, r: 1.2, mat: 'copper', h: 1.5 + (i % 2), dome: 1 } as Part))).slice(0, 4),
    ...[0, 1, 2].map(i => ({ k: 'cap', x0: -16, y0: 4 + i * 3, x1: -3, y1: 4 + i * 3, r: 1.2, mat: 'copper', h: 1.6, dome: 1 } as Part)),
    R(4, 4, 10, 6, 'olive', 2.8, 0.8), R(13, 5, 3, 4, 'glass', 3, 0.3),
    R(-16, -12, 3, 2, 'team', 5, 0.3),
  ] },
  mine: { name: 'fac_mine', size: 0, w: 48, h: 40, castShadow: true, parts: [
    E(-4, 0, 20, 17, 'sand', 0.2, 0), E(-4, 0, 16, 13, 'tan', 0.15, 0), E(-4, 0, 12, 9.5, 'rust', 0.1, 0), E(-4, 0, 7, 5, 'rubber', 0.05, 0),
    { k: 'cap', x0: 2, y0: 2, x1: 21, y1: -12, r: 1, mat: 'darksteel', h: 4, dome: 0.3 },
    R(16, -18, 7, 8, 'navygrey', 6, 1),
    R(-14, 8, 6, 4, 'yellow', 2.4, 0.6), R(-3, -10, 6, 4, 'yellow', 2.4, 0.6),
    R(17, -17, 3, 2, 'team', 6.4, 0.3),
  ] },
};
