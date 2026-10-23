// Original pixel-art sprite set, authored as ASCII (palette in pixel.ts). 'T' marks team-colour pixels.
import { canvasOf, drawSprite, hasTeam, mirror, packAtlas, PAL, rgb, Sprite, sprite, spriteCanvas } from './pixel';

const S = sprite;

// ---------- city parts ----------
const houseRed = S([
  '.kkkkkk.',
  'kRRRRRRk',
  'kRrrrrRk',
  'kkkkkkkk',
  'kwwwwwwk',
  'kwcwwcwk',
  'kwwbbwwk',
  '.kkkkkk.',
]);
const houseBlue = S(houseRed.rows.map(r => r.replace(/R/g, 'U').replace(/r/g, 'u')));
const houseBrown = S(houseRed.rows.map(r => r.replace(/R/g, 't').replace(/r/g, 'B')));
const office = S([
  '.kkkkkk.',
  'kSSSSSSk',
  'kddddddk',
  'kcScScSk',
  'kcScScSk',
  'kSSSSSSk',
  'kcScScSk',
  'kcScScSk',
  'kSSSSSSk',
  'kcScScSk',
  'kSSbbSSk',
  '.kkkkkk.',
]);
const tower = S([
  '...kk...',
  '..kMMk..',
  '.kkkkkk.',
  'kuuuuuuk',
  'kcucucuk',
  'kuuuuuuk',
  'kcucucuk',
  'kuuuuuuk',
  'kcucucuk',
  'kuuuuuuk',
  'kcucucuk',
  'kuuuuuuk',
  'kcucucuk',
  'kuuuuuuk',
  'kuubbuuk',
  '.kkkkkk.',
]);
const palace = S([
  '......kkkk......',
  '.....kYYYYk.....',
  '....kYYyyYYk....',
  '....kyyyyyyk....',
  '.kk.kkkkkkkk.kk.',
  'kRRkwwwwwwwwkRRk',
  'kRRkwcwccwcwkRRk',
  'kkkkwwwwwwwwkkkk',
  'kwwkwcwccwcwkwwk',
  'kwckwwwwwwwwkcwk',
  'kwwkwwwbbwwwkwwk',
  'kwwkwwwbbwwwkwwk',
  'kkkkkkkkkkkkkkkk',
]);
export const FLAG = [S([
  'kTTTT.',
  'kTTTTT',
  'kTTTT.',
  'k.....',
  'k.....',
  'k.....',
  'k.....',
]), S([
  'kTTT..',
  'kTTTTT',
  'kTTTTT',
  'k.....',
  'k.....',
  'k.....',
  'k.....',
])];

