// The keyframe editor of the animation lab: Wavell's clips (walk cycle, wipe, pull),
// his idle pose, the Killerwave's outline and the enemies' motions (rise, bite, sink),
// drawn as the real stroke with draggable joints or handles. Edits change ANIM in place, so the game uses them straight away; Save
// writes them into src/data/anim.json through the dev server.

import {
  ANIM, I, JOINTS, SIZE, clipLength, fromPose, keyPose, motion, motionLength, namedPose, pose,
  type Ease, type Joint, type Key, type MotionKey, type PoseData,
} from '../../data/anim';
import { SpringLine } from '../../game/line';
import { COLORS, Neon, smoothPath } from '../../core/neon';
import { FIN_POINTS, Orca } from '../../game/actors/orca';
import { Wavell } from '../../game/actors/wavell';
import { Worm } from '../../game/actors/worm';

const STEP = 1 / 120;
type Target = 'idle' | 'appear' | 'sink' | 'inflate' | 'deflate' | 'walk' | 'walkStrut' | 'wipe' | 'pull' | 'rage' | 'orca'
  | 'orca.fin' | 'worm.rise' | 'worm.bite' | 'worm.sink';
const TARGETS: [Target, string][] = [
  ['appear', 'Wavell: climbing out'],
  ['sink', 'Wavell: sinking (killed)'],
  ['inflate', 'Wavell: filling up to float'],
  ['deflate', 'Wavell: landing'],
  ['walk', 'Wavell: walk cycle'],
  ['walkStrut', 'Wavell: walk cycle (proposal)'],
  ['wipe', 'Wavell: wipe'],
  ['pull', 'Wavell: pull'],
  ['rage', 'Wavell: Rage (after untying the knot)'],
  ['idle', 'Wavell: idle pose'],
  ['orca', 'Killerwave (orca): outline, eye and teeth'],
  ['orca.fin', 'Killerwave: fin rising'],
  ['worm.rise', 'Worm: rise'],
  ['worm.bite', 'Worm: bite'],
  ['worm.sink', 'Worm: sink'],
];
/** Motion channels: slider range and step. g is the depth (Worm) or growth (fin) factor. */
const CHANNELS: Record<string, [string, number, number, number]> = {
  g: ['Height / depth (1 = normal)', 0, 2, 0.01],
  lunge: ['Head lunge (units)', -12, 15, 0.25],
  back: ['Fin tip leaned back (0 = over the middle, 1 = in place)', -0.5, 1.5, 0.01],
  b2u: ['Fin, 2nd point before the tip: along (u)', -25, 25, 0.1],
  b2v: ['Fin, 2nd point before the tip: up (u)', -25, 25, 0.1],
  b1u: ['Fin, point before the tip: along (u)', -25, 25, 0.1],
  b1v: ['Fin, point before the tip: up (u)', -25, 25, 0.1],
  f1u: ['Fin, point after the tip: along (u)', -25, 25, 0.1],
  f1v: ['Fin, point after the tip: up (u)', -25, 25, 0.1],
  f2u: ['Fin, 2nd point after the tip: along (u)', -25, 25, 0.1],
  f2v: ['Fin, 2nd point after the tip: up (u)', -25, 25, 0.1],
};
/** Any key: a pose key (Wavell) or a motion key (enemies). */
type AnyKey = Partial<Key> & Partial<MotionKey> & { t: number };
const WORM_D = 6.5;
/** What each of the orca's handles is. */
function orcaLabel(i: number, nOut: number) {
  const up = (ANIM.shapes.orcaTeethUp ?? []).length / 2, t = i - nOut - 1;
  if (t >= 0) return t < up ? `upper teeth ${t}` : `lower teeth ${t - up}`;
  const names: Record<number, string> = { [nOut - 4]: 'upper jaw tip', [nOut - 3]: 'corner of the mouth', [nOut - 2]: 'lower jaw tip', [nOut - 1]: 'chin', [nOut]: 'eye', 0: 'tail root' };
  const s = ANIM.shapes.orca;
  let fin = 0;
  for (let k = 1; k < nOut; k++) if (s[k * 2 + 1] > s[fin * 2 + 1]) fin = k;
  names[fin] = 'fin tip (he holds on here)';
  return names[i] ?? `point ${i}`;
}
const EASES: Ease[] = ['smooth', 'linear', 'in', 'out', 'spline', 'hold'];
const PICK = 14;
const ONION_PREV = '#4fc3ff';
const ONION_NEXT = '#ff7ad9';

