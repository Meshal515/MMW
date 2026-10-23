import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { FOUNDING_SECONDS, TICK_RATE } from '../src/sim/balance';
import { regionDistance } from '../src/sim/map/regions';
import { REL } from '../src/sim/state';
import type { GameConfig } from '../src/sim/state';

const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({ mapKind: 'earth', seed: 7, humans: [{ name: 'A' }], bots: 0, difficulty: 'medium', mode: 'ffa', ...over });
const run = (g: Game, secs: number) => { for (let i = 0; i < secs * TICK_RATE; i++) g.step(); };
const toWar = (g: Game) => { while (g.phase === 'founding') g.step(); };
const myTroops = (g: Game, n: number) => {
  let s = 0;
  for (let r = 0; r < g.owner.length; r++) if (g.owner[r] === n) s += g.inf[r];
  for (const a of g.armies.values()) if (a.owner === n) s += a.inf;
  return s;
};
/** A land region far from everyone, suitable for founding. */
const site = (g: Game, n: number, x: number, y: number) => {
  let best = -1, bd = Infinity;
  for (const R of g.map.regions) { const d = Math.hypot(R.cx - x, R.cy - y); if (d < bd && !g.canFound(n, R.id)) { bd = d; best = R.id; } }
  return best;
};
const neutralNeighbour = (g: Game, n: number) => {
  for (let r = 0; r < g.owner.length; r++) if (g.owner[r] === n) for (const m of g.map.regions[r].neighbors) if (g.owner[m] === -1 && !g.map.regions[r].straits.includes(m)) return m;
  return -1;
};

describe('founding (first 10 seconds)', () => {
  it('lets the player pick a site, gives 3-5 connected regions and then starts the war for everyone', () => {
    const g = new Game(cfg({ bots: 20 }));
    expect(g.phase).toBe('founding');
    const r = site(g, 0, 230, 45);
    expect(g.command(0, { c: 'found', region: r }).ok).toBe(true);
    const mine = [...g.owner].filter(o => o === 0).length;
    expect(mine).toBeGreaterThanOrEqual(4);
    expect(mine).toBeLessThanOrEqual(6);
    expect(g.nations[0].capital).toBe(r);
    run(g, FOUNDING_SECONDS + 0.5);
    expect(g.phase).toBe('war');
    expect(g.nations.every(n => n.founded && n.capital >= 0)).toBe(true);
  });

  it('never lets starting nations overlap or crowd each other', () => {
    const g = new Game(cfg({ bots: 49 }));
    toWar(g);
    const caps = g.nations.map(n => n.capital);
    expect(new Set(caps).size).toBe(50);
    const min = g.foundMinDistance();
    let violations = 0;
    for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) if (regionDistance(g.map, caps[i], caps[j]) < min) violations++;
    expect(violations).toBe(0);
    // a taken region cannot be founded on
    expect(g.canFound(0, caps[1])).not.toBeNull();
  });

  it('rejects founding next to another capital and auto-assigns players who did not choose', () => {
    const g = new Game(cfg({ humans: [{ name: 'A' }, { name: 'B' }] }));
    const r = site(g, 0, 230, 45);
    g.command(0, { c: 'found', region: r });
    const close = g.map.regions[r].neighbors.find(m => g.owner[m] === -1)!;
    expect(g.command(1, { c: 'found', region: close }).ok).toBe(false);
    toWar(g);
    expect(g.nations[1].founded).toBe(true);
  });
});

