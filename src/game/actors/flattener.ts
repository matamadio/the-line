// THE FLATTENER, the boss of the last level. He is a stretch of the line that can take
// any shape, and each shape is one of his powers. He stands ahead of Wavell, on top of
// the line, and walks on to the right as Wavell runs after him, while the end of the
// line keeps crumbling in behind.
//
// His shapes and powers are data (src/data/boss.json, edited in the lab's "Edit boss"):
// a power is a list of steps, each flowing into a shape, holding it, and firing.
//
// - Idle: a wobbly blob that never holds its shape, with eyes floating in it, staring.
// - Wave: he rears up into a curling breaker and crashes down, sending a wave rolling
//   at Wavell. A wipe facing it sends it back at him: the only way to hurt him.
// - Cat: crouched low, it shoots a line reflux at Wavell's height along the top of the
//   line; rises and shoots one higher; then rolls on its back, over to under the line,
//   and shoots along the bottom.
// - Saw: a sawblade through the line. It spins up, then rolls at Wavell and flattens
//   out before the end of the line. Float over it.
// - Toad: he squats into a toad and sinks into the line, leaving two bulging eyes.
//   Bubbles blister up along the line and float off to burst. Keep clear.
//
// Every shape is the same stroke: changing shape, his outline flows from one to the
// next. His sizes are his armour, as Wavell's are: each hit takes one and makes him
// angrier, and with each phase he has more powers.

import type { SpringLine } from '../line';
import { DIFF } from '../../data/difficulty';
import { BOSS, type EyeDef, type ShapeDef, type Step } from '../../data/boss';
import { COLORS, Neon, clamp, lerp, smooth, smoothPath } from '../../core/neon';

/** A power's name in boss.json. */
export type BossPower = string;
/** What happened on this step, for the game to answer with sound, waves and enemies. */
export type BossEvent = 'windup' | 'slam' | 'meow' | 'shoot' | 'whirr' | 'roll' | 'flatten' | 'croak' | 'bubble' | 'hit' | 'melted';
type State = 'rise' | 'idle' | 'power' | 'roll' | 'reform' | 'hurt' | 'melt' | 'done';
interface Eye { dx: number; h: number; r: number }
/** The shape he is flowing into: a shape's name, the side of the line, and how far he has reared up. */
interface Form { shape: string; side: 1 | -1; grow: [number, number] }

/** Points in his outline, whatever the shape: every shape is resampled to this many, so one can flow into another. */
const N = 180;
const RISE_TIME = 2.2;
const HURT_TIME = 1.1;
const MELT_TIME = 1.4;
const REFORM_TIME = 0.8;
/** Each size left makes him this much bigger. */
const GROW = 0.08;
const FLAT: ShapeDef = { kind: 'path', pts: [[-20, 0], [20, 0]], eyes: [], strokes: [] };
const SHUT: Eye[] = [{ dx: -6, h: 0, r: 0 }, { dx: 6, h: 0, r: 0 }];
const SOUND_EVENT: Record<string, BossEvent | null> = { none: null, rumble: 'windup', meow: 'meow', whirr: 'whirr', croak: 'croak' };

/** n points evenly spaced along a polyline (flat [x, y, ...]). */
function resample(p: number[], n = N): Float32Array {
  const out = new Float32Array(n * 2), m = p.length / 2, acc = [0];
  for (let i = 1; i < m; i++) acc.push(acc[i - 1] + Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]));
  const total = acc[m - 1] || 1;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (i / (n - 1)) * total;
    while (j < m - 2 && acc[j + 1] < d) j++;
    const f = acc[j + 1] > acc[j] ? (d - acc[j]) / (acc[j + 1] - acc[j]) : 0;
    out[i * 2] = lerp(p[j * 2], p[j * 2 + 2], f);
    out[i * 2 + 1] = lerp(p[j * 2 + 1], p[j * 2 + 3], f);
  }
  return out;
}

/** A shape by name, or the flat line if there is no such shape. */
export function shapeOf(name: string): ShapeDef { return BOSS.shapes[name] ?? FLAT; }