// ---------- buildings ----------
export const B_SPRITES: Record<string, Sprite> = {
  farm: S([
    'kkkkkkkkkkkkkkkk',
    'kLlLlLlkYyYyYyYk',
    'klLlLlLkyYyYyYyk',
    'kLlLlLlkYyYyYyYk',
    'klLlLlLkyYyYyYyk',
    'kLlLlLlkYyYyYyYk',
    'kkkkkkkkkkkkkkkk',
    'kBbBbBbk.kkkkkk.',
    'kbBbBbBkkRRRRRRk',
    'kBbBbBbkkRrrrrRk',
    'kbBbBbBkkkkkkkkk',
    'kBbBbBbkkwwwwwwk',
    'kbBbBbBkkwbbwwwk',
    'kkkkkkkkkkkkkkkk',
  ]),
  lumber: S([
    '..ge....kkkkkk..',
    '.gGGe..kBBBBBBk.',
    'gGlGGe.kBbbbbBk.',
    '.gGGe..kkkkkkkk.',
    '..bb...ktttttk..',
    '..bb...ktbbbtk..',
    '.......kkkkkkk..',
    '.Bb..kkkkkkkkk..',
    '.....kbtbtbtbk..',
    '..Bb.ktbtbtbtk..',
    '.....kbtbtbtbk..',
    '.....kkkkkkkkk..',
  ]),
  mine: S([
    '....kkkkkkkk....',
    '..kkhhhhhhhhkk..',
    '.khhhhGhhhhhhhk.',
    'khhGhhhkkkkhhhhk',
    'khhhhhkxxxxkhhhk',
    'khhhhhkxxxxkhhhk',
    'kbbbbbkxxxxkbbbk',
    'kbbbbbkkbbkkbbbk',
    '...kkk.dssd.....',
    '..ksSskdssd.....',
    '..kdkdkdssd.....',
  ]),
  factory: S([
    '..kk....kk........',
    '..kdk...kdk.......',
    '..kdk...kdk.......',
    '..kdk...kdk.......',
    'kkkdkkkkkdkkkkkkkk',
    'kmMmMmMmMmMmMmMmMk',
    'kMmMmMmMmMmMmMmMmk',
    'kkkkkkkkkkkkkkkkkk',
    'ksssssssssssssssk.',
    'kscScScSsscScScSk.',
    'kssssssssssssssskk',
    'ksssssbbbbsssssssk',
    'kkkkkkkkkkkkkkkkkk',
  ]),
  port: S([
    '....k...............',
    '...kyk..............',
    '...kyykkkkkk........',
    '...ky......k........',
    '...ky......k........',
    '..kkykk...kRk.......',
    '.ktbtbtk..kRk.......',
    'ktbtbtbtkkkkkkkkkkkk',
    'kBBBBBBBBBBBBBBBBBBk',
    'kbkkkbkkkbkkkbkkkbkk',
    '.k...k...k...k...k..',
  ]),
  barracks: S([
    '.k..............',
    '.kTTT...........',
    '.kTT............',
    '.k..............',
    'kkkkkkkkkkkkkkkk',
    'khhhhhhhhhhhhhhk',
    'kheeeeeeeeeeeehk',
    'kkkkkkkkkkkkkkkk',
    'kvvvvvvvvvvvvvvk',
    'kvdvvdvvbbvvdvvk',
    'kvvvvvvvbbvvvvvk',
    'kkkkkkkkkkkkkkkk',
  ]),
  hospital: S([
    'kkkkkkkkkkkkkk',
    'kWWWWWWWWWWWWk',
    'kWWWWWqqWWWWWk',
    'kWWWWqqqqWWWWk',
    'kWWWWWqqWWWWWk',
    'kkkkkkkkkkkkkk',
    'kwwwwwwwwwwwwk',
    'kwcwcwwwwcwcwk',
    'kwwwwwbbwwwwwk',
    'kkkkkkkkkkkkkk',
  ]),
  airbase: S([
    'kkkkkkkkk...................',
    'kMMMMMMMk...................',
    'kMmmmmmMk..........kk.......',
    'kMmxxxmMk..........kqk......',
    'kkkkkkkkk..........kk.......',
    'dddddddddddddddddddddddddddd',
    'dWWddddWWddddWWddddWWddddWWd',
    'dddddddddddddddddddddddddddd',
  ]),
  silo: S([
    '...kkkkkk...',
    '..kssssssk..',
    '.ksSSSSSSsk.',
    'ksSkkkkkkSsk',
    'ksSkyxyxkSsk',
    'ksSkxyxykSsk',
    'ksSkyxyxkSsk',
    'ksSkkkkkkSsk',
    '.ksSSSSSSsk.',
    '..kssssssk..',
    '...kkkkkk...',
  ]),
  nuclear: S([
    '.kkkkk...kkkkk....',
    '.kSSSk...kSSSk....',
    '..kSk.....kSk.....',
    '..kSk.....kSk.....',
    '.kSSSk...kSSSk....',
    'kSSSSSk.kSSSSSk...',
    'kSsSsSk.kSsSsSk...',
    'kkkkkkkkkkkkkkkkk.',
    'kmmmmmmmmmmmmmmmk.',
    'kmyxymmmmmmmyxymk.',
    'kmmmmmmbbmmmmmmmk.',
    'kkkkkkkkkkkkkkkkk.',
  ]),
  airdefense: S([
    '....kkkk....',
    '...kMMMMk...',
    '..kMk..kMk..',
    '...kMMMMk...',
    '.....kk.....',
    '....kddk....',
    'kkkkkkkkkkkk',
    'kqdkqdkqdkdk',
    'kSdkSdkSdkdk',
    'kSdkSdkSdkdk',
    'kkkkkkkkkkkk',
  ]),
};

