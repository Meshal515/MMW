// Air power (strikes, interception, rebasing to allies or carriers) and strategic missiles.
import { AIR, AirUnit, RADIATION_SECONDS, Weapon, WEAPONS } from './balance';
import type { Game } from './game';
import { AirCounts, AirGroup, AIR_UNITS, airTotal, CommandResult, emptyAir, Sortie, SEA_UNITS } from './state';
import { addOpinion, declareWar } from './diplomacy';

export function groupPos(g: Game, a: AirGroup) {
  if (a.carrier >= 0) { const f = g.fleets.get(a.carrier); if (f) return { x: f.x, y: f.y }; }
  return g.center(a.base);
}

export function minRange(p: AirCounts) {
  let r = Infinity;
  for (const k of AIR_UNITS) if (p[k] > 0) r = Math.min(r, AIR[k].range ?? 30);
  return r === Infinity ? 0 : r;
}
function speedOf(p: AirCounts) { let s = Infinity; for (const k of AIR_UNITS) if (p[k] > 0) s = Math.min(s, AIR[k].speed); return s === Infinity ? 8 : s; }

function findGroup(g: Game, n: number, base: number, carrier?: number) {
  for (const a of g.airGroups.values()) if (a.owner === n && (carrier !== undefined && carrier >= 0 ? a.carrier === carrier : a.base === base && a.carrier < 0)) return a;
  return null;
}

function take(a: AirGroup, want: Partial<AirCounts> | undefined, kinds: AirUnit[]): AirCounts {
  const out = emptyAir();
  for (const k of AIR_UNITS) {
    const w = want ? (want[k] ?? 0) : kinds.includes(k) ? a.planes[k] : 0;
    out[k] = Math.min(Math.floor(a.planes[k]), Math.max(0, Math.floor(w)));
    a.planes[k] -= out[k];
  }
  return out;
}

export function cmdAirStrike(g: Game, n: number, cmd: { base: number; carrier?: number; target: number; sea?: number; planes?: Partial<AirCounts> }): CommandResult {
  const grp = findGroup(g, n, cmd.base, cmd.carrier);
  if (!grp || airTotal(grp.planes) < 1) return { ok: false, error: 'لا توجد طائرات في هذه القاعدة' };
  const seaTarget = cmd.sea !== undefined && cmd.sea >= 0;
  const tgt = seaTarget ? { x: g.map.seas[cmd.sea!].cx, y: g.map.seas[cmd.sea!].cy } : g.center(cmd.target);
  if (!seaTarget) {
    const o = g.owner[cmd.target];
    if (o === n || (o >= 0 && !g.canAttack(n, cmd.target))) return { ok: false, error: 'لا يمكن قصف هذه المنطقة' };
  }
  const from = groupPos(g, grp);
  const dist = Math.hypot(tgt.x - from.x, tgt.y - from.y);
  const kinds: AirUnit[] = AIR_UNITS.filter(k => seaTarget || k !== 'drone' || grp.planes.drone > 0);
  // only send the types that can actually reach the target
  const inRange = kinds.filter(k => (AIR[k].range ?? 30) >= dist);
  if (!inRange.length) return { ok: false, error: `الهدف خارج المدى (${Math.round(dist)}) — قرّب قاعدة أو استخدم حاملة طائرات` };
  const planes = take(grp, cmd.planes, inRange);
  for (const k of AIR_UNITS) if (planes[k] > 0 && (AIR[k].range ?? 30) < dist) { grp.planes[k] += planes[k]; planes[k] = 0; }
  if (airTotal(planes) < 1) return { ok: false, error: 'لا توجد طائرات مناسبة' };
  if (!seaTarget) { const o = g.owner[cmd.target]; if (o >= 0 && !g.atWar(n, o)) declareWar(g, n, o); }
  const s: Sortie = {
    id: g.id(), owner: n, planes, mission: 'strike', fromX: from.x, fromY: from.y, x: from.x, y: from.y, tx: tgt.x, ty: tgt.y,
    targetRegion: seaTarget ? -1 : cmd.target, targetSea: seaTarget ? cmd.sea! : -1, toBase: -1, toCarrier: -1,
    homeBase: grp.base, homeCarrier: grp.carrier, phase: 'out',
  };
  g.sorties.set(s.id, s);
  return { ok: true, info: `انطلقت ${airTotal(planes)} طائرة` };
}

