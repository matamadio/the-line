// The animation lab (lab.html): play any animation of the game in
// slow motion, frame by frame or scrubbed back and forth, and tune the numbers in
// tune.ts with sliders while it plays.
//
// Every scene is a setup plus a script of key presses, and the simulation runs with
// a seeded random, so replaying a scene up to frame n always gives the same frame n.
// That is what makes scrubbing backwards and live tuning possible: both just replay.

import { Game } from '../../game/game';
import { Input, type Controls } from '../../core/input';
import { Neon } from '../../core/neon';
import { sfx } from '../../core/sfx';
import { KNOBS, TUNE, type TuneKey } from '../../data/tune';
import { createEditor } from './keyframes';
import { DIFF } from '../../data/difficulty';
import { FREE, SCENES, type Held, type Tap } from './scenes';

const STEP = 1 / 120;
const STORE = 'the-line-lab';

// ---------------------------------------------------------------- seeded random

const nativeRandom = Math.random;
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- state

const canvas = document.getElementById('view') as HTMLCanvasElement;
const neon = new Neon(canvas);
const editor = createEditor(neon, document.getElementById('editor')!);
// The game's own input listens on an element nobody touches: the lab feeds it scripted keys.
const deadInput = new Input(document.createElement('div'));
sfx.muted = true;
// Scenes are scripted to the second, and show an animation rather than the beat.
DIFF.beatOn = 0;

let sceneIx = 1;
let game!: Game;
let rng = seeded(1);
let frame = 0;
let playing = true;
let speed = 0.25;
let loop = true;
let acc = 0;
/** Free play: the controls of every recorded tick. */
let recording: Controls[] = [];
const live: Record<Held, boolean> = { left: false, right: false, up: false, down: false };
const liveTaps = new Set<Tap>();

const scene = () => SCENES[sceneIx];
const totalFrames = () => (sceneIx === FREE ? Math.max(recording.length, 1) : Math.round(scene().dur / STEP));

function controlsAt(i: number): Controls {
  if (sceneIx === FREE) return recording[i] ?? none();
  const t = i * STEP, c = none();
  for (const k of scene().keys ?? []) {
    if (k.length === 3) { if (t >= k[1] && t < k[2]) c[k[0]] = true; }
    else if (t <= k[1] && t + STEP > k[1]) c[k[0]] = true;
  }
  return c;
}

function none(): Controls {
  return { left: false, right: false, up: false, down: false, upPressed: false, downPressed: false, dragPressed: false, pullPressed: false };
}

function sim<T>(f: () => T): T {
  Math.random = rng;
  try { return f(); } finally { Math.random = nativeRandom; }
}

function tick(c: Controls) {
  sim(() => {
    game.tick(c);
    if (!scene().end) game.endX = game.wavell.x - 240;
  });
  frame++;
}

/** Rebuild the scene and run it up to frame n. */
function replay(n: number) {
  rng = seeded(7 + sceneIx);
  sim(() => {
    game = new Game(neon, deadInput);
    game.quiet = true;
    game.start();
    game.endX = game.wavell.x - 240;
    scene().setup?.(game);
  });
  neon.shake = 0;
  frame = 0;
  n = Math.min(n, totalFrames());
  while (frame < n) tick(controlsAt(frame));
}

// ---------------------------------------------------------------- loop

let last = performance.now();
function loopFn(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (editor.active) {
    editor.frame(dt, speed);
    requestAnimationFrame(loopFn);
    return;
  }
  if (playing) {
    acc += dt * speed;
    while (acc >= STEP) {
      acc -= STEP;
      if (sceneIx === FREE) {
        // Recording: what is held now, plus any taps since the last tick. Playing from
        // the middle of a recording overwrites the rest of it.
        const c: Controls = { ...none(), ...live };
        for (const t of liveTaps) c[t] = true;
        liveTaps.clear();
        recording.length = frame;
        recording.push(c);
        tick(c);
      } else if (frame < totalFrames()) tick(controlsAt(frame));
      else if (loop) replay(0);
      else { playing = false; break; }
    }
  }
  game.draw(playing ? dt * speed : 0);
  ui.sync();
  requestAnimationFrame(loopFn);
}