// ---------- nature ----------
export const NATURE: Record<string, Sprite> = {
  tree: S(['.ggg.', 'gGGGg', 'gGlGg', 'gGGGg', '.ggg.', '..b..']),
  tree2: S(['.eee.', 'eGGGe', 'eGGGe', '.eee.', '..b..']),
  pine: S(['..e..', '.eGe.', '.eGe.', 'eGGGe', 'eGGGe', '..b..']),
  palm: S(['g.g.g', '.gGg.', 'g.b.g', '..b..', '..b..']),
  mountain: S([
    '.....kk.....',
    '....kWWk....',
    '...kWsWsk...',
    '..ksSsssdk..',
    '.ksssSssddk.',
    'ksSssssdsddk',
    'kkkkkkkkkkkk',
  ]),
  hill: S(['..kkkk..', '.khGGhk.', 'khGlGhhk', 'kkkkkkkk']),
  rock: S(['.kk.', 'kSsk', 'kkkk']),
  cactus: S(['.k.', 'kak', 'kak', '.k.']),
};

// ---------- units (facing right) ----------
export const UNITS: Record<string, Sprite> = {
  soldier: S(['.T.', 'gGg', '.G.', 'g.g']),
  tank: S([
    '.kkkkkkkk..',
    'kddddddddk.',
    'kdgGGGGgdk.',
    'kdgGTTkkkkk',
    'kdgGTTkkkkk',
    'kdgGGGGgdk.',
    'kddddddddk.',
    '.kkkkkkkk..',
  ]),
  art: S([
    '..kk.......',
    '.kbbk......',
    'kbTTbkkkkkk',
    'kbTTbkkkkkk',
    '.kbbk......',
    '..kk.......',
  ]),
  transport: S([
    '..kkkkkkkkkkk...',
    '.knnnnnnnnnnnkk.',
    'knNNwwNNTTNNNnnk',
    'knNNwwNNTTNNNnnk',
    '.knnnnnnnnnnnkk.',
    '..kkkkkkkkkkk...',
  ]),
  patrol: S([
    '.kkkkkkk..',
    'knnTTMnnkk',
    'knnTTMnnkk',
    '.kkkkkkk..',
  ]),
  destroyer: S([
    '...kkkkkkkkkkkkk....',
    '.kknnnnnnnnnnnnnkk..',
    'knnnMkMnnTTnnMkkkkk.',
    'knnnMMMnSSSnnMMMnnnk',
    'knnnMkMnnTTnnMkkkkk.',
    '.kknnnnnnnnnnnnnkk..',
    '...kkkkkkkkkkkkk....',
  ]),
  sub: S([
    '...kkkkkkkkkk...',
    '.kkddddkkddddkk.',
    'kdddddkTTkdddddk',
    '.kkddddkkddddkk.',
    '...kkkkkkkkkk...',
  ]),
  carrier: S([
    '..kkkkkkkkkkkkkkkkkkkkk...',
    '.kddddddddddddddddddddddk.',
    'kdSdddSdddSdddSdddSdddddk.',
    'kdddddddddddddddkkkkdddddk',
    'kdddddddddddddddkMMkTTdddk',
    'kdSdddSdddSdddSdkkkkdddddk',
    '.kddddddddddddddddddddddk.',
    '..kkkkkkkkkkkkkkkkkkkkk...',
  ]),
  scout: S([
    '......kk...',
    'kk...kMMk..',
    'kMk.kMMMMk.',
    'kkMMMMMcMck',
    'kMk.kMMMMk.',
    'kk...kTTk..',
    '......kk...',
  ]),
  heli: S([
    '.......kk...',
    'kk....kGGk..',
    'kGk..kGGGGkk',
    'kkGGGGGGcGck',
    'kGk..kGGGGkk',
    'kk....kTTk..',
    '.......kk...',
  ]),
  fighter: S([
    '..kk........',
    '..kMk.......',
    '...kTk......',
    'kk.kMMk.....',
    'kMkkMMMMMkk.',
    'kMMMMMMMMcMk',
    'kMkkMMMMMkk.',
    'kk.kMMk.....',
    '...kTk......',
    '..kMk.......',
    '..kk........',
  ]),
  bomber: S([
    '.....kk.........',
    '.....kMk........',
    '.....kMMk.......',
    'kk...kTMMk......',
    'kMk..kMMMMk.....',
    'kMMkkkMMMMMMkkk.',
    'kMMMMMMMMMMMMcMk',
    'kMMkkkMMMMMMkkk.',
    'kMk..kMMMMk.....',
    'kk...kTMMk......',
    '.....kMMk.......',
    '.....kMk........',
    '.....kk.........',
  ]),
  missile: S(['.kkkkk..', 'fkSSSSqk', '.kkkkk..']),
  warhead: S(['.kkkk..', 'FkSSSqk', '.kkkk..']),
  person: S(['p', 'u']),
  car: S(['kRk', 'RcR', 'kRk']),
  car2: S(['kUk', 'UcU', 'kUk']),
  smoke: S(['.s.', 'sSs', '.s.']),
  spark: S(['C']),
  wake: S(['.C.', 'C.C']),
};