export function cmdRebase(g: Game, n: number, cmd: { base: number; carrier?: number; toBase?: number; toCarrier?: number; planes?: Partial<AirCounts> }): CommandResult {
  const grp = findGroup(g, n, cmd.base, cmd.carrier);
  if (!grp || airTotal(grp.planes) < 1) return { ok: false, error: 'لا توجد طائرات' };
  let dest: { x: number; y: number };
  let cap = 0, used = 0;
  if (cmd.toCarrier !== undefined && cmd.toCarrier >= 0) {
    const f = g.fleets.get(cmd.toCarrier);
    if (!f || !(f.owner === n || g.allied(n, f.owner))) return { ok: false, error: 'حاملة غير صالحة' };
    if (f.ships.carrier < 1) return { ok: false, error: 'الأسطول لا يضم حاملة طائرات' };
    cap = Math.floor(f.ships.carrier) * 8;
    for (const a of g.airGroups.values()) if (a.carrier === f.id) used += airTotal(a.planes);
    dest = { x: f.x, y: f.y };
  } else {
    const r = cmd.toBase ?? -1;
    const o = g.owner[r];
    if (r < 0 || o < 0 || !(o === n || g.allied(n, o))) return { ok: false, error: 'القاعدة يجب أن تكون لك أو لحليف' };
    const lvl = g.level(r, 'airbase');
    if (!lvl) return { ok: false, error: 'لا توجد قاعدة جوية هناك' };
    cap = lvl * 12;
    for (const a of g.airGroups.values()) if (a.base === r && a.carrier < 0) used += airTotal(a.planes);
    dest = g.center(r);
  }
  const from = groupPos(g, grp);
  const dist = Math.hypot(dest.x - from.x, dest.y - from.y);
  const planes = take(grp, cmd.planes, AIR_UNITS);
  let room = cap - used;
  for (const k of AIR_UNITS) {
    const fits = (AIR[k].range ?? 30) * 1.5 >= dist ? Math.min(planes[k], Math.max(0, room)) : 0;
    grp.planes[k] += planes[k] - fits; planes[k] = fits; room -= fits;
  }
  if (airTotal(planes) < 1) return { ok: false, error: room <= 0 ? 'لا توجد سعة في الوجهة' : `الوجهة خارج المدى (${Math.round(dist)}) — حمّلها على حاملة طائرات` };
  const id = g.id();
  g.sorties.set(id, {
    id, owner: n, planes, mission: 'rebase', fromX: from.x, fromY: from.y, x: from.x, y: from.y, tx: dest.x, ty: dest.y,
    targetRegion: -1, targetSea: -1, toBase: cmd.toCarrier !== undefined && cmd.toCarrier >= 0 ? -1 : cmd.toBase!, toCarrier: cmd.toCarrier ?? -1,
    homeBase: grp.base, homeCarrier: grp.carrier, phase: 'out',
  });
  return { ok: true, info: 'الطائرات في طريقها' };
}

function lose(p: AirCounts, frac: number) { let l = 0; for (const k of AIR_UNITS) { const d = p[k] * frac; p[k] -= d; l += d; } return l; }

const sum = (p: AirCounts, f: (k: AirUnit) => number) => AIR_UNITS.reduce((t, k) => t + p[k] * f(k), 0);

