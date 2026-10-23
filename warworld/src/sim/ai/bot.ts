// Utility AI for bot nations. Runs locally inside the simulation, staggered over ticks.
// Each bot weighs economy, defence, expansion, war, navy, air, nukes and diplomacy through its
// own personality, so neighbouring bots make visibly different decisions in the same situation.
import { BUILDINGS, BuildingType, FOUNDING_SECONDS, LAND, TICK_RATE, Weapon, WEAPONS } from '../balance';
import type { Game } from '../game';
import { atkOf, estimateDefense, isBorder, threatAt } from '../military';
import { opinion } from '../diplomacy';
import { airTotal, REL } from '../state';
import type { Personality } from './personality';

const SKILL = { easy: 0.35, medium: 0.6, hard: 0.82, expert: 1 } as const;
const INTERVAL = { easy: 4.2, medium: 2.8, hard: 1.9, expert: 1.3 } as const;

interface View {
  own: number[]; border: number[]; interior: number[];
  frontier: number[];                  // neutral regions touching us
  enemyFront: Map<number, number[]>;   // nation -> their regions touching us
  available: number;                   // movable infantry
  power: number;
}

export class Bot {
  readonly id: number;
  readonly p: Personality;
  readonly skill: number;
  private next: number;
  private interval: number;
  private foundAt: number;
  private target = -1;
  private targetSince = 0;
  private lastDiplo = 0;
  private lastAir = 0;
  private lastNaval = 0;
  private lastNuke = 0;
  private builds = 0;
  private peakArea = 0;
  mood: 'expand' | 'build' | 'war' | 'defend' | 'recover' = 'expand';

  constructor(private g: Game, id: number) {
    this.id = id;
    this.p = g.nations[id].personality!;
    this.skill = SKILL[g.cfg.difficulty];
    this.interval = Math.round(INTERVAL[g.cfg.difficulty] * TICK_RATE * this.p.thinkJitter);
    this.next = g.rng.int(this.interval) + 1;
    this.foundAt = g.rng.range(0.8, FOUNDING_SECONDS - 1.5);
  }

  private get me() { return this.g.nations[this.id]; }
  private cmd(c: any) { return this.g.command(this.id, c); }
  private noise(scale = 1) { return (this.g.rng.next() - 0.5) * scale * (1.3 - this.skill); }

  foundingThink() {
    const g = this.g;
    if (this.me.founded || FOUNDING_SECONDS - g.foundingLeft < this.foundAt) return;
    const r = g.autoFoundSite(this.id);
    if (r >= 0 && !g.canFound(this.id, r)) g.found(this.id, r);
  }

  tick() {
    const g = this.g;
    if (g.tick < this.next) return;
    this.next = g.tick + Math.max(4, Math.round(this.interval * g.rng.range(0.75, 1.25)));
    if (!this.me.alive) return;
    const v = this.view();
    this.respond(v);
    this.economy(v);
    this.produce(v);
    this.defend(v);
    this.war(v);
    this.expand(v);
    this.naval(v);
    this.air(v);
    this.strategic(v);
    if (g.time - this.lastDiplo > 18 + 20 * (1 - this.p.diplomacy)) { this.lastDiplo = g.time; this.diplomacy(v); }
    this.peakArea = Math.max(this.peakArea, this.me.area);
  }

  private view(): View {
    const g = this.g, n = this.id;
    const own: number[] = [], border: number[] = [], interior: number[] = [];
    const frontier = new Set<number>();
    const enemyFront = new Map<number, number[]>();
    let available = 0, power = 0;
    for (let r = 0; r < g.owner.length; r++) {
      if (g.owner[r] !== n) continue;
      own.push(r);
      let b = false;
      for (const m of g.map.regions[r].neighbors) {
        const o = g.owner[m];
        if (o === n) continue;
        if (o < 0) { frontier.add(m); b = true; continue; }
        if (g.allied(n, o)) continue;
        b = true;
        const l = enemyFront.get(o); if (l) { if (!l.includes(m)) l.push(m); } else enemyFront.set(o, [m]);
      }
      (b ? border : interior).push(r);
      available += g.inf[r];
      power += g.inf[r] + g.tank[r] * LAND.tank.atk + g.art[r] * LAND.art.atk;
    }
    return { own, border, interior, frontier: [...frontier], enemyFront, available, power };
  }

