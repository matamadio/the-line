// The Sinepede: the basic enemy, a stretch of pure sine wave crawling along the line.
// Each segment is half a wave, a crest above the line or a trough below it, and they
// alternate, so one that starts on a crest is a sine and one that starts on a trough is
// a cosine. It sounds like what it looks like: see sfx.call().
//
// The right attack cancels the segment facing Wavell. The wrong one throws the whole
// thing back and adds a segment at the far end. Running into him does the same, and
// throws him back too: see Game.bump().
//
// All of it is one stroke of the line: its spikes rise out of the curve and come back
// down to it, and its free ends ease out of the flat line without a corner.

import type { Part, Shape } from '../crumble';
import type { SpringLine } from '../line';
import { DIFF } from '../../data/difficulty';
import { COLORS, Neon, lerp } from '../../core/neon';

/** Length of one segment: half a wavelength (u). */
export const SEG_W = 34;
const AMP = 24;
/** Points per segment when testing for contact. */
const SEG_POINTS = 8;
/** Most of a segment between two points of the drawn curve. */
const CURVE_STEP = 0.06;
/** Where the spikes stand along a segment, and how long each is, as a share of SPIKE. */
const SPIKES: [number, number][] = [[0.18, 0.7], [0.35, 0.9], [0.5, 1], [0.65, 0.9], [0.82, 0.7]];
/** Length of the longest spike, and half the width of a spike's root (u). */
const SPIKE = 9, SPIKE_ROOT = 1.3;
/** Where the eye sits along the leading segment, and how big it is (u). */
const EYE_T = 0.265, EYE_R = 1.5;
/** How far a free end's shoulder reaches out along the line, past the segment (u). */
export const SKIRT = 10;
/** How far its shoulders may reach to the left and right: less when something else is close. */
export type Skirts = readonly [number, number];
const FULL: Skirts = [SKIRT, SKIRT];

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

  /** Still flying back faster than it crawls: it can't run into anyone yet. */
  get recoiling() { return Math.abs(this.kick) > this.speed; }

  /** Everything fades into the line (at the end of the line, or after he dies). */
  sink() { for (const s of this.segs) s.gone = true; }
  /** Gone at once: a Crumble takes over its strokes. */
  vanish() { this.segs.length = 0; this.state = 'done'; }

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

  /**
   * Height of a point up from the line, at t along segment i (t may run past the ends,
   * onto the shoulders). Next to another segment each half is a sine, so the wave runs
   * on through the join. Where nothing is next to it, that half is a wider raised cosine,
   * which reaches past the segment and leaves the flat line level: no corner.
   */
  private height(i: number, t: number, sk: Skirts) {
    const last = this.segs.length - 1;
    let h = 0;
    for (let j = i - 1; j <= i + 1; j++) {
      const s = this.segs[j];
      if (!s) continue;
      const rel = i + t - j, left = rel < 0.5, u = Math.abs(rel - 0.5) * SEG_W;
      const free = 1 - (this.segs[left ? j - 1 : j + 1]?.g ?? 0);
      const reach = SEG_W / 2 + (left ? (j === 0 ? sk[0] : SKIRT) : (j === last ? sk[1] : SKIRT));
      const sine = u < SEG_W / 2 ? Math.cos((u / SEG_W) * Math.PI) : 0;
      const shoulder = u < reach ? 0.5 * (1 + Math.cos((u / reach) * Math.PI)) : 0;
      h += s.side * AMP * s.g * s.press * lerp(sine, shoulder, free);
    }
    return h;
  }

  private at(line: SpringLine, i: number, t: number, sk: Skirts = FULL): [number, number] {
    const x = this.x + (i + t) * SEG_W;
    return [x, line.sample(x) - this.height(i, t, sk)];
  }

  /** One spike as part of the stroke: up from the curve, doubled at the tip to keep it sharp, and down again. */
  private spike(out: number[], line: SpringLine, i: number, k: number, sk: Skirts) {
    const s = this.segs[i], [t, share] = SPIKES[k], w = SPIKE_ROOT / SEG_W;
    const [x, y] = this.at(line, i, t, sk), [x0, y0] = this.at(line, i, t - w, sk), [x1, y1] = this.at(line, i, t + w, sk);
    const d = Math.hypot(x1 - x0, y1 - y0) || 1, tx = (x1 - x0) / d, ty = (y1 - y0) / d;
    // Straight out of the wave: up from a crest, down from a trough.
    const nx = ty * s.side, ny = -tx * s.side;
    const stir = Math.sin(this.time * 14 + k * 1.3 + i * 2);
    const len = SPIKE * share * s.g * s.press * (1 + 0.08 * stir);
    const neck = len * 0.2, lean = stir * 0.9 * s.g;
    // A narrow neck just above the root, so it flows out of the curve and tapers.
    const nearX = lerp(x0, x, 0.6), nearY = lerp(y0, y, 0.6), farX = lerp(x1, x, 0.6), farY = lerp(y1, y, 0.6);
    const tipX = x + nx * len + tx * lean, tipY = y + ny * len + ty * lean;
    out.push(x0, y0, nearX + nx * neck, nearY + ny * neck, tipX, tipY, tipX, tipY, farX + nx * neck, farY + ny * neck, x1, y1);
  }

  /** The outline from shoulder to shoulder, on the line's own stroke, spikes and all. */
  outline(line: SpringLine, skirts: Skirts = FULL): number[] {
    const sk: Skirts = [Math.min(SKIRT, Math.max(0, skirts[0])), Math.min(SKIRT, Math.max(0, skirts[1]))];
    const out: number[] = [];
    const last = this.segs.length - 1;
    const curve = (i: number, from: number, to: number, skipFirst: boolean) => {
      const n = Math.ceil((to - from) / CURVE_STEP);
      for (let j = skipFirst ? 1 : 0; j < n; j++) out.push(...this.at(line, i, lerp(from, to, j / n), sk));
    };
    if (last >= 0) curve(0, -sk[0] / SEG_W, 0, false);
    this.segs.forEach((_, i) => {
      let from = 0;
      SPIKES.forEach(([t], k) => {
        curve(i, from, t - SPIKE_ROOT / SEG_W, from > 0);
        this.spike(out, line, i, k, sk);
        from = t + SPIKE_ROOT / SEG_W;
      });
      curve(i, from, 1, true);
    });
    if (last >= 0) curve(last, 1, 1 + sk[1] / SEG_W, false);
    const end = this.back + sk[1];
    out.push(end, line.sample(end));
    return out;
  }

  /** Is any point of the wave within r of (cx, cy)? The spikes are for show: they don't reach any further. */
  touches(line: SpringLine, cx: number, cy: number, r: number) {
    if (!this.harmful) return false;
    for (let i = 0; i < this.segs.length; i++) {
      for (let j = 0; j <= SEG_POINTS; j++) {
        const [x, y] = this.at(line, i, j / SEG_POINTS);
        if (Math.hypot(x - cx, y - cy) < r + 1) return true;
      }
    }
    return false;
  }

  /** Where the eye on the leading segment is, if it shows: on the wave, between its first two spikes. */
  private eye(line: SpringLine, sk: Skirts = FULL): [number, number] | null {
    const lead = this.segs.findIndex((s) => !s.gone);
    if (lead < 0 || this.segs[lead].g < 0.3) return null;
    return this.at(line, lead, EYE_T, sk);
  }

  /** Everything it is drawn with, for when it comes apart. */
  parts(line: SpringLine): Shape {
    const bits: Part[] = [];
    const eye = this.eye(line);
    if (eye) bits.push({ pts: [eye[0] - EYE_R, eye[1], eye[0] + EYE_R, eye[1]], color: COLORS.eye });
    // Without its shoulders: they are for show, and the end of the line must not gain ground from them.
    return { contours: [{ pts: this.outline(line, [0, 0]), color: COLORS.line }], bits };
  }

  /** The eye: a little ring threaded on the line, on the leading segment. */
  drawFeatures(neon: Neon, line: SpringLine, skirts: Skirts = FULL) {
    if (!this.harmful) return;
    const at = this.eye(line, [Math.min(SKIRT, Math.max(0, skirts[0])), Math.min(SKIRT, Math.max(0, skirts[1]))]);
    if (!at) return;
    // The line stops at the ring and carries on after it.
    const c = neon.ctx;
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#020107';
    c.beginPath();
    c.arc(at[0], at[1], EYE_R, 0, Math.PI * 2);
    c.fill();
    const ring = new Path2D();
    ring.arc(at[0], at[1], EYE_R, 0, Math.PI * 2);
    neon.glow(ring, COLORS.eye, 0.7, this.intensity);
    neon.glow(ring, '#ffd9d2', 0.25, this.intensity);
  }
}
