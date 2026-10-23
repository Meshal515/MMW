// Land armies, operations (gather → stage → strike), battles, conquest, fleets and naval landings.
import { CITY, COMBAT, ECON, FORT, LAND, SEA, SeaUnit } from './balance';
import type { Game } from './game';
import { Army, ArmyKind, CommandResult, Fleet, LandCounts, Operation, emptyAir, SEA_UNITS, shipTotal, REL } from './state';
import { declareWar } from './diplomacy';

const CARGO = { inf: 1, tank: 5, art: 4 };
export const cargoOf = (c: LandCounts) => c.inf * CARGO.inf + c.tank * CARGO.tank + c.art * CARGO.art;
const hpOf = (c: LandCounts) => c.inf * LAND.inf.hp + c.tank * LAND.tank.hp + c.art * LAND.art.hp;
export const atkOf = (c: LandCounts) => {
  const base = c.inf * LAND.inf.atk + c.tank * LAND.tank.atk + c.art * LAND.art.atk;
  const artShare = Math.min(0.3, (c.art * 2) / Math.max(1, c.inf + c.tank * 4 + c.art * 2));
  return base * (1 + artShare * COMBAT.artilleryBoost * 3);
};
export const defOf = (c: LandCounts) => c.inf * LAND.inf.def + c.tank * LAND.tank.def + c.art * LAND.art.def;
export const unitSpeed = (c: LandCounts) => {
  let s = Infinity;
  if (c.inf > 0.5) s = Math.min(s, LAND.inf.speed);
  if (c.tank > 0.5) s = Math.min(s, LAND.tank.speed);
  if (c.art > 0.5) s = Math.min(s, LAND.art.speed);
  return s === Infinity ? LAND.inf.speed : s;
};

function applyLosses(c: LandCounts, dmg: number): LandCounts {
  const hp = hpOf(c);
  if (hp <= 0) return { inf: 0, tank: 0, art: 0 };
  const f = Math.min(1, dmg / hp);
  const lost = { inf: c.inf * f, tank: c.tank * f, art: c.art * f };
  c.inf -= lost.inf; c.tank -= lost.tank; c.art -= lost.art;
  return lost;
}

export function defenseMultiplier(g: Game, r: number) {
  const R = g.map.regions[r];
  const cl = g.level(r, 'city'), kl = g.level(r, 'capital');
  const city = (cl ? CITY.defense(cl, false) : 0) + (kl ? CITY.defense(kl, true) : 0);
  return R.defense * (1 + city) * (g.radiation[r] > 0 ? 0.7 : 1);
}

/** Estimated force needed to take a region (used by the UI and bots). */
export function estimateDefense(g: Game, r: number) {
  const o = g.owner[r];
  if (o < 0) return g.neutral[r] * g.map.regions[r].defense;
  return g.garrisonStrength(r) * defenseMultiplier(g, r);
}

function garrison(g: Game, r: number): LandCounts { return { inf: g.inf[r], tank: g.tank[r], art: g.art[r] }; }

function newArmy(g: Game, owner: number, c: LandCounts, path: number[], kind: ArmyKind, target: number, op = -1): Army {
  const s = g.center(path[0]);
  const a: Army = {
    id: g.id(), owner, inf: c.inf, tank: c.tank, art: c.art, kind, state: 'march', path, idx: 0, prog: 0,
    target, giftTo: -1, expand: 0, dirX: 0, dirY: 0, op, waitT: 0, fleet: -1, amphibious: false, x: s.x, y: s.y,
  };
  g.armies.set(a.id, a);
  return a;
}

interface Pull { src: number; path: number[]; take: LandCounts }

/**
 * Multi-source Dijkstra from the staging regions over passable territory, pulling troops from the
 * nearest own garrisons first until `want` is met.
 */
function gather(g: Game, n: number, stagings: number[], want: LandCounts, maxCost = 70, keep = 0, maxSources = 10): Pull[] {
  const dist = new Map<number, number>(), next = new Map<number, number>();
  const open: [number, number][] = [];
  for (const s of stagings) { dist.set(s, 0); next.set(s, -1); open.push([0, s]); }
  const need = { ...want };
  const pulls: Pull[] = [];
  while (open.length && pulls.length < maxSources && (need.inf > 0.5 || need.tank > 0.5 || need.art > 0.5)) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [d, r] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (d > (dist.get(r) ?? Infinity)) continue;
    if (g.owner[r] === n && !g.battles.has(r)) {
      const keepHere = keep * Math.max(1, g.map.regions[r].area * 0.3);
      const take = {
        inf: Math.min(need.inf, Math.max(0, g.inf[r] - keepHere)),
        tank: Math.min(need.tank, g.tank[r]),
        art: Math.min(need.art, g.art[r]),
      };
      if (take.inf + take.tank * 4 + take.art * 3 >= Math.min(4, need.inf + need.tank + need.art)) {
        need.inf -= take.inf; need.tank -= take.tank; need.art -= take.art;
        const path = [r]; let c = r;
        while (next.get(c)! !== -1) { c = next.get(c)!; path.push(c); }
        pulls.push({ src: r, path, take });
      }
    }
    for (const m of g.map.regions[r].neighbors) {
      if (!g.canPass(n, m)) continue;
      const nd = d + g.edgeLen(m, r);
      if (nd > maxCost || nd >= (dist.get(m) ?? Infinity)) continue;
      dist.set(m, nd); next.set(m, r); open.push([nd, m]);
    }
  }
  return pulls;
}