function resolveStrike(g: Game, s: Sortie) {
  const defender = s.targetRegion >= 0 ? g.owner[s.targetRegion] : -1;
  // interception: enemy air-superiority aircraft in range and air-defence sites near the target
  let defPow = 0;
  const interceptors: AirGroup[] = [];
  for (const a of g.airGroups.values()) {
    if (a.owner === s.owner || !g.atWar(s.owner, a.owner)) continue;
    const aa = sum(a.planes, k => AIR[k].aa ?? 0);
    if (aa < 1) continue;
    const p = groupPos(g, a);
    if (Math.hypot(p.x - s.tx, p.y - s.ty) <= 60) { defPow += aa; interceptors.push(a); }
  }
  for (let r = 0; r < g.owner.length; r++) {
    const o = g.owner[r];
    if (o < 0 || o === s.owner || !g.atWar(s.owner, o)) continue;
    const lvl = g.level(r, 'airdefense'); if (!lvl) continue;
    if (Math.hypot(g.map.regions[r].cx - s.tx, g.map.regions[r].cy - s.ty) <= 10) defPow += lvl * 14;
  }
  const escort = sum(s.planes, k => AIR[k].aa ?? 0);
  if (defPow > 0) {
    // stealth aircraft dodge part of the interception, escorts absorb part of it
    const hp = sum(s.planes, k => AIR[k].hp * (1 + (AIR[k].stealth ?? 0) * 2));
    const frac = Math.min(0.85, defPow * 0.35 / Math.max(1, hp + escort * 0.5));
    let lost = 0;
    for (const k of AIR_UNITS) { const d = s.planes[k] * frac * (1 - (AIR[k].stealth ?? 0)); s.planes[k] -= d; lost += d; }
    g.nations[s.owner].stats.deaths += lost;
    if (escort > 0) for (const a of interceptors) for (const k of AIR_UNITS) if ((AIR[k].aa ?? 0) > 0) { const l = a.planes[k] * Math.min(0.8, escort * 0.3 / Math.max(1, defPow)); a.planes[k] -= l; g.nations[s.owner].stats.kills += l; }
    g.fx.push({ k: 'intercept', x: s.tx, y: s.ty });
  }
  const power = sum(s.planes, k => AIR[k].atk);
  g.fx.push({ k: 'explosion', x: s.tx, y: s.ty, r: 1.2 + Math.min(2, power / 60), nuke: false });
  if (s.targetRegion >= 0) {
    const r = s.targetRegion;
    g.airSupport[r] = 15;
    if (defender < 0) { g.neutral[r] = Math.max(0, g.neutral[r] - power * 1.2); return; }
    const unitDmg = sum(s.planes, k => AIR[k].atk * 0.8 + (AIR[k].guns ?? 0) * 1.2);
    const hpG = g.inf[r] + g.tank[r] * 4 + g.art[r] * 2;
    if (hpG > 0) {
      const f = Math.min(0.7, unitDmg / hpG);
      const killed = (g.inf[r] + g.tank[r] + g.art[r]) * f;
      g.inf[r] *= 1 - f; g.tank[r] *= 1 - f; g.art[r] *= 1 - f;
      g.nations[s.owner].stats.kills += killed; g.nations[defender].stats.deaths += killed;
    }
    damageBuildings(g, r, sum(s.planes, k => AIR[k].atk * (AIR[k].bomb ?? 0.5)));
  } else if (s.targetSea >= 0) {
    const scouts = s.planes.drone > 0;
    for (const f of g.fleets.values()) {
      if (f.sea !== s.targetSea || !g.atWar(s.owner, f.owner)) continue;
      let shp = 0; for (const k of SEA_UNITS) if (k !== 'sub' || scouts) shp += f.ships[k] * 10;
      if (shp <= 0) continue;
      const frac = Math.min(0.6, power * 0.8 / shp);
      for (const k of SEA_UNITS) if (k !== 'sub' || scouts) f.ships[k] *= 1 - frac;
      f.combat = 0;
    }
  }
}

export function damageBuildings(g: Game, r: number, dmg: number) {
  const list = g.buildings[r];
  if (!list.length || dmg <= 0) return;
  const b = list[g.rng.int(list.length)];
  b.damage += dmg;
  while (b.damage >= 70 * Math.max(1, b.level) && b.level > 0) {
    b.damage -= 70 * Math.max(1, b.level);
    b.level--;
    g.markDirty(r);
  }
  if (b.level <= 0 && b.build <= 0) {
    if (b.type === 'capital') { b.level = 1; b.damage = 0; }
    else list.splice(list.indexOf(b), 1);
    g.markDirty(r);
  }
}

function landSortie(g: Game, s: Sortie) {
  // rebase destination, or home after a strike; fall back to the nearest own airbase
  const tryBase = (base: number, carrier: number) => {
    if (carrier >= 0) { const f = g.fleets.get(carrier); if (f && f.ships.carrier >= 0.5 && (f.owner === s.owner || g.allied(s.owner, f.owner))) { addPlanes(g.airGroupAt(s.owner, f.port >= 0 ? f.port : -1, carrier), s.planes); return true; } return false; }
    const o = base >= 0 ? g.owner[base] : -1;
    if (o >= 0 && (o === s.owner || g.allied(s.owner, o)) && g.level(base, 'airbase')) { addPlanes(g.airGroupAt(s.owner, base, -1), s.planes); return true; }
    return false;
  };
  if (s.mission === 'rebase' && tryBase(s.toBase, s.toCarrier)) return;
  if (tryBase(s.homeBase, s.homeCarrier)) return;
  const bases = g.nationBuildings(s.owner, 'airbase');
  bases.sort((a, b) => Math.hypot(g.map.regions[a].cx - s.x, g.map.regions[a].cy - s.y) - Math.hypot(g.map.regions[b].cx - s.x, g.map.regions[b].cy - s.y));
  if (bases.length) addPlanes(g.airGroupAt(s.owner, bases[0], -1), s.planes);
}
function addPlanes(a: AirGroup, p: AirCounts) { for (const k of AIR_UNITS) a.planes[k] += p[k]; }

