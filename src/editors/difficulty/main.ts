// The difficulty editor (difficulty.html): the game running live next to every knob in
// difficulty.ts. Edits apply at once; "Save to game" writes them into difficulty.json
// through the dev server (see vite.config.ts), and the game ships with that file.

import { DIFF, DIFF_KNOBS, RAMPS, at, savedValues, type DiffKey, type RampKey } from '../../data/difficulty';
import { Game } from '../../game/game';
import { Input } from '../../core/input';
import { Neon } from '../../core/neon';

const STORE = 'the-line-difficulty';
const LEVELS = 15;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const neon = new Neon(canvas);
const game = new Game(neon, new Input(canvas));
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** What difficulty.json holds: the baseline that "changed" is measured against. */
let base = savedValues();
const original = Object.fromEntries(Object.entries(DIFF_KNOBS).map(([k, v]) => [k, v.def])) as Record<DiffKey, number>;
const keys = Object.keys(DIFF_KNOBS) as DiffKey[];

// Unsaved edits from last time.
try {
  const draft = JSON.parse(localStorage.getItem(STORE) || '{}') as Partial<Record<DiffKey, number>>;
  for (const k of keys) if (typeof draft[k] === 'number') DIFF[k] = draft[k]!;
} catch { /* storage blocked */ }

function saveDraft() {
  const out: Partial<Record<DiffKey, number>> = {};
  for (const k of keys) if (DIFF[k] !== base[k]) out[k] = DIFF[k];
  try { localStorage.setItem(STORE, JSON.stringify(out)); } catch { /* storage blocked */ }
}

// ---------------------------------------------------------------- the knobs

const rows = new Map<DiffKey, { row: HTMLElement; range: HTMLInputElement; num: HTMLInputElement }>();
const ramps: { key: RampKey; svg: SVGSVGElement; now: HTMLElement; unit: string }[] = [];
const rampOf = (k: DiffKey) => RAMPS.find((r) => k === r || k === `${r}Per` || k === `${r}Cap`);

const panel = $('knobs');
let group = '';
for (const key of keys) {
  const k = DIFF_KNOBS[key];
  if (k.group !== group) {
    group = k.group;
    const h = document.createElement('h2');
    h.textContent = group;
    panel.append(h);
  }
  const row = document.createElement('label');
  row.className = 'knob';
  const name = document.createElement('span');
  name.textContent = k.label;
  const range = document.createElement('input');
  const num = document.createElement('input');
  Object.assign(range, { type: 'range', min: String(k.min), max: String(k.max), step: String(k.step) });
  Object.assign(num, { type: 'number', min: String(k.min), max: String(k.max), step: String(k.step) });
  const set = (v: number) => {
    if (!Number.isFinite(v)) return;
    DIFF[key] = v;
    show(key);
    saveDraft();
  };
  range.addEventListener('input', () => set(Number(range.value)));
  num.addEventListener('change', () => set(Number(num.value)));
  row.addEventListener('dblclick', (e) => { if (e.target !== num) set(base[key]); });
  row.append(name, range, num);
  panel.append(row);
  rows.set(key, { row, range, num });

  // After a ramp's last knob, its curve over the levels.
  if (key.endsWith('Cap')) {
    const r = key.slice(0, -3) as RampKey;
    const box = document.createElement('div');
    box.className = 'ramp';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 200 34');
    svg.setAttribute('preserveAspectRatio', 'none');
    const now = document.createElement('div');
    now.className = 'now';
    box.append(svg, now);
    panel.append(box);
    ramps.push({ key: r, svg, now, unit: (DIFF_KNOBS[r].label.match(/\((.*?)\)/)?.[1] ?? '') });
  }
}

function show(key: DiffKey) {
  const r = rows.get(key)!;
  r.range.value = r.num.value = String(DIFF[key]);
  r.row.classList.toggle('changed', DIFF[key] !== base[key]);
  const ramp = rampOf(key);
  if (ramp) drawRamp(ramps.find((x) => x.key === ramp)!);
}
function showAll() {
  for (const k of keys) show(k);
  ramps.forEach(drawRamp);
}