/** The saw's rim from angle a0 to a1 (radians), its teeth turned by spin. */
function rim(R: number, teeth: number, tooth: number, spin: number, a0: number, a1: number, n: number): number[] {
  const out: number[] = [];
  for (let j = 0; j <= n; j++) {
    const a = lerp(a0, a1, j / n);
    const u = ((((a + spin) / (Math.PI * 2)) * teeth) % 1 + 1) % 1;
    out.push(Math.cos(a) * (R + tooth * u), Math.sin(a) * (R + tooth * u));
  }
  return out;
}

/**
 * The order to play a power's steps in: as listed, or, shuffled, with each run of steps
 * sharing a group (1 and up) moved as one, to the places of the other groups.
 */
export function playOrder(steps: { group?: number }[], shuffle: boolean, rand: () => number = Math.random): number[] {
  const runs: number[][] = [];
  steps.forEach((s, i) => {
    const prev = runs[runs.length - 1], g = s.group ?? 0;
    if (prev && g > 0 && (steps[prev[0]].group ?? 0) === g) prev.push(i);
    else runs.push([i]);
  });
  if (shuffle) {
    const slots = runs.map((r, i) => ((steps[r[0]].group ?? 0) > 0 ? i : -1)).filter((i) => i >= 0);
    const moved = slots.map((i) => runs[i]);
    for (let i = moved.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [moved[i], moved[j]] = [moved[j], moved[i]]; }
    slots.forEach((s, k) => (runs[s] = moved[k]));
  }
  return runs.flat();
}

export class Flattener {
  state: State = 'rise';
  t = 0;
  private time = 0;
  /** Sizes left. At none, the next hit flattens him. */
  hp = DIFF.bossHits;
  readonly events: BossEvent[] = [];
  /** The power he is using, and the step of it he is at. */
  power: BossPower | null = null;
  /** The step he is at, as its place in the power's list in boss.json. */
  stepIndex = 0;
  /** The order he plays the power's steps in this time (shuffled powers change it each time). */
  private order: number[] = [];
  private at_ = 0;
  /** The last reflux shot: which side of the line, and how far from it in Wavell's heights. */
  shot = { side: 1 as 1 | -1, height: 0.5 };
  /** Seconds before he picks his next power. */
  private wait = 1.2;
  private last: BossPower | null = null;
  /** Powers in a row since the last one that can hurt him. */
  private dry = 0;
  private kick = 0;
  /** Drawn size, easing towards his sizes left. */
  private shown = 1 + GROW * DIFF.bossHits;
  /** Hit: he flashes white. */
  flash = 0;
  /** Sinking out quietly (back to the title): no win. */
  private quiet = false;
  /** In the editor: he holds the shape he is shown in, and picks no powers. */
  posing = false;

  private form: Form = { shape: 'blob', side: 1, grow: [1, 1] };
  private from = resample([-20, 0, 20, 0]);
  private fromEyes: Eye[] = SHUT.map((e) => ({ ...e }));
  private morphT = 0;
  private morphTime = RISE_TIME;
  /** His outline now, from his centre: [across, up, ...]. */
  private pts = new Float32Array(N * 2);
  private eyes: Eye[] = SHUT.map((e) => ({ ...e }));
  private left = -20;
  private right = 20;
  /** The saw's turn (radians), the roll's stage, and when the next bubble is due. */
  private spin = 0;
  private stage = 0;
  private nextBubble = 0;

  constructor(public x: number) { this.shape(); }

  /** 1 to 3: every hit makes him angrier. */
  get phase() { return clamp(DIFF.bossHits - this.hp + 1, 1, 3); }
  /** His left end, facing Wavell, and his right end. */
  get front() { return this.x + this.left; }
  get back() { return this.x + this.right; }
  get half() { return (this.right - this.left) / 2; }
  /** The step he is at, using a power. */
  get step(): Step | null { return this.state === 'power' && this.power ? BOSS.powers[this.power]?.steps[this.stepIndex] ?? null : null; }
  /** Seconds the step he is at lasts before it fires. */
  get stepTime() { const s = this.step; return s ? s.morph + s.hold : 0; }
  /** Out of the line and in his place: what is sent back at him can hit him. */
  get vulnerable() { return this.state === 'idle' || this.state === 'power'; }
  /** Walking into him hurts (the saw has its own rule, and the eyes in the line are harmless). */
  get solid() {
    const s = this.state;
    return s === 'idle' || s === 'hurt' || (s === 'power' && !!this.step?.touch && !this.sawing);
  }
  /** The saw is out and spinning: it cuts through the line, both sides. */
  get sawing() {
    if (this.state === 'roll') return this.stage === 0;
    return this.state === 'power' && shapeOf(this.form.shape).kind === 'saw' && this.morphT >= this.morphTime * 0.6;
  }
  /** The saw is rolling at Wavell: he isn't in his place. */
  get away() { return this.state === 'roll' || this.state === 'reform'; }
  get sawR() { const s = shapeOf('saw'); return (s.kind === 'saw' ? s.radius : 16) * this.shown; }
  get done() { return this.state === 'done'; }
  /** How much bigger than his shapes' own units he is drawn (his sizes left). */
  get scale() { return this.shown; }
  /** The shape he is in, and the side of the line. */
  get shapeName() { return this.form.shape; }
  /** How far through charging up the step he is at is, 0..1. */
  get charge() { const T = this.stepTime; return T > 0 ? clamp(this.t / T, 0, 1) : 0; }
  /** Charging up to fire: he glows with danger. */
  private get charging() { const s = this.step; return !!s && s.glow && s.fire !== 'none'; }

