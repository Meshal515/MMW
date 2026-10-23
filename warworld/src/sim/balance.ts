// Every tunable number of the game lives here: buildings, units, weapons and economy rates.
import { T } from './map/terrain';

export const TICK_RATE = 10;            // simulation ticks per second
export const DT = 1 / TICK_RATE;
export const FOUNDING_SECONDS = 10;
export const VICTORY_SHARE = 0.8;

export type Res = 'gold' | 'food' | 'wood' | 'steel';
export type Cost = Partial<Record<Res, number>>;

export type BuildingType =
  | 'capital' | 'city' | 'farm' | 'lumber' | 'mine' | 'factory' | 'port' | 'barracks'
  | 'hospital' | 'market' | 'bank' | 'power' | 'fort' | 'airbase' | 'silo' | 'nuclear' | 'airdefense';

export interface BuildingDef {
  name: string;
  desc: string;
  cost: Cost[];            // per level (index 0 = build)
  time: number[];          // seconds per level
  workers: number;         // jobs per level
  maxLevel: number;
  upkeep: number;          // gold/s per level
  canBuild?: (r: { terrain: T; coastal: boolean; forestShare: number; hillShare: number }) => boolean;
  needs?: BuildingType;    // another building required in the same region
  hint?: string;           // shown when placement is not allowed
  district?: boolean;      // drawn as a quarter of the city in its region
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  capital: { name: 'العاصمة', desc: 'مركز الدولة: سكن ودخل وجنود — تكبر حتى المستوى 50', cost: [{}], time: [0], workers: 150, maxLevel: 50, upkeep: 0 },
  city: { name: 'مدينة', desc: 'كل مستوى: سكان أكثر، جنود أكثر، متانة أعلى، ومساحة أكبر — حتى المستوى 50', cost: [{ gold: 260, wood: 160 }], time: [12], workers: 80, maxLevel: 50, upkeep: 0.2, canBuild: r => r.terrain !== T.Mountain, hint: 'لا يمكن بناء مدينة على الجبال' },
  farm: { name: 'مزرعة', desc: 'تنتج الغذاء — السكان والجنود يأكلون', cost: [{ gold: 110, wood: 60 }, { gold: 260, wood: 120 }, { gold: 520, wood: 240, steel: 40 }], time: [8, 14, 20], workers: 220, maxLevel: 3, upkeep: 0.1, canBuild: r => r.terrain !== T.Mountain && r.terrain !== T.Snow && r.terrain !== T.Desert, hint: 'تحتاج أرضًا خصبة (ليست صحراء/ثلج/جبال)' },
  lumber: { name: 'حطّابون', desc: 'معسكر قطع أشجار ينتج الخشب', cost: [{ gold: 90 }, { gold: 220, wood: 40 }, { gold: 480, wood: 90, steel: 30 }], time: [7, 12, 18], workers: 180, maxLevel: 3, upkeep: 0.1, canBuild: r => r.forestShare >= 0.2, hint: 'يحتاج منطقة فيها غابات' },
  mine: { name: 'منجم', desc: 'يستخرج الحديد وينتج الفولاذ', cost: [{ gold: 150, wood: 90 }, { gold: 340, wood: 160 }, { gold: 700, wood: 300, steel: 60 }], time: [10, 16, 24], workers: 240, maxLevel: 3, upkeep: 0.15, canBuild: r => r.hillShare >= 0.2, hint: 'يحتاج تلالًا أو جبالًا' },
  factory: { name: 'مصنع', desc: 'يزيد الذهب ويصنع المدرعات والمدفعية', cost: [{ gold: 360, wood: 200, steel: 60 }, { gold: 800, wood: 300, steel: 200 }, { gold: 1700, wood: 500, steel: 450 }], time: [14, 22, 32], workers: 420, maxLevel: 3, upkeep: 0.3, district: true },
  port: { name: 'ميناء', desc: 'يبني السفن ويفتح التجارة البحرية', cost: [{ gold: 300, wood: 260 }, { gold: 700, wood: 420, steel: 120 }, { gold: 1500, wood: 700, steel: 350 }], time: [14, 22, 30], workers: 200, maxLevel: 3, upkeep: 0.25, canBuild: r => r.coastal, hint: 'الميناء يحتاج ساحلًا', district: true },
  barracks: { name: 'ثكنة', desc: 'تجنّد المشاة وتجهز التعزيزات', cost: [{ gold: 200, wood: 130 }, { gold: 480, wood: 220, steel: 60 }, { gold: 1000, wood: 400, steel: 160 }], time: [10, 16, 24], workers: 100, maxLevel: 3, upkeep: 0.2, district: true },
  hospital: { name: 'مستشفى', desc: 'يعالج الجرحى ويعيدهم للخدمة ويسرّع نمو السكان', cost: [{ gold: 260, wood: 120, steel: 40 }, { gold: 600, wood: 200, steel: 120 }, { gold: 1200, wood: 350, steel: 260 }], time: [12, 18, 26], workers: 160, maxLevel: 3, upkeep: 0.25, needs: 'city', hint: 'المستشفى يحتاج مدينة في المنطقة', district: true },
  market: { name: 'سوق تجاري', desc: 'يزيد دخل الذهب — يكبر مع مستوى المدينة', cost: [{ gold: 220, wood: 140 }, { gold: 520, wood: 260, steel: 40 }, { gold: 1100, wood: 420, steel: 140 }], time: [10, 16, 24], workers: 180, maxLevel: 3, upkeep: 0.15, needs: 'city', hint: 'السوق يحتاج مدينة في المنطقة', district: true },
  bank: { name: 'بنك مركزي', desc: 'يسرّع كل دخل الذهب في دولتك بنسبة مئوية', cost: [{ gold: 600, wood: 120, steel: 120 }, { gold: 1400, wood: 240, steel: 300 }, { gold: 3000, wood: 400, steel: 650 }], time: [16, 26, 38], workers: 120, maxLevel: 3, upkeep: 0.3, needs: 'city', hint: 'البنك يحتاج مدينة في المنطقة', district: true },
  power: { name: 'محطة كهرباء', desc: 'تزيد إنتاج المصانع والأسواق والموانئ في منطقتها', cost: [{ gold: 380, wood: 120, steel: 160 }, { gold: 850, wood: 220, steel: 360 }, { gold: 1800, wood: 380, steel: 760 }], time: [14, 22, 32], workers: 140, maxLevel: 3, upkeep: 0.25, district: true },
  fort: { name: 'دفاع حدودي', desc: 'قوة ثابتة على الحدود: مدرعات وجنود وتحصينات تقاتل تلقائيًا ولا تتحرك — تُدمَّر إذا هُزمت', cost: [{ gold: 50, wood: 40, steel: 20 }, { gold: 110, wood: 60, steel: 60 }, { gold: 240, wood: 90, steel: 140 }], time: [10, 16, 24], workers: 60, maxLevel: 3, upkeep: 0.25, hint: 'الدفاع الحدودي يُبنى في منطقة على الحدود' },
  airbase: { name: 'قاعدة جوية', desc: 'تصنع وتؤوي الطائرات والهليكوبترات', cost: [{ gold: 520, wood: 220, steel: 220 }, { gold: 1100, wood: 350, steel: 450 }, { gold: 2200, wood: 500, steel: 900 }], time: [18, 26, 36], workers: 300, maxLevel: 3, upkeep: 0.5, canBuild: r => r.terrain !== T.Mountain, hint: 'لا مدرج على الجبال' },
  silo: { name: 'منصة صواريخ', desc: 'تجهز وتطلق الأسلحة الاستراتيجية', cost: [{ gold: 900, wood: 200, steel: 450 }, { gold: 2200, wood: 400, steel: 1000 }], time: [24, 40], workers: 220, maxLevel: 2, upkeep: 0.8 },
  nuclear: { name: 'مفاعل نووي', desc: 'تخصيب يتيح القنابل الذرية ثم الهيدروجينية', cost: [{ gold: 1600, wood: 300, steel: 650 }, { gold: 3600, wood: 600, steel: 1400 }], time: [30, 50], workers: 420, maxLevel: 2, upkeep: 1.2 },
  airdefense: { name: 'دفاع جوي', desc: 'يعترض الصواريخ والطائرات المعادية', cost: [{ gold: 420, wood: 100, steel: 220 }, { gold: 900, wood: 200, steel: 450 }, { gold: 1800, wood: 300, steel: 900 }], time: [12, 18, 26], workers: 110, maxLevel: 3, upkeep: 0.4 },
};