describe('conquest', () => {
  it('sends exactly the requested troops and captures the whole region at once', () => {
    const g = new Game(cfg());
    g.command(0, { c: 'found', region: site(g, 0, 230, 45) });
    toWar(g);
    const cap = g.nations[0].capital;
    g.inf[cap] = 1000;
    const target = neutralNeighbour(g, 0);
    expect(target).toBeGreaterThanOrEqual(0);
    const garrisonBefore = [...g.owner].reduce((s, o, r) => s + (o === 0 ? g.inf[r] : 0), 0);
    const res = g.command(0, { c: 'attack', target, amount: 300 });
    expect(res.ok).toBe(true);
    const garrisonAfter = [...g.owner].reduce((s, o, r) => s + (o === 0 ? g.inf[r] : 0), 0);
    expect(garrisonBefore - garrisonAfter).toBeCloseTo(300, 5);
    const sent = [...g.armies.values()].filter(a => a.owner === 0).reduce((s, a) => s + a.inf, 0);
    expect(sent).toBeCloseTo(300, 5);
    const areaBefore = g.nations[0].area;
    for (let i = 0; i < 120 * TICK_RATE && g.owner[target] !== 0; i++) g.step();
    expect(g.owner[target]).toBe(0);
    run(g, 1);
    // the full region area is credited, not a sliver of tiles
    expect(g.nations[0].area - areaBefore).toBeGreaterThanOrEqual(g.map.regions[target].area);
  });

  it('deducts battle losses from attackers and defenders', () => {
    const g = new Game(cfg());
    g.command(0, { c: 'found', region: site(g, 0, 230, 45) });
    toWar(g);
    g.nations[0].autoRecruit = false;
    g.inf[g.nations[0].capital] = 600;
    const target = neutralNeighbour(g, 0);
    const militia = g.neutral[target];
    const before = myTroops(g, 0);
    g.command(0, { c: 'attack', target, amount: 200 });
    for (let i = 0; i < 120 * TICK_RATE && g.owner[target] !== 0; i++) g.step();
    expect(g.owner[target]).toBe(0);
    const after = myTroops(g, 0);
    expect(before - after).toBeGreaterThan(0.5);
    expect(before - after).toBeLessThan(militia * 1.5 + 5);
    expect(g.nations[0].stats.deaths).toBeGreaterThan(0);
  });

  it('continuous expansion keeps conquering neighbouring regions with one order', () => {
    const g = new Game(cfg());
    g.command(0, { c: 'found', region: site(g, 0, 230, 45) });
    toWar(g);
    g.inf[g.nations[0].capital] = 3000;
    const before = g.nations[0].regionCount;
    g.command(0, { c: 'attack', target: neutralNeighbour(g, 0), amount: 2500, expand: true });
    run(g, 90);
    expect(g.nations[0].regionCount).toBeGreaterThan(before + 3);
  });
});

describe('economy', () => {
  it('produces gold, food and soldiers, and buildings need workers', () => {
    const g = new Game(cfg());
    g.command(0, { c: 'found', region: site(g, 0, 230, 45) });
    toWar(g);
    const n = g.nations[0];
    const gold0 = n.gold, sold0 = myTroops(g, 0);
    run(g, 30);
    expect(n.gold).toBeGreaterThan(gold0);
    expect(myTroops(g, 0)).toBeGreaterThan(sold0);
    expect(n.income.food).toBeLessThan(n.income.food + 1);
    // a farm raises food income once built
    const r = [...g.owner.keys()].find(x => g.owner[x] === 0 && !g.buildError(0, x, 'farm'))!;
    const foodBefore = n.income.food;
    expect(g.command(0, { c: 'build', region: r, type: 'farm' }).ok).toBe(true);
    run(g, 20);
    expect(g.level(r, 'farm')).toBe(1);
    expect(n.income.food).toBeGreaterThan(foodBefore + 3);
    expect(n.jobs).toBeGreaterThan(0);
  });

  it('builds and upgrades a city (spaced apart, rising cost), which raises housing', () => {
    const g = new Game(cfg());
    g.command(0, { c: 'found', region: site(g, 0, 230, 45) });
    toWar(g);
    const n = g.nations[0];
    n.gold = 5000; n.wood = 3000; n.steel = 1000;
    // cities must be at least three regions from the capital: claim one that far away
    const hops = new Map([[n.capital, 0]]), q = [n.capital];
    for (let i = 0; i < q.length; i++) for (const m of g.map.regions[q[i]].neighbors) if (!hops.has(m)) { hops.set(m, hops.get(q[i])! + 1); q.push(m); }
    const r = [...hops.entries()].find(([x, h]) => h === 3 && g.map.regions[x].terrain !== 5)![0];
    g.transferRegion(r, 0);
    const near = g.map.regions[n.capital].neighbors[0];
    g.transferRegion(near, 0);
    expect(g.buildError(0, near, 'city')).toContain('قريبة');
    const cost1 = g.buildCost(0, 'city').gold!;
    const housing0 = n.housing;
    expect(g.command(0, { c: 'build', region: r, type: 'city' }).ok).toBe(true);
    run(g, 20);
    expect(g.level(r, 'city')).toBe(1);
    expect(n.housing).toBeGreaterThan(housing0);
    expect(g.buildCost(0, 'city').gold!).toBeGreaterThan(cost1);
    expect(g.command(0, { c: 'upgrade', region: r, type: 'city' }).ok).toBe(true);
    run(g, 35);
    expect(g.level(r, 'city')).toBe(2);
  });

  it('enforces the production chain: tanks need a factory, missiles need a launcher and reactor', () => {
    const g = new Game(cfg());
    g.command(0, { c: 'found', region: site(g, 0, 230, 45) });
    toWar(g);
    const cap = g.nations[0].capital;
    g.nations[0].gold = 1e5; g.nations[0].steel = 1e5; g.nations[0].wood = 1e5;
    expect(g.command(0, { c: 'produce', region: cap, unit: 'tank', n: 1 }).ok).toBe(false);
    expect(g.command(0, { c: 'produce', region: cap, unit: 'atom', n: 1 }).ok).toBe(false);
    expect(g.command(0, { c: 'produce', region: cap, unit: 'transport', n: 1 }).ok).toBe(false);
    g.buildings[cap].push({ type: 'factory', level: 1, build: 0, damage: 0, queue: [] });
    expect(g.command(0, { c: 'produce', region: cap, unit: 'tank', n: 3 }).ok).toBe(true);
    run(g, 12);
    expect(g.tank[cap]).toBeGreaterThanOrEqual(3);
  });
});

