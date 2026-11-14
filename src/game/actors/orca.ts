// The Killerwave: an orca made of the line. Its fin cuts up out of the line behind Wavell
// and comes after him, a little faster than he walks; close behind him the rest of it comes
// up and opens its jaws, and it charges off to the right, faster than he can go.
// Caught on the line, he is hit. Up in his bubble, it goes by under him, clearing every
// creature in its way. Come down on the back of its fin, and he rides it.
//
// Its outline is ANIM.shapes.orca (the animation lab edits it): jaws open, facing right,
// flat [u, v, ...] with u along the line from the tail root and v up from it. The last four
// points are the jaws: upper tip, corner of the mouth, lower tip, chin; the highest point is
// the tip of the fin. ANIM.shapes.orcaMarks holds the eye.
// The teeth are their own lines, ANIM.shapes.orcaTeethUp and orcaTeethLow, each drawn as one
// zigzag in the same body space as the jaws are edited; as the jaws shut, each row moves with its jaw.

import type { SpringLine } from '../line';
import { DIFF } from '../../data/difficulty';
import { ANIM } from '../../data/anim';
import { COLORS, Neon, clamp, polyPath, smooth } from '../../core/neon';

/** How deep it starts under the line: enough to hide even the fin (u). */
const DEPTH = 50;
/**
 * While only the fin shows, the fin (its tip and the point either side) rises on its own: the
 * part of it above FIN_SINK (u) grows out of the line over FIN_RISE (s), from a low bulge to the
 * full fin, as its tip leans back into place.
 */
const FIN_SINK = 16, FIN_RISE = 1;
/** Out this far (0 to 1), all of it hits, and it clears what is in its way. */
const BODY_OUT = 0.6;
/**
 * It comes up once its head is as far behind him as it goes in this share of its rise
 * (so, if he stands still, its head passes him about a third of the way up). While only the fin shows, its
 * head stays HEAD_GAP (u) behind him.
 */
export const STALK_LEAD = 0.35, HEAD_GAP = 8;
/** Jaws opening (s); slowing down after a ride (s); going back under (s). */
const OPEN = 0.5, SLOW = 0.6, SINK = 1.1;

/** (u, v) moved along with a jaw, from the line a→b (as edited) to a2→b2 (as it is now). */
function follow(u: number, v: number, a: number[], b: number[], a2: number[], b2: number[]): [number, number] {
  const du = b[0] - a[0], dv = b[1] - a[1], l2 = du * du + dv * dv || 1;
  const f = ((u - a[0]) * du + (v - a[1]) * dv) / l2, d = ((v - a[1]) * du - (u - a[0]) * dv) / l2;
  const eu = b2[0] - a2[0], ev = b2[1] - a2[1];
  return [a2[0] + f * eu - d * ev, a2[1] + f * ev + d * eu];
}

export type OrcaState = 'rise' | 'stalk' | 'emerge' | 'open' | 'charge' | 'ride' | 'slow' | 'sink' | 'done';

/** Its length, tail root to chin (u), as the outline is now. */
export function orcaLength() { const s = ANIM.shapes.orca; return s[s.length - 2]; }

export class Orca {
  state: OrcaState = 'rise';
  t = 0;
  private time = 0;
  /** How far its body is out of the line, 0 (under) to 1. */
  private up = 0;
  /** How far its fin is up on its own, 0 (under) to 1 (FIN_SINK deep). */
  private fin = 0;
  /** Jaws, 0 shut to 1 wide. */
  private open = 0;
  speed = 0;
  /** It has hit him once already. */
  hit = false;
  /** Shown still, for the animation lab. */
  private still = false;

  /** x is its tail root, at the left. */
  constructor(public x: number) {}

  get head() { return this.x + orcaLength(); }
  get done() { return this.state === 'done'; }
  /** Out enough to hit him, or be ridden. */
  get harmful() { return (this.fin > 0.6 || this.up > 0.35) && ['rise', 'stalk', 'emerge', 'open', 'charge'].includes(this.state); }
  /** Not yet off: the end of the line waits for it. */
  get coming() { return this.state === 'rise' || this.state === 'stalk' || this.state === 'emerge' || this.state === 'open'; }
  /** Coming up, and nearly all out: it clears what is in its way already. */
  get surfaced() { return this.up > BODY_OUT && (this.state === 'emerge' || this.state === 'open'); }
  get ridden() { return this.state === 'ride' || this.state === 'slow' || this.state === 'sink'; }
  /** Ridden: how fast it is going, 0 to 1, so he flies out like a flag. */
  get rush() { return this.ridden ? clamp(this.speed / DIFF.orcaRideSpeed, 0, 1) : 0; }

