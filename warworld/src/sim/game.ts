// Authoritative game simulation. Pure TypeScript with no DOM access, so the same engine runs
// in the browser (single player) and later inside a Cloudflare Durable Object (online rooms).
import { AIR, BUILDINGS, BuildingType, Cost, DT, ECON, FOUNDING_SECONDS, LAND, levelCost, levelTime, Res, SEA, TICK_RATE, UnitDef, VICTORY_SHARE, Weapon, WEAPONS } from './balance';
import { buildMap, MapData, regionDistance } from './map/regions';
import { isLand } from './map/terrain';
import { nationColors, nationNames } from './names';
import { Rng } from './rng';
import {
  AirGroup, Army, Battle, Building, Command, CommandResult, DiploRequest, Fleet, Fx, GameConfig, GameEvent, Missile,
  Nation, Operation, REL, Sortie, emptyAir, airTotal,
} from './state';
import { rollPersonality } from './ai/personality';
import { economyTick } from './economy';
import { militaryTick, cmdAttack, cmdMove, cmdReinforce, cmdWithdraw, cmdSupport, cmdFleetMove, cmdFleetReturn, transferRegion } from './military';
import { airTick, cmdAirStrike, cmdRebase, cmdLaunch } from './air';
import { diplomacyTick, cmdPropose, cmdRespond, cmdCancelTreaty, cmdDeclareWar, cmdSendGold, cmdJointTarget } from './diplomacy';
import { Bot } from './ai/bot';

export type Phase = 'founding' | 'war' | 'over';

export class Game {
  readonly cfg: GameConfig;
  readonly map: MapData;
  readonly rng: Rng;
  tick = 0;
  phase: Phase = 'founding';
  foundingLeft = FOUNDING_SECONDS;
  nations: Nation[] = [];
  owner: Int16Array;
  inf: Float64Array; tank: Float64Array; art: Float64Array;
  neutral: Float32Array;
  radiation: Float32Array;
  buildings: Building[][];
  airSupport: Float32Array;  // seconds of air support remaining over a region (for its attackers)
  armies = new Map<number, Army>();
  fleets = new Map<number, Fleet>();
  airGroups = new Map<number, AirGroup>();
  sorties = new Map<number, Sortie>();
  missiles = new Map<number, Missile>();
  battles = new Map<number, Battle>();
  ops = new Map<number, Operation>();
  rel: Uint8Array; relTimer: Float32Array; transit: Uint8Array;
  breaking: { a: number; b: number; t: number; kind: 'ally' | 'nap' }[] = [];
  requests: DiploRequest[] = [];
  jointTarget: Int16Array;
  opinion: Float32Array;
  events: GameEvent[] = [];
  fx: Fx[] = [];
  winner = -1; winnerTeam = -1;
  bots: Bot[] = [];
  private nextId = 1;
  dirtyRegions = new Set<number>();
  history: { t: number; areas: number[] }[] = [];
  ownerHistory: Int16Array[] = [];
  contSize: number[] = [];
  counters = { neutralCaptures: 0, conquests: 0, attacks: 0 };

  constructor(cfg: GameConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed ^ 0xa5a5);
    this.map = buildMap({ kind: cfg.mapKind, seed: cfg.seed, preset: cfg.preset ?? null });
    const R = this.map.regions.length;
    this.owner = new Int16Array(R).fill(-1);
    this.inf = new Float64Array(R); this.tank = new Float64Array(R); this.art = new Float64Array(R);
    this.neutral = new Float32Array(R); this.radiation = new Float32Array(R); this.airSupport = new Float32Array(R);
    this.buildings = Array.from({ length: R }, () => []);
    for (const r of this.map.regions) { this.neutral[r.id] = this.neutralBase(r.id); this.contSize[r.continent] = (this.contSize[r.continent] ?? 0) + 1; }

