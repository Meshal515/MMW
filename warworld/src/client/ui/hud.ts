// HTML interface layered over the map: thin top bar, collapsible action dock, one floating card at a time.
import { AIR, BUILDABLE, BUILDINGS, BuildingType, Cost, LAND, SEA, Weapon, WEAPONS } from '../../sim/balance';
import type { Game } from '../../sim/game';
import { availableFor, estimateDefense, defenseMultiplier } from '../../sim/military';
import { TERRAIN_NAMES } from '../../sim/map/terrain';
import { AIR_UNITS, airTotal, Command, REL, SEA_UNITS, shipTotal } from '../../sim/state';
import { hexColor } from '../art/pixel';
import { iconURL } from '../art/sprites';
import { fmt, WorldScene } from '../render/scene';
import { regionName } from './names';

type Mode =
  | { k: 'move'; from: number; share: number }
  | { k: 'air'; base: number; carrier: number }
  | { k: 'rebase'; base: number; carrier: number }
  | { k: 'launch'; weapon: Weapon }
  | { k: 'fleet'; fleet: number }
  | { k: 'aid'; to: number; kind: 'support' | 'gift'; amount: number };

type CardKind = 'region' | 'sea' | 'build' | 'army' | 'weapons' | 'diplo';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const ic = (name: string, cls = '') => `<img class="px ${cls}" src="${iconURL(name)}" alt="">`;
const RES_ICON: Record<string, string> = { gold: 'gold', food: 'food', wood: 'wood', steel: 'steel' };
const REL_NAME = ['سلام', 'حرب', 'عدم اعتداء', 'حليف'];
const REL_CLS = ['', 'war', 'nap', 'ally'];

export class Hud {
  private top!: HTMLElement; private dock!: HTMLElement; private card!: HTMLElement; private banner!: HTMLElement;
  private toasts!: HTMLElement; private resdrop!: HTMLElement;
  private cardKind: CardKind | null = null;
  private region = -1; private sea = -1;
  private mode: Mode | null = null;
  private attackShare = 0.5; private withArmor = true; private expand = false; private moveShare = 0.5;
  private openNation = -1;
  private lastEvent = 0;
  private lastTop = 0; private lastCard = 0;
  private interacting = false;
  private ended = false;
  private seenRequests = new Set<number>();

  constructor(private g: Game, private scene: WorldScene, private me: number, private onNewGame: () => void) {
    this.build();
    scene.onTap = t => this.tap(t.region, t.sea);
    scene.onFrame = () => this.frame();
    window.addEventListener('keydown', this.onKey);
    if (innerHeight > innerWidth * 1.2) setTimeout(() => this.toast('تلميح: قرّب بإصبعين، أو أدر الجوال أفقيًا لرؤية أوسع'), 600);
  }

  private get nat() { return this.g.nations[this.me]; }

  private onKey = (e: KeyboardEvent) => this.key(e);
  private onUp = () => { this.interacting = false; };

  destroy() { window.removeEventListener('keydown', this.onKey); window.removeEventListener('pointerup', this.onUp); for (const el of [this.top, this.dock, this.card, this.banner, this.toasts, this.resdrop]) el.remove(); document.querySelectorAll('.screen').forEach(e => e.remove()); }