  /** He came down on its back: off it goes, as fast as it can. */
  mount() { this.state = 'ride'; this.t = 0; this.open = 1; this.up = 1; this.fin = 1; }
  /** Gone off the screen at the right. */
  leave() { this.state = 'done'; }
  /** Fully up, jaws this open, and still: how the animation lab shows it. */
  show(open = 1) { this.up = 1; this.fin = 1; this.open = open; this.still = true; this.speed = 0; }

  /** Is x on the part of it that is out of the line? Only the fin, until it is nearly all up. */
  reaches(x: number) {
    if (!this.harmful) return false;
    if (this.up > BODY_OUT) return x > this.x - 2 && x < this.head + 2;
    const [fx] = this.finTipLocal();
    return Math.abs(x - (this.x + fx)) < 9;
  }

  /** target: where he is; chase: how fast its fin comes after him (u/s). */
  update(dt: number, target: number, chase: number) {
    this.time += dt;
    this.t += dt;
    const t = this.t, len = orcaLength();
    // Chasing, but never running its head into him before it is up.
    const after = () => { this.speed = chase; this.x = Math.min(this.x + chase * dt, Math.max(this.x, target - HEAD_GAP - len)); };
    switch (this.state) {
      case 'rise':
        this.fin = smooth(clamp(t / FIN_RISE, 0, 1));
        after();
        if (t >= FIN_RISE) { this.state = 'stalk'; this.t = 0; }
        return;
      case 'stalk':
        // Only the fin, cutting along the line after him.
        after();
        if (this.head >= target - chase * DIFF.orcaRise * STALK_LEAD || t >= DIFF.orcaStalk) { this.state = 'emerge'; this.t = 0; }
        return;
      case 'emerge':
        // Coming up, it keeps its pace: no holding back for him any more.
        this.fin = 1;
        this.up = smooth(clamp(t / DIFF.orcaRise, 0, 1));
        this.speed = chase;
        this.x += chase * dt;
        if (t >= DIFF.orcaRise) { this.state = 'open'; this.t = 0; }
        return;
      case 'open':
        this.open = smooth(clamp(t / OPEN, 0, 1));
        this.speed = chase;
        this.x += chase * dt;
        if (t >= OPEN) { this.state = 'charge'; this.t = 0; }
        return;
      case 'charge':
        this.speed = Math.max(chase, DIFF.orcaSpeed * smooth(clamp(t / 0.35, 0, 1)));
        break;
      case 'ride':
        this.speed = DIFF.orcaRideSpeed * smooth(clamp(t / 0.3, 0, 1));
        if (t >= DIFF.orcaRide) { this.state = 'slow'; this.t = 0; }
        break;
      case 'slow':
        this.speed = DIFF.orcaRideSpeed * (1 - smooth(clamp(t / SLOW, 0, 1)));
        if (t >= SLOW) { this.state = 'sink'; this.t = 0; this.speed = 0; }
        break;
      case 'sink':
        this.up = 1 - smooth(clamp(t / SINK, 0, 1));
        this.open = this.fin = this.up;
        if (t >= SINK) this.state = 'done';
        break;
    }
    this.x += this.speed * dt;
  }

  /** Body-local (u from the tail root, v up from the line) to world, riding the line. */
  /** k: the point's index in the outline (flat, as u's), so the fin's points can rise on their own. */
  private tf(line: SpringLine) {
    const sink = (1 - this.up) * DEPTH, swim = this.still ? 0 : this.speed > 60 ? 1.2 : 0.4;
    const s = ANIM.shapes.orca, f = this.fin, [, , ti] = this.finTipLocal();
    // The middle of the fin's foot: as a bulge, the fin is gathered over it.
    const mid = (s[Math.max(0, ti - 4)] + s[Math.min(s.length - 2, ti + 4)]) / 2;
    return (u: number, v: number, k = -1): [number, number] => {
      let h = v - sink;
      if (k >= 0 && Math.abs(k - ti) <= 2) {
        // The fin, out on its own: as tall as it has grown, and leaning back as it grows.
        h = Math.max(h, (v - FIN_SINK) * f);
        if (h > v - sink) u = mid + (u - mid) * f * f;
      }
      // It swims: a ripple runs back along the body, and the line hides what is still under it.
      const vv = Math.max(0, h + (v > 1 ? swim * Math.sin(this.time * 11 - u * 0.12) : 0));
      const x = this.x + u;
      return [x, line.sample(x) - vv];
    };
  }

