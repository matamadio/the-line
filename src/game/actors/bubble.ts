// The Bubble Burst ("Bolla" in the original): the line blisters into a bubble on one
// of its sides, swells, and bursts into a spray that leaves Wavell dizzy and slow.
// Its skin is a loop of the line itself, spliced into the stroke. Answers: pop it
// with the right wave, or keep clear of it. The wrong wave feeds it: it swells and
// bursts sooner. Walking into it, from either side, pops it but leaves him
// dizzy.
//
// On the higher levels some let go of the line, the way Wavell's bubble does, and burst
// in the air. Attacks along the line can't reach those. Their spray pops his bubble and
// leaves him dizzy if he is on the line under it. A fed one is too heavy to float off.

import type { SpringLine } from '../line';
import { COLORS, Neon, clamp, lerp, smooth, smoothPath } from '../../core/neon';

export const BUBBLE_GREEN = '#9dff5a';
const MAX_R = 9;
/** How far towards bursting (0..1) one that floats off lets go of the line. */
const DETACH = 0.5;
/** How fast it leaves the line (u/s), slowing down as it goes. */
const RISE = 34;
/** How much bigger each wrong wave makes it. */
const FED = 0.25;

export type BubbleState = 'grow' | 'fly' | 'burst' | 'popped' | 'done';

export class BubbleBurst {
  state: BubbleState = 'grow';
  t = 0;
  private time = Math.random() * 10;
  /** It has let go of the line. */
  airborne = false;
  /** Where it is, once it has let go. */
  private y = 0;
  private fed = 0;
  /** Set for the one step in which it lets go, or bursts. */
  justDetached = false;
  justBurst = false;

  /** side: 1 swells above the line, -1 below. flyTime: seconds in the air, 0 if it stays on the line. */
  constructor(public x: number, public side: 1 | -1, readonly growTime: number, private flyTime = 0) {}

  get harmful() { return this.state === 'grow' || this.state === 'fly'; }
  /** 0..1 towards bursting. */
  get ripeness() {
    return this.airborne ? lerp(DETACH, 1, clamp(this.t / this.flyTime, 0, 1)) : clamp(this.t / this.growTime, 0, 1);
  }
  get r() {
    const k = this.ripeness;
    // Swells, then quivers just before it goes.
    return lerp(2, MAX_R * (1 + FED * this.fed), smooth(k)) * (1 + (k > 0.75 ? Math.sin(this.time * 40) * 0.06 : Math.sin(this.time * 6) * 0.03));
  }

  /** Flattened by a wave before it could burst: harmless. */
  pop() { if (this.harmful) { this.state = 'popped'; this.t = 0; } }
  /** Touched, or its time is up. */
  burst() { if (this.harmful) { this.state = 'burst'; this.t = 0; this.justBurst = true; } }
  /** Fed by the wrong wave: it swells, closer to bursting, and is now too heavy to float off. */
  feed() {
    if (this.state !== 'grow') return;
    this.flyTime = 0;
    this.fed++;
    this.t = Math.min(this.growTime, this.t + this.growTime * 0.4);
  }

  /** onBeat: letting go and bursting wait for it, so their sounds fall on the beat. */
  update(dt: number, line: SpringLine, onBeat = true) {
    this.time += dt;
    this.t += dt;
    this.justDetached = this.justBurst = false;
    if (this.state === 'grow' && this.flyTime > 0 && this.ripeness >= DETACH && onBeat) {
      this.y = this.centre(line)[1];
      this.airborne = this.justDetached = true;
      this.state = 'fly';
      this.t = 0;
    } else if (this.state === 'grow' && this.t >= this.growTime && onBeat) this.burst();
    else if (this.state === 'fly') {
      this.y -= this.side * RISE * (1 - 0.6 * this.t / this.flyTime) * dt;
      if (this.t >= this.flyTime && onBeat) this.burst();
    } else if ((this.state === 'burst' || this.state === 'popped') && this.t > 0.05) this.state = 'done';
  }

  /** Where the bubble's centre is. */
  centre(line: SpringLine): [number, number] {
    if (this.airborne) return [this.x + Math.sin(this.time * 3) * 1.5, this.y];
    const r = this.r;
    return [this.x, line.sample(this.x) - this.side * (r * 0.95 + 1.2)];
  }

  /** The skin: a loop of the line, crossed at the neck, from the left root to the right root. */
  outline(line: SpringLine): number[] {
    const r = this.r, [cx, cy] = this.centre(line), s = this.side;
    // One about to float off pinches right in at the neck.
    const neck = this.flyTime > 0 ? lerp(5, 0.8, this.ripeness / DETACH) : lerp(5, 2.2, this.ripeness);
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
    if (this.state !== 'grow' && this.state !== 'fly') return;
    const k = this.ripeness, [cx, cy] = this.centre(line), r = this.r;
    const flicker = k > 0.75 && Math.floor(this.time * 16) % 2 === 0 ? 0.4 : 1;
    if (this.state === 'fly') {
      // No longer part of the line's stroke, so it draws its own skin.
      const skin = new Path2D();
      skin.arc(cx, cy, r, 0, Math.PI * 2);
      neon.glow(skin, COLORS.line, 0.9, 1);
      neon.glow(skin, BUBBLE_GREEN, 0.9, (0.2 + 0.8 * k) * flicker);
    } else neon.glow(smoothPath(this.outline(line)), BUBBLE_GREEN, 0.9, (0.2 + 0.8 * k) * flicker);
    const shine = new Path2D();
    shine.arc(cx, cy, r * 0.65, -2.4, -1.7);
    neon.glow(shine, '#ffffff', 0.4, 0.5);
  }
}