// ---------------------------------------------------------------- tuning store

function loadTune() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}') as Partial<Record<TuneKey, number>>;
    for (const k of Object.keys(saved) as TuneKey[]) if (k in KNOBS && typeof saved[k] === 'number') TUNE[k] = saved[k]!;
  } catch { /* storage blocked */ }
}
function saveTune() {
  try { localStorage.setItem(STORE, JSON.stringify(changed())); } catch { /* storage blocked */ }
}
function changed(): Partial<Record<TuneKey, number>> {
  const out: Partial<Record<TuneKey, number>> = {};
  for (const k of Object.keys(KNOBS) as TuneKey[]) if (TUNE[k] !== KNOBS[k].def) out[k] = TUNE[k];
  return out;
}

// ---------------------------------------------------------------- panel

loadTune();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = (() => {
  const scenes = $<HTMLDivElement>('scenes');
  const time = $<HTMLInputElement>('time');
  const clock = $<HTMLSpanElement>('clock');
  const playBtn = $<HTMLButtonElement>('play');
  const state = $<HTMLDivElement>('state');

  SCENES.forEach((s, i) => {
    const b = document.createElement('button');
    b.textContent = s.name;
    b.className = 'scene';
    b.onclick = () => select(i);
    scenes.append(b);
  });

  function select(i: number) {
    sceneIx = i;
    if (i === FREE) { recording = []; playing = false; }
    else playing = true;
    replay(0);
    Array.from(scenes.children).forEach((b, j) => b.classList.toggle('on', j === i));
    $('freehelp').hidden = i !== FREE;
    sync();
  }

  const step = (d: number) => {
    playing = false;
    const target = Math.max(0, Math.min(totalFrames(), frame + d));
    if (target > frame) while (frame < target) tick(controlsAt(frame));
    else replay(target);
  };

  playBtn.onclick = () => togglePlay();
  const togglePlay = () => {
    if (!playing && sceneIx !== FREE && frame >= totalFrames()) replay(0);
    playing = !playing;
  };
  $('back').onclick = () => step(-1);
  $('fwd').onclick = () => step(1);
  $('back10').onclick = () => step(-12);
  $('fwd10').onclick = () => step(12);
  $('restart').onclick = () => { replay(0); };
  $<HTMLInputElement>('loop').onchange = (e) => { loop = (e.target as HTMLInputElement).checked; };
  time.oninput = () => { playing = false; const n = Number(time.value); if (n >= frame) step(n - frame); else replay(n); };

  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
    b.onclick = () => {
      speed = Number(b.dataset.speed);
      document.querySelectorAll('[data-speed]').forEach((o) => o.classList.toggle('on', o === b));
    };
  });
  const zoom = $<HTMLInputElement>('zoom');
  zoom.oninput = () => { neon.zoom = Number(zoom.value); neon.resize(); replay(frame); };
  neon.zoom = Number(zoom.value);
  neon.resize();

  // Knobs, grouped.
  const knobs = $<HTMLDivElement>('knobs');
  const rows = new Map<TuneKey, { range: HTMLInputElement; num: HTMLInputElement; row: HTMLElement }>();
  let group = '';
  for (const key of Object.keys(KNOBS) as TuneKey[]) {
    const k = KNOBS[key];
    if (k.group !== group) {
      group = k.group;
      const h = document.createElement('h3');
      h.textContent = group;
      knobs.append(h);
    }
    const row = document.createElement('label');
    row.className = 'knob';
    row.title = `${key} (default ${k.def}). Double-click to reset.`;
    const name = document.createElement('span');
    name.textContent = k.label;
    const range = document.createElement('input');
    Object.assign(range, { type: 'range', min: String(k.min), max: String(k.max), step: String(k.step), value: String(TUNE[key]) });
    const num = document.createElement('input');
    Object.assign(num, { type: 'number', min: String(k.min), max: String(k.max), step: String(k.step), value: String(TUNE[key]) });
    const set = (v: number) => {
      if (!Number.isFinite(v)) return;
      TUNE[key] = v;
      range.value = num.value = String(v);
      row.classList.toggle('changed', v !== k.def);
      saveTune();
      // Same moment, new numbers.
      replay(frame);
    };
    range.oninput = () => set(Number(range.value));
    num.onchange = () => set(Number(num.value));
    row.ondblclick = () => set(k.def);
    row.append(name, range, num);
    row.classList.toggle('changed', TUNE[key] !== k.def);
    knobs.append(row);
    rows.set(key, { range, num, row });
  }

  $('copy').onclick = async () => {
    const text = JSON.stringify(changed(), null, 2);
    try { await navigator.clipboard.writeText(text); flash('Copied the changed values'); }
    catch { prompt('Copy these values:', text); }
  };
  $('resetall').onclick = () => {
    for (const [key, r] of rows) { TUNE[key] = KNOBS[key].def; r.range.value = r.num.value = String(TUNE[key]); r.row.classList.remove('changed'); }
    saveTune();
    replay(frame);
  };
  const toast = $('toast');
  let toastT = 0;
  function flash(msg: string) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toastT);
    toastT = window.setTimeout(() => { toast.hidden = true; }, 1600);
  }

  // Keys: transport always; in free play, the game's keys drive Wavell.
  const HELD: Record<string, Held> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
  const TAPS: Record<string, Tap> = { ArrowUp: 'upPressed', KeyW: 'upPressed', ArrowDown: 'downPressed', KeyS: 'downPressed', KeyZ: 'dragPressed', KeyJ: 'dragPressed', KeyX: 'pullPressed', KeyK: 'pullPressed' };
  window.addEventListener('keydown', (e) => {
    if (editor.active) { editor.key(e); return; }
    if (e.target instanceof HTMLInputElement && e.target.type === 'number') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
    if (e.code === 'Comma') { step(e.shiftKey ? -12 : -1); return; }
    if (e.code === 'Period') { step(e.shiftKey ? 12 : 1); return; }
    if (e.code === 'KeyR') { replay(0); return; }
    if (sceneIx !== FREE) return;
    if (HELD[e.code] || TAPS[e.code]) e.preventDefault();
    if (e.repeat) return;
    if (HELD[e.code]) live[HELD[e.code]] = true;
    if (TAPS[e.code]) liveTaps.add(TAPS[e.code]);
    if (!playing && (HELD[e.code] || TAPS[e.code])) playing = true;
  });
  window.addEventListener('keyup', (e) => { if (HELD[e.code]) live[HELD[e.code]] = false; });
  window.addEventListener('blur', () => { for (const k of Object.keys(live) as Held[]) live[k] = false; });

  function sync() {
      const n = totalFrames();
      time.max = String(n);
      time.value = String(frame);
      clock.textContent = `${(frame * STEP).toFixed(3)} s · frame ${frame} / ${n}`;
      playBtn.textContent = playing ? '❚❚' : '▶';
      const W = game.wavell;
      state.textContent = `Wavell: ${W.state}${W.state === 'dead' ? ' (' + W.death + ')' : ''}, t ${W.t.toFixed(2)}`
        + game.sinepedes.map((s) => ` · Sinepede: ${s.count} segments`).join('')
        + game.urchins.map((u) => ` · Disturchin: ${u.state} ${u.t.toFixed(2)}`).join('')
        + game.worms.map((w) => ` · Worm: ${w.state} ${w.t.toFixed(2)}`).join('');
  }

  // Play scenes / edit keyframes.
  const setMode = (edit: boolean) => {
    editor.setActive(edit);
    $('mode-edit').classList.toggle('on', edit);
    $('mode-play').classList.toggle('on', !edit);
    $('editor').hidden = !edit;
    $('playpanel').hidden = edit;
    $('bar').hidden = edit;
    if (!edit) {
      // Back to the scenes, with the new keyframes.
      neon.zoom = Number(zoom.value);
      neon.resize();
      replay(frame);
    }
  };
  $('mode-play').onclick = () => setMode(false);
  $('mode-edit').onclick = () => setMode(true);

  return { select, sync };
})();

ui.select(sceneIx);
requestAnimationFrame(loopFn);

if (import.meta.env.DEV) (window as unknown as { lab: unknown }).lab = { get game() { return game; }, replay, TUNE, editor, neon };