  // ---------------- layout ----------------
  private build() {
    const add = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); const el = d.firstElementChild as HTMLElement; document.body.appendChild(el); return el; };
    this.top = add(`<div id="topbar">
      <div class="res" id="r-gold" data-act="res">${ic('gold')}<b id="v-gold">0</b><span class="rate" id="v-goldr"></span></div>
      <div class="res" id="r-sold" data-act="res">${ic('soldier')}<b id="v-sold">0</b></div>
      <div id="share" title="نسبة السيطرة على العالم (الفوز عند 80%)">${ic('globe')}<div class="bar"><div class="fill" id="v-fill"></div><div class="leader" id="v-lead"></div><div class="goal"></div></div><b id="v-share">0%</b></div>
      <button class="tb-btn" data-act="pause" id="b-pause" title="إيقاف مؤقت (مسافة)">${ic('pause')}</button>
      <button class="tb-btn spd on" data-act="speed" data-v="1">1×</button>
      <button class="tb-btn spd" data-act="speed" data-v="2">2×</button>
      <button class="tb-btn spd" data-act="speed" data-v="4">4×</button>
      <button class="tb-btn" data-act="menu" title="القائمة">${ic('menu')}</button>
    </div>`);
    this.resdrop = add(`<div id="resdrop" class="hidden"></div>`);
    this.dock = add(`<div id="dock">
      <button class="fab" data-act="open" data-v="build" title="بناء (B)">${ic('build')}<span class="tip">بناء</span></button>
      <button class="fab" data-act="open" data-v="army" title="الجيش (A)">${ic('army')}<span class="tip">الجيش والأساطيل</span></button>
      <button class="fab" data-act="open" data-v="weapons" title="الأسلحة (W)">${ic('nuke')}<span class="tip">الأسلحة الاستراتيجية</span></button>
      <button class="fab" data-act="open" data-v="diplo" title="التحالفات (D)">${ic('handshake')}<span class="tip">الدبلوماسية</span><span class="badge hidden" id="diplobadge">0</span></button>
      <button class="fab" id="dockToggle" data-act="dock" title="إخفاء الأزرار">▾</button>
    </div>`);
    this.card = add(`<div id="card" class="hidden"></div>`);
    this.banner = add(`<div id="banner" class="hidden"></div>`);
    this.toasts = add(`<div id="toasts"></div>`);
    for (const el of [this.top, this.dock, this.card, this.banner, this.resdrop]) el.addEventListener('click', e => this.click(e));
    this.card.addEventListener('input', e => this.input(e));
    this.card.addEventListener('pointerdown', () => { this.interacting = true; });
    window.addEventListener('pointerup', this.onUp);
  }

  // ---------------- per frame ----------------
  private frame() {
    const now = performance.now();
    if (now - this.lastTop > 250) { this.lastTop = now; this.updateTop(); this.updateBanner(); this.pollEvents(); }
    if (this.cardKind && !this.interacting && now - this.lastCard > 700) { this.lastCard = now; this.renderCard(); }
    if (this.g.phase === 'over' && !this.ended) { this.ended = true; this.showEnd(); }
    if (!this.nat.alive && !this.ended && this.g.phase === 'war') { this.ended = true; this.showEnd(); }
  }

  private updateTop() {
    const n = this.nat, g = this.g;
    const set = (id: string, v: string) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
    set('v-gold', fmt(n.gold));
    const r = n.income.gold;
    const rate = document.getElementById('v-goldr')!;
    rate.textContent = (r >= 0 ? '+' : '') + r.toFixed(1); rate.classList.toggle('neg', r < 0);
    set('v-sold', fmt(n.soldiers));
    const share = g.share(this.me) * 100;
    set('v-share', share.toFixed(1) + '%');
    (document.getElementById('v-fill') as HTMLElement).style.width = Math.min(100, share / 0.8) * 0.8 + '%';
    const leader = Math.max(...g.nations.filter(x => x.id !== this.me).map(x => g.share(x.id))) * 100;
    (document.getElementById('v-lead') as HTMLElement).style.insetInlineStart = Math.min(100, leader) + '%';
    document.getElementById('r-gold')!.classList.toggle('warn', n.bankrupt);
    document.getElementById('r-sold')!.classList.toggle('warn', n.starving);
    if (!this.resdrop.classList.contains('hidden')) this.renderResDrop();
    const pending = g.requests.filter(q => q.to === this.me).length;
    const badge = document.getElementById('diplobadge')!;
    badge.textContent = String(pending); badge.classList.toggle('hidden', pending === 0);
  }

  private renderResDrop() {
    const n = this.nat;
    const row = (icon: string, label: string, v: string, rate?: number) => `<div class="row"><span>${ic(icon)} ${label}</span><b>${v}${rate !== undefined ? ` <span class="rate ${rate < 0 ? 'neg' : ''}">${rate >= 0 ? '+' : ''}${rate.toFixed(1)}/ث</span>` : ''}</b></div>`;
    this.resdrop.innerHTML =
      row('gold', 'الذهب', fmt(n.gold), n.income.gold) + row('food', 'الغذاء', fmt(n.food), n.income.food) +
      row('wood', 'الخشب', fmt(n.wood), n.income.wood) + row('steel', 'الفولاذ', fmt(n.steel), n.income.steel) +
      row('pop', 'السكان', `${fmt(n.pop)} / ${fmt(n.housing)}`, n.income.pop) +
      row('build', 'الوظائف', `${fmt(Math.min(n.labor, n.jobs))} / ${fmt(n.jobs)} (${Math.round(n.fill * 100)}%)`) +
      row('soldier', 'الجنود', `${fmt(n.soldiers)} / ${fmt(n.capacity)}`) + row('tank', 'مدرعات / مدفعية', `${fmt(n.tanks)} / ${fmt(n.arts)}`) +
      row('heart', 'جرحى', fmt(n.wounded)) +
      (n.starving ? `<div class="err">مجاعة! ابنِ مزارع — الجنود يهربون</div>` : '') +
      (n.bankrupt ? `<div class="err">إفلاس! قلّل الجيش أو ابنِ مصانع</div>` : '') +
      (n.fill < 0.8 ? `<div class="err">نقص عمال: ابنِ مدنًا لزيادة السكان</div>` : '');
  }

  private updateBanner() {
    const g = this.g, b = this.banner;
    let html = '';
    if (g.phase === 'founding') html = `<span>${this.nat.founded ? 'يمكنك تغيير الموقع' : 'اضغط على اليابسة لتأسيس دولتك'}</span><span class="count">${Math.ceil(g.foundingLeft)}</span>`;
    else if (this.mode) {
      const m = this.mode;
      const txt = m.k === 'move' ? 'اختر منطقتك الوجهة لنقل القوات' : m.k === 'air' ? 'اختر هدف الضربة الجوية' : m.k === 'rebase' ? 'اختر قاعدة جوية (لك أو لحليف) أو بحرًا فيه حاملتك'
        : m.k === 'launch' ? `اختر هدف ${WEAPONS[m.weapon].name}` : m.k === 'fleet' ? 'اختر منطقة بحرية لتحريك الأسطول' : 'اختر منطقة الحليف';
      html = `<span>${txt}</span><button class="btn sm danger" data-act="cancelMode">إلغاء</button>`;
    }
    if (b.dataset.html !== html) { b.dataset.html = html; b.innerHTML = html; }
    b.classList.toggle('hidden', !html);
  }

  private pollEvents() {
    const g = this.g;
    for (; this.lastEvent < g.events.length; this.lastEvent++) {
      const e = g.events[this.lastEvent];
      const mine = e.a === this.me || e.b === this.me;
      const friend = (e.a >= 0 && e.a !== this.me && g.allied(this.me, e.a)) || (e.b >= 0 && e.b !== this.me && g.allied(this.me, e.b));
      const global = ['nuke', 'win', 'start'].includes(e.kind) || (e.kind === 'elim' && g.time > 300);
      if (!(mine || global || (friend && e.important)) || e.kind === 'request') continue;
      const bad = mine && (e.b === this.me && ['war', 'nuke', 'capital'].includes(e.kind));
      this.toast(e.text, bad ? 'bad' : e.kind === 'nuke' || e.kind === 'win' ? 'big' : '');
    }
    if (g.events.length < this.lastEvent) this.lastEvent = g.events.length;
    // diplomatic requests are summarised in one toast instead of one per request
    const fresh = g.requests.filter(q => q.to === this.me && !this.seenRequests.has(q.id));
    for (const q of fresh) this.seenRequests.add(q.id);
    if (fresh.length) this.toast(fresh.length === 1 ? `${g.nations[fresh[0].from].name} تطلب ${{ alliance: 'تحالفًا', nap: 'عدم اعتداء', transit: 'عبورًا', help: 'مساعدة' }[fresh[0].type]} — التحالفات` : `${fresh.length} طلبات دبلوماسية جديدة — التحالفات`, 'big');
  }

  toast(text: string, cls = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + cls; t.textContent = text;
    this.toasts.prepend(t);
    while (this.toasts.children.length > (innerWidth < 600 ? 2 : 4)) this.toasts.lastElementChild!.remove();
    setTimeout(() => t.remove(), cls === 'big' ? 6000 : 3800);
  }

  // ---------------- input ----------------
  private key(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (this.mode) this.setMode(null); else this.closeCard(); }
    else if (k === ' ') { e.preventDefault(); this.scene.paused = !this.scene.paused; this.syncSpeed(); }
    else if (k === 'b') this.openCard('build');
    else if (k === 'a') this.openCard('army');
    else if (k === 'w' && !e.repeat && e.shiftKey) this.openCard('weapons');
    else if (k === 'd' && e.shiftKey) this.openCard('diplo');
    else if (k === 'h' && this.nat.capital >= 0) { const R = this.g.map.regions[this.nat.capital]; this.scene.flyTo(R.cx, R.cy, 2); }
    else if (k === '1' || k === '2' || k === '4') { this.scene.speed = Number(k); this.syncSpeed(); }
  }

  private run(cmd: Command, okMsg?: string) {
    const r = this.g.command(this.me, cmd);
    if (!r.ok) this.toast(r.error ?? 'تعذر التنفيذ', 'bad');
    else if (okMsg || r.info) this.toast(okMsg ?? r.info!);
    this.lastCard = 0;
    return r.ok;
  }

  private tap(region: number, sea: number) {
    const g = this.g;
    document.getElementById('resdrop')?.classList.add('hidden');
    if (g.phase === 'founding') {
      if (region < 0) return;
      const r = g.command(this.me, { c: 'found', region });
      if (!r.ok) this.toast(r.error!, 'bad');
      else { this.scene.select(region); this.toast('تم اختيار موقع العاصمة'); }
      return;
    }
    const m = this.mode;
    if (m) {
      let done = false;
      if (m.k === 'move' && region >= 0) done = this.run({ c: 'move', from: m.from, to: region, amount: g.inf[m.from] * m.share, tanks: g.tank[m.from] * m.share, arts: g.art[m.from] * m.share }, 'القوات تتحرك');
      else if (m.k === 'air') {
        if (region >= 0) done = this.run({ c: 'airStrike', base: m.base, carrier: m.carrier >= 0 ? m.carrier : undefined, target: region });
        else if (sea >= 0) done = this.run({ c: 'airStrike', base: m.base, carrier: m.carrier >= 0 ? m.carrier : undefined, target: -1, sea });
      } else if (m.k === 'rebase') {
        if (region >= 0) done = this.run({ c: 'rebase', base: m.base, carrier: m.carrier >= 0 ? m.carrier : undefined, toBase: region });
        else if (sea >= 0) {
          const f = [...g.fleets.values()].find(x => x.sea === sea && x.ships.carrier >= 0.5 && (x.owner === this.me || g.allied(this.me, x.owner)));
          if (f) done = this.run({ c: 'rebase', base: m.base, carrier: m.carrier >= 0 ? m.carrier : undefined, toCarrier: f.id });
          else this.toast('لا توجد حاملة طائرات هنا', 'bad');
        }
      } else if (m.k === 'launch' && region >= 0) done = this.run({ c: 'launch', weapon: m.weapon, target: region });
      else if (m.k === 'fleet' && sea >= 0) done = this.run({ c: 'fleetMove', fleet: m.fleet, sea }, 'الأسطول يبحر');
      else if (m.k === 'aid' && region >= 0) done = this.run({ c: m.kind === 'gift' ? 'giftTroops' : 'support', to: m.to, amount: m.amount, region });
      if (done) this.setMode(null);
      return;
    }
    if (region >= 0) { this.region = region; this.sea = -1; this.scene.select(region, g.owner[region] === this.me ? '#bfe0ff' : '#ffffff'); this.openCard('region'); }
    else if (sea >= 0) { this.sea = sea; this.region = -1; this.scene.select(-1); this.openCard('sea'); }
  }

  private setMode(m: Mode | null) {
    this.mode = m;
    const g = this.g;
    if (m?.k === 'launch') {
      const w = WEAPONS[m.weapon];
      this.scene.setRanges(g.nationBuildings(this.me, 'silo', w.siloLevel).map(r => ({ x: g.map.regions[r].cx, y: g.map.regions[r].cy, r: Math.min(w.range, 600) })));
    } else if (m?.k === 'air') {
      const p = m.carrier >= 0 ? g.fleets.get(m.carrier) : g.center(m.base);
      const grp = [...g.airGroups.values()].find(a => a.owner === this.me && (m.carrier >= 0 ? a.carrier === m.carrier : a.base === m.base && a.carrier < 0));
      const range = grp ? Math.max(...AIR_UNITS.filter(k => grp.planes[k] >= 1).map(k => AIR[k].range ?? 30)) : 30;
      this.scene.setRanges(p ? [{ x: p.x, y: p.y, r: range }] : []);
    } else this.scene.setRanges([]);
    this.updateBanner();
    if (m) this.closeCard();
  }

  private syncSpeed() {
    this.top.querySelectorAll('.spd').forEach(b => b.classList.toggle('on', Number((b as HTMLElement).dataset.v) === this.scene.speed && !this.scene.paused));
    this.top.querySelector('#b-pause')!.innerHTML = ic(this.scene.paused ? 'play' : 'pause');
    this.top.querySelector('#b-pause')!.classList.toggle('on', this.scene.paused);
  }

  private input(e: Event) {
    const t = e.target as HTMLInputElement;
    if (t.dataset.in === 'share') { this.attackShare = Number(t.value) / 100; this.updateAttackLabel(); }
    if (t.dataset.in === 'armor') this.withArmor = t.checked;
    if (t.dataset.in === 'expand') this.expand = t.checked;
    if (t.dataset.in === 'auto') this.run({ c: 'autoRecruit', on: t.checked });
  }

  private updateAttackLabel() {
    const el = this.card.querySelector('[data-attack-n]') as HTMLElement | null;
    if (!el) return;
    const avail = Number(el.dataset.attackN);
    el.textContent = fmt(avail * this.attackShare);
    this.card.querySelectorAll('.chip[data-act=share]').forEach(c => c.classList.toggle('on', Math.abs(Number((c as HTMLElement).dataset.v) - this.attackShare) < 0.01));
    const sl = this.card.querySelector('input[data-in=share]') as HTMLInputElement | null;
    if (sl && document.activeElement !== sl) sl.value = String(Math.round(this.attackShare * 100));
  }

  private click(e: Event) {
    const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!el) return;
    const act = el.dataset.act!, v = el.dataset.v ?? '';
    const num = Number(v);
    const g = this.g;
    switch (act) {
      case 'res': this.resdrop.classList.toggle('hidden'); this.renderResDrop(); break;
      case 'pause': this.scene.paused = !this.scene.paused; this.syncSpeed(); break;
      case 'speed': this.scene.speed = num; this.scene.paused = false; this.syncSpeed(); break;
      case 'menu': this.showMenu(); break;
      case 'dock': this.dock.classList.toggle('collapsed'); el.textContent = this.dock.classList.contains('collapsed') ? '▴' : '▾'; break;
      case 'open': this.cardKind === v ? this.closeCard() : this.openCard(v as CardKind); break;
      case 'close': this.closeCard(); break;
      case 'cancelMode': this.setMode(null); break;
      case 'share': this.attackShare = num; this.updateAttackLabel(); break;
      case 'attack': {
        const av = availableFor(g, this.me, this.region);
        const s = this.attackShare;
        this.run({ c: 'attack', target: this.region, amount: av.inf * s, tanks: this.withArmor ? av.tank * s : 0, arts: this.withArmor ? av.art * s : 0, expand: this.expand });
        break;
      }
      case 'moveShare': this.moveShare = num; this.renderCard(); break;
      case 'move': this.setMode({ k: 'move', from: this.region, share: this.moveShare }); break;
      case 'withdraw': this.run({ c: 'withdraw', region: this.region }, 'انسحاب القوات'); break;
      case 'build': this.run({ c: 'build', region: this.region, type: v as BuildingType }, `بدأ بناء ${BUILDINGS[v as BuildingType].name}`); break;
      case 'upgrade': this.run({ c: 'upgrade', region: this.region, type: v as BuildingType }, 'بدأ التطوير'); break;
      case 'demolish': this.run({ c: 'demolish', region: this.region, type: v as BuildingType }); break;
      case 'produce': this.run({ c: 'produce', region: Number(el.dataset.r ?? this.region), unit: v as any, n: Number(el.dataset.n ?? 1) }); break;
      case 'recruit': this.run({ c: 'recruit', n: num }); break;
      case 'reinforce': this.run({ c: 'reinforce', amount: this.nat.soldiers * num }); break;
      case 'air': this.setMode({ k: 'air', base: Number(el.dataset.base), carrier: Number(el.dataset.carrier ?? -1) }); break;
      case 'airAt': this.quickAir(); break;
      case 'airSea': this.quickAir(this.sea); break;
      case 'rebase': this.setMode({ k: 'rebase', base: Number(el.dataset.base), carrier: Number(el.dataset.carrier ?? -1) }); break;
      case 'loadCarrier': this.run({ c: 'rebase', base: this.region, toCarrier: num }, 'الطائرات تهبط على الحاملة'); break;
      case 'fleet': this.setMode({ k: 'fleet', fleet: num }); break;
      case 'fleetHome': this.run({ c: 'fleetReturn', fleet: num }, 'الأسطول عائد للميناء'); break;
      case 'launch': this.setMode({ k: 'launch', weapon: v as Weapon }); break;
      case 'launchAt': this.run({ c: 'launch', weapon: v as Weapon, target: this.region }); break;
      case 'nation': this.openNation = this.openNation === num ? -1 : num; this.renderCard(); break;
      case 'diplo': {
        const to = Number(el.dataset.to);
        if (v === 'alliance' || v === 'nap' || v === 'transit' || v === 'help') this.run({ c: 'propose', to, type: v });
        else if (v === 'war') this.run({ c: 'declareWar', to });
        else if (v === 'cancel') this.run({ c: 'cancelTreaty', to });
        else if (v === 'gold') this.run({ c: 'sendGold', to, amount: Number(el.dataset.n) }, 'أُرسل الذهب');
        else if (v === 'joint') this.run({ c: 'jointTarget', target: to }, 'دعوت حلفاءك للهجوم المشترك');
        else if (v === 'support' || v === 'gift') this.setMode({ k: 'aid', to, kind: v, amount: this.nat.soldiers * Number(el.dataset.n) });
        break;
      }
      case 'respond': this.run({ c: 'respond', request: num, accept: el.dataset.accept === '1' }); break;
      case 'goto': { const R = g.map.regions[num]; this.scene.flyTo(R.cx, R.cy, 2.2); break; }
      case 'gotoXY': this.scene.flyTo(Number(el.dataset.x), Number(el.dataset.y), 2.2); break;
    }
  }

  private quickAir(sea = -1) {
    const g = this.g, R = sea >= 0 ? g.map.seas[sea] : g.map.regions[this.region];
    let best: { base: number; carrier: number; d: number } | null = null;
    for (const a of g.airGroups.values()) {
      if (a.owner !== this.me || airTotal(a.planes) < 1) continue;
      const p = a.carrier >= 0 ? g.fleets.get(a.carrier) : g.center(a.base);
      if (!p) continue;
      const d = Math.hypot(p.x - R.cx, p.y - R.cy);
      if (!best || d < best.d) best = { base: a.base, carrier: a.carrier, d };
    }
    if (!best) { this.toast('لا توجد طائرات — ابنِ قاعدة جوية واصنع طائرات', 'bad'); return; }
    this.run({ c: 'airStrike', base: best.base, carrier: best.carrier >= 0 ? best.carrier : undefined, target: sea >= 0 ? -1 : this.region, sea: sea >= 0 ? sea : undefined });
  }

  // ---------------- cards ----------------
  openCard(k: CardKind) {
    this.cardKind = k;
    this.dock.querySelectorAll('.fab').forEach(b => b.classList.toggle('active', (b as HTMLElement).dataset.v === k));
    this.card.classList.remove('hidden');
    this.card.scrollTop = 0;
    this.renderCard();
  }
  closeCard() {
    this.cardKind = null;
    this.card.classList.add('hidden');
    this.dock.querySelectorAll('.fab').forEach(b => b.classList.remove('active'));
    this.scene.select(-1);
  }

  private renderCard() {
    if (!this.cardKind) return;
    const k = this.cardKind;
    let html = `<button class="x" data-act="close" title="إغلاق">${ic('close')}</button>`;
    if (k === 'region' && this.region >= 0) html += this.regionCard(this.region);
    else if (k === 'sea' && this.sea >= 0) html += this.seaCard(this.sea);
    else if (k === 'build') html += this.buildCard();
    else if (k === 'army') html += this.armyCard();
    else if (k === 'weapons') html += this.weaponsCard();
    else if (k === 'diplo') html += this.diploCard();
    const st = this.card.scrollTop;
    this.card.innerHTML = html;
    this.card.scrollTop = st;
  }

  private costHtml(c: Cost, k = 1) {
    const n = this.nat;
    return `<span class="cost">${Object.entries(c).filter(([, v]) => v).map(([r, v]) => `<span class="${(n as any)[r] < v! * k ? 'lack' : ''}">${ic(RES_ICON[r])}${fmt(v! * k)}</span>`).join('')}</span>`;
  }

  private ownerLine(r: number) {
    const g = this.g, o = g.owner[r];
    if (o < 0) return `<span class="swatch" style="background:#777"></span> أرض محايدة`;
    const n = g.nations[o];
    const rel = o === this.me ? '' : ` <span class="rel ${REL_CLS[g.relOf(this.me, o)]}">${REL_NAME[g.relOf(this.me, o)]}</span>`;
    return `<span class="swatch" style="background:${hexColor(n.color)}"></span> ${esc(n.name)}${o === this.me ? ' (أنت)' : ''}${rel}${n.personality ? ` <span class="pers">• ${n.personality.title}</span>` : ''}`;
  }

  private regionCard(r: number) {
    const g = this.g, R = g.map.regions[r], o = g.owner[r];
    let h = `<h3>${esc(regionName(g.map, r))}</h3><div class="sub">${this.ownerLine(r)} • ${TERRAIN_NAMES[R.terrain]}${R.coastal ? ' • ساحلية' : ''}</div>`;
    const troops = o >= 0 ? `<span>${ic('soldier')}${fmt(g.inf[r])}</span><span>${ic('tank')}${fmt(g.tank[r])} / ${fmt(g.art[r])}</span>` : `<span>${ic('soldier')}${fmt(g.neutral[r])} ميليشيا</span>`;
    h += `<div class="stats">${troops}<span>${ic('shield')}دفاع ×${defenseMultiplier(g, r).toFixed(2)}</span><span>${ic('globe')}${R.area} مساحة</span>${g.radiation[r] > 0 ? `<span class="err">☢ إشعاع ${Math.ceil(g.radiation[r])}ث</span>` : ''}${g.battles.has(r) ? `<span class="err">⚔ معركة</span>` : ''}</div>`;
    if (o === this.me) h += this.ownRegion(r);
    else if (o >= 0 && g.allied(this.me, o)) h += this.allyRegion(r);
    else h += this.hostileRegion(r);
    return h;
  }

  private ownRegion(r: number) {
    const g = this.g;
    let h = `<div class="sec"><div class="sec-t">المباني (${g.buildings[r].length}/${g.map.regions[r].slots})</div>`;
    for (const b of g.buildings[r]) {
      const def = BUILDINGS[b.type];
      const img = b.type === 'capital' || b.type === 'city' ? iconURL('flag', hexColor(this.nat.color)) : iconURL(b.type);
      let status = b.level === 0 ? `قيد البناء` : `مستوى ${b.level}`;
      let prog = '';
      if (b.build > 0) { const total = def.time[b.level] || 1; prog = `<div class="prog"><i style="width:${Math.round(100 * (1 - b.build / total))}%"></i></div>`; if (b.level > 0) status += ' • يتطور'; }
      if (b.queue.length) status += ` • ينتج ${b.queue.map(q => `${q.left}× ${(g.unitDef(q.unit as string) ?? (WEAPONS as any)[q.unit])?.name}`).join('، ')}`;
      const canUp = b.build <= 0 && b.level > 0 && b.level < def.maxLevel;
      h += `<div class="bitem"><img class="px bimg" src="${img}"><div class="grow"><div class="nm">${def.name}</div><div class="ds">${status}</div>${prog}</div>
        ${canUp ? `<button class="btn sm" data-act="upgrade" data-v="${b.type}">${ic('up')}تطوير ${this.costHtml(def.cost[b.level])}</button>` : ''}</div>`;
      if (b.level > 0) h += this.productionButtons(r, b.type, b.level);
    }
    h += `<div class="btns" style="margin-top:6px"><button class="btn primary" data-act="open" data-v="build">${ic('build')}بناء هنا</button></div></div>`;
    h += `<div class="sec"><div class="sec-t">القوات</div><div class="chips">${[0.25, 0.5, 1].map(s => `<button class="chip ${Math.abs(s - this.moveShare) < 0.01 ? 'on' : ''}" data-act="moveShare" data-v="${s}">${s * 100}%</button>`).join('')}</div>
      <div class="btns"><button class="btn" data-act="move">${ic('army')}نقل إلى منطقة</button><button class="btn" data-act="withdraw">انسحاب للداخل</button></div></div>`;
    const docked = [...g.fleets.values()].filter(f => f.owner === this.me && f.port === r);
    if (docked.length) h += `<div class="sec"><div class="sec-t">أساطيل راسية</div>${docked.map(f => this.fleetRow(f.id, r)).join('')}</div>`;
    return h;
  }

  private productionButtons(r: number, type: BuildingType, level: number) {
    const g = this.g;
    const btn = (unit: string, n: number, name: string, cost: Cost, minLevel = 1) => {
      const off = level < minLevel;
      return `<button class="btn sm ${off ? 'off' : ''}" ${off ? 'disabled' : ''} data-act="produce" data-r="${r}" data-v="${unit}" data-n="${n}" title="${off ? 'يتطلب مستوى ' + minLevel : ''}">${name}${n > 1 ? ' ×' + n : ''} ${this.costHtml(cost, n)}</button>`;
    };
    let inner = '';
    if (type === 'barracks') inner = [50, 200, 500].map(n => `<button class="btn sm" data-act="recruit" data-v="${n}">تجنيد ${n} ${this.costHtml(LAND.inf.cost, n)}</button>`).join('');
    else if (type === 'factory') inner = btn('tank', 5, 'مدرعات', LAND.tank.cost) + btn('art', 5, 'مدفعية', LAND.art.cost);
    else if (type === 'port') inner = (Object.keys(SEA) as (keyof typeof SEA)[]).map(k => btn(k, 1, SEA[k].name, SEA[k].cost, SEA[k].minLevel)).join('');
    else if (type === 'airbase') inner = (Object.keys(AIR) as (keyof typeof AIR)[]).map(k => btn(k, 2, AIR[k].name, AIR[k].cost, AIR[k].minLevel)).join('') + this.airHere(r);
    else if (type === 'silo') inner = (Object.keys(WEAPONS) as Weapon[]).map(w => { const err = g.produceError(this.me, r, w); return `<button class="btn sm ${err ? 'off' : ''}" ${err ? `disabled title="${err}"` : ''} data-act="produce" data-r="${r}" data-v="${w}" data-n="1">${WEAPONS[w].name} ${this.costHtml(WEAPONS[w].cost)}</button>`; }).join('');
    return inner ? `<div class="btns" style="margin:3px 0 6px">${inner}</div>` : '';
  }

  private airHere(r: number) {
    const g = this.g;
    const grp = [...g.airGroups.values()].find(a => a.owner === this.me && a.base === r && a.carrier < 0);
    if (!grp || airTotal(grp.planes) < 1) return '';
    const list = AIR_UNITS.filter(k => grp.planes[k] >= 1).map(k => `${AIR[k].name} ${Math.floor(grp.planes[k])}`).join('، ');
    const carriers = [...g.fleets.values()].filter(f => f.owner === this.me && f.ships.carrier >= 0.5 && Math.hypot(f.x - g.map.regions[r].cx, f.y - g.map.regions[r].cy) < 40);
    return `<div style="width:100%;font-size:11.5px;margin-top:3px">في القاعدة: ${list}</div>
      <button class="btn sm danger" data-act="air" data-base="${r}">${ic('target')}ضربة جوية</button>
      <button class="btn sm blue" data-act="rebase" data-base="${r}">نقل الطائرات</button>
      ${carriers.map(f => `<button class="btn sm blue" data-act="loadCarrier" data-v="${f.id}">تحميل على الحاملة</button>`).join('')}`;
  }

  private fleetRow(id: number, _r = -1) {
    const g = this.g, f = g.fleets.get(id)!;
    const ships = SEA_UNITS.filter(k => f.ships[k] >= 0.5).map(k => `${SEA[k].name} ${Math.ceil(f.ships[k] - 0.05)}`).join('، ');
    const planes = [...g.airGroups.values()].filter(a => a.carrier === f.id).reduce((s, a) => s + airTotal(a.planes), 0);
    const state = f.cargo.length ? 'ينقل قوات' : f.order === 'invade' ? 'ينتظر القوات' : f.port >= 0 ? 'راسٍ' : f.order === 'move' ? 'يبحر' : f.order === 'return' ? 'عائد' : 'في البحر';
    const own = f.owner === this.me;
    return `<div class="bitem"><img class="px bimg" src="${iconURL('ship', hexColor(g.nations[f.owner].color))}"><div class="grow"><div class="nm">${own ? 'أسطولك' : esc(g.nations[f.owner].name)} • ${state}</div><div class="ds">${ships}${planes ? ` • ${Math.floor(planes)} طائرة` : ''}</div></div>
      ${own ? `<button class="btn sm" data-act="fleet" data-v="${f.id}">تحريك</button>${f.port < 0 ? `<button class="btn sm" data-act="fleetHome" data-v="${f.id}">عودة</button>` : ''}${planes ? `<button class="btn sm danger" data-act="air" data-base="-1" data-carrier="${f.id}">ضربة</button>` : ''}<button class="btn sm" data-act="gotoXY" data-x="${f.x}" data-y="${f.y}">${ic('target')}</button>` : ''}</div>`;
  }

  private allyRegion(r: number) {
    const o = this.g.owner[r];
    return `<div class="sec"><div class="sec-t">مساعدة الحليف</div><div class="btns">
      <button class="btn blue" data-act="diplo" data-v="support" data-to="${o}" data-n="0.15">مساندة بـ15% من جيشك</button>
      <button class="btn" data-act="diplo" data-v="gift" data-to="${o}" data-n="0.1">إهداء 10% جنود</button>
      <button class="btn" data-act="diplo" data-v="gold" data-to="${o}" data-n="300">${ic('gold')}300 ذهب</button></div>
      <div class="note">ثم اضغط منطقة الحليف التي تريد إرسال القوات إليها — تتحرك فعليًا برًا أو بحرًا.</div></div>`;
  }

  private hostileRegion(r: number) {
    const g = this.g, o = g.owner[r];
    const av = availableFor(g, this.me, r);
    const est = estimateDefense(g, r);
    const total = av.inf;
    let h = `<div class="sec"><div class="sec-t">هجوم ${av.naval ? '(إنزال بحري)' : ''}</div>`;
    if (total < 1) {
      h += `<div class="err">${av.naval ? (av.capacity ? 'لا توجد قوات قرب الميناء' : 'لا يوجد طريق بري — تحتاج ميناء وسفن نقل راسية') : 'لا توجد قوات قريبة تصل لهذه المنطقة'}</div>`;
    } else {
      h += `<div class="row2"><span>القوة المرسلة: <b data-attack-n="${total}">${fmt(total * this.attackShare)}</b> من ${fmt(total)}</span><span class="note">المدافعون ≈ ${fmt(est)}</span></div>
        <input type="range" min="1" max="100" value="${Math.round(this.attackShare * 100)}" data-in="share">
        <div class="chips">${[0.25, 0.5, 0.75, 1].map(s => `<button class="chip ${Math.abs(s - this.attackShare) < 0.01 ? 'on' : ''}" data-act="share" data-v="${s}">${s * 100}%</button>`).join('')}</div>
        <div class="row2"><label class="toggle"><input type="checkbox" data-in="armor" ${this.withArmor ? 'checked' : ''}>مع المدرعات (${fmt(av.tank)}) والمدفعية (${fmt(av.art)})</label></div>
        <div class="row2"><label class="toggle"><input type="checkbox" data-in="expand" ${this.expand ? 'checked' : ''}>توسّع مستمر بعد الاحتلال</label></div>
        ${av.naval ? `<div class="note">سعة سفن النقل: ${fmt(av.capacity)} جندي</div>` : ''}
        ${o >= 0 && g.relOf(this.me, o) === REL.peace ? `<div class="err">الهجوم سيعلن الحرب على ${esc(g.nations[o].name)}</div>` : ''}
        <div class="btns" style="margin-top:5px"><button class="btn primary" data-act="attack">${ic('swords')}هجوم!</button></div>`;
    }
    h += `</div><div class="sec"><div class="btns"><button class="btn danger" data-act="airAt">${ic('plane')}ضربة جوية</button>`;
    for (const w of Object.keys(WEAPONS) as Weapon[]) if (this.nat.weapons[w] > 0) h += `<button class="btn danger" data-act="launchAt" data-v="${w}">${ic('nuke')}${WEAPONS[w].name} (${this.nat.weapons[w]})</button>`;
    h += `</div></div>`;
    if (o >= 0) h += `<div class="sec"><div class="sec-t">دبلوماسية</div>${this.nationActions(o)}</div>`;
    return h;
  }

  private seaCard(s: number) {
    const g = this.g;
    const fleets = [...g.fleets.values()].filter(f => f.sea === s);
    let h = `<h3>${ic('ship')} منطقة بحرية</h3><div class="sub">${fleets.length ? fleets.length + ' أسطول هنا' : 'لا توجد أساطيل هنا'}</div>`;
    h += fleets.map(f => this.fleetRow(f.id)).join('');
    const enemies = fleets.some(f => g.atWar(this.me, f.owner));
    if (enemies) h += `<div class="btns" style="margin-top:6px"><button class="btn danger" data-act="airSea">${ic('plane')}ضربة جوية على الأعداء هنا</button></div>`;
    const mine = [...g.fleets.values()].filter(f => f.owner === this.me && f.sea !== s);
    if (mine.length) h += `<div class="sec"><div class="sec-t">أساطيلك الأخرى</div>${mine.slice(0, 6).map(f => this.fleetRow(f.id)).join('')}</div>`;
    return h;
  }

  private buildCard() {
    const g = this.g, r = this.region;
    let h = `<h3>${ic('build')} بناء</h3>`;
    if (r < 0 || g.owner[r] !== this.me) return h + `<div class="sub">اضغط على منطقة من أراضيك أولًا ثم افتح البناء.</div><div class="note">سلسلة الإنتاج: مزارع ← غذاء للسكان والجنود • مدن ← سكن وعمال • حطّابون ومناجم ← خشب وفولاذ • مصنع ← ذهب ومدرعات • ميناء ← سفن • قاعدة جوية ← طائرات • منصة صواريخ + مفاعل ← أسلحة نووية.</div>`;
    h += `<div class="sub">${esc(regionName(g.map, r))} • ${g.buildings[r].length}/${g.map.regions[r].slots} مبانٍ</div>`;
    for (const t of BUILDABLE) {
      const def = BUILDINGS[t];
      const err = g.buildError(this.me, r, t);
      const cost = g.buildCost(this.me, t);
      const afford = g.canAfford(this.nat, cost);
      h += `<div class="bitem"><img class="px bimg" src="${iconURL(t === 'city' ? 'flag' : t, hexColor(this.nat.color))}"><div class="grow"><div class="nm">${def.name}</div><div class="ds">${def.desc} • ${def.workers} عامل</div>${this.costHtml(cost)}${err ? `<div class="err">${err}</div>` : ''}</div>
        <button class="btn sm ${err || !afford ? 'off' : 'primary'}" ${err || !afford ? 'disabled' : ''} data-act="build" data-v="${t}">بناء</button></div>`;
    }
    return h;
  }

  private armyCard() {
    const g = this.g, n = this.nat;
    let h = `<h3>${ic('army')} الجيش</h3><div class="stats"><span>${ic('soldier')}${fmt(n.soldiers)} / ${fmt(n.capacity)}</span><span>${ic('tank')}${fmt(n.tanks)} مدرعة • ${fmt(n.arts)} مدفعية</span><span>${ic('heart')}${fmt(n.wounded)} جريح</span></div>`;
    h += `<div class="sec"><label class="toggle"><input type="checkbox" data-in="auto" ${n.autoRecruit ? 'checked' : ''}>تجنيد تلقائي من المدن والثكنات</label>
      <div class="btns" style="margin-top:5px">${[100, 300, 1000].map(k => `<button class="btn sm" data-act="recruit" data-v="${k}">تجنيد ${k} ${this.costHtml(LAND.inf.cost, k)}</button>`).join('')}</div></div>`;
    h += `<div class="sec"><div class="sec-t">تعزيز أضعف جبهة تلقائيًا</div><div class="btns">${[0.1, 0.25, 0.5].map(s => `<button class="btn sm" data-act="reinforce" data-v="${s}">${s * 100}% من الجيش</button>`).join('')}</div></div>`;
    const fleets = [...g.fleets.values()].filter(f => f.owner === this.me);
    h += `<div class="sec"><div class="sec-t">الأساطيل (${fleets.length})</div>${fleets.length ? fleets.map(f => this.fleetRow(f.id)).join('') : '<div class="note">ابنِ ميناء ثم سفنًا. سفن النقل تحمل الجيوش للقارات الأخرى، والحاملة تحمل 8 طائرات.</div>'}</div>`;
    const groups = [...g.airGroups.values()].filter(a => a.owner === this.me && airTotal(a.planes) >= 1);
    h += `<div class="sec"><div class="sec-t">القوات الجوية</div>${groups.length ? groups.map(a => {
      const where = a.carrier >= 0 ? 'على حاملة' : regionName(g.map, a.base) + (g.owner[a.base] !== this.me ? ' (قاعدة حليف)' : '');
      return `<div class="bitem"><img class="px bimg" src="${iconURL('plane')}"><div class="grow"><div class="nm">${esc(where)}</div><div class="ds">${AIR_UNITS.filter(k => a.planes[k] >= 1).map(k => `${AIR[k].name} ${Math.floor(a.planes[k])}`).join('، ')}</div></div>
        <button class="btn sm danger" data-act="air" data-base="${a.base}" data-carrier="${a.carrier}">ضربة</button><button class="btn sm blue" data-act="rebase" data-base="${a.base}" data-carrier="${a.carrier}">نقل</button></div>`;
    }).join('') : '<div class="note">ابنِ قاعدة جوية لصنع الهليكوبترات والطائرات. لإرسالها لحليف بعيد حمّلها على حاملة طائرات.</div>'}</div>`;
    return h;
  }

  private weaponsCard() {
    const g = this.g, n = this.nat;
    const silos = g.nationBuildings(this.me, 'silo');
    const nuc = Math.max(0, ...g.nationBuildings(this.me, 'nuclear').map(r => g.level(r, 'nuclear')));
    let h = `<h3>${ic('nuke')} الأسلحة الاستراتيجية</h3><div class="sub">منصات الصواريخ: ${silos.length} • المفاعل النووي: ${nuc ? 'مستوى ' + nuc : 'غير موجود'}</div>`;
    for (const w of Object.keys(WEAPONS) as Weapon[]) {
      const d = WEAPONS[w];
      const silo = silos.find(r => !g.produceError(this.me, r, w));
      const err = silo === undefined ? (silos.length ? g.produceError(this.me, silos[0], w) : 'يحتاج منصة صواريخ') : null;
      h += `<div class="bitem"><img class="px bimg" src="${iconURL('nuke')}"><div class="grow"><div class="nm">${d.name} — لديك ${n.weapons[w]}</div><div class="ds">${d.desc} • مدى ${d.range > 1000 ? 'عالمي' : d.range} • نطاق ${d.radius}</div>${this.costHtml(d.cost)}${err ? `<div class="err">${err}</div>` : ''}</div>
        <div class="btns" style="flex-direction:column"><button class="btn sm ${err ? 'off' : ''}" ${err ? 'disabled' : ''} data-act="produce" data-r="${silo ?? -1}" data-v="${w}" data-n="1">تصنيع</button>
        <button class="btn sm danger ${n.weapons[w] < 1 ? 'off' : ''}" ${n.weapons[w] < 1 ? 'disabled' : ''} data-act="launch" data-v="${w}">إطلاق</button></div></div>`;
    }
    h += `<div class="note">الأسلحة تدمر القوات والمباني وتترك إشعاعًا يشلّ الإنتاج، لكنها لا تحتل الأرض. الدفاع الجوي يعترضها. الإطلاق يغضب العالم كله عليك.</div>`;
    return h;
  }

  private nationActions(o: number) {
    const g = this.g, rel = g.relOf(this.me, o);
    const b = (v: string, label: string, cls = '', extra = '') => `<button class="btn sm ${cls}" data-act="diplo" data-v="${v}" data-to="${o}" ${extra}>${label}</button>`;
    let h = '<div class="btns">';
    if (g.teammates(this.me, o)) h += '<span class="note">زميل في الفريق</span>';
    else {
      if (rel === REL.ally) h += b('cancel', 'إلغاء التحالف', 'danger') + b('help', 'طلب مساعدة', 'blue') + b('support', 'مساندة عسكرية', 'blue', 'data-n="0.15"') + b('gift', 'إهداء جنود', '', 'data-n="0.1"');
      else if (rel === REL.nap) h += b('cancel', 'إلغاء الاتفاق', 'danger') + b('alliance', 'عرض تحالف', 'blue');
      else if (rel === REL.war) h += b('nap', 'عرض هدنة', 'blue') + b('joint', 'هجوم مشترك', 'danger');
      else h += b('alliance', 'عرض تحالف', 'blue') + b('nap', 'عدم اعتداء') + b('war', 'إعلان حرب', 'danger');
      if (!g.canTransit(this.me, o)) h += b('transit', 'طلب عبور');
      if (rel !== REL.war) h += b('gold', `${ic('gold')}200`, '', 'data-n="200"') + b('gold', `${ic('gold')}1000`, '', 'data-n="1000"');
    }
    return h + '</div>';
  }

  private diploCard() {
    const g = this.g;
    let h = `<h3>${ic('handshake')} الدبلوماسية</h3>`;
    const reqs = g.requests.filter(q => q.to === this.me);
    if (reqs.length) {
      h += `<div class="sec"><div class="sec-t">طلبات واردة</div>`;
      for (const q of reqs) h += `<div class="bitem"><span class="swatch" style="background:${hexColor(g.nations[q.from].color)}"></span><div class="grow"><div class="nm">${esc(g.nations[q.from].name)}</div><div class="ds">${{ alliance: 'يعرض تحالفًا', nap: 'يعرض عدم اعتداء/هدنة', transit: 'يطلب حق العبور', help: 'يطلب مساعدة عسكرية' }[q.type]}</div></div>
        <button class="btn sm primary" data-act="respond" data-v="${q.id}" data-accept="1">قبول</button><button class="btn sm danger" data-act="respond" data-v="${q.id}" data-accept="0">رفض</button></div>`;
      h += `</div>`;
    }
    const list = g.nations.filter(n => n.alive && n.id !== this.me).sort((a, b) => b.area - a.area);
    h += `<div class="sec"><div class="sec-t">الدول (${list.length})</div>`;
    for (const n of list) {
      const rel = g.relOf(this.me, n.id);
      h += `<div class="nation" data-act="nation" data-v="${n.id}"><span class="swatch" style="background:${hexColor(n.color)}"></span><span class="nm">${esc(n.name)} <span class="pers">${n.personality ? n.personality.title : 'لاعب'}</span></span><span class="note">${(g.share(n.id) * 100).toFixed(1)}%</span><span class="rel ${REL_CLS[rel]}">${g.teammates(this.me, n.id) ? 'فريق' : REL_NAME[rel]}</span></div>`;
      if (this.openNation === n.id) h += `<div style="padding:4px 0 8px">${this.nationActions(n.id)}<div class="btns" style="margin-top:4px"><button class="btn sm" data-act="goto" data-v="${n.capital}">${ic('target')}العاصمة</button></div></div>`;
    }
    return h + `</div>`;
  }

  // ---------------- menus & end screen ----------------
  private showMenu() {
    const wasPaused = this.scene.paused;
    this.scene.paused = true;
    const s = document.createElement('div');
    s.className = 'screen';
    s.innerHTML = `<div class="box"><h1 class="logo">WAR WORLD</h1><div class="btns" style="flex-direction:column;margin-top:12px">
      <button class="btn primary" data-k="resume">متابعة</button><button class="btn" data-k="new">مباراة جديدة</button></div>
      <div class="note" style="margin-top:10px">التحكم: اسحب لتحريك الخريطة، قرّب بإصبعين أو بعجلة الفأرة. اضغط منطقة لعرض تفاصيلها. اختصارات: مسافة = إيقاف، B بناء، A جيش، Shift+W أسلحة، Shift+D تحالفات، H العاصمة، 1/2/4 السرعة، Esc إلغاء.</div></div>`;
    document.body.appendChild(s);
    s.addEventListener('click', e => {
      const k = (e.target as HTMLElement).closest('[data-k]') as HTMLElement | null;
      if (!k) return;
      s.remove();
      if (k.dataset.k === 'new') this.onNewGame(); else { this.scene.paused = wasPaused; this.syncSpeed(); }
    });
  }

  private showEnd() {
    const g = this.g;
    const won = g.winner === this.me || (g.cfg.mode === 'teams' && g.winnerTeam === this.nat.team);
    const title = g.phase === 'over' ? (won ? 'النصر! 🏆' : `انتهت المباراة — الفائز: ${esc(g.nations[g.winner].name)}`) : 'سقطت دولتك';
    const rows = [...g.nations].sort((a, b) => b.stats.peakArea - a.stats.peakArea).slice(0, 10).map(n =>
      `<tr><td><span class="swatch" style="background:${hexColor(n.color)}"></span> ${esc(n.name)}</td><td>${(g.share(n.id) * 100).toFixed(1)}%</td><td>${fmt(n.stats.captured)}</td><td>${fmt(n.stats.kills)}</td><td>${n.stats.nukes}</td></tr>`).join('');
    const s = document.createElement('div');
    s.className = 'screen';
    s.innerHTML = `<div class="box"><h1 class="logo" style="font-size:26px">${title}</h1>
      <div class="note" style="text-align:center">المدة: ${Math.floor(g.time / 60)} دقيقة • مساحتك القصوى ${(this.nat.stats.peakArea / g.map.landArea * 100).toFixed(1)}%</div>
      <canvas id="replay" width="${g.map.w}" height="${g.map.h}"></canvas>
      <table class="results" style="width:100%;margin-top:6px"><tr><th>الدولة</th><th>السيطرة</th><th>مناطق احتلتها</th><th>قتلى العدو</th><th>نووي</th></tr>${rows}</table>
      <div class="btns" style="margin-top:10px"><button class="btn primary" data-k="new">مباراة جديدة</button><button class="btn" data-k="watch">متابعة المشاهدة</button></div></div>`;
    document.body.appendChild(s);
    this.playReplay(s.querySelector('#replay') as HTMLCanvasElement);
    s.addEventListener('click', e => {
      const k = (e.target as HTMLElement).closest('[data-k]') as HTMLElement | null;
      if (!k) return;
      s.remove();
      if (k.dataset.k === 'new') this.onNewGame();
    });
  }

  /** Quick replay of territorial expansion from the 10-second ownership snapshots. */
  private playReplay(cv: HTMLCanvasElement) {
    const g = this.g, map = g.map, ctx = cv.getContext('2d')!;
    const frames = [...g.ownerHistory, g.owner.slice()];
    const cols = g.nations.map(n => [(n.color >> 16) & 255, (n.color >> 8) & 255, n.color & 255]);
    let i = 0;
    const img = ctx.createImageData(map.w, map.h);
    const draw = () => {
      if (!cv.isConnected) return;
      const own = frames[Math.min(i, frames.length - 1)];
      for (let t = 0; t < map.w * map.h; t++) {
        const r = map.regionOf[t], k = t * 4;
        if (r < 0) { img.data[k] = 24; img.data[k + 1] = 44; img.data[k + 2] = 120; }
        else if (own[r] < 0) { img.data[k] = 90; img.data[k + 1] = 110; img.data[k + 2] = 70; }
        else { const c = cols[own[r]]; img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; }
        img.data[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      i = i >= frames.length + 8 ? 0 : i + 1;
      setTimeout(draw, i >= frames.length ? 300 : 120);
    };
    draw();
  }
}