export const BUILDABLE: BuildingType[] = ['city', 'farm', 'lumber', 'mine', 'factory', 'port', 'barracks', 'hospital', 'market', 'bank', 'power', 'fort', 'airbase', 'silo', 'nuclear', 'airdefense'];

// ---------------- border defense (fort): a fixed garrison, not a damage multiplier ----------------
/**
 * A fort is a real force: its soldiers and armour fight like any garrison, dug in behind a bunker,
 * trenches and tank obstacles. Cover is why they are harder to kill (entrenchment), the bunker soaks
 * hits until it is breached, and the region cannot fall while the fort still stands.
 */
export const FORT = {
  inf: (L: number) => 90 * L,
  tank: (L: number) => 4 * L,
  bunker: (L: number) => 60 + 70 * L,   // structure hit points (absorbs part of the incoming fire)
  entrench: 1.5,                         // dug-in defenders: defence ×1.5 while the bunker stands
  bunkerShare: 0.35,                     // share of incoming fire the bunker takes while standing
  refill: 0.03,                          // share of full strength restored per second out of combat
  extraCost: 25,                         // each extra fort costs this much more gold
};
/** UI shows gold in thousands so prices read like a real treasury (50 → 50,000). */
export const GOLD_DISPLAY = 1000;

// ---------------- cities: levels 1..50 ----------------
export const MAX_CITY_LEVEL = 50;
const isCity = (t: BuildingType) => t === 'city' || t === 'capital';
/** Everything a city of a given level gives. Population (people) and soldiers are separate numbers. */
export const CITY = {
  housing: (L: number, cap: boolean) => Math.round((cap ? 2600 : 1500) * L ** 1.35),
  soldierCap: (L: number, cap: boolean) => Math.round((cap ? 520 : 300) * L ** 1.1),
  recruit: (L: number, cap: boolean) => (cap ? 1.0 : 0.4) * L ** 0.8,
  hp: (L: number) => Math.round(70 + 40 * L ** 1.15),
  defense: (L: number, cap: boolean) => 0.22 * Math.sqrt(L) + (cap ? 0.35 : 0),
  gold: (L: number) => 0.6 * L ** 1.1,
  /** Footprint radius in world pixels (16 px = one map tile). */
  radius: (L: number) => Math.round(20 + 17 * Math.sqrt(Math.max(0, L - 1))),
  /** Districts get stronger in bigger cities. */
  synergy: (L: number) => 1 + 0.03 * (L - 1),
};
/** Cost to start (level 0) or to upgrade from `level` to `level + 1`. */
export function levelCost(type: BuildingType, level: number): Cost {
  if (!isCity(type)) return BUILDINGS[type].cost[level] ?? {};
  if (level === 0) return BUILDINGS[type].cost[0];
  const L = level;
  return { gold: Math.round(240 * L ** 1.55), wood: Math.round(130 * L ** 1.25), ...(L >= 2 ? { steel: Math.round(35 * L ** 1.45) } : {}) };
}
/** Seconds to build (level 0) or upgrade from `level`. */
export function levelTime(type: BuildingType, level: number): number {
  if (!isCity(type)) return BUILDINGS[type].time[level] ?? 0;
  return level === 0 ? BUILDINGS[type].time[0] : Math.round(10 + 2.4 * level);
}