describe('fronts, navy and allies', () => {
  it('moves troops between own regions over time', () => {
    const g = new Game(cfg());
    g.command(0, { c: 'found', region: site(g, 0, 230, 45) });
    toWar(g);
    const cap = g.nations[0].capital;
    const to = [...g.owner.keys()].find(x => g.owner[x] === 0 && x !== cap)!;
    g.inf[cap] = 500;
    const before = g.inf[to];
    expect(g.command(0, { c: 'move', from: cap, to, amount: 200 }).ok).toBe(true);
    expect(g.inf[cap]).toBeCloseTo(300, 5);
    run(g, 30);
    expect(g.inf[to]).toBeGreaterThanOrEqual(before + 199);
  });

  it('lands an invasion force on another continent using transports from a port', () => {
    const g = new Game(cfg());
    g.command(0, { c: 'found', region: site(g, 0, 230, 45) });
    toWar(g);
    const cap = g.nations[0].capital;
    // take a coastal region of our own continent and give it a port with two transports
    const home = g.map.regions[cap].continent;
    let port = -1;
    for (const R of g.map.regions) if (R.coastal && R.continent === home && g.owner[R.id] === -1) { port = R.id; break; }
    g.transferRegion(port, 0);
    g.buildings[port].push({ type: 'port', level: 1, build: 0, damage: 0, queue: [] });
    g.inf[port] = 600;
    g.dockedFleet(0, port).ships.transport = 2;
    // a coastal target on a different landmass reachable by sea
    const fleetSea = g.map.regions[port].seas[0];
    const target = g.map.regions.find(R => R.coastal && R.continent !== home && g.owner[R.id] === -1 && R.seas.some(s => g.seaPath(fleetSea, s)))!.id;
    const res = g.command(0, { c: 'attack', target, amount: 400 });
    expect(res.ok).toBe(true);
    expect(res.info).toContain('إنزال');
    let embarked = false;
    for (let i = 0; i < 400 * TICK_RATE && g.owner[target] !== 0; i++) { g.step(); if ([...g.armies.values()].some(a => a.state === 'embarked')) embarked = true; }
    expect(embarked).toBe(true);
    expect(g.owner[target]).toBe(0);
  });

  it('allies can station supporting troops and gift soldiers that travel physically', () => {
    const g = new Game(cfg({ humans: [{ name: 'A' }, { name: 'B' }] }));
    g.command(0, { c: 'found', region: site(g, 0, 230, 45) });
    g.command(1, { c: 'found', region: site(g, 1, 262, 45) });
    toWar(g);
    expect(g.command(0, { c: 'propose', to: 1, type: 'alliance' }).ok).toBe(true);
    const req = g.requests.find(q => q.to === 1)!;
    expect(g.command(1, { c: 'respond', request: req.id, accept: true }).ok).toBe(true);
    expect(g.relOf(0, 1)).toBe(REL.ally);
    g.inf[g.nations[0].capital] = 2000;
    const bCap = g.nations[1].capital;
    // both nations expanded until their borders touch
    const corridor = g.landPath(g.nations[0].capital, bCap, () => true)!;
    for (const r of corridor) if (g.owner[r] === -1) g.transferRegion(r, 0);
    const giftBefore = g.inf[bCap];
    expect(g.command(0, { c: 'giftTroops', to: 1, amount: 300, region: bCap }).ok).toBe(true);
    expect([...g.armies.values()].some(a => a.owner === 0 && a.kind === 'gift')).toBe(true);
    expect(g.command(0, { c: 'support', to: 1, amount: 300, region: bCap }).ok).toBe(true);
    run(g, 120);
    expect(g.inf[bCap]).toBeGreaterThan(giftBefore + 250);
    expect([...g.armies.values()].some(a => a.owner === 0 && a.state === 'stationed' && a.path[a.idx] === bCap)).toBe(true);
    // gold transfer
    g.nations[0].gold = 500;
    const gb = g.nations[1].gold;
    expect(g.command(0, { c: 'sendGold', to: 1, amount: 100 }).ok).toBe(true);
    expect(g.nations[1].gold).toBeCloseTo(gb + 100, 5);
  });
});

