// The Worm: a sag of the line that crawls along its underside. Like the Snawave, its
// body is spliced into the line's stroke; a ripple runs back along it as it crawls.
// On his side of the line, under it, it bites: he is left dizzy and it is gone. Walked
// over from on top, the two opposite waves cancel, and that costs him.

import type { SpringLine } from '../line';
import { DIFF } from '../../data/difficulty';
import { TUNE } from '../../data/tune';
import { motion, motionLength } from '../../data/anim';
import { COLORS, Neon, clamp, lerp, polyPath, smooth } from '../../core/neon';

export const WORM_W = 26;
const DEPTH = 6.5;
/** Units per second. */

/**
 * Flattened, a creature melts back into what it is made of: its outline turns into a
 * plain hump of line within a moment, and the hump spreads out and dies down as it
 * rolls on the way the wave that hit it was going (dir 0: it just sinks in place).
 */
/** Each size makes it this much bigger. */
const GROW = 0.35;

export type WormState = 'rise' | 'move' | 'bite' | 'die' | 'sink' | 'done';

export class Worm {
  state: WormState = 'rise';
  t = 0;
  private time = Math.random() * 10;
  private g = 0;
  private lunge = 0;
  private jitter = 0;
  private flash = 0;
  /** Pressed up by an opposite wave closing in (1: full depth). */
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

  /** x is the head, at the left end: it crawls left. */
  constructor(public x: number, public speed = DIFF.wormSpeed) {}

  get back() { return this.x + WORM_W * this.sc; }
  get centre() { return this.x + WORM_W * this.sc / 2; }

  grow() { if (this.size < DIFF.maxSize) this.size++; this.peak = Math.max(this.peak, this.size); this.flash = 1; }
  shrink() { this.size = Math.max(0, this.size - 1); this.flash = 0.7; }
  /** Thrown back along the line (by the wrong attack), easing to a stop. */
  knock(v: number) { this.kick = v; }
  get dead() { return this.state === 'die' || this.state === 'sink' || this.state === 'done'; }
  get harmful() { return this.state === 'rise' || this.state === 'move' || this.state === 'bite'; }
  get intensity() { return 1 + this.flash * 1.5; }

  bite() { if (!this.dead && this.state !== 'bite') { this.state = 'bite'; this.t = 0; } }
  /** Flattened by a wave going dir (0: cancelled in place). */
  kill(dir = 0) {
    if (this.dead) return;
    this.state = 'die'; this.t = 0; this.flash = dir ? 1 : 0.4; this.dir = dir;
    this.meltAmp = DEPTH * (1.3 / 0.6) * TUNE.meltHeight * this.g * this.squash * this.sc;
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
        this.show(motion('worm.rise', t));
        if (t > motionLength('worm.rise')) { this.state = 'move'; this.t = 0; }
        break;
      case 'move':
        this.x -= this.speed * dt;
        this.g = 1;
        break;
      case 'bite':
        // Rear back, then snap forward.
        this.show(motion('worm.bite', t));
        if (t > motionLength('worm.bite')) this.state = 'done';
        break;
      case 'die':
        this.x += this.dir * TUNE.meltDrift * dt;
        if (t > TUNE.meltTime) this.state = 'done';
        break;
      case 'sink':
        this.show(motion('worm.sink', t));
        if (t > motionLength('worm.sink')) this.state = 'done';
        break;
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    this.sc += (1 + GROW * this.size - this.sc) * Math.min(1, dt * 10);
  }

  /** Take a motion's channel values (the animation lab's editor uses this too). */
  show(v: Record<string, number>) {
    if (v.g !== undefined) this.g = v.g;
    if (v.lunge !== undefined) this.lunge = v.lunge;
  }

  /** Body-local (u from the head, v down from the line) to world, riding the line. */
  private tf(line: SpringLine) {
    const jit = this.jitter, x0 = this.x, sc = this.sc;
    return (u: number, v: number): [number, number] => {
      u *= sc; v *= sc;
      // The lunge stretches the head forward and leaves the tail in place.
      const uu = u - this.lunge * (1 - u / (WORM_W * sc)) + (jit ? (Math.random() - 0.5) * jit * 2 : 0);
      return [x0 + uu, line.sample(x0 + clamp(uu, -10, WORM_W * sc)) + v * this.squash];
    };
  }

  /** How far below the line the body hangs at u. */
  private depth(u: number) {
    const s = u / WORM_W;
    // A round head at the front, a tapering tail, and a crawling ripple in between.
    const arch = Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.15)), 0.7) * (s < 0.25 ? 1.15 : 1);
    const ripple = 1 + 0.32 * Math.sin(this.time * 13 + s * 9);
    return DEPTH * this.g * arch * ripple;
  }

  /** The body from the head (left root) to the tail (right root), in world space. */
  outline(line: SpringLine): number[] {
    const P = this.tf(line);
    const out: number[] = [];
    for (let u = 0; u <= WORM_W; u += 2) out.push(...P(u, this.depth(u)));
    if (this.state !== 'die') return out;
    const k = clamp(this.t / TUNE.meltTime, 0, 1), m = smooth(clamp(this.t / TUNE.meltMorph, 0, 1));
    const hump = line.hump(this.centre, WORM_W * this.sc * (1 + TUNE.meltSpread * smooth(k)), this.meltAmp * (1 - k) ** 2, out.length / 2);
    return out.map((c, i) => lerp(c, hump[i], m));
  }

  /** Eye, mandibles and segment marks: everything that isn't part of the line stroke. */
  drawFeatures(neon: Neon, line: SpringLine) {
    if (this.g * this.squash < 0.1 || (this.state === 'die' && this.t > 0.08)) return;
    const P = this.tf(line);
    const feat = new Path2D();
    const open = this.state === 'bite' ? 1 : 0.4 + 0.3 * Math.sin(this.time * 8);
    polyPath([...P(1.2, this.depth(1.2) * 0.5), ...P(-1.8, this.depth(1.2) * 0.5 + 1.6 * open)], false, feat);
    polyPath([...P(1.2, this.depth(1.2) * 0.5), ...P(-1.8, this.depth(1.2) * 0.5 - 1.2 * open)], false, feat);
    for (const u of [9, 13, 17, 21]) {
      const d = this.depth(u);
      polyPath([...P(u, d - 1.2), ...P(u + 0.6, d + 1)], false, feat);
    }
    neon.glow(feat, COLORS.enemy, 0.6, this.intensity);
    const eye = new Path2D();
    const [ex, ey] = P(3.4, this.depth(3.4) * 0.62);
    eye.arc(ex, ey, 0.9, 0, Math.PI * 2);
    neon.glow(eye, COLORS.eye, 0.9, this.intensity);
  }
}