  /** Hit by his own wave. Returns true if that flattened him. */
  hit(): boolean {
    if (!this.vulnerable) return false;
    this.hp--;
    this.flash = 1;
    this.kick = 220;
    this.go(this.hp <= 0 ? 'melt' : 'hurt');
    this.morph(this.hp <= 0 ? 'flat' : 'blob', this.hp <= 0 ? MELT_TIME : 0.25);
    this.events.push('hit');
    return this.hp <= 0;
  }

  /** Back to the title: he sinks into the line, and it doesn't count. */
  sink() {
    if (this.state === 'done' || this.state === 'melt') return;
    this.quiet = true;
    this.go('melt');
    this.morph('flat', MELT_TIME);
  }

  /** The rolling saw has come far enough: it flattens out into the line. */
  stopSaw() { if (this.state === 'roll' && this.stage === 0) { this.stage = 1; this.t = 0; this.morph('flat', 0.3); } }

  /** Back in his place after the saw, at x: he grows out of the line again. */
  reform(x: number) {
    this.x = x;
    this.go('reform');
    this.from = resample([-20, 0, 20, 0]);
    this.fromEyes = SHUT.map((e) => ({ ...e }));
    this.form = { shape: 'blob', side: 1, grow: [1, 1] };
    this.morphT = 0;
    this.morphTime = REFORM_TIME;
  }

  /** Where a shot comes out (the cat's rear), on the screen. */
  butt(line: SpringLine): [number, number] {
    const s = shapeOf(this.form.shape), k = this.shown;
    const e = s.kind === 'path' && s.emit ? s.emit : [this.left / k, 2];
    return this.at(line, e[0] * k, e[1] * k * this.form.side * this.rear());
  }

  /** In the editor: show this shape at once, still. */
  pose(shape: string, side: 1 | -1 = 1, grow: [number, number] = [1, 1]) {
    this.posing = true;
    this.state = 'idle';
    this.power = null;
    this.form = { shape, side, grow };
    this.morphT = this.morphTime = 1;
    this.from = this.target(this.form);
    this.fromEyes = this.eyesOf(this.form);
    this.shape();
  }

  /** In the editor: play this power once, from the blob, then back to the blob. */
  play(p: BossPower) {
    this.posing = false;
    this.state = 'idle';
    this.events.length = 0;
    this.begin(p);
  }

