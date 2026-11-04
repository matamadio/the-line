// The Sinepede: the basic enemy, a stretch of pure sine wave crawling along the line.
// Each segment is half a wave, a crest above the line or a trough below it, and they
// alternate, so one that starts on a crest is a sine and one that starts on a trough is
// a cosine. It sounds like what it looks like: see sfx.call().
//
// The right attack cancels the segment facing Wavell. The wrong one throws the whole
// thing back and adds a segment at the far end.

import type { SpringLine } from '../line';
import { DIFF } from '../../data/difficulty';
import { COLORS, Neon, polyPath } from '../../core/neon';

/** Length of one segment: half a wavelength (u). */
export const SEG_W = 34;
const AMP = 24;
/** Points per segment in the outline. */
const SEG_POINTS = 8;
const LEGS = [0.22, 0.4, 0.6, 0.78];

export type Side = 1 | -1;
export interface Segment { side: Side; g: number; gone: boolean; press: number }

const segment = (side: Side, g = 0): Segment => ({ side, g, gone: false, press: 1 });

export class Sinepede {
  state: 'move' | 'done' = 'move';
  segs: Segment[];
  private kick = 0;
  private flash = 0;
  private time = 0;

  /** x is the left end. side is the first segment's: 1 for a crest, -1 for a trough. */
  constructor(public x: number, public speed = DIFF.sineSpeed, count = 1, side: Side = 1) {
    this.segs = Array.from({ length: Math.max(1, count) }, (_, i) => segment(i % 2 ? (-side as Side) : side));
  }

  get back() { return this.x + this.segs.length * SEG_W; }
  get centre() { return (this.x + this.back) / 2; }
  get count() { return this.segs.filter((s) => !s.gone).length; }
  get harmful() { return this.state === 'move' && this.count > 0; }
  get intensity() { return 1 + this.flash * 1.5; }

  /** The sides of the live segments, from the left. */
  get sides() { return this.segs.filter((s) => !s.gone).map((s) => s.side); }

  /** The live segment nearest to someone standing at x. */
  front(x: number): Segment | undefined {
    const live = this.segs.filter((s) => !s.gone);
    return x < this.centre ? live[0] : live[live.length - 1];
  }

  frontCentre(x: number) {
    const f = this.front(x);
    return f ? this.x + (this.segs.indexOf(f) + 0.5) * SEG_W : this.centre;
  }

  /** The live segment over this point of the line, if any. */
  segAt(x: number): Segment | undefined {
    const s = this.segs[Math.floor((x - this.x) / SEG_W)];
    return s && !s.gone ? s : undefined;
  }

  /** The right attack, from someone at x: the segment facing them fades into the line. */
  cancel(x: number) {
    const f = this.front(x);
    if (f) { f.gone = true; this.flash = 0.7; }
  }

  /** The wrong attack, from someone at x: one more segment at the far end, if there is room. */
  grow(x: number) {
    this.flash = 1;
    if (this.count >= DIFF.sineMaxSegs) return;
    if (x < this.centre) {
      const last = this.segs[this.segs.length - 1];
      this.segs.push(segment(-last.side as Side));
    } else {
      this.segs.unshift(segment(-this.segs[0].side as Side));
      this.x -= SEG_W;
    }
  }

  /** Thrown back along the line, easing to a stop. */
  knock(v: number) { this.kick = v; }

  /** Everything fades into the line (at the end of the line, or after he dies). */
  sink() { for (const s of this.segs) s.gone = true; }

  update(dt: number) {
    this.time += dt;
    this.x -= this.speed * dt;
    if (this.kick) { this.x += this.kick * dt; this.kick *= Math.exp(-5 * dt); if (Math.abs(this.kick) < 5) this.kick = 0; }
    this.flash = Math.max(0, this.flash - dt * 3);
    for (const s of this.segs) s.g += ((s.gone ? 0 : 1) - s.g) * Math.min(1, dt * (s.gone ? 18 : 7));
    // A segment that has faded away leaves the ends of the wave.
    while (this.segs.length && this.segs[0].gone && this.segs[0].g < 0.03) { this.segs.shift(); this.x += SEG_W; }
    while (this.segs.length && this.segs[this.segs.length - 1].gone && this.segs[this.segs.length - 1].g < 0.03) this.segs.pop();
    if (!this.segs.length) this.state = 'done';
  }

  /** Height of a point in a segment (t 0..1), up from the line. */
  private height(s: Segment, t: number) {
    return s.side * AMP * s.g * s.press * Math.sin(t * Math.PI);
  }

  /** The outline from end to end, on the line's own stroke. */
  outline(line: SpringLine): number[] {
    const out: number[] = [];
    this.segs.forEach((s, i) => {
      for (let j = 0; j < SEG_POINTS; j++) {
        const t = j / SEG_POINTS, x = this.x + (i + t) * SEG_W;
        out.push(x, line.sample(x) - this.height(s, t));
      }
    });
    out.push(this.back, line.sample(this.back));
    return out;
  }

  /** Is any point of the outline within r of (cx, cy)? */
  touches(line: SpringLine, cx: number, cy: number, r: number) {
    if (!this.harmful) return false;
    const o = this.outline(line);
    for (let i = 0; i < o.length; i += 2) if (Math.hypot(o[i] - cx, o[i + 1] - cy) < r + 1) return true;
    return false;
  }

  /** Legs along each segment, and an eye on the leading one. */
  drawFeatures(neon: Neon, line: SpringLine) {
    if (!this.harmful) return;
    const legs = new Path2D();
    this.segs.forEach((s, i) => {
      if (s.g < 0.3) return;
      LEGS.forEach((t, k) => {
        const x = this.x + (i + t) * SEG_W, y = line.sample(x) - this.height(s, t);
        const stir = Math.sin(this.time * 14 + k + i * 2) * 1.2;
        polyPath([x, y, x + (t < 0.5 ? -2.4 : 2.4) + stir, y - s.side * 4.4 * s.g], false, legs);
      });
    });
    neon.glow(legs, COLORS.enemy, 0.6, this.intensity);
    const lead = this.segs.findIndex((s) => !s.gone);
    if (lead < 0 || this.segs[lead].g < 0.3) return;
    const s = this.segs[lead], t = 0.36, x = this.x + (lead + t) * SEG_W;
    const eye = new Path2D();
    eye.arc(x, line.sample(x) - this.height(s, t) + s.side * 4, 1.3, 0, Math.PI * 2);
    neon.glow(eye, COLORS.eye, 1, this.intensity);
  }
}