/** Forces that an attack order on `target` could actually gather right now (for the UI slider). */
export function availableFor(g: Game, n: number, target: number): LandCounts & { naval: boolean; capacity: number } {
  const big = { inf: 1e9, tank: 1e9, art: 1e9 };
  const stagings = g.owner[target] === n ? [target] : g.map.regions[target].neighbors.filter(r => g.canPass(n, r));
  if (stagings.length) {
    const pulls = gather(g, n, stagings, big, g.owner[target] >= 0 && g.owner[target] !== n ? 110 : 70, 0, 10);
    const s = pulls.reduce((a, p) => ({ inf: a.inf + p.take.inf, tank: a.tank + p.take.tank, art: a.art + p.take.art }), { inf: 0, tank: 0, art: 0 });
    if (s.inf + s.tank + s.art >= 1) return { ...s, naval: false, capacity: Infinity };
  }
  if (!g.map.regions[target].coastal) return { inf: 0, tank: 0, art: 0, naval: false, capacity: 0 };
  let best: { port: number; cap: number } | null = null;
  for (const f of g.fleets.values()) if (f.owner === n && f.order === 'idle' && f.port >= 0 && f.ships.transport >= 1) {
    const cap = Math.floor(f.ships.transport) * (SEA.transport.capacity ?? 250);
    if (!best || cap > best.cap) best = { port: f.port, cap };
  }
  if (!best) return { inf: 0, tank: 0, art: 0, naval: true, capacity: 0 };
  const pulls = gather(g, n, [best.port], big, 80);
  const s = pulls.reduce((a, p) => ({ inf: a.inf + p.take.inf, tank: a.tank + p.take.tank, art: a.art + p.take.art }), { inf: 0, tank: 0, art: 0 });
  return { ...s, naval: true, capacity: best.cap };
}

function dispatch(g: Game, n: number, pulls: Pull[], final: number | null, kind: ArmyKind, target: number, op: Operation | null): Army[] {
  const out: Army[] = [];
  for (const p of pulls) {
    g.inf[p.src] -= p.take.inf; g.tank[p.src] -= p.take.tank; g.art[p.src] -= p.take.art;
    const path = final === null ? p.path : [...p.path, final];
    const a = newArmy(g, n, p.take, path, kind, target, op ? op.id : -1);
    if (path.length === 1) arrive(g, a); else if (op && a.idx >= path.length - 2 && !op.naval) a.state = 'wait';
    out.push(a);
    op?.armies.push(a.id);
  }
  return out;
}

function sumPulls(p: Pull[]) { return p.reduce((s, x) => s + x.take.inf + x.take.tank + x.take.art, 0); }

function attackError(g: Game, n: number, target: number): string | null {
  const R = g.map.regions[target];
  if (!R) return 'منطقة غير صالحة';
  const o = g.owner[target];
  if (o === n) return 'هذه منطقتك';
  if (o >= 0) {
    if (g.teammates(n, o)) return 'هذا زميلك في الفريق';
    const rel = g.relOf(n, o);
    if (rel === REL.ally) return 'هذه دولة حليفة — ألغِ التحالف أولًا';
    if (rel === REL.nap) return 'بينكما اتفاق عدم اعتداء — ألغه أولًا';
  }
  return null;
}

export function cmdAttack(g: Game, n: number, cmd: { target: number; amount: number; tanks?: number; arts?: number; expand?: boolean; from?: number }): CommandResult {
  const err = attackError(g, n, cmd.target); if (err) return { ok: false, error: err };
  const want: LandCounts = { inf: Math.max(0, cmd.amount), tank: Math.max(0, cmd.tanks ?? 0), art: Math.max(0, cmd.arts ?? 0) };
  if (want.inf + want.tank + want.art < 1) return { ok: false, error: 'حدد عدد الجنود' };
  const target = cmd.target;
  let pulls: Pull[] = [];
  let stagings: number[] = [];
  if (cmd.from !== undefined && cmd.from >= 0) {
    if (g.owner[cmd.from] !== n) return { ok: false, error: 'المصدر ليس منطقتك' };
    const path = g.landPath(cmd.from, target, r => g.canPass(n, r));
    if (!path) return navalOp(g, n, target, want, 'attack', !!cmd.expand);
    const take = { inf: Math.min(want.inf, g.inf[cmd.from]), tank: Math.min(want.tank, g.tank[cmd.from]), art: Math.min(want.art, g.art[cmd.from]) };
    pulls = [{ src: cmd.from, path: path.slice(0, -1), take }];
    stagings = [path[path.length - 2]];
  } else {
    stagings = g.map.regions[target].neighbors.filter(r => g.canPass(n, r));
    if (!stagings.length) return navalOp(g, n, target, want, 'attack', !!cmd.expand);
    pulls = gather(g, n, stagings, want, g.owner[target] >= 0 ? 110 : 70);
  }
  if (sumPulls(pulls) < 1) {
    if (!stagings.length || g.map.regions[target].coastal) { const nv = navalOp(g, n, target, want, 'attack', !!cmd.expand); if (nv.ok) return nv; }
    return { ok: false, error: 'لا توجد قوات قريبة كافية' };
  }
  const o = g.owner[target];
  if (o >= 0) g.counters.attacks++;
  if (o >= 0 && !g.atWar(n, o)) declareWar(g, n, o);
  const op: Operation = { id: g.id(), owner: n, target, staging: stagings[0], armies: [], t: 0, expand: cmd.expand ? 40 : 0, naval: false, fleet: -1, port: -1 };
  g.ops.set(op.id, op);
  const armies = dispatch(g, n, pulls, target, 'attack', target, op);
  const T = g.center(target), S = g.center(op.staging);
  const len = Math.hypot(T.x - S.x, T.y - S.y) || 1;
  for (const a of armies) { a.expand = op.expand; a.dirX = (T.x - S.x) / len; a.dirY = (T.y - S.y) / len; }
  return { ok: true, info: `أُرسل ${Math.round(sumPulls(pulls))} وحدة` };
}