  /** active: Wavell is there to fight, so he picks powers. Powers go off on the beat. */
  update(dt: number, onBeat: boolean, active: boolean, rand = Math.random) {
    this.time += dt;
    this.t += dt;
    this.morphT += dt;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.kick) { this.x += this.kick * dt; this.kick *= Math.exp(-4 * dt); if (this.kick < 3) this.kick = 0; }
    this.shown += (1 + GROW * Math.max(0, this.hp) - this.shown) * Math.min(1, dt * 4);
    const saw = shapeOf(this.form.shape).kind === 'saw';
    this.spin -= dt * (this.state === 'roll' ? 16 : saw ? 4 + 12 * this.charge : 2);
    const t = this.t;
    switch (this.state) {
      case 'rise':
        if (t >= RISE_TIME) this.go('idle');
        break;
      case 'idle':
        if (this.posing) break;
        if (active) this.wait -= dt;
        if (this.wait <= 0 && onBeat && active) this.begin(this.choose(rand), rand);
        break;
      case 'power': {
        const s = this.step;
        if (!s) { this.rest(rand); break; }
        if (s.bubbles > 0 && t >= s.morph && t >= this.nextBubble) { this.events.push('bubble'); this.nextBubble = Math.max(t, this.nextBubble) + s.bubbles; }
        if (t >= s.morph + s.hold && (!s.beat || onBeat)) this.fire(s, rand);
        break;
      }
      case 'roll':
        if (this.stage === 0) this.x -= DIFF.bossSawSpeed * dt;
        else if (this.stage === 1 && t >= 0.3) { this.stage = 2; this.events.push('flatten'); }
        break;
      case 'reform':
        if (t >= REFORM_TIME) this.rest(rand);
        break;
      case 'hurt':
        if (t >= HURT_TIME) { this.go('idle'); this.wait = 0.8; }
        break;
      case 'melt':
        if (t >= MELT_TIME) { this.go('done'); if (!this.quiet) this.events.push('melted'); }
        break;
    }
    this.shape();
  }

  private go(s: State) { this.state = s; this.t = 0; this.stage = 0; }

  /** Start flowing into another shape, from wherever he is now. */
  private morph(shape: string, time: number, side: 1 | -1 = 1, grow: [number, number] = [1, 1]) {
    this.from = this.pts.slice();
    this.fromEyes = this.eyes.map((e) => ({ ...e }));
    this.form = { shape, side, grow };
    this.morphT = 0;
    this.morphTime = Math.max(0.01, time);
  }

  private begin(p: BossPower, rand: () => number = Math.random) {
    this.go('power');
    this.power = p;
    this.last = p;
    this.dry = this.hurts(p) ? 0 : this.dry + 1;
    this.order = playOrder(BOSS.powers[p]?.steps ?? [], !!BOSS.powers[p]?.shuffle, rand);
    this.startStep(0);
  }

  /** The n-th step of this time's order. */
  private startStep(n: number) {
    this.at_ = n;
    this.stepIndex = this.order[n] ?? n;
    this.t = 0;
    const s = this.step;
    if (!s) return;
    this.nextBubble = s.morph;
    this.morph(s.shape, s.morph, s.side, s.grow);
    const e = SOUND_EVENT[s.sound];
    if (e) this.events.push(e);
  }

  /** The end of a step's hold: it goes off, and on to the next step. */
  private fire(s: Step, rand: () => number) {
    if (s.fire === 'slam') this.events.push('slam');
    else if (s.fire === 'shoot') { this.shot = { side: s.side, height: s.height }; this.events.push('shoot'); }
    else if (s.fire === 'roll') { this.events.push('roll'); this.go('roll'); return; }
    if (this.at_ + 1 < this.order.length) this.startStep(this.at_ + 1);
    else if (this.posing) { this.state = 'idle'; this.power = null; }
    else this.rest(rand);
  }

  private rest(rand: () => number) {
    this.go('idle');
    this.power = null;
    if (this.form.shape !== 'blob' || this.form.side !== 1) this.morph('blob', 0.4);
    this.wait = Math.max(0.2, DIFF.bossRest - DIFF.bossRestStep * (this.phase - 1));
    if (this.phase >= 3 && rand() < DIFF.bossDouble) this.wait = 0;
  }

  /** A power that sends something he can be hit with. */
  private hurts(p: BossPower) { return !!BOSS.powers[p]?.steps.some((s) => s.fire === 'slam'); }

  /** His next power. The first is always one that can be sent back at him, and never three in a row that can't. */
  private choose(rand: () => number): BossPower {
    const ph = this.phase;
    let pool = Object.entries(BOSS.powers).filter(([, d]) => d.from <= ph && d.weight > 0 && d.steps.length);
    if (!this.last || this.dry >= 2) {
      const hurt = pool.filter(([k]) => this.hurts(k));
      if (hurt.length) pool = hurt;
    }
    if (!pool.length) return 'wave';
    let r = rand() * pool.reduce((a, [, d]) => a + d.weight, 0);
    for (const [k, d] of pool) { r -= d.weight; if (r <= 0) return k; }
    return pool[pool.length - 1][0];
  }

  /** How far he has reared up, through the step that grows him. */
  private rear() {
    const g = this.form.grow, s = this.step;
    return lerp(g[0], g[1], smooth(s && s.shape === this.form.shape ? this.charge : 1));
  }

  /** A shape's outline, root to root, at his size and on his side of the line. */
  private target(f: Form): Float32Array {
    const k = this.shown, tm = this.time, def = shapeOf(f.shape), g = this.rear() * f.side;
    let p: number[];
    if (def.kind === 'blob') {
      // A dome that never holds still.
      const R = def.radius;
      p = [];
      for (let j = 0; j <= 48; j++) {
        const a = Math.PI - (j / 48) * Math.PI;
        const r = R * (1 + 0.1 * Math.sin(3 * a + tm * 2.1) + 0.07 * Math.sin(5 * a - tm * 3.3) + 0.06 * Math.sin(2 * a + tm * 1.3));
        // Pinched in at the roots, so it bulges out of the line rather than sitting on it.
        p.push(Math.cos(a) * r * (0.85 + 0.25 * Math.sin(a)), Math.sin(a) * r * 1.1 * f.side);
      }
    } else if (def.kind === 'saw') {
      // The rim over the line, from root to root: the line under him is not drawn, and the
      // rim under the line is a stroke of its own.
      const R = def.radius;
      p = [-R - 8, 0, ...rim(R, def.teeth, def.tooth, this.spin, Math.PI, 0, 60), R + 8, 0];
    } else {
      // The charge makes it tremble, more and more (not at the roots).
      const c = this.charging && this.step?.fire === 'shoot' ? this.charge : 0, n = def.pts.length;
      p = def.pts.flatMap(([x, h], i) => [x, h * g + (i > 0 && i < n - 1 ? c * 0.5 * Math.sin(tm * 50 + i) : 0)]);
    }
    if (p.length < 4) p = [-20, 0, 20, 0];
    return resample(p.map((v) => v * k));
  }

  /** His two eyes in a shape (a shape with one has the other shut). */
  private eyesOf(f: Form): Eye[] {
    const tm = this.time, k = this.shown, def = shapeOf(f.shape), g = this.rear() * f.side;
    const list: EyeDef[] = def.eyes.slice(0, 2);
    let e: Eye[] = list.map(([dx, h, r]) => ({ dx, h: h * g, r }));
    if (def.kind === 'blob') {
      const d = def.drift;
      e = e.map((v, i) => ({ dx: v.dx + d * Math.sin(tm * (0.9 - 0.1 * i) + 2 * i), h: v.h + 0.75 * d * Math.sin(tm * (1.3 - 0.2 * i) + i), r: v.r }));
    }
    while (e.length < 2) e.push(e.length ? { ...e[0], r: 0 } : { ...SHUT[e.length] });
    return e.map((v) => ({ dx: v.dx * k, h: v.h * k, r: v.r * k }));
  }

  /** Flow towards the shape he is taking, with the line's wobble on top. */
  private shape() {
    const to = this.target(this.form), m = smooth(this.morphT / this.morphTime), a = this.from, def = shapeOf(this.form.shape);
    let lo = Infinity, hi = -Infinity;
    const wob = def.kind === 'blob' ? def.wobble : 0.6;
    for (let i = 0; i < N; i++) {
      const x = lerp(a[i * 2], to[i * 2], m);
      const env = Math.sin((Math.PI * i) / (N - 1));
      this.pts[i * 2] = x;
      this.pts[i * 2 + 1] = lerp(a[i * 2 + 1], to[i * 2 + 1], m) + wob * env * Math.sin(i * 0.11 + this.time * 5);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    this.left = lo;
    this.right = hi;
    const eyes = this.eyesOf(this.form);
    this.eyes = eyes.map((e, i) => ({ dx: lerp(this.fromEyes[i].dx, e.dx, m), h: lerp(this.fromEyes[i].h, e.h, m), r: lerp(this.fromEyes[i].r, e.r, m) }));
  }

  /** A point of him on the screen, from [across, up] from his centre. */
  private at(line: SpringLine, dx: number, h: number): [number, number] {
    const x = this.x + dx;
    return [x, line.sample(x) - h];
  }

  /** His outline, from root to root, spliced into the line's stroke. */
  outline(line: SpringLine): number[] {
    const out: number[] = [];
    for (let i = 0; i < N; i++) out.push(...this.at(line, this.pts[i * 2], this.pts[i * 2 + 1]));
    return out;
  }

  /** The strokes drawn over the shape he is in: legs, a fang, the saw's rim under the line. */
  private strokes(): number[][] {
    const def = shapeOf(this.form.shape), g = this.rear() * this.form.side;
    if (def.kind === 'saw') return [rim(def.radius, def.teeth, def.tooth, this.spin, 0, -Math.PI, 60)];
    if (def.kind === 'path') return def.strokes.map((s) => s.flatMap(([x, h]) => [x, h * g]));
    return [];
  }

  /** His eyes on Wavell, what each shape adds to the line, and white when he is hit. */
  drawFeatures(neon: Neon, line: SpringLine, wx: number) {
    if (this.state === 'done') return;
    const m = smooth(this.morphT / this.morphTime), k = this.shown, def = shapeOf(this.form.shape), side = this.form.side;
    const show = clamp((m - 0.5) * 2, 0, 1);
    if (show > 0 && this.state !== 'melt') {
      for (const s of this.strokes()) {
        const p: number[] = [];
        for (let i = 0; i < s.length; i += 2) p.push(...this.at(line, s[i] * k, s[i + 1] * k));
        neon.glow(smoothPath(p), COLORS.line, 0.9, show);
      }
      // The shot's way out, and the charge glowing in it.
      if (def.kind === 'path' && def.emit) {
        const [bx, by] = this.butt(line), x = new Path2D();
        x.moveTo(bx - 2, by - 2); x.lineTo(bx + 2, by + 2); x.moveTo(bx + 2, by - 2); x.lineTo(bx - 2, by + 2);
        neon.glow(x, COLORS.line, 0.8, show);
        if (this.charging && this.step?.fire === 'shoot') {
          const c = this.charge, ball = new Path2D();
          ball.arc(bx, by, 0.5 + c * 4 + Math.sin(this.time * 40) * 0.4 * c, 0, Math.PI * 2);
          neon.glow(ball, COLORS.danger, 1, 0.4 + c);
        }
      }
      if (def.kind === 'path' && def.nose) {
        const [nx, ny] = this.at(line, def.nose[0] * k, def.nose[1] * k * side * this.rear()), nose = new Path2D();
        nose.arc(nx, ny, 1.1 * k, 0, Math.PI * 2);
        neon.glow(nose, COLORS.eye, 0.8, 1.2 * show);
      }
    }
    // The saw's hub.
    if (def.kind === 'saw' && m > 0.3 && this.state !== 'melt') {
      const [cx, cy] = this.at(line, 0, 0), hub = new Path2D();
      hub.arc(cx, cy, this.sawR * 0.35, 0, Math.PI * 2);
      neon.glow(hub, COLORS.danger, 0.7, 0.6 + this.charge);
    }
    const look = clamp((wx - this.x) / 120, -1, 1);
    for (let i = 0; i < this.eyes.length; i++) {
      const e = this.eyes[i];
      if (e.r < 0.6) continue;
      const [ex, ey] = this.at(line, e.dx, e.h);
      const eye = new Path2D();
      eye.arc(ex, ey, e.r, 0, Math.PI * 2);
      neon.glow(eye, COLORS.line, 0.7, 1.2);
      const pupil = new Path2D();
      pupil.arc(ex + look * e.r * 0.4, ey + e.r * 0.1 * side, e.r * 0.38, 0, Math.PI * 2);
      neon.glow(pupil, COLORS.eye, 0.8, 1.4);
      // A heavy lid slanting down to the middle: he means it.
      const lid = new Path2D(), d = i === 0 ? 1 : -1;
      lid.moveTo(ex - e.r * 1.1 * d, ey - e.r * 1.25 * side);
      lid.lineTo(ex + e.r * 0.9 * d, ey - e.r * 0.55 * side);
      neon.glow(lid, COLORS.danger, 0.7, 0.9);
    }
    const pts = this.outline(line);
    if (this.charging) neon.glow(smoothPath(pts), COLORS.danger, 1, 0.2 + this.charge);
    if (this.sawing) neon.glow(smoothPath(pts), COLORS.danger, 0.9, 0.5 + 0.5 * this.charge);
    if (this.flash > 0) neon.glow(smoothPath(pts), '#ffffff', 1.2, this.flash * 1.5);
  }
}
