// Visual QA: stages the 20 scenes from the art brief in the real running game and screenshots them.
// Usage: node tests/e2e/shots.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5180';
const out = process.argv[3] ?? 'test-artifacts/shots';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const errors = [];

async function open(viewport, mobile = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(base + '/?quick&bots=49');
  await p.waitForFunction(() => window.__ww?.hud, null, { timeout: 60000 });
  return p;
}
const shot = async (p, name, wait = 900) => { await p.waitForTimeout(wait); await p.screenshot({ path: `${out}/${name}.png` }); console.log('shot', name); };
/** Runs the camera to a tile position and zoom, then waits for chunks to paint. */
const look = (p, x, y, z) => p.evaluate(([x, y, z]) => { const { scene } = window.__ww; scene.cameras.main.setZoom(z); scene.cameras.main.centerOn((x + 0.5) * 16, (y + 0.5) * 16); }, [x, y, z]);

const p = await open({ width: 1440, height: 900 });
await shot(p, '01-founding', 500);
// found in Europe and stage a developed nation for the rest of the scenes
const setup = await p.evaluate(() => {
  const { sim, scene } = window.__ww;
  let best = -1, bd = 1e9;
  for (const R of sim.map.regions) { const d = Math.hypot(R.cx - 205, R.cy - 33); if (d < bd && !sim.canFound(0, R.id)) { bd = d; best = R.id; } }
  sim.command(0, { c: 'found', region: best });
  while (sim.phase === 'founding') sim.step();
  for (let i = 0; i < 900; i++) sim.step();
  scene.paused = true;
  const n = sim.nations[0];
  n.gold = n.wood = n.steel = 1e5;
  // expand the player around the capital
  const cap = n.capital, own = [cap];
  for (let i = 0; i < own.length && own.length < 22; i++) for (const m of sim.map.regions[own[i]].neighbors) if (!own.includes(m) && own.length < 22 && !sim.map.regions[own[i]].straits.includes(m)) { sim.transferRegion(m, 0); own.push(m); }
  const put = (r, type, level) => { const b = sim.buildings[r].find(x => x.type === type); if (b) { b.level = level; b.build = 0; } else sim.buildings[r].push({ type, level, build: 0, damage: 0, queue: [] }); sim.markDirty(r); };
  put(cap, 'capital', 3);
  const coastal = own.filter(r => sim.map.regions[r].coastal && r !== cap);
  const inland = own.filter(r => r !== cap && !coastal.includes(r));
  const pool = [...inland, ...coastal];
  const city2 = pool[0], city1 = pool[1];
  put(city2, 'city', 3); put(city2, 'factory', 2); put(city2, 'hospital', 1);
  put(city1, 'city', 1);
  const port = coastal[0] ?? pool[2];
  put(port, 'port', 3);
  const air = pool[3]; put(air, 'airbase', 2);
  put(pool[4], 'silo', 2); put(pool[5], 'nuclear', 2); put(pool[6], 'barracks', 1); put(pool[7], 'farm', 2); put(pool[8], 'mine', 1); put(pool[9], 'airdefense', 1);
  for (const r of own) sim.inf[r] += 300;
  sim.tank[cap] = 60; sim.art[cap] = 30;
  const f = sim.dockedFleet(0, port); f.ships.carrier = 1; f.ships.destroyer = 3; f.ships.transport = 3; f.ships.sub = 1;
  const grp = sim.airGroupAt(0, air, -1); grp.planes.f16 = 2; grp.planes.apache = 2; grp.planes.b52 = 1; grp.planes.ac130 = 1;
  const cg = sim.airGroupAt(0, port, f.id); cg.planes.f35 = 4;
  return { cap, city2, city1, port, air, own };
});
const R = await p.evaluate(s => { const m = window.__ww.sim.map.regions; const o = {}; for (const [k, v] of Object.entries(s)) if (typeof v === 'number') o[k] = [m[v].cx, m[v].cy]; return o; }, setup);
await p.evaluate(() => window.__ww.scene.fitWorld());
await shot(p, '02-world-far', 2500);
await look(p, ...R.cap, 0.7); await shot(p, '03-nation-mid', 3500);
await look(p, ...R.city1, 3.2); await shot(p, '04-small-city-near', 3500);
await look(p, ...R.cap, 3); await p.evaluate(() => { window.__ww.scene.paused = false; }); await shot(p, '05-capital-near', 3500);
await look(p, ...R.city2, 3.2); await shot(p, '06-factory-hospital-near', 3000);
await look(p, ...R.port, 2.6); await shot(p, '08-port-ships', 3000);
// fleet underway + carrier with aircraft
await p.evaluate(() => { const { sim } = window.__ww; const f = [...sim.fleets.values()].find(x => x.owner === 0); const far = sim.map.seas[f.sea].neighbors[0]; sim.command(0, { c: 'fleetMove', fleet: f.id, sea: sim.map.seas[far].neighbors[0] ?? far }); for (let i = 0; i < 25; i++) sim.step(); });
const fpos = await p.evaluate(() => { const f = [...window.__ww.sim.fleets.values()].find(x => x.owner === 0); return [f.x, f.y]; });
await look(p, ...fpos, 2.4); await shot(p, '09-10-fleet-carrier', 2500);
// helicopters and fighters in the air: strike a neighbour
const target = await p.evaluate(s => { const { sim } = window.__ww; for (const r of s.own) for (const m of sim.map.regions[r].neighbors) if (sim.owner[m] !== 0) return m; return -1; }, setup);
await p.evaluate(([air, t]) => { const { sim } = window.__ww; sim.command(0, { c: 'airStrike', base: air, target: t }); for (let i = 0; i < 6; i++) sim.step(); }, [setup.air, target]);
const spos = await p.evaluate(() => { const s = [...window.__ww.sim.sorties.values()][0]; return s ? [s.x, s.y] : null; });
if (spos) { await look(p, ...spos, 3.6); await shot(p, '11-helicopters-air', 1200); }
// land battle: big attack with tanks
await p.evaluate(([t]) => { const { sim, scene } = window.__ww; scene.paused = true; sim.command(0, { c: 'attack', target: t, amount: 2000, tanks: 50, arts: 20 }); for (let i = 0; i < 120; i++) sim.step(); }, [target]);
const bpos = await p.evaluate(() => { const a = [...window.__ww.sim.armies.values()].find(x => x.owner === 0); return a ? [a.x, a.y] : null; });
if (bpos) { await look(p, ...bpos, 3.4); await p.evaluate(() => { window.__ww.scene.paused = false; }); await shot(p, '12-land-battle', 2500); }
await p.evaluate(() => { window.__ww.scene.paused = true; });
// air strike explosion
if (spos) { await p.evaluate(() => { const { sim } = window.__ww; for (let i = 0; i < 40; i++) sim.step(); }); await look(p, ...R.cap, 1.2); await p.evaluate(() => { window.__ww.scene.paused = false; }); await shot(p, '14-air-strike', 800); }
// strategic weapon
await p.evaluate(([t]) => { const { sim, scene } = window.__ww; scene.paused = false; sim.nations[0].weapons.atom = 1; const enemy = sim.owner[t]; let far = -1; for (let r = 0; r < sim.owner.length; r++) if (sim.owner[r] >= 0 && sim.owner[r] !== 0 && Math.hypot(sim.map.regions[r].cx - sim.map.regions[t].cx, sim.map.regions[r].cy - sim.map.regions[t].cy) > 25 && Math.hypot(sim.map.regions[r].cx - sim.map.regions[t].cx, sim.map.regions[r].cy - sim.map.regions[t].cy) < 60) { far = r; break; } window.__nuke = far; sim.command(0, { c: 'launch', weapon: 'atom', target: far }); }, [target]);
const npos = await p.evaluate(() => { const m = window.__ww.sim.map.regions[window.__nuke]; return [m.cx, m.cy]; });
await look(p, ...npos, 1.0);
await p.waitForFunction(() => window.__ww.sim.missiles.size === 0, null, { timeout: 30000 });
await shot(p, '15-strategic-explosion', 700);
// UI cards
await p.evaluate(s => { const { hud } = window.__ww; hud['region'] = s.city2; hud.openCard('build'); }, setup);
await shot(p, '16-ui-build-factories', 600);
await p.evaluate(s => { const { hud, scene } = window.__ww; hud['region'] = s.port; hud.openCard('region'); scene.select(s.port); }, setup);
await shot(p, '17-ui-port-ships', 600);
await p.evaluate(() => window.__ww.hud.openCard('diplo'));
await shot(p, '18-ui-diplomacy', 600);
await p.evaluate(() => window.__ww.hud.closeCard());
// victory
await p.evaluate(() => { const { sim } = window.__ww; const order = [...sim.map.regions].sort((a, b) => b.area - a.area); for (const R of order) { if (sim.share(0) >= 0.81) break; if (sim.owner[R.id] !== 0) sim.transferRegion(R.id, 0); } sim.checkVictory(); });
await shot(p, '20-victory', 2500);

// phone landscape
const m = await open({ width: 844, height: 390 }, true);
await m.evaluate(() => { const { sim } = window.__ww; sim.command(0, { c: 'found', region: sim.autoFoundSite(0) }); while (sim.phase === 'founding') sim.step(); for (let i = 0; i < 300; i++) sim.step(); });
await shot(m, '19-mobile-landscape', 2500);
await m.evaluate(() => { const { sim, scene } = window.__ww; const R = sim.map.regions[sim.nations[0].capital]; scene.cameras.main.setZoom(1.6); scene.cameras.main.centerOn((R.cx + .5) * 16, (R.cy + .5) * 16); });
await shot(m, '19b-mobile-landscape-zoom', 3000);
const share = await m.evaluate(() => { let covered = 0, total = 0; for (let y = 0; y < innerHeight; y += 4) for (let x = 0; x < innerWidth; x += 4) { total++; const el = document.elementFromPoint(x, y); if (el && el.tagName !== 'CANVAS') covered++; } return 1 - covered / total; });
console.log('mobile landscape map share', share.toFixed(3));
console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