describe('strategic weapons', () => {
  it('a launched atomic bomb kills troops, damages buildings and leaves radiation without capturing land', () => {
    const g = new Game(cfg({ humans: [{ name: 'A' }, { name: 'B' }] }));
    g.command(0, { c: 'found', region: site(g, 0, 230, 45) });
    g.command(1, { c: 'found', region: site(g, 1, 310, 60) });
    toWar(g);
    const cap0 = g.nations[0].capital, cap1 = g.nations[1].capital;
    g.buildings[cap0].push({ type: 'silo', level: 2, build: 0, damage: 0, queue: [] });
    g.nations[0].weapons.mirv = 1;
    g.inf[cap1] = 1000;
    expect(g.command(0, { c: 'launch', weapon: 'mirv', target: cap1 }).ok).toBe(true);
    expect(g.missiles.size).toBe(4);
    run(g, 20);
    expect(g.missiles.size).toBe(0);
    expect(g.inf[cap1]).toBeLessThan(300);
    expect(g.radiation[cap1]).toBeGreaterThan(0);
    expect(g.owner[cap1]).toBe(1);
    expect(g.atWar(0, 1)).toBe(true);
  });
});

describe('bots', () => {
  it('49 bots found nations, build, expand, fight and do diplomacy on their own', () => {
    const g = new Game(cfg({ humans: [], bots: 50, difficulty: 'hard' }));
    toWar(g);
    const t0 = performance.now();
    run(g, 300);
    const ms = performance.now() - t0;
    let built = 0; for (const l of g.buildings) built += l.filter(b => b.type !== 'capital').length;
    expect(built).toBeGreaterThan(150);
    expect(g.counters.neutralCaptures).toBeGreaterThan(200);
    expect(g.counters.attacks).toBeGreaterThan(20);
    let rels = 0; for (const v of g.rel) if (v === REL.ally || v === REL.nap) rels++;
    expect(rels).toBeGreaterThan(0);
    // personalities differ: not every bot ends up with the same building mix
    const mixes = new Set(g.nations.map(n => g.nationBuildings(n.id, 'factory').length + ':' + g.nationBuildings(n.id, 'port').length + ':' + g.nationBuildings(n.id, 'barracks').length));
    expect(mixes.size).toBeGreaterThan(8);
    // 5 minutes of 50 bots must simulate far faster than real time
    expect(ms).toBeLessThan(30000);
  });
});

