// Alliances, non-aggression pacts, transit rights, gifts, joint targets and requests for help.
import { DIPLO } from './balance';
import type { Game } from './game';
import { CommandResult, REL, RequestType } from './state';
import { cmdSupport, threatAt } from './military';

const REQ_NAMES: Record<RequestType, string> = { alliance: 'تحالف', nap: 'عدم اعتداء', transit: 'عبور عسكري', help: 'طلب مساعدة' };

export function opinion(g: Game, a: number, b: number) { return g.opinion[a * g.nations.length + b]; }
export function addOpinion(g: Game, a: number, b: number, v: number) {
  const i = a * g.nations.length + b;
  g.opinion[i] = Math.max(-100, Math.min(100, g.opinion[i] + v));
}

export function declareWar(g: Game, a: number, b: number) {
  if (a === b || g.atWar(a, b)) return;
  const prev = g.relOf(a, b);
  g.setRel(a, b, REL.war);
  const N = g.nations.length;
  g.transit[a * N + b] = 0; g.transit[b * N + a] = 0;
  addOpinion(g, b, a, prev === REL.ally ? -80 : prev === REL.nap ? -60 : -35);
  for (const o of g.nations) if (o.id !== a && o.id !== b && g.allied(o.id, b)) addOpinion(g, o.id, a, -15);
  const human = g.nations[a].human || g.nations[b].human;
  g.log('war', `${g.nations[a].name} أعلنت الحرب على ${g.nations[b].name}`, a, b, -1, human);
}

export function cmdPropose(g: Game, n: number, to: number, type: RequestType, region: number): CommandResult {
  const t = g.nations[to];
  if (!t?.alive || to === n) return { ok: false, error: 'دولة غير صالحة' };
  const rel = g.relOf(n, to);
  if (type === 'alliance' && rel === REL.ally) return { ok: false, error: 'أنتما حليفان بالفعل' };
  if (type === 'alliance' && rel === REL.war) return { ok: false, error: 'أنتما في حرب — اعرض عدم الاعتداء أولًا' };
  if (type === 'nap' && (rel === REL.nap || rel === REL.ally)) return { ok: false, error: 'يوجد اتفاق بالفعل' };
  if (type === 'help' && rel !== REL.ally) return { ok: false, error: 'اطلب المساعدة من الحلفاء فقط' };
  if (type === 'transit' && g.canTransit(n, to)) return { ok: false, error: 'لديك حق العبور' };
  if (g.requests.some(r => r.from === n && r.to === to && r.type === type)) return { ok: false, error: 'الطلب مرسل بالفعل' };
  g.requests.push({ id: g.id(), from: n, to, type, t: g.time, region });
  if (t.human) g.log('request', `${g.nations[n].name} تطلب ${REQ_NAMES[type]}`, n, to, region, true);
  return { ok: true, info: 'أُرسل الطلب' };
}

export function cmdRespond(g: Game, n: number, reqId: number, accept: boolean): CommandResult {
  const i = g.requests.findIndex(r => r.id === reqId && r.to === n);
  if (i < 0) return { ok: false, error: 'الطلب انتهى' };
  const req = g.requests[i];
  g.requests.splice(i, 1);
  const from = g.nations[req.from], me = g.nations[n];
  if (!from.alive) return { ok: false, error: 'الدولة سقطت' };
  if (!accept) {
    addOpinion(g, req.from, n, -6);
    if (from.human) g.log('diplo', `${me.name} رفضت ${REQ_NAMES[req.type]}`, n, req.from, -1, true);
    return { ok: true };
  }
  const N = g.nations.length;
  switch (req.type) {
    case 'alliance':
      if (g.atWar(n, req.from)) return { ok: false, error: 'في حالة حرب' };
      g.setRel(n, req.from, REL.ally);
      g.breaking = g.breaking.filter(b => !((b.a === n && b.b === req.from) || (b.a === req.from && b.b === n)));
      addOpinion(g, n, req.from, 20); addOpinion(g, req.from, n, 20);
      g.log('ally', `تحالف بين ${me.name} و${from.name}`, n, req.from, -1, me.human || from.human);
      break;
    case 'nap':
      g.setRel(n, req.from, REL.nap);
      g.relTimer[n * N + req.from] = g.relTimer[req.from * N + n] = DIPLO.napSeconds;
      for (const b of [...g.battles.values()]) {
        // a ceasefire immediately ends fighting between the two
        b.attackers = b.attackers.filter(id => { const a = g.armies.get(id); return !(a && ((a.owner === n && g.owner[b.region] === req.from) || (a.owner === req.from && g.owner[b.region] === n))); });
      }
      addOpinion(g, n, req.from, 10); addOpinion(g, req.from, n, 10);
      g.log('nap', `اتفاق عدم اعتداء بين ${me.name} و${from.name}`, n, req.from, -1, me.human || from.human);
      break;
    case 'transit':
      g.transit[req.from * N + n] = 1;
      addOpinion(g, req.from, n, 8);
      if (from.human || me.human) g.log('diplo', `${me.name} منحت ${from.name} حق العبور`, n, req.from, -1, true);
      break;
    case 'help': {
      const atWar = g.nations.some(o => o.alive && g.atWar(n, o.id));
      const amount = Math.max(20, me.soldiers * (atWar ? 0.08 : 0.18));
      const r = cmdSupport(g, n, req.from, amount, req.region, 'support');
      if (!r.ok) return r;
      addOpinion(g, req.from, n, 15);
      break;
    }
  }
  return { ok: true };
}