  // ---------------- economy ----------------
  private economy(v: View) {
    const g = this.g, me = this.me, p = this.p;
    if (v.own.length === 0) return;
    // finish what is under construction before starting too much at once
    let underway = 0;
    for (const r of v.own) for (const b of g.buildings[r]) if (b.build > 0) underway++;
    const maxParallel = 1 + Math.floor(this.skill * 2 + p.economy + Math.min(4, me.gold / 2500));
    if (underway >= maxParallel) return;

    const want: { type: BuildingType; score: number; upgrade?: number }[] = [];
    const count = (t: BuildingType) => v.own.reduce((s, r) => s + (g.building(r, t) ? 1 : 0), 0);
    const foodRate = me.income.food;
    const foodScore = foodRate < 0 ? 3 + Math.min(4, -foodRate / 2) * (me.food < 200 ? 2 : 1) : foodRate < 2 ? 1 : 0.1;
    want.push({ type: 'farm', score: foodScore });
    const crowd = me.pop / Math.max(1, me.housing);
    want.push({ type: 'city', score: crowd > 0.8 ? 2.2 + p.economy : 0.4 + p.economy * 0.4 });
    const idle = me.labor - me.jobs;
    const lumber = count('lumber'), mine = count('mine'), factory = count('factory');
    want.push({ type: 'lumber', score: (me.wood < 250 ? 1.8 : 0.5) / (1 + lumber * 0.6) + (idle > 300 ? 0.4 : 0) });
    want.push({ type: 'mine', score: (me.steel < 200 ? 1.6 : 0.5) / (1 + mine * 0.5) + (idle > 300 ? 0.4 : 0) + p.air * 0.3 });
    want.push({ type: 'factory', score: (0.8 + p.economy + p.greed * 0.5) / (1 + factory * 0.45) + (idle > 400 ? 0.8 : 0) });
    if (!count('barracks')) want.push({ type: 'barracks', score: 0.8 + p.aggression });
    else want.push({ type: 'barracks', score: 0.15 * p.aggression });
    if (me.wounded > 40 && !count('hospital')) want.push({ type: 'hospital', score: 1.2 + p.defense * 0.5 });
    else want.push({ type: 'hospital', score: 0.25 * p.economy / (1 + count('hospital')) });
    const coastal = v.own.some(r => g.map.regions[r].coastal);
    const landLocked = v.frontier.length === 0 && v.enemyFront.size === 0;
    if (coastal) want.push({ type: 'port', score: (p.navy * 1.3 + (landLocked ? 2.5 : 0) + p.greed * 0.3) / (1 + count('port') * 1.5) });
    const time = g.time;
    if (time > 150 / (0.5 + this.skill)) want.push({ type: 'airbase', score: (p.air * 1.4 + 0.2) / (1 + count('airbase') * 1.5) * (me.steel > 150 ? 1 : 0.3) });
    if (time > 300 && me.gold > 900) {
      const nukeDrive = p.nukes * this.skill * (this.wasNuked() ? 2 : 1);
      if (!count('silo')) want.push({ type: 'silo', score: nukeDrive * 1.6 });
      if (!count('nuclear')) want.push({ type: 'nuclear', score: nukeDrive * 1.5 });
    }
    const threatened = this.enemyHasStrategic();
    if (time > 240) want.push({ type: 'airdefense', score: (threatened ? 1.8 : 0.2) * (0.5 + p.defense) / (1 + count('airdefense')) });

    // early game: follow this bot's own opening
    if (this.builds < p.buildOrder.length && time < 240) {
      const t = p.buildOrder[this.builds] as BuildingType;
      const w = want.find(x => x.type === t);
      if (w) w.score += 2.5;
    }
    // upgrades of existing buildings
    const cap = me.capital;
    if (cap >= 0 && crowd > 0.75) { const b = g.building(cap, 'capital'); if (b && b.level < BUILDINGS.capital.maxLevel && b.build <= 0) want.push({ type: 'capital', score: 2.4, upgrade: cap }); }
    for (const r of v.own) for (const b of g.buildings[r]) {
      if (b.build > 0 || b.level >= BUILDINGS[b.type].maxLevel || b.type === 'capital') continue;
      let s = 0;
      if (b.type === 'city' && crowd > 0.8) s = 1.9;
      else if (b.type === 'factory' && me.gold > 1200) s = 1.1 * p.economy;
      else if (b.type === 'farm' && foodRate < 0) s = 2.6;
      else if (b.type === 'port' && p.navy > 0.6 && me.gold > 900) s = 1.0 * p.navy;
      else if (b.type === 'airbase' && p.air > 0.6 && me.gold > 1200) s = 1.0 * p.air;
      else if (b.type === 'silo' && p.nukes > 0.7 && me.gold > 3000) s = 0.9;
      else if (b.type === 'nuclear' && p.nukes > 0.7 && me.gold > 4000) s = 0.9;
      else if ((b.type === 'mine' || b.type === 'lumber') && me.gold > 800) s = 0.5;
      if (s > 0) want.push({ type: b.type, score: s + this.noise(0.6), upgrade: r });
    }
    // the treasury is overflowing: invest in this personality's military projects and expand housing
    if (me.gold > 1500 + 1000 * (1 - p.greed)) {
      if (p.nukes > 0.45 && time > 240) { if (!count('nuclear')) want.push({ type: 'nuclear', score: 3 + p.nukes }); if (!count('silo')) want.push({ type: 'silo', score: 2.8 + p.nukes }); }
      if (p.air > 0.4 && count('airbase') < 1 + Math.floor(me.gold / 6000)) want.push({ type: 'airbase', score: 2.2 + p.air });
      if (coastal && p.navy > 0.4 && count('port') < 1 + Math.floor(me.gold / 8000)) want.push({ type: 'port', score: 2 + p.navy });
      want.push({ type: 'factory', score: 2.0 });
      want.push({ type: 'city', score: 1.8 });
    }
    for (const w of want) w.score += this.noise(1.2);
    want.sort((a, b) => b.score - a.score);
    let started = 0;
    const perThink = 1 + Math.floor(Math.min(3, me.gold / 3000));
    for (const w of want.slice(0, 6)) {
      if (w.score < 0.6 || started >= perThink) break;
      const res = w.upgrade !== undefined ? this.cmd({ c: 'upgrade', region: w.upgrade, type: w.type }) : this.placeBuilding(v, w.type);
      if (res?.ok) { this.builds++; started++; }
    }
  }

