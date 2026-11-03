// The Snawave: a piece of the line that rears up into a creature. Its outline is
// spliced into the line's own stroke, so it grows out of the line, rides the
// line's waves, and sinks back into it. The shape follows the original sprite: an
// S-shaped belly, a snout with a red eye, a crest of foam curls and one claw.

import type { SpringLine } from '../line';
import { DIFF } from '../../data/difficulty';
import { TUNE } from '../../data/tune';
import { ANIM, motion, motionLength, motionMark } from '../../data/anim';
import { COLORS, Neon, clamp, lerp, polyPath, smooth, smoothPath } from '../../core/neon';

// The outline is ANIM.shapes.snawave (anim.json): facing left, flat [u, v, ...] with
// u from the front root and v up. Point 6 is where the mouth opens.
const CREST0 = 11, CREST1 = 18;
const MOUTH_AFTER = 6;
export const SNAWAVE_W = 30;
const HEIGHT = 33;
/** Units per second (1 px every 10 ms in the original). */
/** When the jaws close on Wavell: the bite motion's "hit" mark. */
export const biteHit = () => motionMark('snawave.bite', 'hit');

/**
 * Flattened, a creature melts back into what it is made of: its outline turns into a
 * plain hump of line within a moment, and the hump spreads out and dies down as it
 * rolls on the way the wave that hit it was going (dir 0: it just sinks in place).
 */
/** Each size makes it this much bigger. */
const GROW = 0.3;

export type SnaState = 'rise' | 'move' | 'bite' | 'die' | 'sink' | 'done';

export class Snawave {
  state: SnaState = 'rise';
  t = 0;
  private time = Math.random() * 10;
  private g = 0;
  private lean = 0;
  private mouth = 0;
  private jitter = 0;
  private flash = 0;
  bitDone = false;
  /** Pressed down by an opposite wave closing in (1: full height). */
  squash = 1;
  private dir = 0;
  private meltAmp = 0;
  /**
   * Fed by the wrong wave, it grows one size; every size takes one more right wave to
   * flatten (each shrinks it back one). `peak` is the biggest it got, for the score.
   */
  size = 0;
  peak = 0;
  /** Drawn scale, easing towards the size. */
  sc = 1;
  private kick = 0;

  /** speed: how fast it comes (u/s), from the difficulty at its level. */
  constructor(public x: number, public speed = DIFF.snaSpeed) {}

  get back() { return this.x + SNAWAVE_W * this.sc; }
  get centre() { return this.x + SNAWAVE_W * this.sc / 2; }

  grow() { if (this.size < DIFF.maxSize) this.size++; this.peak = Math.max(this.peak, this.size); this.flash = 1; }
  shrink() { this.size = Math.max(0, this.size - 1); this.flash = 0.7; }
  /** Thrown back along the line (by the wrong attack), easing to a stop. */
  knock(v: number) { this.kick = v; }
  get dead() { return this.state === 'die' || this.state === 'sink' || this.state === 'done'; }
  get harmful() { return this.state === 'rise' || this.state === 'move' || this.state === 'bite'; }

  bite() { if (!this.dead && this.state !== 'bite') { this.state = 'bite'; this.t = 0; } }
  /** Flattened by a wave going dir (0: cancelled in place). */
  kill(dir = 0) {
    if (this.dead) return;
    this.state = 'die'; this.t = 0; this.flash = dir ? 1 : 0.4; this.dir = dir;
    this.meltAmp = HEIGHT * TUNE.meltHeight * this.g * this.squash * this.sc;
  }
  sink() { if (!this.dead) { this.state = 'sink'; this.t = 0; } }