let shownLevel = 0;
function drawRamp(r: (typeof ramps)[number]) {
  const vals = Array.from({ length: LEVELS }, (_, i) => at(r.key, i + 1));
  const hi = Math.max(...vals, 1e-6) * 1.1;
  const x = (i: number) => 4 + (i / (LEVELS - 1)) * 192;
  const y = (v: number) => 31 - (v / hi) * 28;
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lv = Math.min(game.level, LEVELS) - 1;
  r.svg.innerHTML =
    `<line x1="4" x2="196" y1="31" y2="31" stroke="#2a2450"/>` +
    `<polyline points="${pts}" fill="none" stroke="#6fe3ff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` +
    `<circle cx="${x(lv)}" cy="${y(vals[lv])}" r="2.6" fill="#ffd23a"/>`;
  const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2));
  r.now.innerHTML = `L${game.level}: ${fmt(at(r.key, game.level))} ${r.unit}<small>L1 ${fmt(vals[0])} → L${LEVELS} ${fmt(vals[LEVELS - 1])}</small>`;
}

showAll();

// ---------------------------------------------------------------- saving

let toastT = 0;
function flash(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = window.setTimeout(() => (t.hidden = true), 1800);
}

const json = () => JSON.stringify(DIFF, null, 2) + '\n';

$('save').addEventListener('click', async () => {
  try {
    const res = await fetch('./__difficulty', { method: 'POST', body: json() });
    if (!res.ok) throw new Error(await res.text());
    base = { ...DIFF };
    saveDraft();
    showAll();
    flash('Saved to difficulty.json');
  } catch {
    // Not on the dev server: hand over the numbers instead.
    await navigator.clipboard?.writeText(json()).catch(() => {});
    flash('No dev server to save to: JSON copied');
  }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(json()); flash('Copied'); } catch { flash('Clipboard blocked'); }
});
$('revert').addEventListener('click', () => { Object.assign(DIFF, base); saveDraft(); showAll(); flash('Back to the saved file'); });
$('defaults').addEventListener('click', () => { Object.assign(DIFF, original); saveDraft(); showAll(); flash('Original values (not saved yet)'); });

// Typing into a number box must not walk Wavell about.
for (const t of ['keydown', 'keyup'] as const) $('side').addEventListener(t, (e) => e.stopPropagation());

// ---------------------------------------------------------------- the game

let paused = false;
let speed = 1;

function setLevel(l: number) {
  game.level = Math.max(1, l);
  ramps.forEach(drawRamp);
}

$('restart').addEventListener('click', () => { game.start(); setLevel(game.level); canvas.focus(); });
$('pause').addEventListener('click', () => { paused = !paused; $('pause').textContent = paused ? '▶' : '❚❚'; });
$('lvdown').addEventListener('click', () => setLevel(game.level - 1));
$('lvup').addEventListener('click', () => setLevel(game.level + 1));
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
  b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
  });
});
// Buttons keep no focus, so Space and the arrows always go to the game.
document.querySelectorAll<HTMLElement>('#bar button').forEach((b) => b.addEventListener('mouseup', () => b.blur()));

let last = performance.now();
function loop(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  if (!paused) {
    if (speed < 1) game.frame(dt * speed);
    else for (let i = 0; i < speed; i++) game.frame(dt);
    if (($('godmode') as HTMLInputElement).checked) game.lives = Math.max(game.lives, 3);
  } else game.draw(0);
  if (game.level !== shownLevel) { shownLevel = game.level; $('level').textContent = String(game.level); ramps.forEach(drawRamp); }
  const W = game.wavell;
  $('state').textContent = `${game.mode}  ·  score ${game.score}  ·  lives ${game.lives}  ·  ${game.playTime.toFixed(1)} s  ·  ` +
    `lead ${Math.max(0, W.x - game.endX).toFixed(0)} / ${DIFF.endLead} u  ·  snawaves ${game.snawaves.length}  worms ${game.worms.length}  ` +
    `bubbles ${game.bubbles.length}  backwaves ${game.backwaves.length}  refluxes ${game.refluxes.length}` +
    (DIFF.beatOn ? `  ·  ${Math.round(game.beat.bpm)} BPM, world ${game.beat.speed.toFixed(2)}×` : '');
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if (import.meta.env.DEV) (window as unknown as { diff: unknown }).diff = { game, DIFF };
