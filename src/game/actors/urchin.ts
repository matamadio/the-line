// The Sea Urchin: it stays where it is. It starts as a fuzz on the line, a fine, fast
// vibration that spreads and gets stronger, then it bursts out in spikes for a moment
// with a distorted sound, and sinks back in. Its outline is a clipped, jagged wave, so
// it looks like what it sounds like.
//
// It sticks out on both sides of the line, so there is no way round it. A pull always
// kills it and a wipe always feeds it: it grows, and each size takes one more pull. Or
// wait it out.

import type { SpringLine } from '../line';
import { DIFF } from '../../data/difficulty';
import { COLORS, Neon, clamp, lerp, smooth, smoothPath } from '../../core/neon';

const ROOT = 10;
const DOME = 8;
const SPIKE = 16;
const SPIKES = 9;
const OPEN = 0.07;
const CLOSE = 0.16;
/** The fuzz: distance between its points (u), and its height at the start and the end (u). */
const FUZZ_STEP = 1.4;
const FUZZ_START = 0.7;
const FUZZ_END = 4.4;
/** Half its width on the line while its spikes are out, at its smallest. */
const REACH = ROOT + 6;
/** Each size makes it this much bigger. */
const GROW = 0.35;

export class Urchin {
  state: 'warn' | 'spikes' | 'close' | 'done' = 'warn';
  t = 0;
  private time = 0;
  /** Set for the one step in which the spikes come out. */
  justOpened = false;
  /** Each size takes one more pull. peak is the biggest it got, for the score. */
  size = 0;
  peak = 0;
  /** Drawn scale, easing towards the size. */
  private sc = 1;
  /** Cuts off the sound it is making now, if it goes early. */
  hush?: () => void;

  constructor(public x: number, public warn = DIFF.urchinWarn, public hold = DIFF.urchinHold) {}

  get harmful() { return this.state === 'spikes' && this.t >= OPEN / 2; }
  /** Still there to be attacked, or to be waited out. */
  get standing() { return this.state === 'warn' || this.state === 'spikes'; }
  get reach() { return REACH * this.sc; }
  /** The tip of its tallest spike, up from the line. */
  get tip() { return (this.state === 'warn' ? FUZZ_END * 2 : DOME + SPIKE) * this.sc; }

  grow() { if (this.size < DIFF.maxSize) this.size++; this.peak = Math.max(this.peak, this.size); }
  shrink() { this.size = Math.max(0, this.size - 1); }

  update(dt: number) {
    this.time += dt;
    this.t += dt;
    this.justOpened = false;
    this.sc += (1 + GROW * this.size - this.sc) * Math.min(1, dt * 10);
    if (this.state === 'warn' && this.t >= this.warn) { this.state = 'spikes'; this.t = 0; this.justOpened = true; }
    else if (this.state === 'spikes' && this.t >= this.hold) { this.state = 'close'; this.t = 0; }
    else if (this.state === 'close' && this.t >= CLOSE) this.state = 'done';
  }

  /** Stop early (pulled flat, the end of the line got here, or he died). */
  sink() {
    if (!this.standing) return;
    this.state = 'close';
    this.t = 0;
    this.hush?.();
  }

  /** How big the body is, 0..1. */
  private get body() {
    if (this.state === 'spikes') return smooth(clamp(this.t / OPEN, 0, 1));
    if (this.state === 'close') return 1 - smooth(this.t / CLOSE);
    return 0;
  }

  /** How far the spikes are out, 0..1. */
  private get spikes() {
    if (this.state === 'spikes') return smooth(clamp(this.t / OPEN, 0, 1));
    if (this.state === 'close') return 1 - smooth(this.t / CLOSE);
    return 0;
  }

  /** Before it comes up: a fine, fast zigzag through the line, to both sides, spreading out from the middle. */
  private fuzz(line: SpringLine): number[] {
    const k = smooth(clamp(this.t / this.warn, 0, 1));
    const half = ROOT * this.sc * lerp(0.4, 1, k), height = lerp(FUZZ_START, FUZZ_END, k) * this.sc;
    const n = Math.max(2, Math.round((half * 2) / FUZZ_STEP));
    const out: number[] = [];
    for (let i = 0; i <= n; i++) {
      const s = i / n, x = this.x - half + s * half * 2;
      // Every other point goes the other way, by an amount that never holds still.
      const jitter = 0.55 + 0.45 * Math.abs(Math.sin(this.time * 83 + i * 1.9) + 0.5 * Math.sin(this.time * 131 + i * 3.7));
      out.push(x, line.sample(x) + (i % 2 ? 1 : -1) * height * jitter * Math.sin(s * Math.PI));
    }
    return out;
  }

  /** The top half's outline, from root to root, left to right. Each tip is doubled to keep it sharp. */
  outline(line: SpringLine): number[] {
    if (this.state === 'warn') return this.fuzz(line);
    const root = ROOT * this.sc;
    const out = [this.x - root, line.sample(this.x - root)];
    const n = SPIKES * 2, y0 = line.sample(this.x);
    const body = DOME * this.sc * this.body, spike = SPIKE * this.sc * this.spikes;
    for (let i = 1; i < n; i++) {
      const a = lerp(Math.PI - 0.35, 0.35, i / n);
      const tip = i % 2 === 1;
      // A jagged, uneven edge that never holds still, like a clipped waveform.
      const r = body + (tip ? spike * (0.85 + 0.15 * Math.sin(this.time * 47 + i * 2.1)) : 0);
      const x = this.x + Math.cos(a) * r, y = y0 - Math.sin(a) * r;
      out.push(x, y);
      if (tip) out.push(x, y);
    }
    out.push(this.x + root, line.sample(this.x + root));
    return out;
  }

  /** Is (cx, cy) within r of its spikes? */
  touches(line: SpringLine, cx: number, cy: number, r: number) {
    if (!this.harmful) return false;
    return Math.hypot(cx - this.x, cy - line.sample(this.x)) < r + this.tip;
  }

  /** The danger in its own colour, over the line's stroke: faint in the fuzz, then full in the spikes. */
  drawFeatures(neon: Neon, line: SpringLine) {
    if (this.state === 'warn') neon.glow(smoothPath(this.fuzz(line)), COLORS.danger, 0.5, lerp(0.25, 1, this.t / this.warn));
    if (this.state !== 'spikes' && this.state !== 'close') return;
    // The top half is in the line's own stroke. The bottom half mirrors it.
    const top = this.outline(line), y0 = line.sample(this.x);
    const bottom = top.map((v, i) => (i % 2 ? 2 * y0 - v : v));
    neon.glow(smoothPath(bottom), COLORS.line, 0.9, 1);
    if (this.state === 'spikes') {
      neon.glow(smoothPath(top), COLORS.danger, 0.8, 1.3);
      neon.glow(smoothPath(bottom), COLORS.danger, 0.8, 1.3);
    }
  }
}