  private placeBuilding(v: View, type: BuildingType) {
    const g = this.g;
    let best = -1, bs = -Infinity;
    const cap = this.me.capital >= 0 ? g.map.regions[this.me.capital] : null;
    const pool = v.interior.length > 2 && type !== 'port' ? v.interior : v.own;
    for (const r of pool) {
      if (g.buildError(this.id, r, type)) continue;
      const R = g.map.regions[r];
      let s = -(cap ? Math.hypot(R.cx - cap.cx, R.cy - cap.cy) / 30 : 0) + this.noise(0.8);
      if (type === 'farm') s += R.flatShare * 2;
      if (type === 'lumber') s += R.forestShare * 3;
      if (type === 'mine') s += R.hillShare * 3;
      if (type === 'city') s += R.area / 20 + R.flatShare;
      if (type === 'silo' || type === 'nuclear') s -= threatAt(g, this.id, r) / 50;
      if (isBorder(g, this.id, r)) s -= 1.5 * this.p.defense;
      if (s > bs) { bs = s; best = r; }
    }
    return best >= 0 ? this.cmd({ c: 'build', region: best, type }) : null;
  }

  // ---------------- production ----------------
  private produce(v: View) {
    const g = this.g, me = this.me, p = this.p;
    const militaryShare = Math.min(0.85, 0.25 + p.aggression * 0.35 + (this.target >= 0 ? 0.2 : 0) + (this.mood === 'defend' ? 0.2 : 0));
    const reserve = 250 + 400 * p.economy;
    let spend = Math.max(0, me.gold - reserve) * militaryShare;
    if (spend < 30) return;
    const pay = (unit: string, at: number[], cap: number) => {
      if (!at.length || spend <= 0) return;
      const def = g.unitDef(unit) ?? (WEAPONS as any)[unit];
      const k = Math.min(cap, Math.floor(spend / Math.max(1, def.cost.gold ?? 1)));
      if (k < 1) return;
      const r = at[g.rng.int(at.length)];
      const res = this.cmd({ c: 'produce', region: r, unit, n: k });
      if (res.ok) spend -= k * (def.cost.gold ?? 0);
    };
    // manual recruitment at barracks when under capacity
    if (me.soldiers < me.capacity * (0.7 + p.aggression * 0.5) && me.pop > 1500 && me.food > 80) {
      const k = Math.floor(Math.min(spend * 0.45 / 3, me.pop * 0.06, 400 + me.gold / 20));
      if (k > 5 && this.cmd({ c: 'recruit', n: k }).ok) spend -= k * 3;
    }
    const factories = g.nationBuildings(this.id, 'factory');
    if (factories.length && me.steel > 50) {
      const unit = p.favoriteUnit === 'inf' ? (g.rng.chance(0.5) ? 'tank' : 'art') : g.rng.chance(0.7) ? p.favoriteUnit : p.favoriteUnit === 'tank' ? 'art' : 'tank';
      pay(unit, factories, Math.floor(4 + me.steel / 60));
    }
    const ports = g.nationBuildings(this.id, 'port');
    if (ports.length && spend > 100) {
      const transports = [...g.fleets.values()].filter(f => f.owner === this.id).reduce((s2, f) => s2 + f.ships.transport, 0);
      const needSea = v.frontier.length === 0 && v.enemyFront.size === 0;
      if (transports < (needSea ? 5 : 1 + p.navy * 3)) pay('transport', ports, needSea ? 3 : 1);
      else if (p.navy > 0.4 && g.rng.chance(p.navy * 0.7)) {
        const lvl2 = ports.filter(r => g.level(r, 'port') >= 2), lvl3 = ports.filter(r => g.level(r, 'port') >= 3);
        if (lvl3.length && me.gold > 2500 && p.air > 0.45 && g.rng.chance(0.3)) pay('carrier', lvl3, 1);
        else if (lvl2.length) pay(g.rng.chance(0.55) ? 'destroyer' : 'sub', lvl2, 3);
        else pay('patrol', ports, 3);
      }
    }
    const bases = g.nationBuildings(this.id, 'airbase');
    if (bases.length && spend > 150 && g.rng.chance(0.35 + p.air * 0.6)) {
      const lvl2 = bases.filter(r => g.level(r, 'airbase') >= 2);
      const roll = g.rng.next();
      const lvl3 = bases.filter(r => g.level(r, 'airbase') >= 3);
      if (lvl3.length && me.gold > 3000) pay(roll < 0.3 ? 'f35' : roll < 0.55 ? 'su57' : roll < 0.75 ? 'b2' : 'ac130', lvl3, 3);
      else if (lvl2.length) pay(roll < 0.4 ? 'f16' : roll < 0.65 ? 'b52' : roll < 0.8 ? 'ac130' : 'apache', lvl2, 4);
      else pay(roll < 0.6 ? 'apache' : roll < 0.85 ? 'blackhawk' : 'drone', bases, 4);
    }
    const silos = g.nationBuildings(this.id, 'silo');
    if (silos.length && me.gold > 2200 && g.rng.chance(0.3 + p.nukes * this.skill)) {
      const order: Weapon[] = me.gold > 11000 ? ['mirv', 'hbomb', 'atom'] : me.gold > 5000 ? ['hbomb', 'atom'] : ['atom'];
      for (const w of order) { const s2 = silos.find(r => !g.produceError(this.id, r, w)); if (s2 !== undefined && this.cmd({ c: 'produce', region: s2, unit: w, n: 1 }).ok) break; }
    }
  }