// ---------- UI icons (10x10) ----------
export const ICONS: Record<string, Sprite> = {
  gold: S(['...kkkk...', '.kkYYYYkk.', '.kYYyyYYk.', 'kYYyYYyYYk', 'kYyYYYYyYk', 'kYyYYYYyYk', 'kYYyYYyYYk', '.kYYyyYYk.', '.kkYYYYkk.', '...kkkk...']),
  soldier: S(['...kkkk...', '..kGGGGk..', '.kGGGGGGk.', '..kppppk..', '..kpkkpk..', '...kppk...', '.kkGGGGkk.', 'kGGGGGGGGk', 'kGkGGGGkGk', '..kGkkGk..']),
  globe: S(['...kkkk...', '..kuGGuk..', '.kuGGGuuk.', 'kuuGGuuGuk', 'kuuuGuGGuk', 'kuGuuuGGuk', 'kuGGuuuGuk', '.kuGuuuuk.', '..kuuuuk..', '...kkkk...']),
  food: S(['....kk....', '...kyyk...', '..kyYyk...', '...kyykk..', '..kyYyyYk.', '...kyyyk..', '..kyYyk...', '....kk....', '....kb....', '....kb....']),
  wood: S(['..........', '.kkkkkkkk.', 'ktBBBBBBBk', 'kbtBBBBBBk', 'ktBBBBBBBk', '.kkkkkkkk.', 'ktBBBBBBBk', 'kbtBBBBBBk', 'ktBBBBBBBk', '.kkkkkkkk.']),
  steel: S(['..........', '..........', '...kkkkkk.', '..kMMMMMk.', '.kMSSSSMkk', 'kMMMMMMkMk', 'kmmmmmmkmk', 'kmmmmmmkk.', 'kkkkkkkk..', '..........']),
  pop: S(['...kkk....', '..kpppk...', '..kpppk...', '...kkk....', '..kuuuk...', '.kuuuuuk..', '.kuuuuuk..', '.kuuuuuk..', '..kk.kk...', '..........']),
  build: S(['..kkkk....', '.kssssk...', '.kSkkSSk..', '..k..kSsk.', '......kbk.', '.....kbk..', '....kbk...', '...kbk....', '..kbk.....', '..kk......']),
  army: S(['........kk', '.......kSk', '......kSk.', '.....kSk..', 'k...kSk...', 'kk.kSk....', '.kkSk.....', '..kyk.....', '.kykkk....', 'kyk..k....']),
  nuke: S(['...kkkk...', '..kyyyyk..', '.kykkkkyk.', 'kyykyykyyk', 'kykyyyykyk', 'kykykkykyk', 'kyyykkyyyk', '.kyykkyyk.', '..kyyyyk..', '...kkkk...']),
  diplo: S(['..........', '.kk....kk.', 'kppk..kPPk', 'kpppkkPPPk', '.kppppPPk.', '..kppPPk..', '...kpPk...', '....kk....', '..........', '..........']),
  gear: S(['....kk....', '.kk.kk.kk.', '.kMkMMkMk.', '..kMkkMk..', 'kkMk..kMkk', 'kkMk..kMkk', '..kMkkMk..', '.kMkMMkMk.', '.kk.kk.kk.', '....kk....']),
  pause: S(['..........', '.kkk..kkk.', '.kWk..kWk.', '.kWk..kWk.', '.kWk..kWk.', '.kWk..kWk.', '.kWk..kWk.', '.kWk..kWk.', '.kkk..kkk.', '..........']),
  play: S(['..........', '.kk.......', '.kWkk.....', '.kWWWkk...', '.kWWWWWkk.', '.kWWWWWkk.', '.kWWWkk...', '.kWkk.....', '.kk.......', '..........']),
  close: S(['..........', '.kk....kk.', '.kWk..kWk.', '..kWkkWk..', '...kWWk...', '...kWWk...', '..kWkkWk..', '.kWk..kWk.', '.kk....kk.', '..........']),
  ship: S(['..........', '....k.....', '....kT....', '....kTT...', '....k.....', 'kkkkkkkkkk', 'knnnnnnnnk', '.knnnnnnk.', '..kkkkkk..', '..........']),
  plane: S(['....kk....', '....kMk...', '....kMk...', 'kkkkkMMkkk', 'kMMMMMMMMk', 'kkkkkMMkkk', '....kMk...', '...kkMkk..', '...kMMMk..', '...kkkkk..']),
  tank: S(['..........', '..........', '...kkkk...', '..kGGGGkkk', '..kGTTkkkk', 'kkkkkkkkk.', 'kddddddddk', 'kdkdkdkdkd', '.kkkkkkkk.', '..........']),
  target: S(['...kkkk...', '..kqqqqk..', '.kqk..kqk.', 'kqk.kk.kqk', 'kqkkqqkkqk', 'kqkkqqkkqk', 'kqk.kk.kqk', '.kqk..kqk.', '..kqqqqk..', '...kkkk...']),
  shield: S(['.kkkkkkkk.', 'kMMMMMMMMk', 'kMuuuuuuMk', 'kMuuWWuuMk', 'kMuWWWWuMk', 'kMuuWWuuMk', '.kMuuuuMk.', '..kMuuMk..', '...kMMk...', '....kk....']),
  heart: S(['..........', '.kk...kk..', 'kqqk.kqqk.', 'kqQqkqqqk.', 'kqqqqqqqk.', '.kqqqqqk..', '..kqqqk...', '...kqk....', '....k.....', '..........']),
  flag: S(['k.........', 'kkkkkkk...', 'kTTTTTTk..', 'kTTTTTTTk.', 'kTTTTTTk..', 'kkkkkkk...', 'k.........', 'k.........', 'k.........', 'k.........']),
  up: S(['....kk....', '...kWWk...', '..kWWWWk..', '.kWWWWWWk.', 'kkkWWWWkkk', '..kWWWWk..', '..kWWWWk..', '..kWWWWk..', '..kkkkkk..', '..........']),
  menu: S(['..........', 'kkkkkkkkkk', 'kWWWWWWWWk', 'kkkkkkkkkk', 'kWWWWWWWWk', 'kkkkkkkkkk', 'kWWWWWWWWk', 'kkkkkkkkkk', '..........', '..........']),
  swords: S(['k........k', 'kSk....kSk', '.kSk..kSk.', '..kSkkSk..', '...kSSk...', '...kSSk...', '..kbkkbk..', '.kbk..kbk.', 'kyk....kyk', 'kk......kk']),
  handshake: S(['..........', 'kk......kk', 'kTkk..kkUk', 'kTTpkkpUUk', '.kTppppUk.', '..kppppk..', '...kppk...', '....kk....', '..........', '..........']),
  radar: S(['...kkkk...', '..kMMMMk..', '.kMk..kMk.', '.k......k.', '....kk....', '....kk....', '...kddk...', '..kddddk..', '.kkkkkkkk.', '..........']),
};