  /** Its outline in body space, the jaws as open as they are now. */
  private profile(): number[] {
    const p = ANIM.shapes.orca.slice(), n = p.length, o = this.open;
    // Shut, the upper jaw comes down to just over the lower, and the corner of the mouth out to the tip.
    const ut = n - 8, co = n - 6, lt = n - 4;
    const shutV = p[lt + 1] + 4;
    p[ut + 1] = shutV + (p[ut + 1] - shutV) * o;
    p[co] = p[ut] + (p[co] - p[ut]) * o;
    return p;
  }

  /** The highest point of the outline: the fin's tip, in body space, and its index. */
  private finTipLocal(): [number, number, number] {
    const s = ANIM.shapes.orca;
    let best = 0;
    for (let i = 2; i < s.length; i += 2) if (s[i + 1] > s[best + 1]) best = i;
    return [s[best], s[best + 1], best];
  }

  outline(line: SpringLine): number[] {
    const P = this.tf(line), p = this.profile(), pts: [number, number][] = [];
    for (let i = 0; i < p.length; i += 2) pts.push(P(p[i], p[i + 1], i));
    // What is still under the line is the line: only what is out, and the points either side
    // where it leaves the line, so the stroke never runs back over itself.
    const out = (q: [number, number]) => line.sample(q[0]) - q[1] > 0.3;
    const res: number[] = [];
    pts.forEach((q, i) => { if (out(q) || (i > 0 && out(pts[i - 1])) || (i < pts.length - 1 && out(pts[i + 1]))) res.push(...q); });
    return res;
  }

  /** The tip of the fin, where he holds on, in the world. */
  finTip(line: SpringLine): [number, number] { const [u, v, i] = this.finTipLocal(); return this.tf(line)(u, v, i); }

  /**
   * Does a bubble of radius r centred at (bx, by) come down on its fin from behind? It has
   * to touch the back edge of the fin (the two points of the outline before its tip, and the
   * tip), with its centre no further forward than the tip.
   */
  catches(line: SpringLine, bx: number, by: number, r: number) {
    if (!this.harmful) return false;
    const P = this.tf(line), s = ANIM.shapes.orca, [, , ti] = this.finTipLocal(), tip = P(s[ti], s[ti + 1], ti);
    if (bx > tip[0] + 3 || by > tip[1] + 14) return false;
    for (let i = Math.max(0, ti - 4); i < ti; i += 2) {
      const a = P(s[i], s[i + 1], i), b = P(s[i + 2], s[i + 3], i + 2);
      for (let k = 0; k <= 8; k++) {
        const x = a[0] + (b[0] - a[0]) * k / 8, y = a[1] + (b[1] - a[1]) * k / 8;
        if (Math.hypot(x - bx, y - by) < r + 2) return true;
      }
    }
    return Math.hypot(tip[0] - bx, tip[1] - by) < r + 3;
  }

  /** Its eye, and its teeth once the jaws are open. */
  drawFeatures(neon: Neon, line: SpringLine) {
    if (this.up < 0.5) return;
    const P = this.tf(line), k = smooth(clamp((this.up - 0.5) / 0.5, 0, 1));
    const [ex, ey] = ANIM.shapes.orcaMarks;
    const eye = new Path2D(), [wx, wy] = P(ex, ey);
    eye.arc(wx, wy, 0.9, 0, Math.PI * 2);
    neon.glow(eye, COLORS.eye, 0.9, 1.2 * k);
    if (this.open > 0.2) {
      // Each row of teeth goes where its jaw goes: corner of the mouth to the jaw's tip.
      const s = ANIM.shapes.orca, p = this.profile(), n = p.length, teeth = new Path2D();
      const row = (pts: number[] | undefined, tip: number) => {
        if (!pts || pts.length < 4) return;
        const a = [s[n - 6], s[n - 5]], b = [s[tip], s[tip + 1]], a2 = [p[n - 6], p[n - 5]], b2 = [p[tip], p[tip + 1]];
        const out: number[] = [];
        for (let i = 0; i < pts.length; i += 2) out.push(...P(...follow(pts[i], pts[i + 1], a, b, a2, b2)));
        polyPath(out, false, teeth);
      };
      row(ANIM.shapes.orcaTeethUp, n - 8);
      row(ANIM.shapes.orcaTeethLow, n - 4);
      neon.glow(teeth, COLORS.white, 0.4, this.open);
    }
  }
}