export interface Editor {
  readonly active: boolean;
  setActive(on: boolean): void;
  frame(dt: number, speed: number): void;
  key(e: KeyboardEvent): void;
}

export function createEditor(neon: Neon, root: HTMLElement): Editor {
  const line = new SpringLine();
  line.cover(-200, 200);
  const fig = new Wavell();
  fig.state = 'ground';
  const orca = new Orca(-50);
  orca.show(1);
  const wrm = new Worm(-13);
  // Wavell as the victim in the bite motions.
  const victim = new Wavell();
  victim.state = 'ground';

  let active = false;
  let target: Target = 'walk';
  let t = 0;
  let playing = false;
  let onion = true;
  let zoom = 4;
  let sel = -1;               // selected key index
  let drag: number | null = null; // joint index (or outline point) being dragged
  let hover: number | null = null;
  let dirty = false;
  const undo: string[] = [];
  const redo: string[] = [];
  const work = new Float32Array(SIZE);
  const idle = namedPose('idle');

  // ---------------------------------------------------------------- helpers

  const isClip = () => target === 'appear' || target === 'sink' || target === 'inflate' || target === 'deflate' || target === 'walk' || target === 'walkStrut' || target === 'wipe' || target === 'pull' || target === 'rage';
  const isMotion = () => target.includes('.');
  /** An outline edited point by point, no timeline. */
  const isOrca = () => target === 'orca';
  /** The orca's arrays, edited together: the outline, the eye, the upper and the lower teeth. */
  const orcaArrays = () => {
    const S = ANIM.shapes;
    return [S.orca, S.orcaMarks, S.orcaTeethUp ??= [], S.orcaTeethLow ??= []];
  };
  const orcaPts = () => orcaArrays().flat();
  /** Has a timeline: a clip or a motion. */
  const timed = () => isClip() || isMotion();
  const clip = () => ANIM.clips[target];
  const owner = () => (isMotion() ? ANIM.motions[target] : clip());
  const keys = (): AnyKey[] => (isClip() ? clip().keys : isMotion() ? ANIM.motions[target].keys : []) as AnyKey[];
  const len = () => (isClip() ? clipLength(clip()) : isMotion() ? motionLength(target) : 0);
  const motionAt = (tt = t) => motion(target, tt);
  /** The key at the playhead, if there is one. */
  const keyAt = () => keys().findIndex((k) => Math.abs(k.t - t) < 1e-4);

  function snapshot() {
    undo.push(JSON.stringify(ANIM));
    if (undo.length > 200) undo.shift();
    redo.length = 0;
    dirty = true;
  }
  function restore(json: string) {
    const d = JSON.parse(json);
    Object.assign(ANIM.poses, d.poses);
    Object.assign(ANIM.clips, d.clips);
    Object.assign(ANIM.shapes, d.shapes);
    Object.assign(ANIM.motions, d.motions);
    dirty = true;
    sel = Math.min(sel, keys().length - 1);
    build();
  }

  /** The pose shown at the playhead. */
  function currentPose(out = work) {
    if (target === 'idle') return namedPose('idle', out);
    return pose(target, t, out, idle);
  }

  /** The pose data that dragging a joint at the playhead edits, making a key if there is none. */
  function editablePose(): PoseData | null {
    if (target === 'idle') return ANIM.poses.idle;
    let i = keyAt();
    if (i < 0) {
      // Dragging between keys adds one here, starting from what is shown.
      const k: Key = { t: round(t), pose: fromPose(currentPose(new Float32Array(SIZE))), ease: target === 'walk' || target === 'walkStrut' ? 'spline' : 'smooth' };
      const ks = keys();
      ks.push(k);
      ks.sort((a, b) => a.t - b.t);
      i = ks.indexOf(k);
    }
    sel = i;
    return keyPose(keys()[i] as Key);
  }

  /** The channel values that dragging a handle edits, making a key at the playhead if there is none. */
  function editableMotion(): Record<string, number> {
    let i = keyAt();
    if (i < 0) {
      const k: MotionKey = { t: round(t), v: { ...motionAt() }, ease: 'smooth' };
      for (const ch of Object.keys(k.v)) k.v[ch] = Math.round(k.v[ch] * 100) / 100;
      const ks = keys();
      ks.push(k);
      ks.sort((a, b) => a.t - b.t);
      i = ks.indexOf(k);
    }
    sel = i;
    return keys()[i].v!;
  }

  const round = (v: number) => Math.round(v * 1000) / 1000;
  const world = (sx: number, sy: number): [number, number] => {
    const r = neon.canvas.getBoundingClientRect();
    return [(sx - r.left - neon.ox) / neon.unit + neon.camX, (sy - r.top - neon.oy - neon.lineY) / neon.unit];
  };

  /** Handle positions in world space: joints of the pose, or the Killerwave's outline points. */
  function handles(): number[] {
    if (isMotion()) {
      const v = motionAt();
      if (target === 'orca.fin') {
        // The tip, then the points either side of it: b2, b1, f1, f2.
        const G = Orca.finGeom(), g = v.g ?? 1, back = v.back ?? 1;
        const out = [orca.x + G.mid + (G.tipU - G.mid) * back, -(G.tipV - G.sink) * g];
        FIN_POINTS.forEach((p, i) => {
          const [bu, bv] = Orca.finBase(i, g, back);
          out.push(orca.x + bu + (v[p + 'u'] ?? 0), -(bv + (v[p + 'v'] ?? 0)));
        });
        return out;
      }
      return [wrm.x + 13 - (v.lunge ?? 0) * 0.5, WORM_D * (v.g ?? 1), wrm.x - (v.lunge ?? 0), 0];
    }
    if (isOrca()) {
      const s = orcaPts(), out: number[] = [];
      for (let i = 0; i < s.length; i += 2) out.push(orca.x + s[i], -s[i + 1]);
      return out;
    }
    const p = currentPose(), out: number[] = [];
    for (const j of JOINTS) out.push(p[I[j]], -p[I[j] + 1]);
    return out;
  }
  const lockedJoint = (j: Joint) => isClip() && !!clip().ik && (j === 'kneeB' || j === 'kneeF');

  function pick(sx: number, sy: number): number | null {
    const h = handles(), r = neon.canvas.getBoundingClientRect();
    let best: number | null = null, bd = PICK;
    for (let i = 0; i < h.length / 2; i++) {
      if (!isOrca() && !isMotion() && lockedJoint(JOINTS[i])) continue;
      const [x, y] = neon.toScreen(h[i * 2], h[i * 2 + 1]);
      const d = Math.hypot(x + neon.ox + r.left - sx, y + neon.oy + r.top - sy);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ---------------------------------------------------------------- pointer

  const cv = neon.canvas;
  cv.addEventListener('pointerdown', (e) => {
    if (!active) return;
    const i = pick(e.clientX, e.clientY);
    if (i === null) return;
    if (isClip()) {
      const ki = keyAt();
      if (ki >= 0 && keys()[ki].pose === '@from') { status('This key is "the pose before the move": pick a pose for it first.'); return; }
    }
    snapshot();
    playing = false;
    drag = i;
    cv.setPointerCapture(e.pointerId);
    move(e);
    build();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!active) return;
    if (drag === null) { hover = pick(e.clientX, e.clientY); return; }
    move(e);
  });
  const up = () => { if (drag !== null) { drag = null; build(); } };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  function move(e: PointerEvent) {
    if (drag === null) return;
    const [wx, wy] = world(e.clientX, e.clientY);
    const snap = (v: number) => Math.round(v * 10) / 10;
    if (isMotion()) {
      const d = editableMotion();
      if (target === 'orca.fin') {
        // Up and down: how tall it has grown. Left and right: how far its tip leans back.
        const G = Orca.finGeom(), r = (v: number) => Math.round(v * 100) / 100;
        if (drag > 0) {
          // A point either side of the tip: where it goes is an offset from where the fin puts it.
          const p = FIN_POINTS[drag - 1], [bu, bv] = Orca.finBase(drag - 1, d.g ?? 1, d.back ?? 1);
          d[p + 'u'] = snap(wx - orca.x - bu);
          d[p + 'v'] = snap(-wy - bv);
          return;
        }
        d.g = r(Math.max(0, Math.min(1.5, -wy / Math.max(1, G.tipV - G.sink))));
        if (Math.abs(G.tipU - G.mid) > 0.5) d.back = r(Math.max(-0.5, Math.min(1.5, (wx - orca.x - G.mid) / (G.tipU - G.mid))));
        return;
      }
      if (drag === 0) d.g = Math.round(Math.max(0, Math.min(3, wy / WORM_D)) * 100) / 100;
      else if ('lunge' in d) d.lunge = snap(wrm.x - wx);
      return;
    }
    if (isOrca()) {
      let s: number[] = [], j = drag * 2;
      for (const a of orcaArrays()) { if (j < a.length) { s = a; break; } j -= a.length; }
      s[j] = snap(wx - orca.x);
      s[j + 1] = snap(Math.max(0, -wy));
      return;
    }
    const d = editablePose();
    if (!d) return;
    d[JOINTS[drag]] = [snap(wx), snap(-wy)];
  }

  // ---------------------------------------------------------------- drawing

  function strokeOf(p: Float32Array) {
    fig.showPose(p);
    const s = fig.stroke(line) ?? [];
    // A pull's bulge, as the game draws it.
    return target === 'pull' ? [...s, ...fig.pullTail(line, s[s.length - 2], s[s.length - 1])] : s;
  }

  function draw(dt: number) {
    const n = neon, c = n.ctx;
    n.camX = -n.viewW * 0.5;
    n.shake = 0;
    n.begin(dt);
    n.world();
    // Grid: a unit every line, 5 units brighter.
    c.save();
    c.lineWidth = 1 / n.unit;
    for (let x = Math.floor(n.camX); x < n.camX + n.viewW; x++) {
      c.strokeStyle = x % 5 === 0 ? 'rgba(160,150,255,0.14)' : 'rgba(160,150,255,0.05)';
      c.beginPath(); c.moveTo(x, n.viewTop); c.lineTo(x, n.viewBottom); c.stroke();
    }
    for (let y = Math.floor(n.viewTop); y < n.viewBottom; y++) {
      c.strokeStyle = y % 5 === 0 ? 'rgba(160,150,255,0.14)' : 'rgba(160,150,255,0.05)';
      c.beginPath(); c.moveTo(n.camX, y); c.lineTo(n.camX + n.viewW, y); c.stroke();
    }
    c.restore();

    const L = n.camX - 5, R = n.camX + n.viewW + 5;
    if (target === 'orca.fin') {
      if (onion) {
        const ks = keys();
        const prev = [...ks].reverse().find((k) => k.t < t - 1e-4), next = ks.find((k) => k.t > t + 1e-4);
        for (const [k, col] of [[prev, ONION_PREV], [next, ONION_NEXT]] as const) {
          if (!k?.v) continue;
          orca.showFin(k.v);
          n.glow(smoothPath([L, 0, ...orca.outline(line), R, 0]), col, 0.6, 0.35);
        }
      }
      orca.showFin(motionAt());
      n.glow(smoothPath([L, 0, ...orca.outline(line), R, 0]), COLORS.line, 0.9);
    } else if (isMotion()) {
      const cr = wrm;
      wrm.state = target === 'worm.bite' ? 'bite' : 'sink';
      if (onion) {
        const ks = keys();
        const prev = [...ks].reverse().find((k) => k.t < t - 1e-4), next = ks.find((k) => k.t > t + 1e-4);
        for (const [k, col] of [[prev, ONION_PREV], [next, ONION_NEXT]] as const) {
          if (!k?.v) continue;
          cr.show(k.v);
          n.glow(smoothPath(cr.outline(line)), col, 0.6, 0.35);
        }
      }
      cr.show(motionAt());
      const o = cr.outline(line);
      // In a bite, Wavell stands where the jaws close: under the line.
      let w: number[] = [];
      if (target === 'worm.bite') {
        victim.x = wrm.x - 10;
        victim.side = -1;
        victim.flip = 1;
        victim.showPose(idle);
        w = victim.stroke(line) ?? [];
      }
      n.glow(smoothPath([L, 0, ...w, ...o, R, 0]), COLORS.line, 0.9);
      cr.drawFeatures(n, line);
      if (w.length) victim.drawFeatures(n, line);
    } else if (isOrca()) {
      orca.show(1);
      const o = orca.outline(line);
      n.glow(smoothPath([L, 0, ...o, R, 0]), COLORS.line, 0.9);
      orca.drawFeatures(n, line);
    } else {
      // Onion skin: the keys either side of the playhead.
      if (onion && isClip()) {
        const ks = keys(), lt = len();
        const prev = [...ks].reverse().find((k) => k.t < t - 1e-4), next = ks.find((k) => k.t > t + 1e-4);
        for (const [k, col] of [[prev, ONION_PREV], [next, ONION_NEXT]] as const) {
          if (!k) continue;
          const p = pose(target, Math.min(k.t, lt), new Float32Array(SIZE), idle);
          n.glow(smoothPath(strokeOf(p)), col, 0.6, 0.35);
        }
      }
      const p = currentPose();
      n.glow(smoothPath([L, 0, ...strokeOf(p), R, 0]), COLORS.line, 0.9);
      fig.drawFeatures(n, line);
    }

    // Handles, in screen space.
    n.screen();
    const h = handles(), onKey = target === 'idle' || isOrca() || keyAt() >= 0;
    const motionLabels = target === 'orca.fin' ? ['fin tip: height · lean back', '2nd point before the tip', 'point before the tip', 'point after the tip', '2nd point after the tip'] : ['depth', 'lunge'];
    for (let i = 0; i < h.length / 2; i++) {
      const [x, y] = n.toScreen(h[i * 2], h[i * 2 + 1]);
      const j = isOrca() || isMotion() ? null : JOINTS[i];
      const locked = j ? lockedJoint(j) : false;
      c.beginPath();
      c.arc(x, y, i === drag || i === hover ? 8 : 5.5, 0, Math.PI * 2);
      c.lineWidth = 2;
      c.strokeStyle = locked ? 'rgba(255,255,255,0.35)' : onKey ? '#ffffff' : 'rgba(255,255,255,0.6)';
      c.fillStyle = i === drag ? '#ffd23a' : i === hover ? 'rgba(255,210,58,0.5)' : 'rgba(10,8,30,0.6)';
      c.fill();
      c.stroke();
      if (i === hover || i === drag) {
        c.fillStyle = '#ffffff';
        c.font = '12px system-ui, sans-serif';
        if (isMotion()) {
          const v = motionAt();
          c.fillText(`${motionLabels[i]}  ${Object.entries(v).map(([k, x]) => `${k} ${x.toFixed(2)}`).join('  ')}`, x + 11, y - 10);
        } else {
          const nOut = ANIM.shapes.orca.length / 2;
          const label = j ? `${j}${locked ? ' (IK)' : ''}` : isOrca() ? orcaLabel(i, nOut) : `point ${i}`;
          const [px, py] = isOrca()
            ? [orcaPts()[i * 2], orcaPts()[i * 2 + 1]]
            : [currentPose()[I[j!]], currentPose()[I[j!] + 1]];
          c.fillText(`${label}  ${px.toFixed(1)}, ${py.toFixed(1)}`, x + 9, y - 8);
        }
      }
    }
  }

  // ---------------------------------------------------------------- panel

  root.innerHTML = `
    <h2>Edit</h2>
    <select id="ed-target"></select>
    <div class="row">
      <button id="ed-play">▶</button>
      <input id="ed-time" type="range" min="0" step="${STEP}" style="flex:1">
      <span id="ed-clock" class="mono"></span>
    </div>
    <div class="row">
      <label class="group"><input id="ed-onion" type="checkbox" checked> Onion skin</label>
      <label class="group">Zoom <input id="ed-zoom" type="range" min="1.5" max="9" step="0.25"></label>
    </div>
    <div class="row">
      <button id="ed-save">Save to anim.json</button>
      <button id="ed-undo" title="Ctrl+Z">Undo</button>
      <button id="ed-redo" title="Ctrl+Y">Redo</button>
    </div>
    <p id="ed-status" class="help"></p>
    <div id="ed-clip">
      <h3>Keys</h3>
      <div id="ed-keys" class="keys"></div>
      <div class="row"><button id="ed-add">Add key at playhead</button><button id="ed-del">Delete key</button></div>
      <div id="ed-key"></div>
      <h3>Timing</h3>
      <div id="ed-marks"></div>
    </div>
    <div id="ed-tiltrow"></div>
    <p class="help">Drag the joints (Wavell) or the handles (enemies: depth and lunge, the fin's
      height and lean). Dragging between keys adds a key there. A key can use a shared pose
      (editing it changes every key that uses it) or its own. <kbd>[</kbd> <kbd>]</kbd> previous / next key,
      <kbd>Space</kbd> play, <kbd>,</kbd> <kbd>.</kbd> one frame.</p>`;
  const q = <T extends HTMLElement>(id: string) => root.querySelector('#' + id) as T;
  const selT = q<HTMLSelectElement>('ed-target');
  for (const [v, label] of TARGETS) selT.add(new Option(label, v));
  selT.onchange = () => { target = selT.value as Target; t = 0; sel = timed() ? 0 : -1; playing = false; build(); };
  const time = q<HTMLInputElement>('ed-time');
  time.oninput = () => { playing = false; t = Number(time.value); sel = keyAt(); build(); };
  q<HTMLButtonElement>('ed-play').onclick = () => { playing = !playing; };
  q<HTMLInputElement>('ed-onion').onchange = (e) => { onion = (e.target as HTMLInputElement).checked; };
  const zoomIn = q<HTMLInputElement>('ed-zoom');
  zoomIn.value = String(zoom);
  zoomIn.oninput = () => { zoom = Number(zoomIn.value); neon.zoom = zoom; neon.resize(); };
  q<HTMLButtonElement>('ed-undo').onclick = () => doUndo();
  q<HTMLButtonElement>('ed-redo').onclick = () => doRedo();
  q<HTMLButtonElement>('ed-save').onclick = () => save();
  q<HTMLButtonElement>('ed-add').onclick = () => {
    if (!timed() || keyAt() >= 0) return;
    snapshot();
    if (isMotion()) editableMotion(); else editablePose();
    build();
  };
  q<HTMLButtonElement>('ed-del').onclick = () => {
    if (!timed() || sel < 0 || keys().length <= 2) { status('An animation needs at least two keys.'); return; }
    snapshot();
    keys().splice(sel, 1);
    sel = Math.min(sel, keys().length - 1);
    build();
  };

  function doUndo() { const s = undo.pop(); if (!s) return; redo.push(JSON.stringify(ANIM)); restore(s); }
  function doRedo() { const s = redo.pop(); if (!s) return; undo.push(JSON.stringify(ANIM)); restore(s); }

  async function save() {
    try {
      const r = await fetch('./__anim', { method: 'POST', body: JSON.stringify(ANIM) });
      if (!r.ok) throw new Error(await r.text());
      dirty = false;
      status('Saved to src/data/anim.json.');
    } catch {
      // Not on the dev server: hand over the numbers instead.
      await navigator.clipboard?.writeText(JSON.stringify(ANIM, null, 2) + '\n').catch(() => {});
      status('No dev server to save to: anim.json copied to the clipboard.');
    }
  }

  let statusMsg = '';
  function status(s: string) { statusMsg = s; q('ed-status').textContent = s; }

  /** Number input row helper. */
  function numRow(parent: HTMLElement, label: string, value: number, step: number, set: (v: number) => void, min?: number, max?: number) {
    const row = document.createElement('label');
    row.className = 'knob';
    const name = document.createElement('span');
    name.textContent = label;
    const range = document.createElement('input');
    range.type = 'range';
    range.step = String(step);
    range.min = String(min ?? 0);
    range.max = String(max ?? Math.max(1, value * 2));
    range.value = String(value);
    const num = document.createElement('input');
    num.type = 'number';
    num.step = String(step);
    num.value = String(value);
    let snapped = false;
    const apply = (v: number) => {
      if (!Number.isFinite(v)) return;
      if (!snapped) { snapshot(); snapped = true; }
      range.value = num.value = String(v);
      set(v);
    };
    range.oninput = () => apply(Number(range.value));
    range.onchange = () => { snapped = false; build(); };
    num.onchange = () => { apply(Number(num.value)); snapped = false; build(); };
    row.append(name, range, num);
    parent.append(row);
  }

  /** Rebuild the panel parts that depend on the selection. */
  function build() {
    q('ed-clip').hidden = !timed();
    time.hidden = !timed();
    q('ed-play').hidden = !timed();
    time.max = String(len());
    status(statusMsg);
    const tilt = q('ed-tiltrow');
    tilt.innerHTML = '';
    if (target === 'idle') numRow(tilt, 'Head tilt (radians)', ANIM.poses.idle.tilt, 0.01, (v) => { ANIM.poses.idle.tilt = v; }, -1.5, 1.5);
    if (!timed()) return;

    // Keys.
    const list = q('ed-keys');
    list.innerHTML = '';
    keys().forEach((k, i) => {
      const b = document.createElement('button');
      b.className = 'scene' + (i === sel ? ' on' : '');
      const what = k.v ? Object.entries(k.v).map(([c, x]) => `${c} ${x.toFixed(2)}`).join(' ')
        : k.pose === '@from' ? 'pose before the move' : typeof k.pose === 'string' ? `pose "${k.pose}"` : 'own pose';
      b.textContent = `${k.t.toFixed(3)} s · ${what} · ${k.ease ?? 'smooth'}`;
      b.onclick = () => { sel = i; t = k.t; playing = false; build(); };
      list.append(b);
    });

    // The selected key.
    const box = q('ed-key');
    box.innerHTML = '';
    const k = keys()[sel];
    if (k) {
      const h = document.createElement('h3');
      h.textContent = `Key ${sel + 1}`;
      box.append(h);
      numRow(box, 'Time (s)', k.t, 0.005, (v) => {
        k.t = round(Math.max(0, v));
        keys().sort((a, b) => a.t - b.t);
        sel = keys().indexOf(k);
        t = k.t;
      }, 0, Math.max(1, len() * 1.5));
      // Ease.
      const er = document.createElement('label');
      er.className = 'knob';
      er.innerHTML = '<span>Ease into this key</span>';
      const es = document.createElement('select');
      for (const e of EASES) es.add(new Option(e, e));
      es.value = k.ease ?? 'smooth';
      es.onchange = () => { snapshot(); k.ease = es.value as Ease; build(); };
      er.append(es);
      box.append(er);
      if (k.v) {
        // Channels, each with its own ease if it should differ from the key's.
        const v = k.v;
        for (const ch of Object.keys(v)) {
          const [label, lo, hi, step] = CHANNELS[ch] ?? [ch, -10, 10, 0.01];
          numRow(box, label, v[ch], step, (x) => { v[ch] = x; }, lo, hi);
          const cr = document.createElement('label');
          cr.className = 'knob';
          cr.innerHTML = `<span>${ch}: ease</span>`;
          const cs = document.createElement('select');
          cs.add(new Option('same as the key', ''));
          for (const e of EASES) if (e !== 'spline') cs.add(new Option(e, e));
          cs.value = k.eases?.[ch] ?? '';
          cs.onchange = () => {
            snapshot();
            if (cs.value) (k.eases ??= {})[ch] = cs.value as Ease;
            else if (k.eases) { delete k.eases[ch]; if (!Object.keys(k.eases).length) delete k.eases; }
            build();
          };
          cr.append(cs);
          box.append(cr);
        }
      } else {
      // Pose source.
      const pr = document.createElement('label');
      pr.className = 'knob';
      pr.innerHTML = '<span>Pose</span>';
      const ps = document.createElement('select');
      ps.add(new Option('own pose (only this key)', '#own'));
      for (const name of Object.keys(ANIM.poses)) ps.add(new Option(`shared: ${name}`, name));
      ps.add(new Option('the pose before the move', '@from'));
      ps.add(new Option('new shared pose…', '#new'));
      ps.value = typeof k.pose === 'string' ? k.pose : '#own';
      ps.onchange = () => {
        if (!('pose' in k)) return;
        snapshot();
        const shown = fromPose(pose(target, k.t, new Float32Array(SIZE), idle));
        if (ps.value === '#own') k.pose = shown;
        else if (ps.value === '#new') {
          const name = prompt('Name for the new shared pose:')?.trim();
          if (name && !ANIM.poses[name]) { ANIM.poses[name] = shown; k.pose = name; }
        } else k.pose = ps.value;
        build();
      };
      pr.append(ps);
      box.append(pr);
      const d = keyPose(k as Key);
      if (d) {
        const users = typeof k.pose === 'string' ? Object.values(ANIM.clips).flatMap((c) => c.keys).filter((o) => o.pose === k.pose).length : 1;
        if (users > 1) {
          const note = document.createElement('p');
          note.className = 'help';
          note.textContent = `Shared by ${users} keys: editing it changes them all.`;
          box.append(note);
        }
        numRow(box, 'Head tilt (radians)', d.tilt, 0.01, (v) => { d.tilt = v; }, -1.5, 1.5);
      }
      }
    }

    // Marks and length.
    const marks = q('ed-marks');
    marks.innerHTML = '';
    const c = owner();
    if ('loop' in c && c.loop) numRow(marks, 'Cycle length (s)', c.length ?? len(), 0.005, (v) => { c.length = Math.max(0.05, round(v)); }, 0.05, 2);
    for (const [name, v] of Object.entries(c.marks ?? {})) {
      numRow(marks, `Mark: ${name} (s)`, v, 0.005, (nv) => { c.marks![name] = round(Math.max(0, nv)); }, 0, Math.max(1, len()));
    }
  }

  // ---------------------------------------------------------------- frame & keys

  function frame(dt: number, speed: number) {
    if (playing && timed()) {
      t += dt * speed;
      const l = len();
      if (t > l) t = isClip() && clip().loop ? t % l : 0;
      sel = keyAt();
    }
    time.value = String(t);
    const ki = keyAt();
    q('ed-clock').textContent = `${t.toFixed(3)} s${ki >= 0 ? ' · key ' + (ki + 1) : ''}${dirty ? ' · unsaved' : ''}`;
    q('ed-play').textContent = playing ? '❚❚' : '▶';
    draw(playing ? dt * speed : 0);
  }

  function key(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const ks = keys();
    if (e.code === 'Space') { e.preventDefault(); playing = !playing; }
    else if (e.code === 'Comma' || e.code === 'Period') {
      playing = false;
      t = Math.max(0, Math.min(len(), t + (e.code === 'Comma' ? -1 : 1) * STEP * (e.shiftKey ? 12 : 1)));
      sel = keyAt();
      build();
    } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      playing = false;
      const k = e.code === 'BracketLeft' ? [...ks].reverse().find((o) => o.t < t - 1e-4) : ks.find((o) => o.t > t + 1e-4);
      if (k) { t = k.t; sel = ks.indexOf(k); build(); }
    } else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); doRedo(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); save(); }
  }

  window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

  return {
    get active() { return active; },
    setActive(on: boolean) {
      active = on;
      if (on) { neon.zoom = zoom; neon.resize(); sel = timed() ? keyAt() : -1; build(); }
    },
    frame,
    key,
  };
}