/** Procedural city sprite for a level, with a road grid and houses. Deterministic per variant. */
function cityCanvas(level: number, capital: boolean, variant: number) {
  const size = [0, 26, 34, 42][level];
  const { c, ctx } = canvasOf(size, size);
  // ground patch with paved roads
  ctx.fillStyle = '#b9ab86'; ctx.fillRect(2, 2, size - 4, size - 4);
  ctx.fillStyle = '#8d846c';
  ctx.fillRect(0, (size >> 1) - 1, size, 3);
  ctx.fillRect((size >> 1) - 1, 0, 3, size);
  if (level >= 2) { ctx.fillRect(0, (size >> 2) - 1, size, 2); ctx.fillRect(0, (3 * size >> 2), size, 2); }
  if (level >= 3) { ctx.fillRect((size >> 2) - 1, 0, 2, size); ctx.fillRect((3 * size >> 2), 0, 2, size); }
  ctx.fillStyle = '#d8cfae';
  for (let i = 1; i < size; i += 4) ctx.fillRect(i, size >> 1, 2, 1);
  let seed = variant * 9301 + level * 49297;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const houses = [houseRed, houseBlue, houseBrown];
  const cells: [number, number][] = [];
  const step = 9;
  for (let y = 1; y + 8 <= size - 1; y += step) for (let x = 1; x + 8 <= size - 1; x += step) cells.push([x, y]);
  for (const [x, y] of cells) {
    const mid = size >> 1;
    if (Math.abs(x + 4 - mid) < 6 && Math.abs(y + 4 - mid) < 6 && capital) continue;
    const r = rnd();
    let s = houses[Math.floor(rnd() * 3)];
    if (level >= 2 && r < 0.25) s = office;
    if (level >= 3 && r < 0.2) s = tower;
    const yy = Math.min(size - s.h - 1, y);
    if (rnd() < 0.9) drawSprite(ctx, s, x, yy);
    else drawSprite(ctx, NATURE.tree, x + 1, y + 1);
  }
  if (capital) drawSprite(ctx, palace, (size - palace.w) >> 1, (size - palace.h) >> 1);
  // dark outline pixels at the patch edge
  ctx.fillStyle = 'rgba(27,31,36,0.6)';
  ctx.fillRect(2, 1, size - 4, 1); ctx.fillRect(2, size - 2, size - 4, 1); ctx.fillRect(1, 2, 1, size - 4); ctx.fillRect(size - 2, 2, 1, size - 4);
  return c;
}