export type LandUnit = 'inf' | 'tank' | 'art';
export type SeaUnit = 'transport' | 'patrol' | 'destroyer' | 'sub' | 'carrier';
export type AirUnit = 'drone' | 'apache' | 'blackhawk' | 'f16' | 'f35' | 'su57' | 'ac130' | 'b52' | 'b2';
export type Weapon = 'atom' | 'hbomb' | 'mirv';
export type UnitType = LandUnit | SeaUnit | AirUnit;

export interface UnitDef {
  name: string; desc: string; cost: Cost; time: number; at: BuildingType; minLevel?: number;
  atk: number; def: number; hp: number; speed: number; upkeep: number;
  range?: number; capacity?: number; hidden?: boolean; detects?: boolean;
  aa?: number;        // air-to-air power (interception / escort)
  guns?: number;      // extra damage against troops (cannons, door guns)
  stealth?: number;   // share of interception it avoids
  bomb?: number;      // multiplier against buildings
  role?: string;      // short role shown in the UI
}

export const LAND: Record<LandUnit, UnitDef> = {
  inf: { name: 'مشاة', desc: 'احتلال الأراضي والدفاع', cost: { gold: 3, food: 1 }, time: 0.08, at: 'barracks', atk: 1, def: 1, hp: 1, speed: 1.3, upkeep: 0.006 },
  tank: { name: 'مدرعة', desc: 'رأس حربة الهجوم البري', cost: { gold: 45, steel: 18 }, time: 2.5, at: 'factory', atk: 5, def: 3.5, hp: 4, speed: 1.7, upkeep: 0.08 },
  art: { name: 'مدفعية', desc: 'إسناد ناري من الخلف — يضاعف قوة الهجوم', cost: { gold: 40, steel: 12, wood: 6 }, time: 2.5, at: 'factory', atk: 4, def: 2.5, hp: 2, speed: 0.9, upkeep: 0.06 },
};

