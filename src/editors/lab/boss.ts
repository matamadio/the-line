// The boss editor of the animation lab: THE FLATTENER's shapes and powers (src/data/boss.json).
//
// Shapes: his outline is drawn as the real stroke on the line, with a handle on every
// point, eye, nose, the shot's way out and the extra strokes (legs, a fang). Drag them,
// click one to select it, add a point after it or delete it. The blob and the saw are
// worked out from a few numbers, set in the side panel (their eyes can be dragged).
//
// Powers: each power is a list of steps (flow into a shape, hold it, fire). Edit them in
// the side panel and play the power on the preview, with Wavell standing by for scale.
//
// Edits change BOSS in place, so the game uses them straight away; Save writes them into
// src/data/boss.json through the dev server.

import { BOSS, FIRES, SOUNDS, newStep, type PathShape, type ShapeDef, type Step } from '../../data/boss';
import { namedPose } from '../../data/anim';
import { SpringLine } from '../../game/line';
import { COLORS, Neon, smoothPath } from '../../core/neon';
import { Flattener } from '../../game/actors/flattener';
import { Wavell } from '../../game/actors/wavell';
import { BEAT_SECONDS } from '../../game/beat';
import type { Editor } from './keyframes';

const PICK = 12;
/** Wavell stands this far in front of him, for scale. */
const WAVELL_AT = -70;
/** A rolling saw flattens out once this far left. */
const SAW_STOP = -150;
const SHOT_SPEED = 160;

type Handle = { kind: 'pt' | 'eye' | 'nose' | 'emit' | 'stroke'; i: number; j: number; x: number; y: number };
type View = { kind: 'shape'; name: string } | { kind: 'power'; name: string };