describe('determinism & multiplayer sync', () => {
  it('two engines fed the same commands from 10 players stay identical (lockstep-safe)', () => {
    const mk = () => new Game(cfg({ humans: Array.from({ length: 10 }, (_, i) => ({ name: 'P' + i })), bots: 40, seed: 99 }));
    const a = mk(), b = mk();
    for (const g of [a, b]) {
      for (let p = 0; p < 10; p++) g.command(p, { c: 'found', region: g.autoFoundSite(p) });
      toWar(g);
    }
    for (let t = 0; t < 1500; t++) {
      if (t % 100 === 0) for (let p = 0; p < 10; p++) for (const g of [a, b]) {
        const tgt = neutralNeighbour(g, p);
        if (tgt >= 0) g.command(p, { c: 'attack', target: tgt, amount: 60 });
      }
      a.step(); b.step();
    }
    const hash = (g: Game) => { let h = 0; for (let r = 0; r < g.owner.length; r++) h = (h * 31 + g.owner[r] + Math.round(g.inf[r] * 10)) | 0; return h; };
    expect(hash(a)).toBe(hash(b));
    expect(a.armies.size).toBe(b.armies.size);
  });
});

describe('victory', () => {
  it('a nation controlling 80% of the land area wins', () => {
    const g = new Game(cfg({ humans: [{ name: 'A' }], bots: 5 }));
    toWar(g);
    const order = [...g.map.regions].sort((x, y) => y.area - x.area);
    let area = 0;
    for (const R of order) { if (area / g.map.landArea >= 0.81) break; if (g.owner[R.id] !== 0) g.transferRegion(R.id, 0); area = g.nations[0].area; }
    g.checkVictory();
    expect(g.winner).toBe(0);
    expect(g.phase).toBe('over');
  });

  it('victory counts land area, not region count', () => {
    const g = new Game(cfg({ humans: [{ name: 'A' }], bots: 3 }));
    toWar(g);
    const small = [...g.map.regions].sort((x, y) => x.area - y.area);
    for (const R of small.slice(0, Math.ceil(small.length * 0.81))) if (g.owner[R.id] !== 0) g.transferRegion(R.id, 0);
    g.checkVictory();
    // 81% of the regions by count but the smallest ones: well under 80% of the land
    expect(g.share(0)).toBeLessThan(0.8);
    expect(g.winner).not.toBe(0);
  });

  it('team mode: a team wins with 80% combined', () => {
    const g = new Game(cfg({ humans: [{ name: 'A' }], bots: 5, mode: 'teams', teams: 2 }));
    toWar(g);
    expect(g.relOf(0, 2)).toBe(REL.ally);
    const team0 = g.nations.filter(n => n.team === 0).map(n => n.id);
    const order = [...g.map.regions].sort((x, y) => y.area - x.area);
    let i = 0;
    for (const R of order) { if (team0.reduce((s, id) => s + g.nations[id].area, 0) / g.map.landArea >= 0.81) break; if (!team0.includes(g.owner[R.id])) g.transferRegion(R.id, team0[i++ % team0.length]); }
    g.checkVictory();
    expect(g.winnerTeam).toBe(0);
  });
});

describe('maps', () => {
  it('builds every map family with ~1000+ full regions and balanced spawns', async () => {
    const { PRESETS } = await import('../src/sim/map/terrain');
    for (const c of [{ mapKind: 'random' as const, seed: 4242 }, ...PRESETS.map(p => ({ mapKind: 'preset' as const, preset: p.id, seed: 3 }))]) {
      const g = new Game(cfg({ ...c, humans: [], bots: 50 }));
      expect(g.map.regions.length).toBeGreaterThan(900);
      toWar(g);
      expect(g.nations.every(n => n.capital >= 0)).toBe(true);
      // every spawn has room to grow: at least 4 neutral regions within reach
      for (const n of g.nations) {
        const seen = new Set([n.capital]); const q = [n.capital]; let free = 0;
        for (let i = 0; i < q.length && i < 60; i++) for (const m of g.map.regions[q[i]].neighbors) if (!seen.has(m)) { seen.add(m); q.push(m); if (g.owner[m] === -1) free++; }
        expect(free).toBeGreaterThanOrEqual(4);
      }
    }
  });
});
