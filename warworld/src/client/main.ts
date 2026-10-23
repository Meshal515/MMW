// Entry point: main menu → build the world → run the Phaser scene with the HTML HUD on top.
import Phaser from 'phaser';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/900.css';
import './style.css';
import { Game } from '../sim/game';
import type { Difficulty, Mode } from '../sim/state';
import { buildMap } from '../sim/map/regions';
import { MapKind, PRESETS, PresetId } from '../sim/map/terrain';
import { WorldScene } from './render/scene';
import { Hud } from './ui/hud';

interface Settings { name: string; mapKind: MapKind; preset: PresetId; seed: number; bots: number; difficulty: Difficulty; mode: Mode; teams: number }
const DEFAULTS: Settings = { name: 'القائد', mapKind: 'earth', preset: 'pangaea', seed: 1 + Math.floor(Math.random() * 99999), bots: 49, difficulty: 'medium', mode: 'ffa', teams: 2 };

function loadSettings(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('ww.settings') ?? '{}') }; } catch { return { ...DEFAULTS }; }
}
function saveSettings(s: Settings) { try { localStorage.setItem('ww.settings', JSON.stringify(s)); } catch { /* storage unavailable */ } }

let phaser: Phaser.Game | null = null;
let hud: Hud | null = null;

const TCOL = ['#1d2f86', '#3a6fd1', '#6aa83c', '#376e2d', '#8b9b4c', '#8b7a5c', '#dfc890', '#e9f1f9'];