export function cmdMove(g: Game, n: number, cmd: { from: number; to: number; amount: number; tanks?: number; arts?: number }): CommandResult {
  if (g.owner[cmd.from] !== n) return { ok: false, error: 'المصدر ليس منطقتك' };
  if (g.owner[cmd.to] !== n) return { ok: false, error: 'الوجهة ليست منطقتك' };
  const path = g.landPath(cmd.from, cmd.to, r => g.canPass(n, r));
  if (!path) return { ok: false, error: 'لا يوجد طريق بري — استخدم الأسطول' };
  const take = { inf: Math.min(cmd.amount, g.inf[cmd.from]), tank: Math.min(cmd.tanks ?? 0, g.tank[cmd.from]), art: Math.min(cmd.arts ?? 0, g.art[cmd.from]) };
  if (take.inf + take.tank + take.art < 1) return { ok: false, error: 'لا توجد قوات' };
  dispatch(g, n, [{ src: cmd.from, path, take }], null, 'move', cmd.to, null);
  return { ok: true };
}

/** Enemy strength next to one of our regions. */
export function threatAt(g: Game, n: number, r: number) {
  let t = 0;
  for (const m of g.map.regions[r].neighbors) {
    const o = g.owner[m];
    if (o >= 0 && o !== n && g.atWar(n, o)) t += g.garrisonStrength(m);
  }
  const inc = g.incoming.get(r);
  if (inc) for (const a of inc) if (a.owner !== n && g.atWar(n, a.owner)) t += atkOf(a);
  return t;
}

export function isBorder(g: Game, n: number, r: number) {
  return g.map.regions[r].neighbors.some(m => g.owner[m] !== n && !(g.owner[m] >= 0 && g.allied(n, g.owner[m])));
}