export function cmdCancelTreaty(g: Game, n: number, to: number): CommandResult {
  if (g.teammates(n, to)) return { ok: false, error: 'لا يمكن ترك فريقك' };
  const rel = g.relOf(n, to);
  const N = g.nations.length;
  if (g.transit[n * N + to] || g.transit[to * N + n]) { g.transit[n * N + to] = 0; g.transit[to * N + n] = 0; }
  if (rel !== REL.ally && rel !== REL.nap) return { ok: true, info: 'أُلغي حق العبور' };
  if (g.breaking.some(b => b.a === n && b.b === to)) return { ok: false, error: 'الإلغاء جارٍ' };
  const kind = rel === REL.ally ? 'ally' : 'nap';
  g.breaking.push({ a: n, b: to, t: kind === 'ally' ? DIPLO.allianceBreakSeconds : DIPLO.napBreakSeconds, kind });
  addOpinion(g, to, n, kind === 'ally' ? -40 : -25);
  g.log('diplo', `${g.nations[n].name} ستلغي ${kind === 'ally' ? 'التحالف' : 'اتفاق عدم الاعتداء'} مع ${g.nations[to].name}`, n, to, -1, g.nations[n].human || g.nations[to].human);
  return { ok: true, info: `يسري الإلغاء بعد ${kind === 'ally' ? DIPLO.allianceBreakSeconds : DIPLO.napBreakSeconds} ثوانٍ` };
}

export function cmdDeclareWar(g: Game, n: number, to: number): CommandResult {
  if (!g.nations[to]?.alive || to === n) return { ok: false, error: 'دولة غير صالحة' };
  const rel = g.relOf(n, to);
  if (rel === REL.ally || rel === REL.nap) return { ok: false, error: 'ألغِ الاتفاق أولًا' };
  if (rel === REL.war) return { ok: false, error: 'أنتما في حرب بالفعل' };
  declareWar(g, n, to);
  return { ok: true };
}

export function cmdSendGold(g: Game, n: number, to: number, amount: number): CommandResult {
  const me = g.nations[n], t = g.nations[to];
  if (!t?.alive || to === n) return { ok: false, error: 'دولة غير صالحة' };
  if (g.atWar(n, to)) return { ok: false, error: 'لا ترسل الذهب لعدوك' };
  const k = Math.min(Math.floor(amount), Math.floor(me.gold));
  if (k < 1) return { ok: false, error: 'لا يوجد ذهب كافٍ' };
  me.gold -= k; t.gold += k;
  addOpinion(g, to, n, Math.min(30, k / 40));
  g.log('gold', `${me.name} أرسلت ${k} ذهب إلى ${t.name}`, n, to, -1, me.human || t.human);
  return { ok: true };
}

export function cmdJointTarget(g: Game, n: number, target: number): CommandResult {
  if (target >= 0 && (!g.nations[target]?.alive || g.allied(n, target))) return { ok: false, error: 'هدف غير صالح' };
  g.jointTarget[n] = target;
  if (target >= 0) {
    for (const o of g.nations) if (o.id !== n && o.alive && g.allied(n, o.id)) addOpinion(g, o.id, target, -10);
    g.log('joint', `${g.nations[n].name} تدعو حلفاءها لهجوم مشترك على ${g.nations[target].name}`, n, target, -1, true);
  }
  return { ok: true };
}

export function diplomacyTick(g: Game, dt: number) {
  const N = g.nations.length;
  for (const b of [...g.breaking]) {
    b.t -= dt;
    if (b.t <= 0) {
      g.breaking.splice(g.breaking.indexOf(b), 1);
      if (g.relOf(b.a, b.b) === (b.kind === 'ally' ? REL.ally : REL.nap)) {
        g.setRel(b.a, b.b, REL.peace);
        for (const a of [...g.armies.values()]) if (a.state === 'stationed' && ((a.owner === b.a && g.owner[a.path[a.idx]] === b.b) || (a.owner === b.b && g.owner[a.path[a.idx]] === b.a))) { a.kind = 'move'; a.state = 'march'; a.target = a.path[a.idx]; }
        g.log('diplo', `انتهى ${b.kind === 'ally' ? 'التحالف' : 'الاتفاق'} بين ${g.nations[b.a].name} و${g.nations[b.b].name}`, b.a, b.b, -1, g.nations[b.a].human || g.nations[b.b].human);
      }
    }
  }
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
    if (g.rel[a * N + b] !== REL.nap) continue;
    g.relTimer[a * N + b] -= dt; g.relTimer[b * N + a] -= dt;
    if (g.relTimer[a * N + b] <= 0) g.setRel(a, b, REL.peace);
  }
  g.requests = g.requests.filter(r => g.time - r.t < DIPLO.requestTtl && g.nations[r.from].alive && g.nations[r.to].alive);
  // opinions drift back towards neutral
  if (g.tick % 50 === 0) for (let i = 0; i < g.opinion.length; i++) g.opinion[i] *= 0.98;
}

export { threatAt };