function drawPreview(cv: HTMLCanvasElement, s: Settings) {
  const map = buildMap({ kind: s.mapKind, seed: s.seed, preset: s.mapKind === 'preset' ? s.preset : null });
  cv.width = map.w; cv.height = map.h;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(map.w, map.h);
  const rgb = TCOL.map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  for (let i = 0; i < map.w * map.h; i++) { const c = rgb[map.terrain[i]]; img.data.set([c[0], c[1], c[2], 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  return map;
}

function showMenu() {
  const s = loadSettings();
  const el = document.createElement('div');
  el.className = 'screen';
  el.id = 'menu';
  const seg = (key: string, opts: [string, string][], cur: string) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button class="${v === cur ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const render = () => {
    el.innerHTML = `<div class="box">
      <h1 class="logo">WAR WORLD<small>حرب العالم — احتل 80% من الأرض لتفوز</small></h1>
      <div class="field"><label>اسم دولتك</label><input type="text" id="f-name" maxlength="24" value="${s.name.replace(/"/g, '')}"></div>
      <div class="field"><label>الخريطة</label>${seg('mapKind', [['earth', 'العالم الحقيقي'], ['random', 'عالم عشوائي'], ['preset', 'خرائط ثابتة']], s.mapKind)}</div>
      ${s.mapKind === 'preset' ? `<div class="field">${seg('preset', PRESETS.map(p => [p.id, p.name]), s.preset)}</div>` : ''}
      ${s.mapKind === 'random' ? `<div class="field"><label>رقم البذرة (Seed)</label><div class="row2"><input type="text" id="f-seed" value="${s.seed}" inputmode="numeric"><button class="btn" data-act="dice">🎲</button></div></div>` : ''}
      <canvas id="preview"></canvas>
      <div class="field"><label>عدد البوتات: <b id="botsv">${s.bots}</b></label><input type="range" id="f-bots" min="1" max="49" value="${s.bots}"></div>
      <div class="field"><label>الصعوبة</label>${seg('difficulty', [['easy', 'سهل'], ['medium', 'متوسط'], ['hard', 'صعب'], ['expert', 'خبير']], s.difficulty)}</div>
      <div class="field"><label>النمط</label>${seg('mode', [['ffa', 'الجميع ضد الجميع'], ['teams', 'الفرق']], s.mode)}</div>
      ${s.mode === 'teams' ? `<div class="field"><label>عدد الفرق</label>${seg('teams', [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']], String(s.teams))}</div>` : ''}
      <button class="big-btn" data-act="start">ابدأ المعركة ⚔</button>
      <div class="note" style="margin-top:8px">أونلاين مع الأصدقاء (غرف Cloudflare): المرحلة التالية. اللعب الحالي: أنت ضد ${s.bots} بوت، لكل بوت شخصية وأسلوب تفكير مختلف.</div>
    </div>`;
    requestAnimationFrame(() => drawPreview(el.querySelector('#preview') as HTMLCanvasElement, s));
  };
  render();
  document.body.appendChild(el);
  const readInputs = () => {
    const n = el.querySelector('#f-name') as HTMLInputElement | null; if (n) s.name = n.value.trim() || 'القائد';
    const sd = el.querySelector('#f-seed') as HTMLInputElement | null; if (sd) s.seed = Math.max(1, parseInt(sd.value, 10) || 1);
    const b = el.querySelector('#f-bots') as HTMLInputElement | null; if (b) s.bots = Number(b.value);
  };
  el.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'f-bots') (el.querySelector('#botsv') as HTMLElement).textContent = t.value;
  });
  el.addEventListener('change', e => { if ((e.target as HTMLElement).id === 'f-seed') { readInputs(); render(); } });
  el.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const segBtn = t.closest('.seg button') as HTMLElement | null;
    if (segBtn) {
      readInputs();
      const key = (segBtn.parentElement as HTMLElement).dataset.seg!;
      (s as any)[key] = key === 'teams' ? Number(segBtn.dataset.v) : segBtn.dataset.v;
      render();
      return;
    }
    const act = (t.closest('[data-act]') as HTMLElement | null)?.dataset.act;
    if (act === 'dice') { readInputs(); s.seed = 1 + Math.floor(Math.random() * 99999); render(); }
    if (act === 'start') { readInputs(); saveSettings(s); el.remove(); start(s); }
  });
}

function start(s: Settings) {
  const loading = document.createElement('div');
  loading.id = 'loading';
  loading.textContent = 'جاري بناء العالم...';
  document.body.appendChild(loading);
  setTimeout(() => {
    const sim = new Game({
      mapKind: s.mapKind, preset: s.mapKind === 'preset' ? s.preset : null, seed: s.mapKind === 'earth' ? 20240 : s.seed,
      humans: [{ name: s.name }], bots: s.bots, difficulty: s.difficulty, mode: s.mode, teams: s.teams,
    });
    phaser = new Phaser.Game({
      type: Phaser.AUTO, parent: 'game', backgroundColor: '#1c2f72', pixelArt: true, roundPixels: true, banner: false,
      scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
      input: { activePointers: 3 }, disableContextMenu: true, fps: { target: 60 },
    });
    phaser.scene.add('world', WorldScene, true, { sim, human: 0 });
    const boot = () => {
      const scene = phaser!.scene.getScene('world') as WorldScene | null;
      if (!scene || !scene.sys.isActive() || !scene.ground) { requestAnimationFrame(boot); return; }
      scene.prepare(f => { loading.textContent = `جاري رسم العالم... ${Math.round(f * 100)}%`; }).then(() => {
        hud = new Hud(sim, scene, 0, () => { teardown(); showMenu(); });
        loading.remove();
        (window as any).__ww = { sim, scene, hud };
      });
    };
    boot();
  }, 30);
}

function teardown() {
  hud?.destroy(); hud = null;
  phaser?.destroy(true); phaser = null;
  (window as any).__ww = null;
}

const params = new URLSearchParams(location.search);
if (params.has('quick')) {
  // test/dev hook: skip the menu with defaults (?quick&bots=10&map=random)
  start({ ...loadSettings(), bots: Number(params.get('bots') ?? 49), mapKind: (params.get('map') as MapKind) ?? 'earth', difficulty: (params.get('diff') as Difficulty) ?? 'medium' });
} else showMenu();