  // ---------------- defence ----------------
  private defend(v: View) {
    const g = this.g;
    let worst = -1, ws = 1;
    for (const r of v.border) {
      const t = threatAt(g, this.id, r);
      if (t <= 0) continue;
      const s = t / (g.garrisonStrength(r) * 1.2 + 4);
      if (s > ws) { ws = s; worst = r; }
    }
    this.mood = worst >= 0 && ws > 1.6 ? 'defend' : this.target >= 0 ? 'war' : v.frontier.length ? 'expand' : 'build';
    if (worst < 0) return;
    if (g.rng.next() > 0.4 + this.p.defense * 0.6) return;
    const amt = Math.min(v.available * 0.4, threatAt(g, this.id, worst) * 1.3);
    if (amt > 10) this.cmd({ c: 'reinforce', amount: amt });
    // under real pressure ask allies for help
    if (ws > 2.5 && g.rng.chance(0.25)) {
      for (const o of g.nations) if (o.alive && o.id !== this.id && g.allied(this.id, o.id) && !g.teammates(this.id, o.id)) { this.cmd({ c: 'propose', to: o.id, type: 'help', region: worst }); break; }
    }
  }

  // ---------------- expansion into neutral land ----------------
  private expand(v: View) {
    const g = this.g, p = this.p;
    if (!v.frontier.length) return;
    const busy = [...g.ops.values()].filter(o => o.owner === this.id).length + [...g.armies.values()].filter(a => a.owner === this.id && a.kind === 'attack').length;
    const maxOps = 1 + Math.round(this.skill * 3 + p.expansion * 2);
    if (busy >= maxOps) return;
    const spare = v.available * (1 - p.reserve) * (this.mood === 'war' ? 0.4 : 1);
    if (spare < 15) return;
    const cap = this.me.capital >= 0 ? g.map.regions[this.me.capital] : null;
    const scored = v.frontier.filter(r => !g.battles.has(r)).map(r => {
      const R = g.map.regions[r];
      const est = estimateDefense(g, r);
      let s = R.area / Math.max(4, est) * 3 + R.flatShare + R.forestShare * 0.5 + (R.coastal ? 0.3 * p.navy : 0);
      if (cap) {
        const dx = R.cx - cap.cx, dy = R.cy - cap.cy, l = Math.hypot(dx, dy) || 1;
        s += (dx * p.dirX + dy * p.dirY) / l * 0.6 - l / 60;
      }
      return { r, est, s: s + this.noise(2) };
    }).sort((a, b) => b.s - a.s);
    let budget = spare;
    for (const c of scored.slice(0, maxOps - busy)) {
      const ratio = 1.3 + (1 - p.risk) * 0.8 + this.noise(0.6);
      const chain = budget > c.est * 6 && g.rng.chance(0.4 + p.expansion * 0.5);
      const amount = Math.min(budget, chain ? Math.max(c.est * ratio * 3, budget * 0.5) : c.est * ratio + 4);
      if (amount < c.est * 1.15 + 2) continue;
      const res = this.cmd({ c: 'attack', target: c.r, amount, expand: chain });
      if (res.ok) budget -= amount;
      if (budget < 15) break;
    }
  }

