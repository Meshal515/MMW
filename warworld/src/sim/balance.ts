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
  | 'hospital' | 'airbase' | 'silo' | 'nuclear' | 'airdefense';

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
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  capital: { name: 'العاصمة', desc: 'مركز الدولة: سكن ودخل وجنود', cost: [{}, { gold: 800, wood: 300, steel: 100 }, { gold: 2000, wood: 700, steel: 300 }], time: [0, 25, 40], workers: 150, maxLevel: 3, upkeep: 0 },
  city: { name: 'مدينة', desc: 'تسكن السكان وتزيد الدخل وإنتاج الجنود', cost: [{ gold: 260, wood: 160 }, { gold: 650, wood: 320, steel: 80 }, { gold: 1500, wood: 650, steel: 260 }], time: [12, 22, 34], workers: 80, maxLevel: 3, upkeep: 0.2, canBuild: r => r.terrain !== T.Mountain, hint: 'لا يمكن بناء مدينة على الجبال' },
  farm: { name: 'مزرعة', desc: 'تنتج الغذاء — السكان والجنود يأكلون', cost: [{ gold: 110, wood: 60 }, { gold: 260, wood: 120 }, { gold: 520, wood: 240, steel: 40 }], time: [8, 14, 20], workers: 220, maxLevel: 3, upkeep: 0.1, canBuild: r => r.terrain !== T.Mountain && r.terrain !== T.Snow && r.terrain !== T.Desert, hint: 'تحتاج أرضًا خصبة (ليست صحراء/ثلج/جبال)' },
  lumber: { name: 'حطّابون', desc: 'معسكر قطع أشجار ينتج الخشب', cost: [{ gold: 90 }, { gold: 220, wood: 40 }, { gold: 480, wood: 90, steel: 30 }], time: [7, 12, 18], workers: 180, maxLevel: 3, upkeep: 0.1, canBuild: r => r.forestShare >= 0.2, hint: 'يحتاج منطقة فيها غابات' },
  mine: { name: 'منجم', desc: 'يستخرج الحديد وينتج الفولاذ', cost: [{ gold: 150, wood: 90 }, { gold: 340, wood: 160 }, { gold: 700, wood: 300, steel: 60 }], time: [10, 16, 24], workers: 240, maxLevel: 3, upkeep: 0.15, canBuild: r => r.hillShare >= 0.2, hint: 'يحتاج تلالًا أو جبالًا' },
  factory: { name: 'مصنع', desc: 'يزيد الذهب ويصنع المدرعات والمدفعية', cost: [{ gold: 360, wood: 200, steel: 60 }, { gold: 800, wood: 300, steel: 200 }, { gold: 1700, wood: 500, steel: 450 }], time: [14, 22, 32], workers: 420, maxLevel: 3, upkeep: 0.3 },
  port: { name: 'ميناء', desc: 'يبني السفن ويفتح التجارة البحرية', cost: [{ gold: 300, wood: 260 }, { gold: 700, wood: 420, steel: 120 }, { gold: 1500, wood: 700, steel: 350 }], time: [14, 22, 30], workers: 200, maxLevel: 3, upkeep: 0.25, canBuild: r => r.coastal, hint: 'الميناء يحتاج ساحلًا' },
  barracks: { name: 'ثكنة', desc: 'تجنّد المشاة وتجهز التعزيزات', cost: [{ gold: 200, wood: 130 }, { gold: 480, wood: 220, steel: 60 }, { gold: 1000, wood: 400, steel: 160 }], time: [10, 16, 24], workers: 100, maxLevel: 3, upkeep: 0.2 },
  hospital: { name: 'مستشفى', desc: 'يعالج الجرحى ويعيدهم للخدمة ويسرّع نمو السكان', cost: [{ gold: 260, wood: 120, steel: 40 }, { gold: 600, wood: 200, steel: 120 }, { gold: 1200, wood: 350, steel: 260 }], time: [12, 18, 26], workers: 160, maxLevel: 3, upkeep: 0.25, needs: 'city', hint: 'المستشفى يحتاج مدينة في المنطقة' },
  airbase: { name: 'قاعدة جوية', desc: 'تصنع وتؤوي الطائرات والهليكوبترات', cost: [{ gold: 520, wood: 220, steel: 220 }, { gold: 1100, wood: 350, steel: 450 }, { gold: 2200, wood: 500, steel: 900 }], time: [18, 26, 36], workers: 300, maxLevel: 3, upkeep: 0.5, canBuild: r => r.terrain !== T.Mountain, hint: 'لا مدرج على الجبال' },
  silo: { name: 'منصة صواريخ', desc: 'تجهز وتطلق الأسلحة الاستراتيجية', cost: [{ gold: 900, wood: 200, steel: 450 }, { gold: 2200, wood: 400, steel: 1000 }], time: [24, 40], workers: 220, maxLevel: 2, upkeep: 0.8 },
  nuclear: { name: 'مفاعل نووي', desc: 'تخصيب يتيح القنابل الذرية ثم الهيدروجينية', cost: [{ gold: 1600, wood: 300, steel: 650 }, { gold: 3600, wood: 600, steel: 1400 }], time: [30, 50], workers: 420, maxLevel: 2, upkeep: 1.2 },
  airdefense: { name: 'دفاع جوي', desc: 'يعترض الصواريخ والطائرات المعادية', cost: [{ gold: 420, wood: 100, steel: 220 }, { gold: 900, wood: 200, steel: 450 }, { gold: 1800, wood: 300, steel: 900 }], time: [12, 18, 26], workers: 110, maxLevel: 3, upkeep: 0.4 },
};