function explosionFrames(n: number, size: number, nuke: boolean) {
  const out: HTMLCanvasElement[] = [];
  for (let f = 0; f < n; f++) {
    const { c, ctx } = canvasOf(size, size);
    const t = f / (n - 1);
    const cx = size / 2, cy = size / 2;
    const R = size * 0.5 * (0.25 + 0.75 * Math.sqrt(t));
    const img = ctx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * (nuke ? 1.15 : 1));
      if (d > R) continue;
      const h = ((x * 73856093) ^ (y * 19349663) ^ (f * 83492791)) >>> 0;
      const jitter = (h % 100) / 100;
      const edge = d / R;
      let col: string;
      if (t > 0.65) col = edge + jitter * 0.3 > 1.0 ? '' : jitter > 0.5 ? '#6b6b6b' : '#8a8a8a';
      else if (edge < 0.35 - t * 0.3) col = '#fff6c2';
      else if (edge < 0.65 - t * 0.2) col = '#ffd23f';
      else if (edge < 0.9) col = '#ff7a1f';
      else col = jitter > 0.4 ? '#c23a14' : '';
      if (!col) continue;
      const [r, g, b] = rgb(col);
      const k = (y * size + x) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = t > 0.65 ? Math.round(255 * (1 - (t - 0.65) / 0.35)) : 255;
    }
    ctx.putImageData(img, 0, 0);
    out.push(c);
  }
  return out;
}

/** Mushroom cloud frames: rising stem + expanding cap. */
function mushroomFrames(n: number) {
  const W = 48, H = 56, out: HTMLCanvasElement[] = [];
  for (let f = 0; f < n; f++) {
    const { c, ctx } = canvasOf(W, H);
    const t = f / (n - 1);
    const img = ctx.getImageData(0, 0, W, H);
    const capY = H - 10 - t * 30, capR = 6 + t * 14, stemW = 3 + t * 3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const h = ((x * 73856093) ^ (y * 19349663) ^ (f * 83492791)) >>> 0, j = (h % 100) / 100;
      const dxc = x + 0.5 - W / 2, dcap = Math.hypot(dxc, (y + 0.5 - capY) * 1.5);
      let col = '';
      if (dcap < capR) col = dcap < capR * 0.45 ? (t < 0.5 ? '#fff1a0' : '#ffb347') : dcap < capR * 0.8 ? (j > 0.5 ? '#ff7a1f' : '#e05a1a') : (j > 0.4 ? '#8a5a4a' : '#6b4a3e');
      else if (y > capY && y < H - 4 && Math.abs(dxc) < stemW * (1 + (y - capY) / 60)) col = j > 0.5 ? '#c8643a' : '#a04a2a';
      else { const db = Math.hypot(dxc, (y + 0.5 - (H - 5)) * 2.5); if (db < 8 + t * 14) col = j > 0.5 ? '#9a8a7a' : '#7d6f62'; }
      if (!col) continue;
      const [r, g, b] = rgb(col), k = (y * W + x) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = t > 0.8 ? Math.round(255 * (1 - (t - 0.8) / 0.2) + 40) : 255;
    }
    ctx.putImageData(img, 0, 0);
    out.push(c);
  }
  return out;
}