  // ---------------- war ----------------
  private war(v: View) {
    const g = this.g, p = this.p, me = this.me;
    // pick / keep a target nation
    if (this.target >= 0 && (!g.nations[this.target].alive || g.allied(this.id, this.target))) this.target = -1;
    const landHungry = v.frontier.length < 2;
    if (this.target < 0 || g.time - this.targetSince > 120 + p.patience * 160) {
      let best = -1, bs = 0.9 - (landHungry ? 0.9 : 0) - (v.frontier.length === 0 ? 0.6 : 0);
      for (const [o, regs] of v.enemyFront) {
        const them = g.nations[o];
        if (!them.alive || g.relOf(this.id, o) === REL.nap) continue;
        const theirPower = them.soldiers + them.tanks * LAND.tank.atk + them.arts * LAND.art.atk + 1;
        const ratio = v.power / theirPower;
        let s = p.aggression * 1.2 + Math.min(2, ratio - 0.7) * (0.6 + p.risk * 0.5) + regs.length * 0.05;
        s -= opinion(g, this.id, o) / 60;
        if (g.atWar(this.id, o)) s += 0.8;
        // opportunists pile on nations already fighting someone else
        if (g.nations.some(x => x.id !== this.id && x.alive && g.atWar(x.id, o))) s += (1 - p.loyalty) * 0.6;
        // allies call for joint attacks
        if (g.nations.some(x => x.id !== this.id && g.allied(this.id, x.id) && g.jointTarget[x.id] === o)) s += 0.7 * p.loyalty;
        // gang up on the runaway leader
        if (g.share(o) > 0.35) s += (g.share(o) - 0.3) * 3;
        if (o === g.nations.find(x => x.human)?.id) s += this.g.cfg.difficulty === 'easy' ? -0.4 : 0.1;
        if (g.time < 120 / (0.4 + p.aggression)) s -= 1.2;
        s += this.noise(1);
        if (s > bs) { bs = s; best = o; }
      }
      if (best !== this.target) { this.target = best; this.targetSince = g.time; }
    }
    // also fight back against anyone actively attacking us
    const attackers = new Set<number>();
    for (const b of g.battles.values()) if (g.owner[b.region] === this.id) for (const id of b.attackers) { const a = g.armies.get(id); if (a) attackers.add(a.owner); }
    const foes = new Set<number>([...attackers]);
    if (this.target >= 0) foes.add(this.target);
    if (!foes.size) return;
    const busy = [...g.armies.values()].filter(a => a.owner === this.id && a.kind === 'attack').length;
    if (busy > 2 + this.skill * 4) return;
    const spare = v.available * (1 - p.reserve) + me.tanks * 0.6;
    let budget = spare;
    const cands: { r: number; s: number; est: number }[] = [];
    for (const o of foes) for (const r of v.enemyFront.get(o) ?? []) {
      if (!g.canAttack(this.id, r)) continue;
      const est = estimateDefense(g, r);
      const R = g.map.regions[r];
      // decapitation strikes end wars: capitals are worth far more than border land
      const value = R.area + g.cityLevel(r) * 40 + (g.nations[o].capital === r ? 400 + 300 * this.skill : 0) + g.buildings[r].length * 15;
      cands.push({ r, est, s: value / (est + 10) + this.noise(1.5) });
    }
    cands.sort((a, b) => b.s - a.s);
    for (const c of cands.slice(0, 1 + Math.round(this.skill * 2))) {
      const need = c.est * p.attackRatio * (0.8 + this.skill * 0.3) + 5;
      if (budget < need && !(attackers.size && budget > need * 0.6)) continue;
      const amount = Math.min(budget, need * (1.1 + p.risk * 0.5));
      const tanks = Math.min(me.tanks * 0.5, amount / 15), arts = Math.min(me.arts * 0.5, amount / 20);
      const res = this.cmd({ c: 'attack', target: c.r, amount, tanks, arts, expand: g.rng.chance(p.aggression * 0.6) });
      if (res.ok) budget -= amount;
      if (budget < 20) break;
    }
    // losing badly → seek a ceasefire
    if (attackers.size && v.power < 0.45 * this.foePower([...attackers]) && g.rng.chance(0.15 + p.diplomacy * 0.2)) {
      for (const a of attackers) this.cmd({ c: 'propose', to: a, type: 'nap' });
    }
  }