export const SEA: Record<SeaUnit, UnitDef> = {
  transport: { name: 'سفينة نقل', desc: 'تنقل الجيوش بين القارات (250 جندي)', cost: { gold: 90, wood: 70, steel: 20 }, time: 6, at: 'port', atk: 0, def: 1, hp: 10, speed: 3.2, upkeep: 0.15, capacity: 250 },
  patrol: { name: 'زورق دورية', desc: 'سريع ويكشف الغواصات', cost: { gold: 70, wood: 25, steel: 20 }, time: 5, at: 'port', atk: 3, def: 2, hp: 6, speed: 5, upkeep: 0.12, detects: true },
  destroyer: { name: 'مدمرة', desc: 'تقاتل السفن وتحمي الأساطيل', cost: { gold: 200, wood: 40, steel: 90 }, time: 12, at: 'port', minLevel: 2, atk: 9, def: 6, hp: 20, speed: 3.6, upkeep: 0.35, detects: true },
  sub: { name: 'غواصة', desc: 'هجوم خفي — لا يراها إلا الكاشفون', cost: { gold: 220, wood: 20, steel: 110 }, time: 14, at: 'port', minLevel: 2, atk: 13, def: 3, hp: 10, speed: 2.8, upkeep: 0.35, hidden: true },
  carrier: { name: 'حاملة طائرات', desc: 'تحمل 8 طائرات لتعمل بعيدًا عن القواعد', cost: { gold: 700, wood: 150, steel: 350 }, time: 30, at: 'port', minLevel: 3, atk: 2, def: 8, hp: 45, speed: 2.4, upkeep: 1.2, capacity: 8 },
};

export const AIR: Record<AirUnit, UnitDef> = {
  drone: { name: 'مسيّرة MQ-9', role: 'استطلاع وضربات خفيفة — تكشف الغواصات', desc: 'تحلق طويلًا وتكشف الغواصات وتضرب بصواريخ صغيرة', cost: { gold: 90, steel: 30 }, time: 5, at: 'airbase', atk: 3, def: 1, hp: 2, speed: 7, upkeep: 0.1, range: 75, detects: true, aa: 0, guns: 0, bomb: 0.5 },
  apache: { name: 'أباتشي AH-64', role: 'هليكوبتر هجومية: صواريخ هيلفاير ورشاش 30مم', desc: 'تفتك بالمدرعات والمشاة', cost: { gold: 160, steel: 60 }, time: 8, at: 'airbase', atk: 9, def: 2, hp: 5, speed: 7, upkeep: 0.25, range: 32, aa: 1, guns: 5, bomb: 0.6 },
  blackhawk: { name: 'بلاك هوك UH-60', role: 'هجوم ونقل: رشاشات جانبية', desc: 'مساندة قريبة ورشاشات على الجنود', cost: { gold: 120, steel: 40 }, time: 6, at: 'airbase', atk: 3, def: 2, hp: 4, speed: 8, upkeep: 0.2, range: 36, aa: 0, guns: 4, bomb: 0.2 },
  f16: { name: 'F-16 فايتنغ فالكون', role: 'مقاتلة متعددة المهام', desc: 'صواريخ جو-جو وقنابل موجهة', cost: { gold: 210, steel: 85 }, time: 10, at: 'airbase', minLevel: 2, atk: 6, def: 6, hp: 6, speed: 18, upkeep: 0.35, range: 60, aa: 7, guns: 1, bomb: 0.9 },
  f35: { name: 'F-35 لايتنينغ II', role: 'مقاتلة شبحية — تتجنب الدفاعات', desc: 'شبحية: نصف الاعتراضات تفشل', cost: { gold: 390, steel: 150 }, time: 16, at: 'airbase', minLevel: 3, atk: 9, def: 8, hp: 7, speed: 28, upkeep: 0.6, range: 72, aa: 9, guns: 1, stealth: 0.5, bomb: 1 },
  su57: { name: 'Su-57 فيلون', role: 'تفوق جوي — أقوى اعتراض', desc: 'تسيطر على السماء وتسقط الطائرات', cost: { gold: 350, steel: 140 }, time: 15, at: 'airbase', minLevel: 3, atk: 6, def: 9, hp: 8, speed: 22, upkeep: 0.55, range: 66, aa: 12, guns: 1, stealth: 0.2, bomb: 0.7 },
  ac130: { name: 'AC-130 غانشيب', role: 'إسناد ناري: مدافع جانبية مستمرة', desc: 'تدور فوق الهدف وتحصد المشاة', cost: { gold: 380, steel: 150 }, time: 16, at: 'airbase', minLevel: 2, atk: 8, def: 3, hp: 10, speed: 6, upkeep: 0.6, range: 55, aa: 0, guns: 14, bomb: 0.5 },
  b52: { name: 'B-52 ستراتوفورتريس', role: 'قاذفة ثقيلة: قصف بساطي', desc: 'تدمر المباني والتجمعات بعيدًا', cost: { gold: 430, steel: 180 }, time: 18, at: 'airbase', minLevel: 2, atk: 22, def: 3, hp: 12, speed: 9, upkeep: 0.7, range: 120, aa: 0, guns: 0, bomb: 1.5 },
  b2: { name: 'B-2 سبيريت', role: 'قاذفة شبحية بعيدة المدى', desc: 'تخترق الدفاعات وتضرب العمق', cost: { gold: 720, steel: 260 }, time: 24, at: 'airbase', minLevel: 3, atk: 26, def: 3, hp: 9, speed: 10, upkeep: 1, range: 145, aa: 0, guns: 0, stealth: 0.6, bomb: 1.6 },
};

