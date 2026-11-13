// A creature caught by the end of the line goes the way Wavell does: a break with a hot
// ember runs along its contour, from the end it was caught by to the other, and what it
// has passed drifts off as sparks. The break is the end of the line itself: it crosses the
// creature as fast as the line crumbles, and the line carries on crumbling past it.

import { COLORS, Neon, clamp, polyPath, rand, smoothPath } from '../core/neon';
import { arcLengths, pointAt } from './actors/wavell';
import type { Fx } from './fx';
import type { SpringLine } from './line';

/** One stroke of a creature. */
export interface Part { pts: number[]; color: string }
/** Contours burn together, from end to end. Bits (legs, eyes) go when the break reaches them. */
export interface Shape { contours: Part[]; bits: Part[] }

/** A spark for about every this many units of stroke. */
const PIECE = 2.5;
/** The stretch glowing ahead of the ember (u). */
const HOT = 10;

/** A stroke with its heights measured from the line. */
class Stroke {
  private readonly rel: number[];
  readonly lens: number[];
  readonly color: string;
  next = 0;

  constructor({ pts, color }: Part, line: SpringLine) {
    this.color = color;
    this.rel = pts.map((v, i) => (i % 2 ? v - line.sample(pts[i - 1]) : v));
    this.lens = arcLengths(pts);
  }

  get total() { return this.lens[this.lens.length - 1]; }
  get firstX() { return this.rel[0]; }
  get lastX() { return this.rel[this.rel.length - 2]; }

  /** How far along it the stroke first gets as far right as x. */
  along(x: number) {
    const r = this.rel;
    if (x <= r[0]) return 0;
    for (let i = 1; i < this.lens.length; i++) {
      const x0 = r[i * 2 - 2], x1 = r[i * 2];
      if (x1 >= x) return this.lens[i - 1] + (this.lens[i] - this.lens[i - 1]) * clamp((x - x0) / (x1 - x0 || 1), 0, 1);
    }
    return this.total;
  }

  world(line: SpringLine) {
    return this.rel.map((v, i) => (i % 2 ? v + line.sample(this.rel[i - 1]) : v));
  }

  /** Turn everything up to this far along it into sparks. */
  shed(d: number, line: SpringLine, fx: Fx) {
    if (this.next > d) return;
    const pts = this.world(line);
    for (; this.next <= d; this.next += PIECE) {
      const [x, y] = pointAt(pts, this.lens, this.next);
      fx.disperse(x, y, this.color);
    }
  }

  /** What is left past this far along it, starting at that point. */
  rest(d: number, line: SpringLine) {
    const pts = this.world(line);
    let i = 0;
    while (i < this.lens.length - 1 && this.lens[i + 1] <= d) i++;
    return [...pointAt(pts, this.lens, d), ...pts.slice((i + 1) * 2)];
  }
}

export class Crumble {
  private readonly contours: Stroke[];
  /** Soonest to go first. */
  private readonly bits: { stroke: Stroke; at: number }[];
  /** From 0 to 1, how far the break has run. */
  progress = 0;
  /** How far right the end of the line has reached on it. */
  front: number;
  private ember: [number, number] | null = null;

  constructor(shape: Shape, line: SpringLine) {
    this.contours = shape.contours.map((c) => new Stroke(c, line));
    const main = this.contours[0], mainPts = shape.contours[0].pts;
    this.front = main.firstX;
    this.bits = shape.bits.map((bit) => {
      // How far along the contour the break reaches it.
      let best = Infinity, at = 0;
      for (let i = 0; i < main.lens.length; i++) {
        const dist = Math.hypot(mainPts[i * 2] - bit.pts[0], mainPts[i * 2 + 1] - bit.pts[1]);
        if (dist < best) { best = dist; at = main.lens[i] / main.total; }
      }
      return { stroke: new Stroke(bit, line), at };
    }).sort((a, b) => a.at - b.at);
  }

  get done() { return this.progress >= 1; }
  /** Where the line starts again. */
  get right() { return this.contours[0].lastX; }

  /** The end of the line has crumbled in as far as x: the break is there on the creature, and never goes back. */
  update(x: number, line: SpringLine, fx: Fx) {
    const main = this.contours[0];
    this.front = Math.max(this.front, x);
    if (x >= this.right) this.progress = 1;
    else this.progress = Math.max(this.progress, main.along(x) / main.total);
    const k = this.progress;
    for (const c of this.contours) c.shed(k * c.total, line, fx);
    while (this.bits.length && this.bits[0].at <= k) {
      const { stroke } = this.bits.shift()!;
      stroke.shed(stroke.total, line, fx);
    }
    this.ember = pointAt(main.world(line), main.lens, k * main.total);
    if (Math.random() < 0.3) fx.disperse(this.ember[0], this.ember[1], '#fff1b0');
    if (Math.random() < 0.12) fx.disperse(this.ember[0], this.ember[1], COLORS.danger);
  }

  draw(neon: Neon, line: SpringLine) {
    const k = this.progress;
    for (const c of this.contours) neon.glow(smoothPath(c.rest(k * c.total, line)), c.color, 0.9, 1);
    for (const { stroke } of this.bits) neon.glow(polyPath(stroke.world(line), false), stroke.color, 0.6, 1);
    if (!this.ember) return;
    // Just ahead of the break the stroke glows; the break itself is white-hot.
    const main = this.contours[0], pts = main.world(line), d = k * main.total, hot: number[] = [];
    for (let i = 0; i <= 5; i++) hot.push(...pointAt(pts, main.lens, Math.min(main.total, d + (HOT * i) / 5)));
    neon.glow(polyPath(hot, false), COLORS.danger, 1.3, 0.7 + rand(0, 0.5));
    const core = new Path2D();
    core.arc(this.ember[0], this.ember[1], 0.9 + rand(0, 0.5), 0, Math.PI * 2);
    neon.glow(core, '#ffffff', 1.2, 1.4);
  }
}