  private foePower(ids: number[]) { return ids.reduce((s, o) => s + this.g.nations[o].soldiers + this.g.nations[o].tanks * 5, 0); }

  // ---------------- navy ----------------
  private naval(v: View) {
    const g = this.g, p = this.p;
    if (g.time - this.lastNaval < 25 - p.navy * 12) return;
    const landLocked = v.frontier.length === 0 && ![...v.enemyFront.keys()].some(o => g.canAttack(this.id, (v.enemyFront.get(o) ?? [])[0] ?? -1));
    if (!landLocked && g.rng.next() > p.navy * 0.25) return;
    this.lastNaval = g.time;
    const fleet = [...g.fleets.values()].find(f => f.owner === this.id && f.order === 'idle' && f.port >= 0 && f.ships.transport >= 1);
    if (!fleet) return;
    // nearest coastal target that is neutral or belongs to our war target
    const from = g.map.regions[fleet.port];
    let best = -1, bs = -Infinity;
    for (const R of g.map.regions) {
      if (!R.coastal || R.continent === from.continent && !landLocked) continue;
      const o = g.owner[R.id];
      if (o === this.id || !g.canAttack(this.id, R.id)) continue;
      if (o >= 0 && !(o === this.target || g.atWar(this.id, o))) continue;
      const d = Math.hypot(R.cx - from.cx, R.cy - from.cy);
      const s = -d / 15 + R.area / 10 - estimateDefense(g, R.id) / 20 + this.noise(2);
      if (s > bs) { bs = s; best = R.id; }
    }
    if (best < 0) return;
    const amount = Math.min(fleet.ships.transport * 250, v.available * (1 - p.reserve) * 0.7);
    if (amount > estimateDefense(g, best) * 1.4 + 10) this.cmd({ c: 'attack', target: best, amount, tanks: this.me.tanks * 0.3, expand: true });
  }