// ---------- strategic weapons ----------
export function cmdLaunch(g: Game, n: number, weapon: Weapon, target: number): CommandResult {
  const me = g.nations[n], w = WEAPONS[weapon];
  if (!w) return { ok: false, error: 'سلاح غير معروف' };
  if (me.weapons[weapon] < 1) return { ok: false, error: `لا تملك ${w.name} — صنّعها في منصة الصواريخ` };
  const T = g.map.regions[target];
  if (!T) return { ok: false, error: 'هدف غير صالح' };
  const o = g.owner[target];
  if (o === n || (o >= 0 && g.allied(n, o))) return { ok: false, error: 'لا يمكن ضرب أرضك أو حلفائك' };
  if (o >= 0 && g.relOf(n, o) === 2) return { ok: false, error: 'بينكما اتفاق عدم اعتداء' };
  let silo = -1, best = Infinity;
  for (const r of g.nationBuildings(n, 'silo', w.siloLevel)) {
    const d = Math.hypot(g.map.regions[r].cx - T.cx, g.map.regions[r].cy - T.cy);
    if (d <= w.range && d < best) { best = d; silo = r; }
  }
  if (silo < 0) return { ok: false, error: `لا توجد منصة صواريخ ${w.siloLevel > 1 ? 'مستوى 2 ' : ''}ضمن المدى (${w.range})` };
  me.weapons[weapon]--;
  me.stats.nukes++;
  if (o >= 0 && !g.atWar(n, o)) declareWar(g, n, o);
  const targets = [target];
  if (w.warheads > 1) {
    const cands: number[] = [];
    for (let r = 0; r < g.owner.length; r++) if (r !== target && g.owner[r] === o && o >= 0 && Math.hypot(g.map.regions[r].cx - T.cx, g.map.regions[r].cy - T.cy) < 30) cands.push(r);
    cands.sort((a, b) => (g.cityLevel(b) * 50 + g.inf[b]) - (g.cityLevel(a) * 50 + g.inf[a]));
    for (let i = 0; targets.length < w.warheads; i++) targets.push(cands[i] ?? target);
  }
  const S = g.center(silo);
  for (const t of targets) {
    const c = g.center(t);
    const jx = t === target && targets.length > 1 ? g.rng.range(-1, 1) : 0;
    const dist = Math.hypot(c.x - S.x, c.y - S.y);
    const m = { id: g.id(), owner: n, weapon, x: S.x, y: S.y, sx: S.x, sy: S.y, tx: c.x + jx, ty: c.y + jx, t: 0, dur: Math.max(3, dist / w.speed), target: t };
    g.missiles.set(m.id, m);
    g.fx.push({ k: 'launch', id: m.id });
  }
  for (const other of g.nations) if (other.id !== n) addOpinion(g, other.id, n, other.id === o ? -100 : -20);
  g.log('nuke', `☢ ${me.name} أطلقت ${w.name} على ${o >= 0 ? g.nations[o].name : 'منطقة محايدة'}!`, n, o, target, true);
  return { ok: true };
}