export function createBossEditor(neon: Neon, root: HTMLElement): Editor {
  const line = new SpringLine();
  line.cover(-260, 260);
  const boss = new Flattener(0);
  const fig = new Wavell();
  fig.state = 'ground';
  fig.x = WAVELL_AT;
  fig.showPose(namedPose('idle'));

  let active = false;
  let view: View = { kind: 'shape', name: 'catCrouch' };
  let side: 1 | -1 = 1;
  let zoom = 1.75;
  let sel: Handle | null = null;
  let drag: Handle | null = null;
  let hover: Handle | null = null;
  /** What the dragged handle snapped onto, if anything. */
  let snapped: Handle | null = null;
  let dirty = false;
  let playing = false;
  let clock = 0;
  let lastBeat = -1;
  let idleFor = 0;
  let selStep = 0;
  const log: string[] = [];
  const shots: { x: number; side: 1 | -1; h: number; life: number }[] = [];
  const undo: string[] = [];
  const redo: string[] = [];

  const shape = (): ShapeDef | null => (view.kind === 'shape' ? BOSS.shapes[view.name] ?? null : null);
  const path = (): PathShape | null => { const s = shape(); return s && s.kind === 'path' ? s : null; };
  const round = (v: number) => Math.round(v * 10) / 10;

  function snapshot() {
    undo.push(JSON.stringify(BOSS));
    if (undo.length > 200) undo.shift();
    redo.length = 0;
    dirty = true;
  }
  function restore(json: string) {
    const d = JSON.parse(json) as typeof BOSS;
    for (const k of Object.keys(BOSS.shapes)) delete BOSS.shapes[k];
    for (const k of Object.keys(BOSS.powers)) delete BOSS.powers[k];
    Object.assign(BOSS.shapes, d.shapes);
    Object.assign(BOSS.powers, d.powers);
    if (!(view.name in (view.kind === 'shape' ? BOSS.shapes : BOSS.powers))) view = { kind: 'shape', name: Object.keys(BOSS.shapes)[0] };
    dirty = true;
    sel = null;
    show();
    build();
  }

  /** Put him in what is being edited: the shape, still, or the power from its start. */
  function show() {
    boss.x = 0;
    shots.length = 0;
    if (view.kind === 'shape') { playing = false; boss.pose(view.name, side); }
    else { boss.pose('blob'); if (playing) start(); }
  }
  function start() {
    boss.x = 0;
    boss.play(view.name);
    playing = true;
    idleFor = 0;
    log.length = 0;
  }

  // ---------------------------------------------------------------- handles

  /** Every draggable point, in world space (y down). */
  function handles(): Handle[] {
    const s = shape();
    if (!s || view.kind !== 'shape') return [];
    const k = boss.scale, out: Handle[] = [];
    const add = (kind: Handle['kind'], i: number, j: number, dx: number, h: number) => out.push({ kind, i, j, x: boss.x + dx * k, y: -h * k * side });
    s.eyes.forEach((e, i) => add('eye', i, 0, e[0], e[1]));
    if (s.kind === 'path') {
      s.pts.forEach((p, i) => add('pt', i, 0, p[0], p[1]));
      if (s.nose) add('nose', 0, 0, s.nose[0], s.nose[1]);
      if (s.emit) add('emit', 0, 0, s.emit[0], s.emit[1]);
      s.strokes.forEach((st, i) => st.forEach((p, j) => add('stroke', i, j, p[0], p[1])));
    }
    return out;
  }
  const same = (a: Handle | null, b: Handle | null) => !!a && !!b && a.kind === b.kind && a.i === b.i && a.j === b.j;

  function world(sx: number, sy: number): [number, number] {
    const r = neon.canvas.getBoundingClientRect();
    return [(sx - r.left - neon.ox) / neon.unit + neon.camX, (sy - r.top - neon.oy - neon.lineY) / neon.unit];
  }
  function pick(sx: number, sy: number): Handle | null {
    const r = neon.canvas.getBoundingClientRect();
    let best: Handle | null = null, bd = PICK;
    for (const h of handles()) {
      const [x, y] = neon.toScreen(h.x, h.y);
      const d = Math.hypot(x + neon.ox + r.left - sx, y + neon.oy + r.top - sy);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /** The [across, up] numbers a handle stands for. */
  function ref(h: Handle): number[] | null {
    const s = shape();
    if (!s) return null;
    if (h.kind === 'eye') return s.eyes[h.i] ?? null;
    if (s.kind !== 'path') return null;
    if (h.kind === 'pt') return s.pts[h.i] ?? null;
    if (h.kind === 'nose') return s.nose ?? null;
    if (h.kind === 'emit') return s.emit ?? null;
    return s.strokes[h.i]?.[h.j] ?? null;
  }

  const cv = neon.canvas;
  cv.addEventListener('pointerdown', (e) => {
    if (!active) return;
    const h = pick(e.clientX, e.clientY);
    sel = h;
    if (!h) { build(); return; }
    snapshot();
    drag = h;
    cv.setPointerCapture(e.pointerId);
    move(e);
    build();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!active) return;
    if (!drag) { hover = pick(e.clientX, e.clientY); return; }
    move(e);
  });
  const up = () => { if (drag) { drag = null; snapped = null; build(); } };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  function move(e: PointerEvent) {
    if (!drag) return;
    const p = ref(drag), s = path();
    if (!p) return;
    const [wx, wy] = world(e.clientX, e.clientY), k = boss.scale;
    p[0] = round((wx - boss.x) / k);
    p[1] = round(-wy / k / side);
    snapped = null;
    // Snapping: onto another point of the outline or a stroke, or onto the line, so ends meet
    // exactly. Alt drags freely.
    if (!e.altKey && drag.kind !== 'eye') {
      const [sx, sy] = neon.toScreen(wx, wy);
      let bd = PICK;
      for (const h of handles()) {
        if (same(h, drag) || (h.kind !== 'pt' && h.kind !== 'stroke')) continue;
        const [hx, hy] = neon.toScreen(h.x, h.y), d = Math.hypot(hx - sx, hy - sy);
        if (d < bd) { bd = d; snapped = h; }
      }
      const q = snapped && ref(snapped);
      if (q) { p[0] = q[0]; p[1] = q[1]; }
      else if (Math.abs(neon.toScreen(wx, 0)[1] - sy) < PICK * 0.6) p[1] = 0;
    }
    // The roots stay on the line.
    if (s && drag.kind === 'pt' && (drag.i === 0 || drag.i === s.pts.length - 1)) p[1] = 0;
  }

  /** A stroke's end that touches nothing: no other point, and not the line. */
  function loose(st: number[][], j: number): boolean {
    const s = path();
    if (!s || (j !== 0 && j !== st.length - 1)) return false;
    const [x, h] = st[j];
    if (Math.abs(h) < 0.05) return false;
    const near = (q: number[]) => q !== st[j] && Math.hypot(q[0] - x, q[1] - h) < 0.6;
    if (j === st.length - 1 && near(st[0])) return false;
    return !s.pts.some(near) && !s.strokes.some((o) => o.some((q, i) => (o !== st || i !== j) && near(q)));
  }

  /** The selected stroke's end goes back to its start: a closed loop. */
  function closeStroke() {
    const s = path();
    if (!s || sel?.kind !== 'stroke') return;
    const st = s.strokes[sel.i];
    snapshot();
    st.push([st[0][0], st[0][1]]);
    build();
  }

  /** The selected stroke end and the nearest end of another stroke become one stroke. */
  function joinStroke() {
    const s = path();
    if (!s || sel?.kind !== 'stroke') return;
    const a = s.strokes[sel.i], atEnd = sel.j >= a.length / 2, p = atEnd ? a[a.length - 1] : a[0];
    let best = -1, bestEnd = false, bd = Infinity;
    s.strokes.forEach((o, i) => {
      if (i === sel!.i) return;
      for (const end of [false, true]) {
        const q = end ? o[o.length - 1] : o[0], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < bd) { bd = d; best = i; bestEnd = end; }
      }
    });
    if (best < 0) { status('There is no other stroke to join to.'); return; }
    snapshot();
    let b = s.strokes[best].map((q) => [q[0], q[1]] as [number, number]);
    if (bestEnd) b = b.reverse();         // b now starts at the end nearest p
    const first = atEnd ? a : [...a].reverse();
    if (Math.hypot(b[0][0] - p[0], b[0][1] - p[1]) < 0.6) b.shift(); // the same point: keep one
    s.strokes[sel.i] = [...first, ...b];
    s.strokes.splice(best, 1);
    sel = null;
    status(`Joined: one stroke of ${first.length + b.length} points.`);
    build();
  }

  // ---------------------------------------------------------------- point editing

  function addPoint() {
    const s = path();
    if (!s) return;
    snapshot();
    if (sel?.kind === 'stroke') {
      const st = s.strokes[sel.i], j = Math.min(sel.j, st.length - 2);
      st.splice(j + 1, 0, [round((st[j][0] + st[j + 1][0]) / 2), round((st[j][1] + st[j + 1][1]) / 2)]);
      sel = { ...sel, j: j + 1 };
    } else {
      const i = Math.min(sel?.kind === 'pt' ? sel.i : s.pts.length - 2, s.pts.length - 2);
      const a = s.pts[i], b = s.pts[i + 1];
      s.pts.splice(i + 1, 0, [round((a[0] + b[0]) / 2), round((a[1] + b[1]) / 2)]);
      sel = { kind: 'pt', i: i + 1, j: 0, x: 0, y: 0 };
    }
    build();
  }
  function deletePoint() {
    const s = shape();
    if (!s || !sel) return;
    snapshot();
    if (sel.kind === 'eye') s.eyes.splice(sel.i, 1);
    else if (s.kind === 'path') {
      if (sel.kind === 'pt') {
        if (sel.i === 0 || sel.i === s.pts.length - 1 || s.pts.length <= 3) { status('The roots stay, and a shape needs 3 points.'); undo.pop(); return; }
        s.pts.splice(sel.i, 1);
      } else if (sel.kind === 'nose') delete s.nose;
      else if (sel.kind === 'emit') delete s.emit;
      else if (sel.kind === 'stroke') { s.strokes[sel.i].splice(sel.j, 1); if (s.strokes[sel.i].length < 2) s.strokes.splice(sel.i, 1); }
    }
    sel = null;
    build();
  }

  // ---------------------------------------------------------------- the preview

  function frame(dt: number, speed: number) {
    const d = dt * (view.kind === 'power' ? Math.max(speed, 0.05) * 4 : 1);
    clock += d;
    const beat = Math.floor(clock / BEAT_SECONDS), onBeat = beat !== lastBeat;
    lastBeat = beat;
    if (view.kind === 'power' && playing) {
      boss.update(d, onBeat, false);
      for (const e of boss.events.splice(0)) {
        const st = boss.step;
        if (e === 'shoot') {
          const [bx] = boss.butt(line);
          shots.push({ x: bx, side: boss.shot.side, h: boss.shot.height, life: 2 });
        }
        if (e === 'flatten') boss.reform(0);
        log.unshift(`${clock.toFixed(2)} s  ${e}${e === 'shoot' ? ` (side ${boss.shot.side}, height ${boss.shot.height})` : ''}${st ? ` · step ${boss.stepIndex + 1}` : ''}`);
        if (log.length > 8) log.pop();
      }
      if (boss.state === 'roll' && boss.x < SAW_STOP) boss.stopSaw();
      if (boss.state === 'idle' && !boss.power) { idleFor += d; if (idleFor > 1.2) start(); }
      const si = boss.power ? boss.stepIndex : -1;
      if (si !== selStep && si >= 0) { selStep = si; markStep(); }
    } else boss.update(d, false, false);
    for (const s of shots) { s.x -= SHOT_SPEED * d; s.life -= d; }
    while (shots.length && shots[0].life <= 0) shots.shift();
    q('bo-clock').textContent = `${boss.state}${boss.power ? ' · step ' + (boss.stepIndex + 1) : ''}${dirty ? ' · unsaved' : ''}`;
    const lg = root.querySelector('#bo-log');
    if (lg) lg.textContent = log.join('\n');
    draw(dt);
  }

  function draw(dt: number) {
    const n = neon, c = n.ctx;
    n.camX = -n.viewW * 0.45;
    n.shake = 0;
    n.begin(dt);
    n.world();
    // Grid: a unit every line, 5 units brighter.
    c.save();
    c.lineWidth = 1 / n.unit;
    for (let x = Math.floor(n.camX); x < n.camX + n.viewW; x++) {
      if (zoom < 2 && x % 5) continue;
      c.strokeStyle = x % 5 === 0 ? 'rgba(160,150,255,0.12)' : 'rgba(160,150,255,0.04)';
      c.beginPath(); c.moveTo(x, n.viewTop); c.lineTo(x, n.viewBottom); c.stroke();
    }
    for (let y = Math.floor(n.viewTop); y < n.viewBottom; y++) {
      if (zoom < 2 && y % 5) continue;
      c.strokeStyle = y % 5 === 0 ? 'rgba(160,150,255,0.12)' : 'rgba(160,150,255,0.04)';
      c.beginPath(); c.moveTo(n.camX, y); c.lineTo(n.camX + n.viewW, y); c.stroke();
    }
    c.restore();
    const L = n.camX - 5, R = n.camX + n.viewW + 5;
    const o = boss.done ? [] : boss.outline(line);
    const w = fig.stroke(line) ?? [];
    // The rolling saw can pass Wavell: then it is drawn on its own.
    if (o.length && o[0] > (w[w.length - 2] ?? -Infinity)) n.glow(smoothPath([L, 0, ...w, ...o, R, 0]), COLORS.line, 0.9);
    else { n.glow(smoothPath([L, 0, ...w, R, 0]), COLORS.line, 0.9); if (o.length) n.glow(smoothPath(o), COLORS.line, 0.9); }
    fig.drawFeatures(n, line);
    boss.drawFeatures(n, line, fig.x);
    // Shots, at the height they run at.
    for (const s of shots) {
      const y = -s.side * fig.height * s.h, p = new Path2D();
      p.moveTo(s.x, y); p.lineTo(s.x + 8, y);
      n.glow(p, COLORS.danger, 1, Math.min(1, s.life));
    }

    n.screen();
    // Loose ends: stroke ends that touch nothing, ringed in orange.
    const ps = path();
    if (ps) {
      for (const h of handles()) {
        if (h.kind !== 'stroke' || !loose(ps.strokes[h.i], h.j)) continue;
        const [x, y] = n.toScreen(h.x, h.y);
        c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2);
        c.lineWidth = 2; c.strokeStyle = 'rgba(255,140,40,0.85)'; c.stroke();
      }
    }
    if (drag && snapped) {
      const [x, y] = n.toScreen(snapped.x, snapped.y);
      c.beginPath(); c.arc(x, y, 12, 0, Math.PI * 2);
      c.lineWidth = 2; c.strokeStyle = '#7dff9a'; c.stroke();
    }
    for (const h of handles()) {
      const [x, y] = n.toScreen(h.x, h.y);
      const on = same(h, drag) || same(h, hover), picked = same(h, sel);
      c.beginPath();
      if (h.kind === 'pt') c.arc(x, y, on ? 7 : 4.5, 0, Math.PI * 2);
      else c.rect(x - (on ? 6 : 4), y - (on ? 6 : 4), on ? 12 : 8, on ? 12 : 8);
      c.lineWidth = 1.5;
      c.strokeStyle = h.kind === 'pt' ? '#ffffff' : h.kind === 'eye' ? '#ffd23a' : h.kind === 'stroke' ? '#4fc3ff' : '#ff7ad9';
      c.fillStyle = picked ? '#ffd23a' : on ? 'rgba(255,210,58,0.5)' : 'rgba(10,8,30,0.6)';
      c.fill();
      c.stroke();
      if (on || picked) {
        const p = ref(h);
        c.fillStyle = '#ffffff';
        c.font = '12px system-ui, sans-serif';
        if (p) c.fillText(`${h.kind}${h.kind === 'stroke' ? ' ' + (h.i + 1) + '.' + (h.j + 1) : h.kind === 'pt' || h.kind === 'eye' ? ' ' + (h.i + 1) : ''}  ${p[0].toFixed(1)}, ${p[1].toFixed(1)}`, x + 9, y - 8);
      }
    }
  }

  // ---------------------------------------------------------------- panel

  root.innerHTML = `
    <h2>Edit the boss</h2>
    <select id="bo-target"></select>
    <div class="row">
      <label class="group">Zoom <input id="bo-zoom" type="range" min="1" max="6" step="0.25"></label>
      <span id="bo-clock" class="mono"></span>
    </div>
    <div class="row">
      <button id="bo-save">Save to boss.json</button>
      <button id="bo-undo" title="Ctrl+Z">Undo</button>
      <button id="bo-redo" title="Ctrl+Y">Redo</button>
    </div>
    <p id="bo-status" class="help"></p>
    <div id="bo-panel"></div>`;
  const q = <T extends HTMLElement>(id: string) => root.querySelector('#' + id) as T;
  const selT = q<HTMLSelectElement>('bo-target');
  const zoomIn = q<HTMLInputElement>('bo-zoom');
  zoomIn.value = String(zoom);
  zoomIn.oninput = () => { zoom = Number(zoomIn.value); neon.zoom = zoom; neon.resize(); };
  selT.onchange = () => {
    const [kind, name] = selT.value.split(':') as ['shape' | 'power', string];
    view = { kind, name };
    sel = null;
    selStep = 0;
    side = 1;
    show();
    build();
  };
  q('bo-save').onclick = () => save();
  q('bo-undo').onclick = () => doUndo();
  q('bo-redo').onclick = () => doRedo();

  function doUndo() { const s = undo.pop(); if (!s) return; redo.push(JSON.stringify(BOSS)); restore(s); }
  function doRedo() { const s = redo.pop(); if (!s) return; undo.push(JSON.stringify(BOSS)); restore(s); }

  async function save() {
    try {
      const r = await fetch('./__boss', { method: 'POST', body: JSON.stringify(BOSS) });
      if (!r.ok) throw new Error(await r.text());
      dirty = false;
      status('Saved to src/data/boss.json.');
    } catch {
      await navigator.clipboard?.writeText(JSON.stringify(BOSS, null, 2) + '\n').catch(() => {});
      status('No dev server to save to: boss.json copied to the clipboard.');
    }
  }
  function status(s: string) { q('bo-status').textContent = s; }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, props: Partial<HTMLElementTagNameMap[K]> = {}) {
    const e = document.createElement(tag);
    Object.assign(e, props);
    parent.appendChild(e);
    return e;
  }
  /** A labelled number. */
  function num(parent: HTMLElement, label: string, value: number, step: number, set: (v: number) => void, min = -999, max = 999) {
    const row = el('label', parent, { className: 'knob' });
    el('span', row, { textContent: label });
    const inp = el('input', row, { type: 'number', step: String(step), min: String(min), max: String(max), value: String(value) });
    inp.style.gridColumn = '2 / 4';
    inp.onchange = () => {
      const v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      snapshot();
      set(Math.min(max, Math.max(min, v)));
      if (view.kind === 'power') show();
    };
  }
  function choice<T extends string | number>(parent: HTMLElement, label: string, value: T, options: readonly T[], set: (v: T) => void, names?: string[]) {
    const row = el('label', parent, { className: 'knob' });
    el('span', row, { textContent: label });
    const s = el('select', row);
    s.style.gridColumn = '2 / 4';
    options.forEach((o, i) => el('option', s, { value: String(o), textContent: names?.[i] ?? String(o), selected: o === value }));
    s.onchange = () => { snapshot(); set((typeof value === 'number' ? Number(s.value) : s.value) as T); show(); build(); };
  }
  function check(parent: HTMLElement, label: string, value: boolean, set: (v: boolean) => void) {
    const row = el('label', parent, { className: 'knob' });
    el('span', row, { textContent: label });
    const c = el('input', row, { type: 'checkbox', checked: value });
    c.onchange = () => { snapshot(); set(c.checked); show(); };
  }
  function button(parent: HTMLElement, text: string, onclick: () => void, title = '') {
    return el('button', parent, { textContent: text, onclick, title });
  }

  function build() {
    const keep = `${view.kind}:${view.name}`;
    selT.innerHTML = '';
    const gs = el('optgroup', selT, { label: 'Shapes' } as Partial<HTMLOptGroupElement>);
    for (const k of Object.keys(BOSS.shapes)) el('option', gs, { value: 'shape:' + k, textContent: `Shape: ${k}` });
    const gp = el('optgroup', selT, { label: 'Powers' } as Partial<HTMLOptGroupElement>);
    for (const k of Object.keys(BOSS.powers)) el('option', gp, { value: 'power:' + k, textContent: `Power: ${k}` });
    selT.value = keep;
    const box = q('bo-panel');
    box.innerHTML = '';
    if (view.kind === 'shape') buildShape(box);
    else buildPower(box);
  }

  function buildShape(box: HTMLElement) {
    const s = shape();
    if (!s) return;
    const r = el('div', box, { className: 'row' });
    button(r, side === 1 ? 'Show under the line' : 'Show over the line', () => { side = side === 1 ? -1 : 1; show(); build(); }, 'Steps can put any shape under the line, mirrored');
    button(r, 'Copy as new shape', () => {
      const name = prompt('Name of the new shape', view.name + '2')?.trim();
      if (!name || BOSS.shapes[name]) return;
      snapshot();
      BOSS.shapes[name] = JSON.parse(JSON.stringify(s));
      view = { kind: 'shape', name };
      show();
      build();
    });
    const used = Object.entries(BOSS.powers).filter(([, p]) => p.steps.some((st) => st.shape === view.name)).map(([k]) => k);
    if (!['blob', 'flat', 'saw'].includes(view.name)) {
      button(r, 'Delete shape', () => {
        if (used.length) { status(`Used by: ${used.join(', ')}. Change those steps first.`); return; }
        snapshot();
        delete BOSS.shapes[view.name];
        view = { kind: 'shape', name: 'blob' };
        show();
        build();
      });
    }
    if (used.length) el('p', box, { className: 'help', textContent: `Used by the powers: ${used.join(', ')}.` });
    if (s.kind === 'blob') {
      el('h3', box, { textContent: 'Blob (the idle shape)' });
      num(box, 'Radius (u)', s.radius, 0.5, (v) => (s.radius = v), 4, 80);
      num(box, 'Ripple (u)', s.wobble, 0.1, (v) => (s.wobble = v), 0, 8);
      num(box, 'Eyes drift (u)', s.drift, 0.5, (v) => (s.drift = v), 0, 20);
    } else if (s.kind === 'saw') {
      el('h3', box, { textContent: 'Saw' });
      num(box, 'Radius (u)', s.radius, 0.5, (v) => (s.radius = v), 4, 60);
      num(box, 'Teeth', s.teeth, 1, (v) => (s.teeth = Math.round(v)), 0, 48);
      num(box, 'Tooth length (u)', s.tooth, 0.1, (v) => (s.tooth = v), 0, 12);
    } else {
      el('h3', box, { textContent: 'Outline' });
      el('p', box, { className: 'help', textContent: `${s.pts.length} points, root to root (the roots stay on the line). Click a handle to select it.` });
      const pr = el('div', box, { className: 'row' });
      button(pr, 'Add point after selected', addPoint, 'Halfway to the next point');
      button(pr, 'Delete selected', deletePoint, 'Delete key');
      el('h3', box, { textContent: 'Features' });
      const fr = el('div', box, { className: 'row' });
      if (!s.nose) button(fr, 'Add nose', () => { snapshot(); s.nose = [s.eyes[0] ? s.eyes[0][0] + 6 : 10, s.eyes[0] ? s.eyes[0][1] - 3 : 10]; build(); });
      if (!s.emit) button(fr, 'Add shot point', () => { snapshot(); s.emit = [s.pts[1][0], s.pts[1][1]]; build(); });
      button(fr, 'Add stroke', () => { snapshot(); s.strokes.push([[-5, 5], [5, 5]]); sel = { kind: 'stroke', i: s.strokes.length - 1, j: 0, x: 0, y: 0 }; build(); });
      if (sel?.kind === 'stroke') {
        const jr = el('div', box, { className: 'row' });
        button(jr, 'Join to nearest stroke', joinStroke, 'The selected stroke and the stroke whose end is nearest become one stroke');
        button(jr, 'Close stroke', closeStroke, 'Its last point goes back to its first');
      }
      const ends = s.strokes.reduce((a, st) => a + (loose(st, 0) ? 1 : 0) + (loose(st, st.length - 1) ? 1 : 0), 0);
      el('p', box, { className: 'help', textContent: ends ? `${ends} loose ends (ringed in orange). Drag one onto a point or the line: it snaps on (green ring). Alt drags freely.` : 'No loose ends: every stroke end touches a point or the line.' });
      el('p', box, { className: 'help', textContent: `${s.strokes.length} strokes (legs, a fang: blue handles). Select a stroke point and "Add point after selected" to lengthen it.` });
    }
    el('h3', box, { textContent: 'Eyes' });
    s.eyes.forEach((e, i) => num(box, `Eye ${i + 1} radius`, e[2], 0.1, (v) => (e[2] = v), 0, 12));
    if (s.eyes.length < 2) button(el('div', box, { className: 'row' }), 'Add eye', () => { snapshot(); s.eyes.push([0, 10, 3]); build(); });
    el('p', box, {
      className: 'help',
      innerHTML: 'Drag the handles: white points are the outline, yellow squares the eyes, pink the nose and the shot\'s way out, blue the strokes. '
        + '<kbd>Delete</kbd> deletes the selected one, <kbd>Insert</kbd> adds a point after it, <kbd>Ctrl+Z</kbd> undo, <kbd>Ctrl+S</kbd> save.',
    });
  }

  function markStep() {
    root.querySelectorAll<HTMLElement>('.bo-step').forEach((e, i) => e.classList.toggle('on', i === selStep));
  }

  function buildPower(box: HTMLElement) {
    const p = BOSS.powers[view.name];
    if (!p) return;
    const r = el('div', box, { className: 'row' });
    button(r, playing ? '❚❚ Stop' : '▶ Play', () => { if (playing) { playing = false; show(); } else start(); build(); }, 'Space');
    button(r, 'Copy as new power', () => {
      const name = prompt('Name of the new power', view.name + '2')?.trim();
      if (!name || BOSS.powers[name]) return;
      snapshot();
      BOSS.powers[name] = JSON.parse(JSON.stringify(p));
      view = { kind: 'power', name };
      show();
      build();
    });
    if (Object.keys(BOSS.powers).length > 1) button(r, 'Delete power', () => { snapshot(); delete BOSS.powers[view.name]; view = { kind: 'power', name: Object.keys(BOSS.powers)[0] }; show(); build(); });
    el('p', box, { className: 'help', textContent: 'Plays at the lab\'s speed ×4 (1× at 0.25×), with a beat every 0.8 s as in the game. Wavell stands by for scale; red dashes are the shots, at the height they run.' });
    el('pre', box, { id: 'bo-log', className: 'mono' }).style.cssText = 'min-height:7.5em;margin:4px 0;font-size:11px;white-space:pre-wrap';
    num(box, 'From phase (1 to 3)', p.from, 1, (v) => (p.from = Math.round(v)), 1, 3);
    num(box, 'How often he picks it', p.weight, 1, (v) => (p.weight = v), 0, 50);
    check(box, 'Shuffle its groups each time', !!p.shuffle, (v) => { p.shuffle = v; build(); });
    if (p.shuffle) el('p', box, { className: 'help', textContent: 'Steps in a row with the same group number (1 and up) are one move. Each time, the moves swap places at random; group 0 steps stay where they are.' });
    el('h3', box, { textContent: 'Steps' });
    const list = el('div', box, { className: 'keys' });
    p.steps.forEach((s, i) => {
      const b = button(list, `${i + 1}. ${p.shuffle && s.group ? '[' + s.group + '] ' : ''}${s.shape}${s.side < 0 ? ' (under)' : ''} · ${s.morph}+${s.hold} s${s.beat ? ' · beat' : ''}${s.fire !== 'none' ? ' → ' + s.fire : ''}`, () => { selStep = i; build(); });
      b.className = 'bo-step' + (i === selStep ? ' on' : '');
      b.style.textAlign = 'left';
    });
    const sr = el('div', box, { className: 'row' });
    button(sr, 'Add step', () => { snapshot(); p.steps.splice(selStep + 1, 0, p.steps[selStep] ? JSON.parse(JSON.stringify(p.steps[selStep])) : newStep()); selStep++; build(); }, 'A copy of the selected one, after it');
    button(sr, '↑', () => { if (selStep < 1) return; snapshot(); [p.steps[selStep - 1], p.steps[selStep]] = [p.steps[selStep], p.steps[selStep - 1]]; selStep--; build(); }, 'Move up');
    button(sr, '↓', () => { if (selStep >= p.steps.length - 1) return; snapshot(); [p.steps[selStep + 1], p.steps[selStep]] = [p.steps[selStep], p.steps[selStep + 1]]; selStep++; build(); }, 'Move down');
    if (p.steps.length > 1) button(sr, 'Delete step', () => { snapshot(); p.steps.splice(selStep, 1); selStep = Math.min(selStep, p.steps.length - 1); build(); });
    const s: Step | undefined = p.steps[selStep];
    if (!s) return;
    el('h3', box, { textContent: `Step ${selStep + 1}` });
    choice(box, 'Shape', s.shape, Object.keys(BOSS.shapes), (v) => (s.shape = v));
    choice(box, 'Side of the line', s.side, [1, -1] as const, (v) => (s.side = v), ['over', 'under (mirrored)']);
    num(box, 'Flow into it (s)', s.morph, 0.05, (v) => (s.morph = v), 0, 5);
    num(box, 'Hold / charge (s)', s.hold, 0.05, (v) => (s.hold = v), 0, 10);
    check(box, 'Then wait for the beat', s.beat, (v) => (s.beat = v));
    choice(box, 'Sound at the start', s.sound, SOUNDS, (v) => (s.sound = v));
    choice(box, 'Then fire', s.fire, FIRES, (v) => (s.fire = v), ['nothing', 'slam (front wave)', 'shoot (reflux)', 'roll (as a saw)']);
    if (s.fire === 'shoot') num(box, 'Shot height (Wavell heights)', s.height, 0.05, (v) => (s.height = v), 0, 4);
    num(box, 'Bubble every (s, 0: none)', s.bubbles, 0.05, (v) => (s.bubbles = v), 0, 5);
    num(box, 'Rears up from (×height)', s.grow[0], 0.05, (v) => (s.grow[0] = v), 0, 3);
    num(box, '… to (×height)', s.grow[1], 0.05, (v) => (s.grow[1] = v), 0, 3);
    check(box, 'Glows while charging', s.glow, (v) => (s.glow = v));
    check(box, 'Walking into him hurts', s.touch, (v) => (s.touch = v));
    if (p.shuffle) num(box, 'Group (0: stays in place)', s.group ?? 0, 1, (v) => { s.group = Math.round(v); build(); }, 0, 20);
    if (s.fire === 'roll') el('p', box, { className: 'help', textContent: 'A roll ends the power: the saw rolls at Wavell, flattens out, and he grows back in his place.' });
    if (!BOSS.shapes[s.shape]) el('p', box, { className: 'help', textContent: 'No such shape.' });
  }

  function key(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.code === 'Space' && view.kind === 'power') { e.preventDefault(); if (playing) { playing = false; show(); } else start(); build(); }
    else if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); deletePoint(); }
    else if (e.code === 'Insert') { e.preventDefault(); addPoint(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); doRedo(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); }
  }

  window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

  return {
    get active() { return active; },
    setActive(on: boolean) {
      active = on;
      if (on) { neon.zoom = zoom; neon.resize(); show(); build(); }
    },
    frame,
    key,
  };
}