  // ---------------- air ----------------
  private air(v: View) {
    const g = this.g;
    if (g.time - this.lastAir < 12 - this.p.air * 6) return;
    const groups = [...g.airGroups.values()].filter(a => a.owner === this.id && airTotal(a.planes) >= 2);
    if (!groups.length) return;
    this.lastAir = g.time;
    // support our own assaults first, then hit the fattest enemy stack in range
    const targets: number[] = [];
    for (const b of g.battles.values()) if (b.attackers.some(id => g.armies.get(id)?.owner === this.id) && g.owner[b.region] !== this.id) targets.push(b.region);
    for (const [o, regs] of v.enemyFront) if (g.atWar(this.id, o)) targets.push(...regs.sort((a, b) => g.garrisonStrength(b) - g.garrisonStrength(a)).slice(0, 2));
    for (const grp of groups) {
      const pos = grp.carrier >= 0 ? g.fleets.get(grp.carrier) : g.center(grp.base);
      if (!pos) continue;
      const t = targets.find(r => Math.hypot(g.map.regions[r].cx - pos.x, g.map.regions[r].cy - pos.y) < 33);
      if (t !== undefined) this.cmd({ c: 'airStrike', base: grp.base, carrier: grp.carrier >= 0 ? grp.carrier : undefined, target: t });
    }
  }

  // ---------------- nukes ----------------
  private enemyHasStrategic() {
    const g = this.g;
    return g.nations.some(o => o.id !== this.id && o.alive && !g.allied(this.id, o.id) && (o.weapons.atom + o.weapons.hbomb + o.weapons.mirv > 0 || g.nationBuildings(o.id, 'silo').length > 0));
  }
  private wasNuked() { return this.g.events.some(e => e.kind === 'nuke' && e.b === this.id); }

  private strategic(v: View) {
    const g = this.g, me = this.me, p = this.p;
    const stock = (Object.keys(WEAPONS) as Weapon[]).filter(w => me.weapons[w] > 0);
    if (!stock.length || g.time - this.lastNuke < 30) return;
    const enemies = g.nations.filter(o => o.alive && g.atWar(this.id, o.id));
    if (!enemies.length) return;
    const desperate = me.area < this.peakArea * 0.65 || (me.capital >= 0 && g.battles.has(me.capital));
    const drive = p.nukes * (desperate ? 1.6 : 0.6) * (this.wasNuked() ? 2 : 1) * (g.cfg.difficulty === 'easy' ? 0.3 : 1);
    if (g.rng.next() > drive * 0.5) return;
    const w = stock.sort((a, b) => WEAPONS[b].radius - WEAPONS[a].radius)[0];
    const rad = WEAPONS[w].radius;
    let best = -1, bs = 0;
    const mine = v.own.map(r => g.map.regions[r]);
    for (const e of enemies) for (let r = 0; r < g.owner.length; r++) {
      if (g.owner[r] !== e.id) continue;
      const R = g.map.regions[r];
      if (mine.some(m => Math.hypot(m.cx - R.cx, m.cy - R.cy) < rad * 1.4 + 2)) continue;
      const s = g.garrisonStrength(r) + g.cityLevel(r) * 150 + (e.capital === r ? 300 : 0) + g.buildings[r].length * 40;
      if (s > bs) { bs = s; best = r; }
    }
    if (best >= 0 && bs > 150) { const res = this.cmd({ c: 'launch', weapon: w, target: best }); if (res.ok) this.lastNuke = g.time; }
  }

  // ---------------- diplomacy ----------------
  private respond(v: View) {
    const g = this.g, p = this.p;
    for (const req of g.requests.filter(r => r.to === this.id)) {
      if (g.rng.chance(0.3)) continue; // take a moment to think
      const from = req.from, op = opinion(g, this.id, from);
      const commonEnemy = g.nations.some(o => o.alive && g.atWar(this.id, o.id) && g.atWar(from, o.id));
      const fromPower = g.nations[from].soldiers + g.nations[from].tanks * 5;
      let s = op / 25 + this.noise(1.5);
      switch (req.type) {
        case 'alliance': s += -this.allyCount() * 0.9 + p.diplomacy * 1.5 + (commonEnemy ? 1.2 : 0) - (from === this.target ? 2 : 0) - (g.share(from) > 0.3 ? 1.5 : 0) + (fromPower > v.power ? 0.4 : 0) - 0.9; break;
        case 'nap': s += p.diplomacy + (g.atWar(this.id, from) && v.power < fromPower ? 1.2 : 0) - p.aggression * 0.8 - (from === this.target ? 1 : 0); break;
        case 'transit': s += g.allied(this.id, from) ? 2 : p.diplomacy * 0.6 - 0.8; break;
        case 'help': s += p.loyalty * 2 + (v.available > 200 ? 0.5 : -0.5) - 0.6; break;
      }
      this.cmd({ c: 'respond', request: req.id, accept: s > 0 });
    }
  }

