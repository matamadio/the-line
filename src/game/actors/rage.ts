// The Rage knot: a power-up tangled into the line itself, a scribble of loops on both
// sides of it that never holds still. Wavell touches it, from either side or in his
// bubble, and unties it: the loops pull out into the line, he shouts, and three huge
// waves run out each way, clearing every creature and carrying the end of the line back.

import { clamp, lerp, smooth } from '../../core/neon';
import type { SpringLine } from '../line';
import { ANIM, I, SIZE, pose } from '../../data/anim';

/** How long untying it takes (s): he holds still meanwhile. */
export const UNTIE = 0.55;
/**
 * After untying it, Wavell plays the "rage" clip (the animation lab edits it): he grabs the
 * line at its "grab" mark and holds it until the clip ends, and a wave goes out each way at
 * each of its "wave…" marks: a crest if his hands are up then, a trough if they are down.
 */
export function rageWaves(): { t: number; side: 1 | -1 }[] {
  const c = ANIM.clips.rage, p = new Float32Array(SIZE);
  return Object.entries(c.marks ?? {}).filter(([k]) => k.startsWith('wave')).map(([, t]) => t).sort((x, y) => x - y)
    .map((t) => ({ t, side: pose('rage', t, p)[I.handF + 1] > RAGE_MID ? 1 : -1 }));
}
/** Hands higher than this (pose units) send a crest, lower a trough. */
const RAGE_MID = 9;

/** Half its length along the line, and its tallest loop off it (u). */
export const KNOT_HALF = 12, KNOT_HIGH = 15;
/** How many loops it has. */
const LOOPS = 11;

/** Rage's colours: every hue in turn, jumping about. `p` picks one of several at once. */
export function wildHue(t: number, p: number, light = 70) {
  const hue = (t * 260 + p * 72 + 80 * Math.sin(t * 7.3 + p * 2.1) + 50 * Math.sin(t * 13.1 - p)) % 360;
  return `hsl(${(hue + 360) % 360}, 100%, ${light}%)`;
}

export class RageKnot {
  t = 0;
  /** Seconds into untying it, or -1 while it waits to be picked. */
  untie = -1;
  /** Where his hands hold it while he unties it. */
  hold = 0;

  constructor(public x: number, public life: number) {}

  get waiting() { return this.untie < 0; }
  get untied() { return this.untie >= UNTIE; }

  update(dt: number) {
    this.t += dt;
    if (this.waiting) this.life -= dt;
    else this.untie += dt;
  }

  /** Grabbed: from now on it unties towards his hands at x. */
  grab(hold: number) {
    this.untie = 0;
    this.hold = hold;
  }

  /**
   * Its stroke, left to right, both ends on the line so it reads as the line tangling up.
   * A scribble that never settles: loops of every size pulled about by several wobbles at
   * once, at speeds that never line up, so it keeps changing shape; and it throbs fast.
   * While he unties it, it slides into his hands and pulls out straight until it is line again.
   */
  points(line: SpringLine): number[] {
    const k = this.waiting ? 0 : smooth(clamp(this.untie / UNTIE, 0, 1));
    const cx = lerp(this.x, this.hold, k), t = this.t;
    const half = KNOT_HALF * lerp(1, 0.6, k);
    const pulse = 1 + 0.16 * Math.sin(t * 17) + 0.08 * Math.sin(t * 29 + 1);
    const out: number[] = [], n = 280;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      // Biggest in the middle, nothing at the ends.
      const env = Math.pow(Math.sin(Math.PI * u), 1.1) * (1 - k);
      // How big each loop is, and how fast the pen goes round, both keep changing.
      const size = 0.2 + 0.8 * Math.abs(Math.sin(u * 13 + t * 4.3 + 1.7 * Math.sin(u * 31 - t * 6.1)));
      const a = u * Math.PI * 2 * LOOPS + 2.4 * Math.sin(u * 9 + t * 3.7) + 1.3 * Math.sin(u * 23 - t * 5.9);
      const r = KNOT_HIGH * env * size * pulse;
      const wide = 0.5 + 0.35 * Math.sin(u * 17 + t * 4.9);
      // The scribbling hand wanders, so the loops pile up off centre and cross each other.
      const jx = (Math.sin(u * 37 + t * 5.3) + Math.sin(u * 61 - t * 7.7)) * 0.5 * 0.35 * KNOT_HIGH * env;
      const jy = (Math.sin(u * 43 - t * 6.7) + Math.sin(u * 27 + t * 4.1)) * 0.5 * 0.3 * KNOT_HIGH * env;
      const bx = cx + (u - 0.5) * 2 * half;
      out.push(bx + Math.cos(a) * r * wide + jx, line.sample(bx) + Math.sin(a) * r * 0.85 + jy);
    }
    return out;
  }

  /** Where its middle is now: in his hands once he is untying it. */
  centre(line: SpringLine): [number, number] {
    const k = this.waiting ? 0 : smooth(clamp(this.untie / UNTIE, 0, 1)), x = lerp(this.x, this.hold, k);
    return [x, line.sample(x)];
  }

  /** Does a bubble of radius r centred at (bx, by) touch it? */
  touchesBubble(line: SpringLine, bx: number, by: number, r: number) {
    return Math.abs(bx - this.x) < KNOT_HALF + r && Math.abs(by - line.sample(this.x)) < KNOT_HIGH + r;
  }
}
