// Bot personalities: archetypes plus per-bot jitter and quirks so no two bots play alike.
import type { Rng } from '../rng';

export interface Personality {
  archetype: string; title: string;
  aggression: number; expansion: number; economy: number; navy: number; air: number;
  nukes: number; loyalty: number; risk: number; diplomacy: number; defense: number;
  revenge: number; patience: number; greed: number;
  // quirks
  favoriteUnit: 'tank' | 'art' | 'inf';
  buildOrder: string[];       // preferred early buildings, in order
  dirX: number; dirY: number; // preferred expansion heading
  reserve: number;            // share of troops kept home
  attackRatio: number;        // force ratio it wants before attacking
  thinkJitter: number;
}

type Traits = Omit<Personality, 'favoriteUnit' | 'buildOrder' | 'dirX' | 'dirY' | 'reserve' | 'attackRatio' | 'thinkJitter' | 'archetype' | 'title'>;

const ARCHETYPES: { key: string; title: string; t: Traits; order: string[] }[] = [
  { key: 'conqueror', title: 'الفاتح', t: { aggression: 0.9, expansion: 0.95, economy: 0.45, navy: 0.4, air: 0.4, nukes: 0.35, loyalty: 0.5, risk: 0.7, diplomacy: 0.3, defense: 0.3, revenge: 0.6, patience: 0.3, greed: 0.6 }, order: ['farm', 'barracks', 'mine', 'factory', 'city'] },
  { key: 'merchant', title: 'التاجر', t: { aggression: 0.3, expansion: 0.65, economy: 0.95, navy: 0.6, air: 0.3, nukes: 0.15, loyalty: 0.75, risk: 0.3, diplomacy: 0.85, defense: 0.5, revenge: 0.3, patience: 0.7, greed: 0.9 }, order: ['farm', 'city', 'factory', 'port', 'lumber'] },
  { key: 'turtle', title: 'الحصن', t: { aggression: 0.15, expansion: 0.5, economy: 0.8, navy: 0.3, air: 0.5, nukes: 0.55, loyalty: 0.8, risk: 0.15, diplomacy: 0.6, defense: 0.95, revenge: 0.8, patience: 0.9, greed: 0.4 }, order: ['farm', 'city', 'barracks', 'airdefense', 'hospital'] },
  { key: 'admiral', title: 'أمير البحار', t: { aggression: 0.6, expansion: 0.7, economy: 0.6, navy: 0.95, air: 0.45, nukes: 0.3, loyalty: 0.6, risk: 0.5, diplomacy: 0.5, defense: 0.4, revenge: 0.5, patience: 0.5, greed: 0.6 }, order: ['farm', 'lumber', 'port', 'mine', 'factory'] },
  { key: 'opportunist', title: 'الانتهازي', t: { aggression: 0.7, expansion: 0.8, economy: 0.6, navy: 0.4, air: 0.4, nukes: 0.4, loyalty: 0.15, risk: 0.55, diplomacy: 0.7, defense: 0.35, revenge: 0.4, patience: 0.4, greed: 0.85 }, order: ['farm', 'barracks', 'city', 'factory'] },
  { key: 'diplomat', title: 'الدبلوماسي', t: { aggression: 0.3, expansion: 0.7, economy: 0.75, navy: 0.4, air: 0.4, nukes: 0.2, loyalty: 0.95, risk: 0.3, diplomacy: 0.95, defense: 0.6, revenge: 0.5, patience: 0.7, greed: 0.5 }, order: ['farm', 'city', 'hospital', 'factory'] },
  { key: 'doomsayer', title: 'النووي', t: { aggression: 0.55, expansion: 0.55, economy: 0.75, navy: 0.25, air: 0.4, nukes: 0.98, loyalty: 0.4, risk: 0.8, diplomacy: 0.3, defense: 0.55, revenge: 0.95, patience: 0.6, greed: 0.5 }, order: ['farm', 'mine', 'factory', 'silo', 'nuclear'] },
  { key: 'airmarshal', title: 'صقر الجو', t: { aggression: 0.6, expansion: 0.65, economy: 0.65, navy: 0.3, air: 0.95, nukes: 0.35, loyalty: 0.6, risk: 0.5, diplomacy: 0.5, defense: 0.45, revenge: 0.6, patience: 0.55, greed: 0.5 }, order: ['farm', 'mine', 'factory', 'airbase'] },
  { key: 'strategist', title: 'الاستراتيجي', t: { aggression: 0.5, expansion: 0.75, economy: 0.8, navy: 0.5, air: 0.55, nukes: 0.45, loyalty: 0.7, risk: 0.35, diplomacy: 0.65, defense: 0.6, revenge: 0.55, patience: 0.95, greed: 0.6 }, order: ['farm', 'lumber', 'mine', 'city', 'factory'] },
  { key: 'berserker', title: 'المتهور', t: { aggression: 0.98, expansion: 0.9, economy: 0.3, navy: 0.3, air: 0.3, nukes: 0.5, loyalty: 0.35, risk: 0.95, diplomacy: 0.15, defense: 0.15, revenge: 0.9, patience: 0.1, greed: 0.7 }, order: ['barracks', 'farm', 'barracks', 'city'] },
];

export function rollPersonality(rng: Rng, index: number): Personality {
  const a = ARCHETYPES[(index + rng.int(3)) % ARCHETYPES.length];
  const jit = (v: number) => Math.max(0.02, Math.min(0.99, v + rng.range(-0.15, 0.15)));
  const t = Object.fromEntries(Object.entries(a.t).map(([k, v]) => [k, jit(v)])) as Traits;
  const ang = rng.range(0, Math.PI * 2);
  const order = [...a.order];
  if (rng.chance(0.4)) order.splice(rng.int(order.length), 0, rng.pick(['lumber', 'mine', 'city', 'barracks', 'port']));
  return {
    ...t, archetype: a.key, title: a.title,
    favoriteUnit: rng.pick(['tank', 'art', 'inf', 'tank'] as const),
    buildOrder: order,
    dirX: Math.cos(ang), dirY: Math.sin(ang),
    reserve: 0.12 + t.defense * 0.3 + rng.range(-0.05, 0.05),
    attackRatio: 1.1 + (1 - t.risk) * 1.4 + rng.range(-0.15, 0.15),
    thinkJitter: rng.range(0.8, 1.25),
  };
}