export function cmdReinforce(g: Game, n: number, amount: number): CommandResult {
  let best = -1, bestScore = 0;
  for (let r = 0; r < g.owner.length; r++) {
    if (g.owner[r] !== n) continue;
    const t = threatAt(g, n, r); if (t <= 0) continue;
    const s = t / (g.garrisonStrength(r) * defenseMultiplier(g, r) + 5);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  if (best < 0) return { ok: false, error: 'لا توجد جبهة مهددة حاليًا' };
  const pulls = gather(g, n, [best], { inf: amount, tank: amount / 20, art: amount / 25 }, 90).filter(p => p.src !== best && !isBorder(g, n, p.src));
  if (sumPulls(pulls) < 1) return { ok: false, error: 'لا توجد قوات احتياط في الداخل' };
  dispatch(g, n, pulls.map(p => ({ ...p, path: p.path })), null, 'move', best, null);
  return { ok: true, info: 'التعزيزات في الطريق إلى أضعف جبهة', };
}

export function cmdWithdraw(g: Game, n: number, region: number): CommandResult {
  if (g.owner[region] !== n) return { ok: false, error: 'المنطقة ليست لك' };
  let dest = -1, best = Infinity;
  for (let r = 0; r < g.owner.length; r++) {
    if (g.owner[r] !== n || r === region || isBorder(g, n, r)) continue;
    const d = Math.hypot(g.map.regions[r].cx - g.map.regions[region].cx, g.map.regions[r].cy - g.map.regions[region].cy);
    if (d < best) { best = d; dest = r; }
  }
  if (dest < 0) dest = g.nations[n].capital;
  if (dest < 0 || dest === region) return { ok: false, error: 'لا يوجد مكان آمن' };
  return cmdMove(g, n, { from: region, to: dest, amount: g.inf[region], tanks: g.tank[region], arts: g.art[region] });
}

export function cmdSupport(g: Game, n: number, to: number, amount: number, region: number, kind: 'support' | 'gift'): CommandResult {
  const ally = g.nations[to];
  if (!ally?.alive || to === n) return { ok: false, error: 'دولة غير صالحة' };
  if (!g.allied(n, to)) return { ok: false, error: 'المساعدة العسكرية للحلفاء فقط' };
  let dest = region;
  if (dest < 0 || g.owner[dest] !== to) {
    // the ally's most threatened region that we can actually reach, falling back to its capital
    let best = -1, bestT = -1;
    for (let r = 0; r < g.owner.length; r++) {
      if (g.owner[r] !== to) continue;
      const t = threatAt(g, to, r) + (r === ally.capital ? 1 : 0);
      if (t > bestT) { bestT = t; best = r; }
    }
    dest = best >= 0 ? best : ally.capital;
  }
  if (dest < 0) return { ok: false, error: 'لا توجد أرض للحليف' };
  const want = { inf: amount, tank: kind === 'support' ? amount / 25 : 0, art: 0 };
  const pulls = gather(g, n, [dest], want, 140, 0.5);
  if (sumPulls(pulls) < 1) return navalOp(g, n, dest, want, kind, false);
  const armies = dispatch(g, n, pulls, null, kind, dest, null);
  for (const a of armies) a.giftTo = to;
  g.log('aid', `${g.nations[n].name} ترسل ${Math.round(sumPulls(pulls))} جنديًا ${kind === 'gift' ? 'هدية' : 'لمساندة'} ${ally.name}`, n, to, dest);
  return { ok: true, info: 'القوات في الطريق إلى الحليف' };
}

// ---------- naval operations ----------
function navalOp(g: Game, n: number, target: number, want: LandCounts, kind: ArmyKind, expand: boolean): CommandResult {
  const T = g.map.regions[target];
  if (!T.coastal) return { ok: false, error: 'لا يوجد طريق بري والهدف ليس ساحليًا' };
  let best: { f: Fleet; cost: number; sea: number } | null = null;
  for (const f of g.fleets.values()) {
    if (f.owner !== n || f.order !== 'idle' || f.port < 0 || f.ships.transport < 1) continue;
    for (const s of T.seas) {
      const p = g.seaPath(f.sea, s); if (!p) continue;
      const cost = p.length;
      if (!best || cost < best.cost) best = { f, cost, sea: s };
    }
  }
  if (!best) {
    const hasPort = g.nationBuildings(n, 'port').length > 0;
    return { ok: false, error: hasPort ? 'لا يوجد طريق بري — ابنِ سفن نقل في الميناء للإنزال البحري' : 'لا يوجد طريق بري — تحتاج ميناء وسفن نقل' };
  }
  const cap = Math.floor(best.f.ships.transport) * (SEA.transport.capacity ?? 250);
  const scale = Math.min(1, cap / Math.max(1, cargoOf(want)));
  const limited = { inf: want.inf * scale, tank: want.tank * scale, art: want.art * scale };
  const pulls = gather(g, n, [best.f.port], limited, 80);
  if (sumPulls(pulls) < 1) return { ok: false, error: 'لا توجد قوات قرب الميناء' };
  const o = g.owner[target];
  if (kind === 'attack' && o >= 0 && !g.atWar(n, o)) declareWar(g, n, o);
  const op: Operation = { id: g.id(), owner: n, target, staging: best.f.port, armies: [], t: 0, expand: expand ? 40 : 0, naval: true, fleet: best.f.id, port: best.f.port };
  g.ops.set(op.id, op);
  best.f.op = op.id; best.f.invadeTarget = target; best.f.order = 'invade'; best.f.path = [];
  const armies = dispatch(g, n, pulls, null, kind, target, op);
  for (const a of armies) {
    a.expand = op.expand;
    const S = g.center(best.f.port), Tc = g.center(target), len = Math.hypot(Tc.x - S.x, Tc.y - S.y) || 1;
    a.dirX = (Tc.x - S.x) / len; a.dirY = (Tc.y - S.y) / len;
    if (a.path.length === 1 && a.state !== 'fight') a.state = 'wait';
  }
  return { ok: true, info: `إنزال بحري: ${Math.round(sumPulls(pulls))} جندي يتجهون للميناء` };
}

function embark(g: Game, op: Operation) {
  const f = g.fleets.get(op.fleet);
  if (!f || f.owner !== op.owner) {
    for (const id of op.armies) { const a = g.armies.get(id); if (a && a.state === 'wait') mergeArmy(g, a, a.path[a.idx]); }
    return;
  }
  const targetSea = g.map.regions[op.target].seas.slice().sort((a, b) => (g.seaPath(f.sea, a)?.length ?? 999) - (g.seaPath(f.sea, b)?.length ?? 999))[0];
  for (const id of op.armies) {
    const a = g.armies.get(id);
    if (!a) continue;
    if (a.state === 'wait') { a.state = 'embarked'; a.fleet = f.id; f.cargo.push(a.id); }
  }
  if (!f.cargo.length) { f.order = 'idle'; return; }
  f.path = g.seaPath(f.sea, targetSea) ?? [f.sea];
  f.prog = 0; f.port = -1; f.order = 'invade';
}

// ---------- arrival & conquest ----------
function mergeArmy(g: Game, a: Army, r: number) {
  if (g.owner[r] === a.owner) { g.inf[r] += a.inf; g.tank[r] += a.tank; g.art[r] += a.art; }
  g.armies.delete(a.id);
}

function returnHome(g: Game, a: Army) {
  const here = a.path[a.idx];
  let dest = -1, best = Infinity;
  for (let r = 0; r < g.owner.length; r++) if (g.owner[r] === a.owner) {
    const d = Math.hypot(g.map.regions[r].cx - g.map.regions[here].cx, g.map.regions[r].cy - g.map.regions[here].cy);
    if (d < best) { best = d; dest = r; }
  }
  const path = dest >= 0 ? g.landPath(here, dest, r => g.canPass(a.owner, r)) : null;
  if (!path) { g.armies.delete(a.id); return; }
  a.kind = 'move'; a.target = dest; a.path = path; a.idx = 0; a.prog = 0; a.state = 'march'; a.op = -1; a.expand = 0;
  if (path.length === 1) mergeArmy(g, a, dest);
}

function joinBattle(g: Game, a: Army, r: number) {
  let b = g.battles.get(r);
  if (!b) { b = { region: r, attackers: [], t: 0 }; g.battles.set(r, b); }
  if (!b.attackers.includes(a.id)) b.attackers.push(a.id);
  a.state = 'fight';
}

function arrive(g: Game, a: Army) {
  const r = a.path[a.idx];
  const final = a.idx === a.path.length - 1;
  if (!final) {
    const nxt = a.path[a.idx + 1];
    const op = a.op >= 0 ? g.ops.get(a.op) : undefined;
    if (op && !op.naval && a.idx === a.path.length - 2) { a.state = 'wait'; return; }
    if (nxt !== a.target && !g.canPass(a.owner, nxt)) {
      const p = g.landPath(r, a.target, x => g.canPass(a.owner, x));
      if (p) { a.path = p; a.idx = 0; a.prog = 0; } else returnHome(g, a);
    }
    return;
  }
  const o = g.owner[r];
  switch (a.kind) {
    case 'attack':
      if (o === a.owner) { if (a.op >= 0 && g.ops.get(a.op)?.naval) { a.state = 'wait'; return; } return mergeArmy(g, a, r); }
      if (g.canAttack(a.owner, r)) {
        if (o >= 0 && !g.atWar(a.owner, o)) declareWar(g, a.owner, o);
        return joinBattle(g, a, r);
      }
      return returnHome(g, a);
    case 'move':
      if (o === a.owner) { if (a.op >= 0 && g.ops.get(a.op)?.naval) { a.state = 'wait'; return; } return mergeArmy(g, a, r); }
      return returnHome(g, a);
    case 'support':
      if (o === a.owner && a.op >= 0) { a.state = 'wait'; return; }
      if (o >= 0 && o !== a.owner && g.allied(a.owner, o)) { a.state = 'stationed'; a.waitT = 0; return; }
      return returnHome(g, a);
    case 'gift':
      if (o === a.owner && a.op >= 0) { a.state = 'wait'; return; }
      if (o >= 0 && o !== a.owner && g.allied(a.owner, o)) {
        g.inf[r] += a.inf; g.tank[r] += a.tank; g.art[r] += a.art;
        g.log('gift', `${g.nations[a.owner].name} أهدت ${Math.round(a.inf)} جنديًا إلى ${g.nations[o].name}`, a.owner, o, r);
        g.armies.delete(a.id); return;
      }
      return returnHome(g, a);
  }
}

export function transferRegion(g: Game, r: number, to: number) {
  const from = g.owner[r];
  if (from >= 0) g.counters.conquests++; else g.counters.neutralCaptures++;
  g.owner[r] = to;
  g.markDirty(r);
  g.fx.push({ k: 'capture', region: r, owner: to });
  const R = g.map.regions[r];
  if (to >= 0) g.nations[to].stats.captured++;
  for (const b of g.buildings[r]) { b.queue = []; if (b.type === 'capital') b.type = 'city'; b.build = 0; }
  if (from >= 0) {
    const old = g.nations[from];
    old.stats.lost++;
    old.area -= R.area; old.regionCount--;
    if (to >= 0) { g.nations[to].area += R.area; g.nations[to].regionCount++; }
    if (old.capital === r) {
      const loot = Math.max(0, old.gold) * ECON.lootShare;
      old.gold -= loot; if (to >= 0) g.nations[to].gold += loot;
      old.pop *= 0.85;
      let best = -1, bs = -1;
      for (let x = 0; x < g.owner.length; x++) if (g.owner[x] === from) {
        const s = g.cityLevel(x) * 100 + g.map.regions[x].area + g.inf[x] * 0.01;
        if (s > bs) { bs = s; best = x; }
      }
      old.capital = best;
      if (best >= 0) {
        const c = g.building(best, 'city');
        if (c) c.type = 'capital';
        else { if (g.buildings[best].length >= g.map.regions[best].slots) g.buildings[best].shift(); g.buildings[best].push({ type: 'capital', level: 1, build: 0, damage: 0, queue: [] }); }
        g.markDirty(best);
      }
      g.log('capital', `سقطت عاصمة ${old.name}${to >= 0 ? ' بيد ' + g.nations[to].name : ''}!`, to, from, r, true);
      // a small nation that loses its capital surrenders: its land goes to the conqueror
      if (to >= 0 && (old.regionCount <= 8 + Math.floor(old.stats.peakArea / 250) || old.area < old.stats.peakArea * 0.5)) {
        g.log('surrender', `${old.name} استسلمت لـ${g.nations[to].name}`, to, from, r, true);
        for (let x = 0; x < g.owner.length; x++) if (g.owner[x] === from) {
          g.inf[x] *= 0.5; g.tank[x] *= 0.5; g.art[x] *= 0.5;
          transferRegion(g, x, to);
        }
        g.nations[to].gold += Math.max(0, old.gold); old.gold = 0;
        return;
      }
    }
    // airfields fall with the region; fleets in its port put to sea
    for (const a of [...g.airGroups.values()]) if (a.base === r && a.carrier < 0 && a.owner === from) g.airGroups.delete(a.id);
    for (const f of g.fleets.values()) if (f.port === r && f.owner === from) { f.port = -1; if (f.order === 'idle') f.home = -1; }
    for (const a of [...g.armies.values()]) if (a.state === 'stationed' && a.path[a.idx] === r && !(to >= 0 && g.allied(a.owner, to))) returnHome(g, a);
  } else if (to >= 0) { g.nations[to].area += R.area; g.nations[to].regionCount++; }
}

function capture(g: Game, r: number, winner: Army, all: Army[]) {
  const to = winner.owner;
  transferRegion(g, r, to);
  g.inf[r] = 0; g.tank[r] = 0; g.art[r] = 0;
  // same-owner attackers occupy; others keep fighting only if at war with the new owner
  const leftovers: Army[] = [];
  for (const a of all) {
    if (a.owner === to) { if (a !== winner) { winner.inf += a.inf; winner.tank += a.tank; winner.art += a.art; g.armies.delete(a.id); } }
    else if (!g.canAttack(a.owner, r)) returnHome(g, a);
    else leftovers.push(a);
  }
  g.battles.delete(r);
  if (leftovers.length) g.battles.set(r, { region: r, attackers: leftovers.map(a => a.id), t: 0 });
  // continuous expansion
  if (winner.expand > 0) {
    const keep = Math.min(winner.inf, Math.max(3, g.map.regions[r].area * COMBAT.expandGarrisonPerTile));
    g.inf[r] += keep; winner.inf -= keep;
    const next = pickExpansion(g, winner, r);
    if (next >= 0) {
      winner.path = [r, next]; winner.idx = 0; winner.prog = 0; winner.state = 'march'; winner.target = next; winner.expand--; winner.op = -1;
      return;
    }
  }
  g.inf[r] += winner.inf; g.tank[r] += winner.tank; g.art[r] += winner.art;
  g.armies.delete(winner.id);
}

function pickExpansion(g: Game, a: Army, r: number): number {
  const here = g.map.regions[r];
  const power = atkOf(a);
  let best = -1, bestS = -Infinity;
  for (const m of here.neighbors) {
    const o = g.owner[m];
    if (o === a.owner) continue;
    if (o >= 0 && !g.atWar(a.owner, o)) continue;
    if (g.battles.has(m) && o === -1) continue;
    const est = estimateDefense(g, m);
    if (power < est * 1.25 + 3) continue;
    const M = g.map.regions[m];
    const dx = M.cx - here.cx, dy = M.cy - here.cy, l = Math.hypot(dx, dy) || 1;
    const s = (dx * a.dirX + dy * a.dirY) / l * 2 - est / Math.max(1, power) * 2 + M.area / 30 + g.rng.next() * 0.3;
    if (s > bestS) { bestS = s; best = m; }
  }
  return bestS > -1.2 ? best : -1;
}

function battleTick(g: Game, r: number, dt: number) {
  const b = g.battles.get(r)!;
  b.t += dt;
  const attackers: Army[] = [];
  for (const id of b.attackers) { const a = g.armies.get(id); if (a && a.state === 'fight') attackers.push(a); }
  const o = g.owner[r];
  const valid = attackers.filter(a => {
    if (a.inf + a.tank + a.art < 0.3) { g.armies.delete(a.id); return false; }
    if (o === a.owner) { mergeArmy(g, a, r); return false; }
    if (!g.canAttack(a.owner, r)) { returnHome(g, a); return false; }
    return true;
  });
  b.attackers = valid.map(a => a.id);
  if (!valid.length) { g.battles.delete(r); return; }

  const stationed: Army[] = o >= 0 ? (g.stationed.get(r) ?? []).filter(a => a.state === 'stationed' && g.armies.has(a.id)) : [];
  const mult = defenseMultiplier(g, r);
  let D = 0, defHp = 0;
  if (o < 0) { D = g.neutral[r] * g.map.regions[r].defense; defHp = g.neutral[r]; }
  const fortB = o >= 0 ? g.building(r, 'fort') : undefined;
  const fort = fortB && fortB.level > 0 ? fortB.garrison : undefined;
  const fortUnits: LandCounts | null = fort ? { inf: fort.inf, tank: fort.tank, art: 0 } : null;
  if (o < 0) { /* neutral handled above */ }
  else {
    const gar = garrison(g, r);
    D = (defOf(gar) + stationed.reduce((s, a) => s + defOf(a), 0)) * mult;
    defHp = hpOf(gar) + stationed.reduce((s, a) => s + hpOf(a), 0);
    // the fort's own men and armour fight from cover while the bunker stands
    if (fortUnits) { D += defOf(fortUnits) * mult * (fort!.bunker > 0 ? FORT.entrench : 1); defHp += hpOf(fortUnits) + fort!.bunker; }
  }
  const A_raw = valid.map(a => atkOf(a) * (a.amphibious ? 0.75 : 1) * (g.airSupport[r] > 0 ? 1 + COMBAT.airSupportBoost : 1));
  const rawSum = A_raw.reduce((s, x) => s + x, 0);
  // only the troops on the front line fight; the rest queue behind it
  const front = (COMBAT.frontageBase + COMBAT.frontagePerDefender * defHp) * (fort && fort.bunker > 0 ? COMBAT.fortFrontage : 1);
  const engaged = rawSum > 0 ? Math.min(1, front / rawSum) : 1;
  const A_i = A_raw.map(x => x * engaged);
  const A = A_i.reduce((s, x) => s + x, 0);

  const toDef = COMBAT.rate * A * dt, toAtt = COMBAT.rate * D * dt;
  // defenders
  if (o < 0) {
    const lost = Math.min(g.neutral[r], toDef);
    g.neutral[r] -= lost;
    defHp = g.neutral[r];
  } else {
    // the bunker takes part of the fire while it stands; the rest is shared by everyone in the region
    let incoming = toDef;
    if (fort && fort.bunker > 0) { const hit = Math.min(fort.bunker, incoming * FORT.bunkerShare); fort.bunker -= hit; incoming -= hit; }
    const unitHp = defHp - (fort ? fort.bunker : 0);
    const share = unitHp > 0 ? incoming / unitHp : 1;
    if (fortUnits && fort) { applyLosses(fortUnits, hpOf(fortUnits) * share); fort.inf = fortUnits.inf; fort.tank = fortUnits.tank; }
    const gar = garrison(g, r);
    const lost = applyLosses(gar, hpOf(gar) * share);
    g.inf[r] = gar.inf; g.tank[r] = gar.tank; g.art[r] = gar.art;
    const killed = lost.inf + lost.tank + lost.art;
    g.nations[o].stats.deaths += killed;
    g.nations[o].wounded += lost.inf * ECON.woundedShare;
    for (const s of stationed) { applyLosses(s, hpOf(s) * share); if (s.inf + s.tank + s.art < 0.3) g.armies.delete(s.id); }
    defHp = hpOf(gar) + stationed.reduce((s2, a) => s2 + hpOf(a), 0) + (fort ? hpOf({ inf: fort.inf, tank: fort.tank, art: 0 }) + fort.bunker : 0);
    // a fort with no men left and a breached bunker is destroyed
    if (fortB && fort && fort.inf + fort.tank < 0.5 && fort.bunker <= 0) { g.buildings[r].splice(g.buildings[r].indexOf(fortB), 1); g.markDirty(r); g.fx.push({ k: 'explosion', x: g.map.regions[r].cx, y: g.map.regions[r].cy, r: 1.2, nuke: false }); }
    for (let i = 0; i < valid.length; i++) g.nations[valid[i].owner].stats.kills += killed * A_i[i] / A;
  }
  // attackers
  for (let i = 0; i < valid.length; i++) {
    const a = valid[i];
    const lost = applyLosses(a, toAtt * A_i[i] / A);
    const n = g.nations[a.owner];
    n.stats.deaths += lost.inf + lost.tank + lost.art;
    n.wounded += lost.inf * ECON.woundedShare;
  }
  if (g.tick % 4 === 0 && valid.length) {
    const a = valid[g.rng.int(valid.length)], R = g.map.regions[r];
    g.fx.push({ k: 'shot', x: a.x, y: a.y, tx: R.cx + g.rng.range(-1.5, 1.5), ty: R.cy + g.rng.range(-1.5, 1.5) });
  }
  const alive = valid.filter(a => a.inf + a.tank + a.art >= 0.3);
  for (const a of valid) if (!alive.includes(a)) g.armies.delete(a.id);
  if (!alive.length) { g.battles.delete(r); return; }
  if (defHp < 0.5) {
    for (const s of stationed) g.armies.delete(s.id);
    const winner = alive.reduce((m, a) => (atkOf(a) > atkOf(m) ? a : m), alive[0]);
    capture(g, r, winner, alive);
  }
}

// ---------- fleets ----------
function fleetSpeed(f: Fleet) {
  let s = 9;
  for (const k of SEA_UNITS) if (f.ships[k] > 0.05) s = Math.min(s, SEA[k].speed);
  return s === 9 ? 3 : s;
}

function fleetTick(g: Game, f: Fleet, dt: number) {
  f.combat += dt;
  if (f.order === 'idle' || !f.path.length) return;
  if (f.order === 'invade' && f.port >= 0) return; // waiting for troops
  const speed = fleetSpeed(f);
  let move = speed * dt;
  while (move > 0 && f.path.length > 1) {
    const a = g.map.seas[f.path[0]], b = g.map.seas[f.path[1]];
    const len = Math.hypot(b.cx - a.cx, b.cy - a.cy) || 1;
    const step = Math.min(move, len - f.prog);
    f.prog += step; move -= step;
    const t = f.prog / len;
    f.x = a.cx + (b.cx - a.cx) * t; f.y = a.cy + (b.cy - a.cy) * t;
    if (f.prog >= len - 1e-6) { f.path.shift(); f.prog = 0; f.sea = f.path[0]; }
  }
  if (f.path.length <= 1) {
    f.sea = f.path[0] ?? f.sea; f.path = [];
    if (f.order === 'invade') land(g, f);
    else if (f.order === 'return') dock(g, f);
    else f.order = 'idle';
  }
}

function land(g: Game, f: Fleet) {
  const r = f.invadeTarget;
  const R = g.map.regions[r];
  for (const id of f.cargo) {
    const a = g.armies.get(id); if (!a) continue;
    a.fleet = -1; a.path = [r]; a.idx = 0; a.prog = 0; a.amphibious = true; a.op = -1;
    a.x = (f.x + R.cx) / 2; a.y = (f.y + R.cy) / 2;
    const o = g.owner[r];
    if (a.kind === 'attack') {
      if (o === a.owner) mergeArmy(g, a, r);
      else if (g.canAttack(a.owner, r)) { if (o >= 0 && !g.atWar(a.owner, o)) declareWar(g, a.owner, o); joinBattle(g, a, r); }
      else { a.state = 'march'; returnHome(g, a); }
    } else { a.state = 'march'; arrive(g, a); }
  }
  f.cargo = [];
  if (f.op >= 0) g.ops.delete(f.op);
  f.op = -1; f.invadeTarget = -1;
  f.order = 'return';
  routeHome(g, f);
}

function routeHome(g: Game, f: Fleet) {
  let home = f.home >= 0 && g.owner[f.home] === f.owner ? f.home : -1;
  if (home < 0) {
    const ports = g.nationBuildings(f.owner, 'port');
    home = ports.sort((a, b) => Math.hypot(g.map.regions[a].cx - f.x, g.map.regions[a].cy - f.y) - Math.hypot(g.map.regions[b].cx - f.x, g.map.regions[b].cy - f.y))[0] ?? -1;
  }
  if (home < 0) { f.order = 'idle'; return; }
  f.home = home;
  f.path = g.seaPath(f.sea, g.map.regions[home].seas[0]) ?? [];
  f.prog = 0;
  if (f.path.length <= 1) dock(g, f);
}

function dock(g: Game, f: Fleet) {
  const home = f.home;
  f.path = [];
  if (home >= 0 && g.owner[home] === f.owner) {
    f.port = home; f.order = 'idle';
    const S = g.map.seas[g.map.regions[home].seas[0]];
    f.sea = S.id; f.x = (S.cx + g.map.regions[home].cx * 2) / 3; f.y = (S.cy + g.map.regions[home].cy * 2) / 3;
    // merge with any other idle fleet at the same port
    for (const o of g.fleets.values()) if (o !== f && o.owner === f.owner && o.port === home && o.order === 'idle') {
      for (const k of SEA_UNITS) f.ships[k] += o.ships[k];
      for (const k in o.planes) (f.planes as any)[k] += (o.planes as any)[k];
      g.fleets.delete(o.id);
    }
  } else f.order = 'idle';
}

function seaCombat(g: Game, dt: number) {
  const bySea = new Map<number, Fleet[]>();
  for (const f of g.fleets.values()) { const l = bySea.get(f.sea); if (l) l.push(f); else bySea.set(f.sea, [f]); }
  for (const fleets of bySea.values()) {
    if (fleets.length < 2) continue;
    for (const f of fleets) {
      const enemies = fleets.filter(e => e.owner !== f.owner && g.atWar(f.owner, e.owner));
      if (!enemies.length) continue;
      const detect = fleets.some(e => e.owner !== f.owner && g.atWar(f.owner, e.owner) && (e.ships.patrol > 0.05 || e.ships.destroyer > 0.05))
        || [...g.sorties.values()].some(s => s.owner !== f.owner && s.planes.drone > 0 && s.targetSea === f.sea);
      let incoming = 0;
      for (const e of enemies) for (const k of SEA_UNITS) incoming += e.ships[k] * SEA[k].atk + (k === 'carrier' ? e.ships[k] * (e.planes.f16 * 2 + e.planes.f35 * 3 + e.planes.su57 * 2 + e.planes.apache * 2 + e.planes.b52 * 3) / Math.max(1, e.ships.carrier) * 0.5 : 0);
      if (incoming <= 0) continue;
      const dmg = incoming * 0.18 * dt;
      let hp = 0;
      for (const k of SEA_UNITS) if (k !== 'sub' || detect) hp += f.ships[k] * SEA[k].hp;
      if (hp <= 0) continue;
      const frac = Math.min(1, dmg / hp);
      const transportBefore = f.ships.transport, carrierBefore = f.ships.carrier;
      for (const k of SEA_UNITS) if (k !== 'sub' || detect) {
        const lost = f.ships[k] * frac; f.ships[k] -= lost;
        if (f.ships[k] < 0.05) f.ships[k] = 0;
        for (const e of enemies) g.nations[e.owner].stats.kills += lost / enemies.length;
      }
      if (transportBefore > 0) {
        const keep = f.ships.transport / transportBefore;
        for (const id of f.cargo) { const a = g.armies.get(id); if (a) { a.inf *= keep; a.tank *= keep; a.art *= keep; } }
      }
      if (carrierBefore > 0) { const keep = f.ships.carrier / carrierBefore; for (const k in f.planes) (f.planes as any)[k] *= keep; }
      f.combat = 0;
      if (g.tick % 3 === 0) { const e = enemies[g.rng.int(enemies.length)]; g.fx.push({ k: 'shot', x: e.x, y: e.y, tx: f.x + g.rng.range(-0.8, 0.8), ty: f.y + g.rng.range(-0.8, 0.8), sea: true }); }
    }
  }
  for (const f of [...g.fleets.values()]) if (shipTotal(f.ships) < 0.05) {
    for (const id of f.cargo) g.armies.delete(id);
    for (const a of g.airGroups.values()) if (a.carrier === f.id) g.airGroups.delete(a.id);
    g.fleets.delete(f.id);
  }
}

export function cmdFleetMove(g: Game, n: number, fleetId: number, sea: number): CommandResult {
  const f = g.fleets.get(fleetId);
  if (!f || f.owner !== n) return { ok: false, error: 'الأسطول ليس لك' };
  if (f.cargo.length) return { ok: false, error: 'الأسطول ينقل قوات حاليًا' };
  const p = g.seaPath(f.sea, sea);
  if (!p) return { ok: false, error: 'لا يوجد ممر بحري' };
  f.path = p; f.prog = 0; f.port = -1; f.order = 'move';
  if (f.op >= 0) { g.ops.delete(f.op); f.op = -1; }
  return { ok: true };
}

export function cmdFleetReturn(g: Game, n: number, fleetId: number): CommandResult {
  const f = g.fleets.get(fleetId);
  if (!f || f.owner !== n) return { ok: false, error: 'الأسطول ليس لك' };
  if (f.cargo.length) return { ok: false, error: 'الأسطول ينقل قوات حاليًا' };
  f.order = 'return'; routeHome(g, f);
  return { ok: true };
}

// ---------- main tick ----------
export function militaryTick(g: Game, dt: number) {
  g.indexArmies();
  for (const a of [...g.armies.values()]) {
    if (!g.armies.has(a.id)) continue;
    if (a.state === 'embarked') {
      const f = g.fleets.get(a.fleet);
      if (!f) { g.armies.delete(a.id); continue; }
      a.x = f.x; a.y = f.y; continue;
    }
    if (a.state === 'wait') { a.waitT += dt; continue; }
    if (a.state === 'stationed') {
      a.waitT += dt;
      const r = a.path[a.idx];
      if (a.waitT > 150 && threatAt(g, g.owner[r], r) <= 0) { a.waitT = 0; returnHome(g, a); }
      continue;
    }
    if (a.state !== 'march') continue;
    if (a.inf + a.tank + a.art < 0.3) { g.armies.delete(a.id); continue; }
    if (a.idx >= a.path.length - 1) { arrive(g, a); continue; }
    const from = a.path[a.idx], to = a.path[a.idx + 1];
    const len = g.edgeLen(from, to);
    a.prog += unitSpeed(a) * dt;
    const t = Math.min(1, a.prog / len);
    const A = g.map.regions[from], B = g.map.regions[to];
    // stop at the border when entering a hostile region
    const hostile = to === a.target && a.kind === 'attack';
    const tt = hostile ? Math.min(t, 0.5) : t;
    a.x = A.cx + (B.cx - A.cx) * tt; a.y = A.cy + (B.cy - A.cy) * tt;
    if (a.prog >= (hostile ? len * 0.5 : len)) { a.idx++; a.prog = 0; arrive(g, a); }
  }
  // operations: release waiting armies together
  for (const op of [...g.ops.values()]) {
    op.t += dt;
    const armies = op.armies.map(id => g.armies.get(id)).filter((a): a is Army => !!a);
    if (!armies.length) { g.ops.delete(op.id); if (op.naval) { const f = g.fleets.get(op.fleet); if (f && !f.cargo.length) { f.order = 'idle'; f.op = -1; } } continue; }
    const waiting = armies.filter(a => a.state === 'wait');
    const allReady = waiting.length === armies.filter(a => a.state !== 'fight').length;
    const firstWait = Math.max(0, ...waiting.map(a => a.waitT));
    if (waiting.length && (allReady || firstWait > 14)) {
      if (op.naval) { embark(g, op); for (const a of armies) if (a.state === 'march') { a.op = -1; } g.ops.delete(op.id); continue; }
      for (const a of waiting) {
        a.state = 'march'; a.op = -1;
        if (!g.canAttack(a.owner, op.target) && g.owner[op.target] !== a.owner) returnHome(g, a);
      }
      for (const a of armies) a.op = -1;
      g.ops.delete(op.id);
    }
  }
  for (const r of [...g.battles.keys()]) battleTick(g, r, dt);
  for (const f of [...g.fleets.values()]) fleetTick(g, f, dt);
  seaCombat(g, dt);
}

export { emptyAir };
export type { SeaUnit };