export interface WeaponDef { name: string; desc: string; cost: Cost; time: number; siloLevel: number; nuclearLevel: number; range: number; radius: number; warheads: number; speed: number; intercept: number }
export const WEAPONS: Record<Weapon, WeaponDef> = {
  atom: { name: 'قنبلة ذرية', desc: 'تدمير موضعي وإشعاع', cost: { gold: 1600, steel: 400 }, time: 30, siloLevel: 1, nuclearLevel: 1, range: 130, radius: 4.5, warheads: 1, speed: 22, intercept: 0.4 },
  hbomb: { name: 'قنبلة هيدروجينية', desc: 'دمار هائل على مساحة واسعة', cost: { gold: 4200, steel: 900 }, time: 55, siloLevel: 1, nuclearLevel: 2, range: 190, radius: 9, warheads: 1, speed: 20, intercept: 0.3 },
  mirv: { name: 'صاروخ MIRV', desc: '4 رؤوس مستقلة تضرب مدنًا متعددة — مدى عالمي', cost: { gold: 9000, steel: 2000 }, time: 80, siloLevel: 2, nuclearLevel: 2, range: 9999, radius: 5.5, warheads: 4, speed: 26, intercept: 0.2 },
};

export const ECON = {
  startGold: 700, startFood: 400, startWood: 300, startSteel: 120, startPop: 3200, startInf: 450,
  housing: { rural: 70 },
  growth: 0.007,              // logistic growth per second
  laborShare: 0.55,           // share of population that can work
  taxEmployed: 0.0045, taxIdle: 0.0012,
  farmFood: 7, lumberWood: 4.5, mineSteel: 3.2, factoryGold: 9, portGold: 3.5, portAllyGold: 1.2, marketGold: 5, bankBoost: 0.08, powerBoost: 0.2,
  regionFood: 0.18, regionGold: 0.05,
  foodPerPop: 0.001, foodPerSoldier: 0.0022,
  passiveRecruit: { barracks: 0.9 }, // soldiers/s per level (cities use CITY.recruit)
  capacity: { barracks: 500, region: 25 },
  woundedShare: 0.35, healRate: 0.6, hospitalBeds: 400,
  lootShare: 0.3,
};

export const COMBAT = {
  rate: 0.45,               // strength removed per second per unit of opposing strength
  artilleryBoost: 0.5,      // attack multiplier per artillery share
  airSupportBoost: 0.35,
  neutralPerTile: 1.6,      // neutral militia per tile
  expandGarrisonPerTile: 0.4,
  // frontage: only part of a big army can engage at once — the front is as wide as the defence it faces
  frontageBase: 140, frontagePerDefender: 0.7,
  fortFrontage: 0.6,        // obstacles and trenches funnel attackers into narrow lanes
};

export const DIPLO = {
  allianceBreakSeconds: 10, napSeconds: 240, napBreakSeconds: 15, requestTtl: 30,
};

export const RADIATION_SECONDS = 120;