  update(dt: number) {
    this.time += dt;
    this.t += dt;
    if (this.kick) { this.x += this.kick * dt; this.kick *= Math.exp(-5 * dt); if (Math.abs(this.kick) < 5) this.kick = 0; }
    const t = this.t;
    switch (this.state) {
      case 'rise':
        // Rise, bite and sink are keyed motions in anim.json.
        this.x -= this.speed * dt;
        this.show(motion('snawave.rise', t));
        if (t > motionLength('snawave.rise')) { this.state = 'move'; this.t = 0; }
        break;
      case 'move':
        this.x -= this.speed * dt;
        this.g = 1;
        this.lean = Math.sin(this.time * 5) * 1.5;
        this.mouth = Math.max(0, Math.sin(this.time * 3)) * 0.25;
        break;
      case 'bite':
        this.show(motion('snawave.bite', t));
        if (t > motionLength('snawave.bite')) this.state = 'done';
        break;
      case 'die':
        this.x += this.dir * TUNE.meltDrift * dt;
        if (t > TUNE.meltTime) this.state = 'done';
        break;
      case 'sink':
        this.show(motion('snawave.sink', t));
        if (t > motionLength('snawave.sink')) this.state = 'done';
        break;
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    this.sc += (1 + GROW * this.size - this.sc) * Math.min(1, dt * 10);
  }

  /** Take a motion's channel values (the animation lab's editor uses this too). */
  show(v: Record<string, number>) {
    if (v.g !== undefined) this.g = v.g;
    if (v.lean !== undefined) this.lean = v.lean;
    if (v.mouth !== undefined) this.mouth = v.mouth;
  }

  /** Local (u, v) to world, following the line underneath. */
  private tf(line: SpringLine) {
    const g = this.g, lean = this.lean, jit = this.jitter, x0 = this.x, sc = this.sc;
    return (u: number, v: number): [number, number] => {
      u *= sc; v *= sc;
      const k = v / (HEIGHT * sc);
      const wob = this.state === 'move' || this.state === 'rise' ? Math.sin(this.time * 7 + v * 0.25) * 1.1 * k : 0;
      const uu = u + lean * k * k + wob + (jit ? (Math.random() - 0.5) * jit * 2 : 0);
      return [x0 + uu, line.sample(x0 + clamp(uu, 0, SNAWAVE_W * sc)) - v * g * this.squash];
    };
  }

  /** The outline from the front root to the back root, left to right, in world space. */
  outline(line: SpringLine): number[] {
    const P = this.tf(line);
    const out: number[] = [];
    const shape = ANIM.shapes.snawave;
    for (let i = 0; i < shape.length / 2; i++) {
      let u = shape[i * 2], v = shape[i * 2 + 1];
      if (i >= CREST0 && i <= CREST1) v += Math.sin(this.time * 12 + i * 1.7) * 0.7;
      out.push(...P(u, v));
      if (i === MOUTH_AFTER) out.push(...P(lerp(1.3, 9, this.mouth), lerp(21.5, 21.8, this.mouth)));
    }
    if (this.state !== 'die') return out;
    const k = clamp(this.t / TUNE.meltTime, 0, 1), m = smooth(clamp(this.t / TUNE.meltMorph, 0, 1));
    const hump = line.hump(this.centre, SNAWAVE_W * this.sc * (1 + TUNE.meltSpread * smooth(k)), -this.meltAmp * (1 - k) ** 2, out.length / 2);
    return out.map((c, i) => lerp(c, hump[i], m));
  }

  /** Is any point of the outline within r of (cx, cy)? */
  touches(line: SpringLine, cx: number, cy: number, r: number) {
    if (this.g * this.squash < 0.2 || this.dead) return false;
    const o = this.outline(line);
    for (let i = 0; i < o.length; i += 2) if (Math.hypot(o[i] - cx, o[i + 1] - cy) < r + 1) return true;
    return false;
  }

  get intensity() { return 1 + this.flash * 1.5; }

  /** Eye, brow, teeth and claw: everything that isn't part of the line stroke. */
  drawFeatures(neon: Neon, line: SpringLine) {
    if (this.g * this.squash < 0.05 || (this.state === 'die' && this.t > 0.08)) return;
    const P = this.tf(line);
    const feat = new Path2D();
    const a = Math.sin(this.time * 4) * 1.2;
    smoothPath([...P(14, 23), ...P(11 + a * 0.3, 18.5), ...P(12.5 + a, 14.5), ...P(10.2 + a, 12.6)], feat);
    polyPath([...P(12.5 + a, 14.5), ...P(14.8 + a, 13.4)], false, feat);
    polyPath([...P(12.5 + a, 14.5), ...P(13.4 + a, 11.6)], false, feat);
    polyPath([...P(4.2, 29.4), ...P(8.4, 27.6)], false, feat);
    if (this.mouth > 0.15) {
      const m = this.mouth, mx = lerp(1.3, 9, m);
      const up: number[] = [], lo: number[] = [];
      for (let i = 0; i <= 4; i++) {
        const s = i / 4;
        up.push(...P(lerp(0.9, mx, s), lerp(22.6, 21.8, s) - (i % 2 ? 1.2 * m : 0)));
        lo.push(...P(lerp(2.3, mx, s), lerp(20.6, 21.8, s) + (i % 2 ? 1.1 * m : 0)));
      }
      polyPath(up, false, feat);
      polyPath(lo, false, feat);
    }
    neon.glow(feat, COLORS.enemy, 0.7, this.intensity);
    const eye = new Path2D();
    polyPath([...P(4.6, 27.4), ...P(7.8, 26)], false, eye);
    neon.glow(eye, COLORS.eye, 1.1, this.intensity);
    const glint = new Path2D();
    const [gx, gy] = P(6.4, 26.6);
    glint.arc(gx, gy, 0.35, 0, Math.PI * 2);
    neon.glow(glint, COLORS.white, 0.5);
  }
}