function rotorCanvas() {
  const { c, ctx } = canvasOf(15, 15);
  ctx.fillStyle = 'rgba(40,44,50,0.75)';
  ctx.fillRect(0, 7, 15, 1); ctx.fillRect(7, 0, 1, 15);
  ctx.fillStyle = 'rgba(150,160,170,0.35)';
  ctx.fillRect(1, 6, 13, 1); ctx.fillRect(6, 1, 1, 13);
  return c;
}

function ringCanvas(r: number, color: string) {
  const s = r * 2 + 3;
  const { c, ctx } = canvasOf(s, s);
  const img = ctx.getImageData(0, 0, s, s);
  const [R, G, B] = rgb(color);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - s / 2 + 0.5, y - s / 2 + 0.5);
    if (Math.abs(d - r) < 0.6) { const k = (y * s + x) * 4; img.data[k] = R; img.data[k + 1] = G; img.data[k + 2] = B; img.data[k + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export interface Atlas { canvas: HTMLCanvasElement; frames: Record<string, { x: number; y: number; w: number; h: number }> }

export function buildAtlas(): Atlas {
  const items: { name: string; c: HTMLCanvasElement }[] = [];
  const add = (name: string, s: Sprite) => {
    items.push({ name, c: spriteCanvas(s, 'base') });
    if (hasTeam(s)) items.push({ name: name + '_t', c: spriteCanvas(s, 'team') });
  };
  for (const [k, s] of Object.entries(B_SPRITES)) add('b_' + k, s);
  for (const [k, s] of Object.entries(NATURE)) add('n_' + k, s);
  for (const [k, s] of Object.entries(UNITS)) add('u_' + k, s);
  add('u_soldier_l', mirror(UNITS.soldier));
  FLAG.forEach((s, i) => add('flag' + i, s));
  for (let lvl = 1; lvl <= 3; lvl++) for (let v = 0; v < 3; v++) {
    items.push({ name: `city${lvl}_${v}`, c: cityCanvas(lvl, false, v) });
    items.push({ name: `capital${lvl}_${v}`, c: cityCanvas(lvl, true, v) });
  }
  explosionFrames(8, 24, false).forEach((c, i) => items.push({ name: 'boom' + i, c }));
  explosionFrames(10, 64, true).forEach((c, i) => items.push({ name: 'nukeflash' + i, c }));
  mushroomFrames(12).forEach((c, i) => items.push({ name: 'mushroom' + i, c }));
  items.push({ name: 'rotor', c: rotorCanvas() });
  items.push({ name: 'ring8', c: ringCanvas(8, '#ff4d4d') });
  const dot = canvasOf(2, 2); dot.ctx.fillStyle = '#fff'; dot.ctx.fillRect(0, 0, 2, 2); items.push({ name: 'px', c: dot.c });
  return packAtlas(items, 1024);
}

const iconCache = new Map<string, string>();
/** Data-URL for an HTML icon, optionally recoloring team pixels. */
export function iconURL(name: string, team = '#d9b44a', scale = 3): string {
  const key = name + team + scale;
  let u = iconCache.get(key);
  if (u) return u;
  const s = ICONS[name] ?? B_SPRITES[name] ?? UNITS[name];
  if (!s) return '';
  const { c, ctx } = canvasOf(s.w * scale, s.h * scale);
  const tmp = canvasOf(s.w, s.h);
  drawSprite(tmp.ctx, s, 0, 0, 'all', { ...PAL, T: team });
  ctx.drawImage(tmp.c, 0, 0, s.w * scale, s.h * scale);
  u = c.toDataURL();
  iconCache.set(key, u);
  return u;
}