export const BUILDABLE: BuildingType[] = ['city', 'farm', 'lumber', 'mine', 'factory', 'port', 'barracks', 'hospital', 'airbase', 'silo', 'nuclear', 'airdefense'];

export type LandUnit = 'inf' | 'tank' | 'art';
export type SeaUnit = 'transport' | 'patrol' | 'destroyer' | 'sub' | 'carrier';
export type AirUnit = 'scout' | 'heli' | 'fighter' | 'bomber';
export type Weapon = 'atom' | 'hbomb' | 'mirv';
export type UnitType = LandUnit | SeaUnit | AirUnit;

export interface UnitDef {
  name: string; desc: string; cost: Cost; time: number; at: BuildingType; minLevel?: number;
  atk: number; def: number; hp: number; speed: number; upkeep: number;
  range?: number; capacity?: number; hidden?: boolean; detects?: boolean;
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
  scout: { name: 'هليكوبتر استطلاع', desc: 'يكشف الغواصات ويوجّه القصف', cost: { gold: 70, steel: 25 }, time: 5, at: 'airbase', atk: 1, def: 1, hp: 2, speed: 9, upkeep: 0.1, range: 30, detects: true },
  heli: { name: 'هليكوبتر هجومية', desc: 'تفتك بالمدرعات والمشاة', cost: { gold: 140, steel: 50 }, time: 8, at: 'airbase', atk: 9, def: 2, hp: 4, speed: 8, upkeep: 0.25, range: 34 },
  fighter: { name: 'مقاتلة', desc: 'تفرض السيطرة الجوية وتعترض', cost: { gold: 200, steel: 80 }, time: 10, at: 'airbase', minLevel: 2, atk: 6, def: 8, hp: 6, speed: 14, upkeep: 0.35, range: 60 },
  bomber: { name: 'قاذفة', desc: 'تدمر المباني والتجمعات بعيدًا', cost: { gold: 340, steel: 140 }, time: 14, at: 'airbase', minLevel: 2, atk: 16, def: 3, hp: 8, speed: 10, upkeep: 0.5, range: 95 },
};

export interface WeaponDef { name: string; desc: string; cost: Cost; time: number; siloLevel: number; nuclearLevel: number; range: number; radius: number; warheads: number; speed: number; intercept: number }
export const WEAPONS: Record<Weapon, WeaponDef> = {
  atom: { name: 'قنبلة ذرية', desc: 'تدمير موضعي وإشعاع', cost: { gold: 1600, steel: 400 }, time: 30, siloLevel: 1, nuclearLevel: 1, range: 130, radius: 4.5, warheads: 1, speed: 22, intercept: 0.4 },
  hbomb: { name: 'قنبلة هيدروجينية', desc: 'دمار هائل على مساحة واسعة', cost: { gold: 4200, steel: 900 }, time: 55, siloLevel: 1, nuclearLevel: 2, range: 190, radius: 9, warheads: 1, speed: 20, intercept: 0.3 },
  mirv: { name: 'صاروخ MIRV', desc: '4 رؤوس مستقلة تضرب مدنًا متعددة — مدى عالمي', cost: { gold: 9000, steel: 2000 }, time: 80, siloLevel: 2, nuclearLevel: 2, range: 9999, radius: 5.5, warheads: 4, speed: 26, intercept: 0.2 },
};

export const ECON = {
  startGold: 700, startFood: 400, startWood: 300, startSteel: 120, startPop: 3200, startInf: 450,
  housing: { capital: [4500, 9000, 16000], city: [1800, 4500, 9500], rural: 70 },
  growth: 0.007,              // logistic growth per second
  laborShare: 0.55,           // share of population that can work
  taxEmployed: 0.0045, taxIdle: 0.0012,
  farmFood: 7, lumberWood: 4.5, mineSteel: 3.2, factoryGold: 9, portGold: 3.5, portAllyGold: 1.2,
  regionFood: 0.18, regionGold: 0.05,
  foodPerPop: 0.001, foodPerSoldier: 0.0022,
  passiveRecruit: { capital: 1.2, city: 0.45, barracks: 0.9 }, // soldiers/s per level
  capacity: { capital: 800, city: 400, barracks: 500, region: 25 },
  woundedShare: 0.35, healRate: 0.6, hospitalBeds: 400,
  lootShare: 0.3,
};

export const COMBAT = {
  rate: 0.45,               // strength removed per second per unit of opposing strength
  artilleryBoost: 0.5,      // attack multiplier per artillery share
  airSupportBoost: 0.35,
  neutralPerTile: 1.6,      // neutral militia per tile
  cityDefense: 0.25,        // per city level
  capitalDefense: 0.6,
  expandGarrisonPerTile: 0.4,
};

export const DIPLO = {
  allianceBreakSeconds: 10, napSeconds: 240, napBreakSeconds: 15, requestTtl: 30,
};

export const RADIATION_SECONDS = 120;
