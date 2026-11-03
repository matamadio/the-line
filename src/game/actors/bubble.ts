// The Bubble Burst ("Bolla" in the original): the line blisters into a bubble on one
// of its sides, swells, and bursts into a spray that leaves Wavell dizzy and slow.
// Its skin is a loop of the line itself, spliced into the stroke. Answers: pop it
// first with a wave on its side, keep clear of it, or be on the other side.

import type { SpringLine } from '../line';
import { Neon, clamp, lerp, smooth, smoothPath } from '../../core/neon';

export const BUBBLE_GREEN = '#9dff5a';
const MAX_R = 9;

export type BubbleState = 'grow' | 'burst' | 'popped' | 'done';

export class BubbleBurst {
  state: BubbleState = 'grow';
  t = 0;
  private time = Math.random() * 10;

  /** side: 1 swells above the line, -1 below. */
  constructor(public x: number, public side: 1 | -1, readonly growTime: number) {}

  get harmful() { return this.state === 'grow'; }
  /** 0..1 towards bursting. */
  get ripeness() { return clamp(this.t / this.growTime, 0, 1); }
  get r() {
    const k = this.ripeness;
    // Swells, then quivers just before it goes.
    return lerp(2, MAX_R, smooth(k)) * (1 + (k > 0.75 ? Math.sin(this.time * 40) * 0.06 : Math.sin(this.time * 6) * 0.03));
  }

  /** Flattened by a wave before it could burst: harmless. */
  pop() { if (this.state === 'grow') { this.state = 'popped'; this.t = 0; } }
  /** Fed by the wrong wave: it swells on, closer to bursting. */
  feed() { if (this.state === 'grow') this.t = Math.min(this.growTime, this.t + this.growTime * 0.4); }

  update(dt: number) {
    this.time += dt;
    this.t += dt;
    if (this.state === 'grow' && this.t >= this.growTime) { this.state = 'burst'; this.t = 0; }
    else if ((this.state === 'burst' || this.state === 'popped') && this.t > 0.05) this.state = 'done';
  }

  /** Where the bubble's centre is. */
  centre(line: SpringLine): [number, number] {
    const r = this.r;
    return [this.x, line.sample(this.x) - this.side * (r * 0.95 + 1.2)];
  }

  /** The skin: a loop of the line, crossed at the neck, from the left root to the right root. */
  outline(line: SpringLine): number[] {
    const r = this.r, [cx, cy] = this.centre(line), s = this.side;
    const neck = lerp(5, 2.2, this.ripeness);
    const out = [this.x - neck - 2, line.sample(this.x - neck - 2)];
    // Start at the bottom right of the loop (on the line's side) and go the long way round.
    const a0 = s * (Math.PI / 2 - 0.5), a1 = a0 - s * (Math.PI * 2 - 1);
    for (let i = 0; i <= 14; i++) {
      const a = lerp(a0, a1, i / 14);
      out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    out.push(this.x + neck + 2, line.sample(this.x + neck + 2));
    return out;
  }

  /** The green sheen and the shine: it turns greener and flickers as it ripens. */
  drawFeatures(neon: Neon, line: SpringLine) {
    if (this.state !== 'grow') return;
    const k = this.ripeness, [cx, cy] = this.centre(line), r = this.r;
    const flicker = k > 0.75 && Math.floor(this.time * 16) % 2 === 0 ? 0.4 : 1;
    neon.glow(smoothPath(this.outline(line)), BUBBLE_GREEN, 0.9, (0.2 + 0.8 * k) * flicker);
    const shine = new Path2D();
    shine.arc(cx, cy, r * 0.65, -2.4, -1.7);
    neon.glow(shine, '#ffffff', 0.4, 0.5);
  }
}