  private diplomacy(v: View) {
    const g = this.g, p = this.p, me = this.me;
    const neighbors = [...v.enemyFront.keys()].filter(o => g.nations[o].alive);
    const allies = g.nations.filter(o => o.alive && o.id !== this.id && g.allied(this.id, o.id) && !g.teammates(this.id, o.id));
    // seek friends: nations sharing our enemy, or a strong neighbour we'd rather not fight
    if (allies.length < Math.round(p.diplomacy * 2.2) && g.rng.chance(p.diplomacy * 0.7)) {
      const cands = g.nations.filter(o => o.alive && o.id !== this.id && !g.allied(this.id, o.id) && !g.atWar(this.id, o.id) && o.id !== this.target);
      cands.sort((a, b) => this.allyScore(b) - this.allyScore(a));
      const c = cands[0];
      if (c && this.allyScore(c) > 0) this.cmd({ c: 'propose', to: c.id, type: g.rng.chance(0.6) ? 'alliance' : 'nap' });
    }
    // secure the back: NAP with a strong neighbour that's not our target
    if (this.target >= 0 && g.rng.chance(0.3 + p.diplomacy * 0.4)) {
      const strong = neighbors.filter(o => o !== this.target && !g.atWar(this.id, o) && g.relOf(this.id, o) === REL.peace).sort((a, b) => g.nations[b].soldiers - g.nations[a].soldiers)[0];
      if (strong !== undefined) this.cmd({ c: 'propose', to: strong, type: 'nap' });
    }
    // rally allies onto our enemy
    if (this.target >= 0 && g.atWar(this.id, this.target) && g.jointTarget[this.id] !== this.target) this.cmd({ c: 'jointTarget', target: this.target });
    // merchants and loyal friends bankroll allies in trouble
    for (const a of allies) {
      if ((a.gold < 150 || a.starving) && me.gold > 1200 && g.rng.chance(p.loyalty * 0.5 + p.greed * 0.2)) { this.cmd({ c: 'sendGold', to: a.id, amount: me.gold * 0.15 }); break; }
    }
    // nobody wants to be allied to someone about to win
    for (const a of allies) if (g.share(a.id) > 0.3 && g.share(a.id) > g.share(this.id) * 3 && g.rng.chance(0.3 + (1 - p.loyalty) * 0.4)) { this.cmd({ c: 'cancelTreaty', to: a.id }); break; }
    // opportunists stab weak allies when they run out of room
    if (p.loyalty < 0.45 && v.frontier.length === 0) {
      const weak = allies.filter(a => v.enemyFront.has(a.id) && a.soldiers < v.available * 0.4)[0];
      if (weak && g.rng.chance(0.35)) { this.cmd({ c: 'cancelTreaty', to: weak.id }); this.target = weak.id; this.targetSince = g.time; }
    }
    // end stale wars we can't win
    for (const o of g.nations) if (o.alive && g.atWar(this.id, o.id) && o.id !== this.target && g.rng.chance(0.2 + p.diplomacy * 0.3)) this.cmd({ c: 'propose', to: o.id, type: 'nap' });
  }

  private allyCount() { const g = this.g; return g.nations.filter(o => o.alive && o.id !== this.id && g.allied(this.id, o.id) && !g.teammates(this.id, o.id)).length; }

  private allyScore(o: { id: number; soldiers: number }) {
    const g = this.g;
    const common = g.nations.some(x => x.alive && g.atWar(this.id, x.id) && g.atWar(o.id, x.id)) ? 1.5 : 0;
    return opinion(g, this.id, o.id) / 30 + common + this.p.diplomacy - 0.6 - (g.share(o.id) > 0.3 ? 2 : 0) + this.noise(1);
  }
}
