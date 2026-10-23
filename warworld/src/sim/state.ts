// Shared types for the authoritative game state and the commands that mutate it.
import type { AirUnit, BuildingType, LandUnit, SeaUnit, UnitType, Weapon } from './balance';
import type { MapKind, PresetId } from './map/terrain';
import type { Personality } from './ai/personality';

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type Mode = 'ffa' | 'teams';

export interface GameConfig {
  mapKind: MapKind; preset?: PresetId | null; seed: number;
  humans: { name: string }[];
  bots: number; difficulty: Difficulty; mode: Mode; teams?: number;
}

export type AirCounts = Record<AirUnit, number>;
export type ShipCounts = Record<SeaUnit, number>;
export interface LandCounts { inf: number; tank: number; art: number }

export interface ProdItem { unit: UnitType | Weapon; left: number; t: number }

export interface Building {
  type: BuildingType; level: number;
  build: number;            // seconds left on construction/upgrade (0 = idle)
  damage: number;           // accumulated bomb damage
  queue: ProdItem[];
}

export interface Stats { captured: number; lost: number; kills: number; deaths: number; nukes: number; peakArea: number; built: number }

export interface Nation {
  id: number; name: string; color: number; bot: boolean; human: boolean; personality: Personality | null;
  alive: boolean; capital: number; team: number; founded: boolean;
  gold: number; food: number; wood: number; steel: number; pop: number; wounded: number;
  weapons: Record<Weapon, number>;
  // derived each economy tick (for UI and bots)
  housing: number; jobs: number; labor: number; fill: number; capacity: number;
  income: { gold: number; food: number; wood: number; steel: number; pop: number };
  area: number; regionCount: number; soldiers: number; tanks: number; arts: number;
  starving: boolean; bankrupt: boolean;
  stats: Stats;
  autoRecruit: boolean;
}

export type ArmyKind = 'move' | 'attack' | 'support' | 'gift';
export type ArmyState = 'march' | 'wait' | 'fight' | 'embarked' | 'stationed';

export interface Army extends LandCounts {
  id: number; owner: number; kind: ArmyKind; state: ArmyState;
  path: number[]; idx: number; prog: number;
  target: number; giftTo: number;
  expand: number; dirX: number; dirY: number;
  op: number; waitT: number; fleet: number; amphibious: boolean;
  x: number; y: number;
}

export interface Fleet {
  id: number; owner: number; ships: ShipCounts; dmg: number;
  sea: number; path: number[]; prog: number; x: number; y: number;
  port: number;             // docked at port region (-1 at sea)
  home: number;             // home port region
  cargo: number[];          // embarked army ids
  planes: AirCounts;        // aircraft on carriers
  order: 'idle' | 'move' | 'invade' | 'return';
  invadeTarget: number; op: number;
  combat: number;           // seconds since last combat (for fx)
}

export interface AirGroup { id: number; owner: number; planes: AirCounts; base: number; carrier: number }

export interface Sortie {
  id: number; owner: number; planes: AirCounts; mission: 'strike' | 'rebase';
  fromX: number; fromY: number; x: number; y: number; tx: number; ty: number;
  targetRegion: number; targetSea: number; toBase: number; toCarrier: number;
  homeBase: number; homeCarrier: number; phase: 'out' | 'back';
}

export interface Missile {
  id: number; owner: number; weapon: Weapon; x: number; y: number; sx: number; sy: number; tx: number; ty: number;
  t: number; dur: number; target: number;
}

export interface Battle { region: number; attackers: number[]; t: number }

export interface Operation { id: number; owner: number; target: number; staging: number; armies: number[]; t: number; expand: number; naval: boolean; fleet: number; port: number }

export type RequestType = 'alliance' | 'nap' | 'transit' | 'help';
export interface DiploRequest { id: number; from: number; to: number; type: RequestType; t: number; region: number }

export interface GameEvent { t: number; kind: string; text: string; a: number; b: number; region: number; important?: boolean }

export type Fx =
  | { k: 'capture'; region: number; owner: number }
  | { k: 'explosion'; x: number; y: number; r: number; nuke: boolean }
  | { k: 'launch'; id: number }
  | { k: 'shot'; x: number; y: number; tx: number; ty: number; sea?: boolean }
  | { k: 'intercept'; x: number; y: number };

export type Command =
  | { c: 'found'; region: number }
  | { c: 'attack'; target: number; amount: number; tanks?: number; arts?: number; expand?: boolean; from?: number }
  | { c: 'move'; from: number; to: number; amount: number; tanks?: number; arts?: number }
  | { c: 'reinforce'; amount: number }
  | { c: 'withdraw'; region: number }
  | { c: 'build'; region: number; type: BuildingType }
  | { c: 'upgrade'; region: number; type: BuildingType }
  | { c: 'demolish'; region: number; type: BuildingType }
  | { c: 'produce'; region: number; unit: UnitType | Weapon; n: number }
  | { c: 'recruit'; n: number }
  | { c: 'autoRecruit'; on: boolean }
  | { c: 'fleetMove'; fleet: number; sea: number }
  | { c: 'fleetReturn'; fleet: number }
  | { c: 'airStrike'; base: number; carrier?: number; target: number; sea?: number; planes?: Partial<AirCounts> }
  | { c: 'rebase'; base: number; carrier?: number; toBase?: number; toCarrier?: number; planes?: Partial<AirCounts> }
  | { c: 'launch'; weapon: Weapon; target: number }
  | { c: 'propose'; to: number; type: RequestType; region?: number }
  | { c: 'respond'; request: number; accept: boolean }
  | { c: 'cancelTreaty'; to: number }
  | { c: 'declareWar'; to: number }
  | { c: 'sendGold'; to: number; amount: number }
  | { c: 'giftTroops'; to: number; amount: number; region?: number }
  | { c: 'support'; to: number; amount: number; region?: number }
  | { c: 'jointTarget'; target: number };

export interface CommandResult { ok: boolean; error?: string; info?: string }

export const REL = { peace: 0, war: 1, nap: 2, ally: 3 } as const;

export function emptyAir(): AirCounts { return { scout: 0, heli: 0, fighter: 0, bomber: 0 }; }
export function emptyShips(): ShipCounts { return { transport: 0, patrol: 0, destroyer: 0, sub: 0, carrier: 0 }; }
export const airTotal = (a: AirCounts) => a.scout + a.heli + a.fighter + a.bomber;
export const shipTotal = (s: ShipCounts) => s.transport + s.patrol + s.destroyer + s.sub + s.carrier;
export const LAND_UNITS: LandUnit[] = ['inf', 'tank', 'art'];
export const SEA_UNITS: SeaUnit[] = ['transport', 'patrol', 'destroyer', 'sub', 'carrier'];
export const AIR_UNITS: AirUnit[] = ['scout', 'heli', 'fighter', 'bomber'];