function detonate(g: Game, x: number, y: number, weapon: Weapon, owner: number) {
  const w = WEAPONS[weapon];
  const rad = w.radius;
  g.fx.push({ k: 'explosion', x, y, r: rad, nuke: true });
  for (const R of g.map.regions) {
    const d = Math.hypot(R.cx - x, R.cy - y) - Math.sqrt(R.area) * 0.4;
    if (d > rad * 1.3) continue;
    const f = Math.max(0, Math.min(1, 1 - Math.max(0, d) / (rad * 1.3)));
    const r = R.id, o = g.owner[r];
    const killed = g.inf[r] * 0.9 * f + g.tank[r] * 0.7 * f + g.art[r] * 0.8 * f;
    g.inf[r] *= 1 - 0.9 * f; g.tank[r] *= 1 - 0.7 * f; g.art[r] *= 1 - 0.8 * f;
    g.neutral[r] *= 1 - 0.9 * f;
    g.nations[owner].stats.kills += killed;
    if (o >= 0) {
      const n = g.nations[o];
      n.stats.deaths += killed;
      n.pop -= n.pop * f * (g.cityLevel(r) ? 0.22 : 0.04);
    }
    for (let k = 0; k < (f > 0.6 ? 3 : 1); k++) damageBuildings(g, r, 220 * f);
    g.radiation[r] = Math.max(g.radiation[r], RADIATION_SECONDS * (0.4 + f));
    g.markDirty(r);
  }
  for (const a of g.armies.values()) {
    const f = Math.max(0, 1 - Math.hypot(a.x - x, a.y - y) / (rad * 1.3));
    if (f > 0) { a.inf *= 1 - 0.9 * f; a.tank *= 1 - 0.7 * f; a.art *= 1 - 0.8 * f; }
  }
  for (const fl of g.fleets.values()) {
    const f = Math.max(0, 1 - Math.hypot(fl.x - x, fl.y - y) / (rad * 1.3));
    if (f > 0) for (const k of SEA_UNITS) fl.ships[k] *= 1 - 0.8 * f;
  }
  for (const a of g.airGroups.values()) {
    const p = groupPos(g, a), f = Math.max(0, 1 - Math.hypot(p.x - x, p.y - y) / (rad * 1.3));
    if (f > 0) lose(a.planes, 0.9 * f);
  }
}

export function airTick(g: Game, dt: number) {
  for (let r = 0; r < g.airSupport.length; r++) if (g.airSupport[r] > 0) g.airSupport[r] = Math.max(0, g.airSupport[r] - dt);
  for (const s of [...g.sorties.values()]) {
    const sp = speedOf(s.planes);
    const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
    if (d <= sp * dt) {
      s.x = s.tx; s.y = s.ty;
      if (s.phase === 'out' && s.mission === 'strike') {
        resolveStrike(g, s);
        if (airTotal(s.planes) < 0.5) { g.sorties.delete(s.id); continue; }
        s.phase = 'back';
        const home = s.homeCarrier >= 0 ? g.fleets.get(s.homeCarrier) : null;
        const hp = home ? { x: home.x, y: home.y } : g.center(s.homeBase);
        s.tx = hp.x; s.ty = hp.y;
      } else { landSortie(g, s); g.sorties.delete(s.id); }
    } else { s.x += dx / d * sp * dt; s.y += dy / d * sp * dt; }
  }
  for (const m of [...g.missiles.values()]) {
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    m.x = m.sx + (m.tx - m.sx) * k; m.y = m.sy + (m.ty - m.sy) * k;
    if (k < 1) continue;
    g.missiles.delete(m.id);
    // interception by air defence of the target's owner and its allies
    const o = g.owner[m.target];
    let p = 0;
    if (o >= 0) for (let r = 0; r < g.owner.length; r++) {
      const ro = g.owner[r];
      if (ro < 0 || !(ro === o || g.allied(o, ro))) continue;
      const lvl = g.level(r, 'airdefense'); if (!lvl) continue;
      if (Math.hypot(g.map.regions[r].cx - m.tx, g.map.regions[r].cy - m.ty) <= 14) p += lvl * WEAPONS[m.weapon].intercept * 0.5;
    }
    if (g.rng.next() < Math.min(0.85, p)) {
      g.fx.push({ k: 'intercept', x: m.tx, y: m.ty });
      g.log('intercept', `اعترض الدفاع الجوي ${WEAPONS[m.weapon].name}`, o, m.owner, m.target, g.nations[m.owner].human || (o >= 0 && g.nations[o].human));
      continue;
    }
    detonate(g, m.tx, m.ty, m.weapon, m.owner);
  }
  // keep carrier-based groups pinned to their fleet and drop empty groups
  for (const a of [...g.airGroups.values()]) {
    if (a.carrier >= 0 && !g.fleets.has(a.carrier)) { g.airGroups.delete(a.id); continue; }
    if (airTotal(a.planes) < 0.05 && a.carrier < 0) g.airGroups.delete(a.id);
  }
}