    const total = cfg.humans.length + cfg.bots;
    const names = nationNames(this.rng, total), colors = nationColors(this.rng, total);
    const teams = cfg.mode === 'teams' ? Math.max(2, cfg.teams ?? 2) : 0;
    for (let i = 0; i < total; i++) {
      const human = i < cfg.humans.length;
      this.nations.push({
        id: i, name: human ? cfg.humans[i].name : names[i], color: colors[i], bot: !human, human,
        personality: human ? null : rollPersonality(this.rng, i),
        alive: true, capital: -1, team: teams ? i % teams : i, founded: false,
        gold: ECON.startGold, food: ECON.startFood, wood: ECON.startWood, steel: ECON.startSteel, pop: ECON.startPop, wounded: 0,
        weapons: { atom: 0, hbomb: 0, mirv: 0 },
        housing: 0, jobs: 0, labor: 0, fill: 1, capacity: 0,
        income: { gold: 0, food: 0, wood: 0, steel: 0, pop: 0 },
        area: 0, regionCount: 0, soldiers: 0, tanks: 0, arts: 0, starving: false, bankrupt: false,
        stats: { captured: 0, lost: 0, kills: 0, deaths: 0, nukes: 0, peakArea: 0, built: 0 },
        autoRecruit: true,
      });
    }
    const N = total;
    this.rel = new Uint8Array(N * N); this.relTimer = new Float32Array(N * N); this.transit = new Uint8Array(N * N);
    this.jointTarget = new Int16Array(N).fill(-1);
    this.opinion = new Float32Array(N * N);
    if (teams) for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) if (a !== b && this.nations[a].team === this.nations[b].team) this.rel[a * N + b] = REL.ally;
    for (const n of this.nations) if (n.bot) this.bots.push(new Bot(this, n.id));
  }

  get time() { return this.tick / TICK_RATE; }
  id() { return this.nextId++; }

  // ---------- relations ----------
  relOf(a: number, b: number) { return a === b ? REL.ally : this.rel[a * this.nations.length + b]; }
  setRel(a: number, b: number, v: number) { const N = this.nations.length; this.rel[a * N + b] = v; this.rel[b * N + a] = v; }
  teammates(a: number, b: number) { return this.cfg.mode === 'teams' && this.nations[a].team === this.nations[b].team; }
  allied(a: number, b: number) { return a === b || this.relOf(a, b) === REL.ally; }
  atWar(a: number, b: number) { return a !== b && a >= 0 && b >= 0 && this.relOf(a, b) === REL.war; }
  canTransit(a: number, b: number) { return this.allied(a, b) || this.transit[a * this.nations.length + b] === 1; }
  /** Region can be walked through by `who` without fighting. */
  canPass(who: number, region: number) { const o = this.owner[region]; return o >= 0 && (o === who || this.canTransit(who, o)); }
  /** Region may be attacked by `who` (neutral, or a nation without a protective treaty). */
  canAttack(who: number, region: number) {
    const o = this.owner[region];
    if (o === -1) return true;
    if (o === who || this.teammates(who, o)) return false;
    const r = this.relOf(who, o);
    return r === REL.war || r === REL.peace;
  }

  // ---------- geometry & paths ----------
  edgeLen(a: number, b: number) {
    const ra = this.map.regions[a], rb = this.map.regions[b];
    return regionDistance(this.map, a, b) * (ra.moveCost + rb.moveCost) / 2 * (rb.straits.includes(a) ? 1.6 : 1);
  }
  center(r: number) { const R = this.map.regions[r]; return { x: R.cx, y: R.cy }; }

  /** Dijkstra over land regions; intermediate nodes must satisfy `through`, the goal may be anything. */
  landPath(from: number, to: number, through: (r: number) => boolean, maxCost = Infinity): number[] | null {
    if (from === to) return [from];
    const dist = new Map<number, number>([[from, 0]]), prev = new Map<number, number>();
    const open: [number, number][] = [[0, from]];
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [d, r] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (d > (dist.get(r) ?? Infinity)) continue;
      if (r === to) break;
      if (r !== from && !through(r)) continue;
      for (const n of this.map.regions[r].neighbors) {
        const nd = d + this.edgeLen(r, n);
        if (nd > maxCost || nd >= (dist.get(n) ?? Infinity)) continue;
        if (n !== to && !through(n)) continue;
        dist.set(n, nd); prev.set(n, r); open.push([nd, n]);
      }
    }
    if (!prev.has(to)) return null;
    const path = [to]; let c = to;
    while (c !== from) { c = prev.get(c)!; path.push(c); }
    return path.reverse();
  }

  seaPath(from: number, to: number): number[] | null {
    if (from === to) return [from];
    const prev = new Map<number, number>([[from, -1]]), q = [from];
    for (let i = 0; i < q.length; i++) {
      const s = q[i];
      for (const n of this.map.seas[s].neighbors) if (!prev.has(n)) { prev.set(n, s); if (n === to) { q.length = 0; break; } q.push(n); }
    }
    if (!prev.has(to)) return null;
    const p = [to]; let c = to;
    while ((c = prev.get(c)!) !== -1) p.push(c);
    return p.reverse();
  }

  // ---------- buildings ----------
  building(r: number, type: BuildingType): Building | undefined { return this.buildings[r].find(b => b.type === type); }
  level(r: number, type: BuildingType) { const b = this.building(r, type); return b ? b.level : 0; }
  cityLevel(r: number) { return Math.max(this.level(r, 'city'), this.level(r, 'capital')); }
  private nbCache = new Map<string, number[]>(); private nbTick = -1;
  nationBuildings(n: number, type: BuildingType, minLevel = 1): number[] {
    if (this.nbTick !== this.tick) { this.nbCache.clear(); this.nbTick = this.tick; }
    const key = n + ':' + type + ':' + minLevel;
    const hit = this.nbCache.get(key);
    if (hit) return hit.slice();
    const out: number[] = [];
    for (let r = 0; r < this.owner.length; r++) if (this.owner[r] === n && this.buildings[r].length && this.level(r, type) >= minLevel) out.push(r);
    this.nbCache.set(key, out);
    return out.slice();
  }
  invalidateBuildings() { this.nbTick = -1; }

  /** Per-tick index of stationed allied armies and armies marching into each region. */
  stationed = new Map<number, Army[]>();
  incoming = new Map<number, Army[]>();
  indexArmies() {
    this.stationed.clear(); this.incoming.clear();
    for (const a of this.armies.values()) {
      if (a.state === 'stationed') { const r = a.path[a.idx]; const l = this.stationed.get(r); if (l) l.push(a); else this.stationed.set(r, [a]); }
      else if (a.state === 'march' && a.kind === 'attack') { const r = a.path[Math.min(a.idx + 1, a.path.length - 1)]; const l = this.incoming.get(r); if (l) l.push(a); else this.incoming.set(r, [a]); }
    }
  }

  neutralBase(r: number) { const R = this.map.regions[r]; return R.area * 1.6 * R.defense; }

  // ---------- resources ----------
  canAfford(n: Nation, c: Cost, k = 1) { return (Object.keys(c) as Res[]).every(r => n[r] >= (c[r] ?? 0) * k); }
  pay(n: Nation, c: Cost, k = 1) { for (const r of Object.keys(c) as Res[]) n[r] -= (c[r] ?? 0) * k; }
  maxAfford(n: Nation, c: Cost) { let m = Infinity; for (const r of Object.keys(c) as Res[]) if (c[r]) m = Math.min(m, Math.floor(n[r] / c[r]!)); return m; }

  log(kind: string, text: string, a = -1, b = -1, region = -1, important = false) {
    this.events.push({ t: this.time, kind, text, a, b, region, important });
    if (this.events.length > 400) this.events.splice(0, 100);
  }
  markDirty(r: number) { this.dirtyRegions.add(r); this.nbTick = -1; }

  // ---------- founding ----------
  foundMinDistance() { return Math.sqrt(this.map.landArea / this.nations.length) * 0.55; }

  canFound(n: number, region: number): string | null {
    const R = this.map.regions[region];
    if (!R) return 'منطقة غير صالحة';
    if (this.owner[region] !== -1) return 'هذه المنطقة محجوزة';
    const min = this.foundMinDistance();
    for (const o of this.nations) if (o.id !== n && o.capital >= 0 && regionDistance(this.map, o.capital, region) < min) return 'قريبة جدًا من دولة أخرى';
    if (this.contSize[R.continent] < 4) return 'الجزيرة صغيرة جدًا';
    return null;
  }

  found(n: number, region: number) {
    const nat = this.nations[n];
    // re-founding during the countdown moves the nation
    if (nat.founded) for (let r = 0; r < this.owner.length; r++) if (this.owner[r] === n) { this.owner[r] = -1; this.inf[r] = 0; this.buildings[r] = []; this.markDirty(r); }
    const want = 3 + (this.rng.int(3));
    const start = [region], seen = new Set([region]);
    // grow over land first, then across short straits if the site is a small island
    for (const allowStraits of [false, true]) {
      for (let i = 0; i < start.length && start.length < want + 1; i++) {
        const R = this.map.regions[start[i]];
        const ns = R.neighbors.filter(x => allowStraits || !R.straits.includes(x))
          .sort((a, b) => regionDistance(this.map, region, a) - regionDistance(this.map, region, b));
        for (const x of ns) if (!seen.has(x) && this.owner[x] === -1 && start.length < want + 1) { seen.add(x); start.push(x); }
      }
    }
    for (const r of start) { this.owner[r] = n; this.inf[r] = r === region ? ECON.startInf * 0.7 : ECON.startInf * 0.3 / Math.max(1, start.length - 1); this.markDirty(r); }
    this.buildings[region] = [{ type: 'capital', level: 1, build: 0, damage: 0, queue: [] }];
    nat.capital = region; nat.founded = true;
  }

  /** Spread-out, good-quality spawn for bots and late humans. */
  autoFoundSite(n: number): number {
    const regions = this.map.regions;
    let best = -1, bestScore = -Infinity;
    const caps = this.nations.filter(o => o.capital >= 0 && o.id !== n).map(o => o.capital);
    for (let k = 0; k < 260; k++) {
      const r = this.rng.int(regions.length);
      if (this.canFound(n, r)) continue;
      const R = regions[r];
      const q = R.flatShare + R.forestShare * 0.7 + R.hillShare * 0.4 + (R.coastal ? 0.25 : 0);
      let near = Infinity; for (const c of caps) near = Math.min(near, regionDistance(this.map, c, r));
      // room to grow: free regions within two hops
      let free = 0;
      for (const m of R.neighbors) { if (this.owner[m] === -1) free++; for (const k of regions[m].neighbors) if (this.owner[k] === -1) free += 0.25; }
      const cont = this.contSize[R.continent];
      const score = Math.min(near, 60) * (0.6 + q) * (cont < 15 ? 0.4 : 1) * Math.min(1, free / 6) + this.rng.next() * 4;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    if (best < 0) for (let r = 0; r < regions.length; r++) if (this.owner[r] === -1) { best = r; break; }
    return best;
  }

  private endFounding() {
    for (const n of this.nations) if (!n.founded) { const r = this.autoFoundSite(n.id); if (r >= 0) this.found(n.id, r); }
    this.phase = 'war';
    this.log('start', 'بدأت الحرب! توسّع واحتل العالم', -1, -1, -1, true);
  }

  // ---------- main loop ----------
  step() {
    if (this.phase === 'over') return;
    if (this.phase === 'founding') {
      this.foundingLeft -= DT;
      for (const b of this.bots) b.foundingThink();
      this.tick++;
      if (this.foundingLeft <= 0) this.endFounding();
      return;
    }
    this.tick++;
    if (this.tick % 5 === 0) economyTick(this, DT * 5);
    militaryTick(this, DT);
    airTick(this, DT);
    if (this.tick % 5 === 0) diplomacyTick(this, DT * 5);
    for (const b of this.bots) b.tick();
    if (this.tick % TICK_RATE === 0) this.checkVictory();
  }

  checkVictory() {
    const land = this.map.landArea;
    for (const n of this.nations) {
      if (n.alive && n.founded && n.regionCount === 0 && this.phase === 'war') {
        n.alive = false;
        this.log('elim', `سقطت ${n.name}`, n.id, -1, -1, true);
        for (const a of this.armies.values()) if (a.owner === n.id) this.armies.delete(a.id);
        for (const f of this.fleets.values()) if (f.owner === n.id) this.fleets.delete(f.id);
        for (const g of this.airGroups.values()) if (g.owner === n.id) this.airGroups.delete(g.id);
      }
    }
    if (this.tick % (TICK_RATE * 10) === 0) {
      this.history.push({ t: this.time, areas: this.nations.map(n => n.area) });
      this.ownerHistory.push(this.owner.slice());
    }
    if (this.cfg.mode === 'teams') {
      const byTeam = new Map<number, number>();
      for (const n of this.nations) byTeam.set(n.team, (byTeam.get(n.team) ?? 0) + n.area);
      for (const [t, a] of byTeam) if (a / land >= VICTORY_SHARE) { this.winnerTeam = t; this.winner = this.nations.filter(n => n.team === t).sort((a, b) => b.area - a.area)[0].id; break; }
    } else {
      for (const n of this.nations) if (n.area / land >= VICTORY_SHARE) { this.winner = n.id; break; }
    }
    const alive = this.nations.filter(n => n.alive);
    if (this.winner < 0 && alive.length === 1 && this.nations.length > 1) this.winner = alive[0].id;
    if (this.winner >= 0) {
      this.phase = 'over';
      this.log('win', `انتصرت ${this.nations[this.winner].name}!`, this.winner, -1, -1, true);
    }
  }

  share(n: number) { return this.nations[n].area / this.map.landArea; }

  // ---------- commands ----------
  command(n: number, cmd: Command): CommandResult {
    const nat = this.nations[n];
    if (!nat) return { ok: false, error: 'دولة غير موجودة' };
    if (cmd.c === 'found') {
      if (this.phase !== 'founding') return { ok: false, error: 'انتهى وقت التأسيس' };
      const err = this.canFound(n, cmd.region);
      if (err) return { ok: false, error: err };
      this.found(n, cmd.region);
      return { ok: true };
    }
    if (this.phase !== 'war') return { ok: false, error: this.phase === 'founding' ? 'انتظر انتهاء التأسيس' : 'انتهت المباراة' };
    if (!nat.alive) return { ok: false, error: 'دولتك سقطت' };
    switch (cmd.c) {
      case 'attack': return cmdAttack(this, n, cmd);
      case 'move': return cmdMove(this, n, cmd);
      case 'reinforce': return cmdReinforce(this, n, cmd.amount);
      case 'withdraw': return cmdWithdraw(this, n, cmd.region);
      case 'build': return this.cmdBuild(n, cmd.region, cmd.type);
      case 'upgrade': return this.cmdUpgrade(n, cmd.region, cmd.type);
      case 'demolish': return this.cmdDemolish(n, cmd.region, cmd.type);
      case 'produce': return this.cmdProduce(n, cmd.region, cmd.unit, cmd.n);
      case 'recruit': return this.cmdRecruit(n, cmd.n);
      case 'autoRecruit': nat.autoRecruit = cmd.on; return { ok: true };
      case 'fleetMove': return cmdFleetMove(this, n, cmd.fleet, cmd.sea);
      case 'fleetReturn': return cmdFleetReturn(this, n, cmd.fleet);
      case 'airStrike': return cmdAirStrike(this, n, cmd);
      case 'rebase': return cmdRebase(this, n, cmd);
      case 'launch': return cmdLaunch(this, n, cmd.weapon, cmd.target);
      case 'propose': return cmdPropose(this, n, cmd.to, cmd.type, cmd.region ?? -1);
      case 'respond': return cmdRespond(this, n, cmd.request, cmd.accept);
      case 'cancelTreaty': return cmdCancelTreaty(this, n, cmd.to);
      case 'declareWar': return cmdDeclareWar(this, n, cmd.to);
      case 'sendGold': return cmdSendGold(this, n, cmd.to, cmd.amount);
      case 'giftTroops': return cmdSupport(this, n, cmd.to, cmd.amount, cmd.region ?? -1, 'gift');
      case 'support': return cmdSupport(this, n, cmd.to, cmd.amount, cmd.region ?? -1, 'support');
      case 'jointTarget': return cmdJointTarget(this, n, cmd.target);
    }
    return { ok: false, error: 'أمر غير معروف' };
  }

  buildError(n: number, region: number, type: BuildingType): string | null {
    const R = this.map.regions[region];
    if (!R || this.owner[region] !== n) return 'المنطقة ليست لك';
    const def = BUILDINGS[type];
    if (type === 'capital') return 'لا يمكن بناء عاصمة ثانية';
    if (this.building(region, type)) return 'المبنى موجود بالفعل — رقّه';
    if (this.buildings[region].length >= R.slots) return `المنطقة ممتلئة (${R.slots} مبانٍ)`;
    if (def.canBuild && !def.canBuild(R)) return def.hint ?? 'غير مناسب هنا';
    if (def.needs && !this.cityLevel(region)) return def.hint ?? 'يحتاج مدينة';
    if (type === 'city') {
      // cities must be spread out: none within two regions of another city or the capital
      const near = new Set([region]);
      for (const a of R.neighbors) { near.add(a); for (const b of this.map.regions[a].neighbors) near.add(b); }
      for (const r of near) if (this.owner[r] === n && (this.building(r, 'city') || this.building(r, 'capital'))) return 'قريبة جدًا من مدينة أخرى — ابنِ أبعد';
    }
    if (this.battles.has(region)) return 'المنطقة تحت القتال';
    return null;
  }

  /** Founding a new city gets more expensive with every city the nation already has (up to 6×). */
  buildCost(n: number, type: BuildingType): Cost {
    const base = levelCost(type, 0);
    if (type !== 'city') return base;
    let cities = 0;
    for (let r = 0; r < this.owner.length; r++) if (this.owner[r] === n && this.building(r, 'city')) cities++;
    const k = Math.min(6, 1 + cities);
    return Object.fromEntries(Object.entries(base).map(([r, v]) => [r, Math.round((v as number) * k)])) as Cost;
  }

  cmdBuild(n: number, region: number, type: BuildingType): CommandResult {
    const err = this.buildError(n, region, type); if (err) return { ok: false, error: err };
    const nat = this.nations[n], def = BUILDINGS[type];
    const cost = this.buildCost(n, type);
    if (!this.canAfford(nat, cost)) return { ok: false, error: 'الموارد لا تكفي' };
    this.pay(nat, cost);
    this.buildings[region].push({ type, level: 0, build: levelTime(type, 0), damage: 0, queue: [] });
    this.nbTick = -1;
    nat.stats.built++;
    this.markDirty(region);
    return { ok: true };
  }

  cmdUpgrade(n: number, region: number, type: BuildingType): CommandResult {
    if (this.owner[region] !== n) return { ok: false, error: 'المنطقة ليست لك' };
    const b = this.building(region, type);
    if (!b) return { ok: false, error: 'لا يوجد مبنى' };
    const def = BUILDINGS[type];
    if (b.build > 0) return { ok: false, error: 'قيد البناء' };
    if (b.level >= def.maxLevel) return { ok: false, error: 'أعلى مستوى' };
    const cost = levelCost(type, b.level);
    const nat = this.nations[n];
    if (!this.canAfford(nat, cost)) return { ok: false, error: 'الموارد لا تكفي' };
    this.pay(nat, cost);
    b.build = levelTime(type, b.level);
    return { ok: true };
  }

  cmdDemolish(n: number, region: number, type: BuildingType): CommandResult {
    if (this.owner[region] !== n || type === 'capital') return { ok: false, error: 'غير مسموح' };
    const i = this.buildings[region].findIndex(b => b.type === type);
    if (i < 0) return { ok: false, error: 'لا يوجد مبنى' };
    this.buildings[region].splice(i, 1);
    this.markDirty(region);
    return { ok: true };
  }

  unitDef(u: string): UnitDef | null { return (LAND as any)[u] ?? (SEA as any)[u] ?? (AIR as any)[u] ?? null; }

  produceError(n: number, region: number, unit: string): string | null {
    if (this.owner[region] !== n) return 'المنطقة ليست لك';
    const w = (WEAPONS as any)[unit];
    if (w) {
      const silo = this.building(region, 'silo');
      if (!silo || silo.level < w.siloLevel) return w.siloLevel > 1 ? 'يحتاج منصة صواريخ مستوى 2' : 'يحتاج منصة صواريخ';
      const nuc = Math.max(0, ...this.nationBuildings(n, 'nuclear').map(r => this.level(r, 'nuclear')));
      if (nuc < w.nuclearLevel) return nuc ? 'يحتاج مفاعلًا نوويًا مستوى 2' : 'يحتاج مفاعلًا نوويًا';
      return null;
    }
    const def = this.unitDef(unit);
    if (!def) return 'وحدة غير معروفة';
    const b = this.building(region, def.at);
    if (!b || b.level < 1) return `يحتاج ${BUILDINGS[def.at].name}`;
    if (b.level < (def.minLevel ?? 1)) return `يحتاج ${BUILDINGS[def.at].name} مستوى ${def.minLevel}`;
    if (def.at === 'airbase') {
      const here = [...this.airGroups.values()].filter(g => g.base === region && g.carrier < 0).reduce((s, g) => s + airTotal(g.planes), 0);
      const queued = b.queue.reduce((s, q) => s + q.left, 0);
      if (here + queued >= b.level * 12) return 'القاعدة ممتلئة — رقّها أو انقل الطائرات';
    }
    return null;
  }

  cmdProduce(n: number, region: number, unit: string, count: number): CommandResult {
    const err = this.produceError(n, region, unit); if (err) return { ok: false, error: err };
    const nat = this.nations[n];
    const w = (WEAPONS as any)[unit];
    const def = w ?? this.unitDef(unit)!;
    const k = Math.min(Math.max(1, Math.floor(count)), this.maxAfford(nat, def.cost));
    if (k < 1) return { ok: false, error: 'الموارد لا تكفي' };
    this.pay(nat, def.cost, k);
    const b = w ? this.building(region, 'silo')! : this.building(region, def.at)!;
    const last = b.queue[b.queue.length - 1];
    if (last && last.unit === unit) last.left += k; else b.queue.push({ unit: unit as any, left: k, t: def.time });
    return { ok: true, info: `تم طلب ${k}` };
  }

  cmdRecruit(n: number, count: number): CommandResult {
    const barracks = this.nationBuildings(n, 'barracks');
    if (!barracks.length) return { ok: false, error: 'تحتاج ثكنة لتجنيد يدوي' };
    const nat = this.nations[n];
    const k = Math.min(Math.floor(count), this.maxAfford(nat, LAND.inf.cost), Math.floor(nat.pop - 300));
    if (k < 1) return { ok: false, error: nat.pop < 400 ? 'لا يوجد سكان كافون' : 'الموارد لا تكفي' };
    this.pay(nat, LAND.inf.cost, k);
    // split across barracks proportional to level
    const tot = barracks.reduce((s, r) => s + this.level(r, 'barracks'), 0);
    let left = k;
    barracks.forEach((r, i) => {
      const share = i === barracks.length - 1 ? left : Math.floor(k * this.level(r, 'barracks') / tot);
      left -= share;
      if (share > 0) { const b = this.building(r, 'barracks')!; const last = b.queue[b.queue.length - 1]; if (last && last.unit === 'inf') last.left += share; else b.queue.push({ unit: 'inf', left: share, t: LAND.inf.time }); }
    });
    return { ok: true, info: `جاري تجنيد ${k}` };
  }

  // ---------- spawning helpers used by economy ----------
  dockedFleet(n: number, port: number): Fleet {
    for (const f of this.fleets.values()) if (f.owner === n && f.port === port && f.order === 'idle') return f;
    const sea = this.map.regions[port].seas[0];
    const S = this.map.seas[sea];
    const f: Fleet = {
      id: this.id(), owner: n, ships: { transport: 0, patrol: 0, destroyer: 0, sub: 0, carrier: 0 }, dmg: 0,
      sea, path: [], prog: 0, x: (S.cx + this.map.regions[port].cx * 2) / 3, y: (S.cy + this.map.regions[port].cy * 2) / 3,
      port, home: port, cargo: [], planes: emptyAir(), order: 'idle', invadeTarget: -1, op: -1, combat: 99,
    };
    this.fleets.set(f.id, f);
    return f;
  }

  airGroupAt(n: number, base: number, carrier: number): AirGroup {
    for (const g of this.airGroups.values()) if (g.owner === n && g.base === base && g.carrier === carrier) return g;
    const g: AirGroup = { id: this.id(), owner: n, planes: emptyAir(), base, carrier };
    this.airGroups.set(g.id, g);
    return g;
  }

  transferRegion(r: number, to: number) { transferRegion(this, r, to); }

  /** Total defensive land strength sitting in a region (garrison + stationed allies). */
  garrisonStrength(r: number) {
    let s = this.inf[r] * LAND.inf.def + this.tank[r] * LAND.tank.def + this.art[r] * LAND.art.def;
    const st = this.stationed.get(r);
    if (st) for (const a of st) if (a.state === 'stationed') s += a.inf + a.tank * LAND.tank.def + a.art * LAND.art.def;
    return s;
  }

  isLandTile(i: number) { return isLand(this.map.terrain[i]); }
  weaponDef(w: Weapon) { return WEAPONS[w]; }
}
