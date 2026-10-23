// Causal economy: population needs housing and food, buildings need workers, output needs workers,
// soldiers come out of the population and eat, hospitals return the wounded.
import { AIR, BUILDINGS, CITY, ECON, LAND, SEA, WEAPONS } from './balance';
import type { Game } from './game';
import { T } from './map/terrain';
import { airTotal, LandCounts } from './state';

export function economyTick(g: Game, dt: number) {
  const N = g.nations.length, R = g.owner.length;
  const housing = new Float64Array(N), jobs = new Float64Array(N), cap = new Float64Array(N);
  const farm = new Float64Array(N), wood = new Float64Array(N), steel = new Float64Array(N), factory = new Float64Array(N);
  const port = new Float64Array(N), rural = new Float64Array(N), area = new Float64Array(N), count = new Float64Array(N);
  const market = new Float64Array(N), bank = new Float64Array(N);
  const upkeep = new Float64Array(N), hosp = new Float64Array(N), sold = new Float64Array(N), tanks = new Float64Array(N), arts = new Float64Array(N);
  const recruitSpots: { r: number; rate: number }[][] = Array.from({ length: N }, () => []);
  const hospitalSpots: number[][] = Array.from({ length: N }, () => []);

  for (let r = 0; r < R; r++) {
    const o = g.owner[r];
    if (o < 0) { if (!g.battles.has(r)) g.neutral[r] = Math.min(g.neutralBase(r), g.neutral[r] + g.neutralBase(r) * 0.02 * dt); continue; }
    const Rg = g.map.regions[r];
    const rad = g.radiation[r] > 0 ? 0.25 : 1;
    if (g.radiation[r] > 0) {
      g.radiation[r] = Math.max(0, g.radiation[r] - dt);
      const loss = 1 - 0.012 * dt; g.inf[r] *= loss; g.tank[r] *= loss; g.art[r] *= loss;
      if (g.radiation[r] === 0) g.markDirty(r);
    }
    area[o] += Rg.area; count[o]++;
    housing[o] += ECON.housing.rural; cap[o] += ECON.capacity.region;
    const fertile = Rg.terrain === T.Desert || Rg.terrain === T.Snow || Rg.terrain === T.Mountain ? 0.3 : 1;
    rural[o] += ECON.regionFood * fertile * rad;
    sold[o] += g.inf[r]; tanks[o] += g.tank[r]; arts[o] += g.art[r];
    // districts in a city's region grow with the city and with a power plant next to them
    let cityL = 0, powerL = 0;
    for (const b of g.buildings[r]) { if (b.type === 'city' || b.type === 'capital') cityL = b.level; if (b.type === 'power') powerL = b.level; }
    const boost = (cityL ? CITY.synergy(cityL) : 1) * (1 + ECON.powerBoost * powerL);
    for (const b of g.buildings[r]) {
      const def = BUILDINGS[b.type];
      if (b.level > 0) {
        const lvl = b.level;
        jobs[o] += def.workers * lvl;
        upkeep[o] += def.upkeep * lvl;
        switch (b.type) {
          case 'capital': case 'city': {
            const c = b.type === 'capital';
            housing[o] += CITY.housing(lvl, c); cap[o] += CITY.soldierCap(lvl, c);
            recruitSpots[o].push({ r, rate: CITY.recruit(lvl, c) }); market[o] += CITY.gold(lvl) * rad;
            break;
          }
          case 'barracks': cap[o] += ECON.capacity.barracks * lvl * boost; recruitSpots[o].push({ r, rate: ECON.passiveRecruit.barracks * lvl * boost }); break;
          case 'market': market[o] += ECON.marketGold * lvl * rad * boost; break;
          case 'bank': bank[o] += lvl * (cityL ? CITY.synergy(cityL) : 1); break;
          case 'farm': farm[o] += ECON.farmFood * lvl * rad * (Rg.flatShare > 0.5 ? 1.2 : 1); break;
          case 'lumber': wood[o] += ECON.lumberWood * lvl * rad * (0.6 + Rg.forestShare); break;
          case 'mine': steel[o] += ECON.mineSteel * lvl * rad * (0.6 + Rg.hillShare); break;
          case 'factory': factory[o] += ECON.factoryGold * lvl * rad * boost; break;
          case 'port': {
            const blockaded = [...g.fleets.values()].some(f => f.owner !== o && g.atWar(o, f.owner) && Rg.seas.includes(f.sea) && f.ships.destroyer + f.ships.sub + f.ships.patrol + f.ships.carrier > 0);
            if (!blockaded) port[o] += ECON.portGold * lvl * rad * boost;
            break;
          }
          case 'hospital': hosp[o] += lvl; hospitalSpots[o].push(r); break;
        }
      }
      // construction / upgrades progress
      if (b.build > 0) {
        b.build -= dt * (0.5 + 0.5 * g.nations[o].fill);
        if (b.build <= 0) {
          b.build = 0; b.level++; b.damage = 0;
          g.markDirty(r);
          if (g.nations[o].human) g.log('built', `اكتمل ${def.name} (مستوى ${b.level})`, o, -1, r);
        }
      }
    }
  }
  // mobile land units count towards upkeep and food
  for (const a of g.armies.values()) { sold[a.owner] += a.inf; tanks[a.owner] += a.tank; arts[a.owner] += a.art; }
  for (const f of g.fleets.values()) {
    let u = 0; for (const k in f.ships) u += (f.ships as any)[k] * (SEA as any)[k].upkeep;
    upkeep[f.owner] += u + airTotal(f.planes) * 0.3;
  }
  for (const a of g.airGroups.values()) { let u = 0; for (const k in a.planes) u += (a.planes as any)[k] * (AIR as any)[k].upkeep; upkeep[a.owner] += u; }

  for (const n of g.nations) {
    const i = n.id;
    if (!n.alive || !n.founded) continue;
    n.area = area[i]; n.regionCount = count[i]; n.stats.peakArea = Math.max(n.stats.peakArea, area[i]);
    n.housing = housing[i]; n.jobs = jobs[i]; n.capacity = cap[i];
    n.soldiers = sold[i]; n.tanks = tanks[i]; n.arts = arts[i];
    n.labor = n.pop * ECON.laborShare;
    n.fill = jobs[i] > 0 ? Math.min(1, n.labor / jobs[i]) : 1;
    const employed = Math.min(n.labor, jobs[i]), idle = Math.max(0, n.labor - jobs[i]);
    const fill = n.fill * (n.bankrupt ? 0.5 : 1);
    let allyPorts = 0;
    if (port[i] > 0) for (const o of g.nations) if (o.id !== i && o.alive && g.allied(i, o.id) && port[o.id] > 0) allyPorts++;
    const goldIn = (employed * ECON.taxEmployed + idle * ECON.taxIdle + count[i] * ECON.regionGold + factory[i] * fill + port[i] * fill + market[i] * fill + allyPorts * ECON.portAllyGold) * (1 + Math.min(1.5, bank[i] * ECON.bankBoost));
    const goldOut = upkeep[i] + sold[i] * LAND.inf.upkeep + tanks[i] * LAND.tank.upkeep + arts[i] * LAND.art.upkeep;
    const foodIn = farm[i] * fill + rural[i];
    const foodOut = n.pop * ECON.foodPerPop + (sold[i] + tanks[i] * 2 + arts[i] * 2) * ECON.foodPerSoldier;
    n.income.gold = goldIn - goldOut;
    n.income.food = foodIn - foodOut;
    n.income.wood = wood[i] * fill;
    n.income.steel = steel[i] * fill;
    n.gold += n.income.gold * dt; n.food += n.income.food * dt; n.wood += n.income.wood * dt; n.steel += n.income.steel * dt;

    n.starving = n.food <= 0;
    if (n.starving) { n.food = 0; desert(g, i, 0.006 * dt); n.pop *= 1 - 0.008 * dt; }
    n.bankrupt = n.gold < 0;
    if (n.bankrupt) desert(g, i, 0.004 * dt);

    // population
    const before = n.pop;
    if (!n.starving) {
      const room = 1 - n.pop / Math.max(1, n.housing);
      if (room > 0) n.pop += ECON.growth * n.pop * room * (1 + Math.min(1.2, hosp[i] * 0.15)) * dt;
      else n.pop += Math.max(-0.05, room * 0.05) * n.pop * dt; // overcrowded: people leave, at most 5%/s
    }
    // passive recruitment from cities, capital and barracks
    const total = sold[i] + tanks[i] * 3 + arts[i] * 2;
    if (n.autoRecruit && total < n.capacity && n.pop > 600 && !n.starving && !n.bankrupt) {
      for (const s of recruitSpots[i]) {
        const k = Math.min(s.rate * dt * (0.4 + 0.6 * n.fill), n.capacity - total, n.pop - 600);
        if (k <= 0) break;
        g.inf[s.r] += k; n.pop -= k;
      }
    }
    // wounded: hospitals heal them back to service, otherwise they slowly die
    if (n.wounded > 0) {
      if (hospitalSpots[i].length) {
        const healed = Math.min(n.wounded, ECON.healRate * hosp[i] * dt * 3);
        n.wounded -= healed;
        const per = healed / hospitalSpots[i].length;
        for (const r of hospitalSpots[i]) g.inf[r] += per;
      } else n.wounded *= 1 - 0.03 * dt;
      n.wounded = Math.min(n.wounded, Math.max(50, hosp[i] * ECON.hospitalBeds * 3 + 200));
    }
    n.income.pop = (n.pop - before) / dt;
  }

  // production queues (units/weapons) — run after income so new orders see this tick's fill
  for (let r = 0; r < R; r++) {
    const o = g.owner[r]; if (o < 0) continue;
    const n = g.nations[o];
    for (const b of g.buildings[r]) {
      if (!b.queue.length || b.level < 1) continue;
      const q = b.queue[0];
      q.t -= dt * (0.35 + 0.65 * n.fill) * (g.radiation[r] > 0 ? 0.3 : 1);
      let guard = 0;
      while (q.t <= 0 && q.left > 0 && guard++ < 200) {
        if (q.unit === 'inf' && n.pop < 320) { q.t = 0.5; break; }
        spawn(g, o, r, q.unit);
        q.left--;
        q.t += (WEAPONS as any)[q.unit]?.time ?? g.unitDef(q.unit)!.time / Math.max(1, b.level * (q.unit === 'inf' ? 1 : 0.8));
      }
      if (q.left <= 0) b.queue.shift();
    }
  }
}

function spawn(g: Game, o: number, r: number, unit: string) {
  const n = g.nations[o];
  if (unit === 'inf') { g.inf[r] += 1; n.pop -= 1; return; }
  if (unit === 'tank') { g.tank[r] += 1; return; }
  if (unit === 'art') { g.art[r] += 1; return; }
  if (unit in WEAPONS) { (n.weapons as any)[unit]++; if (n.human) g.log('weapon', `جاهز: ${(WEAPONS as any)[unit].name}`, o, -1, r, true); return; }
  if (unit in SEA) { const f = g.dockedFleet(o, r); (f.ships as any)[unit]++; return; }
  if (unit in AIR) { const a = g.airGroupAt(o, r, -1); (a.planes as any)[unit]++; return; }
}

/** Removes a share of every garrison (hunger / unpaid troops). */
function desert(g: Game, n: number, share: number) {
  for (let r = 0; r < g.owner.length; r++) if (g.owner[r] === n) { g.inf[r] *= 1 - share; g.tank[r] *= 1 - share * 0.5; g.art[r] *= 1 - share * 0.5; }
}

export function landStrength(c: LandCounts) { return c.inf * LAND.inf.atk + c.tank * LAND.tank.atk + c.art * LAND.art.atk; }
